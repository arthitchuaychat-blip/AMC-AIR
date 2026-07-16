---
name: tools-system
description: "เครื่องมือช่าง (Tools) module — tool registry per stock/vehicle/person + withdraw/return/report approval flow; Tools.jsx, mig 122, module id \"tools\""
metadata: 
  node_type: memory
  type: project
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

Tools tracking (v338, mig 122): `tools` registry — location `stock` (สำรอง/เฉพาะงาน) / `vehicle` (+team, หัวหน้าทีมรับผิดชอบ) / `person` (+holder uuid), status normal/broken/repair/lost. `tool_moves` = requests (withdraw/return/report/transfer) pending→approved/rejected; approval (decideToolMove in api.js) applies the move to the tools row (return→stock, report→status). RLS: all authenticated read + insert own requests; admin/exec/stock write registry + decide. UI [Tools.jsx](app/src/components/Tools.jsx) tabs ของฉัน/สต๊อกเบิกได้/คำขอ/ทะเบียน; lead_tech's "ของฉัน" includes their team's vehicle tools. Perms: module "tools" — admin/exec/stock=E, most=V, graphic/maid=N. Visibility (v339, per owner): stock tab only lead_tech/stock/admin/exec (canSeeStock); tech sees only own tools + own requests; requests tab shows all only to managers. Seed: mig 123 = standard kits from owner's CSV (51 vehicle + 19 personal), all start in stock tagged 'ชุดประจำรถ/ชุดประจำตัว (มาตรฐาน)'.
