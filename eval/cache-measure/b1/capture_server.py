#!/usr/bin/env python3
"""Local fake Messages API; capture sensitive headers only after redaction."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--port-file', required=True)
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)

class Handler(BaseHTTPRequestHandler):
    count = 0
    messages = 0
    def log_message(self, *args):
        pass
    def do_GET(self):
        self.capture()
    def do_POST(self):
        self.capture()
    def do_PUT(self):
        self.capture()
    def do_PATCH(self):
        self.capture()
    def do_DELETE(self):
        self.capture()
    def capture(self):
        raw = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            body = raw.decode('utf-8', errors='replace')
        headers = {k: '<redacted>' if any(x in k.lower() for x in ('token', 'key', 'auth', 'cookie')) else v for k, v in self.headers.items()}
        Handler.count += 1
        (out / f'{Handler.count:03}.json').write_text(json.dumps({'method': self.command, 'path': self.path, 'headers': headers, 'body': body}, ensure_ascii=False, indent=2))
        if self.command != 'POST' or self.path.split('?')[0] != '/v1/messages':
            data = json.dumps({'input_tokens': 1}).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
            return
        Handler.messages += 1
        n = Handler.messages
        tool = {1: 'a.txt', 2: 'b.txt', 3: 'c.txt', 5: 'a.txt'}.get(n)
        usage = {'input_tokens': 10, 'output_tokens': 5, 'cache_creation_input_tokens': 0, 'cache_read_input_tokens': 0}
        events = [('message_start', {'type':'message_start','message':{'id':f'msg_local_{n}','type':'message','role':'assistant','model':'claude-opus-5-5','content':[],'stop_reason':None,'stop_sequence':None,'usage':usage}})]
        if tool:
            events += [('content_block_start', {'type':'content_block_start','index':0,'content_block':{'type':'tool_use','id':f'toolu_local_{n}','name':'Read','input':{}}}), ('content_block_delta', {'type':'content_block_delta','index':0,'delta':{'type':'input_json_delta','partial_json':json.dumps({'file_path':str(Path.cwd() / tool)})}})]
        else:
            events += [('content_block_start', {'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}}), ('content_block_delta', {'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'Done.'}})]
        events += [('content_block_stop', {'type':'content_block_stop','index':0}), ('message_delta', {'type':'message_delta','delta':{'stop_reason':'tool_use' if tool else 'end_turn','stop_sequence':None},'usage':{'output_tokens':5}}), ('message_stop', {'type':'message_stop'})]
        data = ''.join(f'event: {name}\ndata: {json.dumps(value)}\n\n' for name,value in events).encode()
        self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Path(args.port_file).write_text(str(server.server_port))
server.serve_forever()
