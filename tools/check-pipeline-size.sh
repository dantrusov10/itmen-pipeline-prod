#!/bin/bash
set -e
TOKEN=$(python3 /opt/itmen-pipeline/scripts/test-auth-api.py 2>/dev/null | grep -o 'eyJ[^ ]*' | head -1)
curl -s -o /tmp/pipe.json -w "lite_size:%{size_download}\n" \
  "http://127.0.0.1:3010/api/pipeline?lite=1" \
  -H "Authorization: Bearer $TOKEN"
python3 -c "import json; d=json.load(open('/tmp/pipe.json')); print('deals', len(d['state']['deals']))"
curl -s -o /tmp/pipe-full.json -w "full_size:%{size_download}\n" \
  "http://127.0.0.1:3010/api/pipeline" \
  -H "Authorization: Bearer $TOKEN"
# external via nginx with gzip
curl -s -o /dev/null -w "ext_gzip:%{size_download} enc:%{content_type}\n" \
  --compressed "https://itmen-pipeline.nwlvl.ru/api/pipeline?lite=1" \
  -H "Authorization: Bearer $TOKEN" -H "Accept-Encoding: gzip"
