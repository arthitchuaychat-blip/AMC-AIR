---
name: customer-chat
description: เมนูแชตลูกค้า (LINE+FB) — พักก่อนส่ง, แจ้งเตือนผู้รับผิดชอบ, และแผนยกระดับให้เหมือน LINE
metadata:
  type: project
---

เมนู **"แชตลูกค้า"** (เดิม "แชต LINE", เปลี่ยนชื่อ v548) id `chat` = [Chat.jsx](app/src/components/Chat.jsx) · 3 แท็บ: LINE / Facebook / 🏭 ซัพฯ (ซัพ = ตาราง line_contacts kind=supplier). แบ็กเอนด์: `app/api/line-webhook.js` (รับ+บอท AI), `line-send.js` (ส่ง push), `fb-webhook.js`/`fb-send.js`. ตาราง `line_contacts`/`line_messages`/`line_contact_customers`, `fb_contacts`/`fb_messages`, `quick_replies`. **ส่งทุกข้อความผ่าน LINE push API** (กินโควตา ไม่มีตัวนับ). ดู [[ai-line-bot]] [[line-oa-chat]] [[notifications]].

**พักก่อนส่ง (v549-550, 2026-08-02).** เดิมเลือกรูป/ไฟล์/การ์ดสินค้า/เอกสาร = **ส่งทันที**. เปลี่ยนเป็น **"พักไว้ในช่องแชต ตรวจแล้วค่อยกดส่ง"**: state `pending` [{type:'image'|'file',url,name}] + `uploading` · `onImage`/`onFile` push เข้า pending (multiple), `send()` ส่ง text+qrPendImgs+pending ตามลำดับ · การ์ดสินค้า `sendChatCart` → รูปสินค้า+ตารางราคาเข้า pending, โบรชัวร์เข้า text (ปุ่ม "📎 แนบเข้าแชต") · เอกสาร: `captureDocToStage()` ใน [lib/sendDoc.js](app/src/lib/sendDoc.js) คืน {attachments,text} (image→pending รูปทุกหน้า, pdf→ลิงก์เข้า text) แทน sendDocFromNode · **emoji picker** (ปุ่ม 😀, ใช้ Emoji รุ่นเก่า) แยกจากสติกเกอร์.

**แจ้งเตือนผู้รับผิดชอบ + เปิด FB (v550).** เดิม `notifyCustomerChat` (line-webhook) แจ้ง sales/admin/exec ตาม role เท่านั้น — เพิ่ม **assigned_to ของแชตนั้น** เข้า recipient เสมอ (คนดูแลลูกค้าได้เตือนแม้ role ปิด). **FB inbound เดิมไม่แจ้งเตือนเลย** → เพิ่ม `notifyFbChat` (fb-webhook, mirror LINE: role+assigned_to, bell+web push, ref_type "fb"). fb_contacts มี assigned_to (mig 043). (openNotif ยัง focus FB ไม่ได้ — เข้าเมนูแชตเฉย ๆ, รอเฟส FB parity).

**ค้างทำ (แผนยกระดับให้เหมือน LINE ที่เจ้าของขอ):** เฟส 4 ยก FB ใกล้ LINE (reply/ค้นหา/realtime/stage) · เฟส 5 ปุ่ม quick-reply native ให้ลูกค้ากด · เฟส 6 โน้ต/แท็กผู้ติดต่อ (มี migration). **ทำไม่ได้ (ข้อจำกัด LINE OA):** typing indicator, read receipt, unsend, ส่งไฟล์เนทีฟ (ได้แค่ลิงก์).
