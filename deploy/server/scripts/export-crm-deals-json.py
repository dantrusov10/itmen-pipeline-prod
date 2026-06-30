#!/usr/bin/env python3
import json, urllib.request, urllib.parse
pb = "http://127.0.0.1:8095"
e = p = ""
for line in open("/opt/itmen-pipeline/.env"):
    if line.startswith("PB_ADMIN_EMAIL="):
        e = line.split("=", 1)[1].strip()
    if line.startswith("PB_ADMIN_PASSWORD="):
        p = line.split("=", 1)[1].strip()
t = json.loads(urllib.request.urlopen(urllib.request.Request(
    pb + "/api/admins/auth-with-password",
    json.dumps({"identity": e, "password": p}).encode(),
    headers={"Content-Type": "application/json"},
)).read())["token"]
deals = []
pg = 1
while True:
    d = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{pb}/api/collections/deals/records?page={pg}&perPage=200",
        headers={"Authorization": t},
    )).read())
    deals += [{"deal_id": x.get("deal_id"), "customer": x.get("customer"), "amoId": x.get("amoId")} for x in d["items"]]
    if pg >= d["totalPages"]:
        break
    pg += 1
json.dump(deals, open("/tmp/crm-deals.json", "w"), ensure_ascii=False, indent=2)
print(len(deals))
