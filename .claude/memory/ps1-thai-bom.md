---
name: ps1-thai-bom
description: .ps1 files containing Thai must be saved UTF-8 WITH BOM or Windows PowerShell 5.1 fails to parse them
metadata: 
  node_type: memory
  type: reference
  originSessionId: d96d8e77-42d5-4b17-8a25-867d2ab045b6
---

Any `.ps1` in this repo that contains Thai text **must be saved as UTF-8 with a BOM** (`EF BB BF`).

**Why:** the owner's machine runs Windows PowerShell 5.1, which reads `.ps1` files as ANSI when there is no BOM. The Thai bytes become mojibake and the parser dies with a misleading error — `Missing closing '}' in statement block` pointing at a line that is perfectly balanced. The script is simply unrunnable; nothing about the message hints at encoding.

**How to apply:** the Write tool emits UTF-8 *without* BOM, so write the file first, then re-save it with a BOM (e.g. `node -e` prepending `﻿`, or `Out-File -Encoding utf8` from PowerShell). Verify with `head -c 3 file.ps1 | xxd` → expect `efbb bf`. Check this whenever a Thai-commented .ps1 "mysteriously" won't parse.

Bit us on `.claude/sync-memory.ps1` (see [[air-shop-site]] session) — memory had to be synced by hand until the BOM was added.
