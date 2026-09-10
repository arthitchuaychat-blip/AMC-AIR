---
name: menu-consolidation
description: โปรเจกต์ยุบเมนู ERP (รวมทางเข้า เก็บเอกสาร/สถานะเดิม) + แผน 4 เฟส + รูปแบบ hub component
metadata:
  type: project
---

เจ้าของขอ "ยุบทางเข้าเมนู" แต่เก็บเอกสาร/ข้อมูล/สถานะ/สิทธิ์เดิมไว้ (เริ่ม ก.ย. 2569) — งาน UI ล้วน ไม่แตะตาราง

**รูปแบบที่ใช้ (ทำซ้ำได้ทุกเฟส):** สร้าง hub component (เช่น `MarketingHub.jsx`, `PayCenter.jsx`) = หน้าเปลือกมี `view-seg`/`seg-btn` สลับแท็บ · แต่ละแท็บ lazy-render component เดิม · **คุมสิทธิ์รายแท็บด้วย `can(role, <moduleเดิม>)`** (ซ่อน seg bar ถ้าเหลือแท็บเดียว) · ใน `permissions.js` เพิ่มโมดูลรวมตัวใหม่ + **ถอด id ย่อยออกจาก MODULES แต่คงคีย์ใน DEFAULT_PERMS** (ให้ can รายแท็บทำงาน) · ใน App.jsx เพิ่ม NAV/NAV_EMOJI/NAV_GROUPS + render branch + **คงหน้า/branch เดิมไว้เผื่อ deep-link/#hash เก่า** · redirect deep-link ภายนอกให้ชี้ hub

**ความคืบหน้า (บน main):**
hub ที่สร้างแล้ว = MarketingHub/PayCenter/RecvCenter/SalesHub (โมดูลใหม่) · JobHub/BuyHub/CostQuoteHub (reuse view id เดิมเป็น host เพราะ deep-link เยอะ)
- เฟส 1 ✅: A1 การตลาดและเว็บไซต์ v803 · A2 ศูนย์จ่ายเงิน v806 · C1 ใบเสนอเร็ว(auto-BOQ บริการ=0/สินค้า=cost คลัง) v807 · +guard ค่างวด v804 +mig248 +B1 กันเงินนับซ้ำ v805
- เฟส 2 ✅: A3 ศูนย์รับเงิน v808 · A4 ลูกค้าและงานขาย v809 · D1 ซิงค์สถานะแชต↔ท่อขาย (แนวทาง B, customers.stage เป็นหลัก, ตารางแปลง CHAT_TO_PIPE/PIPE_TO_CHAT ใน pipeline.js, ไม่ต้อง migration) v810
- เฟส 3 ✅: A6 งานบริการและติดตั้ง (host=joborders, JobHub, ช่างไม่เห็นแท็บ jobs/ต้นทุน) v811 · A5 จัดซื้อและเตรียมงาน (host=po, BuyHub) v812 · A7 ต้นทุนและเสนอราคา (CostQuoteHub render ทั้ง view boq+quote, initialTab) v813
- เฟส 4 (บางส่วน): B2 VAT รายจ่ายประจำ (mig249) v814 ✅ · D4 เงินสำรอง→app_config v815 ✅ · C2 จัดกลุ่มแท็บติดตาม (งานขาย/ตามเก็บเงิน — ป้ายชัด ไม่ย้ายตรรกะ) v816 ✅
- เหลือ (คุณภาพต่ำ/เสี่ยง — ทำเมื่อมีความจำเป็นจริง): B3 รวมโอนเงิน = **ข้าม** (เบิกจ่าย=โอนธนาคารจริงมีตาราง transfers · cashflow=โอนบริษัท↔บุคคล 2 cash_entries — คนละกลไก ตัดเสี่ยงหาย) · D3 supplier FK = **คุ้มค่าต่ำ** (PO ใช้ทะเบียนผ่าน name-match+autosuggest อยู่แล้ว) · D2 tools↔assets (niche, ต้อง mig) · D4-ทวงหนี้→DB (ต้องทำตาราง) · ก่อน 2027: E1 ค่างวดเงินต้น=หนี้สิน, E2 ค่าเสื่อมลงบัญชี, E3 VAT แหล่งเดียว

ดูรีวิวเต็ม + เหตุผลใน [[app-review-2026]] · เรื่องเงินค่างวด/กันซ้ำใน [[loans-financing]]
