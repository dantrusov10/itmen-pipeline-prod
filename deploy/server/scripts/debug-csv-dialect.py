#!/usr/bin/env python3
import csv
path="/tmp/psi-sheet.csv"
# method 1: default
rows1=list(csv.DictReader(open(path,encoding="utf-8-sig")))
# method 2: sniffer
with open(path,encoding="utf-8-sig",newline="") as f:
    sample=f.read(4096); f.seek(0)
    dialect=csv.Sniffer().sniff(sample,delimiters=",;\t")
    rows2=list(csv.DictReader(f,dialect=dialect))

for label, rows in [("default", rows1), ("sniffer", rows2)]:
    z=[r for r in rows if "ЗОМЗ" in (r.get("company") or "")]
    print(label, "zrows", len(z), "cols", len(rows[0].keys()) if rows else 0)
    if z:
        r=z[0]
        plen=len(r.get("payload") or "")
        print("  payload len", plen, "company", repr(r.get("company")))
        if plen:
            print("  payload start", (r.get("payload") or "")[:80])
