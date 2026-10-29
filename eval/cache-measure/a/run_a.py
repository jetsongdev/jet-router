#!/usr/bin/env python3
"""Prepare or run experiment A. Live use requires a separate execution go-ahead."""
import argparse
import copy
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parent
DIAG = 'cache-diagnosis-2026-04-07'
MID = 'mid-conversation-output-config-2026-07-01'
PER = 'per-turn-control-2026-07-01'
EFFORT = 'effort-2025-11-24'
MODEL = 'claude-opus-5-5'
CACHE = {'type': 'ephemeral'}
KEY_FILE = Path.home() / '.config' / 'effort-router' / 'keys.env'


def read_key():
    # The key file is user-written outside the repository; the value is never printed or logged.
    try:
        for line in KEY_FILE.read_text(encoding='utf-8').splitlines():
            name, sep, value = line.strip().removeprefix('export ').partition('=')
            if sep and name.strip() == 'ANTHROPIC_API_KEY':
                value = value.strip().strip('"').strip("'")
                if value:
                    return value
    except OSError:
        pass
    return os.environ.get('ANTHROPIC_API_KEY')
TASK = 'Sort these numbers and answer on one line: 9, 2, 5, 1.'

def text_block(label, n):
    return ' '.join(f'{label} record {i:04d}: alpha beta gamma delta epsilon zeta eta theta.' for i in range(n))

TOOLS = [{'name': f'dummy_{x}', 'description': text_block('Tool reference', 25),
          'input_schema': {'type': 'object', 'properties': {}, 'additionalProperties': False}}
         for x in ('alpha', 'beta', 'gamma')]
HISTORY = [{'role': role, 'content': text_block(f'History {i} {role}', 30)}
           for i in range(10) for role in ('user', 'assistant')]

def base(nonce):
    return {'model': MODEL, 'max_tokens': 2048, 'stream': False,
            'output_config': {'effort': 'medium'}, 'tools': copy.deepcopy(TOOLS),
            'system': [{'type': 'text', 'text': 'Trial nonce: ' + nonce},
                       {'type': 'text', 'text': text_block('System reference', 300), 'cache_control': CACHE}],
            'messages': copy.deepcopy(HISTORY), 'cache_control': CACHE,
            'diagnostics': {'previous_message_id': None}}

def schedule(a5):
    for arm, trials in [('A0', 5), ('A6a', 5), ('A6b', 2), ('A1', 5), ('A2', 5), ('A3', 2), ('A4', 3), ('A5', int(a5 is not None))]:
        for trial in range(1, trials + 1):
            yield arm, trial

def usage_cost(u):
    c = u.get('cache_creation') or {}
    one = c.get('ephemeral_1h_input_tokens', 0) or 0
    five = c.get('ephemeral_5m_input_tokens', 0) or 0
    total = u.get('cache_creation_input_tokens', 0) or 0
    # Unspecified creation TTL is conservatively billed at the 1-hour rate.
    return ((u.get('input_tokens', 0) or 0)*4 + (u.get('output_tokens', 0) or 0)*20 +
            (u.get('cache_read_input_tokens', 0) or 0)*.2 + five*5 + (one + max(0, total-five-one))*8)/1e6

def max_cost(body):
    # UTF-8 byte count is a conservative upper bound for input token count;
    # price all input as 1-hour writes and output at the max_tokens limit.
    return (len(json.dumps(body, ensure_ascii=False).encode())*8 + body['max_tokens']*20)/1e6

def call(endpoint, body, betas, key):
    import tempfile
    config = 'header = "x-api-key: ' + key.replace('\\', '\\\\').replace('"', '\\"') + '"\n'
    with tempfile.TemporaryDirectory() as tmp:
        payload = Path(tmp) / 'body.json'
        headers = Path(tmp) / 'headers'
        payload.write_text(json.dumps(body), encoding='utf-8')
        p = subprocess.run(['curl', '--silent', '--show-error', '--config', '-',
                            '--dump-header', str(headers), '--request', 'POST',
                            '--header', 'content-type: application/json',
                            '--header', 'anthropic-version: 2026-10-21',
                            '--header', 'anthropic-beta: ' + ','.join(betas),
                            '--data-binary', '@' + str(payload), '--write-out', '\n%{http_code}',
                            'https://api.anthropic.com' + endpoint],
                           input=config, text=True, capture_output=True)
        if p.returncode:
            raise RuntimeError(f'curl failed (exit {p.returncode}); response omitted')
        raw, code = p.stdout.rsplit('\n', 1)
        try:
            data = json.loads(raw)
        except ValueError:
            data = {'raw': raw}
        header_lines = headers.read_text(encoding='utf-8', errors='replace').splitlines()
        request_id = next((line.split(':', 1)[1].strip() for line in reversed(header_lines)
                           if line.lower().startswith('request-id:')), None)
        return int(code), data, request_id

def count(body, betas, key):
    allowed = ('model', 'tools', 'system', 'messages', 'output_config')
    payload = {k: copy.deepcopy(body[k]) for k in allowed if k in body}
    status, data, _ = call('/v1/messages/count_tokens', payload, betas, key)
    if status != 200 or not isinstance(data.get('input_tokens'), int):
        raise RuntimeError(f'count_tokens failed: HTTP {status}')
    return data['input_tokens']

def count_s(body, betas, key):
    sample = copy.deepcopy(body)
    sample['messages'] = [{'role': 'user', 'content': 'Count.'}]
    total = count(sample, betas, key)
    sample.pop('system'); sample.pop('tools')
    return total - count(sample, betas, key)

def main():
    p = argparse.ArgumentParser()
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--live', action='store_true')
    p.add_argument('--count', action='store_true')
    p.add_argument('--a5-value', type=float)
    p.add_argument('--cap-usd', type=float, default=8.0)
    args = p.parse_args()
    if args.count and not args.live:
        p.error('--count requires --live')
    if not 0 < args.cap_usd <= 8:
        p.error('--cap-usd must be greater than 0 and at most 8')
    if args.a5_value is not None and not __import__('math').isfinite(args.a5_value):
        p.error('--a5-value must be finite')
    key = read_key() if args.live else None
    if args.live and (not key or '\n' in key or '\r' in key):
        sys.exit(f'Live execution requires ANTHROPIC_API_KEY in {KEY_FILE} or the environment.')
    out = ROOT / 'out'
    out.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    log = (out / f'a-{stamp}.jsonl').open('x', encoding='utf-8') if args.live else None
    dry = out / 'dry'
    if not args.live:
        dry.mkdir(exist_ok=True)
    cost = 0.0
    requests = 0
    # Planning estimate matches the preregistered 18K prefix and 300 output tokens.
    estimate = 0.0
    try:
        stopped_arms = set()
        thinking_omitted_arms = set()
        for arm, trial in schedule(args.a5_value):
            if arm in stopped_arms:
                continue
            body = base(f'{stamp}-{arm}-{trial}')
            if arm in ('A6a', 'A6b'):
                body['messages'].insert(1, {'role': 'system', 'content': [{'type': 'text', 'text': 'Use the configured effort level.'}],
                                            'output_config': {'effort': 'medium'}})
                if arm not in thinking_omitted_arms:
                    body['thinking'] = {'type': 'adaptive', 'display': 'updates'}
            previous_body = None
            s_tokens = None
            betas = [DIAG] + ([MID] if arm in ('A2', 'A4', 'A6a') else [PER, EFFORT] if arm == 'A6b' else [PER] if arm == 'A3' else [])
            steps = [(1, 1), (2, 1), (2, 2), (2, 3), (3, 1)] if arm == 'A4' else [(i, 1) for i in range(1, 4 if arm == 'A5' else 5)]
            for turn, step in steps:
                if step == 1:
                    body['messages'].append({'role': 'user', 'content': ('Call dummy_alpha twice sequentially, then sort 9, 2, 5, 1 and answer on one line.' if arm == 'A4' and turn == 2 else TASK)})
                location, value = 'top', 'medium'
                body['output_config']['effort'] = 'medium'
                if arm == 'A1' and turn == 3:
                    body['output_config']['effort'] = value = 'high'
                if arm == 'A5' and turn == 3:
                    body['output_config']['effort'] = value = args.a5_value
                if arm in ('A2', 'A3') and turn in (3, 4):
                    value = 'high' if turn == 3 else 'medium'
                    location = 'message'
                    body['messages'].append({'role': 'system', 'content': [], 'output_config': {'effort': value}})
                if arm in ('A6a', 'A6b') and turn in (3, 4):
                    value = 'high' if turn == 3 else 'medium'
                    location = 'top+message'
                    body['output_config']['effort'] = value
                    body['messages'].append({'role': 'system', 'content': [], 'output_config': {'effort': value}})
                if arm == 'A4' and turn == 2 and step == 2:
                    location, value = 'message', 'high'
                    body['messages'].append({'role': 'system', 'content': [], 'output_config': {'effort': value}})
                requests += 1
                # Expected costs, not a safety bound: 18K writes on first request and A1 turn 3.
                estimate += .006 + (.09 if step == 1 and (turn == 1 or arm == 'A1' and turn == 3 or arm in ('A6a', 'A6b') and turn in (3, 4)) else .004)
                if not args.live:
                    (dry / f'{arm}-{trial:02d}-{turn}-{step}.json').write_text(json.dumps(body, indent=2), encoding='utf-8')
                    response = {'id': f'dry-{arm}-{trial}-{turn}-{step}', 'content': [{'type': 'tool_use', 'id': f'tool-{step}', 'name': 'dummy_alpha', 'input': {}}] if arm == 'A4' and turn == 2 and step < 3 else [{'type': 'text', 'text': '1, 2, 5, 9'}]}
                    status, request_id, prev_tokens = 200, None, None
                else:
                    prev_tokens = None
                    if args.count:
                        if s_tokens is None:
                            s_tokens = count_s(body, betas, key)
                        if previous_body is not None:
                            prev_tokens = count(previous_body, betas, key)
                    attempt = 0
                    fallback = False
                    while True:
                        attempt += 1
                        if cost + max_cost(body) > args.cap_usd:
                            raise RuntimeError(f'cost cap: ${cost:.4f} + next maximum ${max_cost(body):.4f} > ${args.cap_usd:.2f}')
                        status, response, request_id = call('/v1/messages', body, betas, key)
                        usage = response.get('usage') or {}
                        cost += usage_cost(usage)
                        record = {'arm': arm, 'trial': trial, 'turn': turn, 'step': step, 'attempt': attempt, 'thinking_omitted_retry': fallback,
                                  'effort_location': location, 'effort_value': value, 'betas': betas,
                                  'http_status': status, 'usage': usage, 'diagnostics': response.get('diagnostics'),
                                  'request_id': request_id, 'response_time': dt.datetime.now(dt.timezone.utc).isoformat(),
                                  'error_body': response if status != 200 else None, 'stop_reason': response.get('stop_reason'),
                                  's_tokens': s_tokens, 'previous_prefix_tokens': prev_tokens, 'cumulative_usd': cost}
                        log.write(json.dumps(record, ensure_ascii=False).replace(key, '[REDACTED]') + '\n'); log.flush()
                        if status == 400 and arm in ('A6a', 'A6b') and 'thinking' in body:
                            body.pop('thinking')
                            thinking_omitted_arms.add(arm)
                            fallback = True
                            attempt = 0
                            continue
                        if status != 429 and status < 500 or attempt == 2:
                            break
                        time.sleep(2 ** (attempt - 1))
                    if status != 200:
                        if status == 400 and (arm in ('A3', 'A5') or arm == 'A6b' and turn == 1):
                            break
                        raise RuntimeError(f'{arm} trial {trial} turn {turn}: HTTP {status}')
                previous_body = copy.deepcopy(body)
                body['diagnostics']['previous_message_id'] = response.get('id')
                content = response.get('content') or []
                body['messages'].append({'role': 'assistant', 'content': content})
                if arm == 'A4' and turn == 2 and step < 3:
                    calls = [x for x in content if x.get('type') == 'tool_use']
                    if not calls:
                        raise RuntimeError('A4 expected tool_use; cannot continue trial')
                    body['messages'].append({'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': x['id'], 'content': 'OK'} for x in calls]})
            else:
                continue
            if status == 400 and (arm in ('A3', 'A5') or arm == 'A6b' and turn == 1):
                # Stop the entire arm, not just the current trial.
                # Mark subsequent trials for skipping below.
                stopped_arms.add(arm)
    finally:
        if log:
            log.close()
    print(f'requests={requests} estimated_usd={estimate:.3f}' + (f' actual_usd={cost:.4f}' if args.live else ''))

if __name__ == '__main__':
    try:
        main()
    except RuntimeError as exc:
        sys.exit(str(exc))
