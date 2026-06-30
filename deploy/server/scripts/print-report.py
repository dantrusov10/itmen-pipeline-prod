#!/usr/bin/env python3
import json
d = json.load(open("/tmp/import-report3.json"))
print("DETAILS:")
for x in d.get("details", []):
    print(x)
print("\nUNMATCHED:")
for x in d.get("unmatched", d.get("stats", {}).get("unmatched", [])):
    print(x)
