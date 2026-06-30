#!/usr/bin/env python3
import json
import os
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/amo-setup-secret.json"
cfg = json.load(open(path, encoding="utf-8"))
os.environ["AMO_SETUP_ACCESS_TOKEN"] = cfg["access_token"]
os.environ["AMO_SETUP_REFRESH_TOKEN"] = cfg.get("refresh_token") or cfg["access_token"]
os.environ["AMO_SETUP_CLIENT_SECRET"] = cfg["client_secret"]
os.execv(sys.executable, [sys.executable, "/opt/itmen-pipeline/scripts/setup-amo-credentials.py"])
