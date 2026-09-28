#!/usr/bin/env python3
"""Isolated Codex 0.158.0 regression probe; no paid model calls.

Asserts the observed first-request limitation, not successful full-turn enforce.
Uses a temporary CODEX_HOME, a reviewed hook hash, and a loopback fake provider.
Artifacts are retained in the printed temporary directory.
"""
import os, json, time, tempfile, subprocess, threading, http.server, socket, base64, hashlib, struct
from pathlib import Path
root = Path(tempfile.mkdtemp(prefix='jet-turn-probe-'))
home = root / 'home'
home.mkdir()
sock = str(root / 'app.sock')
captures = []

class WS:

    def __init__(self):
        self.s = socket.socket(socket.AF_UNIX)
        self.s.settimeout(15)
        self.s.connect(sock)
        self.seq = 0
        self.events = []
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(f'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        b = b''
        while b'\r\n\r\n' not in b:
            b += self.s.recv(1)
        assert b'101 Switching Protocols' in b
        assert base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).lower() in b.lower()
        self.req('initialize', {'clientInfo': {'name': 'jet-router-isolated-probe', 'version': '0.0.0'}, 'capabilities': {'experimentalApi': True}})
        self.send({'method': 'initialized'})

    def exact(self, n):
        b = b''
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c:
                raise EOFError()
            b += c
        return b

    def send(self, v, op=1):
        b = json.dumps(v).encode() if op == 1 else v
        m = os.urandom(4)
        n = len(b)
        h = bytes([128 | op, 128 | n]) if n < 126 else bytes([128 | op, 254]) + struct.pack('!H', n)
        self.s.sendall(h + m + bytes((c ^ m[i % 4] for i, c in enumerate(b))))

    def recv(self):
        while True:
            a, b = self.exact(2)
            n = b & 127
            if n == 126:
                n = struct.unpack('!H', self.exact(2))[0]
            elif n == 127:
                n = struct.unpack('!Q', self.exact(8))[0]
            assert n < 4000000
            mask = self.exact(4) if b & 128 else None
            p = self.exact(n)
            if mask:
                p = bytes((c ^ mask[i % 4] for i, c in enumerate(p)))
            if a & 15 == 9:
                self.send(p, 10)
                continue
            if a & 15 == 8:
                raise EOFError()
            assert a & 128 and a & 15 == 1, 'fragmented/non-text frame'
            return json.loads(p)

    def req(self, method, params):
        self.seq += 1
        i = self.seq
        self.send({'id': i, 'method': method, 'params': params})
        while True:
            v = self.recv()
            if v.get('id') == i:
                if 'error' in v:
                    raise RuntimeError(v['error'])
                return v['result']
            self.events.append(v)

class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, *a):
        pass

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        captures.append(data)
        item = {'id': 'msg_probe', 'type': 'message', 'role': 'assistant', 'status': 'completed', 'content': [{'type': 'output_text', 'text': 'ok', 'annotations': []}]}
        if len(captures) == 1:
            item = {'id': 'fc_probe', 'type': 'function_call', 'call_id': 'call_probe', 'name': 'jet_probe_continue', 'arguments': '{}', 'status': 'completed'}
        response = {'id': 'resp_probe', 'object': 'response', 'status': 'completed', 'output': [item], 'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
        events = [{'type': 'response.created', 'response': {**response, 'status': 'in_progress', 'output': []}}, {'type': 'response.output_item.done', 'output_index': 0, 'item': item}, {'type': 'response.completed', 'response': response}]
        body = ''.join(('event: ' + e['type'] + '\ndata: ' + json.dumps(e) + '\n\n' for e in events)).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
hook = root / 'hook.py'
hook.write_text('import json,sys,time\nfrom pathlib import Path\np=Path(' + repr(str(root)) + ")\nd=json.load(sys.stdin)\nif 'PROBE_LOW' in d['prompt']:\n (p/'hook-input.json').write_text(json.dumps(d))\n for _ in range(200):\n  if (p/'release').exists():break\n  time.sleep(.05)\nprint(json.dumps({'continue':True}))\n")
config = f'model = "gpt-6-astra"\nmodel_provider = "probe"\nmodel_reasoning_effort = "medium"\n[model_providers.probe]\nname = "Local test fixture"\nbase_url = "http://127.0.0.1:{server.server_port}/v1"\nwire_api = "responses"\n[features]\nshell_tool = false\nstep_model_switching = true\n[[hooks.UserPromptSubmit]]\n[[hooks.UserPromptSubmit.hooks]]\ntype = "command"\ncommand = "python3 {hook}"\ntimeout = 15\n'
(home / 'config.toml').write_text(config)
log = open(root / 'server.log', 'w')
child = None
ws = None

def launch():
    p = subprocess.Popen(['codex', 'app-server', '--listen', 'unix://' + sock], env={**os.environ, 'CODEX_HOME': str(home)}, cwd=root, stdout=log, stderr=log)
    for _ in range(100):
        if Path(sock).exists():
            return (p, WS())
        if p.poll() is not None:
            raise RuntimeError('server exited')
        time.sleep(0.05)
    raise TimeoutError('socket')
try:
    child, ws = launch()
    listed = ws.req('hooks/list', {'cwds': [str(root)]})
    entries = listed.get('data', listed.get('entries', []))
    hooks = [h for e in entries for h in e.get('hooks', [])]
    assert len(hooks) == 1, listed
    h = hooks[0]
    print('hook discovered', h['trustStatus'], flush=True)
    ws.s.close()
    child.terminate()
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
    Path(sock).unlink(missing_ok=True)
    with (home / 'config.toml').open('a') as f:
        f.write('\n[hooks.state.' + json.dumps(h['key']) + ']\nenabled = true\ntrusted_hash = ' + json.dumps(h['currentHash']) + '\n')
    child, ws = launch()
    t = ws.req('thread/start', {'cwd': str(root), 'approvalPolicy': 'never', 'sandbox': 'read-only', 'ephemeral': True, 'baseInstructions': 'Use only the provided test tool if requested.', 'dynamicTools': [{'type': 'function', 'name': 'jet_probe_continue', 'description': 'Local test continuation, no side effects', 'inputSchema': {'type': 'object', 'properties': {}}}]})
    tid = t['thread']['id']
    print('thread baseline', t.get('reasoningEffort'), flush=True)
    result = ws.req('turn/start', {'threadId': tid, 'input': [{'type': 'text', 'text': 'PROBE_LOW reply ok'}]})
    turn = result['turn']['id']
    print('turn started', flush=True)
    for _ in range(100):
        if (root / 'hook-input.json').exists():
            break
        time.sleep(0.05)
    assert (root / 'hook-input.json').exists(), 'hook did not run'
    hi = json.loads((root / 'hook-input.json').read_text())
    assert hi['session_id'] == tid and hi['turn_id'] == turn
    assert not captures, 'provider request arrived before the hook was released'
    update = ws.req('turn/settings/update', {'threadId': tid, 'turnId': turn, 'effort': 'low'})
    print('update', update, flush=True)
    (root / 'release').touch()

    def completed(turn):
        while True:
            for i, v in enumerate(ws.events):
                if v.get('method') == 'item/tool/call':
                    ws.send({'id': v['id'], 'result': {'success': True, 'contentItems': [{'type': 'inputText', 'text': 'ok'}]}})
                    ws.events.pop(i)
                    break
                if v.get('method') == 'turn/completed' and v['params']['turn']['id'] == turn:
                    ws.events.pop(i)
                    return v['params']['turn']['status']
            ws.events.append(ws.recv())
    status1 = completed(turn)
    assert status1 == 'completed', status1
    print('turn1', status1, flush=True)
    before = ws.req('thread/read', {'threadId': tid, 'includeTurns': False})
    print('baseline after', before['thread']['reasoningEffort'], flush=True)
    r = ws.req('turn/start', {'threadId': tid, 'input': [{'type': 'text', 'text': 'Reply ok again'}]})
    status2 = completed(r['turn']['id'])
    assert status2 == 'completed', status2
    print('turn2', status2, flush=True)
    efforts = [c.get('reasoning', {}).get('effort') for c in captures]
    print('wire efforts', efforts, flush=True)
    assert update == {'status': 'applied'}, update
    assert efforts == ['medium', 'low', 'medium'], efforts
    assert before['thread']['reasoningEffort'] == 'medium'
    evidence = {'codexVersion': subprocess.check_output(['codex', '--version'], text=True).strip(), 'source': 'isolated local mock Responses HTTP capture', 'firstRequestNotYetSentAtUpdate': True, 'turnStatuses': [status1, status2], 'update': update, 'efforts': efforts, 'baselineAfter': before['thread']['reasoningEffort'], 'hookIdsMatch': True}
    (root / 'evidence.json').write_text(json.dumps(evidence, indent=2))
finally:
    if ws:
        ws.s.close()
    if child:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
    server.shutdown()
    log.close()
    print('artifacts', root, flush=True)
