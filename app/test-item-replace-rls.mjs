// รายการในเอกสารซ้ำทุกครั้งที่กดบันทึก (เจ้าของแจ้ง: แก้ใบเสนอราคาแล้วรายการงอกเรื่อย ๆ)
//
// ต้นเหตุ 2 อย่างชนกัน:
//   · mig 156 แตก policy "for all" → delete = admin เท่านั้น และเผลอใช้กับ "ตารางลูก" ด้วย
//     (boq_items / quotation_items) ทั้งที่การลบบรรทัดตอนแก้เอกสาร ≠ การลบเอกสารถาวร
//   · mig 157 ทำ replace_*_items เป็น security invoker → RLS มีผลกับ delete ข้างใน
//   ⇒ คนที่ไม่ใช่ admin: delete โดน RLS กรองทิ้งเงียบ (0 แถว ไม่ error) แล้ว insert ผ่าน = รายการซ้ำทวีคูณ
//
// กฎที่ต้องคงไว้: หัวเอกสาร (boqs/quotations/invoices/receipts/billing_notes) ลบถาวรได้เฉพาะ admin
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const mig = fs.readFileSync("../supabase/migrations/173_fix_item_replace_duplicates.sql", "utf8");

console.log("\nรายการเอกสารซ้ำตอนบันทึก (RLS ลบไม่ติด):");

// ---------- สิทธิ์ลบของตารางลูก = สิทธิ์แก้ ----------
for (const [th, pol, tbl] of [["BOQ", "boqi_write_del", "boq_items"], ["ใบเสนอราคา", "qti_write_del", "quotation_items"]]) {
  const re = new RegExp(`create policy ${pol} on ${tbl} for delete to authenticated\\s*\\n\\s*using \\(my_role\\(\\) in \\('admin','sales','exec','finance','hr'\\)\\)`);
  check(`${th}: ตารางลูกลบบรรทัดได้เท่าที่แก้ได้ (${tbl})`, re.test(mig),
    "ถ้า delete ยังเป็น admin อย่างเดียว คนอื่นบันทึกแล้วรายการซ้ำเหมือนเดิม");
}

// ---------- RPC ต้องล้มถ้าลบไม่ติด ไม่ใช่เขียนซ้ำเงียบ ๆ ----------
for (const [th, fn, tbl, col] of [
  ["BOQ", "replace_boq_items", "boq_items", "boq_no"],
  ["ใบเสนอราคา", "replace_quotation_items", "quotation_items", "quote_no"],
]) {
  const body = mig.slice(mig.indexOf(`create or replace function ${fn}`), mig.indexOf("$fn$;", mig.indexOf(`create or replace function ${fn}`)));
  check(`${th}: ${fn} ลบก่อนเขียนใหม่`, new RegExp(`delete from ${tbl} where ${col} = p_`).test(body));
  check(`${th}: ${fn} ล้มถ้าลบไม่ติด (กันรายการซ้ำ)`,
    new RegExp(`if exists \\(select 1 from ${tbl} where ${col} = p_`).test(body) && /raise exception/.test(body),
    "ไม่เช็ก = RLS บล็อก delete แล้ว insert ต่อ กลายเป็นรายการซ้ำโดยไม่มี error");
  check(`${th}: ${fn} ยังเป็น security invoker (ไม่เปิดช่องข้ามสิทธิ์)`, /security invoker/.test(body));
}

// ---------- ห้ามแตะสิทธิ์ลบของ "หัวเอกสาร" (กติกาบ้าน: ลบถาวร = ธุรการเท่านั้น) ----------
const docTables = ["boqs", "quotations", "invoices", "receipts", "billing_notes"];
const touched = docTables.filter((t) => new RegExp(`on ${t} for delete`).test(mig));
check("ไม่แตะสิทธิ์ลบถาวรของหัวเอกสาร", touched.length === 0,
  `แตะ: ${touched.join(", ")} — กติกาบ้านคือลบถาวรได้เฉพาะ admin`);

// ---------- ล้างของซ้ำที่เกิดไปแล้ว ต้องเทียบเนื้อหาครบ ไม่ใช่ลบมั่ว ----------
check("มีคำสั่งล้างรายการซ้ำที่เกิดไปแล้ว", /row_number\(\) over/.test(mig) && /rn > 1/.test(mig));
for (const [th, tbl, keys] of [
  ["ใบเสนอราคา", "quotation_items", ["quote_no", "qty", "unit_price"]],
  ["BOQ", "boq_items", ["boq_no", "qty", "unit_cost"]],
]) {
  const blk = mig.slice(mig.indexOf(`from ${tbl}\n)`) - 700, mig.indexOf(`from ${tbl}\n)`));
  check(`${th}: ล้างซ้ำเทียบจำนวน+ราคาด้วย (บรรทัดที่ตั้งใจซ้ำแต่ต่างจำนวนต้องไม่ถูกลบ)`,
    keys.every((k) => blk.includes(k)), `ขาดคีย์: ${keys.filter((k) => !blk.includes(k)).join(", ")}`);
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
