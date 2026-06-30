#!/usr/bin/env python3
from pathlib import Path

p = Path("/etc/nginx/sites-enabled/itmen-pipeline.nwlvl.ru")
text = p.read_text()
old = """    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 50m;
    }"""
new = """    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Accept-Encoding "";
        proxy_read_timeout 300s;
        proxy_buffer_size 128k;
        proxy_buffers 8 512k;
        proxy_busy_buffers_size 1m;
        client_max_body_size 50m;
    }"""
if old in text:
    text = text.replace(old, new)
    p.write_text(text)
    print("nginx api buffers ok")
else:
    print("nginx block not found")
