# Memory index

- [Finance payroll read](hr-system.md) — v841: accounting reads base rates and saved payroll through RLS; drafts/history, detail, CSV and print; existing HR approvals unchanged.

- [Document preview](document-preview.md) — v839: sales drawers use actual A4 print/capture output with descriptions, original/copy and zoom; 94 browser checks pass.

- [Sales document review](sales-document-review.md) — approved v838 release: blue originals, gray copies, Sarabun, full-payment labels and print/capture parity; 743 assertions and 60 Chrome layouts pass.

- [Head technician work status](lead-tech-work-status.md) — production fix for start/submit without an assigned team; cross-team field actions, existing lock/approval guards preserved; 157 regression assertions.

- [Customer chat attachments](customer-chat-attachments.md) — v837 live via PR #7: drag/drop and clipboard images, video/file attachments, wrong-room and partial-retry guards; deployment verified.

- [Job read / BOQ v836](job-read-boq-v836.md) — permission fix and 50-row BOQ pilot; live v836 via merged PR #6, production migration and both app domains verified; tests/measurements and known baseline failures.

- [Git BOQ case](git-boq-case.md) — git add ต้องก็อปพาธจาก git status เป๊ะ ๆ (BOQ.jsx ตัวใหญ่) ไม่งั้นหลุดเงียบ; ความจำอยู่บน Google Drive ผ่าน junction
- [PowerShell + ภาษาไทย](ps1-thai-bom.md) — .ps1 ที่มีคอมเมนต์ไทยต้องเซฟ UTF-8 **พร้อม BOM** ไม่งั้น PS 5.1 พังด้วย error หลอกว่า "Missing closing '}'"
- [รูปแอร์ทางการ](ac-official-media.md) — manifest acOfficialMedia.js + ปุ่มนำเข้าทั้งชุด (ดาวน์โหลดเก็บเข้า storage เรา ห้าม hotlink); ?acimg=1 สำรวจ + กับดัก codesNoPhoto cap 12; รุ่นที่ยังหารูปไม่ได้

- [Company website](company-website.md) — live storefront www.amcair.net (company-website/, Vercel amc-air-497i): Supabase-wired catalog+cart, SSR /a/:id article + /p/:code product pages, sitemap/SEO; content managed via app's จัดการเว็บไซต์.
- [FlowAccount MCP](flowaccount-mcp.md) — FA เชื่อม Claude แล้ว (อ่านอย่างเดียว, บริษัท N498831); งานค้าง = กระทบยอดขาย ERP↔FA (ฝั่ง FA ได้ 59 ใบ ฿4.5M แล้ว รอฝั่ง ERP)
- [Air shop site](air-shop-site.md) — single-file e-commerce site air-shop/index.html; catalog+prices scraped from แอร์บ้านราคาถูก.com; LINE-checkout cart.
- [LINE OA chat](line-oa-chat.md) — in-app chat board via Vercel edge functions + Supabase Realtime; env vars + activation steps + migration 023.
- [AI LINE bot](ai-line-bot.md) — บอท Claude Sonnet 5 ตอบลูกค้านอกเวลาทำการใน line-webhook.js (aiAnswer, แคตตาล็อก web_products, ai_enabled/ai_extra ใน app_config.autoreply); ต้องมี ANTHROPIC_API_KEY บน Vercel, maxDuration 60.
- [Stale-cache deploys](stale-cache-deploys.md) — "broken" filters/search are usually a cached old bundle; how to verify the live bundle; cache headers in app/vercel.json.
- [Print pagination](print-pagination.md) — printed docs repeat the letterhead via JS pagination in printDoc.js (NOT thead/fixed — both fail in Chrome); verify print changes in a browser harness.
- [Permissions system](permissions-system.md) — role access via lib/permissions.js (can()/navForRole + editable matrix in Settings, app_config + migration 039); ธุรการ on top.
- [Menu consolidation](menu-consolidation.md) — โปรเจกต์ยุบเมนู (รวมทางเข้า เก็บเอกสาร/สถานะเดิม): รูปแบบ hub component + คุมสิทธิ์รายแท็บ + แผน 4 เฟส + ความคืบหน้า (เฟส 1 เสร็จ v807)
- [Ensure-columns trap](menu-consolidation.md) — บั๊ก "ฟีเจอร์ที่ใช้คอลัมน์ใหม่ไม่บันทึก" (supplier/submitted_seq หาย) มักเพราะ ALTER ADD COLUMN ไม่ได้รันจริงบน DB จริง แม้ migration ใน repo มีแล้ว → ให้ SQL `add column if not exists` ครบชุด (mig 248) ให้เจ้าของรัน
- [i18n ไทย↔พม่า](i18n-burmese.md) — สลับภาษาพม่าให้แรงงาน (tech/assistant/lead_tech/maid) ผ่าน lib/i18n.js + useLang + L(th,my); v532 เปิดให้แม่บ้าน + แปล TaskBoard/Expenses/TeamChat/คู่มือ; ออฟฟิศเป็นไทยเสมอ
- [Team chat push](team-chat-push.md) — team-chat unread badges + Web Push/PWA (sw.js, push-send.js, migration 040); needs VAPID env on Vercel + Add-to-Home-Screen.
- [HR system](hr-system.md) — attendance (selfie+GPS check-in/out), leave, holidays, monthly stats; lib/hr.js schedules, migration 041; set staff work_pattern in HR settings.
- [Job handbook](job-handbook.md) — คู่มือตำแหน่งงาน (SOP/KPI ต่อ role ใน lib/handbook.js) + ประกาศแก้ในแอป + ปุ่มอ่านแล้ว/ติดตามคนอ่าน (mig 236, Handbook.jsx).
- [Subcontractor system](subcontractor-system.md) — sub teams: per-job labor (80% default), payouts with WHT-on-VAT, team scorecard; migration 042; feeds Profit.
- [Google Calendar feed](gcal-feed.md) — job schedule → Google Calendar via token-gated ICS feed (api/calendar.js); needs CALENDAR_FEED_TOKEN env; subscribe UI in Schedule.
- [Cash flow](cash-flow.md) — money in/out by day, projected vs actual; cash_entries ledger seeded from docs + manual lines; migration 046; CashFlow.jsx.
- [Doc lifecycle](doc-lifecycle.md) — OWNER RULES v390: ยกเลิก/ลบไล่จากใบล่าสุด+เหตุผลบังคับ (confirmDialog prompt.required), ใบยกเลิกล็อกปุ่มสร้างต่อ (BOQ แก้แล้ว revive), ใบเสนอใหม่ต้องอ้าง BOQ; + billing notes (mig 050), date filters.
- [Internal note](internal-note.md) — back-office-only internal_note on 7 docs (mig 055); never printed for customers; shared InternalNote.jsx.
- [Task board](task-board.md) — internal Kanban กระดานสั่งงาน (assign/attach/comment/status); module "tasks", TaskBoard.jsx, mig 056.
- [Notifications](notifications.md) — app-wide bell + web push, 5 categories, per-role on/off; notify() in api.js, NotificationBell.jsx, mig 058.
- [Expenses system](expenses-system.md) — เบิกจ่าย: requests/approve/pay+proof, 3 wallets (VAT/NoVAT/petty)+transfers+report; Expenses.jsx, mig 063; feeds Cash Flow + job cost.
- [Audit trail](audit-trail.md) — financial-doc audit log + recoverable hard-deletes (snapshot before delete); logAudit() in api.js, viewer in Settings, mig 067 (run manually).
- [Stock count](stock-count.md) — นับสต๊อก: compare system vs counted, adjust on-hand (adjust_in/out movements), keep per-round audit; module "stockcount", StockCount.jsx, mig 086.
- [Handover system](handover-system.md) — ใบส่งมอบงาน: technician fills in-app (multi-form builder per machine + draw-on-screen signatures), prints/PDFs saved data; mig 077, module "handover", from งานของฉัน/ใบงาน.
- [Suppliers system](suppliers-system.md) — ข้อมูลผู้ขาย (Suppliers) CRM mirroring customers (contacts+sites), module "suppliers", mig 092; write = admin/exec/finance/stock.
- [PO procurement](po-procurement.md) — order-driven purchasing (mig 100): PO↔quote link (AC must link), receive→auto-withdraw actual cost to job, payment via expense approval (no cash mirror double-count), 2-axis status, cash flow actual-on-paid.
- [Supabase 1000-row cap](supabase-1000-row-cap.md) — every select capped at 1000 rows; page growing tables with _fetchAll or new docs' lines silently vanish on read (v324 BOQ incident)
- [Tools system](tools-system.md) — เครื่องมือช่าง: registry สต๊อก/ประจำรถ/ประจำตัว + เบิก-คืน-แจ้งชำรุดแบบรออนุมัติ; Tools.jsx, mig 122
- [Build ผ่าน ≠ หน้าเปิดได้](build-passes-page-dead.md) — Vite ไม่ตรวจตัวแปรอิสระ ต้องรัน npm test (test-undefined-vars.mjs) ก่อน commit ทุกครั้ง ไม่ใช่แค่ build
- [Stock as-of](stock-as-of.md) — สต๊อกคงเหลือย้อนหลัง ณ วันที่ (v513): สูตร init_stock + เคลื่อนไหวถึงวันนั้น (ตรง view mat_stock), stockAsOf()+StockAsOf.jsx ในแท็บคลังวัสดุ
- [Income/cost categories](income-cost-categories.md) — เสร็จครบ 3 เฟส v511: ประเภทงาน + รายได้แยกหมวด + P&L ต้นทุน/ค่าใช้จ่าย (แท็บ กำไร-ขาดทุน); ต้องรัน SQL 176+177; แหล่งข้อมูล+เกณฑ์+กับดักครบ
- [App performance](app-performance.md) — เร่งแอป: code-split (บันเดิลแรก 2.3MB→0.65MB) + แคชลิสต์เอกสาร 45 วิ (ตัวดัก supabase.from/rpc ล้างแคชอัตโนมัติ = เซฟแล้วสด) ทำแล้ว v507; เหลือแค่ index ตอนตารางโต
- [Loans / financing menu](loans-financing.md) — เมนูหนี้สิน (รถเช่าซื้อ 6 คัน + สินเชื่อออฟฟิศ): ตาราง loans mig 242, คำนวณ flat/reducing, ปุ่มจ่ายงวด→เบิกจ่าย, SUZUKI ป้อนแล้ว
- [UI design system](ui-design.md) — พาเลตต์กลาง + เอกสารพิมพ์แช่แข็ง · v828 screen design: เมนู/แท็บไอคอนเส้น การ์ดขาวเงาบาง ฟอนต์อ่านง่าย; เจ้าของอนุญาตขึ้นจริง
- [Doc idempotency](doc-idempotency.md) — กันบันทึกเอกสารเงินซ้ำ 2 ชั้น: busy guard ฝั่งจอ + request_id unique ระดับ DB (UUID ต่อการเปิดฟอร์ม) · migration รันแล้ว 17 ก.ย. 2026 · วิธีต่อยอดตารางอื่น
- [Client error tracking](client-error-tracking.md) — เก็บ error จากเครื่องผู้ใช้ลง client_errors ของเราเอง (v847) ไม่ส่งบริการภายนอก · ตัดสั้น · admin/exec อ่าน · rate limit · วิธีดู
- [Verify migration via REST](verify-migration-via-rest.md) — เช็กว่า migration รันแล้วจริงด้วย curl + anon key (200=มี, 404=ตารางไม่มี, 400=คอลัมน์ไม่มี) ไม่ต้องเข้า dashboard
- [Release gate](release-gate.md) — main ถูกป้องกัน (17 ก.ย. 2026): ส่งงานเป็น PR + CI test-and-build เขียว + เจ้าของ Merge · ลิงก์ pull/new · กับดัก branch ต้องทันสมัย
- [Backup & restore runbook](../../docs/runbooks/backup-restore.md) — คู่มือสำรอง/กู้คืน Supabase (DB+Storage+env) · Free ไม่มี backup อัตโนมัติ · ซ้อมกู้ไตรมาสละครั้ง · ตารางติดตามอยู่ท้ายไฟล์ (docs/runbooks/backup-restore.md)
- [Doc window loading](doc-window-loading.md) — โหลดเอกสารเฉพาะช่วงวันที่ (since) + listXTotals แบบบางสำหรับตัวเลขที่ต้องนับจากทุกใบ (ใบแจ้งหนี้ v850) แบบแผนสำหรับหน้าอื่น
- [Storage backup](storage-backup.md) — สำรองไฟล์แนบ photos 26 GB → Google Drive K: (Stream) ด้วย scripts/backup-storage.mjs ทุกวันที่ 1 · กับดัก Supabase CLI
- [Mobile picker remount](mobile-picker-remount.md) — Android เลือกรูปแล้วเด้งออก: reload-on-visibility ที่ถอด UI ตอน loading ทำลายฟอร์มแนบไฟล์ → silent refresh + ร่างใน sessionStorage (v855)
