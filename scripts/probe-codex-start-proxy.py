#!/usr/bin/env python3
"""Experimental local-fixture probe, NOT an installable or general-purpose proxy.

Routes only PROBE_LOW markers to a fixed low effort. No Jev or paid model calls.
Requires installed Codex 0.158.0, Python 3 and macOS/Linux PTY/Unix sockets.
"""
import os, json, time, tempfile, subprocess, threading, http.server, socket, base64, hashlib, struct
import select, pty, fcntl, termios, sys
from pathlib import Path

class WS:

    def __init__(self, path, initialize=True):
        self.s = socket.socket(socket.AF_UNIX)
        self.s.settimeout(15)
        self.s.connect(path)
        self.masked = True
        self.seq = 0
        self.events = []
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(f'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        b = b''
        while b'\r\n\r\n' not in b:
            b += self.s.recv(1)
        assert b'101 Switching Protocols' in b
        assert base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).lower() in b.lower()
        if initialize:
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
        m = os.urandom(4) if self.masked else b''
        n = len(b)
        flag = 128 if self.masked else 0
        h = bytes([128 | op, flag | n]) if n < 126 else bytes([128 | op, flag | 126]) + struct.pack('!H', n) if n < 65536 else bytes([128 | op, flag | 127]) + struct.pack('!Q', n)
        self.s.sendall(h + m + (bytes((c ^ m[i % 4] for i, c in enumerate(b))) if self.masked else b))

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


def accept_ws(conn):
    conn.settimeout(15)
    header = b''
    while b'\r\n\r\n' not in header:
        chunk = conn.recv(1)
        if not chunk:
            raise EOFError()
        header += chunk
        assert len(header) < 16384
    fields = dict(line.split(':', 1) for line in header.decode().split('\r\n')[1:] if ':' in line)
    key = next(v.strip() for k, v in fields.items() if k.lower() == 'sec-websocket-key')
    digest = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
    conn.sendall(f'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {digest}\r\n\r\n'.encode())
    ws = WS.__new__(WS)
    ws.s, ws.masked = conn, False
    return ws


adapter = '--adapter' in sys.argv
root = Path(tempfile.mkdtemp(prefix='jet-start-proxy-'))
home = root / 'home'
home.mkdir()
backend_path, proxy_path = str(root / 'backend.sock'), str(root / 'proxy.sock')
captures, routes, errors, completions = [], [], [], []
stop = threading.Event()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        captures.append({'model': data.get('model'), 'effort': data.get('reasoning', {}).get('effort')})
        suffix = str(len(captures))
        item = {'id': 'msg_' + suffix, 'type': 'message', 'role': 'assistant', 'status': 'completed',
                'content': [{'type': 'output_text', 'text': 'ok', 'annotations': []}]}
        response = {'id': 'resp_' + suffix, 'object': 'response', 'status': 'completed', 'output': [item],
                    'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
        events = [{'type': 'response.created', 'response': {**response, 'status': 'in_progress', 'output': []}},
                  {'type': 'response.output_item.done', 'output_index': 0, 'item': item},
                  {'type': 'response.completed', 'response': response}]
        body = ''.join('event: ' + e['type'] + '\ndata: ' + json.dumps(e) + '\n\n' for e in events).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


provider = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=provider.serve_forever, daemon=True).start()
(home / 'config.toml').write_text(f'''model = "gpt-6-astra"
model_provider = "probe"
model_reasoning_effort = "medium"
[model_providers.probe]
name = "Local mock provider"
base_url = "http://127.0.0.1:{provider.server_port}/v1"
wire_api = "responses"
[features]
shell_tool = false
[projects.{json.dumps(str(root))}]
trust_level = "trusted"
''')


def relay(conn):
    front = back = None
    baseline, requests, restores = {}, {}, {}
    counter = 0
    try:
        front, back = accept_ws(conn), WS(backend_path, initialize=False)
        while not stop.is_set():
            ready, _, _ = select.select([front.s, back.s], [], [], .2)
            if front.s in ready:
                msg = front.recv()
                method, params = msg.get('method'), msg.get('params', {})
                if method == 'initialize':
                    params.setdefault('capabilities', {})['experimentalApi'] = True
                if method in ('thread/start', 'thread/resume'):
                    requests[msg['id']] = ('baseline', None)
                if method == 'thread/settings/update' and params.get('effort'):
                    # Record only when the server acknowledges the user change.
                    requests[msg['id']] = ('manual', (params['threadId'], params['effort']))
                if method == 'turn/start':
                    tid = params['threadId']
                    mode = params.get('collaborationMode')
                    settings = mode.get('settings', {}) if isinstance(mode, dict) else {}
                    original = settings.get('reasoning_effort') or params.get('effort') or baseline.get(tid)
                    assert original, 'unknown user baseline: probe refuses to route'
                    baseline[tid] = original
                    prompt = '\n'.join(i.get('text', '') for i in params.get('input', []) if i.get('type') == 'text')
                    chosen = 'low' if 'PROBE_LOW' in prompt else original
                    params['effort'] = chosen
                    if settings:
                        settings['reasoning_effort'] = chosen
                    routes.append({'baseline': original, 'chosen': chosen, 'collaborationMode': bool(settings), 'prompt': prompt})
                    requests[msg['id']] = ('turn', (tid, original))
                back.send(msg)
            if back.s in ready:
                msg = back.recv()
                if msg.get('method') == 'turn/completed':
                    completions.append(msg['params']['turn']['status'])
                key = msg.get('id')
                if key in restores:
                    restores.pop(key)
                    assert 'error' not in msg, msg
                    continue
                pending = requests.pop(key, None)
                if pending and 'error' not in msg:
                    kind, value = pending
                    if kind == 'baseline':
                        result = msg['result']
                        baseline[result['thread']['id']] = result.get('reasoningEffort')
                    elif kind == 'manual':
                        baseline[value[0]] = value[1]
                    elif kind == 'turn':
                        counter += 1
                        internal_id = f'jet-probe-restore-{counter}'
                        restores[internal_id] = True
                        front.send(msg)
                        back.send({'id': internal_id, 'method': 'thread/settings/update',
                                   'params': {'threadId': value[0], 'effort': value[1]}})
                        continue
                front.send(msg)
    except (EOFError, ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:
        errors.append(repr(exc))
    finally:
        for ws in (front, back):
            if ws:
                ws.s.close()


listener = socket.socket(socket.AF_UNIX)
listener.bind(proxy_path)
os.chmod(proxy_path, 0o600)
listener.listen()
listener.settimeout(.2)


def serve():
    while not stop.is_set():
        try:
            conn, _ = listener.accept()
        except socket.timeout:
            continue
        threading.Thread(target=relay, args=(conn,), daemon=True).start()


def complete(client, turn_id):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        for idx, event in enumerate(client.events):
            if event.get('method') == 'turn/completed' and event['params']['turn']['id'] == turn_id:
                client.events.pop(idx)
                assert event['params']['turn']['status'] == 'completed', event
                return
        client.events.append(client.recv())
    raise TimeoutError('turn completion')


def terminate(child):
    if child and child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()


log = open(root / 'backend.log', 'w')
child = cli = client = None
master = None
try:
    env = {**os.environ, 'CODEX_HOME': str(home), 'TERM': 'xterm-256color'}
    command = ['node', str(Path(__file__).resolve().parents[1] / 'codex/tests/proxy-fixture.mjs'), str(root)] if adapter else ['codex', 'app-server', '--listen', 'unix://' + backend_path]
    child = subprocess.Popen(command, cwd=root, env=env, stdout=log, stderr=log)
    for _ in range(100):
        if adapter and (root / 'adapter-socket.txt').exists():
            proxy_path = (root / 'adapter-socket.txt').read_text()
            break
        if not adapter and Path(backend_path).exists():
            break
        assert child.poll() is None, 'backend exited'
        time.sleep(.05)
    if not adapter:
        threading.Thread(target=serve, daemon=True).start()
    client = WS(proxy_path)
    started = client.req('thread/start', {'cwd': str(root), 'ephemeral': True, 'sandbox': 'read-only',
                                        'approvalPolicy': 'never', 'baseInstructions': 'Reply ok; no tools.'})
    tid = started['thread']['id']
    states = []
    for prompt, effort in [('PROBE_LOW first', None), ('keep baseline', None),
                           ('PROBE_LOW manual high', 'high'), ('keep manual high', None)]:
        if effort:
            client.req('thread/settings/update', {'threadId': tid, 'effort': effort})
        turn = client.req('turn/start', {'threadId': tid, 'input': [{'type': 'text', 'text': prompt}]})
        complete(client, turn['turn']['id'])
        states.append(client.req('thread/read', {'threadId': tid, 'includeTurns': False})['thread']['reasoningEffort'])
    assert [c['effort'] for c in captures] == ['low', 'medium', 'low', 'high'], captures
    assert states == ['medium', 'medium', 'high', 'high'], states
    print('protocol: first requests low/medium/low/high; baseline medium/medium/high/high', flush=True)
    client.s.close()
    client = None
    if adapter:
        for _ in range(100):
            if (root / 'adapter-backend-exited').exists():
                break
            time.sleep(.05)
        assert (root / 'adapter-backend-exited').exists(), 'backend cleanup incomplete'

    # Exercise the real TUI, not a replacement input UI. CPR replies support terminal startup.
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
    cli = subprocess.Popen(['codex', '--remote', 'unix://' + proxy_path, '--no-alt-screen',
                            '-C', str(root), '-s', 'read-only', '-a', 'never', 'PROBE_LOW reply ok'],
                           env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    terminal = bytearray()
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline and len(completions) < 5:
        if adapter and (root / 'adapter-events.json').exists():
            completions[:] = json.loads((root / 'adapter-events.json').read_text())
        ready, _, _ = select.select([master], [], [], .2)
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            terminal.extend(chunk)
            if b'\x1b[6n' in chunk:
                os.write(master, b'\x1b[1;1R')
        if cli.poll() is not None:
            break
    (root / 'cli-terminal.txt').write_bytes(terminal)
    terminate(cli)
    time.sleep(.2)
    assert len(captures) == 5 and captures[-1]['effort'] == 'low', captures
    assert len(completions) == 5 and all(s == 'completed' for s in completions), completions
    assert not errors, errors
    evidence = {'codexVersion': subprocess.check_output(['codex', '--version'], text=True).strip(),
                'provider': 'local fake Responses server', 'wire': captures, 'baselineAfter': states,
                'routes': routes, 'completed': completions, 'realCliRemote': True, 'adapter': adapter, 'errors': errors}
    (root / 'evidence.json').write_text(json.dumps(evidence, indent=2))
    print('real CLI --remote: first request low; completed', flush=True)
finally:
    terminate(cli)
    if master is not None:
        os.close(master)
    if client:
        client.s.close()
    stop.set()
    terminate(child)
    provider.shutdown()
    listener.close()
    log.close()
    print('artifacts', root, flush=True)
