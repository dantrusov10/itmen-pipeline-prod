#!/usr/bin/env python3
import json, sys
d = json.load(open(sys.argv[1]))
for x in sorted(d.get("details", []), key=lambda z: z.get("customer", "")):
    print(f"{x['deal_id']}\t{x['customer']}\tпилот {x['pilot']} ({x.get('pilot_pct')}%)\tпродукт {x['product']} ({x.get('product_pct')}%)")
