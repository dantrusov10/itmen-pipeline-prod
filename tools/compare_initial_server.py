#!/usr/bin/env python3
import json, re, urllib.request, ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT/"js"/"gas-config.js").read_text(encoding='utf-8')).group(1)

state = json.loads(urllib.request.urlopen(url+'?action=get', timeout=120).read())['state']
server = {d['id']: d for d in state['deals']}

# parse initial-data.js
text = (ROOT/'js'/'initial-data.js').read_text(encoding='utf-8')
m = re.search(r'window\.ITMEN_INITIAL\s*=\s*(\{.*\})\s*;', text, re.S)
init = json.loads(m.group(1)) if m else None
if not init:
    # try export format
    m2 = re.search(r'=\s*(\{[\s\S]*\})\s*;', text)
    init = json.loads(m2.group(1))
init_map = {d['id']: d for d in init.get('deals', [])}

owners = ['Аркадий Мерлейн', 'Александр Сироткин', 'Алексей Кулагин', 'Арслан Ахметшин']

def score_sum(d):
    sc = d.get('scores') or {}
    return sum(sc.values())

for owner in owners:
    ids = [d['id'] for d in state['deals'] if d.get('owner')==owner][:3]
    print(f"\n=== {owner} sample ===")
    for did in ids:
        s = server.get(did, {})
        i = init_map.get(did, {})
        print(did, (s.get('customer') or '')[:35])
        print('  server score sum:', score_sum(s), 'pains:', bool(str(s.get('pains') or '').strip()))
        print('  init   score sum:', score_sum(i), 'pains:', bool(str(i.get('pains') or '').strip()))
        trs = s.get('techResearch') or {}
        tri = i.get('techResearch') or {}
        print('  server segs:', len(trs.get('seekingSegments') or []), 'init segs:', len(tri.get('seekingSegments') or []))

print('\nInit deals:', len(init_map), 'Server deals:', len(server))
