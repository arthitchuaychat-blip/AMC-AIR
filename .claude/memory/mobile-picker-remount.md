---
name: mobile-picker-remount
description: กับดัก "Android เลือกรูปแล้วเด้งออก/รูปหาย" — หน้าใดที่โหลดใหม่ตอน visibilitychange แล้วถอดรายการออกจากจอระหว่าง loading จะทำลายฟอร์มแนบไฟล์ที่ผู้ใช้กำลังใช้ (Android เปิดตัวเลือกรูปเป็นแอปแยก) · วิธีแก้แบบ silent refresh + ร่างใน sessionStorage · ใช้เช็กหน้าอื่นก่อนเพิ่ม reload-on-focus
metadata:
  type: feedback
---

**อาการ (18 ก.ย. 2026, v855):** ช่างมือถือ Android พิมพ์ข้อความใน "ความเคลื่อนไหว" ของใบงานได้ แต่เลือกรูปแล้ว "เด้งออก" รูปไม่ขึ้น · iPhone/คอมไม่เป็น · `client_errors` ไม่มี error จาก Android เลย

**สาเหตุ:** `MyJobs.jsx` มี `visibilitychange → visible → load(true)` และตอน `loading` render เป็น `(!loading ? shown : []).map(...)` = **ถอดการ์ดงานทั้งหมดออกจากจอ** → `JobTimeline` → `Composer` (state `photos`/`note` + อัปโหลดที่กำลังวิ่ง) ถูกทำลาย. Android เปิดตัวเลือกรูป/กล้องเป็น activity แยก → หน้าเว็บ hidden → กลับมา visible พร้อม event `change` ของ input = โหลดใหม่ทันที. iOS/เดสก์ท็อปตัวเลือกรูปไม่ซ่อนหน้า · พิมพ์ข้อความไม่ออกจากหน้า → ไม่เป็น.

**Why:** ไม่ใช่โค้ดพัง จึงไม่มี error ให้จับ — ต้องคิดจาก "อะไรถูก unmount ตอนกลับเข้าแอป". **เบาะแสที่ใช้ได้อีก:** เป็นเฉพาะ Android + เฉพาะการกระทำที่ต้องสลับแอป (รูป/กล้อง/ไฟล์) + client_errors ว่าง.

**How to apply:**
- ห้ามผูก reload-on-visibility/focus กับ `setLoading(true)` ที่ถอด UI ออก ถ้าหน้านั้นมีฟอร์ม/แนบไฟล์อยู่ข้างใน → ใช้ **silent refresh**: `load(force, silent)` · `quiet = silent && listRef.current.length > 0` → ไม่ setLoading, พลาดก็เก็บรายการเดิม (เน็ตหน้างานสะดุดบ่อย) · การ์ดต้องมี key คงที่ (job_no) state ลูกจึงอยู่รอด
- ฟอร์มที่ช่างใช้บนมือถือ: เก็บร่างใน `sessionStorage` (`amc_tl_draft:<jobNo>:<parentId>` = note + URL รูปที่อัปแล้ว) + จำการ์ดที่กาง (`amc_myjobs_expanded`) — กันกรณีมือถือ RAM น้อย **ปิดแท็บทิ้ง** ตอนสลับไปกล้อง แล้วโหลดหน้าใหม่ทั้งหน้า (กรณีนี้แก้ด้วย silent refresh ไม่ได้)
- ตัวฟัง visibility/focus ทั้งแอป ณ v855: `App.jsx` (เช็กบันเดิลใหม่ + รีเฟรช profile — ไม่ remount เพราะ deps เป็น primitive), `MyJobs.jsx` (แก้แล้ว), `TaskReminder.jsx`, `lib/visiblePolling.js` · ก่อนเพิ่มตัวใหม่ให้เช็กว่ามัน unmount อะไร
- suite `test-myjobs-photo-bounce.mjs` (9 ข้อ) · ค้างดูต่อ: `client_errors` มี `Cannot read properties of null (reading 'clientWidth')` 9 ครั้งบนเดสก์ท็อป (v848–v853) ยังไม่ได้ไล่
