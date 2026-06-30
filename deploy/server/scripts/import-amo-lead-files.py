#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import Amo attachment notes for specific lead(s) into CRM deal_files."""
from __future__ import annotations

import json
import mimetypes
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(SCRIPT_DIR, "amo-tokens.json")
SUBDOMAIN = os.environ.get("AMO_SUBDOMAIN", "inferit")
BASE = f"https://{SUBDOMAIN}.amocrm.ru"
CLIENT_ID = os.environ.get("AMO_CLIENT_ID", "f4ae4a8e-f973-406a-906a-fc3e29d4a2d9")
CLIENT_SECRET = os.environ.get("AMO_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("AMO_REDIRECT_URI", "https://itmen-pipeline.nwlvl.ru/")
PB = os.environ.get("PB_URL", "http://127.0.0.1:8095")


def http_json(url, data=None, token=None, method=None, timeout=180):
    headers = {"Content-Type": "application/json", "User-Agent": "ITMen-amo-import/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def http_bytes(url, timeout=300):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "ITMen-amo-import/1.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as res:
        return res.read()


def pb_auth():
    email = password = ""
    env_path = os.environ.get("ITMEN_ENV", "/opt/itmen-pipeline/.env")
    if os.path.isfile(env_path):
        for line in open(env_path, encoding="utf-8"):
            if line.startswith("PB_ADMIN_EMAIL="):
                email = line.split("=", 1)[1].strip()
            if line.startswith("PB_ADMIN_PASSWORD="):
                password = line.split("=", 1)[1].strip()
    data = http_json(
        f"{PB}/api/admins/auth-with-password",
        {"identity": email, "password": password},
        method="POST",
    )
    return data["token"]


def pb_list(token, collection, **params):
    q = urllib.parse.urlencode({**params, "perPage": 500})
    out = []
    page = 1
    while True:
        data = http_json(f"{PB}/api/collections/{collection}/records?{q}&page={page}", token=token)
        out.extend(data.get("items") or [])
        if page >= (data.get("totalPages") or 1):
            break
        page += 1
    return out


def pb_upload_file(token, fields: dict, file_bytes: bytes, filename: str):
    boundary = uuid4().hex
    body = BytesIO()
    for key, val in fields.items():
        if val is None:
            continue
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body.write(f"{val}\r\n".encode("utf-8"))
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    safe_name = filename.replace('"', "_")[:280]
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n".encode()
    )
    body.write(file_bytes)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        f"{PB}/api/collections/deal_files/records",
        data=body.getvalue(),
        headers={"Authorization": token, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        return json.loads(res.read().decode("utf-8"))


def get_access_token():
    stored = json.load(open(TOKEN_FILE, encoding="utf-8"))
    if stored.get("refresh_token") and CLIENT_SECRET:
        try:
            data = http_json(
                f"{BASE}/oauth2/access_token",
                {
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "grant_type": "refresh_token",
                    "refresh_token": stored["refresh_token"],
                    "redirect_uri": REDIRECT_URI,
                },
            )
            data["saved_at"] = datetime.now(timezone.utc).isoformat()
            json.dump(data, open(TOKEN_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            return data["access_token"]
        except Exception:
            pass
    return stored["access_token"]


def safe_filename(name, fallback="file"):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(name or fallback)).strip()
    return name[:180] or fallback


def find_deal_pb_id(pb_token, amo_lead_id):
    deals = pb_list(pb_token, "deals", fields="id,deal_id,amo_id,customer")
    for d in deals:
        if str(d.get("amo_id") or "") == str(amo_lead_id):
            return d["id"], d.get("deal_id"), d.get("customer")
    return None, None, None


def existing_labels(pb_token, pb_deal_id):
    rows = pb_list(pb_token, "deal_files", filter=f'deal="{pb_deal_id}"', fields="label")
    return {r.get("label") for r in rows}


def fetch_attachment_notes(amo_token, amo_lead_id):
    notes = []
    page = 1
    while True:
        data = http_json(
            f"{BASE}/api/v4/leads/notes?filter[note_type]=attachment&filter[entity_id]={amo_lead_id}&page={page}&limit=250",
            token=amo_token,
        )
        batch = (data.get("_embedded") or {}).get("notes") or []
        notes.extend(batch)
        if not (data.get("_links") or {}).get("next"):
            break
        page += 1
        time.sleep(0.1)
    return notes


def import_lead_files(amo_token, pb_token, amo_lead_id, apply=False):
    pb_id, deal_id, customer = find_deal_pb_id(pb_token, amo_lead_id)
    if not pb_id:
        print(f"  lead {amo_lead_id}: CRM deal not found")
        return 0, 0, 0
    labels = existing_labels(pb_token, pb_id)
    drive_url = http_json(f"{BASE}/api/v4/account?with=drive_url", token=amo_token).get("drive_url")
    if not drive_url:
        raise RuntimeError("drive_url not available")
    notes = fetch_attachment_notes(amo_token, amo_lead_id)
    print(f"  {deal_id} ({customer}): amo notes={len(notes)}, existing files={len(labels)}")
    ok = skip = fail = 0
    seen = set()
    for note in notes:
        params = note.get("params") or {}
        fuuid = params.get("file_uuid")
        if not fuuid or fuuid in seen:
            continue
        seen.add(fuuid)
        note_id = note.get("id")
        label = f"Amo:{note_id}"
        if label in labels:
            skip += 1
            continue
        fname = safe_filename(
            params.get("file_name") or params.get("original_name") or params.get("text") or f"{fuuid}.bin",
            fuuid[:8],
        )
        if not apply:
            print(f"    would upload: {fname}")
            ok += 1
            continue
        try:
            meta = http_json(f"{drive_url}/v1.0/files/{fuuid}", token=amo_token)
            links = meta.get("_links") or {}
            dl = ((links.get("download_version") or links.get("download")) or {}).get("href")
            if not dl:
                print(f"    skip {fname}: no download link")
                fail += 1
                continue
            content = http_bytes(dl)
            pb_upload_file(pb_token, {
                "deal": pb_id,
                "label": label,
                "original_name": fname,
                "size": len(content),
                "mime_type": mimetypes.guess_type(fname)[0] or "application/octet-stream",
                "uploaded_by": "import-amo-lead-files",
                "uploaded_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }, content, fname)
            print(f"    uploaded: {fname} ({len(content)} bytes)")
            ok += 1
            labels.add(label)
        except Exception as e:
            print(f"    error {fname}: {e}")
            fail += 1
        time.sleep(0.05)
    return ok, skip, fail


def main():
    apply = "--apply" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("Usage: import-amo-lead-files.py [--apply] AMO_LEAD_ID [AMO_LEAD_ID ...]")
        return 1
    amo_token = get_access_token()
    pb_token = pb_auth()
    total_ok = total_skip = total_fail = 0
    for lid in args:
        print(f"Lead {lid}:")
        ok, skip, fail = import_lead_files(amo_token, pb_token, int(lid), apply=apply)
        total_ok += ok
        total_skip += skip
        total_fail += fail
    print(f"Done: uploaded={total_ok} skipped={total_skip} failed={total_fail}" + ("" if apply else " (dry-run)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
