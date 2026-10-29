#!/usr/bin/env python3
"""Print field-only request summaries; never print request text or secrets."""
import json
import sys
from pathlib import Path

def strip_cache(value):
    if isinstance(value, dict): return {k: strip_cache(v) for k,v in value.items() if k != 'cache_control'}
    if isinstance(value, list): return [strip_cache(v) for v in value]
    return value

def serialized(value):
    return json.dumps(strip_cache(value), ensure_ascii=False, separators=(',', ':'), sort_keys=True)

previous = None
print('file | beta | top effort | message effort (index, prior role/content type) | prefix chars')
for path in sorted(Path(sys.argv[1]).glob('[0-9][0-9][0-9].json')):
    req = json.loads(path.read_text())
    if req['path'].split('?')[0] != '/v1/messages': continue
    body = req['body']; messages = body.get('messages', [])
    current = serialized(messages)
    common = None if previous is None else next((i for i,(a,b) in enumerate(zip(previous,current)) if a != b), min(len(previous),len(current)))
    previous = current
    hits = []
    for i,msg in enumerate(messages):
        if 'output_config' in msg:
            prior = messages[i-1] if i else {}
            content = prior.get('content', [])
            types = [x.get('type') for x in content if isinstance(x,dict)] if isinstance(content,list) else ['text']
            hits.append([i,msg['output_config'],prior.get('role'),types])
    headers = {k.lower():v for k,v in req['headers'].items()}
    print(f"{path.name} | {headers.get('anthropic-beta', '-')} | {body.get('output_config',{}).get('effort','-')} | {json.dumps(hits)} | {common}")
