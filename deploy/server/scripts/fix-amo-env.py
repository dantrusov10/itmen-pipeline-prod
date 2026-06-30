#!/usr/bin/env python3
p = "/opt/itmen-pipeline/.env"
lines = open(p, encoding="utf-8").read().splitlines()
out = []
for line in lines:
    if line.startswith("AMO_SUBDOMAIN="):
        out.append("AMO_SUBDOMAIN=inferit")
    elif line.startswith("AMO_CLIENT_SECRET=") and '"' in line:
        out.append(line.replace('"', ""))
    else:
        out.append(line)
open(p, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("fixed .env")
