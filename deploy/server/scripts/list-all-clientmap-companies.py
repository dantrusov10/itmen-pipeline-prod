#!/usr/bin/env python3
# Full list: companies with reqs in CSV (incl. payload) vs CRM match
import csv, json, os, re, urllib.parse, urllib.request

LEGAL = re.compile(r"^(ооо|оао|зао|пао|ао|мкпао|ип)\s+", re.I)

def norm(s):
    s = (s or "").strip().lower().replace("«","").replace("»","").replace('"','').replace("'", "")
    s = LEGAL.sub("", s)
    return re.sub(r"\s+"," ", s.replace("ё","е")).strip()

def parse_payload(row):
    try: return json.loads(row.get("payload") or "{}")
    except: return {}

def field_get(row, payload, key):
    v = row.get(key)
    if v is not None and str(v).strip(): return str(v).strip()
    v2 = payload.get(key)
    return str(v2).strip() if v2 is not None else ""

def count_pilot(row):
    p = parse_payload(row)
    return sum(1 for i in range(1,21) if field_get(row,p,f"req_{i:02d}_text"))

def count_product(row):
    p = parse_payload(row)
    return sum(1 for i in range(1,31) if field_get(row,p,f"prod_{i:02d}_biz") or field_get(row,p,f"prod_{i:02d}_func"))

def feas_score(label):
    m = {"полностью":1.0,"частично":0.6,"нет":0.0,"нет возможности":0.0,"хард код (скоро)":0.7,"хард код (не скоро)":0.3,"требуется скрипт":0.5}
    return m.get((label or "").strip().lower())

def pct(rows, mode):
    sc = []
    for i in range(1, (21 if mode=="pilot" else 31)):
        p = parse_payload(rows)
        # wrong - need per row
    return None

rows = list(csv.DictReader(open("/tmp/psi-sheet.csv", encoding="utf-8-sig")))
latest = {}
for row in rows:
    c = (row.get("company") or "").strip()
    if not c or len(c)>120: continue
    k = norm(c)
    ts = row.get("timestamp") or ""
    if k not in latest or str(ts) > str(latest[k].get("timestamp") or ""):
        latest[k] = row

pb = "http://127.0.0.1:8095"
email=password=""
for line in open("/opt/itmen-pipeline/.env"):
    if line.startswith("PB_ADMIN_EMAIL="): email=line.split("=",1)[1].strip()
    if line.startswith("PB_ADMIN_PASSWORD="): password=line.split("=",1)[1].strip()
token = json.loads(urllib.request.urlopen(urllib.request.Request(pb+"/api/admins/auth-with-password", json.dumps({"identity":email,"password":password}).encode(), headers={"Content-Type":"application/json"})).read())["token"]

deals = []
page=1
while True:
    q=urllib.parse.urlencode({"page":page,"perPage":200})
    data=json.loads(urllib.request.urlopen(urllib.request.Request(f"{pb}/api/collections/deals/records?{q}", headers={"Authorization":token})).read())
    deals.extend(data["items"])
    if page>=data.get("totalPages",1): break
    page+=1
deal_by = {norm(d.get("customer") or ""): d for d in deals if norm(d.get("customer") or "")}

print("=== ALL WITH PRODUCT REQUIREMENTS ===")
for k, row in sorted(latest.items(), key=lambda x: x[1].get("company","")):
    pr = count_product(row)
    pl = count_pilot(row)
    if not pr and not pl: continue
    c = row.get("company")
    d = deal_by.get(k)
    # fuzzy
    fuzzy = None
    if not d:
        for dk,dd in deal_by.items():
            if len(k)>=5 and (k in dk or dk in k):
                fuzzy = dd; break
    status = "MATCH" if d else ("FUZZY?" if fuzzy else "NO MATCH")
    crm = (d or fuzzy or {}).get("customer","—")
    did = (d or fuzzy or {}).get("deal_id","—")
    print(f"{status:8} | sheet: {c}")
    print(f"         | CRM:   {crm} ({did}) | pilot={pl} product={pr}")
