import json, re, urllib.request
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
url = re.search(r'url:\s*"([^"]+)"', (ROOT/"js/gas-config.js").read_text(encoding="utf-8")).group(1)
deals = json.loads(urllib.request.urlopen(url+"?action=get", timeout=120).read())["state"]["deals"]

# find Novikombank
for d in deals:
    c = (d.get("customer") or "")
    if "новиком" in c.lower() or "Novikom" in c:
        print("=== DEAL", d.get("id"), c[:60])
        print("owner", d.get("owner"), "stage", d.get("stage"))
        print("amount", d.get("amount"), "manualProb", d.get("manualProb"))
        print("budgetStatus", d.get("budgetStatus"), "budgetPeriod", d.get("budgetPeriod"))
        print("commitStatus", d.get("commitStatus"))
        print("scores", json.dumps(d.get("scores"), ensure_ascii=False))
        print("category would need calc - check audit")

rows = json.loads(urllib.request.urlopen(url+"?action=auditAll", timeout=300).read())["rows"]
for r in rows:
    if "новиком" in str(r[3]).lower() and str(r[6]) in ("Скоринг", "Стадия", "Вероятность", "Статус коммита", "Статус бюджета", "—"):
        print(r[0], r[2], r[6], str(r[7])[:60], "->", str(r[8])[:60])

# category not in audit directly - search by deal id once found
deal_id = None
for d in deals:
    if "новиком" in (d.get("customer") or "").lower():
        deal_id = d["id"]
        break
if deal_id:
    print("\n=== AUDIT for", deal_id)
    for r in rows:
        if str(r[2]) == deal_id and str(r[6]) in ("Скоринг", "Вероятность", "Статус коммита", "Статус бюджета", "Стадия", "Срок бюджета"):
            print(r[0][:19], r[6], str(r[7])[:50], "->", str(r[8])[:50])
