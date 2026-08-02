---
name: i18n-burmese
description: ระบบสลับภาษาไทย↔พม่า (แรงงานพม่า) — โครงสร้าง i18n + ใครใช้ได้ + วิธีขยายไปหน้าใหม่
metadata:
  type: project
---

แอปมีระบบสลับภาษา **ไทย↔พม่า** (မြန်မာ) สำหรับพนักงานแรงงานพม่า — ไม่ใช่ i18n framework ทั่วไป แต่เป็นเลเยอร์เฉพาะกิจ.

**แกนกลาง `app/src/lib/i18n.js`:** `LangContext` (React context, default "th") + `useLang()` hook · `tr(lang,th,my)` · แมพคำแปล `*_MY` ที่ key ตรงกับ constant เดิม (JOB_STATUS_MY, LEAVE_MY, LV_STATUS_MY, NAV_MY, SLIP_MY, QR_MY) · `buildJobBriefMy()`. **API แปลสด** `app/api/translate.js` (Google Translate, auth-gated) → ใช้ผ่าน `translateText()` (TeamChat แปลข้อความแชตสด).

**สวิตช์ภาษา อยู่ใน `App.jsx`:** state `lang` เก็บ localStorage `amc_lang` · **gate: `canBurmese = role∈{tech, assistant, lead_tech, maid}`** (v532 เพิ่ม maid) · `effLang = canBurmese ? lang : "th"` · ปุ่ม ไทย/မြန်မာ โผล่เมื่อ canBurmese · `LangContext.Provider value={effLang}` ครอบทั้งแอป · nav label overlay `NAV_MY[id]` เมื่อ effLang==="my". **ออฟฟิศ/หลังบ้านเป็นไทยเสมอ.**

**แพตเทิร์นการ wire หน้าใหม่ (ทำตาม Attendance.jsx):**
```js
import { useLang } from "../lib/i18n";
const lang = useLang();
const L = (th, my) => (lang === "my" ? my : th);   // ไทย=default, ไทยเป็น arg แรกเสมอ
// ครอบทุกสตริงที่ผู้ใช้เห็น: <button>{L("บันทึก","သိမ်းရန်")}</button>, placeholder, title, option, flash(), confirmDialog()
// แมพป้าย (STATUS/PRIO ฯลฯ): เพิ่ม my คู่ th แล้ว render lang==="my"?x.my:x.th
```
เรียก `useLang()` แยกในทุก sub-component ที่มีสตริงไทยได้ (เป็น hook ปกติ). **ห้ามครอบ:** comment, className, key, ค่าข้อมูล (ชื่อคน/ลูกค้า), ค่าที่บันทึกลง DB (เช่น task title prefill, ชื่อห้องแชต default).

**หน้าที่แม่บ้าน (maid) เห็น 5 เมนู:** แชตทีม(landing)/กระดานงาน/เข้างาน-ลา/คู่มือ/เบิกจ่าย. **สถานะแปล (v532, 2026-08-02):**
- ✅ แปลครบ: Attendance (เดิม), MyJobs (เดิม, ช่าง), **TaskBoard, Expenses, TeamChat chrome, Handbook** (ทำใหม่ v532)
- TeamChat: chrome แปลแล้ว + ข้อความแชตแปลสด (translateText) เดิม
- **ChatDock ข้าม** — ซ่อนบนมือถืออยู่แล้ว (แม่บ้านใช้มือถือ)
- **Handbook คู่มือ:** เนื้อหา SOP ภาษาพม่าอยู่ใน `lib/handbook.js` → `ROLE_GUIDE_MY` (ตอนนี้มีแค่ `maid` เต็ม + `th_my`). Handbook.jsx merge `{...ROLE_GUIDE[sel], ...ROLE_GUIDE_MY[sel]}` เมื่อ lang==="my" (ช่องไม่มี=fallback ไทย) + chrome แปลด้วย L(). **ตำแหน่งอื่นยังเป็นไทย** (แม่บ้านไม่ค่อยอ่าน) — เพิ่มได้โดยเติม entry ใน ROLE_GUIDE_MY. **พิมพ์ PDF ยังเป็นไทยเสมอ** (ฟังก์ชันออฟฟิศ — footer บอกผู้ใช้แล้ว).

**ข้อควรรู้:** คำแปลพม่าเป็น machine-assisted (header i18n.js เตือนให้เจ้าของภาษา proofread ก่อนใช้หนัก). ไม่มีคอลัมน์ภาษาใน DB — เก็บ localStorage อย่างเดียว (ถ้าจะ per-user ข้ามเครื่องต้องเพิ่มคอลัมน์ profiles + migration). ดู [[permissions-system]] เรื่อง role.
