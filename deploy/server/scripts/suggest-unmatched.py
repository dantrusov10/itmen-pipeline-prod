#!/usr/bin/env python3
"""Suggest CRM deals for unmatched clientmap companies."""
import json, re, urllib.parse, urllib.request

UNMATCHED = json.load(open("/tmp/import-report-applied.json"))["unmatched"]

pb = "http://127.0.0.1:8095"
email = password = ""
for line in open("/opt/itmen-pipeline/.env"):
    if line.startswith("PB_ADMIN_EMAIL="):
        email = line.split("=", 1)[1].strip()
    if line.startswith("PB_ADMIN_PASSWORD="):
        password = line.split("=", 1)[1].strip()

def http(url, data=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = token
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=h)
    return json.loads(urllib.request.urlopen(req).read())

token = http(f"{pb}/api/admins/auth-with-password", {"identity": email, "password": password})["token"]
deals = []
page = 1
while True:
    q = urllib.parse.urlencode({"page": page, "perPage": 200})
    d = http(f"{pb}/api/collections/deals/records?{q}", token=token)
    deals.extend(d["items"])
    if page >= d.get("totalPages", 1):
        break
    page += 1

LEGAL = re.compile(r"^(ооо|оао|зао|пао|ао|мкпао|ип)\s+", re.I)

def norm(s):
    s = (s or "").strip().lower().replace("«", "").replace("»", "").replace('"', "").replace("'", "")
    s = LEGAL.sub("", s)
    return re.sub(r"\s+", " ", s.replace("ё", "е")).strip()

def tokens(s):
    return set(re.findall(r"[a-zа-я0-9]{3,}", norm(s)))

for u in UNMATCHED:
    name = u["company"]
    nt = tokens(name)
    scored = []
    for d in deals:
        c = d.get("customer") or ""
        ct = tokens(c)
        if not ct:
            continue
        inter = len(nt & ct)
        if not inter:
            continue
        scored.append((inter / max(len(nt), len(ct)), d.get("deal_id"), c))
    scored.sort(reverse=True)
    hints = [f"{did} — {cust}" for _, did, cust in scored[:3]]
    print(f"\n{name}")
    print(f"  пилот: {u['pilot']} ({u.get('pilot_pct') or '—'}%) | продукт: {u['product']} ({u.get('product_pct') or '—'}%)")
    if hints:
        print("  похожие в CRM:", " | ".join(hints))
    else:
        print("  похожие в CRM: —")
