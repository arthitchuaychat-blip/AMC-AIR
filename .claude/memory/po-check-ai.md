---
name: po-check-ai
description: AI ตรวจใบส่งของ/บิลผู้ขาย เทียบกับใบสั่งซื้อ (PO) — endpoint po-check.js + PoCheckModal ในหน้า PO
metadata:
  type: project
---

ฟีเจอร์ (v656): ให้ AI อ่าน "ใบส่งของ/บิลผู้ขาย" (รูปที่แนบใน PO) แล้วเทียบราคา/จำนวนกับใบสั่งซื้อทีละบรรทัด — กันจ่ายเกิน/รับผิด. เป็นการใช้ Claude vision ตัวที่ 2 (ต่อจาก [[boq-ai-draft]]).

**Endpoint `app/api/po-check.js`** (POST, office JWT roles `admin/exec/finance/stock`, `maxDuration 120`):
- รับ `{ poNo }` · **โหลด PO + po_items ฝั่งเซิร์ฟเวอร์เอง** (ข้อมูลจริง ไม่เชื่อ client): `purchase_orders`(supplier,vat,dn_no,sup_inv_no,attachments) + `po_items`(material_code,qty,price,unit) + ชื่อจาก `materials`.
- รูปใบส่งของ = `po.attachments[]` (แต่ละตัว `{url,name}` หรือ string) → base64 (≤6 ไฟล์, PDF ≤24MB/รูป ≤5MB) · ถ้าไม่มีไฟล์ → คืน error ให้แนบก่อน.
- Claude `claude-sonnet-5` effort **low** max_tokens 8000 · system=กติกาตรวจ · user=[รูป..., ข้อความรายการ PO].
- คืน JSON `{summary, rows:[{name,poQty,poPrice,docQty,docPrice,status,note}], extraInDoc:[], docTotal, poTotal, totalDiff, diffCount, diag}`.
- **status**: ok / price_diff / qty_diff / missing_in_doc · **ผูกค่า PO จริงกลับเข้าแต่ละแถวเอง** (จับคู่แถว AI ตามลำดับ+ชื่อ looseMatch กัน AI แต่งเลข PO) · extraInDoc = มีในใบแต่ไม่มีใน PO.
- parseLooseJson เหมือน boq-ai (กู้ JSON ถูกตัด).

**UI `PurchaseOrders.jsx`**: ปุ่ม "🤖 AI ตรวจใบส่งของ" บนการ์ด PO (โชว์เมื่อ `po.attachments.length>0`) → `PoCheckModal` (auto-run ตอนเปิด · `aiCheckPo(poNo)` ใน api.js):
- แบนเนอร์เขียว "✅ ตรงกันทั้งหมด" / เหลือง "⚠️ พบ N จุด" · ตารางแต่ละบรรทัดสีตาม status (ST_META) · กล่องแดง extraInDoc · เทียบยอดรวมก่อน VAT · ปุ่ม "แก้ราคา/จำนวนใน PO" → startEdit(po).

**หมายเหตุ:** ราคา PO = ต่อหน่วยก่อน VAT · ถ้าบิลรวม VAT แล้ว AI จะทักใน note (คนละฐาน อย่าตัดสินผิดทันที). CSS หน้านี้ใช้ `modal-overlay/modal-title/modal-x` (ไม่ใช่ modal-back/.x).

Flow เอกสารซื้อ: สั่งในแชต LINE → คีย์ PO → ผู้ขายส่งของ+ใบส่งของ(แนบรูป) → รับของ → จ่าย. จุดพลาด = PO คีย์ ≠ บิลจริง → ฟีเจอร์นี้จับ.

Follow-up (เจ้าของเลือกทำ A ก่อน): B=ตรวจเชิงกฎ (ไม่แนบใบส่งของ, จำนวนรับ≠สั่ง, ราคาเกินต้นทุน, PO ซ้ำ) · C=เทียบ PO กับที่สั่งในแชต.
