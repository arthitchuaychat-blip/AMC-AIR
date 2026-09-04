// ผังหมวดค่าใช้จ่าย/ต้นทุน (2 ชั้น) — หมวด + รายการย่อย(สินทรัพย์) + ประเภท (cost/opex)
// ปรับรายการรถ/สถานที่/เบอร์ ได้ที่นี่ที่เดียว (frontend config — ไม่ต้องแตะ DB)

const VEHICLES = ["NISSAN 4ฒธ4666", "TOYOTA 3ฒษ3205", "TOYOTA 4ฒข5167", "TOYOTA 4ฒฆ2679", "SUZUKI 4ฒฌ2292"];
export const ASSET_GROUPS = {
  vehicle: VEHICLES,
  vehiclePlus: [...VEHICLES, "รถหัวหน้าช่าง"],
  loc3: ["บ้าน 123/43", "ออฟฟิศ 93/97", "บ้านพักช่าง"],
  loc2: ["บ้าน 123/43", "ออฟฟิศ 93/97"],
  rent: ["ออฟฟิศ 93/97", "บ้านพักช่าง"],
  phone: ["099-262-9090", "066-067-7955", "061-961-5423", "099-129-9060", "094-959-7955", "063-356-4193"],
};

// kind: 'cost' = ต้นทุนงาน (ควรผูกใบงาน) · 'opex' = ค่าใช้จ่ายดำเนินงาน (ค่าส่วนกลาง)
// assets: ชื่อกลุ่มใน ASSET_GROUPS (ถ้ามี = โชว์ช่อง "รายการย่อย")
export const EXPENSE_CATS = [
  { name: "วัสดุ/อะไหล่/เครื่องเข้างาน", kind: "cost", icon: "🧊" },
  { name: "ค่าจัดส่งวัสดุเข้างาน", kind: "cost", icon: "🚚" },
  { name: "ค่าจัดส่งสินค้า(แอร์)ให้ลูกค้า", kind: "cost", icon: "🚚" },
  { name: "ค่าเช่า", kind: "opex", icon: "🏠", assets: "rent" },
  { name: "ค่าน้ำ", kind: "opex", icon: "💧", assets: "loc3" },
  { name: "ค่าไฟ", kind: "opex", icon: "⚡", assets: "loc3" },
  { name: "ค่าอินเทอร์เน็ต", kind: "opex", icon: "🌐", assets: "loc2" },
  { name: "ค่ามือถือ", kind: "opex", icon: "📱", assets: "phone" },
  { name: "ค่าผ่อนรถ", kind: "opex", icon: "🚗", assets: "vehicle" },
  { name: "ค่าน้ำมัน", kind: "opex", icon: "⛽", assets: "vehiclePlus" },
  { name: "ค่าอาหาร", kind: "opex", icon: "🍚" },
  { name: "ค่าวัสดุสำนักงาน", kind: "opex", icon: "🗂" },
  { name: "ค่าจัดส่งเอกสาร", kind: "opex", icon: "✉️" },
];
export const CAT_BY_NAME = Object.fromEntries(EXPENSE_CATS.map((c) => [c.name, c]));

export const PAY_METHODS = [
  ["reimburse", "🙋 สำรองจ่าย", "พนักงานควักก่อน บริษัทคืนทีหลัง"],
  ["petty", "💵 เงินสดย่อย", "จ่ายจากกล่องเงินสดย่อย"],
  ["direct", "🏦 จ่ายผู้ขายตรง", "โอนจากบัญชีบริษัทตรงไปผู้ขาย"],
];
export const PAY_LABEL = Object.fromEntries(PAY_METHODS.map(([k, l]) => [k, l]));
export const KIND_LABEL = { cost: "🔧 ต้นทุนงาน", opex: "🏢 ค่าใช้จ่าย" };

// ประเภทจริง: เป็นต้นทุนงานถ้าหมวดเป็น cost หรือผูกใบงาน · ไม่งั้นเป็นค่าใช้จ่ายดำเนินงาน
export const kindOf = (catName, jobNo) => (CAT_BY_NAME[catName]?.kind === "cost" || jobNo ? "cost" : "opex");
