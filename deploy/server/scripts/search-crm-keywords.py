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
    deals += d["items"]
    if pg >= d["totalPages"]:
        break
    pg += 1
keys = ["атом", "камаз", "кама", "вшэ", "райфф", "нбд", "таиф", "цкоимн", "бегиш", "агротер", "вишнев", "эндофарм", "нурмк", "марс", "точно", "ашот", "калининград"]
for k in keys:
    m = [(x["deal_id"], x["customer"]) for x in deals if k in (x.get("customer") or "").lower()]
    if m:
        print(k, "->", m)
