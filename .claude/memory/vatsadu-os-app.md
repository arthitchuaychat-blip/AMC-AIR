---
name: vatsadu-os-app
description: What the Inventory Management project is and how index.html is built/run
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

The "Inventory Management" project is **AMC Stock** (originally named "วัสดุOS"; the prototype under `_design/` still uses the old name) — a materials stock / withdraw–return / procurement system. Brand renders "AMC " + colored "Stock" in sidebar/topbar/login/title/print slip. The production app is `app/` (the prototype was the starting point).

The whole app is a single self-contained `index.html` at the project root: **precompiled** React (JSX → plain JS done ahead of time), loaded with React/ReactDOM + Thai fonts from CDN. No Node/npm or Python is installed on this machine, so there is no build step — it runs by double-clicking `index.html`, or via `_design/serve.ps1` (a small PowerShell static server on port 8123, also wired into `.claude/launch.json` for the Preview MCP).

Source of truth for edits is the modular JSX under `_design/inventory-management/project/` (app-data.js, app-icons/shared/dashboard/detail/technician/admin.jsx, ios-frame.jsx, and `app-main.build.jsx` = the shell with the design-tool "Tweaks" panel removed). To change the app, edit those and re-assemble `index.html` by precompiling each `.jsx` with Babel and concatenating as plain `<script>` blocks in order (data → ios → icons → shared → dashboard → detail → technician → admin → main).

**Gotcha learned:** loading many (~8) `<script type="text/babel">` inline blocks with babel-standalone is unreliable — the last script silently fails to execute (app never boots). Precompiling fixes it. Don't ship in-browser Babel here.

Three roles: Executive dashboard (KPIs + drill-down drawers + inventory-on-hand + auto-reorder CTA), Procurement (purchasing/approve/returns/damage/catalog with per-item movement ledger), and a mobile Technician app inside an iOS frame. All data is seeded mock data (~18 months); nothing persists.
