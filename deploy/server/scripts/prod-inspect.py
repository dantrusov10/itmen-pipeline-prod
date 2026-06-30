#!/usr/bin/env python3
import json
import os
import urllib.parse
import urllib.request

def api_login():
    password = None
    for line in open("/opt/itmen-pipeline/.pipeline-users.env"):
        if line.startswith("admin@"):
            password = line.strip().split("=", 1)[1]
            break
    req = urllib.request.Request(
        "http://127.0.0.1:3010/api/auth/login",
        data=json.dumps({"email": "admin@itmen-pipeline.local", "password": password}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req).read())["token"]

def pb_token():
    for f in ("/opt/itmen-pipeline/.pb-admin-token", "/root/.pb-admin-token"):
        if os.path.exists(f):
            return open(f).read().strip()
    return None

def pb_list(coll, page=1, per=500, fields=""):
    tok = pb_token()
    q = urllib.parse.urlencode({"page": page, "perPage": per, "fields": fields})
    url = f"http://127.0.0.1:8095/api/collections/{coll}/records?{q}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
    return json.loads(urllib.request.urlopen(req).read())

def amo_token():
    for p in ("/opt/itmen-pipeline/.amo-access-token",):
        if os.path.exists(p):
            return open(p).read().strip()
    env = "/opt/itmen-pipeline/.env"
    if os.path.exists(env):
        for line in open(env):
            if "AMO_ACCESS_TOKEN" in line and "=" in line:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None

if __name__ == "__main__":
    t = api_login()
    deal = json.loads(urllib.request.urlopen(urllib.request.Request(
        "http://127.0.0.1:3010/api/pipeline/deals/D-015",
        headers={"Authorization": f"Bearer {t}"},
    )).read())["deal"]
    print("D-015", {k: deal.get(k) for k in ("owner", "budgetStatus", "budgetPeriod", "commitStatus", "scores", "amoId")})

    deals = []
    page = 1
    while True:
        data = pb_list("deals", page=page, per=500, fields="deal_id,owner,customer,amo_id,deal_type,pipeline_id")
        items = data.get("items", [])
        deals.extend(items)
        if page >= data.get("totalPages", 1):
            break
        page += 1
    nums = [r for r in deals if str(r.get("owner", "")).strip().isdigit()]
    print("numeric_owners", len(nums))
    for r in nums[:30]:
        print(r["deal_id"], r["owner"], (r.get("customer") or "")[:50])

    at = amo_token()
    print("amo_token", bool(at))
    if at:
        req = urllib.request.Request(
            "https://itmen.amocrm.ru/api/v4/users",
            headers={"Authorization": f"Bearer {at}"},
        )
        users = json.loads(urllib.request.urlopen(req).read()).get("_embedded", {}).get("users", [])
        for uid in ("13297858", "12718890", "13526614", "12862130"):
            hit = next((u for u in users if str(u["id"]) == uid), None)
            if hit:
                print("amo", uid, hit.get("name"), hit.get("last_name"))
