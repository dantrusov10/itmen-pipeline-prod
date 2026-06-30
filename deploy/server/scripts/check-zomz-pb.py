#!/usr/bin/env python3
import json, urllib.parse, urllib.request
pb="http://127.0.0.1:8095"
email=password=""
for line in open("/opt/itmen-pipeline/.env"):
    if line.startswith("PB_ADMIN_EMAIL="): email=line.split("=",1)[1].strip()
    if line.startswith("PB_ADMIN_PASSWORD="): password=line.split("=",1)[1].strip()
token=json.loads(urllib.request.urlopen(urllib.request.Request(pb+"/api/admins/auth-with-password",json.dumps({"identity":email,"password":password}).encode(),headers={"Content-Type":"application/json"})).read())["token"]
deal=json.loads(urllib.request.urlopen(urllib.request.Request(pb+'/api/collections/deals/records?filter=deal_id="D-022"',headers={"Authorization":token})).read())["items"][0]
print("deal", deal["customer"], deal["id"], "pilot_pct", deal.get("pilot_feasibility_pct"), "product_pct", deal.get("product_feasibility_pct"))
for coll in ["pilot_requirements","product_requirements"]:
    q=urllib.parse.urlencode({"filter":f'deal="{deal["id"]}"',"perPage":50})
    rows=json.loads(urllib.request.urlopen(urllib.request.Request(f"{pb}/api/collections/{coll}/records?{q}",headers={"Authorization":token})).read())["items"]
    print(coll, len(rows))
    for r in rows[:3]:
        print(" ", r.get("client_requirement") or r.get("functional_requirement") or r.get("business_requirement"))
