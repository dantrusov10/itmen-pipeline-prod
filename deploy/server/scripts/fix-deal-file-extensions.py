#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix deal_files.original_name when extension is missing or wrong (e.g. .2026 from dates)."""
from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

PB = os.environ.get("PB_URL", "http://127.0.0.1:8095")

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
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.ms-powerpoint": ".ppt",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/zip": ".zip",
    "application/x-rar-compressed": ".rar",
    "application/x-7z-compressed": ".7z",
}


def pb_auth():
    email = password = ""
    env_path = os.environ.get("ITMEN_ENV", "/opt/itmen-pipeline/.env")
    for line in open(env_path, encoding="utf-8"):
        if line.startswith("PB_ADMIN_EMAIL="):
            email = line.split("=", 1)[1].strip()
        if line.startswith("PB_ADMIN_PASSWORD="):
            password = line.split("=", 1)[1].strip()
    data = json.dumps({"identity": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(f"{PB}/api/admins/auth-with-password", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode("utf-8"))["token"]


def pb_list(token, collection, page=1, per_page=200):
    q = urllib.parse.urlencode({"page": page, "perPage": per_page})
    req = urllib.request.Request(f"{PB}/api/collections/{collection}/records?{q}", headers={"Authorization": token})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def pb_patch(token, collection, rec_id, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{PB}/api/collections/{collection}/records/{rec_id}",
        data=data,
        headers={"Authorization": token, "Content-Type": "application/json"},
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def pb_download(token, collection_id, rec_id, filename, max_bytes=8192):
    url = f"{PB}/api/files/{collection_id}/{rec_id}/{filename}"
    req = urllib.request.Request(url, headers={"Authorization": token, "Range": f"bytes=0-{max_bytes - 1}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.read()
    except urllib.error.HTTPError:
        req = urllib.request.Request(url, headers={"Authorization": token})
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.read()[:max_bytes]


def has_valid_extension(name: str) -> bool:
    m = re.search(r"(\.[A-Za-z0-9]{2,5})$", name or "")
    if not m:
        return False
    ext = m.group(1).lower()
    if ext in KNOWN_EXTS:
        return True
    if re.fullmatch(r"\.\d{2,4}", ext):
        return False
    return ext[1:].isalpha()


def ext_from_magic(data: bytes) -> str:
    if not data:
        return ""
    if data.startswith(b"%PDF"):
        return ".pdf"
    if data.startswith(b"PK\x03\x04"):
        if b"word/" in data[:4096]:
            return ".docx"
        if b"xl/" in data[:4096]:
            return ".xlsx"
        if b"ppt/" in data[:4096]:
            return ".pptx"
        return ".zip"
    if data.startswith(b"\xd0\xcf\x11\xe0"):
        return ".doc"
    if data.startswith(b"\x89PNG"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"GIF8"):
        return ".gif"
    return ""


def ensure_extension(name: str, mime_type: str = "", magic: bytes = b"") -> str:
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(name or "file").strip())[:180] or "file"
    if has_valid_extension(name):
        return name
    ext = MIME_EXT.get(mime_type or "") or ext_from_magic(magic) or (mimetypes.guess_extension(mime_type or "") or "")
    if ext == ".jpe":
        ext = ".jpg"
    if ext and not name.lower().endswith(ext.lower()):
        return name + ext
    return name


def main():
    apply = "--apply" in sys.argv
    token = pb_auth()
    page = 1
    total = 0
    fixed = 0
    skipped = 0
    failed = 0
    while True:
        batch = pb_list(token, "deal_files", page=page, per_page=200)
        items = batch.get("items") or []
        if not items:
            break
        for rec in items:
            total += 1
            old = rec.get("original_name") or ""
            mime = rec.get("mime_type") or ""
            file_field = rec.get("file") or ""
            magic = b""
            if file_field and not has_valid_extension(old):
                try:
                    magic = pb_download(token, rec["collectionId"], rec["id"], file_field)
                except Exception as e:
                    print(f"WARN download {rec['id']}: {e}")
            new = ensure_extension(old, mime, magic)
            if new == old:
                skipped += 1
                continue
            print(f"{'PATCH' if apply else 'DRY'} {rec['id']}: {old!r} -> {new!r} ({mime})")
            if apply:
                try:
                    pb_patch(token, "deal_files", rec["id"], {"original_name": new})
                    fixed += 1
                except Exception as e:
                    print(f"FAIL {rec['id']}: {e}")
                    failed += 1
            else:
                fixed += 1
        if page >= batch.get("totalPages", 1):
            break
        page += 1
    print(f"Done. total={total} to_fix={fixed} skipped={skipped} failed={failed} apply={apply}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
