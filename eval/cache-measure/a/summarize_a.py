#!/usr/bin/env python3
"""Summarize A JSONL; missing counts or incomplete trials stay indeterminate."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path


def classify(row):
    s, prefix = row.get('s_tokens'), row.get('previous_prefix_tokens')
    u = row.get('usage') or {}
    if row.get('http_status') != 200 or s is None or prefix is None or s <= 0 or prefix < s:
        return '판정 불가'
    read = u.get('cache_read_input_tokens')
    creation = u.get('cache_creation_input_tokens')
    if read is None or creation is None:
        return '판정 불가'
    m = prefix - s
    if read >= .95 * prefix:
        return '유지'
    if .9 * s <= read < .5 * prefix and creation >= .8 * m:
        return 'messages만 깨짐'
    if read < .1 * s:
        return '전체 깨짐'
    return '부분'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('jsonl', type=Path)
    args = p.parse_args()
    rows = [json.loads(line) for line in args.jsonl.read_text(encoding='utf-8').splitlines() if line.strip()]
    groups = defaultdict(dict)
    for row in rows:
        groups[(row['arm'], row['turn'], row.get('step', 1))][row['trial']] = row
    print('| arm | turn | step | 시행별 상태 | 4/5 판정 |')
    print('|---|---:|---:|---|---|')
    for (arm, turn, step), trials in sorted(groups.items()):
        states = {t: classify(r) for t, r in sorted(trials.items())}
        counts = Counter(states.values())
        winner = next((k for k, n in counts.items() if n >= 4 and k != '판정 불가'), '판정 불가') if arm in ('A0', 'A1', 'A2', 'A6a') else '기술 관찰 (반복 5회 미만)'
        print(f'| {arm} | {turn} | {step} | ' + ', '.join(f'{t}:{v}' for t, v in states.items()) + f' | {winner} |')
    valid = [sum(classify(groups.get(('A0', turn, 1), {}).get(trial, {})) == '유지' for trial in range(1, 6)) for turn in (2, 3, 4)]
    print(f"\nA0 유효성: 턴2~4 유지 {valid}/5 — " + ('유효' if all(n >= 4 for n in valid) else '유효성 미확인/무효'))
    print('A4 적용 시점은 output_tokens만으로 확정할 수 없습니다. A5 400은 오류 본문을 확인하세요.')

if __name__ == '__main__':
    main()
