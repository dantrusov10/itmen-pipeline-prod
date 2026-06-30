#!/usr/bin/env python3
import json, urllib.request
email=password=""
for line in open("/opt/itmen-pipeline/.env"):
    if line.startswith("PB_ADMIN_EMAIL="): email=line.split("=",1)[1].strip()
    if line.startswith("PB_ADMIN_PASSWORD="): password=line.split("=",1)[1].strip()
t=json.loads(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8095/api/admins/auth-with-password",json.dumps({"identity":email,"password":password}).encode(),headers={"Content-Type":"application/json"})).read())["token"]
data=json.loads(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8095/api/collections/deal_files/records?perPage=1",headers={"Authorization":t})).read())
print("total files", data.get("totalItems",0))
items=json.loads(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8095/api/collections/deal_files/records?perPage=5",headers={"Authorization":t})).read()).get("items",[])
for f in items: print(f.get("original_name"), f.get("file"))
