#!/usr/bin/env python3
import sys, os
sys.path.insert(0, "/opt/itmen-pipeline/scripts")
# inline copy extract from import script
import csv, json, re
LEGAL = re.compile(r"^(ооо|оао|зао|пао|ао|мкпао|ип)\s+", re.I)
def norm(s):
    s=(s or "").strip().lower().replace("«","").replace("»","").replace('"','')
    s=LEGAL.sub("",s); return re.sub(r"\s+"," ",s.replace("ё","е")).strip()
def parse_payload(row):
    try: return json.loads(row.get("payload") or "{}")
    except: return {}
def field_get(row,payload,key,default=""):
    v=row.get(key)
    if v is not None and str(v).strip(): return v
    return payload.get(key,default)
def trunc(s,n):
    s=(s or "").strip(); return s if len(s)<=n else s[:n-1]+"…"
def extract_product(sheet_row):
    payload=parse_payload(sheet_row); out=[]
    for i in range(1,31):
        p=f"{i:02d}"
        biz=trunc(field_get(sheet_row,payload,f"prod_{p}_biz"),2000)
        func=trunc(field_get(sheet_row,payload,f"prod_{p}_func"),2000)
        if biz or func: out.append((biz,func))
    return out

rows=list(csv.DictReader(open("/tmp/psi-sheet.csv",encoding="utf-8-sig")))
zrows=[r for r in rows if "ЗОМЗ" in (r.get("company") or "")]
print("zrows", len(zrows))
for r in zrows:
    pr=extract_product(r)
    print(r.get("company"), r.get("timestamp"), "products", len(pr))
    if pr: print(" sample", pr[0])

# pick best
best=None; bs=-1
for r in zrows:
    sc=len(extract_product(r))
    if sc>bs: best=r; bs=sc
print("best products", bs, "norm", norm(best.get("company") if best else ""))
