#!/usr/bin/env python3
import importlib.util
spec = importlib.util.spec_from_file_location("imp", "/opt/itmen-pipeline/scripts/import-clientmap-requirements.py")
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)
rows = imp.load_csv("/tmp/psi-sheet.csv")
for row in rows:
    company = (row.get("company") or "").strip()
    key = imp.normalize_company(company)
    if key != "зомз":
        continue
    pl = len(imp.extract_pilot_rows(row))
    pr = len(imp.extract_product_rows(row))
    payload = imp.parse_payload(row)
    pr2 = sum(1 for i in range(1,31) if payload.get(f"prod_{i:02d}_biz") or payload.get(f"prod_{i:02d}_func"))
    print(f"company={company!r} ts={row.get('timestamp')} pilot={pl} product={pr} payload_prod={pr2} score={pl+pr}")
    if pr == 0 and pr2 > 0:
        print("  payload keys sample:", [k for k in payload if k.startswith("prod_")][:6])
        print("  payload col len:", len(row.get("payload") or ""))
