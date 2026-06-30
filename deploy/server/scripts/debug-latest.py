#!/usr/bin/env python3
import importlib.util
spec = importlib.util.spec_from_file_location("imp", "/opt/itmen-pipeline/scripts/import-clientmap-requirements.py")
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)
rows = imp.load_csv("/tmp/psi-sheet.csv")
latest = imp.pick_latest_runs(rows)
print("zomz in latest", "зомз" in latest)
if "зомз" in latest:
    r=latest["зомз"]
    print("zomz row", r.get("_company_raw"), len(imp.extract_product_rows(r)))
for k, row in sorted(latest.items(), key=lambda x: -(len(imp.extract_pilot_rows(x[1]))+len(imp.extract_product_rows(x[1])))):
    pl=len(imp.extract_pilot_rows(row)); pr=len(imp.extract_product_rows(row))
    if pl or pr:
        print(f"  {row.get('_company_raw')} | pilot={pl} product={pr} | key={k}")
