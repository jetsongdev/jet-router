#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")" && pwd)
ARM=${1:?arm required}
AUTH=${2:-V1}
case "$ARM" in B1-0|B1-L0|B1-L|B1-N|B1-N0) ;; *) exit 2 ;; esac
case "$AUTH" in V1|V2) ;; *) exit 2 ;; esac
OUT="$ROOT/raw/$AUTH/$ARM"
if [ -e "$OUT" ]; then echo "Output already exists: $OUT" >&2; exit 2; fi
mkdir -p "$OUT"
cd "$ROOT/fixture"
python3 "$ROOT/capture_server.py" --out "$OUT" --port-file "$OUT/port" >"$OUT/server.log" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true; wait "$SERVER" 2>/dev/null || true' EXIT
for i in {1..100}; do [ -s "$OUT/port" ] && break; sleep 0.05; done
[ -s "$OUT/port" ] || { echo 'Server did not start' >&2; exit 1; }
export EFFORT_PROBE_ARM="$ARM" EFFORT_PROBE_LOG="$OUT/hook.jsonl" ANTHROPIC_BASE_URL="http://127.0.0.1:$(cat "$OUT/port")"
if [ "$AUTH" = V1 ]; then export ANTHROPIC_API_KEY=dummy-not-a-real-key; else unset ANTHROPIC_API_KEY; fi
python3 - "$ROOT" "$OUT" <<'PY'
import json, os, selectors, subprocess, sys, time
root, out = sys.argv[1:]
cmd = ['claude','-p','--input-format','stream-json','--output-format','stream-json','--verbose','--model','claude-opus-5-5','--effort','medium','--no-session-persistence','--settings','{"enabledPlugins":{"jet-router@jet-router":false}}','--plugin-dir',root+'/effort-probe','--tools','Read','--allowedTools','Read','--strict-mcp-config','--debug-file',out+'/debug.log']
p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=open(out+'/stderr.log','wb'), bufsize=0)
sel = selectors.DefaultSelector(); sel.register(p.stdout, selectors.EVENT_READ)
def send(s):
    p.stdin.write((json.dumps({'type':'user','message':{'role':'user','content':s}})+'\n').encode()); p.stdin.flush()
send('Read the fixture files in order.')
deadline = time.monotonic()+120
buf = b''; turns = 0
with open(out+'/stdout.jsonl','wb') as log:
    while time.monotonic() < deadline:
        if not sel.select(timeout=min(1,max(0,deadline-time.monotonic()))):
            if p.poll() is not None: break
            continue
        chunk = os.read(p.stdout.fileno(), 65536)
        if not chunk: break
        log.write(chunk); log.flush(); buf += chunk
        while b'\n' in buf:
            line, buf = buf.split(b'\n',1)
            try: msg=json.loads(line)
            except ValueError: continue
            if msg.get('type') == 'result':
                turns += 1
                if turns == 1: send('Read the next fixture file.')
                elif turns == 2: p.stdin.close()
    if p.poll() is None:
        try: p.wait(timeout=max(0.01,deadline-time.monotonic()))
        except subprocess.TimeoutExpired: p.kill(); p.wait(); timed_out=True
        else: timed_out=False
    else: timed_out=False
open(out+'/run.json','w').write(json.dumps({'exit_code':p.returncode,'results':turns,'timed_out':timed_out},indent=2))
print('exit_code=%s results=%s timed_out=%s' % (p.returncode,turns,timed_out))
PY
python3 "$ROOT/summarize.py" "$OUT"
