#!/usr/bin/env python3
from pathlib import Path
import re

p = Path("/etc/nginx/sites-enabled/itmen-pipeline.nwlvl.ru")
text = p.read_text()

good = """    location = /index.html {
        add_header Cache-Control \"no-cache, no-store, must-revalidate\";
        try_files $uri =404;
    }

"""

text = re.sub(
    r"    location = /index\.html \{.*?\n \}\n\n",
    good,
    text,
    flags=re.S,
)

if "location = /index.html" not in text:
    text = text.replace(
        "    # Статика фронта (веб-морда)\n",
        "    # Статика фронта (веб-морда)\n" + good,
    )

p.write_text(text)
print("ok")
