#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request

def pb_token():
    env = {}
    for line in open("/opt/itmen-pipeline/.env", encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
    req = urllib.request.Request(
        "http://127.0.0.1:8095/api/admins/auth-with-password",
        data=json.dumps({"identity": env["PB_ADMIN_EMAIL"], "password": env["PB_ADMIN_PASSWORD"]}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return json.load(urllib.request.urlopen(req))["token"]


def main():
    token = pb_token()
    headers = {"Authorization": token}
    filt = urllib.parse.quote('deal_id="D-1009"')
    deals = json.load(urllib.request.urlopen(
        urllib.request.Request(
            f"http://127.0.0.1:8095/api/collections/deals/records?perPage=50&filter={filt}",
            headers=headers,
        )
    ))["items"]
    print("deals count", len(deals))
    for d in deals:
        print(d["id"], d.get("deal_id"), d.get("amo_id"))

    # API CRM bundle via pipeline API - need user login
    env = {}
    for line in open("/opt/itmen-pipeline/.env", encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
    login = urllib.request.Request(
        "http://127.0.0.1:3010/api/auth/login",
        data=json.dumps({"email": env.get("ADMIN_EMAIL", env["PB_ADMIN_EMAIL"]), "password": env.get("ADMIN_PASSWORD", env["PB_ADMIN_PASSWORD"])}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        sess = json.load(urllib.request.urlopen(login))
        print("login keys", list(sess.keys()))
        bearer = sess.get("token") or sess.get("accessToken")
        if not bearer and sess.get("user"):
            bearer = sess.get("token")
        api_headers = {"Authorization": f"Bearer {bearer}"}
        crm = json.load(urllib.request.urlopen(
            urllib.request.Request("http://127.0.0.1:3010/api/deals/D-1009/crm", headers=api_headers)
        ))
        print("crm activities", len(crm.get("activities", [])))
        print("crm tasks", len(crm.get("tasks", [])))
        for a in crm.get("activities", [])[:3]:
            print(" act", a.get("type"), a.get("author"), (a.get("body") or "")[:60])
        for t in crm.get("tasks", [])[:3]:
            print(" task", t.get("status"), t.get("title"), t.get("assignee"))
    except Exception as e:
        print("api error", e)


if __name__ == "__main__":
    main()
