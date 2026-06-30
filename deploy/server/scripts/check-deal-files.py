#!/usr/bin/env python3
import json, urllib.parse, urllib.request, sys
deal_id = sys.argv[1] if len(sys.argv) > 1 else "D-216"
email = password = ""
for line in open("/opt/itmen-pipeline/.env"):
    if line.startswith("PB_ADMIN_EMAIL="): email = line.split("=", 1)[1].strip()
    if line.startswith("PB_ADMIN_PASSWORD="): password = line.split("=", 1)[1].strip()
t = json.loads(urllib.request.urlopen(urllib.request.Request(
    "http://127.0.0.1:8095/api/admins/auth-with-password",
    json.dumps({"identity": email, "password": password}).encode(),
    headers={"Content-Type": "application/json"})).read())["token"]
q = urllib.parse.quote(f'deal_id="{deal_id}"')
deals = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"http://127.0.0.1:8095/api/collections/deals/records?filter={q}",
    headers={"Authorization": t})).read())
if not deals.get("items"):
    print("deal not found"); raise SystemExit(1)
d = deals["items"][0]
print("deal", d.get("deal_id"), "amo_id", d.get("amo_id"), "pb", d.get("id"))
fq = urllib.parse.quote(f'deal="{d["id"]}"')
files = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"http://127.0.0.1:8095/api/collections/deal_files/records?filter={fq}&perPage=50",
    headers={"Authorization": t})).read())
print("files", len(files.get("items", [])))
for f in files.get("items", []):
    print(" -", f.get("original_name"), "|", f.get("label"), "|", f.get("file"))
