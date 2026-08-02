---
name: ui-design
description: ดีไซน์การ์ด (กลอส/กระชับ) + FilterBar ตัวกรองยุบได้ — วิธีเพิ่มในเมนูใหม่
metadata:
  type: project
---

**การ์ดกลอสกระชับ (v539, 2026-08-02).** override block ท้าย `app/src/styles.css` (คอมเมนต์ `v538 — การ์ดกระชับ + กลอสลอยเด่น`) คุมทั้งแอป: `.card` พื้นไล่เฉดกลอส + เงาสีฟ้าลอยเด่น + padding 20→15 · `.job-card` hover ยกตัว -3px + เงาเข้ม · `.dch`/`.job-card-head` padding ลด · `.job-cards` gap 12→9 · `.cat-chip` เล็กลง (5/11px,12.5px) + margin ลด. **ปรับ/ย้อนที่บล็อกเดียวท้ายไฟล์** (ถ้าเจ้าของว่าจัด/สีจ้าไป ลดที่นี่).

**ไอคอนเมนู emoji (v545, 2026-08-02).** เปลี่ยนไอคอนเมนูซ้ายจาก UIcon เส้น → **emoji สีสด** · map `NAV_EMOJI` ใน App.jsx (คู่กับ NAV) · renderItem render `<span className="nav-emoji">{NAV_EMOJI[id]}</span>` แทน `<UIcon>` · CSS `.nav-emoji` (grid-row span 2, 17.5px, คอลัมน์ 18px) — emoji คงสีแม้เมนู active (ไม่โดน `.nav-item.on svg{color:#fff}`). เพิ่มเมนูใหม่ต้องเติมทั้ง NAV + NAV_EMOJI. **ไอคอนประเภทงาน** = emoji ใน `JOB_TYPES` (schedule.js index 2) — v545 ปรับ install=🧑‍🔧, install_only=🔌, ล้าง=🧼, fix=🔁, remove=🔨. เจ้าของเลือกผ่าน Artifact พรีวิว (claude.ai/code/artifact/06f15498...). **⚠️ กับดัก (v546): ใช้เฉพาะ emoji รุ่นเก่า Emoji 1.0 (ปี 2015) เท่านั้น** — font เก่าบนเครื่อง/มือถือเจ้าของ **ขึ้นกล่องว่าง** กับ Emoji 11+ (🧱🧰🧮🧾🧼🧹🧊) และแบบ ZWJ (🧑‍🔧🧑‍💼👨‍🔧) · VS16 (⚙️🛠️) ใช้ได้. เวลาเลือก emoji เมนู/ประเภทงานใหม่ ต้องเช็คว่าเป็น Emoji ≤3.0 (แก้แล้ว: hr💼 subcontract🚧 tax🏦 handover📤 jobs🔩 tools🔨 invoice📄 prep📥 · job type install🔧 ล้าง🚿).

**FilterBar — ตัวกรองยุบได้ (v540, 2026-08-02).** [FilterBar.jsx](app/src/components/FilterBar.jsx): ปุ่ม "⚙️ ตัวกรอง [count] ▼" ยุบ/เปิดแถบตัวกรอง · **default ยุบ** · จำสถานะต่อเมนูใน localStorage `amc_filt_<id>` · โชว์ badge จำนวนตัวกรองที่ active. CSS `.filterbar*` อยู่ในบล็อก override ท้าย styles.css.
- **ใช้:** `import FilterBar from "./FilterBar"` → ครอบแถว `.cat-filter` เดิม: `<FilterBar id="<เมนู>" count={activeCount}>...แถวชิป/DateRangeBar/creator...</FilterBar>` · เก็บ header/ปุ่มสร้าง/ช่องค้นหา (`.cat-search`) **ไว้นอก** FilterBar (เห็นตลอด).
- **activeCount** = นับตัวกรองที่ไม่ default (statusF!=="all" + typeF + teamF + vatF + byPerson ฯลฯ). **ห้ามนับช่วงวันที่ที่ default = 6 เดือน** (`defaultDocRange()` คืน from มีค่า → badge จะติด 1 ตลอด) — เมนูที่ dateR default 6 เดือน (BOQ/Quote/Invoice/Receipt/Billing/PO) ให้ตัด date ออกจาก count หรือเทียบ `!==defaultDocRange()`; เมนูที่ date default ว่าง (JobOrders/Expenses) นับ `(dateFrom||dateTo)` ได้.
- **ทำแล้ว 9 เมนู:** boq, quote, invoices, receipts, billing, joborders, po, expenses-mine, expenses-approve, payables. เมนูที่มีแค่ค้นหา (Suppliers/Customers/StockCount ฯลฯ) ยังไม่ทำ (ยุบช่องค้นหาเดี่ยวไม่คุ้ม) — เพิ่มได้ถ้าเจ้าของขอ.
- **ยังไม่ได้ทำ (เฟสถัดไปถ้าขอ):** เมนูอื่นที่มีตัวกรอง เช่น Movements/WebOrders/Subcontractor/StockCount. ดู [[doc-lifecycle]] ตัวกรองผู้สร้าง.
