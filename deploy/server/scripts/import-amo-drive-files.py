#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import Amo Drive files (leads/{id}/files API) into CRM deal_files for all mapped deals."""
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


KNOWN_EXTS = {
    ".pdf", ".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt", ".txt", ".csv",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".rar", ".7z", ".rtf",
}

MIME_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}


def has_valid_extension(name):
    m = re.search(r"(\.[A-Za-z0-9]{2,5})$", name or "")
    if not m:
        return False
    ext = m.group(1).lower()
    if ext in KNOWN_EXTS:
        return True
    if re.fullmatch(r"\.\d{2,4}", ext):
        return False
    return ext[1:].isalpha()


def ext_from_magic(data):
    if not data:
        return ""
    if data.startswith(b"%PDF"):
        return ".pdf"
    if data.startswith(b"PK\x03\x04"):
        if b"word/" in data[:4096]:
            return ".docx"
        if b"xl/" in data[:4096]:
            return ".xlsx"
        return ".zip"
    if data.startswith(b"\xd0\xcf\x11\xe0"):
        return ".doc"
    return ""


def ensure_extension(name, mime_type="", magic=b""):
    name = safe_filename(name)
    if has_valid_extension(name):
        return name
    ext = MIME_EXT.get(mime_type or "") or ext_from_magic(magic) or (mimetypes.guess_extension(mime_type or "") or "")
    if ext == ".jpe":
        ext = ".jpg"
    if ext and not name.lower().endswith(ext.lower()):
        return name + ext
    return name


def fetch_lead_files(amo_token, amo_lead_id):
    try:
        data = http_json(f"{BASE}/api/v4/leads/{amo_lead_id}/files", token=amo_token)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    return (data.get("_embedded") or {}).get("files") or []


def import_deal_files(amo_token, pb_token, drive_url, deal, existing_labels, apply):
    amo_id = int(deal["amo_id"])
    files = fetch_lead_files(amo_token, amo_id)
    stats = {"found": len(files), "uploaded": 0, "skipped": 0, "failed": 0}
    if not files:
        return stats
    for f in files:
        file_id = f.get("id")
        fuuid = f.get("file_uuid")
        if not fuuid:
            stats["failed"] += 1
            continue
        label = f"AmoFile:{file_id}"
        if label in existing_labels.get(deal["pb_id"], set()):
            stats["skipped"] += 1
            continue
        try:
            meta = http_json(f"{drive_url}/v1.0/files/{fuuid}", token=amo_token)
            links = meta.get("_links") or {}
            dl = ((links.get("download_version") or links.get("download")) or {}).get("href")
            if not dl:
                stats["failed"] += 1
                continue
            if not apply:
                stats["uploaded"] += 1
                continue
            content = http_bytes(dl)
            mime = mimetypes.guess_type(meta.get("name") or "")[0] or "application/octet-stream"
            fname = ensure_extension(meta.get("name") or f"file_{file_id}", mime, content[:4096])
            pb_upload_file(pb_token, {
                "deal": deal["pb_id"],
                "label": label,
                "original_name": fname,
                "size": len(content),
                "mime_type": mime,
                "uploaded_by": "import-amo-drive-files",
                "uploaded_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }, content, fname)
            existing_labels.setdefault(deal["pb_id"], set()).add(label)
            stats["uploaded"] += 1
        except Exception:
            stats["failed"] += 1
        time.sleep(0.04)
    return stats


def main():
    apply = "--apply" in sys.argv
    only = [int(x) for x in sys.argv[1:] if x.isdigit()]
    amo_token = get_access_token()
    pb_token = pb_auth()
    drive_url = http_json(f"{BASE}/api/v4/account?with=drive_url", token=amo_token).get("drive_url")
    if not drive_url:
        raise SystemExit("drive_url unavailable")

    deals = []
    for d in pb_list(pb_token, "deals", fields="id,deal_id,amo_id,customer"):
        amo = d.get("amo_id")
        if not amo:
            continue
        try:
            amo_id = int(amo)
        except (TypeError, ValueError):
            continue
        if only and amo_id not in only:
            continue
        deals.append({"pb_id": d["id"], "deal_id": d.get("deal_id"), "amo_id": amo_id, "customer": d.get("customer") or ""})

    existing_labels = {}
    for f in pb_list(pb_token, "deal_files", fields="deal,label"):
        existing_labels.setdefault(f["deal"], set()).add(f.get("label") or "")

    total = {"deals": 0, "found": 0, "uploaded": 0, "skipped": 0, "failed": 0, "with_files": 0}
    for deal in deals:
        stats = import_deal_files(amo_token, pb_token, drive_url, deal, existing_labels, apply)
        total["deals"] += 1
        total["found"] += stats["found"]
        total["uploaded"] += stats["uploaded"]
        total["skipped"] += stats["skipped"]
        total["failed"] += stats["failed"]
        if stats["found"]:
            total["with_files"] += 1
            print(f"{deal['deal_id']} ({deal['customer']}) amo={deal['amo_id']}: found={stats['found']} up={stats['uploaded']} skip={stats['skipped']} fail={stats['failed']}")

    print(f"Done deals={total['deals']} with_files={total['with_files']} found={total['found']} uploaded={total['uploaded']} skipped={total['skipped']} failed={total['failed']}" + ("" if apply else " (dry-run)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
