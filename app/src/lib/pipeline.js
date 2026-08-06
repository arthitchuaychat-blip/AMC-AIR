// ท่อขาย + แหล่งที่มาลูกค้า — นิยามกลาง (ใช้ร่วม Pipeline.jsx + Customers.jsx) · mig 199
// stage อยู่บน customers.stage · source บน customers.source

// ขั้นท่อขาย: value / ป้ายไทย / สี badge / เป็นขั้น "ปิดจบ" หรือไม่
export const PIPE_STAGES = [
  { v: "new",     t: "ผู้สนใจใหม่",   c: "b-grey",  emoji: "✨" },
  { v: "contact", t: "กำลังติดต่อ",  c: "b-blue",  emoji: "📞" },
  { v: "survey",  t: "นัด/สำรวจ",    c: "b-amber", emoji: "📐" },
  { v: "quote",   t: "เสนอราคาแล้ว", c: "b-orange",emoji: "📝" },
  { v: "won",     t: "ปิดการขาย",    c: "b-green",  emoji: "✅", done: true },
  { v: "lost",    t: "ไม่ปิด",       c: "b-red",    emoji: "❌", done: true },
];
export const STAGE_BY = Object.fromEntries(PIPE_STAGES.map((s) => [s.v, s]));
// ขั้นที่ยังอยู่ในท่อ (ยังไม่จบ) — ใช้คิดมูลค่าท่อขายรวม
export const OPEN_STAGES = PIPE_STAGES.filter((s) => !s.done).map((s) => s.v);

// ช่องทางที่มาของลูกค้า (วัด ROI ต่อช่องทาง)
export const PIPE_SOURCES = [
  "LINE", "Facebook", "ป้าย/รถแห่", "แนะนำ/บอกต่อ", "โฆษณา (ยิงแอด)",
  "เว็บไซต์", "Walk-in", "โทรเข้า", "ลูกค้าเก่า", "อื่นๆ",
];
