import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { deriveJobStatus } from "./schedule";
import { ROLE_LABEL } from "./permissions";

// HR position = the role assigned in Settings (single source of truth), falling back to any legacy free-text department
const posLabel = (p) => (p && (ROLE_LABEL[p.role] || p.department)) || "";

const _url = import.meta.env.VITE_SUPABASE_URL;
const _anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ---------- แคชระดับแอป: กันดึงซ้ำเวลาสลับเมนูไป-มา ----------
// เก็บ "โปรมิส" เพื่อรวมคำขอที่ยิงพร้อมกันเป็นครั้งเดียว (dedupe) · ล้มแล้วไม่แคชความล้มเหลว
// 2 ชั้นอายุ: ยาว = ตารางแทบไม่เปลี่ยน (company/teams/materials-lite) · สั้น = ลิสต์เอกสารที่เปลี่ยนบ่อย
// ⚠️ ความถูกต้อง: "เขียนตารางไหนก็ตาม" ล้างแคชสั้นทั้งชั้นอัตโนมัติ ผ่านตัวดักที่ supabase.from()
//    ด้านล่าง — over-bust ปลอดภัย (แค่โหลดใหม่) · กันลืม bust รายจุด ~90 ทางเขียน (เซฟแล้วลิสต์ค้าง)
const _CACHE_TTL = 5 * 60 * 1000; // ยาว: 5 นาที
const _SHORT_TTL = 45 * 1000;     // สั้น: 45 วินาที (ลิสต์เอกสาร — แก้ที่เครื่องอื่นเห็นช้าสุด 45 วิ)
const _cache = new Map();  // key -> { at:number, p:Promise, ttl:number }
function bustCache(key) { if (key) _cache.delete(key); else _cache.clear(); }
// ล้างเฉพาะแคช "สั้น" (ลิสต์เอกสาร) — เรียกอัตโนมัติทุกครั้งที่มีการเขียนตาราง
function bustShort() { for (const [k, v] of _cache) { if (v.ttl === _SHORT_TTL) _cache.delete(k); } }
function _cached(key, loader, ttl = _CACHE_TTL) {
  const hit = _cache.get(key);
  if (hit && (Date.now() - hit.at) < hit.ttl) return hit.p;
  const p = loader().catch((e) => { _cache.delete(key); throw e; }); // ล้มแล้วอย่าแคชความล้มเหลว
  _cache.set(key, { at: Date.now(), p, ttl });
  return p;
}

// ตัวดักการ "เขียน" ทุกตารางผ่าน supabase.from(...).{insert,update,upsert,delete}
// → ล้างแคชลิสต์สั้นทันที เพื่อให้ผู้ใช้เห็นผลการแก้ของตัวเองทันที (ไม่ต้องไล่ bust รายฟังก์ชัน)
// อ่าน (.select) ไม่ถูกแตะ จึงไม่ล้างแคชโดยไม่จำเป็น
(function installWriteBust() {
  if (!supabase || supabase.__writeBust) return;
  const rawFrom = supabase.from.bind(supabase);
  supabase.from = (table) => {
    const b = rawFrom(table);
    for (const m of ["insert", "update", "upsert", "delete"]) {
      const orig = b[m];
      if (typeof orig === "function") {
        b[m] = (...args) => { try { bustShort(); } catch (_) {} return orig.apply(b, args); };
      }
    }
    return b;
  };
  // RPC ที่เขียนข้อมูล (set_job_status, replace_quotation_items, set_receipt_flowaccount ฯลฯ)
  // เลี่ยงตัวดัก .from() → ต้องล้างแคชด้วย · RPC ที่เป็น read แค่ over-bust (ปลอดภัย โหลดใหม่เฉย ๆ)
  const rawRpc = supabase.rpc.bind(supabase);
  supabase.rpc = (...args) => { try { bustShort(); } catch (_) {} return rawRpc(...args); };
  supabase.__writeBust = true;
})();

// default icon per category (materials table doesn't store an icon)
const CAT_ICON = { pipe: "pipe", fit: "elbow", ref: "tank", ins: "foam", wire: "wire", elec: "breaker" };

// enrich a raw material row with display color + icon from its category
function enrich(m, catMap) {
  const c = catMap[m.category] || {};
  return {
    ...m,
    code: m.code,
    th: m.name_th,
    en: m.name_en,
    cat: m.category,
    catName: c.name_th || m.category,
    color: c.color || "#64748b",
    icon: CAT_ICON[m.category] || "couple",
    cost: Number(m.cost),
    salePrice: Number(m.sale_price) || 0,
    description: m.description || "",
    photoUrl: m.photo_url || null,
    kind: String(m.kind || "material").trim().toLowerCase(),  // normalize: stray space/case in stored kind broke tab filtering
    brand: m.brand || null,
    btu: m.btu || null,
    ac_type: m.ac_type || null,
    tracked: m.tracked !== false,
    webPublished: m.web_published === true,
    minStock: Number(m.min_stock),
    stock: Number(m.current_stock ?? m.init_stock ?? 0),
    purchaseUnit: m.purchase_unit || null,               // หน่วยซื้อ (เช่น ม้วน) — ว่าง = ซื้อหน่วยเดียวกับขาย
    purchaseQty: Number(m.purchase_qty) || 0,            // 1 หน่วยซื้อ = กี่หน่วยหลัก (เช่น 15)
  };
}

// ---------- ข้อมูลค่าจ้าง/เลขบัตร (hr_pay — mig 154) ----------
// แยกออกจาก profiles เพราะ RLS ล็อกรายคอลัมน์ไม่ได้ · RLS ของ hr_pay = เจ้าตัว + admin/exec/hr/finance
// คืน null = ยังไม่ได้รัน migration 154 → ให้ผู้เรียกใช้คอลัมน์เดิมใน profiles ต่อไปก่อน
const _HR_PAY_COLS = "user_id,pay_type,base_pay,ot_rate,sso,citizen_id,tax_wht";
async function _payByUser(ids) {
  const build = (cols) => { let q = supabase.from("hr_pay").select(cols); if (ids?.length) q = q.in("user_id", ids); return q; };
  let { data, error } = await build(_HR_PAY_COLS);
  // ยังไม่รัน mig 161 → ถอย tax_wht ออก ไม่งั้นหน้า HR/เงินเดือนของฉันพังทั้งหน้า
  if (error && /tax_wht/i.test(error.message || "")) ({ data, error } = await build(_HR_PAY_COLS.replace(",tax_wht", "")));
  if (error) return null;
  return Object.fromEntries((data || []).map((r) => { const { user_id, ...rest } = r; return [user_id, rest]; }));
}

// ⚠️ ห้ามเดา role เมื่ออ่านโปรไฟล์ไม่สำเร็จ — เดิม fallback เป็น "tech" เงียบ ๆ
// เน็ตสะดุดตอนเปิดแอปครั้งเดียว ผู้บริหาร/ธุรการจะกลายเป็นช่าง เมนูหายเกือบหมด
// แล้วผู้ใช้คิดว่าสิทธิ์ถูกแก้ ทั้งที่แค่โหลดพลาด ⇒ อ่านไม่ได้ = โยน error ให้หน้าจอบอกให้ลองใหม่
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error && error.code !== "PGRST116") throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ — ลองใหม่อีกครั้ง (" + (error.message || error.code) + ")");
  if (data) { const pay = await _payByUser([user.id]); if (pay) data = { ...data, ...(pay[user.id] || {}) }; }
  // ไม่มีแถวจริง (PGRST116) = ผู้ใช้ใหม่ที่ยังไม่ถูกตั้งตำแหน่ง → ช่าง เป็นค่าเริ่มต้นที่ถูกต้อง
  return data || { id: user.id, email: user.email, role: "tech", name: user.email };
}
// ใช้เมื่อ "รู้ว่าใครทำ" เป็นแค่ข้อมูลประกอบ ไม่ใช่ตัวตัดสินสิทธิ์ — อ่านพลาดแล้วเดินต่อได้
async function _meSafe() { try { return await getProfile(); } catch { return null; } }

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  return supabase.auth.signOut();
}

const CAT_PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#d97706", "#ea580c", "#16a34a", "#db2777", "#0d9488", "#ca8a04", "#4f46e5"];
export async function listCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("id");
  if (error) throw error;
  return (data || []).map((c, i) => ({ ...c, color: c.color || CAT_PALETTE[i % CAT_PALETTE.length] }));
}
export async function saveCategory(c) {
  const row = { id: c.id.trim(), name_th: c.name_th.trim(), name_en: c.name_en?.trim() || null };
  if (c.mat_group !== undefined) row.mat_group = c.mat_group || null;  // 'part' = อะไหล่ · null/'material' = วัสดุ
  let { error } = await supabase.from("categories").upsert(row, { onConflict: "id" });
  // ยังไม่รัน mig 176 → ถอย mat_group ออก ไม่งั้นบันทึกหมวดไม่ได้ทั้งระบบ
  if (error && /mat_group/i.test(error.message || "")) {
    delete row.mat_group;
    ({ error } = await supabase.from("categories").upsert(row, { onConflict: "id" }));
  }
  if (error) throw error;
}
// ตั้งกลุ่มวัสดุ/อะไหล่ให้หมวดเดียว (ใช้ในหน้าตั้งค่า — ติดป้ายครั้งเดียว)
export async function setCategoryMatGroup(id, group) {
  const { error } = await supabase.from("categories").update({ mat_group: group || null }).eq("id", id);
  if (error) throw error;
}
export async function deleteCategory(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}
// edit an existing category, including its code/id (cascades to materials via FK ON UPDATE CASCADE)
export async function updateCategory(oldId, c) {
  const { error } = await supabase.from("categories")
    .update({ id: c.id.trim(), name_th: c.name_th.trim(), name_en: c.name_en?.trim() || null })
    .eq("id", oldId);
  if (error) throw error;
}

// auto color palette so teams get distinct chart colors without storing one
const TEAM_PALETTE = ["#2563eb", "#f97316", "#16a34a", "#9333ea", "#0891b2", "#db2777", "#ca8a04", "#0d9488"];
export function listTeams() {
  return _cached("teams", async () => {
    const { data, error } = await supabase.from("teams").select("*").order("id");
    if (error) throw error;
    return (data || []).map((t, i) => ({ ...t, color: t.color || TEAM_PALETTE[i % TEAM_PALETTE.length] }));
  });
}

// ---------- AC brands + BTU lists (managed, for filtering) ----------
export async function listBrands() {
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) throw error;
  return (data || []).map((b) => b.name);
}
export async function saveBrand(name) {
  const { error } = await supabase.from("brands").upsert({ name: name.trim() }, { onConflict: "name" });
  if (error) throw error;
}
export async function deleteBrand(name) {
  const { error } = await supabase.from("brands").delete().eq("name", name);
  if (error) throw error;
}
export async function listBtus() {
  const { data, error } = await supabase.from("btus").select("*").order("btu");
  if (error) throw error;
  return (data || []).map((b) => Number(b.btu));
}
export async function saveBtu(btu) {
  const { error } = await supabase.from("btus").upsert({ btu: Number(btu) }, { onConflict: "btu" });
  if (error) throw error;
}
export async function deleteBtu(btu) {
  const { error } = await supabase.from("btus").delete().eq("btu", Number(btu));
  if (error) throw error;
}

export async function listMaterials() {
  const cats = await listCategories();
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  // Supabase returns at most 1000 rows per request — page through until a short page so all items load
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    // ต้องมี order เสมอ — แบ่งหน้าโดยไม่มี order ลำดับไม่คงที่ระหว่างคำขอ (โดยเฉพาะ view แบบ group by)
    // → บางรายการมาซ้ำ/บางรายการหายไปเงียบ ๆ ทั้งที่ยอดรวมดูถูก (อาการนับต่อหมวดเพี้ยน)
    const { data, error } = await supabase.from("material_stock").select("*").eq("active", true).order("code").range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all.map((m) => enrich(m, catMap)).sort((a, b) => a.code.localeCompare(b.code));
}

// lightweight catalog for document item-pickers (BOQ/quotation): reads `materials` directly,
// skipping the material_stock view's transaction join/aggregation → much faster with a large catalog.
export function listMaterialsLite() {
  return _cached("materials-lite", _loadMaterialsLite);
}
async function _loadMaterialsLite() {
  const cats = await listCategories();
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const PAGE = 1000;
  const all = [];
  // ⚠️ web_published ต้องอยู่ในนี้เสมอ — ฟอร์มแก้สินค้าอ่านค่าเดิมจากลิสต์นี้ ถ้าไม่มีจะกลายเป็น false
  // แล้ว saveMaterial เขียนทับ = แก้สินค้าทีเดียวสินค้าหลุดจากเว็บขายหน้าร้านเงียบ ๆ
  const FULL = "code,name_th,name_en,kind,brand,btu,ac_type,category,unit,cost,sale_price,description,photo_url,tracked,min_stock,init_stock,power_cost_year,features,purchase_unit,purchase_qty,btu_min,btu_max,series,voltage,refrigerant,seer,pipe_size,energy_label,warranty,web_published";
  let cols = FULL;
  // ต้องมี order เสมอ — แบ่งหน้าโดยไม่มี order อาจได้แถวซ้ำ/หายระหว่างหน้า (ลำดับไม่การันตี)
  const page = (from) => supabase.from("materials").select(cols).eq("active", true).order("code").range(from, from + PAGE - 1);
  for (let from = 0; ; from += PAGE) {
    let { data, error } = await page(from);
    // pre-140 fallback: retry without the warranty column
    if (error && /warranty/i.test(error.message || "")) {
      cols = cols.replace(",warranty", "");
      ({ data, error } = await page(from));
    }
    // pre-106 fallback: retry without the AC series/spec columns
    if (error && /series|voltage|refrigerant|seer|pipe_size|energy_label/i.test(error.message || "")) {
      cols = cols.replace(",series,voltage,refrigerant,seer,pipe_size,energy_label", "");
      ({ data, error } = await page(from));
    }
    // pre-103 fallback: retry without the service BTU-range columns
    if (error && /btu_min|btu_max/i.test(error.message || "")) {
      cols = cols.replace(",btu_min,btu_max", "");
      ({ data, error } = await page(from));
    }
    // pre-098 fallback: retry without the purchase-unit columns so the pickers still load
    if (error && /purchase_unit|purchase_qty/i.test(error.message || "")) {
      cols = cols.replace(",purchase_unit,purchase_qty", "");
      ({ data, error } = await page(from));
    }
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all.map((m) => enrich(m, catMap)).sort((a, b) => a.code.localeCompare(b.code));
}

// ค่าไฟ/ปีโดยประมาณของแอร์ จาก SEER — สมมติฐานร้าน: เปิดใช้ 8 ชม./วัน ทั้งปี · ค่าไฟ 5 บาท/หน่วย
// กำลังไฟ (kW) = BTU ÷ SEER ÷ 1000 → ค่าไฟ/ปี = kW × 8 × 365 × 5 (ปัดเป็นบาทเต็ม)
export const acPowerCostYear = (btu, seer) => {
  const b = Number(btu), s = Number(seer);
  return b > 0 && s > 0 ? Math.round((b / s / 1000) * 8 * 365 * 5) : null;
};

// รุ่นแอร์ + ข้อความรับประกัน (mig 140) สำหรับ picker ในเงื่อนไขท้ายเอกสาร (DocTerms) — ดึงเบา ๆ เฉพาะฟิลด์ที่ใช้
export async function listAcWarranties() {
  const r = await supabase.from("materials").select("code,name_th,brand,series,ac_type,btu,warranty")
    .eq("kind", "ac").eq("active", true).order("brand").order("btu").order("code").limit(2000);   // แอร์ 800+ รุ่น · limit เดิม = เพดานพอดี จึงไม่ได้กันอะไร
  if (r.error && /warranty/i.test(r.error.message || "")) return [];   // ยังไม่รัน migration 140 — ซ่อน picker ไปก่อน
  if (r.error) throw r.error;
  return (r.data || []).map((m) => ({ ...m, th: m.name_th }));
}

// add or update a material (admin only — enforced by RLS)
export async function saveMaterial(row, isNew) {
  const kind = row.kind || "material";
  // สร้างใหม่ด้วยรหัสที่มีอยู่แล้ว = upsert จะทับสินค้าเดิมทั้งตัว (รวม stock ตั้งต้น) — กันไว้ก่อน
  if (isNew) {
    const { data: dup, error: de } = await supabase.from("materials").select("code").eq("code", row.code).maybeSingle();
    if (de) throw de;
    if (dup) throw new Error(`รหัส ${row.code} มีอยู่แล้ว — ใช้รหัสอื่น หรือเปิดสินค้าเดิมมาแก้ไขแทน`);
  }
  const payload = {
    code: row.code,
    name_th: row.name_th,
    name_en: row.name_en || row.name_th,
    kind,
    category: kind === "material" || kind === "service" ? (row.category || null) : null,   // บริการใช้หมวด sv-* (mig 102)
    brand: kind === "ac" ? (row.brand || null) : null,
    btu: kind === "ac" && row.btu ? Number(row.btu) : null,
    ac_type: kind === "ac" || kind === "service" ? (row.ac_type || null) : null,             // บริการติดแท็กประเภทแอร์ได้
    // บริการใช้ช่วง BTU (mig 103): ใส่ช่องเดียว = ขนาดเดียว (min = max)
    btu_min: kind === "service" && row.btu_min ? Number(row.btu_min) : null,
    btu_max: kind === "service" && (row.btu_max || row.btu_min) ? Number(row.btu_max || row.btu_min) : null,
    // สเปคแอร์รายขนาด (mig 106)
    series: kind === "ac" ? (row.series?.trim() || null) : null,
    voltage: kind === "ac" ? (row.voltage || null) : null,
    refrigerant: kind === "ac" ? (row.refrigerant?.trim() || null) : null,
    seer: kind === "ac" && row.seer ? Number(row.seer) : null,
    pipe_size: kind === "ac" ? (row.pipe_size?.trim() || null) : null,
    energy_label: kind === "ac" ? (row.energy_label || null) : null,
    warranty: kind === "ac" ? (row.warranty?.trim() || null) : null,   // การรับประกัน (mig 140) — แสดงต่อลูกค้า/บอทได้
    tracked: kind === "service" ? false : (row.tracked !== false),
    unit: row.unit,
    cost: Number(row.cost) || 0,
    sale_price: Number(row.sale_price) || 0,
    description: row.description?.trim() || null,
    photo_url: row.photo_url || null,
    min_stock: Number(row.min_stock) || 0,
    // ค่าไฟ/ปี: ถ้าไม่กรอก คำนวณอัตโนมัติจาก SEER (แอร์เท่านั้น)
    power_cost_year: (row.power_cost_year === "" || row.power_cost_year == null)
      ? (row.kind === "ac" ? acPowerCostYear(row.btu, row.seer) : null)
      : Number(row.power_cost_year),
    features: row.features?.trim() || null,
    web_published: !!row.web_published,
    purchase_unit: row.purchase_unit?.trim() || null,
    purchase_qty: Number(row.purchase_qty) > 0 ? Number(row.purchase_qty) : null,
  };
  if (isNew) payload.init_stock = Number(row.init_stock) || 0;
  let { error } = await supabase.from("materials").upsert(payload, { onConflict: "code" });
  // graceful fallback: if migration 087/098 (new columns) hasn't been run yet, the schema
  // cache rejects those columns and blocks EVERY save — retry without them so the catalog still works
  if (error && /power_cost_year|features|purchase_unit|purchase_qty|btu_min|btu_max|series|voltage|refrigerant|seer|pipe_size|energy_label|warranty/i.test(error.message || "")) {
    delete payload.power_cost_year; delete payload.features; delete payload.purchase_unit; delete payload.purchase_qty;
    delete payload.btu_min; delete payload.btu_max;
    delete payload.series; delete payload.voltage; delete payload.refrigerant; delete payload.seer; delete payload.pipe_size; delete payload.energy_label;
    delete payload.warranty;
    ({ error } = await supabase.from("materials").upsert(payload, { onConflict: "code" }));
  }
  if (error) throw error;
  bustCache("materials-lite");
}

// ---------- ข้อมูลระดับ "รุ่นแอร์" (ac_series — mig 106): คุณสมบัติ + โบรชัวร์ ใช้ร่วมทุกขนาด ----------
export async function getAcSeries(brand, name) {
  const { data, error } = await supabase.from("ac_series").select("*").eq("brand", brand || "").eq("name", name).maybeSingle();
  if (error) throw error; return data;
}
export async function saveAcSeries(row) {
  const r = { brand: row.brand || "", name: row.name, features: row.features?.trim() || null, brochure_url: row.brochure_url || null };
  const { error } = await supabase.from("ac_series").upsert(r, { onConflict: "brand,name" });
  if (error) throw error;
}
// ดึงไฟล์จากลิงก์ภายนอก (ผ่าน /api/fetch-file ฝั่งเซิร์ฟเวอร์ — เลี่ยง CORS) → ได้ File ไปอัปโหลดเก็บถาวรต่อ
export async function fetchExternalFile(url) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`/api/fetch-file?url=${encodeURIComponent(url)}`, {
    headers: { Authorization: `Bearer ${session?.access_token || ""}` },
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { msg = (await r.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const blob = await r.blob();
  const ct = r.headers.get("content-type") || "";
  const ext = /pdf/i.test(ct) || /\.pdf([?#]|$)/i.test(url) ? "pdf" : /png/i.test(ct) ? "png" : /webp/i.test(ct) ? "webp" : "jpg";
  return new File([blob], `link-file.${ext}`, { type: ct || "application/octet-stream" });
}

// โบรชัวร์รุ่น (PDF/รูป) → bucket photos สาธารณะ เก็บลิงก์ใน ac_series.brochure_url
export async function uploadBrochureFile(file) {
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `brochures/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// รายการ ac_series ทั้งหมด (คุณสมบัติ+โบรชัวร์ต่อรุ่น) — ใช้ในหน้า จัดการรูป & คุณสมบัติแอร์
export async function listAcSeriesAll() {
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("ac_series").select("*").order("brand").order("name").range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// ตั้งรูปสินค้าให้หลายรายการทีเดียว (ทุกขนาดในรุ่นใช้รูปเดียวกัน) — เช็กแถวที่อัปเดตจริง กัน RLS เงียบ
export async function setMaterialsPhoto(codes, url) {
  if (!codes || !codes.length) return;
  const CHUNK = 100;
  let touched = 0;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("materials").update({ photo_url: url || null }).in("code", slice).select("code");
    if (error) throw error;
    touched += (data || []).length;
  }
  if (!touched) throw new Error("ไม่มีรายการถูกอัปเดต (ไม่มีสิทธิ์แก้คลังสินค้า?)");
  bustCache("materials-lite");
}

// แก้เฉพาะ "คุณสมบัติ" ของสินค้ารายตัว (แอร์ที่ไม่มีซีรีส์ ใช้ materials.features แทน ac_series)
export async function setMaterialFeatures(code, features) {
  const { data, error } = await supabase.from("materials").update({ features: (features || "").trim() || null }).eq("code", code).select("code");
  if (error) throw error;
  if (!(data || []).length) throw new Error("ไม่มีรายการถูกอัปเดต (ไม่มีสิทธิ์แก้คลังสินค้า?)");
  bustCache("materials-lite");
}

// ✨ ให้ AI ร่างคุณสมบัติของรุ่นแอร์ (ผ่าน /api/ai-features ฝั่งเซิร์ฟเวอร์) — ได้ข้อความร่างมาให้ผู้ใช้ตรวจก่อนบันทึก
export async function aiDraftSeriesFeatures(brand, series, items) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/ai-features", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ brand, series, items }),
  });
  let j = null;
  try { j = await r.json(); } catch { /* non-JSON error body */ }
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j.text;
}

// ช่วยร่าง BOQ จากแบบ/รูป (Claude vision) → คืน { summary, lines:[{section,code,name,unit,qty,unit_cost,description}] }
export async function aiDraftBoq({ imageUrls = [], spec = "", brief = "" }) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/boq-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ imageUrls, spec, brief }),
  });
  let j = null; try { j = await r.json(); } catch { /* non-JSON */ }
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

// AI ตรวจใบส่งของ/บิลผู้ขาย เทียบกับ PO (โหลด PO ฝั่งเซิร์ฟเวอร์)
export async function aiCheckPo(poNo) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/po-check", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ poNo }),
  });
  let j = null; try { j = await r.json(); } catch { /* non-JSON */ }
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

// update a material's (weighted-average) unit cost — used by purchase moving average
export async function updateMaterialCost(code, cost) {
  const { error } = await supabase.from("materials").update({ cost }).eq("code", code);
  if (error) throw error;
  bustCache("materials-lite");
}

// Shrink a photo before upload so timelines/galleries don't load multi-MB originals
// (cameras produce 2–4 MB shots; many of them at once break the browser → "broken image").
// Re-encodes images to JPEG at <= maxDim px. Non-images (pdf/doc) and undecodable
// convert HEIC/HEIF → JPEG so all browsers can display the result
async function convertIfHeic(file) {
  const isHeic = file.type === "image/heic" || file.type === "image/heif" || /\.(heic|heif)$/i.test(file.name || "");
  if (!isHeic) return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const out = Array.isArray(blob) ? blob[0] : blob;
    return new File([out], (file.name || "photo").replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  } catch { return file; }
}

// resize large images before upload; unsupported formats pass through untouched.
async function downscaleImage(file, maxDim = 1600, quality = 0.82) {
  file = await convertIfHeic(file);  // HEIC → JPEG first so createImageBitmap can decode it
  try {
    if (!file.type || !file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return file;            // can't decode → keep original
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size < 600 * 1024) { bmp.close(); return file; }  // already small enough
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h); bmp.close();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;   // no win → keep original
    return new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (_) { return file; }
}

// upload a product photo to Supabase Storage (bucket "photos") -> returns public URL
export async function uploadMaterialPhoto(file, code) {
  file = await downscaleImage(file);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `materials/${(code || "m").replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// soft-delete (keep history intact)
export async function deactivateMaterial(code) {
  const { error } = await supabase.from("materials").update({ active: false }).eq("code", code);
  if (error) throw error;
  bustCache("materials-lite");
}
// bulk show/hide items on the public website (materials.web_published) for many codes at once.
// chunked: a single .in() with hundreds of codes overflows the request URL → "Bad Request".
export async function setMaterialsWebPublished(codes, published) {
  if (!codes || !codes.length) return;
  const CHUNK = 100;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const { error } = await supabase.from("materials").update({ web_published: !!published }).in("code", slice);
    if (error) throw error;
  }
  bustCache("materials-lite");
}

// bulk import (upsert by code) — admin only via RLS.
// Round-trip safe: on a RE-import, existing codes UPDATE name/price/details but KEEP their
// stock (init_stock is dropped from the update — current_stock = init_stock + movements, so
// writing back the exported on-hand would double-count). Only genuinely new codes get init_stock.
export async function bulkUpsertMaterials(rows) {
  if (!rows || !rows.length) return { inserted: 0, updated: 0 };
  // รหัสซ้ำในไฟล์เดียวกัน → เก็บแถวล่าสุด (upsert ก้อนเดียวที่มีรหัสซ้ำจะพังทั้งก้อน "cannot affect row a second time")
  const byCode = new Map(); rows.forEach((r) => { if (r.code) byCode.set(r.code, r); });
  rows = [...byCode.values()];
  const codes = [...new Set(rows.map((r) => r.code).filter(Boolean))];
  const existing = new Set();
  for (let i = 0; i < codes.length; i += 300) {
    const { data, error } = await supabase.from("materials").select("code").in("code", codes.slice(i, i + 300));
    if (error) throw error;
    (data || []).forEach((m) => existing.add(m.code));
  }
  const inserts = rows.filter((r) => !existing.has(r.code));
  const updates = rows.filter((r) => existing.has(r.code)).map(({ init_stock, ...r }) => r); // keep existing stock
  // fallback if migration 087 not run yet — strip power_cost_year/features so import still works
  const stripNew = (r) => { const { power_cost_year, features, ...rest } = r; return rest; };
  async function upsertChunked(list) {
    for (let i = 0; i < list.length; i += 500) {
      let { error } = await supabase.from("materials").upsert(list.slice(i, i + 500), { onConflict: "code" });
      if (error && /power_cost_year|features/i.test(error.message || "")) {
        ({ error } = await supabase.from("materials").upsert(list.slice(i, i + 500).map(stripNew), { onConflict: "code" }));
      }
      if (error) throw error;
    }
  }
  await upsertChunked(inserts);
  await upsertChunked(updates);
  bustCache("materials-lite");
  return { inserted: inserts.length, updated: updates.length };
}

// DANGER: clear all transactions + jobs (resets stock to init). admin only.
export async function clearAllTransactions() {
  const e1 = (await supabase.from("transactions").delete().gte("id", 0)).error;
  if (e1) throw e1;
  const e2 = (await supabase.from("jobs").delete().neq("job_no", "")).error;
  if (e2) throw e2;
}

// DANGER: delete every material. Clears everything that references materials first
// (transactions, jobs, and purchase orders → po_items via cascade). admin only.
export async function deleteAllMaterials() {
  await clearAllTransactions();
  const ep = (await supabase.from("purchase_orders").delete().neq("po_no", "")).error;
  if (ep) throw ep;
  const { error } = await supabase.from("materials").delete().neq("code", "");
  if (error) throw error;
  bustCache("materials-lite");
}

// ---------- PHASE 2: movements ----------
// record one transaction (withdraw | return | purchase | damage)
// stock updates automatically because material_stock view derives from transactions
export async function recordTransaction(t) {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    txn_date: t.txn_date || new Date().toISOString().slice(0, 10),
    type: t.type,
    job_no: t.job_no?.trim() || null,
    team: t.type === "purchase" ? null : (t.team || null),
    material_code: t.material_code,
    qty: Number(t.qty),
    unit_cost: Number(t.unit_cost) || 0,
    reason: t.type === "damage" ? (t.reason || null) : null,
    photo_url: t.photo_url || null,
    recorded_by: user?.id || null,
  };
  const { error } = await supabase.from("transactions").insert(payload);
  if (error) throw error;
}

// bulk insert many lines (same job) at once
// one reference number per recording action (batch) — WD/RT/PC/DG-YYMMDD-HHMMSS
function txnRefNo(type) {
  const pfx = { withdraw: "WD", return: "RT", purchase: "PC", damage: "DG" }[type] || "MV";
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${pfx}-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
export async function recordTransactions(rows) {
  const { data: { user } } = await supabase.auth.getUser();
  const ref = txnRefNo(rows[0]?.type);   // all lines recorded together share one ref number
  const payload = rows.map((t) => ({
    txn_date: t.txn_date || new Date().toISOString().slice(0, 10),
    type: t.type,
    job_no: t.job_no?.trim() || null,
    team: t.type === "purchase" ? null : (t.team || null),
    material_code: t.material_code,
    qty: Number(t.qty),
    unit_cost: Number(t.unit_cost) || 0,
    reason: t.type === "damage" ? (t.reason || null) : null,
    prep_no: t.prep_no || null,   // ผูกกลับใบเตรียมวัสดุ (mig 115) — ไว้ลบตามกันได้
    po_no: t.po_no || null,       // ผูกใบสั่งซื้อ (mig 151) — ยกเลิกรับเข้าลบครบทั้งชุดซื้อ+เบิกอัตโนมัติ
    twin_ref: t.twin_ref || null, // ชุดเบิกอัตโนมัติ: จำเลขชุด "รับของ" ที่เป็นต้นเหตุ (mig 155) — ยกเลิกรอบไหนลบเฉพาะคู่ของรอบนั้น
    ref_no: ref,
    recorded_by: user?.id || null,
  }));
  let { error } = await supabase.from("transactions").insert(payload);
  if (error && /twin_ref/i.test(error.message || "")) { payload.forEach((r) => delete r.twin_ref); ({ error } = await supabase.from("transactions").insert(payload)); } // pre-155 fallback
  if (error && /po_no/i.test(error.message || "")) { payload.forEach((r) => delete r.po_no); ({ error } = await supabase.from("transactions").insert(payload)); }   // pre-151 fallback
  if (error && /prep_no/i.test(error.message || "")) { payload.forEach((r) => delete r.prep_no); ({ error } = await supabase.from("transactions").insert(payload)); } // pre-115 fallback
  if (error) throw error;
  return ref;   // ผู้เรียกใช้ผูกชุดคู่แฝดได้
}

// ยอดคงเหลือสด ๆ รายรหัส (ใช้คิดต้นทุนเฉลี่ยตอนรับของ — สต๊อกในหน้าอาจค้างจากตอนเปิด)
// ยอดที่ "รับเข้าไปแล้ว" ของใบสั่งซื้อ (รวมทุกรอบ) — ใช้ตั้งค่าเริ่มต้นหน้ารับของให้เป็นยอดคงค้าง
// เดิมหน้ารับของเติมจำนวนเต็มใบทุกครั้ง กดยืนยันตามที่เห็น = ของเข้าเกินโดยไม่รู้ตัว
// แก้ราคาตามบิลซัพพลายเออร์ "หลังรับของแล้ว" → ต้องไล่แก้ต้นทุนที่บันทึกไว้ในคลัง/งานด้วย
// ไม่งั้นใบสั่งซื้อโชว์ราคาใหม่ แต่ต้นทุนงาน+ต้นทุนเฉลี่ยยังเป็นราคาเดิม (กำไรงานผิด)
export async function repriceReceivedPo(poNo, items) {
  if (!poNo || !items?.length) return 0;
  // ⚠️ it.price = ราคาต่อ "หน่วยของบรรทัด" — สินค้า 2 หน่วยคือหน่วยซื้อ (ม้วน) ไม่ใช่หน่วยหลัก (เมตร)
  //    แต่ transactions.unit_cost กับ materials.cost เก็บเป็นหน่วยหลักเสมอ (Movements เขียน price / f)
  //    ไม่หารก่อน = ต้นทุนพองเท่ากับ purchase_qty (1,500฿/ม้วน กลายเป็น 1,500฿/เมตร = 100 เท่า)
  //    แล้วลามเข้าต้นทุนงาน + ราคาทุนตั้งต้นของ BOQ/ใบเสนอทุกใบถัดไป
  const codes = [...new Set(items.map((it) => it.code).filter(Boolean))];
  const { data: mats } = await supabase.from("materials").select("code,unit,purchase_unit,purchase_qty").in("code", codes.length ? codes : ["__none__"]);
  const mBy = Object.fromEntries((mats || []).map((m) => [m.code, m]));
  const factorOf = (it) => {
    const m = mBy[it.code], q = Number(m?.purchase_qty) || 0;
    return (m?.purchase_unit && it.unit === m.purchase_unit && q > 1) ? q : 1;
  };
  const priceOf = {}; items.forEach((it) => { priceOf[it.code] = _round2((Number(it.price) || 0) / factorOf(it)); });
  const { data: rows, error } = await supabase.from("transactions").select("id,material_code,qty,unit_cost,type").eq("po_no", poNo);
  if (error || !rows?.length) return 0;
  let n = 0;
  for (const r of rows) {
    const want = priceOf[r.material_code];
    if (want == null || Math.abs((Number(r.unit_cost) || 0) - want) < 0.005) continue;
    // ⚠️ ต้อง .select() แล้วนับแถวที่เปลี่ยนจริง — RLS ปฏิเสธ update จะคืน "ไม่มี error + 0 แถว"
    //    เดิมเช็กแค่ if (!e) n++ ⇒ คนที่แก้ใบ PO ได้แต่ไม่มีสิทธิ์แก้ transactions (ธุรการวัสดุ/ฝ่ายขาย)
    //    จะนับว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน → materials.cost ถูกเขียนใหม่ (สิทธิ์ผ่าน) แต่ต้นทุนที่ผูกกับงานยังเป็นราคาเก่า
    //    = ต้นทุนคลังกับต้นทุนงานไม่ตรงกัน กำไร/งานเพี้ยน และ audit บันทึกว่า "ปรับต้นทุน n รายการ" ทั้งที่ไม่ได้ปรับ
    const { data: upd, error: e } = await supabase.from("transactions").update({ unit_cost: want }).eq("id", r.id).select("id");
    if (e) throw e;
    if (!upd?.length) throw new Error("แก้ต้นทุนที่บันทึกไว้ในคลัง/งานไม่สำเร็จ (สิทธิ์ไม่พอ) — ราคาในใบเปลี่ยนแล้ว แต่ต้นทุนคลัง/งานยังเป็นราคาเดิม ให้ธุรการหรือบัญชีแก้ราคาใบนี้แทน");
    n++;
  }
  if (n) {
    // ต้นทุนเฉลี่ยของสินค้าที่ราคาเปลี่ยน — ตั้งเป็นราคาซื้อล่าสุดจากบิลจริง
    for (const [code, p] of Object.entries(priceOf)) if (p > 0) await updateMaterialCost(code, p).catch(() => {});
    await logAudit({ action: "update", target_type: "purchase_order", target_no: poNo, reason: `แก้ราคาตามบิลซัพฯ หลังรับของ — ปรับต้นทุน ${n} รายการในคลัง/งาน` }).catch(() => {});
  }
  return n;
}
export async function poReceivedQty(poNo) {
  if (!poNo) return {};
  const { data, error } = await supabase.from("transactions").select("material_code,qty").eq("po_no", poNo).eq("type", "purchase");
  if (error) return {};   // pre-151 (ยังไม่มีคอลัมน์ po_no) → ถือว่ายังไม่เคยรับ
  const out = {};
  (data || []).forEach((r) => { out[r.material_code] = (out[r.material_code] || 0) + (Number(r.qty) || 0); });
  return out;
}
export async function getStockByCodes(codes) {
  const out = {};
  for (let i = 0; i < codes.length; i += 300) {
    const { data, error } = await supabase.from("material_stock").select("code,current_stock").in("code", codes.slice(i, i + 300));
    if (error) throw error;
    (data || []).forEach((m) => { out[m.code] = Number(m.current_stock) || 0; });
  }
  return out;
}
// ราคาซื้อครั้งล่าสุดของสินค้า (โชว์เป็น hint ในฟอร์ม PO — ต้นทุนเฉลี่ยมักเพี้ยนจากราคาซื้อจริง)
export async function lastPurchaseOf(code) {
  const { data } = await supabase.from("transactions").select("unit_cost,txn_date,po_no").eq("material_code", code).eq("type", "purchase").order("id", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// ---------- STOCK COUNT (นับสต๊อก) ----------
const _round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// list all count sessions with a per-session summary (counted / over / short)
export async function listStockCounts() {
  const [scRes, itemRes, profRes] = await Promise.all([
    _allRows((f, t) => supabase.from("stock_counts").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("stock_count_items").select("count_id,counted_qty,diff", { count: "exact" }).order("id").range(f, t)).then((rows) => ({ data: rows })), // กันเพดาน 1000 แถว
    supabase.from("profiles").select("id,name,email"),
  ]);
  if (scRes.error) throw scRes.error;
  const nameById = Object.fromEntries((profRes.data || []).map((p) => [p.id, p.name || p.email]));
  const byCount = {};
  (itemRes.data || []).forEach((it) => { (byCount[it.count_id] = byCount[it.count_id] || []).push(it); });
  return (scRes.data || []).map((s) => {
    const its = byCount[s.id] || [];
    return { ...s, totalItems: its.length,
      countedItems: its.filter((x) => x.counted_qty != null).length,
      over: its.filter((x) => (Number(x.diff) || 0) > 0).length,
      short: its.filter((x) => (Number(x.diff) || 0) < 0).length,
      countedByName: nameById[s.counted_by] || null, appliedByName: nameById[s.applied_by] || null };
  });
}
// create a new draft count over the given material codes (partial count = pick a category/subset)
export async function createStockCount({ note, codes }) {
  const uid = await _uid();
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const count_no = `SC-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const { data: sc, error } = await supabase.from("stock_counts").insert({ count_no, note: note?.trim() || null, counted_by: uid }).select("id,count_no").single();
  if (error) throw error;
  const uniq = [...new Set((codes || []).filter(Boolean))];
  const costMap = {};
  for (let i = 0; i < uniq.length; i += 500) {
    const { data: mm } = await supabase.from("materials").select("code,cost").in("code", uniq.slice(i, i + 500));
    (mm || []).forEach((m) => { costMap[m.code] = Number(m.cost) || 0; });
  }
  const rows = uniq.map((code) => ({ count_id: sc.id, material_code: code, unit_cost: costMap[code] || 0 }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e2 } = await supabase.from("stock_count_items").insert(rows.slice(i, i + 500));
    if (e2) throw e2;
  }
  return sc.id;
}
export async function getStockCount(id) {
  const { data, error } = await supabase.from("stock_counts").select("*").eq("id", id).single();
  if (error) throw error; return data;
}
export async function getStockCountItems(id) {
  // รอบนับทั้งคลังมีเกิน 1,000 รายการ — ต้องอ่านเป็นช่วง ไม่งั้นรายการท้าย ๆ หายจากหน้าจอ
  return _fetchAll((f, t) => supabase.from("stock_count_items").select("*", { count: "exact" }).eq("count_id", id).order("id").range(f, t));
}
// save typed "counted" quantities on a draft (null = not counted yet)
export async function saveStockCountCounts(id, counts) {
  // กันแท็บค้างเขียนทับรอบที่อัพเดทสต๊อกไปแล้ว — ตัวเลขนับต้องนิ่งเป็นหลักฐานคู่กับ system_qty/diff ที่ freeze ไว้
  const { data: sc0, error: e00 } = await supabase.from("stock_counts").select("status").eq("id", id).single();
  if (e00) throw e00;
  if (sc0.status === "applied") throw new Error("รอบนี้อัพเดทสต๊อกไปแล้ว — แก้ยอดนับไม่ได้ (เริ่มรอบนับใหม่แทน)");
  const rows = Object.entries(counts || {}).map(([code, qty]) => ({
    count_id: id, material_code: code,
    counted_qty: (qty === "" || qty == null) ? null : Number(qty),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("stock_count_items").upsert(rows.slice(i, i + 500), { onConflict: "count_id,material_code" });
    if (error) throw error;
  }
  await supabase.from("stock_counts").update({ updated_at: new Date().toISOString() }).eq("id", id);
}
// apply: for each counted item, snapshot system qty + record an adjust movement for the difference, then lock the round
export async function applyStockCount(id, reason) {
  const uid = await _uid();
  const { data: sc, error: e0 } = await supabase.from("stock_counts").select("id,count_no,status").eq("id", id).single();
  if (e0) throw e0;
  if (sc.status === "applied") throw new Error("รอบนี้อัพเดทสต๊อกไปแล้ว");
  // จองรอบก่อนทำ (optimistic lock) — กดซ้ำ/สองเครื่อง apply พร้อมกัน = ปรับสองเด้ง สต๊อกเพี้ยนเท่าส่วนต่างทั้งรอบ
  const nowClaim = new Date().toISOString();
  const { data: claim, error: eClaim } = await supabase.from("stock_counts")
    .update({ status: "applied", applied_by: uid, applied_at: nowClaim, updated_at: nowClaim })
    .eq("id", id).eq("status", "draft").select("id");
  if (eClaim) throw eClaim;
  if (!claim?.length) throw new Error("มีคนกดอัพเดทรอบนี้พร้อมกัน — รีเฟรชดูผลก่อน");
  const revert = async () => { await supabase.from("stock_counts").update({ status: "draft", applied_by: null, applied_at: null }).eq("id", id); };
  try {
  // อ่านเป็นช่วงให้ครบทุกรายการ — เพดาน 1,000 แถวเคยทำให้ปรับยอดได้ไม่ครบรอบ
  const items = await _fetchAll((f, t) => supabase.from("stock_count_items").select("id,material_code,counted_qty,unit_cost", { count: "exact" }).eq("count_id", id).order("id").range(f, t));
  const counted = (items || []).filter((it) => it.counted_qty != null);
  if (!counted.length) throw new Error("ยังไม่มีรายการที่นับ — กรอกยอดนับก่อน");
  const codes = counted.map((it) => it.material_code);
  const sysMap = {};
  for (let i = 0; i < codes.length; i += 300) {
    const { data: ms, error: eMs } = await supabase.from("material_stock").select("code,current_stock,cost").in("code", codes.slice(i, i + 300));
    // ห้ามกลืน error — ถ้าอ่านยอดระบบไม่ได้แล้วเดินต่อ ยอดระบบจะกลายเป็น 0 ทุกตัว → adjust_in เท่ายอดนับทั้งก้อน (สต๊อกบวมเท่าตัว)
    if (eMs) throw new Error("อ่านยอดคงเหลือปัจจุบันไม่สำเร็จ — ยกเลิกการปรับยอดทั้งรอบ: " + (eMs.message || eMs));
    (ms || []).forEach((m) => { sysMap[m.code] = m; });
  }
  // ทุกตัวที่นับต้องมียอดระบบอ่านได้จริง ถ้าไม่เจอ = ผิดปกติ ให้หยุดทันที ห้ามเดาเป็น 0
  const missing = codes.filter((c) => !(c in sysMap) || sysMap[c].current_stock == null);
  if (missing.length) throw new Error(`หายอดระบบไม่พบ ${missing.length} รายการ (เช่น ${missing.slice(0, 3).join(", ")}) — ยกเลิกการปรับยอดทั้งรอบ ยังไม่มีอะไรถูกเปลี่ยน`);
  const now = new Date().toISOString(), day = now.slice(0, 10);
  const txns = []; let adjusted = 0;
  for (const it of counted) {
    const sys = Number(sysMap[it.material_code]?.current_stock) || 0;
    const cnt = Number(it.counted_qty) || 0;
    const diff = _round2(cnt - sys);
    const uc = Number(it.unit_cost) || Number(sysMap[it.material_code]?.cost) || 0;
    await supabase.from("stock_count_items").update({ system_qty: sys, diff }).eq("id", it.id);
    if (diff !== 0) {
      txns.push({ txn_date: day, type: diff > 0 ? "adjust_in" : "adjust_out", material_code: it.material_code,
        qty: Math.abs(diff), unit_cost: uc, ref_no: sc.count_no, reason: `ปรับยอดจากการนับสต๊อก ${sc.count_no}${reason ? " — " + reason : ""}`, recorded_by: uid });
      adjusted++;
    }
  }
  if (txns.length) { const { error: e2 } = await supabase.from("transactions").insert(txns); if (e2) throw e2; }
  // ตัดของหาย/ของเกินคือการตัดเงินออกจากคลัง — ต้องมีร่องรอยว่าใครอนุมัติและเพราะอะไร
  // เหมือนทุกจุดที่ยกเลิก/ลบของในระบบ (เดิมเก็บแค่ applied_by/applied_at ไม่มีเหตุผล)
  const lossValue = _round2(txns.reduce((a, t) => a + (t.type === "adjust_out" ? -1 : 1) * (Number(t.qty) || 0) * (Number(t.unit_cost) || 0), 0));
  await logAudit({ action: "adjust", target_type: "stock_count", target_no: sc.count_no,
    reason: `ปรับยอด ${adjusted} รายการ · มูลค่าสุทธิ ${lossValue} บาท${reason ? " — " + reason : ""}` }).catch(() => {});
  return { adjusted, counted: counted.length, lossValue };
  } catch (err) { await revert(); throw err; }   // พลาดกลางทาง → คืนสถานะร่าง ให้กดใหม่ได้ (ยังไม่มี txn ไหนถูกเขียนถ้าพังก่อน insert)
}
export async function deleteStockCount(id, reason) {
  // รอบที่อัพเดทสต๊อกแล้ว = หลักฐานคู่กับรายการปรับยอด — ห้ามลบ (RLS mig 151 กันอีกชั้น)
  const { data: sc } = await supabase.from("stock_counts").select("count_no,status").eq("id", id).maybeSingle();
  if (sc?.status === "applied") throw new Error("รอบนี้อัพเดทสต๊อกไปแล้ว — ลบไม่ได้ (เก็บเป็นหลักฐานคู่รายการปรับยอด)");
  const { error } = await supabase.from("stock_counts").delete().eq("id", id); // cascades items
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "stock_count", target_no: sc?.count_no || String(id), reason: reason || null }).catch(() => {});
}

// aggregate all job_no'd movements + the jobs (status) table
async function _jobAggregate() {
  const [txnRes, jobRes] = await Promise.all([
    // limit(5000) ใช้ไม่ได้จริง — Supabase ตัดที่ 1000 แถวเสมอ ต้องดึงเป็นช่วง ๆ ไม่งั้นต้นทุนงานใหม่หาย
    _fetchAll((f, t) => supabase.from("transactions").select("*", { count: "exact" }).not("job_no", "is", null)
      .in("type", ["withdraw", "return", "damage"]).order("id", { ascending: true }).range(f, t)).then((rows) => ({ data: rows })),
    // ตาราง jobs (งานปิดแล้ว) ก็ต้องกันเพดาน 1000 แถว — ไม่งั้นเกินพันงาน งานปิดจะ "เปิดเอง" และต้นทุนที่ล็อกไว้หาย
    _fetchAll((f, t) => supabase.from("jobs").select("*", { count: "exact" }).order("job_no").range(f, t)).then((rows) => ({ data: rows })),
  ]);
  if (txnRes.error) throw txnRes.error;
  if (jobRes.error) throw jobRes.error;
  const closed = {}; (jobRes.data || []).forEach((j) => { closed[j.job_no] = j; });
  const jobs = {};
  for (const r of txnRes.data || []) {
    const j = jobs[r.job_no] || (jobs[r.job_no] = { job_no: r.job_no, team: r.team, date: r.txn_date, mats: {} });
    if (r.type === "withdraw" && r.team) j.team = r.team;
    if (r.txn_date > j.date) j.date = r.txn_date;
    const m = j.mats[r.material_code] || (j.mats[r.material_code] = { code: r.material_code, withdrawn: 0, returned: 0, damaged: 0, unitCost: 0 });
    const q = Number(r.qty) || 0;
    if (r.type === "withdraw") { m.withdrawn += q; if (!m.unitCost) m.unitCost = Number(r.unit_cost) || 0; }
    else if (r.type === "return") m.returned += q;
    else if (r.type === "damage") m.damaged += q;
  }
  return { jobs, closed };
}

// open jobs for return/damage entry: outstanding>0 AND not closed
export async function listOpenJobs() {
  const { jobs, closed } = await _jobAggregate();
  return Object.values(jobs).map((j) => ({
    job_no: j.job_no, team: j.team, date: j.date,
    lines: Object.values(j.mats).map((m) => ({ ...m, outstanding: m.withdrawn - m.returned - m.damaged })).filter((m) => m.outstanding > 0),
  })).filter((j) => j.lines.length > 0 && closed[j.job_no]?.status !== "closed")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// all jobs (open + closed) with cost = used (withdrawn − returned) × unit cost
export async function listAllJobs() {
  const { jobs, closed } = await _jobAggregate();
  return Object.values(jobs).map((j) => {
    const lines = Object.values(j.mats).map((m) => ({ ...m, used: m.withdrawn - m.returned, outstanding: m.withdrawn - m.returned - m.damaged }));
    const liveUsed = lines.reduce((a, l) => a + l.used * l.unitCost, 0);
    const rec = closed[j.job_no];
    const status = rec?.status === "closed" ? "closed" : "open";
    return {
      job_no: j.job_no, team: j.team, date: j.date, status, lines,
      usedValue: status === "closed" && rec?.used_value != null ? Number(rec.used_value) : liveUsed,
      closed_at: rec?.closed_at || null,
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ข้อมูลใบงานแบบย่อสำหรับหน้า "วัสดุที่ใช้ในงาน" — สถานะงาน + ลูกค้า + ชื่องาน ต่อเลขงาน
export async function listJobBriefs() {
  const _rows = (build) => _fetchAll(build).then((rows) => ({ data: rows })); // กันเพดาน 1000 แถว — เกินพันใบ ป้ายสถานะ/ชื่อลูกค้าในหน้า "วัสดุที่ใช้" จะหายเงียบ
  const [j, cu] = await Promise.all([
    _rows((f, t) => supabase.from("job_orders").select("job_no,status,title,customer_id,contact_name,contact_phone", { count: "exact" }).order("job_no").range(f, t)),
    // ชื่อลูกค้าโหลดไม่ได้ = โชว์ป้ายสถานะต่อโดยไม่มีชื่อ (พฤติกรรมเดิม) — ไม่พาทั้งหน้าล้ม
    _rows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)).catch(() => ({ data: [] })),
  ]);
  if (j.error) throw j.error;
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  return Object.fromEntries((j.data || []).map((x) => [x.job_no,
    { status: x.status, title: x.title || null, customerName: cn[x.customer_id] || null, contact: x.contact_name || null, phone: x.contact_phone || null }]));
}

export async function closeJob(job_no, team, usedValue) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("jobs").upsert(
    { job_no, team, status: "closed", used_value: usedValue, closed_at: new Date().toISOString(), closed_by: user?.id || null },
    { onConflict: "job_no" }
  );
  if (error) throw error;
}
export async function reopenJob(job_no) {
  const { error } = await supabase.from("jobs").upsert({ job_no, status: "open", closed_at: null }, { onConflict: "job_no" });
  if (error) throw error;
}

// ---------- PURCHASE ORDERS ----------
export function listPurchaseOrders() { return _cached("listPurchaseOrders", _loadPurchaseOrders, _SHORT_TTL); }
async function _loadPurchaseOrders() {
  const _rows = (build) => _fetchAll(build).then((rows) => ({ data: rows })); // กันเพดาน 1000 แถวทุกก้อน (header PO ก็โตเรื่อย ๆ เหมือนใบขาย)
  const [poRes, itemRes, qRes, cuRes, joRes, tmRes] = await Promise.all([
    _rows((f, t) => supabase.from("purchase_orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("po_no").range(f, t)),
    _rows((f, t) => supabase.from("po_items").select("*", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("quotations").select("quote_no,customer_id,title", { count: "exact" }).order("quote_no").range(f, t)),
    _rows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("job_orders").select("job_no,quote_no,assigned_team,status", { count: "exact" }).order("job_no").range(f, t)),
    supabase.from("teams").select("id,name"),
  ]);
  if (poRes.error) throw poRes.error;
  if (itemRes.error) throw itemRes.error;
  const byPo = {};
  (itemRes.data || []).forEach((it) => { (byPo[it.po_no] = byPo[it.po_no] || []).push(it); });
  // PO ผูกใบเสนอราคา → โยงต่อถึง ลูกค้า + ใบงาน + ทีมช่าง (ใบงานแรกที่ไม่ถูกยกเลิกของใบเสนอราคานั้น)
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const quoteInfo = Object.fromEntries((qRes.data || []).map((x) => [x.quote_no, x]));
  const teamName = Object.fromEntries((tmRes.data || []).map((t) => [t.id, t.name]));
  const cb = await _creators((poRes.data || []).map((p) => p.created_by));   // ชื่อผู้สร้างใบ (ให้ตัวกรอง "ผู้สร้างเอกสาร" ใช้)
  const jobByQuote = {};
  (joRes.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  return (poRes.data || []).map((po) => {
    const items = (byPo[po.po_no] || []).map((it) => ({ material_code: it.material_code, qty: Number(it.qty), price: Number(it.price), unit: it.unit || null }));
    const subtotal = items.reduce((a, it) => a + it.qty * it.price, 0);   // ราคาก่อน VAT
    const vatAmt = po.vat ? Math.round(subtotal * 0.07 * 100) / 100 : 0;
    // สถานะการจ่ายเงิน (แยกจากสถานะรับของ): จ่ายแล้ว / รออนุมัติจ่าย (ส่งเข้าเมนูเบิกจ่ายแล้ว) / ยังไม่จ่าย
    const paymentStatus = po.paid_at ? "paid" : po.expense_id ? "pending" : "unpaid";
    const qi = po.quote_no ? quoteInfo[po.quote_no] : null;
    const job = po.quote_no ? jobByQuote[po.quote_no] : null;
    return { ...po, items, subtotal, vatAmt, total: Math.round((subtotal + vatAmt) * 100) / 100, paymentStatus,
      createdByName: cb[po.created_by] || null,
      customerName: qi ? custName[qi.customer_id] || null : null,
      jobNo: job?.job_no || null, teamName: job ? teamName[job.assigned_team] || job.assigned_team || null : null };
  });
}

// รายการในใบเสนอราคา (ดึงเข้าใบเตรียมวัสดุ)
export async function getQuoteItems(quote_no) {
  const { data, error } = await supabase.from("quotation_items").select("*").eq("quote_no", quote_no).order("id");
  if (error) throw error; return data || [];
}

// ---------- ใบเตรียมวัสดุ (mig 109) — ประตูก่อนสั่งซื้อ/เบิก: แบ่งจำนวน ซื้อ/เบิก ต่อรายการ + ขั้นอนุมัติ ----------
export async function listMaterialPreps() {
  const _rows = (build) => _fetchAll(build).then((rows) => ({ data: rows })); // กันเพดาน 1000 แถวทุกก้อน — เหมือน listPurchaseOrders (เดิมกันแค่รายการ ใบ/ลูกค้า/งานหลุดเมื่อเกินพัน)
  const [pRes, iRes, qRes, cuRes, joRes, tmRes, poRes, txRes] = await Promise.all([
    _rows((f, t) => supabase.from("material_preps").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("prep_no").range(f, t)),
    _rows((f, t) => supabase.from("material_prep_items").select("*", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("quotations").select("quote_no,customer_id,title", { count: "exact" }).order("quote_no").range(f, t)),
    _rows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("job_orders").select("job_no,quote_no,assigned_team,status", { count: "exact" }).order("job_no").range(f, t)),
    supabase.from("teams").select("id,name"),
    // ใบสั่งซื้อ/ชุดเบิกที่แตกออกจากใบเตรียมวัสดุ (ผูกด้วย prep_no) — ไว้โชว์บนการ์ดและกันกดสร้างซ้ำ
    _rows((f, t) => supabase.from("purchase_orders").select("po_no,prep_no,status,issue_date,created_at", { count: "exact" }).not("prep_no", "is", null).order("po_no").range(f, t)).catch(() => ({ data: [] })),
    _rows((f, t) => supabase.from("transactions").select("ref_no,prep_no,txn_date,type", { count: "exact" }).not("prep_no", "is", null).eq("type", "withdraw").order("id").range(f, t)).catch(() => ({ data: [] })),
  ]);
  if (pRes.error) throw pRes.error;
  const byPrep = {}; (iRes.data || []).forEach((it) => { (byPrep[it.prep_no] = byPrep[it.prep_no] || []).push(it); });
  // ใบสั่งซื้อที่ยังไม่ยกเลิก ที่แตกออกจากใบเตรียมวัสดุใบนี้
  const poByPrep = {}; (poRes.data || []).forEach((x) => { if (x.status !== "cancelled") (poByPrep[x.prep_no] = poByPrep[x.prep_no] || []).push({ po_no: x.po_no, status: x.status, date: x.issue_date || (x.created_at || "").slice(0, 10) }); });
  // recordTransactions เขียนหลายแถวต่อการเบิก 1 ครั้ง แต่ใช้ ref_no ร่วมกัน — ต้องยุบตาม ref_no ไม่งั้นนับชุดเบิกเกินจริง
  const wdByPrep = {}; (txRes.data || []).forEach((x) => { if (!x.ref_no) return; ((wdByPrep[x.prep_no] = wdByPrep[x.prep_no] || {})[x.ref_no] ||= { ref_no: x.ref_no, date: x.txn_date }); });
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const quoteInfo = Object.fromEntries((qRes.data || []).map((x) => [x.quote_no, x]));
  const teamName = Object.fromEntries((tmRes.data || []).map((t) => [t.id, t.name]));
  const jobByQuote = {}; (joRes.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  const jobByNo = Object.fromEntries((joRes.data || []).map((j) => [j.job_no, j]));
  const cb = await _creators();
  return (pRes.data || []).map((p) => {
    const qi = p.quote_no ? quoteInfo[p.quote_no] : null;
    // ผูกใบงานตรง ๆ (job_no บนใบ · mig 120) ก่อน — ถ้าไม่มีค่อยเดาผ่านใบเสนอราคา
    const job = (p.job_no && jobByNo[p.job_no]) || (p.quote_no ? jobByQuote[p.quote_no] : null);
    return { ...p, items: byPrep[p.prep_no] || [],
      linkedPos: poByPrep[p.prep_no] || [], linkedWithdraws: Object.values(wdByPrep[p.prep_no] || {}),
      customerName: qi ? custName[qi.customer_id] || null : null, quoteTitle: qi?.title || null,
      jobNo: job?.job_no || p.job_no || null, jobTeam: job?.assigned_team || null, teamName: job ? teamName[job.assigned_team] || job.assigned_team || null : null,
      createdByName: cb[p.created_by] || null, approvedByName: cb[p.approved_by] || null };
  });
}
export async function saveMaterialPrep(head, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const pHead = {
    prep_no: head.prep_no, quote_no: head.quote_no || null, job_no: head.job_no || null, title: head.title?.trim() || null, issue_date: head.issue_date || null,
    note: head.note?.trim() || null, status: head.status || "draft", created_by: user?.id || null,
  };
  let e1 = (await supabase.from("material_preps").upsert(pHead, { onConflict: "prep_no" })).error;
  for (const c of ["issue_date", "job_no"]) { // pre-119/120 fallback — ตัดเฉพาะคอลัมน์ที่ live ยังไม่มี
    if (e1 && new RegExp(c, "i").test(e1.message || "")) { delete pHead[c]; e1 = (await supabase.from("material_preps").upsert(pHead, { onConflict: "prep_no" })).error; }
  }
  if (e1) throw new Error(/material_preps/.test(e1.message || "") && /relation|find/i.test(e1.message || "") ? "ยังไม่ได้รัน migration 109 ใน Supabase" : e1.message);
  const e2 = (await supabase.from("material_prep_items").delete().eq("prep_no", head.prep_no)).error;
  if (e2) throw e2;
  const rows = items.filter((it) => (Number(it.qty_buy) || 0) > 0 || (Number(it.qty_withdraw) || 0) > 0)
    .map((it) => ({ prep_no: head.prep_no, material_code: it.code || null, name: it.name || null, unit: it.unit || null, qty_buy: Number(it.qty_buy) || 0, qty_withdraw: Number(it.qty_withdraw) || 0 }));
  if (rows.length) { const e3 = (await supabase.from("material_prep_items").insert(rows)).error; if (e3) throw e3; }
}
export async function setPrepStatus(prep_no, status, prevStatus) {
  const patch = { status };
  if (status === "approved") { const { data: { user } } = await supabase.auth.getUser(); patch.approved_by = user?.id || null; patch.approved_at = new Date().toISOString(); }
  // กันแท็บค้างเปลี่ยนสถานะทับ (เช่น อนุมัติซ้ำใบที่ถูกยกเลิกไปแล้ว) — ผู้เรียกส่งสถานะเดิมมาเทียบ
  let q = supabase.from("material_preps").update(patch).eq("prep_no", prep_no);
  if (prevStatus) q = q.eq("status", prevStatus);
  const { data, error } = await q.select("prep_no");
  if (error) throw error;
  if (prevStatus && !data?.length) throw new Error("สถานะใบนี้เปลี่ยนไปแล้ว (มีคนแก้พร้อมกัน) — รีเฟรชก่อน");
}
// ลบใบเตรียมวัสดุ · cascade=true → ลบใบสั่งซื้อ + รายการเบิก ที่แตกออกมาจากใบนี้ด้วย (mig 115)
export async function deleteMaterialPrep(prep_no, cascade, reason) {
  if (cascade) {
    const { data: pos, error: eP } = await supabase.from("purchase_orders").select("po_no,status,expense_id,paid_at").eq("prep_no", prep_no);
    if (eP) throw eP;
    // การ์ด: PO ลูกที่รับของแล้ว/ตั้งเบิก-จ่ายแล้ว ห้ามลบพ่วง — ของเข้าสต๊อก/หนี้เกิดแล้ว ต้องไล่ยกเลิกจากปลายทางก่อน (กติกาบ้าน)
    const blocked = (pos || []).filter((x) => x.status === "received" || x.expense_id || x.paid_at);
    if (blocked.length) throw new Error(`ลบไม่ได้ — ใบสั่งซื้อที่แตกจากใบนี้ ${blocked.map((x) => x.po_no).join(", ")} รับของ/ตั้งเบิกไปแล้ว ให้ยกเลิกรับเข้า/ใบเบิกก่อน`);
    const poNos = (pos || []).map((x) => x.po_no);
    if (poNos.length) {
      const d1 = await supabase.from("po_items").delete().in("po_no", poNos);
      if (d1.error) throw d1.error;
      const d2 = await supabase.from("purchase_orders").delete().in("po_no", poNos);
      if (d2.error) throw d2.error;
    }
    // ลบรายการเบิกที่ผูกใบนี้ → สต๊อกคืนค่าอัตโนมัติ (current_stock คิดจาก transactions) — เช็คผลจริง (RLS เงียบ = 0 แถว)
    const d3 = await supabase.from("transactions").delete().eq("prep_no", prep_no).select("id");
    if (d3.error) throw d3.error;
    syncCashEntriesFromDocs().catch(() => {});
  }
  const { data: snap } = await supabase.from("material_preps").select("*").eq("prep_no", prep_no).maybeSingle();
  const { error } = await supabase.from("material_preps").delete().eq("prep_no", prep_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "material_prep", target_no: prep_no, reason: reason || null, snapshot: snap }).catch(() => {});
}

export async function savePurchaseOrder(po, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const head = { po_no: po.po_no, supplier: po.supplier || null, note: po.note || null, internal_note: po.internal_note?.trim() || null, status: po.status || "open", vat: !!po.vat, price_incl: !!po.price_incl, quote_no: po.quote_no || null, prep_no: po.prep_no || null, issue_date: po.issue_date || null, po_type: po.po_type || null, delivery_date: po.delivery_date || null, delivery_method: po.delivery_method || null,
    // เอกสารผู้ขาย (mig 205)
    dn_no: po.dn_no?.trim() || null, sup_inv_no: po.sup_inv_no?.trim() || null, attachments: Array.isArray(po.attachments) ? po.attachments : [],
    created_by: user?.id || null };
  let e1 = (await supabase.from("purchase_orders").upsert(head, { onConflict: "po_no" })).error;
  // pre-096/097/100/115/119/139/187/205 fallback — ตัดเฉพาะคอลัมน์ที่ schema ไม่รู้จักจริง ๆ (ชื่อคอลัมน์อยู่ใน error message ของ PostgREST)
  // ห้ามเหมารวม: เคยตัด vat ทิ้งไปด้วยตอน price_incl ยังไม่รัน migration → ใบสั่งซื้อโหมดรวม VAT ถูกเก็บเป็นไม่มี VAT
  for (const c of ["price_incl", "vat", "quote_no", "prep_no", "issue_date", "po_type", "delivery_date", "delivery_method", "dn_no", "sup_inv_no", "attachments"]) {
    if (e1 && c in head && (e1.message || "").includes(c)) {
      delete head[c];
      e1 = (await supabase.from("purchase_orders").upsert(head, { onConflict: "po_no" })).error;
    }
  }
  if (e1) throw e1;
  const e2 = (await supabase.from("po_items").delete().eq("po_no", po.po_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const rows = items.map((it) => ({ po_no: po.po_no, material_code: it.code, qty: Number(it.qty), price: Number(it.price) || 0, unit: it.unit || null }));
    let e3 = (await supabase.from("po_items").insert(rows)).error;
    if (e3 && /unit|column|PGRST204/i.test(e3.message || "")) { rows.forEach((r) => delete r.unit); e3 = (await supabase.from("po_items").insert(rows)).error; } // pre-098 fallback
    if (e3) throw e3;
  }
  syncCashEntriesFromDocs().catch(() => {}); // new/edited PO → "คาดว่าจะจ่าย" in cash flow
  syncInternalNote({ quoteNo: po.quote_no }, po.internal_note).catch(() => {});
}

// รายการที่ควรสั่งซื้อ (reorder) — วัสดุที่ tracked + ตั้งขั้นต่ำ แล้วคงเหลือ < ขั้นต่ำ
// เดา "ผู้ขาย/ราคาล่าสุด" จากประวัติ po_items (ใบ PO ที่ไม่ยกเลิก) เพื่อจัดกลุ่มตามผู้ขาย
export async function listReorderSuggestions() {
  const { data: mats } = await supabase.from("materials")
    .select("code,name_th,unit,min_stock,purchase_qty,purchase_unit,kind,tracked").eq("tracked", true).gt("min_stock", 0);
  const codes = (mats || []).map((m) => m.code);
  if (!codes.length) return [];
  const stock = {};
  for (let i = 0; i < codes.length; i += 300) {
    const { data } = await supabase.from("material_stock").select("code,current_stock").in("code", codes.slice(i, i + 300));
    (data || []).forEach((s) => { stock[s.code] = Number(s.current_stock) || 0; });
  }
  const low = (mats || []).filter((m) => (stock[m.code] ?? 0) < Number(m.min_stock));
  if (!low.length) return [];
  const lowCodes = low.map((m) => m.code);
  // ประวัติราคา/ผู้ขาย: po_items ของโค้ดที่ต่ำ + หัว PO (join ใน JS ไม่พึ่ง FK embed)
  const items = [];
  for (let i = 0; i < lowCodes.length; i += 200) {
    const { data } = await supabase.from("po_items").select("material_code,price,po_no").in("material_code", lowCodes.slice(i, i + 200));
    if (data) items.push(...data);
  }
  const poNos = [...new Set(items.map((it) => it.po_no).filter(Boolean))];
  const poInfo = {};
  for (let i = 0; i < poNos.length; i += 300) {
    const { data } = await supabase.from("purchase_orders").select("po_no,supplier,status,issue_date,created_at").in("po_no", poNos.slice(i, i + 300));
    (data || []).forEach((p) => { poInfo[p.po_no] = p; });
  }
  const lastBuy = {};
  items.forEach((it) => {
    const po = poInfo[it.po_no]; if (!po || po.status === "cancelled") return;
    const d = po.issue_date || (po.created_at || "").slice(0, 10) || "";
    const cur = lastBuy[it.material_code];
    if (!cur || d >= cur.date) lastBuy[it.material_code] = { supplier: po.supplier || "", price: Number(it.price) || 0, date: d, po_no: po.po_no };
  });
  return low.map((m) => {
    const cur = stock[m.code] ?? 0;
    const need = Math.max(1, Math.ceil(Number(m.min_stock) - cur));
    const info = lastBuy[m.code] || {};
    return { code: m.code, name: m.name_th || m.code, unit: m.unit || "", current: cur, min: Number(m.min_stock), need, suggestQty: need, lastSupplier: info.supplier || "", lastPrice: info.price || 0, lastPo: info.po_no || "", kind: m.kind };
  }).sort((a, b) => (a.lastSupplier || "￿").localeCompare(b.lastSupplier || "￿") || (b.min - b.current) - (a.min - a.current));
}

export async function deletePurchaseOrder(po_no, reason) {
  // การ์ดฝั่ง server (UI ซ่อนปุ่มอยู่แล้ว แต่ API ต้องกันเอง): ใบที่รับของ/ตั้งเบิก/จ่ายแล้ว ห้ามลบ — ไล่ยกเลิกจากปลายทางก่อน
  const { data: cur, error: ce } = await supabase.from("purchase_orders").select("status,expense_id,paid_at").eq("po_no", po_no).maybeSingle();
  if (ce) throw ce;
  if (cur && (cur.status === "received" || cur.expense_id || cur.paid_at))
    throw new Error("ใบนี้รับของ/ตั้งเบิกจ่ายไปแล้ว — ต้องยกเลิกรับเข้า/ใบเบิกก่อนถึงจะลบได้");
  const { error } = await supabase.from("purchase_orders").delete().eq("po_no", po_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "purchase_order", target_no: po_no, reason });
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
}

// ยกเลิกใบสั่งซื้อ (เก็บประวัติ ไม่ลบ) — UI เปิดให้เฉพาะใบที่ยังไม่รับของและยังไม่ผูกการจ่าย
export async function cancelPurchaseOrder(po_no, reason) {
  const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("po_no", po_no);
  if (error) throw error;
  await logAudit({ action: "cancel", target_type: "purchase_order", target_no: po_no, reason });
  syncCashEntriesFromDocs().catch(() => {});
}

export async function markPoReceived(po_no) {
  // จองใบก่อนรับ (optimistic lock) — 2 คนเห็น "รอรับของ" พร้อมกันแล้วกดรับทั้งคู่ = สต๊อก/ต้นทุน/เบิกงานซ้ำสองเด้ง
  const { data, error } = await supabase.from("purchase_orders")
    .update({ status: "received", received_at: new Date().toISOString() })
    .eq("po_no", po_no).eq("status", "open").select("po_no");
  if (error) throw error;
  if (!data?.length) throw new Error(`ใบ ${po_no} ถูกรับของ/ยกเลิกไปแล้ว (มีคนทำพร้อมกัน) — รีเฟรชก่อน`);
  syncCashEntriesFromDocs().catch(() => {}); // อัปเดตกระแสเงินสด (จ่ายจริงอิงการจ่ายเงิน ไม่ใช่การรับของ)
}
// คืนสถานะใบเป็น "รอรับของ" — ใช้ตอนรับของล้มเหลวกลางทาง (จองใบไว้แล้วแต่ยังไม่มีของเข้า)
export async function unmarkPoReceived(po_no) {
  await supabase.from("purchase_orders").update({ status: "open", received_at: null }).eq("po_no", po_no).eq("status", "received");
}

// ตัวเลขเบา ๆ สำหรับแท็บ "ภาพรวม" ของแดชบอร์ด (นับ/รวมอย่างเดียว ไม่ join อะไรหนัก)
export async function dashboardActionLite() {
  const today = new Date().toISOString().slice(0, 10);
  // ทุกก้อนกันเพดาน 1000 แถว — ไม่งั้น KPI เงินค้างรับ/ค้างจ่ายบนแดชบอร์ดจะต่ำกว่าหน้าจริงเมื่อเอกสารเกินพันใบ
  const _rows = (build) => _fetchAll(build).then((rows) => ({ data: rows }));
  const [inv, exp, po, poi, sp, lj] = await Promise.all([
    _rows((f, t) => supabase.from("invoices").select("total,wht_amt,status,due_date,invoice_no", { count: "exact" }).order("invoice_no").range(f, t)),
    _rows((f, t) => supabase.from("expense_requests").select("id,status,amount,paid_amount", { count: "exact" }).order("id").range(f, t))
      .catch(async (e) => (/paid_amount/i.test(e.message || "") ? _rows((f, t) => supabase.from("expense_requests").select("id,status,amount", { count: "exact" }).order("id").range(f, t)) : Promise.reject(e))), // pre-063 fallback
    _rows((f, t) => supabase.from("purchase_orders").select("po_no,status,vat,expense_id,paid_at", { count: "exact" }).order("po_no").range(f, t))
      .catch(async (e) => (/expense_id|paid_at|vat/i.test(e.message || "") ? _rows((f, t) => supabase.from("purchase_orders").select("po_no,status", { count: "exact" }).order("po_no").range(f, t)) : Promise.reject(e))), // pre-096/100 fallback
    _rows((f, t) => supabase.from("po_items").select("po_no,qty,price", { count: "exact" }).order("id").range(f, t)), // กันเพดาน 1000 แถว
    _rows((f, t) => supabase.from("sub_payouts").select("status,net,id", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("job_orders").select("labor_total,labor_paid_amt,job_no", { count: "exact" }).eq("labor_confirmed", true).gt("labor_total", 0).order("job_no").range(f, t))
      .catch(() => ({ data: [] })), // pre-045 fallback
  ]);
  const unpaid = (inv.data || []).filter((x) => x.status === "unpaid");
  const pend = (exp.data || []).filter((x) => x.status === "pending");
  const pos = po.data || [];
  // ---- ยอดค้างจ่าย (เจ้าหนี้) ----
  const poTotal = {}; (poi.data || []).forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + (Number(it.qty) || 0) * (Number(it.price) || 0); });
  // ⚠️ ต้องหักยอดที่ "จ่ายบางส่วนแล้ว" ให้ตรงกับเมนูค้างจ่าย (listPayables) — payExpense จ่ายบางส่วนได้
  //    เดิมนับ PO/ใบเบิกเต็มหน้าใบ ไม่หัก paid_amount → การ์ดแดชบอร์ดสูงกว่าเมนูค้างจ่ายทั้งที่โฆษณาว่าตัวเลขชุดเดียวกัน
  //    ใบเบิก 1 ใบจ่ายได้หลาย PO → ปันยอดที่จ่ายแล้วให้ทีละ PO ตามลำดับ ไม่หักซ้ำ (สูตรเดียวกับ listPayables)
  const expById = Object.fromEntries((exp.data || []).map((x) => [x.id, x]));
  const expPaidLeft = {};
  let poPayable = 0;                                                                     // PO ที่ยังไม่จ่าย (รวม VAT) หักงวดที่จ่ายผ่านใบเบิกแล้ว — นับเฉพาะรับของแล้ว/ส่งเบิกแล้ว
  pos.filter((x) => x.status !== "cancelled" && !x.paid_at && (x.status === "received" || x.expense_id)).forEach((x) => {
    const gross = (poTotal[x.po_no] || 0) * (x.vat ? 1.07 : 1);
    let paid = 0;
    if (x.expense_id) {
      if (!(x.expense_id in expPaidLeft)) expPaidLeft[x.expense_id] = Number(expById[x.expense_id]?.paid_amount) || 0;
      paid = Math.min(gross, expPaidLeft[x.expense_id]);
      expPaidLeft[x.expense_id] = Math.round((expPaidLeft[x.expense_id] - paid) * 100) / 100;
    }
    poPayable += Math.max(0, Math.round((gross - paid) * 100) / 100);
  });
  // เบิกอนุมัติแล้วรอจ่าย — ไม่นับใบเบิกที่เป็นค่าจ่าย PO (PO ตัวนั้นถูกนับใน poPayable แล้ว ไม่งั้นซ้ำ) · หักยอดที่จ่ายบางส่วนแล้ว
  const poExpIds = new Set(pos.map((x) => x.expense_id).filter(Boolean));
  const approvedExpenseSum = (exp.data || []).filter((x) => x.status === "approved" && !poExpIds.has(x.id))
    .reduce((a, x) => a + Math.max(0, (Number(x.amount) || 0) - (Number(x.paid_amount) || 0)), 0);
  const payoutUnpaid = (sp.data || []).filter((x) => x.status !== "paid").reduce((a, x) => a + (Number(x.net) || 0), 0);              // ใบจ่ายช่างซัพรอจ่าย
  const laborOwed = (lj.data || []).reduce((a, j) => a + Math.max(0, (Number(j.labor_total) || 0) - (Number(j.labor_paid_amt) || 0)), 0); // ค่าแรงยืนยันแล้วยังไม่ตั้งเบิก
  return {
    receivable: unpaid.reduce((a, x) => a + (Number(x.total) || 0) - (Number(x.wht_amt) || 0), 0),
    unpaidCount: unpaid.length,
    overdueCount: unpaid.filter((x) => x.due_date && x.due_date < today).length,
    pendingExpenseCount: pend.length,
    pendingExpenseSum: pend.reduce((a, x) => a + (Number(x.amount) || 0), 0),
    poOpenCount: pos.filter((x) => x.status === "open").length,
    poAwaitPayCount: pos.filter((x) => x.status !== "cancelled" && x.expense_id && !x.paid_at).length,
    poPayable, approvedExpenseSum, payoutUnpaid, laborOwed,
    payable: poPayable + approvedExpenseSum + payoutUnpaid + laborOwed,
  };
}

// รายการค้างจ่ายแจกแจงรายใบ (เมนู "ค้างจ่าย") — แหล่ง/สูตรเดียวกับยอดค้างจ่ายบนแดชบอร์ด
// 4 ประเภทไม่ทับกัน: PO ยังไม่จ่าย (เฉพาะรับของแล้ว/ส่งเบิกแล้ว — แค่สั่งไว้ยังไม่นับ) · เบิกอนุมัติรอจ่าย (ไม่รวมใบเบิกของ PO) · ใบจ่ายซัพรอจ่าย · ค่าแรงยืนยันแล้วยังไม่ตั้งเบิก
export async function listPayables() {
  const _rows = (build) => _fetchAll(build).then((rows) => ({ data: rows })); // กันเพดาน 1000 แถวทุกก้อน — PO เกินพันใบเมื่อไหร่ ใบค้างเก่าสุดจะหายจากเมนูก่อน
  const [po, poi, exp, sp, lj, tm, qt, cu] = await Promise.all([
    _rows((f, t) => supabase.from("purchase_orders").select("*", { count: "exact" }).neq("status", "cancelled").order("created_at", { ascending: false }).order("po_no").range(f, t)),
    _rows((f, t) => supabase.from("po_items").select("po_no,qty,price", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("expense_requests").select("*", { count: "exact" }).eq("status", "approved").order("created_at", { ascending: false }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("sub_payouts").select("*", { count: "exact" }).neq("status", "paid").order("created_at", { ascending: false }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("job_orders").select("job_no,assigned_team,labor_total,labor_paid_amt,scheduled_at", { count: "exact" }).eq("labor_confirmed", true).gt("labor_total", 0).order("job_no").range(f, t))
      .catch(() => ({ data: [] })),
    supabase.from("teams").select("id,name"),
    _rows((f, t) => supabase.from("quotations").select("quote_no,customer_id,title", { count: "exact" }).order("quote_no").range(f, t)),   // PO → ใบเสนอ → ลูกค้า + ชื่องาน
    _rows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
  ]);
  if (po.error) throw po.error;
  const cb = await _creators();
  const teamName = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  const qInfo = Object.fromEntries((qt.data || []).map((q) => [q.quote_no, q]));
  const cName = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const poTotal = {}; (poi.data || []).forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + (Number(it.qty) || 0) * (Number(it.price) || 0); });
  const money = (n) => "฿" + (Math.round(n * 100) / 100).toLocaleString("en-US");
  const expById = Object.fromEntries((exp.data || []).map((x) => [x.id, x]));
  const rows = [];
  // PO เข้าค้างจ่ายเมื่อ "รับของแล้ว" หรือ "ส่งอนุมัติจ่ายแล้ว" เท่านั้น — แค่สั่งไว้ (ยังไม่รับ/ยังไม่ตั้งเบิก) ยังไม่เป็นหนี้
  // จ่ายบางส่วนผ่านใบเบิกที่ผูกไว้แล้ว → หักออก เหลือเท่าไหร่คือหนี้จริง (จ่ายครบ = ไม่ขึ้นรายการ)
  const expPaidLeft = {};   // ใบเบิก 1 ใบจ่ายได้หลาย PO — ปันยอดที่จ่ายแล้วให้ทีละใบตามลำดับ ไม่หักซ้ำ
  (po.data || []).filter((x) => !x.paid_at && (x.status === "received" || x.expense_id)).forEach((x) => {
    const gross = (poTotal[x.po_no] || 0) * (x.vat ? 1.07 : 1);
    let paid = 0;
    if (x.expense_id) {
      if (!(x.expense_id in expPaidLeft)) expPaidLeft[x.expense_id] = Number(expById[x.expense_id]?.paid_amount) || 0;
      paid = Math.min(gross, expPaidLeft[x.expense_id]);
      expPaidLeft[x.expense_id] = Math.round((expPaidLeft[x.expense_id] - paid) * 100) / 100;
    }
    const owed = Math.round((gross - paid) * 100) / 100;
    if (owed <= 0.005) return;
    const qi = x.quote_no ? qInfo[x.quote_no] : null;
    rows.push({
      type: "po", refNo: x.po_no, name: x.supplier || "(ไม่ระบุผู้ขาย)",
      title: x.quote_no ? [
        qi?.customer_id != null && cName[qi.customer_id] ? `👤 ${cName[qi.customer_id]}` : null,
        qi?.title ? `📋 ${qi.title}` : null,
        `อ้างอิง ${x.quote_no}`,
      ].filter(Boolean).join(" · ") : null,
      amount: owed,
      date: (x.created_at || "").slice(0, 10),
      received: !!x.received_at || x.status === "received",   // รับสินค้าแล้วหรือยัง (ตัวกรอง)
      expenseId: x.expense_id || null,                        // ใบจ่าย/ใบเบิกที่ผูก (ลิงก์)
      status: paid > 0 ? `จ่ายแล้ว ${money(paid)} · ค้างจริง ${money(owed)}`
        : x.expense_id ? "ส่งเบิกแล้ว · รอจ่าย" : "รับของแล้ว · ยังไม่ตั้งเบิกจ่าย",
    });
  });
  const poExpIds = new Set((po.data || []).map((x) => x.expense_id).filter(Boolean));
  // ใบเบิกทั่วไปก็เช่นกัน — โชว์เฉพาะยอดที่ยังค้างจริงหลังหักงวดที่จ่ายไปแล้ว
  (exp.data || []).filter((x) => !poExpIds.has(x.id)).forEach((x) => {
    const total = Number(x.amount) || 0;
    const paid = Math.min(total, Number(x.paid_amount) || 0);
    const owed = Math.round((total - paid) * 100) / 100;
    if (owed <= 0.005) return;
    rows.push({
      type: "expense", refNo: `เบิก #${x.id}`, name: cb[x.requester] || cb[x.created_by] || "(ไม่ระบุผู้ขอ)",
      title: x.title || x.category || null, amount: owed,
      date: (x.created_at || "").slice(0, 10),
      status: paid > 0 ? `จ่ายแล้ว ${money(paid)} · ค้างจริง ${money(owed)}` : "อนุมัติแล้ว · รอจ่าย", expenseId: x.id,
    });
  });
  (sp.data || []).forEach((x) => rows.push({
    type: "payout", refNo: `ใบจ่ายซัพ ${(x.id || "").slice(0, 6)}`, name: teamName[x.team] || x.team || "ทีมช่างซัพ",
    title: (x.job_nos || []).join(", ") || null, amount: Number(x.net) || 0,
    date: (x.created_at || "").slice(0, 10), status: "รอจ่าย",
  }));
  (lj.data || []).forEach((j) => {
    const owed = Math.max(0, (Number(j.labor_total) || 0) - (Number(j.labor_paid_amt) || 0));
    if (owed > 0) rows.push({
      type: "labor", refNo: j.job_no, name: teamName[j.assigned_team] || j.assigned_team || "ทีมช่างซัพ",
      title: "ค่าแรงยืนยันแล้ว · ยังไม่อยู่ในใบจ่ายซัพ", amount: owed,
      date: (j.scheduled_at || "").slice(0, 10), status: "ยังไม่ตั้งเบิกจ่าย",
    });
  });
  return rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

// ใบเสนอราคาที่อนุมัติแล้ว (อย่างย่อ) — ตัวเลือก "อ้างอิงใบเสนอราคา" บนใบสั่งซื้อ
export async function listApprovedQuotesLite() {
  const [q, cu] = await Promise.all([
    supabase.from("quotations").select("quote_no,title,customer_id,approved_at").eq("status", "approved").order("approved_at", { ascending: false }).limit(300),
    _allRows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
  ]);
  if (q.error) throw q.error;
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  return (q.data || []).map((x) => ({ quote_no: x.quote_no, label: `${x.quote_no} · ${cn[x.customer_id] || "-"}${x.title ? " · " + x.title : ""}` }));
}

// ส่งใบสั่งซื้อเข้า "ขออนุมัติจ่ายเงิน" ในเมนูเบิกจ่าย — อนุมัติ/จ่าย+เลือกบัญชี ที่เดียวกับการจ่ายอื่นทั้งหมด
// (job_no ปล่อยว่างเสมอ — ต้นทุนงานเข้าทางรับของ+เบิกเข้างานแล้ว ถ้าผูก job จะโดนนับซ้ำใน jobExpenseCost)
export async function requestPoPayment(po) {
  const uid = await _uid();
  const { data: ex, error } = await supabase.from("expense_requests").insert({
    requester: uid, job_no: null, category: "ซื้อสินค้า (PO)",
    title: `ชำระค่าสินค้า ${po.po_no}${po.supplier ? " · " + po.supplier : ""}`,
    amount: Number(po.total) || 0,
    note: `ใบสั่งซื้อ ${po.po_no}${po.quote_no ? " · อ้างอิง " + po.quote_no : ""}${po.vat ? " · ยอดรวม VAT" : ""}`,
    attachments: [], created_by: uid,
  }).select("id").single();
  if (error) throw error;
  // ผูกใบเบิกกับ PO เฉพาะเมื่อยังไม่มีใบเบิกค้าง (optimistic lock) — 2 คนกดพร้อมกันได้ใบเบิกกำพร้าโผล่ค้างจ่าย = เสี่ยงจ่ายซ้ำ
  const { data: u2, error: e2 } = await supabase.from("purchase_orders").update({ expense_id: ex.id }).eq("po_no", po.po_no).is("expense_id", null).select("po_no");
  if (e2) throw new Error(/expense_id|column|PGRST204/i.test(e2.message || "") ? "ยังไม่ได้รัน migration 100 (PO ↔ เบิกจ่าย) ใน Supabase" : (e2.message || e2));
  if (!u2?.length) {
    await supabase.from("expense_requests").delete().eq("id", ex.id);   // ถอนใบเบิกที่เพิ่งสร้าง — ใบนี้มีคนตั้งเบิกไปแล้ว
    throw new Error(`ใบ ${po.po_no} ถูกตั้งเบิกไปแล้ว (มีคนทำพร้อมกัน) — รีเฟรชดูสถานะก่อน`);
  }
  const me = await _meSafe();
  notify(await _usersByRole(["admin", "finance", "exec", "hr"]), { category: "hr", title: `🛒 ${me?.name || "พนักงาน"} ขออนุมัติจ่ายค่าสินค้า ${po.po_no} · ${Number(po.total) || 0} บาท`, body: po.supplier || "", url: "expenses", ref_type: "expense" });
  return ex.id;
}

// จ่ายเจ้าหนี้หลายใบในคราวเดียว (เหมือนใบวางบิลฝั่งซื้อ): เลือก PO ค้างจ่ายของร้านเดียวกันหลายใบ → ตั้งเบิกจ่าย 1 ใบ
// จ่ายครบ = payExpense ประทับ paid_at ทุก PO ที่ผูก (.eq expense_id) · ไม่อนุมัติ = ปลดทุกใบกลับเป็นยังไม่จ่าย — รองรับอยู่แล้วทั้งคู่
// PO ที่ตั้งเบิกรายใบค้างอยู่ (ยังไม่จ่ายเงินสักบาท) เลือกยุบรวมได้ — ใบเบิกเดี่ยวเดิมถูกปิดเป็น "ไม่อนุมัติ" พร้อมหมายเหตุ
export async function requestPoPaymentBatch(pos) {
  const list = (pos || []).filter(Boolean);
  if (!list.length) throw new Error("เลือกใบสั่งซื้ออย่างน้อย 1 ใบ");
  const uid = await _uid();
  // ยุบใบเบิกรายใบเดิม: ต้องยังไม่มีการจ่ายเงินเลยเท่านั้น (จ่ายไปแล้วบางส่วน = ห้ามยุ่ง)
  const oldIds = [...new Set(list.map((p) => p.expense_id).filter(Boolean))];
  if (oldIds.length) {
    const { data: olds } = await supabase.from("expense_requests").select("id,status,paid_amount,title").in("id", oldIds);
    const bad = (olds || []).find((x) => x.status === "paid" || Number(x.paid_amount) > 0);
    if (bad) throw new Error(`ใบเบิกเดิม "${bad.title || "#" + bad.id}" มีการจ่ายเงินไปแล้ว — ยุบรวมไม่ได้ เอาใบสั่งซื้อใบนั้นออกจากรายการก่อน`);
    const { error: eOld } = await supabase.from("expense_requests").update({ status: "rejected", decide_note: "ยุบรวมเข้าใบเบิกจ่ายเจ้าหนี้ใบใหม่ (จ่ายรวมหลาย PO)" }).in("id", oldIds);
    if (eOld) throw eOld;
    await supabase.from("purchase_orders").update({ expense_id: null }).in("expense_id", oldIds);
  }
  const supplier = list[0].supplier || "";
  const total = Math.round(list.reduce((a, p) => a + (Number(p.total) || 0), 0) * 100) / 100;
  const { data: ex, error } = await supabase.from("expense_requests").insert({
    requester: uid, job_no: null, category: "ซื้อสินค้า (PO)",
    title: list.length === 1
      ? `ชำระค่าสินค้า ${list[0].po_no}${supplier ? " · " + supplier : ""}`
      : `ชำระค่าสินค้า ${list.length} ใบ${supplier ? " · " + supplier : ""}`,
    amount: total,
    note: "รวมใบสั่งซื้อ: " + list.map((p) => `${p.po_no} (${(Number(p.total) || 0).toLocaleString("en-US")})`).join(" · "),
    attachments: [], created_by: uid,
  }).select("id").single();
  if (error) throw error;
  // ผูกเฉพาะใบที่ยังว่าง (กันตั้งเบิกซ้ำพร้อมกัน) — ถ้ามีใบไหนถูกชิงตั้งไปแล้ว ถอนใบเบิกใหม่ทิ้งทันที
  const { data: u2, error: e2 } = await supabase.from("purchase_orders").update({ expense_id: ex.id }).in("po_no", list.map((p) => p.po_no)).is("expense_id", null).select("po_no");
  if (e2) throw new Error(/expense_id|column|PGRST204/i.test(e2.message || "") ? "ยังไม่ได้รัน migration 100 (PO ↔ เบิกจ่าย) ใน Supabase" : (e2.message || e2));
  if ((u2 || []).length !== list.length) {
    await supabase.from("purchase_orders").update({ expense_id: null }).eq("expense_id", ex.id);
    await supabase.from("expense_requests").delete().eq("id", ex.id);
    throw new Error("มีใบสั่งซื้อบางใบถูกตั้งเบิกไปแล้ว (มีคนทำพร้อมกัน) — รีเฟรชแล้วเลือกใหม่");
  }
  const me = await _meSafe();
  notify(await _usersByRole(["admin", "finance", "exec", "hr"]), { category: "hr", title: `🏭 ${me?.name || "พนักงาน"} ตั้งเบิกจ่ายเจ้าหนี้ ${list.length} ใบ · ${total.toLocaleString("en-US")} บาท`, body: supplier, url: "expenses", ref_type: "expense" });
  return ex.id;
}

// ---------- CRM: customers (+ contacts + sites) ----------
// fetch every row across pages — adapts to whatever per-request cap the server enforces (uses count to know when done)
async function _fetchAll(build) {
  let from = 0, all = [], total = Infinity;
  while (all.length < total) {
    const { data, count, error } = await build(from, from + 999);
    if (error) throw error;
    if (count != null) total = count;
    if (!data || !data.length) break;
    all = all.concat(data);
    from += data.length;
    if (count == null && data.length < 1000) break;
  }
  return all;
}

export function listCustomers() { return _cached("listCustomers", _loadCustomers, _SHORT_TTL); }
async function _loadCustomers() {
  const [c, cc, cs] = await Promise.all([
    _fetchAll((f, t) => supabase.from("customers").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(f, t)),
    _fetchAll((f, t) => supabase.from("customer_contacts").select("*", { count: "exact" }).order("id").range(f, t)),   // ไม่มี order = แถวซ้ำ/หายระหว่างหน้า
    _fetchAll((f, t) => supabase.from("customer_sites").select("*", { count: "exact" }).order("id").range(f, t)),
  ]);
  const byC = {}, byS = {};
  cc.forEach((x) => { (byC[x.customer_id] = byC[x.customer_id] || []).push(x); });
  cs.forEach((x) => { (byS[x.customer_id] = byS[x.customer_id] || []).push(x); });
  return c.map((cu) => ({ ...cu, contacts: byC[cu.id] || [], sites: byS[cu.id] || [] }));
}

// ค้นลูกค้าเดิมที่ "น่าจะเป็นรายเดียวกัน" — ใช้เตือนก่อนสร้างใหม่ (mig 162 ทำ index ให้ค้นเร็ว)
// ลูกค้ารายเดียวที่ถูกสร้างซ้ำ = ประวัติงาน/ยอดค้างรับ/รอบติดตาม แตกออกจากกัน
// เซลล์เห็นว่า "ไม่เคยซื้อ" ทั้งที่ซื้อไปแล้ว และตามหนี้ผิดคน
const _digits = (s) => String(s || "").replace(/\D/g, "");
const _normName = (s) => String(s || "").toLowerCase().replace(/\s+/g, "")
  .replace(/(บริษัท|หจก\.?|ห้างหุ้นส่วนจำกัด|จำกัด|มหาชน|\(มหาชน\)|co\.?,?ltd\.?|company|limited)/g, "");
export async function findSimilarCustomers(cust) {
  const out = new Map();   // id → { id, name, tax_id, reason }
  const add = (c, reason) => { if (c && String(c.id) !== String(cust?.id || "")) out.set(String(c.id), { ...c, reason }); };

  const tid = _digits(cust?.tax_id);
  const phones = [...(cust?.contacts || []), ...(cust?.sites || [])].map((x) => _digits(x?.phone)).filter((p) => p.length >= 9);
  const name = _normName(cust?.name);

  // ดึงเฉพาะคอลัมน์ที่ต้องใช้ — ต้องผ่าน _fetchAll ไม่งั้นฐานลูกค้าเกิน 1000 รายแล้วเช็คซ้ำไม่เจอเงียบ ๆ
  const all = await _fetchAll((f, t) => supabase.from("customers").select("id,name,tax_id", { count: "exact" }).order("id").range(f, t)).catch(() => []);
  if (tid.length >= 10) all.forEach((c) => { if (_digits(c.tax_id) === tid) add(c, "เลขผู้เสียภาษีตรงกัน"); });
  if (name.length >= 3) all.forEach((c) => { if (_normName(c.name) === name) add(c, "ชื่อตรงกัน"); });

  if (phones.length) {
    const byId = Object.fromEntries(all.map((c) => [String(c.id), c]));
    const hit = async (table, col) => {
      const rows = await _fetchAll((f, t) => supabase.from(table).select("customer_id,phone", { count: "exact" }).not("phone", "is", null).order("id").range(f, t)).catch(() => []);
      rows.forEach((r) => { if (phones.includes(_digits(r.phone))) add(byId[String(r.customer_id)], "เบอร์โทรตรงกัน"); });
    };
    await hit("customer_contacts");
    await hit("customer_sites");
  }
  return [...out.values()].slice(0, 8);
}

// อัปเดตท่อขายเร็ว ๆ จากบอร์ด (เปลี่ยนขั้น/นัดติดตาม/ผู้ดูแล) โดยไม่ต้องเปิดฟอร์มลูกค้าเต็ม · mig 199
// patch = { stage?, next_followup?, owner_id?, est_value?, lost_reason?, source? }
export async function setCustomerPipeline(id, patch) {
  const row = {};
  if (patch.stage !== undefined) row.stage = patch.stage || null;
  if (patch.next_followup !== undefined) row.next_followup = patch.next_followup || null;
  if (patch.owner_id !== undefined) row.owner_id = patch.owner_id || null;
  if (patch.est_value !== undefined) row.est_value = patch.est_value === "" || patch.est_value == null ? null : Number(patch.est_value) || 0;
  if (patch.lost_reason !== undefined) row.lost_reason = patch.lost_reason?.trim() || null;
  if (patch.source !== undefined) row.source = patch.source?.trim() || null;
  if (!Object.keys(row).length) return;
  const { error } = await supabase.from("customers").update(row).eq("id", id);
  if (error) throw error;
  bustCache("listCustomers"); bustCache("listCustomersLite");   // ล้างแคชให้บอร์ด/ลิสต์เห็นค่าล่าสุด
}

export async function saveCustomer(cust, contacts, sites) {
  const { data: { user } } = await supabase.auth.getUser();
  const fields = { type: cust.type, name: cust.name.trim(), address: cust.address?.trim() || null, tax_id: cust.tax_id?.trim() || null, branch: cust.type === "company" ? (cust.branch?.trim() || "สำนักงานใหญ่") : null, email: cust.email?.trim() || null, vat: !!cust.vat, note: cust.note?.trim() || null, credit_days: Math.max(0, Math.round(Number(cust.credit_days) || 0)),
    // ท่อขาย/แหล่งที่มา (mig 199) — undefined = ไม่แตะ (ฟอร์มที่ไม่ได้ส่งค่ามาจะไม่ล้างของเดิม)
    ...(cust.source !== undefined ? { source: cust.source?.trim() || null } : {}),
    ...(cust.stage !== undefined ? { stage: cust.stage || null } : {}),
    ...(cust.owner_id !== undefined ? { owner_id: cust.owner_id || null } : {}),
    ...(cust.next_followup !== undefined ? { next_followup: cust.next_followup || null } : {}),
    ...(cust.est_value !== undefined ? { est_value: cust.est_value === "" || cust.est_value == null ? null : Number(cust.est_value) || 0 } : {}),
    ...(cust.lost_reason !== undefined ? { lost_reason: cust.lost_reason?.trim() || null } : {}) };
  let id = cust.id;
  const preMig = (e) => /credit_days|source|stage|owner_id|next_followup|est_value|lost_reason|branch|PGRST204/i.test(e?.message || "");   // ยังไม่รัน mig 159/199/217 → บันทึกส่วนที่เหลือให้ผ่านไปก่อน
  // ตัดคอลัมน์ที่ต้องรัน migration ก่อน (159 credit_days / 199 ท่อขาย / 217 branch) ออก แล้วบันทึกส่วนที่เหลือให้ผ่าน
  const stripMig = (f) => { const { credit_days, source, stage, owner_id, next_followup, est_value, lost_reason, branch, ...rest } = f; return rest; };
  if (id) {
    let e = (await supabase.from("customers").update(fields).eq("id", id)).error;
    if (e && preMig(e)) e = (await supabase.from("customers").update(stripMig(fields)).eq("id", id)).error;
    if (e) throw e;
  } else {
    let r = await supabase.from("customers").insert({ ...fields, created_by: user?.id || null }).select("id").single();
    if (r.error && preMig(r.error)) r = await supabase.from("customers").insert({ ...stripMig(fields), created_by: user?.id || null }).select("id").single();
    if (r.error) throw r.error; id = r.data.id;
  }
  await supabase.from("customer_contacts").delete().eq("customer_id", id);
  const cRows = contacts.filter((x) => (x.name || x.phone)).map((x) => ({ customer_id: id, name: x.name?.trim() || null, phone: x.phone?.trim() || null, role: x.role?.trim() || null }));
  if (cRows.length) { const e = (await supabase.from("customer_contacts").insert(cRows)).error; if (e) throw e; }
  // ---- ไซต์งาน: อัปเดตรายแถว ห้ามลบทิ้งแล้วสร้างใหม่ ----
  // เอกสารทุกชนิด (BOQ/ใบเสนอ/ใบส่งของ/ใบเสร็จ/ใบงาน/ใบวางบิล) อ้าง site_id แบบ on delete set null
  // ⇒ ถ้าลบแถวไซต์ เอกสารเก่า "ลืมไซต์" ถาวรกู้ไม่ได้ แค่เพราะแก้เบอร์โทรผู้ติดต่อ
  const keep = sites.filter((x) => (x.site_name || x.address || x.contact_name || x.phone || x.map_url));
  const row = (x) => ({ customer_id: id, site_name: x.site_name?.trim() || null, address: x.address?.trim() || null, map_url: x.map_url?.trim() || null, contact_name: x.contact_name?.trim() || null, phone: x.phone?.trim() || null });
  const keptIds = keep.map((x) => x.id).filter(Boolean);
  // ลบเฉพาะไซต์ที่ผู้ใช้เอาออกจากฟอร์มจริง ๆ
  let delQ = supabase.from("customer_sites").delete().eq("customer_id", id);
  if (keptIds.length) delQ = delQ.not("id", "in", `(${keptIds.join(",")})`);
  { const e = (await delQ).error; if (e) throw e; }
  for (const s of keep) {
    if (s.id) { const e = (await supabase.from("customer_sites").update(row(s)).eq("id", s.id)).error; if (e) throw e; }
    else { const e = (await supabase.from("customer_sites").insert(row(s))).error; if (e) throw e; }
  }
  return id;
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

// bulk import customers (each row = {cust, contacts[], sites[]}). Inserts new records.
export async function bulkImportCustomers(rows) {
  let ok = 0; const errors = [];
  const CHUNK = 15; // run in small concurrent batches; one bad row no longer aborts the whole import
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const res = await Promise.all(slice.map(async (r, j) => {
      try { await saveCustomer(r.cust, r.contacts || [], r.sites || []); return true; }
      catch (e) { errors.push(`แถว ${i + j + 1} (${r.cust?.name || "-"}): ${e.message || e}`); return false; }
    }));
    ok += res.filter(Boolean).length;
  }
  if (errors.length) console.warn("bulkImportCustomers — รายที่ล้มเหลว:", errors);
  return { ok, failed: errors.length, errors };
}

// ---------- SUPPLIERS (ข้อมูลผู้ขาย · โครงเดียวกับลูกค้า) ----------
export function listSuppliers() { return _cached("listSuppliers", _loadSuppliers, _SHORT_TTL); }
async function _loadSuppliers() {
  const [s, sc, ss] = await Promise.all([
    _fetchAll((f, t) => supabase.from("suppliers").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(f, t)),
    _fetchAll((f, t) => supabase.from("supplier_contacts").select("*", { count: "exact" }).order("id").range(f, t)),   // ไม่มี order = แถวซ้ำ/หายระหว่างหน้า
    _fetchAll((f, t) => supabase.from("supplier_sites").select("*", { count: "exact" }).order("id").range(f, t)),
  ]);
  const byC = {}, byS = {};
  sc.forEach((x) => { (byC[x.supplier_id] = byC[x.supplier_id] || []).push(x); });
  ss.forEach((x) => { (byS[x.supplier_id] = byS[x.supplier_id] || []).push(x); });
  return s.map((su) => ({ ...su, contacts: byC[su.id] || [], sites: byS[su.id] || [] }));
}
export async function saveSupplier(sup, contacts, sites) {
  const { data: { user } } = await supabase.auth.getUser();
  const fields = { type: sup.type, name: sup.name.trim(), address: sup.address?.trim() || null, tax_id: sup.tax_id?.trim() || null, email: sup.email?.trim() || null, vat: !!sup.vat, note: sup.note?.trim() || null,
    bank_name: sup.bank_name?.trim() || null, bank_account: sup.bank_account?.trim() || null, bank_holder: sup.bank_holder?.trim() || null };
  const _stripBank = (f) => { const c = { ...f }; delete c.bank_name; delete c.bank_account; delete c.bank_holder; return c; };  // pre-113 fallback
  let id = sup.id;
  if (id) {
    let e = (await supabase.from("suppliers").update(fields).eq("id", id)).error;
    if (e && /bank_/i.test(e.message || "")) e = (await supabase.from("suppliers").update(_stripBank(fields)).eq("id", id)).error;
    if (e) throw e;
  } else {
    let r = await supabase.from("suppliers").insert({ ...fields, created_by: user?.id || null }).select("id").single();
    if (r.error && /bank_/i.test(r.error.message || "")) r = await supabase.from("suppliers").insert({ ..._stripBank(fields), created_by: user?.id || null }).select("id").single();
    if (r.error) throw r.error; id = r.data.id;
  }
  await supabase.from("supplier_contacts").delete().eq("supplier_id", id);
  const cRows = contacts.filter((x) => (x.name || x.phone)).map((x) => ({ supplier_id: id, name: x.name?.trim() || null, phone: x.phone?.trim() || null, role: x.role?.trim() || null }));
  if (cRows.length) { const e = (await supabase.from("supplier_contacts").insert(cRows)).error; if (e) throw e; }
  await supabase.from("supplier_sites").delete().eq("supplier_id", id);
  const sRows = sites.filter((x) => (x.site_name || x.address || x.contact_name || x.phone || x.map_url)).map((x) => ({ supplier_id: id, site_name: x.site_name?.trim() || null, address: x.address?.trim() || null, map_url: x.map_url?.trim() || null, contact_name: x.contact_name?.trim() || null, phone: x.phone?.trim() || null }));
  if (sRows.length) { const e = (await supabase.from("supplier_sites").insert(sRows)).error; if (e) throw e; }
  return id;
}
export async function deleteSupplier(id, reason) {
  const { data: snap } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "supplier", target_no: snap?.name || String(id), reason: reason || null, snapshot: snap }).catch(() => {});
}

// ---------- BOQ (ใบประมาณการต้นทุน) ----------
// ทุก select ในสายเอกสารขายต้องผ่าน _fetchAll — เกิน 1000 ใบเมื่อไหร่ ใบเก่าหาย + ตัวล็อกโซ่ (hasQuote/hasReceipt/ยอดวางบิล) คำนวณผิดเงียบ ๆ
const _allRows = (build) => _fetchAll(build).then((rows) => ({ data: rows }));

// ---------- ดึงเอกสารแบบเจาะจงใบ (แทนที่จะโหลดทั้งบริษัทแล้วมา .find() ในเบราว์เซอร์) ----------
// พรีวิวแผงขวา/เปิดจากลิงก์ ต้องการเอกสารใบเดียว แต่เดิมเรียก listQuotations() = อ่าน 7 ตารางเต็ม
// ทุกใบพร้อมรายการทุกบรรทัด เพื่อเอามาใบเดียว — โตขึ้นทุกวัน วันหนึ่งกดพรีวิวทีนึงรอเป็นสิบวินาที
// ⚠️ ตั้งใจไม่ทำ view สรุปยอดใน SQL: ยอดทุกใบคำนวณจากรายการรายบรรทัดด้วยสูตร JS (ปัดเศษราคาบัตร +
//    ส่วนลดรายบรรทัด) ถ้าเขียนสูตรซ้ำใน SQL ตัวเลขแดชบอร์ดจะเพี้ยนจากตัวใบเมื่อสูตรฝั่งใดฝั่งหนึ่งถูกแก้
//    → คงสูตรเดิมไว้ที่เดียว แล้วลด "จำนวนแถวที่ดึงมา" แทน
const _scopeNos = (opts) => {
  const a = opts && opts.nos;
  if (!Array.isArray(a) || !a.length) return null;
  const u = [...new Set(a.filter(Boolean))];
  return u.length && u.length <= 200 ? u : null;   // เกิน 200 = URL ยาวเกิน PostgREST → กลับไปโหลดเต็มปลอดภัยกว่า
};
// nos = null → ไม่กรอง (โหลดเต็ม) · [] → ต้องได้ 0 แถว จึงยิง sentinel ที่ไม่มีทางตรงกับเลขเอกสารจริง
// (ห้ามใช้ NUL เป็น sentinel — Postgres เก็บใน text ไม่ได้ query จะพังแทนที่จะคืน 0 แถว)
const _onlyNos = (q, col, nos) => (nos ? q.in(col, nos.length ? nos : ["__none__"]) : q);
// รายการเลข/ไอดีที่จะเอาไปกรอง — เกิน 200 ตัว URL จะยาวเกินที่ PostgREST รับ → คืน null = โหลดเต็ม
// ผลลัพธ์ยังถูกเสมอ แค่ไม่ได้ประหยัด (เท่าพฤติกรรมเดิม) ไม่ใช่การตัดข้อมูลทิ้ง
const _capNos = (arr) => {
  const u = [...new Set((arr || []).filter((v) => v != null))];
  return u.length <= 200 ? u : null;
};

// ---------- กรอง "ตั้งแต่วันที่" ฝั่งเซิร์ฟเวอร์ (ใช้กับแดชบอร์ด) ----------
// ด้านเดียวเสมอ (from อย่างเดียว ไม่มี to) — เพราะ approved_at/created_at เป็น timestamptz
// การใส่ .lte(to) จะตัดงานของวันสุดท้ายทิ้งทั้งวัน (bind เป็น 00:00) ไม่ตรงกับ inRange ฝั่งจอที่นับวันสุดท้ายด้วย
// → ตัดปลายทางฝั่งจอเหมือนเดิม ฝั่งเซิร์ฟเวอร์ตัดแค่หัวเท่านั้น
//
// ⚠️ ต้อง OR หลายคอลัมน์: ใบเสนอที่ "ออกก่อนช่วง แต่อนุมัติในช่วง" คือใบที่การ์ดยอดขายนับ ถ้ากรองด้วย
//    issue_date อย่างเดียวจะหายไป · และใบเก่าก่อน mig 119 ที่ issue_date เป็น NULL จะถูกตัดทิ้งเงียบ ๆ
//    (NULL >= วันที่ = NULL = ไม่ผ่าน) จึงต้องมี created_at ซึ่ง not null เป็นตัวรับท้าย
const _sinceOf = (opts) => {
  const s = opts && opts.since;
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const _orSince = (q, cols, since) => (since ? q.or(cols.map((c) => `${c}.gte.${since}`).join(",")) : q);
const _idsOf = (rows, col) => [...new Set((rows || []).map((r) => r[col]).filter((v) => v != null))];
// ids = null (ไม่ได้เจาะจง) → โหลดเต็มเหมือนเดิม · [] (เจาะจงแต่ไม่มีใบไหนอ้างถึง) → ต้องได้ 0 แถว ไม่ใช่ทั้งตาราง
const _onlyIds = (q, col, ids) => (ids == null ? q : q.in(col, ids.length ? ids : [-1]));

// เลขเอกสารซ้ำไหม — ต้องเช็คก่อนบันทึกใบใหม่ทุกครั้ง เพราะ save เป็น upsert ที่ "ทับใบเดิมเงียบ ๆ" ถ้าเลขชนกัน
// (เลขจาก genNo ละเอียดระดับวินาที แต่ 2 เครื่องกดพร้อมกัน หรือพิมพ์เลขมือซ้ำ ก็ยังชนได้)
const _DOC_NO_COL = { boqs: "boq_no", quotations: "quote_no", invoices: "invoice_no", receipts: "receipt_no", billing_notes: "billing_no", purchase_orders: "po_no", material_preps: "prep_no", adjustment_notes: "note_no" };
export async function docNoTaken(table, no) {
  const col = _DOC_NO_COL[table];
  if (!col || !no) return false;
  const { count, error } = await supabase.from(table).select(col, { count: "exact", head: true }).eq(col, no);
  if (error) throw error;
  return (count || 0) > 0;
}

// สร้างใบเสนอราคาย้อนหลังจากใบงาน (ลูกค้าเก่าก่อนใช้ระบบ) — งานมีต้นทุนจริงแต่ไม่มีใบเสนอให้คิดกำไร
// ทำตามสายเอกสาร: สร้าง BOQ → ใบเสนอ(อนุมัติ ลงวันที่ตามใบงาน) → ผูก quote_no กลับใบงาน
// saleAmount = ราคาขายก่อน VAT · ทำเป็นบรรทัดเดียว kind=service "งานเดิม (ก่อนใช้ระบบ)"
export async function backfillQuoteForJob(jo, { saleAmount, vat = false } = {}) {
  const amt = Number(saleAmount) || 0;
  if (amt <= 0) throw new Error("กรอกราคาขาย (ก่อน VAT) มากกว่า 0");
  if (!jo || !jo.job_no) throw new Error("ไม่พบใบงาน");
  if (jo.quote_no) throw new Error("ใบงานนี้มีใบเสนอราคาผูกอยู่แล้ว");
  const date = jo.issue_date || _today();
  const p2 = (n) => String(n).padStart(2, "0");
  const stamp = () => { const d = new Date(); return `${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`; };
  const uniqueNo = async (table, prefix) => { const base = prefix + stamp(); let n = base, i = 1; while (await docNoTaken(table, n)) n = base + "-" + (++i); return n; };
  const lineName = `งานเดิม (ก่อนใช้ระบบ) · ${jo.job_no}`;
  const jt = jo.job_type || "other";
  const boqNo = await uniqueNo("boqs", "BOQ-");
  await saveBoq(
    { boq_no: boqNo, customer_id: jo.customer_id || null, site_id: jo.site_id || null, issue_date: date, job_type: jt, title: jo.title || "งานเดิม (ก่อนใช้ระบบ)", note: `สร้างย้อนหลังจากใบงาน ${jo.job_no}`, status: "open" },
    [{ section: "service", code: "", name: lineName, description: "", unit: "งาน", qty: 1, unit_cost: 0 }]
  );
  const quoteNo = await uniqueNo("quotations", "QT-");
  await saveQuotation(
    { quote_no: quoteNo, customer_id: jo.customer_id || null, site_id: jo.site_id || null, boq_no: boqNo, title: jo.title || "งานเดิม (ก่อนใช้ระบบ)", status: "approved", approved_at: date, job_type: jt, issue_date: date, discount_type: "amount", discount_value: 0, vat: !!vat, wht: false, wht_rate: 3, pay_method: "cash", note: `ใบเสนอราคาย้อนหลัง — สร้างจากใบงาน ${jo.job_no} (งานก่อนใช้ระบบ)` },
    [{ code: "", name: lineName, kind: "service", description: "", unit: "งาน", qty: 1, unit_price: amt, discount: 0 }]
  );
  // ผูกกลับใบงาน — อัปเดตคอลัมน์เดียว (ไม่ผ่าน saveJobOrder เพื่อไม่เขียนทับ field อื่น/ไม่คิดสถานะใหม่)
  const { error } = await supabase.from("job_orders").update({ quote_no: quoteNo }).eq("job_no", jo.job_no);
  if (error) throw error;
  return { boqNo, quoteNo };
}
export function listBoqs(opts = {}) { return _cached("listBoqs:" + JSON.stringify(opts || {}), () => _loadBoqs(opts), _SHORT_TTL); }
async function _loadBoqs(opts = {}) {
  const nos = _scopeNos(opts);
  const bP = _allRows((f, t) => _onlyNos(supabase.from("boqs").select("*", { count: "exact" }), "boq_no", nos).order("created_at", { ascending: false }).order("boq_no").range(f, t));
  // เจาะจงใบ → ต้องรู้ customer_id/site_id ของใบนั้นก่อน จึงรอหัวใบมาก่อน · โหลดทั้งหมด → ไม่ต้องรอ ยิงขนานเหมือนเดิม
  const b = nos ? await bP : { data: [] };
  if (b.error) throw b.error;
  const cids = _idsOf(b.data, "customer_id"), sids = _idsOf(b.data, "site_id");
  const [it, cu, si, ct, qt] = await Promise.all([
    // ห้ามอ่านทั้งตารางตรง ๆ — Supabase ตัดที่ 1000 แถว รายการใบใหม่ (id ท้ายตาราง) จะหายทั้งที่บันทึกสำเร็จ
    _allRows((f, t) => _onlyNos(supabase.from("boq_items").select("*", { count: "exact" }), "boq_no", nos).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("*", { count: "exact" }), "id", nos && cids).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }), "id", nos && sids).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }), "customer_id", nos && cids).order("id").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("quotations").select("quote_no,boq_no,status", { count: "exact" }), "boq_no", nos).order("quote_no").range(f, t)),
  ]);
  const bR = nos ? b : await bP;
  if (bR.error) throw bR.error;
  if (it.error) throw it.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (qt.error) throw qt.error;
  const byBoq = {}; (it.data || []).forEach((x) => { (byBoq[x.boq_no] = byBoq[x.boq_no] || []).push(x); });
  const custName = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const custAddr = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const custTax = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const custBranch = Object.fromEntries((cu.data || []).map((c) => [c.id, c.branch]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  // linked (non-cancelled) quote per BOQ + whether any of them is approved (drives the edit lock)
  const quoteByBoq = {}; (qt.data || []).forEach((q) => {
    if (!q.boq_no || q.status === "cancelled") return;
    const e = quoteByBoq[q.boq_no] || (quoteByBoq[q.boq_no] = { no: q.quote_no, approved: false });
    if (q.status === "approved") { e.approved = true; e.no = q.quote_no; }
  });
  const cb = await _creators(nos ? _idsOf(bR.data, "created_by") : null);
  return (bR.data || []).map((bo) => {
    const items = byBoq[bo.boq_no] || [];
    const ct0 = cc[bo.customer_id];
    const s = bo.site_id ? sm[bo.site_id] : null;
    return { ...bo, customerName: custName[bo.customer_id] || null, customerCode: bo.customer_id || null,
      customerAddr: custAddr[bo.customer_id] || null, customerTaxId: custTax[bo.customer_id] || null,
      siteName: s?.site_name || null, siteAddress: s?.address || null, createdByName: cb[bo.created_by] || null,
      mapUrl: (s && s.map_url) || _gmap(s?.address || custAddr[bo.customer_id]),
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      quoteNo: quoteByBoq[bo.boq_no]?.no || null, hasQuote: !!quoteByBoq[bo.boq_no], quoteApproved: !!quoteByBoq[bo.boq_no]?.approved,
      items, total: items.reduce((a, x) => a + Number(x.qty) * Number(x.unit_cost), 0) };
  });
}

// ---------- COMPANY PROFILE (หัวเอกสาร 2 ชุด: id=1 มี VAT · id=2 ไม่มี VAT) ----------
export function getCompanies() {
  return _cached("companies", async () => {
    const { data, error } = await supabase.from("company_profile").select("*").in("id", [1, 2]);
    if (error) throw error;
    const m = {}; (data || []).forEach((r) => { m[r.id === 2 ? "novat" : "vat"] = r; });
    return { vat: m.vat || {}, novat: m.novat || {} };
  });
}
// kind: "vat" (id=1) | "novat" (id=2)
export async function saveCompany(c, kind) {
  const id = kind === "novat" ? 2 : 1;
  const row = {
    id, name: c.name?.trim() || null, branch: c.branch?.trim() || null, address: c.address?.trim() || null,
    tax_id: c.tax_id?.trim() || null, phone: c.phone?.trim() || null, email: c.email?.trim() || null,
    website: c.website?.trim() || null, line_id: c.line_id?.trim() || null, logo_url: c.logo_url?.trim() || null, bank_info: c.bank_info?.trim() || null, default_terms: c.default_terms?.trim() || null,
  };
  let { error } = await supabase.from("company_profile").upsert(row, { onConflict: "id" });
  if (error && /line_id|logo_url|PGRST204/i.test(error.message || "")) { delete row.line_id; if (/logo_url/i.test(error.message || "")) delete row.logo_url; ({ error } = await supabase.from("company_profile").upsert(row, { onConflict: "id" })); } // pre-224 fallback
  if (error) throw error;
  bustCache("companies");
}

// ═══════════════════════════════════════════════════════════════════════════
// ระบบบัญชีคู่ (Double-entry) — อ่านผังบัญชี/กิจการ · ลงสมุดรายวัน · งบทดลอง
// ตาราง acc_* (migration 225) · entity = 'company' (บริษัท VAT) | 'personal' (บุคคล)
// ═══════════════════════════════════════════════════════════════════════════
export function listAccEntities() {
  return _cached("accEntities", async () => {
    const { data, error } = await supabase.from("acc_entities").select("*").order("sort");
    if (error) throw error;
    return data || [];
  });
}
export function listAccChart() {
  return _cached("accChart", async () => {
    const { data, error } = await supabase.from("acc_accounts").select("*").order("sort");
    if (error) throw error;
    return data || [];
  });
}
// สมุดรายวัน + บรรทัด ในช่วงวันที่ (กรองกิจการได้: 'all'|'company'|'personal') — ดึงครบทุกหน้า (กันเพดาน 1000)
export async function listJournal({ entity = "all", from, to } = {}) {
  const build = (f, t) => {
    let q = supabase.from("acc_journal").select("*, lines:acc_journal_lines(*)", { count: "exact" })
      .neq("status", "void").order("jdate", { ascending: false }).order("id", { ascending: false });
    if (entity && entity !== "all") q = q.eq("entity", entity);
    if (from) q = q.gte("jdate", from);
    if (to)   q = q.lte("jdate", to);
    return q.range(f, t);
  };
  return await _fetchAll(build);
}
// ลงรายการสมุดรายวัน (บันทึกหัว + บรรทัด) — ต้องเดบิต=เครดิต และมีอย่างน้อย 2 บรรทัด
export async function postJournal({ entity, jdate, ref_type = "manual", ref_no = null, memo = null, source = "manual", lines = [] }) {
  const cleaned = (lines || [])
    .map((l) => ({ account_code: String(l.account_code || "").trim(), debit: Math.round((Number(l.debit) || 0) * 100) / 100, credit: Math.round((Number(l.credit) || 0) * 100) / 100, memo: l.memo?.trim() || null }))
    .filter((l) => l.account_code && (l.debit > 0 || l.credit > 0));
  if (!entity || !["company", "personal"].includes(entity)) throw new Error("เลือกกิจการ (บริษัท/บุคคล)");
  if (!jdate) throw new Error("ระบุวันที่");
  if (cleaned.length < 2) throw new Error("ต้องมีอย่างน้อย 2 บรรทัด");
  const sumD = cleaned.reduce((s, l) => s + l.debit, 0);
  const sumC = cleaned.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(sumD - sumC) > 0.009) throw new Error(`เดบิต (${sumD.toLocaleString()}) ≠ เครดิต (${sumC.toLocaleString()}) — ต้องเท่ากัน`);
  const period = String(jdate).slice(0, 7);
  const { data: head, error: e1 } = await supabase.from("acc_journal")
    .insert({ entity, jdate, period, ref_type, ref_no, memo: memo?.trim() || null, source, status: "posted" })
    .select("id").single();
  if (e1) throw e1;
  const rows = cleaned.map((l, i) => ({ journal_id: head.id, account_code: l.account_code, entity, debit: l.debit, credit: l.credit, memo: l.memo, line_no: i + 1 }));
  const { error: e2 } = await supabase.from("acc_journal_lines").insert(rows);
  if (e2) { await supabase.from("acc_journal").delete().eq("id", head.id); throw e2; } // rollback หัวถ้าบรรทัดพัง
  return head.id;
}
// ยกเลิกรายการ (คงไว้เพื่อ audit — เปลี่ยนสถานะเป็น void ไม่ลบจริง)
export async function voidJournal(id) {
  const { error } = await supabase.from("acc_journal").update({ status: "void" }).eq("id", id);
  if (error) throw error;
}
// ล้างรายการที่ระบบลงอัตโนมัติ (source='auto') ในช่วงวันที่ — ไม่แตะรายการที่ลงเอง (manual)
// ใช้ก่อนลงใหม่ เมื่อกติกาเปลี่ยน/เลขเพี้ยนจากการดึงหลายรอบ · บรรทัดลบตาม (ON DELETE CASCADE)
export async function clearAutoJournal({ from, to } = {}) {
  let q = supabase.from("acc_journal").delete().eq("source", "auto");
  if (from) q = q.gte("jdate", from);
  if (to) q = q.lte("jdate", to);
  const { error } = await q;
  if (error) throw error;
}

// จับประเภทรายได้จากชื่อ/รายละเอียดรายการ → รหัสบัญชีรายได้ 4010–4060
function _revAccountOf(it) {
  if ((it.kind || "") === "ac") return "4010";
  const s = ((it.name || "") + " " + (it.description || "")).toLowerCase();
  if (/ล้าง|ทำความสะอาด|clean/.test(s)) return "4030";
  if (/ย้าย|ถอดย้าย|move|relocat/.test(s)) return "4050";
  if (/ซ่อม|เซอร์วิส|service|repair|เช็ค|ตรวจเช็ค|เติมน้ำยา|อะไหล่/.test(s)) return "4040";
  if (/ติดตั้ง|เดินท่อ|เดินสาย|install|set\b/.test(s)) return "4020";
  return "4060";
}

// จับหมวดค่าใช้จ่ายจาก category/title → รหัสบัญชีค่าใช้จ่าย
function _expAccountOf(text, hasJob) {
  const s = (text || "").toLowerCase();
  if (/น้ำมัน|เชื้อเพลิง|ค่าเดินทาง|ทางด่วน|ค่าทาง|fuel|ค่ารถ/.test(s)) return "5050";
  if (/อะไหล่|วัสดุ|ซื้อของ|material|part|ท่อ|น้ำยา/.test(s)) return "5020";
  if (/ค่าน้ำ|ค่าไฟ|ไฟฟ้า|ประปา|โทรศัพท์|โทรสัพท์|เน็ต|internet|มือถือ/.test(s)) return "7030";
  if (/เช่า|rent/.test(s)) return "7020";
  if (/เครื่องมือ|tool|สว่าน|อุปกรณ์ช่าง/.test(s)) return "7040";
  if (/การตลาด|โฆษณา|ยิงแอด|โปรโมท|marketing|\bad\b|เฟส|facebook/.test(s)) return "6030";
  if (/คอมมิช|commission|คอมมิสชั่น/.test(s)) return "6020";
  if (/บัญชี|สอบบัญชี|ที่ปรึกษา|ทนาย|กฎหมาย/.test(s)) return "7050";
  if (/ธรรมเนียม|\bfee\b|ค่าธรรมเนียม|ธนาคาร/.test(s)) return "7070";
  return hasJob ? "5020" : "7090";   // ผูกงาน = ต้นทุนวัสดุ · ไม่ผูก = เบ็ดเตล็ด (บริหาร)
}

// จับชนิดต้นทุนสินค้าจาก material → รหัสบัญชี COGS แยกชนิด (แอร์/วัสดุ/อุปกรณ์เสริม/อะไหล่)
function _matCogsAccount(mat, catName) {
  if (!mat) return "5011";
  if (mat.kind === "ac") return "5010";
  const s = ((catName || "") + " " + (mat.name_th || "")).toLowerCase();
  if (/อะไหล่|อะหลั่ย|spare|\bpart/.test(s)) return "5013";
  if (/อุปกรณ์เสริม|เสริม|accessor|อุปกรณ์/.test(s)) return "5012";
  return "5011";
}

// ── ลงบัญชีอัตโนมัติฝั่งจ่าย: PO(จ่ายตรง) + เบิกจ่าย + ช่างซัพ (เกณฑ์เงินสด: เฉพาะที่จ่ายแล้ว) ──
// entity: ผูก quote/งาน → ตาม VAT ของใบเสนอ · ไม่ผูก → บริษัท · ภาษีซื้อ(1300) เฉพาะบริษัท
export async function autoPostExpenses({ from, to } = {}) {
  const _d = (ts) => (ts ? String(ts).slice(0, 10) : null);
  const inR = (d) => d && (!from || d >= from) && (!to || d <= to);
  const [exp, po, poItems, payouts, jobs, quotes, posted] = await Promise.all([
    _fetchAll((f, t) => supabase.from("expense_requests").select("id,title,category,job_no,amount,paid_amount,status,decided_at,last_paid_at,paid_at,created_at", { count: "exact" }).in("status", ["approved", "paid"]).order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("purchase_orders").select("po_no,supplier,quote_no,status,vat,paid_at,expense_id,created_at", { count: "exact" }).order("po_no").range(f, t)),
    _fetchAll((f, t) => supabase.from("po_items").select("po_no,qty,price", { count: "exact" }).order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("sub_payouts").select("id,team,net,status,paid_at,created_at", { count: "exact" }).eq("status", "paid").order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("job_orders").select("job_no,quote_no", { count: "exact" }).order("job_no").range(f, t)),
    _fetchAll((f, t) => supabase.from("quotations").select("quote_no,vat", { count: "exact" }).order("quote_no").range(f, t)),
    _fetchAll((f, t) => supabase.from("acc_journal").select("ref_type,ref_no", { count: "exact" }).in("ref_type", ["po", "po_pay", "expense", "payout"]).neq("status", "void").range(f, t)),
  ]);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const jobQuote = {}; jobs.forEach((j) => { if (j.quote_no) jobQuote[j.job_no] = j.quote_no; });
  const quoteVat = {}; quotes.forEach((q) => { quoteVat[q.quote_no] = q.vat; });
  const poTotal = {}; poItems.forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + Number(it.qty) * Number(it.price); });
  const poItemsByPo = {}; poItems.forEach((it) => { (poItemsByPo[it.po_no] ||= []).push(it); });
  // แยกชนิดต้นทุนสินค้า: โหลด materials + หมวด สำหรับ material_code ที่มีใน PO
  const codes = [...new Set(poItems.map((x) => x.material_code).filter(Boolean))];
  const [cats, mats] = await Promise.all([
    listCategories().catch(() => []),
    codes.length ? _fetchAll((f, t) => supabase.from("materials").select("code,kind,category,name_th", { count: "exact" }).in("code", codes).order("code").range(f, t)) : Promise.resolve([]),
  ]);
  const catName = {}; (cats || []).forEach((c) => { catName[c.id] = c.name; });
  const matByCode = {}; (mats || []).forEach((m) => { matByCode[m.code] = m; });
  const matAcct = (code) => { const m = matByCode[code]; return _matCogsAccount(m, m ? catName[m.category] : ""); };
  const expById = {}; exp.forEach((x) => { expById[x.id] = x; });
  const poLinkedExp = new Set(po.map((p) => p.expense_id).filter(Boolean));   // ใบเบิกที่เป็นการจ่าย PO → PO คุมแทน
  const done = new Set(posted.map((x) => x.ref_type + ":" + x.ref_no));
  const entOf = (quote_no, job_no) => { const qn = quote_no || (job_no && jobQuote[job_no]); const v = qn != null ? quoteVat[qn] : undefined; return v === false ? "personal" : "company"; };
  const bank = (ent) => (ent === "company" ? "1020" : "1021");

  const tasks = [];
  // 1) PO — ตั้งเจ้าหนี้เมื่อ "อนุมัติจ่ายแล้ว" (จ่ายตรง หรือใบเบิกที่ผูก approved/paid) · จ่ายแล้ว → ตัดเจ้าหนี้
  po.forEach((p) => {
    if (p.status === "cancelled") return;
    const base = r2(poTotal[p.po_no] || 0); if (base <= 0.005) return;
    const entity = entOf(p.quote_no, null);
    const vat = p.vat && entity === "company" ? r2(base * 0.07) : 0;
    const total = r2(base + vat);
    const e = p.expense_id ? expById[p.expense_id] : null;
    const approved = !!p.paid_at || (e && (e.status === "approved" || e.status === "paid"));
    if (!approved) return;   // PO ที่ยังไม่อนุมัติจ่าย → ยังไม่ตั้งเจ้าหนี้
    // ตั้งเจ้าหนี้ ณ วันอนุมัติจ่าย (Dr ต้นทุนแยกชนิด + ภาษีซื้อ · Cr เจ้าหนี้การค้า 2010)
    const apDate = p.paid_at ? _d(p.paid_at) : _d(e?.decided_at || e?.created_at || p.created_at);
    if (inR(apDate) && !done.has("po:" + p.po_no)) {
      const perAcct = {};
      (poItemsByPo[p.po_no] || []).forEach((it) => { const g = (Number(it.qty) || 0) * (Number(it.price) || 0); if (g > 0) { const a = matAcct(it.material_code); perAcct[a] = (perAcct[a] || 0) + g; } });
      let cogs = Object.entries(perAcct).map(([a, g]) => ({ a, amt: r2(g) }));
      if (!cogs.length) cogs = [{ a: "5020", amt: base }];
      const drift = r2(base - cogs.reduce((s, x) => s + x.amt, 0));
      if (Math.abs(drift) >= 0.01) { cogs.sort((x, y) => y.amt - x.amt); cogs[0].amt = r2(cogs[0].amt + drift); }
      const lines = cogs.map((x) => ({ account_code: x.a, debit: x.amt, credit: 0 }));
      if (vat > 0.005) lines.push({ account_code: "1300", debit: vat, credit: 0, memo: "ภาษีซื้อ" });
      lines.push({ account_code: "2010", debit: 0, credit: total });
      tasks.push({ entity, jdate: apDate, ref_type: "po", ref_no: p.po_no, memo: `เจ้าหนี้ PO ${p.po_no}${p.supplier ? " · " + p.supplier : ""}`, lines });
    }
    // จ่ายเจ้าหนี้ (จ่ายจริงแล้ว) → Dr เจ้าหนี้ · Cr ธนาคาร
    const paid = !!p.paid_at || (e && e.status === "paid");
    if (paid) {
      const payDate = p.paid_at ? _d(p.paid_at) : _d(e.last_paid_at || e.paid_at || e.created_at);
      if (inR(payDate) && !done.has("po_pay:" + p.po_no)) {
        tasks.push({ entity, jdate: payDate, ref_type: "po_pay", ref_no: p.po_no, memo: `จ่ายเจ้าหนี้ PO ${p.po_no}${p.supplier ? " · " + p.supplier : ""}`, lines: [{ account_code: "2010", debit: total, credit: 0 }, { account_code: bank(entity), debit: 0, credit: total }] });
      }
    }
  });
  // 2) เบิกจ่ายทั่วไป (ไม่ผูก PO) — เกณฑ์เงินสด: จ่ายแล้ว → ค่าใช้จ่ายตามหมวด
  exp.forEach((x) => {
    if (poLinkedExp.has(x.id)) return;   // ใบเบิกที่จ่าย PO → PO คุมแล้ว
    const paid = r2(x.paid_amount); if (paid <= 0.005) return;
    const jdate = _d(x.last_paid_at || x.paid_at || x.created_at); if (!inR(jdate)) return;
    if (done.has("expense:" + x.id)) return;
    const entity = entOf(null, x.job_no);
    tasks.push({ entity, jdate, ref_type: "expense", ref_no: String(x.id), memo: `เบิกจ่าย: ${x.title || ""}${x.job_no ? " · งาน " + x.job_no : ""}`, lines: [{ account_code: _expAccountOf((x.category || "") + " " + (x.title || ""), !!x.job_no), debit: paid, credit: 0 }, { account_code: bank(entity), debit: 0, credit: paid }] });
  });
  // 3) ช่างซัพ (จ่ายแล้ว) → ค่าแรงช่างซัพ = ต้นทุนบริการ (5040) · กิจการ = บริษัท
  payouts.forEach((x) => {
    const amt = r2(x.net); if (amt <= 0.005) return;
    const jdate = _d(x.paid_at || x.created_at); if (!inR(jdate)) return;
    if (done.has("payout:" + x.id)) return;
    tasks.push({ entity: "company", jdate, ref_type: "payout", ref_no: String(x.id), memo: "จ่ายค่าแรงช่างซัพ", lines: [{ account_code: "5040", debit: amt, credit: 0 }, { account_code: "1020", debit: 0, credit: amt }] });
  });

  let ok = 0; const errs = [];
  for (const t of tasks) {
    try { await postJournal({ ...t, source: "auto" }); ok++; }
    catch (e) { errs.push(`${t.ref_type} ${t.ref_no}: ${e.message || e}`); }
  }
  return { posted: ok, total: tasks.length, errors: errs };
}

// ── ลงบัญชีอัตโนมัติจากเงินเดือน (payslips ที่จ่ายแล้ว) — แยกตามหน้าที่ · ทุกกิจการ = บริษัท ──
// ช่าง/ผู้ช่วยช่าง → 5030 ต้นทุนบริการ · ขาย → 6010 · อื่นๆ (บริหาร/บัญชี/ธุรการ) → 7010
export async function autoPostPayroll({ from, to } = {}) {
  const _d = (ts) => (ts ? String(ts).slice(0, 10) : null);
  const inR = (d) => d && (!from || d >= from) && (!to || d <= to);
  const [slips, profs, posted] = await Promise.all([
    _fetchAll((f, t) => supabase.from("payslips").select("*", { count: "exact" }).eq("status", "paid").order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("profiles").select("id,name,role", { count: "exact" }).order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("acc_journal").select("ref_no", { count: "exact" }).eq("ref_type", "payroll").neq("status", "void").range(f, t)),
  ]);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const role = {}, nameOf = {}; profs.forEach((p) => { role[p.id] = p.role; nameOf[p.id] = p.name; });
  const done = new Set(posted.map((x) => x.ref_no));
  const acctOf = (r) => ["tech", "lead_tech", "assistant"].includes(r) ? "5030" : ["sales", "field_sales"].includes(r) ? "6010" : "7010";

  let ok = 0; const errs = []; let n = 0;
  for (const s of slips) {
    const jdate = _d(s.paid_at); if (!inR(jdate)) continue;
    if (done.has(String(s.id))) continue;
    n++;
    // ด้านเครดิต = เงินสุทธิ + รายการหักที่ต้องนำส่ง/หักคืน · ด้านเดบิต(ค่าใช้จ่ายเงินเดือน) = ผลรวมพอดี → สมดุลแน่นอน
    const net = r2(s.net), sso = r2(s.d_sso), tax = r2(s.d_tax), recover = r2((Number(s.d_loan) || 0) + (Number(s.d_water) || 0) + (Number(s.d_electric) || 0));
    const cr = [];
    if (net > 0.005) cr.push({ account_code: "1020", debit: 0, credit: net });
    if (sso > 0.005) cr.push({ account_code: "2130", debit: 0, credit: sso, memo: "ประกันสังคม" });
    if (tax > 0.005) cr.push({ account_code: "2120", debit: 0, credit: tax, memo: "ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)" });
    if (recover > 0.005) cr.push({ account_code: "1110", debit: 0, credit: recover, memo: "หักคืนเงินยืม/ค่าน้ำ-ไฟ" });
    const total = r2(cr.reduce((a, x) => a + x.credit, 0));
    if (total <= 0.005) continue;
    const lines = [{ account_code: acctOf(role[s.user_id]), debit: total, credit: 0, memo: nameOf[s.user_id] || null }, ...cr];
    try { await postJournal({ entity: "company", jdate, ref_type: "payroll", ref_no: String(s.id), memo: `เงินเดือน ${s.period} · ${nameOf[s.user_id] || ""}`, source: "auto", lines }); ok++; }
    catch (e) { errs.push(`payroll ${s.period}/${s.user_id}: ${e.message || e}`); }
  }
  return { posted: ok, total: n, errors: errs };
}

// ── ลงบัญชีอัตโนมัติจากใบเสร็จ (เกณฑ์เงินสด: เฉพาะใบเสร็จ status='paid') ──
// entity: VAT>0 = บริษัท · ไม่มี VAT = บุคคล · แยกประเภทรายได้ตามรายการในใบเสนอ
// idempotent: ข้ามใบที่ลงบัญชีแล้ว (ref_type='receipt' + ref_no) · reversible: void ได้
// แยกรายได้ base ตามรายการใบเสนอ → [{acct, amt}] รวมเท่ากับ base เป๊ะ
function _revSplit(base, its, r2) {
  const byAcct = {}; let gross = 0;
  (its || []).forEach((it) => { const g = Math.max(0, (Number(it.qty) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)); if (g > 0) { const a = _revAccountOf(it); byAcct[a] = (byAcct[a] || 0) + g; gross += g; } });
  if (gross <= 0) return [{ acct: "4060", amt: base }];
  const rev = Object.entries(byAcct).map(([acct, g]) => ({ acct, amt: r2(base * g / gross) }));
  const drift = r2(base - rev.reduce((s, x) => s + x.amt, 0));
  if (Math.abs(drift) >= 0.01) { rev.sort((a, b) => b.amt - a.amt); rev[0].amt = r2(rev[0].amt + drift); }
  return rev;
}

// ── ลงบัญชีอัตโนมัติฝั่งขาย (เกณฑ์คงค้าง) ──
// ใบแจ้งหนี้ → รับรู้รายได้ + ลูกหนี้การค้า(1100) · ใบเสร็จ → ถ้ามีใบแจ้งหนี้=เก็บลูกหนี้ / ไม่มี=ขายสด
export async function autoPostReceipts({ from, to } = {}) {
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const _d = (r) => r.issue_date || (r.created_at || "").slice(0, 10);
  const inR = (d) => d && (!from || d >= from) && (!to || d <= to);
  const [inv, rc, posted] = await Promise.all([
    _fetchAll((f, t) => supabase.from("invoices").select("invoice_no,quote_no,issue_date,created_at,base,vat_amt,total,status", { count: "exact" }).neq("status", "cancelled").order("invoice_no").range(f, t)),
    _fetchAll((f, t) => supabase.from("receipts").select("receipt_no,invoice_no,quote_no,issue_date,created_at,payment_method,base,vat_amt,total,wht_amt,net,status", { count: "exact" }).eq("status", "paid").order("receipt_no").range(f, t)),
    _fetchAll((f, t) => supabase.from("acc_journal").select("ref_type,ref_no", { count: "exact" }).in("ref_type", ["invoice", "receipt"]).neq("status", "void").range(f, t)),
  ]);
  const done = new Set(posted.map((x) => x.ref_type + ":" + x.ref_no));
  const qnos = [...new Set([...inv.map((x) => x.quote_no), ...rc.filter((x) => !x.invoice_no).map((x) => x.quote_no)].filter(Boolean))];
  const items = qnos.length ? await _fetchAll((f, t) => supabase.from("quotation_items").select("quote_no,name,description,kind,qty,unit_price,discount", { count: "exact" }).in("quote_no", qnos).order("id").range(f, t)) : [];
  const itemsByQ = {}; items.forEach((x) => { (itemsByQ[x.quote_no] ||= []).push(x); });

  const tasks = [];
  // 1) ใบแจ้งหนี้ (คงค้าง) → Dr ลูกหนี้ · Cr รายได้ + ภาษีขาย
  inv.forEach((x) => {
    const jdate = _d(x); if (!inR(jdate) || done.has("invoice:" + x.invoice_no)) return;
    const base = r2(x.base), vat = r2(x.vat_amt), total = r2(x.total != null ? x.total : base + vat);
    if (total <= 0.005) return;
    const entity = vat > 0.005 ? "company" : "personal";
    const lines = [{ account_code: "1100", debit: total, credit: 0 }];
    _revSplit(base, itemsByQ[x.quote_no], r2).forEach((rv) => lines.push({ account_code: rv.acct, debit: 0, credit: rv.amt }));
    if (vat > 0.005) lines.push({ account_code: "2100", debit: 0, credit: vat, memo: "ภาษีขาย" });
    tasks.push({ entity, jdate, ref_type: "invoice", ref_no: x.invoice_no, memo: `ใบแจ้งหนี้ ${x.invoice_no}`, lines });
  });
  // 2) ใบเสร็จ (จ่ายแล้ว) → เก็บลูกหนี้ หรือขายสด
  rc.forEach((r) => {
    const jdate = _d(r); if (!inR(jdate) || done.has("receipt:" + r.receipt_no)) return;
    const base = r2(r.base), vat = r2(r.vat_amt), wht = r2(r.wht_amt);
    const total = r2(r.total != null ? r.total : base + vat), cash = r2(r.net != null ? r.net : total - wht);
    if (total <= 0.005) return;
    const entity = vat > 0.005 ? "company" : "personal";
    const cashAcct = /สด|cash/i.test(r.payment_method || "") ? "1010" : (entity === "company" ? "1020" : "1021");
    const lines = [{ account_code: cashAcct, debit: cash, credit: 0 }];
    if (wht > 0.005) lines.push({ account_code: "1310", debit: wht, credit: 0, memo: "ภาษีถูกหัก ณ ที่จ่าย" });
    if (r.invoice_no) {
      lines.push({ account_code: "1100", debit: 0, credit: total });   // เก็บลูกหนี้ (รายได้รับรู้ที่ใบแจ้งหนี้แล้ว)
    } else {
      _revSplit(base, itemsByQ[r.quote_no], r2).forEach((rv) => lines.push({ account_code: rv.acct, debit: 0, credit: rv.amt }));
      if (vat > 0.005) lines.push({ account_code: "2100", debit: 0, credit: vat, memo: "ภาษีขาย" });
    }
    tasks.push({ entity, jdate, ref_type: "receipt", ref_no: r.receipt_no, memo: `ใบเสร็จ ${r.receipt_no}`, lines });
  });

  let ok = 0; const errs = [];
  for (const t of tasks) { try { await postJournal({ ...t, source: "auto" }); ok++; } catch (e) { errs.push(`${t.ref_type} ${t.ref_no}: ${e.message || e}`); } }
  return { posted: ok, total: tasks.length, errors: errs };
}

// test the FlowAccount OpenAPI connection (sandbox) via our serverless function
export async function flowaccountTest() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const r = await fetch("/api/flowaccount-test", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
  return r.json();
}
// create a document in FlowAccount from a normalized payload → returns the raw FlowAccount response
export async function flowaccountSendDoc(input) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const r = await fetch("/api/flowaccount-doc", {
    method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return r.json();
}

// managed list of job positions / แผนก (stored as one JSON array in app_config). null if unset.
export async function getPositions() {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "positions").maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? data.value : null;
}
export async function savePositions(list) {
  const { error } = await supabase.from("app_config").upsert({ key: "positions", value: list || [] }, { onConflict: "key" });
  if (error) throw error;
}

// role → module permission overrides (stored as one JSON row in app_config). Returns null if unset.
export async function getRolePermissions() {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "role_permissions").maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}
export async function saveRolePermissions(perms) {
  const { error } = await supabase.from("app_config").upsert({ key: "role_permissions", value: perms }, { onConflict: "key" });
  if (error) throw error;
}

// build the 3 end-of-document term columns from an editor object (BOQ/quote/invoice/receipt all share these)
const _termCols = (d) => ({
  terms_payment: d.terms_payment?.trim() || null,
  terms_freebies: d.terms_freebies?.trim() || null,
  terms_warranty: d.terms_warranty?.trim() || null,
});
// per-document signature snapshot (chosen by the issuer at creation time)
const _signCols = (d) => ({ sign_url: d.sign_url || null, sign_name: d.sign_name || null });

// ส่งต่อ "หมายเหตุภายใน" ให้ทุกเอกสารในสายเดียวกัน (BOQ ↔ ใบเสนอราคา ↔ ใบแจ้งหนี้ ↔ ใบวางบิล ↔ ใบเสร็จ ↔ ใบงาน ↔ PO)
// เขียนที่ใบไหน ก็ขึ้นครบทุกใบที่เกี่ยวข้อง · ส่งต่อเฉพาะข้อความที่ไม่ว่าง (การล้างหมายเหตุมีผลเฉพาะใบนั้น กันเผลอลบทั้งสาย)
async function syncInternalNote({ quoteNo, boqNo, invoiceNo }, note) {
  const n = (note || "").trim();
  if (!n) return;   // ไม่ส่งต่อค่าว่าง
  try {
    let qNo = quoteNo || null, bNo = boqNo || null;
    // ใบเสร็จ/ใบวางบิล → หา quote_no จากใบแจ้งหนี้
    if (!qNo && invoiceNo) { const { data } = await supabase.from("invoices").select("quote_no").eq("invoice_no", invoiceNo).maybeSingle(); qNo = data?.quote_no || null; }
    // เติมข้อต่อที่ขาด: quote → boq_no · boq → quote_no
    if (qNo && !bNo) { const { data } = await supabase.from("quotations").select("boq_no").eq("quote_no", qNo).maybeSingle(); bNo = data?.boq_no || null; }
    if (!qNo && bNo) { const { data } = await supabase.from("quotations").select("quote_no").eq("boq_no", bNo).limit(1).maybeSingle(); qNo = data?.quote_no || null; }
    const up = (tbl, col, val) => supabase.from(tbl).update({ internal_note: n }).eq(col, val);
    const jobs = [];
    if (bNo) jobs.push(up("boqs", "boq_no", bNo));
    if (qNo) {
      jobs.push(up("quotations", "quote_no", qNo), up("invoices", "quote_no", qNo), up("job_orders", "quote_no", qNo), up("purchase_orders", "quote_no", qNo));
    } else if (bNo) {
      jobs.push(supabase.from("quotations").update({ internal_note: n }).eq("boq_no", bNo));
    }
    await Promise.all(jobs);
    // ใบเสร็จ + ใบวางบิล อ้างผ่านใบแจ้งหนี้
    if (qNo) {
      const { data: invs } = await supabase.from("invoices").select("invoice_no").eq("quote_no", qNo);
      const invNos = (invs || []).map((x) => x.invoice_no);
      if (invNos.length) await Promise.all([
        supabase.from("receipts").update({ internal_note: n }).in("invoice_no", invNos),
        supabase.from("billing_notes").update({ internal_note: n }).overlaps("invoice_nos", invNos),
      ]);
    }
  } catch (_) { /* ส่งต่อไม่สำเร็จก็ไม่ให้ขวางการบันทึกหลัก */ }
}

// แก้ "หมายเหตุ" ของเอกสารที่ออกไปแล้ว โดยไม่แตะยอดเงิน/รายการ
// ใบส่งของ/ใบแจ้งหนี้ · ใบวางบิล · ใบเสร็จ ไม่มีฟอร์มแก้ทั้งใบ (ตั้งใจ — เป็นเอกสารการเงิน)
// แต่หมายเหตุต้องแก้ได้ตามกติกาเจ้าของ จึงเปิดทางแคบ ๆ เฉพาะ 2 คอลัมน์นี้
//
// note          = ของใบนั้นใบเดียว (สิ่งที่พิมพ์ลงกระดาษของใบนั้น)
// internal_note = ของทั้งสายเอกสาร → ส่งต่อผ่าน syncInternalNote เหมือนตอนบันทึกใบใหม่
// เฉพาะ 3 ใบที่ "ไม่มีฟอร์มแก้ทั้งใบ" เท่านั้น — BOQ / ใบเสนอราคา / ใบสั่งซื้อ มีฟอร์มของตัวเองอยู่แล้ว
// และฟอร์มพวกนั้นบังคับล็อกของมันเอง (เช่น ใบเสนอที่อนุมัติแล้วต้องกด "คืนสถานะแก้ไข" ก่อน)
// ถ้าเปิดทางนี้ให้ด้วยจะกลายเป็นประตูหลังข้ามล็อกพวกนั้น
//
// link = คีย์ที่ใช้ส่ง internal_note ต่อทั้งสาย · ต้องตรงกับที่ save ปกติของใบนั้นใช้
// audit = ชื่อชนิดเอกสารในสมุดตรวจสอบ (ต้องตรงกับ AUDIT_TYPES ใน Settings ไม่งั้นกรองไม่เจอ)
const _NOTE_DOCS = {
  invoice: { table: "invoices", pk: "invoice_no", th: "ใบส่งของ/ใบแจ้งหนี้", audit: "invoice", linkCol: null },
  billing: { table: "billing_notes", pk: "billing_no", th: "ใบวางบิล", audit: "billing_note", linkCol: "invoice_nos" },
  receipt: { table: "receipts", pk: "receipt_no", th: "ใบเสร็จ", audit: "receipt", linkCol: "invoice_no" },
};
export async function updateDocNotes(kind, docNo, { note, internal_note }) {
  const d = _NOTE_DOCS[kind];
  if (!d) throw new Error(`ไม่รู้จักชนิดเอกสาร: ${kind}`);
  if (!docNo) throw new Error("ไม่มีเลขที่เอกสาร");
  const n = (note ?? "").trim() || null;
  const inn = (internal_note ?? "").trim() || null;

  // ใบที่ยกเลิกแล้ว = ประวัติ ห้ามแก้ (กติกาบ้าน — ล็อกทุกชั้น เหลือแค่ดู/พิมพ์)
  // ดึงคีย์เชื่อมสายมาในรอบเดียวกัน — ต้องใช้ส่ง internal_note ต่อทั้งสายด้านล่าง
  const cols = "status" + (d.linkCol ? "," + d.linkCol : "");
  const { data: cur, error: eR } = await supabase.from(d.table).select(cols).eq(d.pk, docNo).maybeSingle();
  if (eR) throw eR;                        // อ่านไม่ได้ ห้ามเดินต่อ (ห้าม fail-open)
  if (!cur) throw new Error(`ไม่พบ${d.th} ${docNo}`);
  if (cur.status === "cancelled") throw new Error(`${d.th} ${docNo} ยกเลิกไปแล้ว — แก้หมายเหตุไม่ได้`);

  // เช็กผลจริง: RLS ที่ปฏิเสธจะคืน 0 แถวแบบไม่ error → ถ้าไม่เช็ก จอจะขึ้น "บันทึกแล้ว" ทั้งที่ไม่ได้เขียนอะไร
  const { data: hit, error } = await supabase.from(d.table)
    .update({ note: n, internal_note: inn }).eq(d.pk, docNo).select(d.pk);
  if (error) throw error;
  if (!hit?.length) throw new Error("บันทึกไม่สำเร็จ — ไม่มีสิทธิ์แก้เอกสารนี้");

  // หมายเหตุภายในเป็นของทั้งสาย — ส่งต่อเหมือนเส้นทางบันทึกปกติ (ล้มเหลวไม่ขวางการบันทึกหลัก)
  // ⚠️ ต้องส่งต่อให้ครบทุกชนิด ไม่งั้นค่าที่พิมพ์จะเป็นเด็กกำพร้า: อยู่ใบเดียว แล้วรอบหน้าที่ใครก็ตาม
  //    บันทึกใบใดในสายนี้ syncInternalNote จะกวาดค่าเก่าทับกลับลงมา (receipts .in(invoice_no) /
  //    billing_notes .overlaps(invoice_nos)) = สิ่งที่เพิ่งพิมพ์หายเงียบ ๆ โดยไม่มี error
  //    คีย์ที่ใช้ต้องตรงกับ saveReceipt / saveBillingNote ซึ่งอ้างผ่านใบแจ้งหนี้เหมือนกัน
  const link = kind === "invoice" ? { invoiceNo: docNo }
    : kind === "receipt" ? (cur.invoice_no ? { invoiceNo: cur.invoice_no } : null)
    : kind === "billing" ? ((cur.invoice_nos || [])[0] ? { invoiceNo: cur.invoice_nos[0] } : null)
    : null;
  if (link && inn) await syncInternalNote(link, inn).catch(() => {});
  await logAudit({ action: "update", target_type: d.audit, target_no: docNo, reason: "แก้หมายเหตุเอกสาร" }).catch(() => {});
}

export async function saveBoq(boq, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const bHead = {
    boq_no: boq.boq_no, customer_id: boq.customer_id || null, site_id: boq.site_id || null, issue_date: boq.issue_date || null,
    job_type: boq.job_type || null,
    title: boq.title?.trim() || null, note: boq.note?.trim() || null, internal_note: boq.internal_note?.trim() || null, ..._termCols(boq), ..._signCols(boq), status: boq.status || "open", created_by: user?.id || null,
  };
  // ⚠️ ใบเดิม: ห้ามส่ง created_by ไปกับ upsert (เหตุผลเดียวกับ saveQuotation/saveJobOrder — คนแก้ล่าสุดแย่งเครดิตคนสร้าง)
  const { data: curBoq, error: cbErr } = await supabase.from("boqs").select("boq_no").eq("boq_no", boq.boq_no).maybeSingle();
  if (cbErr) throw cbErr;
  if (curBoq) delete bHead.created_by;
  let e1 = (await supabase.from("boqs").upsert(bHead, { onConflict: "boq_no" })).error;
  for (const c of ["issue_date", "job_type"]) { // pre-119/139 fallback
    if (e1 && (e1.message || "").includes(c)) { delete bHead[c]; e1 = (await supabase.from("boqs").upsert(bHead, { onConflict: "boq_no" })).error; }
  }
  if (e1) throw e1;
  // ลบ+เขียนใหม่ในธุรกรรมเดียว (mig 157) — เน็ตหลุดกลางทางแล้ว rollback เอง รายการเดิมไม่หาย
  const atomic = await supabase.rpc("replace_boq_items", {
    p_boq_no: boq.boq_no,
    p_items: items.map((x) => ({ section: x.section, item_code: x.code || null, name: x.name || null, description: x.description?.trim() || null, unit: x.unit || null, qty: Number(x.qty) || 0, unit_cost: Number(x.unit_cost) || 0 })),
  });
  if (!atomic.error) { syncInternalNote({ boqNo: boq.boq_no }, boq.internal_note).catch(() => {}); return; }
  // pre-157 fallback: ยังไม่มี function → ใช้วิธีเดิม (ลบก่อนเขียน)
  const e2 = (await supabase.from("boq_items").delete().eq("boq_no", boq.boq_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const rows = items.map((x) => ({
      boq_no: boq.boq_no, section: x.section, item_code: x.code || null, name: x.name || null,
      description: x.description?.trim() || null,
      unit: x.unit || null, qty: Number(x.qty) || 0, unit_cost: Number(x.unit_cost) || 0,
    }));
    let e3 = (await supabase.from("boq_items").insert(rows)).error;
    if (e3 && /description/i.test(e3.message || "")) { rows.forEach((r) => delete r.description); e3 = (await supabase.from("boq_items").insert(rows)).error; } // pre-026 fallback
    // batch ล้ม (all-or-nothing) → ลองทีละแถว: รายการที่ถูกต้องจะได้บันทึก + เก็บว่าแถวไหนพังเพราะอะไร
    if (e3) {
      const failed = [];
      for (const r of rows) {
        let { error } = await supabase.from("boq_items").insert(r);
        if (error && /description/i.test(error.message || "")) { const r2 = { ...r }; delete r2.description; ({ error } = await supabase.from("boq_items").insert(r2)); }
        if (error) failed.push(`• [${({ ac: "แอร์", free: "วัสดุแถม", charged: "วัสดุคิดเงิน", service: "ค่าบริการ" })[r.section] || r.section}] ${r.name || r.item_code}: ${error.message}`);
      }
      if (failed.length) {
        const hint = failed.some((f) => /section.*check|boq_items_section/i.test(f)) ? "\n\n👉 รายการหมวด “ค่าบริการ” บันทึกไม่ได้ ต้องรัน migration 116/117 ใน Supabase ก่อน" : "";
        throw new Error(`บันทึกบางรายการไม่สำเร็จ (${failed.length}/${rows.length}) — ที่เหลือบันทึกแล้ว:\n${failed.join("\n")}${hint}`);
      }
    }
  }
  syncInternalNote({ boqNo: boq.boq_no }, boq.internal_note).catch(() => {});
}

// add items from a quotation into its linked BOQ (only ones not already there) — keeps the BOQ in sync as the quote grows
export async function syncBoqItems(boq_no, items) {
  if (!boq_no || !items?.length) return 0;
  const { data: existing, error: e0 } = await supabase.from("boq_items").select("item_code,name").eq("boq_no", boq_no);
  if (e0) throw e0;
  const keys = new Set((existing || []).map((r) => r.item_code || r.name));
  const rows = items.filter((it) => !keys.has(it.item_code || it.name));
  if (!rows.length) return 0;
  const { error } = await supabase.from("boq_items").insert(rows.map((it) => ({
    boq_no, section: it.section, item_code: it.item_code || null, name: it.name || null,
    description: it.description?.trim() || null, unit: it.unit || null, qty: Number(it.qty) || 0, unit_cost: Number(it.unit_cost) || 0,
  })));
  if (error) throw error;
  return rows.length;
}

export async function deleteBoq(boq_no, reason) {
  // chain safety: block if a LIVE quotation was created from this BOQ — ใบเสนอที่ยกเลิกแล้วไม่บล็อก (กติกา: ใบยกเลิก = จบสาย)
  const { count, error: ce } = await supabase.from("quotations").select("quote_no", { count: "exact", head: true }).eq("boq_no", boq_no).neq("status", "cancelled");
  if (ce) throw ce;
  if ((count || 0) > 0) throw new Error("ลบ BOQ นี้ไม่ได้ — มีใบเสนอราคาอ้างอิงอยู่ · ต้องลบ/ยกเลิกใบเสนอราคา (และเอกสารถัดไป) ก่อน");
  const [{ data: head }, { data: items }] = await Promise.all([
    supabase.from("boqs").select("*").eq("boq_no", boq_no).maybeSingle(),
    supabase.from("boq_items").select("*").eq("boq_no", boq_no),
  ]);
  const { error } = await supabase.from("boqs").delete().eq("boq_no", boq_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "boq", target_no: boq_no, reason, snapshot: head ? { ...head, items: items || [] } : null });
}
export async function setBoqStatus(boq_no, status, reason) {
  const { error } = await supabase.from("boqs").update({ status }).eq("boq_no", boq_no);
  if (error) throw error;
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "boq", target_no: boq_no, reason });
}
export async function setJobStatus(job_no, status, reason) {
  // ผ่าน RPC (mig 150): ยกเลิกใบงาน → ปิดรอบที่ยังไม่จบให้ด้วย (กันจอช่างค้างกด "ส่งอนุมัติ" แล้วคืนชีพงานที่ยกเลิก)
  let { error } = await supabase.rpc("set_job_status", { p_job: job_no, p_status: status });
  if (error && /set_job_status|schema cache/i.test(error.message || "")) {
    ({ error } = await supabase.from("job_orders").update({ status }).eq("job_no", job_no)); // pre-150 fallback
  }
  if (error) throw error;
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "job_order", target_no: job_no, reason });
  syncCashEntriesFromDocs().catch(() => {}); // job's linked PO/labor projections → refresh cash flow
}

// ---------- QUOTATIONS (ใบเสนอราคา) ----------
export function listQuotations(opts = {}) { return _cached("listQuotations:" + JSON.stringify(opts || {}), () => _loadQuotations(opts), _SHORT_TTL); }
async function _loadQuotations(opts = {}) {
  const nos = _scopeNos(opts);
  const since = _sinceOf(opts);
  const qP = _allRows((f, t) => _orSince(_onlyNos(supabase.from("quotations").select("*", { count: "exact" }), "quote_no", nos), ["approved_at", "issue_date", "created_at"], since).order("created_at", { ascending: false }).order("quote_no").range(f, t));
  const q = (nos || since) ? await qP : { data: [] };   // เจาะจงใบ/ช่วงวันที่ → รอหัวใบก่อนเพื่อรู้ลูกค้า/ไซต์ · โหลดทั้งหมด → ยิงขนานเหมือนเดิม
  if (q.error) throw q.error;
  const cids = _idsOf(q.data, "customer_id"), sids = _idsOf(q.data, "site_id");
  // กรองด้วยช่วงวันที่ → ตารางลูกกรองตาม "เลขใบที่ได้มาจริง" · ถ้าใบเยอะเกิน 200 _capNos คืน null = โหลดเต็ม
  // (ผลลัพธ์ถูกเสมอ แค่ไม่ได้ประหยัด — เท่าพฤติกรรมเดิมก่อนแก้ ไม่ถือเป็นการถอยหลัง)
  const scoped = !!(nos || since);
  const scope = nos || (since ? _capNos(_idsOf(q.data, "quote_no")) : null);
  const cScope = scoped ? _capNos(cids) : null, sScope = scoped ? _capNos(sids) : null;
  const [it, cu, si, ct, jo, inv] = await Promise.all([
    _allRows((f, t) => _onlyNos(supabase.from("quotation_items").select("*", { count: "exact" }), "quote_no", scope).order("id").range(f, t)), // กันเพดาน 1000 แถว
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("*", { count: "exact" }), "id", cScope).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }), "id", sScope).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }), "customer_id", cScope).order("id").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("job_orders").select("job_no,quote_no,scheduled_at,status,assigned_team", { count: "exact" }), "quote_no", scope).order("job_no").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("invoices").select("quote_no,total,status", { count: "exact" }), "quote_no", scope).order("invoice_no").range(f, t)),
  ]);
  const qR = (nos || since) ? q : await qP;
  if (qR.error) throw qR.error;
  if (it.error) throw it.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (jo.error) throw jo.error;
  const byQ = {}; (it.data || []).forEach((x) => { (byQ[x.quote_no] = byQ[x.quote_no] || []).push(x); });
  const custName = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const custAddr = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const custTax = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const custBranch = Object.fromEntries((cu.data || []).map((c) => [c.id, c.branch]));
  const custType = Object.fromEntries((cu.data || []).map((c) => [c.id, c.type]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const firstContact = {}; (ct.data || []).forEach((c) => { if (!firstContact[c.customer_id]) firstContact[c.customer_id] = c; });
  const jobByQuote = {}; (jo.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  const billedByQ = {}, invCntByQ = {}; (inv.data || []).forEach((x) => { if (x.status !== "cancelled") { billedByQ[x.quote_no] = (billedByQ[x.quote_no] || 0) + Number(x.total || 0); invCntByQ[x.quote_no] = (invCntByQ[x.quote_no] || 0) + 1; } });
  const cb = await _creators(scoped ? _idsOf(qR.data, "created_by") : null);
  return (qR.data || []).map((qo) => {
    const items = byQ[qo.quote_no] || [];
    // วิธีการรับเงิน: ราคาบัตรปรับเข้า "ราคาต่อหน่วยของแต่ละรายการ" (ปัดขึ้นบาทเต็ม/หน่วย) — ไม่มีบรรทัดค่าธรรมเนียม
    // unit_price ที่เก็บ = ราคาเงินสดเสมอ · price_show = ราคาที่แสดง/พิมพ์ตามวิธีชำระ
    const payMethod = qo.pay_method || "cash";
    const payRate = payMethod === "card_full" ? 0.04 : payMethod === "card_inst10" ? 0.14 : 0;
    const adjU = (u) => payRate ? Math.ceil(Math.round((Number(u) || 0) * (1 + payRate) * 100) / 100) : Number(u) || 0;
    const itemsX = items.map((x) => ({ ...x, price_show: adjU(x.unit_price) }));
    const lineDisc = (x) => Number(x.discount) || 0;   // ส่วนลดรายรายการ (mig 142) — หักในบรรทัดก่อนส่วนลดรวมท้ายบิล
    const subtotal = itemsX.reduce((a, x) => a + Number(x.qty) * x.price_show - lineDisc(x), 0);
    const discount = qo.discount_type === "percent" ? subtotal * Number(qo.discount_value || 0) / 100 : Number(qo.discount_value || 0);
    const afterDisc = subtotal - discount;
    const vatAmt = qo.vat ? afterDisc * 0.07 : 0;
    const grand = afterDisc + vatAmt;
    // หัก ณ ที่จ่าย: คิดเฉพาะ "ค่าบริการ" ก่อน VAT (ค่าสินค้าไม่โดนหัก) — เฉลี่ยส่วนลดตามสัดส่วน เหมือนใบแจ้งหนี้
    const svcSum = itemsX.reduce((a, x) => a + (x.kind === "service" ? Number(x.qty) * x.price_show - lineDisc(x) : 0), 0);
    // หัก ณ ที่จ่ายได้เฉพาะลูกค้านิติบุคคล — อ่านประเภท "สด" จากฐานข้อมูล ไม่เชื่อธงที่บันทึกไว้ในใบ
    // กันเคส: ออกใบตอนลูกค้าเป็นนิติบุคคล แล้วภายหลังแก้เป็นบุคคลธรรมดา ใบเก่าจะยังหัก 3% ต่อไป
    // (มาตรฐานเดียวกับใบแจ้งหนี้/ใบเสร็จที่อ่านประเภทลูกค้าสดอยู่แล้ว — ไม่งั้นยอดที่เสนอกับที่เรียกเก็บไม่ตรงกัน)
    // ⚠️ ห้ามเขียนทับฟิลด์ wht ในแถวที่คืนออกไป — ฟอร์มแก้ใบอ่านค่านั้นเข้าไปแล้วบันทึกกลับ จะกลายเป็นแก้ DB เงียบ ๆ
    const whtOn = !!qo.wht && custType[qo.customer_id] === "company";
    const whtAmt = whtOn && subtotal > 0 ? afterDisc * (svcSum / subtotal) * (Number(qo.wht_rate) || 3) / 100 : 0;
    const s = qo.site_id ? sm[qo.site_id] : null;
    const siteAddress = (s && s.address) || null;
    const address = siteAddress || custAddr[qo.customer_id] || null;
    const map_url = (s && s.map_url) || _gmap(address);
    const ct0 = firstContact[qo.customer_id];
    return { ...qo, customerName: custName[qo.customer_id] || null, customerAddr: custAddr[qo.customer_id] || null,
      customerTaxId: custTax[qo.customer_id] || null, customerBranch: custBranch[qo.customer_id] || null, customerType: custType[qo.customer_id] || null, customerCode: qo.customer_id || null, siteName: s?.site_name || null,
      siteAddress, address, map_url, createdByName: cb[qo.created_by] || null,
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      jobNo: jobByQuote[qo.quote_no]?.job_no || null, hasJob: !!jobByQuote[qo.quote_no], jobScheduledAt: jobByQuote[qo.quote_no]?.scheduled_at || null,
      jobTeam: jobByQuote[qo.quote_no]?.assigned_team || null,   // ทีมช่างของงาน (ไว้กรองรายทีมบนแดชบอร์ด)
      hasInvoice: (invCntByQ[qo.quote_no] || 0) > 0, billedPct: grand > 0 ? (billedByQ[qo.quote_no] || 0) / grand * 100 : ((invCntByQ[qo.quote_no] || 0) > 0 ? 100 : 0),
      items: itemsX, subtotal, discount, afterDisc, payMethod, vatAmt, grand, whtOn, whtAmt, netPay: grand - whtAmt };
  });
}

export async function saveQuotation(q, items) {
  const { data: { user } } = await supabase.auth.getUser();
  // guard ฝั่ง server: ใบที่อนุมัติแล้วห้ามบันทึกทับ (หน้าเก่าค้างจากอีกเครื่อง) — ต้องผ่านปุ่ม "คืนสถานะแก้ไข" (มี audit) เท่านั้น
  const { data: cur, error: ce } = await supabase.from("quotations").select("status").eq("quote_no", q.quote_no).maybeSingle();
  if (ce) throw ce;
  if (cur && cur.status === "approved") throw new Error(`ใบเสนอราคา ${q.quote_no} อนุมัติแล้ว — บันทึกทับไม่ได้\nถ้าจำเป็นต้องแก้ กด "คืนสถานะแก้ไข" บนการ์ดก่อน (หน้าอาจค้าง — รีเฟรชแล้วลองใหม่)`);
  const head = {
    quote_no: q.quote_no, customer_id: q.customer_id || null, site_id: q.site_id || null, boq_no: q.boq_no || null,
    title: q.title?.trim() || null, status: q.status || "draft", job_type: q.job_type || null,
    issue_date: q.issue_date || null, valid_until: q.valid_until || null,
    discount_type: q.discount_type || "amount", discount_value: Number(q.discount_value) || 0,
    vat: !!q.vat, wht: !!q.wht, wht_rate: Number(q.wht_rate) || 3, note: q.note?.trim() || null, internal_note: q.internal_note?.trim() || null, ..._termCols(q), ..._signCols(q),
    pay_method: q.pay_method && q.pay_method !== "cash" ? q.pay_method : null,   // เงินสด = ค่าเริ่มต้น (เก็บ null)
    variation_of: q.variation_of || null,   // ใบเสนอเพิ่มเติม (mig 188) → ผูกใบแม่ · กำไรรวมงานเดียว
    approved_at: q.status === "approved" ? (q.approved_at || new Date().toISOString()) : null,
    created_by: user?.id || null,
  };
  // ⚠️ ใบเดิม: ห้ามส่ง created_by ไปกับ upsert — ON CONFLICT DO UPDATE เขียนทับทุกคอลัมน์ที่ส่ง
  //    คนที่กดบันทึกล่าสุดจะกลายเป็น "ผู้ทำ/ผู้ขาย" แทนคนสร้างจริง → รายงานยอดขายรายคนเพี้ยน กู้ไม่ได้
  //    (created_at ไม่ได้ส่งไป แถวเลยดูปกติ ไม่มีอะไรส่อว่าเพี้ยน) — กติกาเดียวกับ saveJobOrder
  if (cur) delete head.created_by;
  let e1 = (await supabase.from("quotations").upsert(head, { onConflict: "quote_no" })).error;
  // ยังไม่รัน migration 105/139/188 → บันทึกต่อได้ (แค่ยังไม่เก็บคอลัมน์นั้น)
  for (const c of ["pay_method", "job_type", "variation_of"]) {
    if (e1 && c in head && (e1.message || "").includes(c)) {
      delete head[c];
      e1 = (await supabase.from("quotations").upsert(head, { onConflict: "quote_no" })).error;
    }
  }
  if (e1) throw e1;
  // ลบ+เขียนใหม่ในธุรกรรมเดียว (mig 157) — เน็ตหลุดกลางทางแล้ว rollback เอง รายการเดิมไม่หาย
  const atomicQ = await supabase.rpc("replace_quotation_items", {
    p_quote_no: q.quote_no,
    p_items: items.map((x) => ({ item_code: x.code || null, name: x.name || null, kind: x.kind || null, description: x.description?.trim() || null, unit: x.unit || null, qty: Number(x.qty) || 0, unit_price: Number(x.unit_price) || 0, discount: Number(x.discount) || 0 })),
  });
  if (!atomicQ.error) { syncInternalNote({ quoteNo: q.quote_no, boqNo: q.boq_no }, q.internal_note).catch(() => {}); return; }
  // pre-157 fallback: ยังไม่มี function → ใช้วิธีเดิม (ลบก่อนเขียน)
  const e2 = (await supabase.from("quotation_items").delete().eq("quote_no", q.quote_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const rows = items.map((x) => ({
      quote_no: q.quote_no, item_code: x.code || null, name: x.name || null, kind: x.kind || null,
      description: x.description?.trim() || null,
      unit: x.unit || null, qty: Number(x.qty) || 0, unit_price: Number(x.unit_price) || 0,
      discount: Number(x.discount) || 0,   // ส่วนลดรายรายการ (mig 142)
    }));
    let e3 = (await supabase.from("quotation_items").insert(rows)).error;
    // pre-142 fallback: ยังไม่มีคอลัมน์ discount — บันทึกโดยไม่มีส่วนลดรายตัวไปก่อน
    if (e3 && /discount/i.test(e3.message || "")) {
      e3 = (await supabase.from("quotation_items").insert(rows.map(({ discount, ...r }) => r))).error;
    }
    if (e3) throw e3;
  }
  syncInternalNote({ quoteNo: q.quote_no, boqNo: q.boq_no }, q.internal_note).catch(() => {});
}

export async function deleteQuotation(quote_no, reason) {
  // chain safety: block if a LIVE invoice or job order was created from this quotation — ใบยกเลิกแล้วไม่บล็อก
  const [iv, jo] = await Promise.all([
    supabase.from("invoices").select("invoice_no", { count: "exact", head: true }).eq("quote_no", quote_no).neq("status", "cancelled"),
    supabase.from("job_orders").select("job_no", { count: "exact", head: true }).eq("quote_no", quote_no).neq("status", "cancelled"),
  ]);
  if (iv.error) throw iv.error; if (jo.error) throw jo.error;
  if ((iv.count || 0) > 0 || (jo.count || 0) > 0) throw new Error("ลบใบเสนอราคานี้ไม่ได้ — มีใบแจ้งหนี้/ใบงานอ้างอิงอยู่ · ต้องลบเอกสารถัดไปก่อน");
  const [{ data: head }, { data: items }] = await Promise.all([
    supabase.from("quotations").select("*").eq("quote_no", quote_no).maybeSingle(),
    supabase.from("quotation_items").select("*").eq("quote_no", quote_no),
  ]);
  const { error } = await supabase.from("quotations").delete().eq("quote_no", quote_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "quotation", target_no: quote_no, reason, snapshot: head ? { ...head, items: items || [] } : null });
  syncCashEntriesFromDocs().catch(() => {}); // refresh cash flow after quote delete
}

// หมดอายุใบเสนอราคาอัตโนมัติ (ทันที + ย้อนหลัง): ร่าง/ส่งแล้ว ที่เลยวันยืนราคา → หมดอายุ · เรียกตอนเปิดหน้าใบเสนอราคา
export async function expireOverdueQuotes() {
  const d = new Date(Date.now() + 7 * 3600e3);   // เวลาไทย (UTC+7)
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  try { const { data } = await supabase.from("quotations").update({ status: "expired" }).in("status", ["draft", "sent"]).lt("valid_until", today).select("quote_no"); return (data || []).length; }
  catch { return 0; }   // best-effort — ไม่ให้กระทบการโหลดหน้า
}
// ส่งใบเสนอราคาให้ลูกค้าแล้ว → เปลี่ยน "ร่าง" เป็น "ส่งแล้ว" อัตโนมัติ (เฉพาะร่าง — ไม่แตะอนุมัติ/ปฏิเสธ/หมดอายุ) · best-effort
export async function markQuoteSent(quote_no) {
  if (!quote_no) return;
  try { await supabase.from("quotations").update({ status: "sent" }).eq("quote_no", quote_no).eq("status", "draft"); } catch { /* ไม่ให้กระทบการส่ง */ }
}
export async function setQuotationStatus(quote_no, status, reason) {
  // อ่านสถานะเดิมก่อนอัปเดต — ไว้แยก "unapprove" (ถอนใบอนุมัติ) ออกจากการเปลี่ยนสถานะทั่วไปใน audit log
  let prevStatus = null;
  if (reason && status !== "cancelled" && status !== "approved") {
    const { data: prev } = await supabase.from("quotations").select("status").eq("quote_no", quote_no).maybeSingle();
    prevStatus = prev?.status || null;
  }
  const patch = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  const { error } = await supabase.from("quotations").update(patch).eq("quote_no", quote_no);
  if (error) throw error;
  if (status === "cancelled" || status === "approved")
    await logAudit({ action: status === "approved" ? "approve" : "cancel", target_type: "quotation", target_no: quote_no, reason });
  else if (reason) // มีเหตุผลแนบมากับการเปลี่ยนสถานะอื่น — ลงประวัติเสมอ (unapprove เฉพาะตอนถอนจากใบอนุมัติจริง)
    await logAudit({ action: prevStatus === "approved" ? "unapprove" : "status_change", target_type: "quotation", target_no: quote_no, reason });
  syncCashEntriesFromDocs().catch(() => {}); // cancel/approve → refresh projected receivables in cash flow
}

// id → name map of document creators (for the "ผู้สร้างเอกสาร" audit line)
// ชื่อคนสร้างเอกสาร · ids = เจาะจงเฉพาะคนที่เอกสารชุดนี้อ้างถึง (พรีวิวใบเดียวไม่ต้องโหลดพนักงานทั้งบริษัท)
// ไม่ระบุ ids = โหลดทั้งหมด แต่ต้องผ่าน _fetchAll — เดิม select ตรง ๆ จึงโดนเพดาน 1000 แถวเงียบ ๆ
async function _creators(ids) {
  const list = ids ? [...new Set(ids.filter(Boolean))] : null;
  if (list && !list.length) return {};
  const rows = await _fetchAll((f, t) => {
    const q = supabase.from("profiles").select("id,name", { count: "exact" });
    return (list && list.length <= 200 ? q.in("id", list) : q).order("id").range(f, t);
  }).catch(() => []);
  return Object.fromEntries((rows || []).map((p) => [p.id, p.name]));
}

// ---------- INVOICES (ใบแจ้งหนี้ · แบ่งงวดได้) ----------
export function listInvoices(opts = {}) { return _cached("listInvoices:" + JSON.stringify(opts || {}), () => _loadInvoices(opts), _SHORT_TTL); }
async function _loadInvoices(opts = {}) {
  const nos = _scopeNos(opts);
  const ivP = _allRows((f, t) => _onlyNos(supabase.from("invoices").select("*", { count: "exact" }), "invoice_no", nos).order("created_at", { ascending: false }).order("invoice_no").range(f, t));
  const iv = nos ? await ivP : { data: [] };   // เจาะจงใบ → รอหัวใบก่อน · โหลดทั้งหมด → ยิงขนานเหมือนเดิม
  if (iv.error) throw iv.error;
  const cids = _idsOf(iv.data, "customer_id"), sids = _idsOf(iv.data, "site_id"), qnos = _idsOf(iv.data, "quote_no");
  const [cu, si, ct, qt, rc, bn] = await Promise.all([
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("*", { count: "exact" }), "id", nos && cids).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }), "id", nos && sids).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }), "customer_id", nos && cids).order("id").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("quotations").select("quote_no,boq_no,title", { count: "exact" }), "quote_no", nos && (qnos.length ? qnos : ["__none__"])).order("quote_no").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("receipts").select("invoice_no,status", { count: "exact" }), "invoice_no", nos).order("receipt_no").range(f, t)),
    // invoice_nos เป็น array — หาใบวางบิลที่ "มีใบใดใบหนึ่งในชุดนี้" ต้องใช้ overlaps ไม่ใช่ in/contains
    _allRows((f, t) => { const q = supabase.from("billing_notes").select("billing_no,invoice_nos,status", { count: "exact" }); return (nos ? q.overlaps("invoice_nos", nos) : q).order("billing_no").range(f, t); }).catch(() => ({ data: [] })), // pre-050 → ไม่มีตาราง
  ]);
  const ivR = nos ? iv : await ivP;
  if (ivR.error) throw ivR.error;
  if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (qt.error) throw qt.error;
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cx = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const cxb = Object.fromEntries((cu.data || []).map((c) => [c.id, c.branch]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  const boqByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, x.boq_no]));
  const titleByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, x.title]));
  const receiptedInv = new Set((rc.data || []).filter((r) => r.status !== "cancelled").map((r) => r.invoice_no));
  // ใบวางบิลที่ยังไม่ยกเลิกที่มีใบแจ้งหนี้นี้อยู่ — ล็อกลำดับการยกเลิก (ต้องยกเลิกใบวางบิลก่อน)
  const billingByInv = {};
  (bn.data || []).forEach((b) => { if (b.status !== "cancelled") (b.invoice_nos || []).forEach((n) => { if (!billingByInv[n]) billingByInv[n] = b.billing_no; }); });
  const cb = await _creators(nos ? _idsOf(ivR.data, "created_by") : null);
  return (ivR.data || []).map((x) => {
    const s = x.site_id ? sm[x.site_id] : null; const ct0 = cc[x.customer_id];
    return { ...x, boq_no: x.boq_no || (x.quote_no ? boqByQuote[x.quote_no] : null) || null,
      title: x.quote_no ? (titleByQuote[x.quote_no] || null) : null,
      customerName: cn[x.customer_id] || null, customerCode: x.customer_id || null, customerTaxId: cx[x.customer_id] || null, customerBranch: cxb[x.customer_id] || null,
      customerAddr: ca[x.customer_id] || null, siteName: s?.site_name || null, siteAddress: s?.address || null,
      mapUrl: (s && s.map_url) || _gmap(s?.address || ca[x.customer_id]),
      createdByName: cb[x.created_by] || null,
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      hasReceipt: receiptedInv.has(x.invoice_no), billingNo: billingByInv[x.invoice_no] || null };
  });
}
// billed total (non-cancelled) per quote_no — used to compute remaining
export function billedByQuote(invoices) {
  const m = {};
  (invoices || []).forEach((x) => { if (x.status !== "cancelled") m[x.quote_no] = (m[x.quote_no] || 0) + Number(x.total || 0); });
  return m;
}
// ยอดรวมทั้งสิ้นของใบเสนอ คำนวณสดจาก DB — สูตรเดียวกับ listQuotations (ส่วนลดบรรทัด → ส่วนลดรวม → VAT · ราคาบัตรปรับต่อหน่วย)
// ⚠️ อ่านไม่สำเร็จต้อง "โยน" ไม่ใช่คืน null — ผู้เรียกใช้ค่านี้เป็นการ์ดกันวางบิลเกิน 100%
//    ถ้าคืน null ตอนอ่านพลาด (เน็ตหลุด/RLS ปฏิเสธ) การ์ดจะถูกข้ามเงียบ ๆ แล้ววางบิลทะลุยอดใบเสนอได้
//    null สงวนไว้สำหรับกรณีเดียว: ไม่มีใบเสนอราคาเลขนี้จริง ๆ
async function _quoteGrand(quote_no) {
  const { data: qo, error: qe } = await supabase.from("quotations").select("discount_type,discount_value,vat,pay_method,status").eq("quote_no", quote_no).maybeSingle();
  if (qe) throw qe;
  if (!qo) return null;
  let itr = await supabase.from("quotation_items").select("qty,unit_price,discount").eq("quote_no", quote_no);
  if (itr.error) itr = await supabase.from("quotation_items").select("qty,unit_price").eq("quote_no", quote_no); // pre-142
  if (itr.error) throw itr.error;
  const payRate = qo.pay_method === "card_full" ? 0.04 : qo.pay_method === "card_inst10" ? 0.14 : 0;
  const adjU = (u) => payRate ? Math.ceil(Math.round((Number(u) || 0) * (1 + payRate) * 100) / 100) : Number(u) || 0;
  const subtotal = (itr.data || []).reduce((a, x) => a + Number(x.qty) * adjU(x.unit_price) - (Number(x.discount) || 0), 0);
  const discount = qo.discount_type === "percent" ? subtotal * Number(qo.discount_value || 0) / 100 : Number(qo.discount_value || 0);
  const afterDisc = subtotal - discount;
  return { grand: afterDisc + (qo.vat ? afterDisc * 0.07 : 0), status: qo.status };
}
export async function saveInvoice(inv) {
  const { data: { user } } = await supabase.auth.getUser();
  // guard ฝั่ง server: ใบเสนอต้องยัง approved และยอดสะสม (คิดสดจาก DB) ต้องไม่เกินยอดทั้งใบ — กัน 2 เครื่องวางบิลพร้อมกันเกิน 100%
  if (inv.quote_no) {
    // fail-closed: อ่านใบเสนอไม่ได้ (เน็ต/สิทธิ์พัง) = _quoteGrand โยน error ออกมา ไม่ใช่ข้าม guard เงียบ ๆ
    // ไม่พบใบเสนอเลขนี้ = หยุดเช่นกัน (ใบแจ้งหนี้อ้างใบเสนอที่ไม่มีอยู่ ไม่มีอะไรให้เทียบยอด)
    const qg = await _quoteGrand(inv.quote_no);
    if (!qg) throw new Error(`ไม่พบใบเสนอราคา ${inv.quote_no} — วางบิลไม่ได้ (ใบถูกลบไปแล้ว หรือไม่มีสิทธิ์อ่าน)`);
    if (qg.status !== "approved") throw new Error("ใบเสนอราคานี้ไม่ได้อยู่ในสถานะอนุมัติแล้ว — วางบิลไม่ได้");
    const { data: others, error: oe } = await supabase.from("invoices").select("invoice_no,total,status").eq("quote_no", inv.quote_no).neq("invoice_no", inv.invoice_no);
    if (oe) throw oe;
    const billedOther = (others || []).filter((x) => x.status !== "cancelled").reduce((a, x) => a + Number(x.total || 0), 0);
    if (billedOther + (Number(inv.total) || 0) > qg.grand + 1)
      throw new Error(`ยอดวางบิลรวมเกินยอดใบเสนอราคา — วางแล้ว ${billedOther.toLocaleString("en-US")} + งวดนี้ ${(Number(inv.total) || 0).toLocaleString("en-US")} > ${qg.grand.toLocaleString("en-US")} (อาจมีคนวางบิลพร้อมกันจากอีกเครื่อง — รีเฟรชแล้วลองใหม่)`);
  }
  const { error } = await supabase.from("invoices").upsert({
    invoice_no: inv.invoice_no, quote_no: inv.quote_no || null, boq_no: inv.boq_no || null,
    customer_id: inv.customer_id || null, site_id: inv.site_id || null,
    issue_date: inv.issue_date || null, due_date: inv.due_date || null,
    installment: Number(inv.installment) || 1, pct: Number(inv.pct) || 0,
    base: Number(inv.base) || 0, vat_amt: Number(inv.vat_amt) || 0, total: Number(inv.total) || 0,
    wht_amt: Number(inv.wht_amt) || 0, wht_rate: Number(inv.wht_rate) || 3, items: inv.items || [],
    note: inv.note?.trim() || null, internal_note: inv.internal_note?.trim() || null, ..._termCols(inv), ..._signCols(inv), status: inv.status || "unpaid", created_by: user?.id || null,
  }, { onConflict: "invoice_no" });
  if (error) throw error;
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background (unpaid invoice → "คาดว่าจะรับ")
  syncInternalNote({ quoteNo: inv.quote_no }, inv.internal_note).catch(() => {});
}
// update per-line WHT selection (items) + rate + recomputed amount on an invoice
export async function setInvoiceWht(invoice_no, items, wht_rate, wht_amt) {
  const { data: old } = await supabase.from("invoices").select("wht_amt").eq("invoice_no", invoice_no).single();
  const { error } = await supabase.from("invoices").update({ items: items || [], wht_rate: Number(wht_rate) || 3, wht_amt: Number(wht_amt) || 0 }).eq("invoice_no", invoice_no);
  if (error) throw error;
  // เส้นเงินเข้าที่คาดการณ์จากใบแจ้งหนี้ = total − wht_amt → แก้ยอดหักแล้วต้องคำนวณใหม่
  await logAudit({ action: "edit", target_type: "invoice", target_no: invoice_no,
    reason: `แก้หัก ณ ที่จ่าย: ${Number(old?.wht_amt) || 0} → ${Number(wht_amt) || 0} บาท` });
  syncCashEntriesFromDocs().catch(() => {});
}
export async function setInvoiceStatus(invoice_no, status, reason) {
  // chain safety: cannot cancel an invoice that has a LIVE receipt or sits in a LIVE billing note — ใบยกเลิกแล้วไม่บล็อก
  if (status === "cancelled") {
    const { count, error: ce } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", invoice_no).neq("status", "cancelled");
    if (ce) throw ce;
    if ((count || 0) > 0) throw new Error("ยกเลิกใบแจ้งหนี้นี้ไม่ได้ — ออกใบเสร็จจากใบนี้แล้ว · ต้องยกเลิก/ลบใบเสร็จก่อน");
    // อยู่ในใบวางบิลที่ยังไม่ยกเลิก → ต้องยกเลิกใบวางบิลก่อน (เดิมล็อกไว้แค่ฝั่ง UI)
    const { data: bns } = await supabase.from("billing_notes").select("billing_no,invoice_nos").neq("status", "cancelled").contains("invoice_nos", [invoice_no]).limit(1);
    if (bns && bns.length) throw new Error(`ยกเลิกใบแจ้งหนี้นี้ไม่ได้ — อยู่ในใบวางบิล ${bns[0].billing_no} · ต้องยกเลิกใบวางบิลก่อน`);
  }
  const { error } = await supabase.from("invoices").update({ status }).eq("invoice_no", invoice_no);
  if (error) throw error;
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "invoice", target_no: invoice_no, reason });
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background (cancel removes the "คาดว่าจะรับ" line)
}
// ตัดหนี้สูญ (mig 160) — เลิกตามเป็นลูกหนี้ แต่ยอดขาย/ภาษีขายยังอยู่ในประวัติครบ
// ต่างจาก "ยกเลิก" ตรงที่งานทำไปแล้ว ของส่งไปแล้ว ใบกำกับภาษีออกไปแล้ว แค่เก็บเงินไม่ได้
// ยกเลิกจะลบยอดขายก้อนนั้นออกจากรายงานขาย/ภาษีด้วย ซึ่งผิดข้อเท็จจริง
export async function setInvoiceBadDebt(invoice_no, reason) {
  if (!reason || !reason.trim()) throw new Error("ต้องระบุเหตุผลที่ตัดหนี้สูญ");
  const { count, error: ce } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", invoice_no).neq("status", "cancelled");
  if (ce) throw ce;
  if ((count || 0) > 0) throw new Error("ตัดหนี้สูญไม่ได้ — ใบนี้ออกใบเสร็จ (รับเงิน) ไปแล้ว");
  const patch = { status: "bad_debt", bad_debt_at: new Date().toISOString(), bad_debt_reason: reason.trim() };
  let { error } = await supabase.from("invoices").update(patch).eq("invoice_no", invoice_no);
  // ยังไม่รัน mig 160 → ต้องบอกให้ชัด ไม่ใช่ปล่อยเงียบแล้วผู้ใช้คิดว่าตัดแล้ว
  if (error && /bad_debt|status_check|PGRST204/i.test(error.message || "")) throw new Error("ยังตัดหนี้สูญไม่ได้ — ต้องรัน migration 160 ใน Supabase ก่อน");
  if (error) throw error;
  await logAudit({ action: "bad_debt", target_type: "invoice", target_no: invoice_no, reason: reason.trim() });
  syncCashEntriesFromDocs().catch(() => {});   // ตัดเส้น "คาดว่าจะรับ" ออกจากกระแสเงินสด
}
export async function deleteInvoice(invoice_no, reason) {
  // chain safety: block if a LIVE receipt was issued from this invoice — ใบเสร็จยกเลิกแล้วไม่บล็อก
  const { count, error: ce } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", invoice_no).neq("status", "cancelled");
  if (ce) throw ce;
  if ((count || 0) > 0) throw new Error("ลบใบแจ้งหนี้นี้ไม่ได้ — ออกใบเสร็จจากใบนี้แล้ว · ต้องยกเลิก/ลบใบเสร็จก่อน");
  const { data: snap } = await supabase.from("invoices").select("*").eq("invoice_no", invoice_no).maybeSingle();
  const { error } = await supabase.from("invoices").delete().eq("invoice_no", invoice_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "invoice", target_no: invoice_no, reason, snapshot: snap });
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
}

// ---------- RECEIPTS (ใบเสร็จรับเงิน) ----------
// "ใบเสนอเลขนี้ ใครขาย ทีมไหนทำ" — ตารางบางเฉพาะที่ใช้ระบุตัวตน ไม่มีรายการ/ราคา/ลูกค้า
// ทำไมต้องมี: แดชบอร์ดดึงใบเสนอเฉพาะช่วงที่เลือก แต่ใบเสร็จในช่วงนั้นมักผูกกับใบเสนอที่อนุมัติไปหลายเดือนก่อน
// (ลูกค้าจ่ายทีหลัง = ปกติของงานนี้) ถ้าไม่มีตัวนี้ พอกรอง "พนักงานขาย: สมชาย" ใบเสร็จพวกนั้นจะถูกทิ้ง
// แล้วการ์ด "รับเงินแล้ว" กลายเป็น 0 บาททั้งที่เก็บเงินได้จริง — ผิดแบบไม่มีอะไรฟ้อง
export async function quoteAttribution(nos) {
  const list = _capNos(nos);
  if (list && !list.length) return {};
  const [q, jo] = await Promise.all([
    _allRows((f, t) => _onlyNos(supabase.from("quotations").select("quote_no,created_by", { count: "exact" }), "quote_no", list).order("quote_no").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("job_orders").select("quote_no,assigned_team,status,job_no", { count: "exact" }), "quote_no", list).order("job_no").range(f, t)),
  ]);
  if (q.error) throw q.error;
  const cb = await _creators(list ? _idsOf(q.data, "created_by") : null);
  const team = {}; (jo.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !team[j.quote_no]) team[j.quote_no] = j.assigned_team; });
  const out = {};
  (q.data || []).forEach((x) => { out[x.quote_no] = { createdByName: cb[x.created_by] || null, jobTeam: team[x.quote_no] || null }; });
  return out;
}

export function listReceipts(opts = {}) { return _cached("listReceipts:" + JSON.stringify(opts || {}), () => _loadReceipts(opts), _SHORT_TTL); }
async function _loadReceipts(opts = {}) {
  const nos = _scopeNos(opts);
  const since = _sinceOf(opts);
  // ใบเสร็จเก่าที่ issue_date เป็น NULL ต้องไม่หายไปเงียบ ๆ → OR กับ created_at ที่ not null เสมอ
  const rcP = _allRows((f, t) => _orSince(_onlyNos(supabase.from("receipts").select("*", { count: "exact" }), "receipt_no", nos), ["issue_date", "created_at"], since).order("created_at", { ascending: false }).order("receipt_no").range(f, t));
  const scoped = !!(nos || since);
  const rc = scoped ? await rcP : { data: [] };   // เจาะจงใบ/ช่วงวันที่ → รอหัวใบก่อน · โหลดทั้งหมด → ยิงขนานเหมือนเดิม
  if (rc.error) throw rc.error;
  const cScope = scoped ? _capNos(_idsOf(rc.data, "customer_id")) : null;
  const sScope = scoped ? _capNos(_idsOf(rc.data, "site_id")) : null;
  const qScope = scoped ? _capNos(_idsOf(rc.data, "quote_no")) : null;
  const [cu, si, ct, jo, qt] = await Promise.all([
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("*", { count: "exact" }), "id", cScope).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }), "id", sScope).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }), "customer_id", cScope).order("id").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("job_orders").select("job_no,quote_no", { count: "exact" }), "quote_no", qScope).order("job_no").range(f, t)),
    _allRows((f, t) => _onlyNos(supabase.from("quotations").select("quote_no,title", { count: "exact" }), "quote_no", qScope).order("quote_no").range(f, t)),
  ]);
  const rcR = scoped ? rc : await rcP;
  if (rcR.error) throw rcR.error;
  if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (jo.error) throw jo.error; if (qt.error) throw qt.error;
  const titleByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, x.title]));
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cx = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const cxb = Object.fromEntries((cu.data || []).map((c) => [c.id, c.branch]));
  const ctype = Object.fromEntries((cu.data || []).map((c) => [c.id, c.type]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  const jobByQuote = {}; (jo.data || []).forEach((j) => { if (j.quote_no && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j.job_no; });
  const cb = await _creators(scoped ? _idsOf(rcR.data, "created_by") : null);
  return (rcR.data || []).map((x) => {
    const s = x.site_id ? sm[x.site_id] : null; const ct0 = cc[x.customer_id];
    return { ...x, job_no: x.job_no || (x.quote_no ? jobByQuote[x.quote_no] : null) || null,
      title: x.quote_no ? (titleByQuote[x.quote_no] || null) : null,
      customerName: cn[x.customer_id] || null, customerCode: x.customer_id || null, customerTaxId: cx[x.customer_id] || null, customerBranch: cxb[x.customer_id] || null, customerType: ctype[x.customer_id] || null,
      customerAddr: ca[x.customer_id] || null, siteName: s?.site_name || null, siteAddress: s?.address || null, createdByName: cb[x.created_by] || null,
      mapUrl: (s && s.map_url) || _gmap(s?.address || ca[x.customer_id]),
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null };
  });
}
// create a receipt from an invoice. Invoice is marked paid only when the receipt status is 'paid'.
export async function saveReceipt(r) {
  const { data: { user } } = await supabase.auth.getUser();
  const status = r.status === "pending" ? "pending" : "paid";
  // guard ฝั่ง server: ใบแจ้งหนี้ต้องยังไม่ยกเลิก และห้ามมีใบเสร็จ live ซ้ำใบเดิม (กัน 2 เครื่องออกพร้อมกัน = รับเงินซ้ำ)
  if (r.invoice_no) {
    const { data: ivRow, error: ie } = await supabase.from("invoices").select("status").eq("invoice_no", r.invoice_no).maybeSingle();
    if (ie) throw ie;
    if (!ivRow) throw new Error(`ไม่พบใบส่งของ/ใบแจ้งหนี้ ${r.invoice_no}`);
    if (ivRow.status === "cancelled") throw new Error("ใบส่งของ/ใบแจ้งหนี้ใบนี้ถูกยกเลิกแล้ว — ออกใบเสร็จไม่ได้");
    const { count, error: re } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", r.invoice_no).neq("status", "cancelled").neq("receipt_no", r.receipt_no);
    if (re) throw re;
    if ((count || 0) > 0) throw new Error("ใบแจ้งหนี้นี้มีใบเสร็จอยู่แล้ว — ห้ามออกซ้ำ (อาจมีคนออกให้พร้อมกันจากอีกเครื่อง)");
  }
  const { error } = await supabase.from("receipts").upsert({
    receipt_no: r.receipt_no, invoice_no: r.invoice_no || null, quote_no: r.quote_no || null, boq_no: r.boq_no || null, job_no: r.job_no || null,
    customer_id: r.customer_id || null, site_id: r.site_id || null, issue_date: r.issue_date || null, payment_method: r.payment_method || null,
    base: Number(r.base) || 0, vat_amt: Number(r.vat_amt) || 0, total: Number(r.total) || 0, wht_amt: Number(r.wht_amt) || 0, net: Number(r.net) || 0,
    wht: !!r.wht, wht_rate: Number(r.wht_rate) || 3, items: r.items || [],
    status, note: r.note?.trim() || null, internal_note: r.internal_note?.trim() || null, ..._termCols(r), ..._signCols(r), created_by: user?.id || null,
  }, { onConflict: "receipt_no" });
  if (error) throw error;
  if (r.invoice_no) await supabase.from("invoices").update({ status: status === "paid" ? "paid" : "unpaid" }).eq("invoice_no", r.invoice_no).neq("status", "cancelled"); // ห้ามปลุกใบที่ยกเลิกแล้วกลับมา
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
  syncBankReceipts().catch(() => {});        // auto-post the deposit into the bank-account ledger
  syncInternalNote({ invoiceNo: r.invoice_no }, r.internal_note).catch(() => {});
}
// update per-line WHT selection + rate + recomputed amounts on a receipt
export async function setReceiptWht(receipt_no, items, wht, wht_rate, wht_amt, net) {
  const { data: old } = await supabase.from("receipts").select("wht_amt,net").eq("receipt_no", receipt_no).single();
  const { error } = await supabase.from("receipts").update({ items: items || [], wht: !!wht, wht_rate: Number(wht_rate) || 3, wht_amt: Number(wht_amt) || 0, net: Number(net) || 0 }).eq("receipt_no", receipt_no);
  if (error) throw error;
  // แก้หัก ณ ที่จ่ายหลังออกใบ = ยอดรับสุทธิเปลี่ยน → เงินฝากในสมุดบัญชีและเส้นกระแสเงินสดต้องขยับตาม
  // เดิมไม่ sync เลย ยอดในระบบจึงเพี้ยนจากเงินที่เข้าธนาคารจริง จนกว่าจะมีคนบังเอิญไปกดออก/ยกเลิกใบอื่น
  await logAudit({ action: "edit", target_type: "receipt", target_no: receipt_no,
    reason: `แก้หัก ณ ที่จ่าย: ${Number(old?.wht_amt) || 0} → ${Number(wht_amt) || 0} บาท (รับสุทธิ ${Number(old?.net) || 0} → ${Number(net) || 0})` });
  syncCashEntriesFromDocs().catch(() => {});
  syncBankReceipts().catch(() => {});
}

// ---------- ใบลดหนี้ / ใบเพิ่มหนี้ (Credit / Debit Note) — mig 218 ----------
// ปรับยอดหลังออกใบเสร็จ/ใบแจ้งหนี้แล้ว · มีรายการของตัวเอง (ของที่ลด/เพิ่ม ไม่ได้ดึงจากใบเสนอ)
// ไม่แตะกระแสเงินสดอัตโนมัติ (v1) — เงินจริงเข้า/ออกผ่านใบเสร็จงวดถัดไป/การคืนเงิน (กันนับซ้ำ)
export function listAdjustmentNotes(opts = {}) { return _cached("listAdjustmentNotes:" + JSON.stringify(opts || {}), () => _loadAdjustmentNotes(opts), _SHORT_TTL); }
async function _loadAdjustmentNotes() {
  const [an, cu, si, ct] = await Promise.all([
    _allRows((f, t) => supabase.from("adjustment_notes").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("note_no").range(f, t)),
    _allRows((f, t) => supabase.from("customers").select("*", { count: "exact" }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }).order("id").range(f, t)),
  ]);
  if (an.error) throw an.error;
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cx = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const cxb = Object.fromEntries((cu.data || []).map((c) => [c.id, c.branch]));
  const ctype = Object.fromEntries((cu.data || []).map((c) => [c.id, c.type]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  return (an.data || []).map((x) => {
    const s = x.site_id ? sm[x.site_id] : null; const ct0 = cc[x.customer_id];
    return { ...x, customerName: cn[x.customer_id] || null, customerCode: x.customer_id || null, customerTaxId: cx[x.customer_id] || null, customerBranch: cxb[x.customer_id] || null,
      customerType: ctype[x.customer_id] || null, customerAddr: ca[x.customer_id] || null,
      siteName: s?.site_name || null, siteAddress: s?.address || null, mapUrl: (s && s.map_url) || _gmap(s?.address || ca[x.customer_id]),
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null };
  });
}
export async function saveAdjustmentNote(a) {
  const { data: { user } } = await supabase.auth.getUser();
  const kind = a.kind === "debit" ? "debit" : "credit";
  // อ้างเอกสารต้นทางอย่างน้อยหนึ่งใบ + ห้ามอ้างใบที่ยกเลิกแล้ว
  if (a.receipt_no) {
    const { data: rcRow, error: re } = await supabase.from("receipts").select("status").eq("receipt_no", a.receipt_no).maybeSingle();
    if (re) throw re;
    if (rcRow && rcRow.status === "cancelled") throw new Error("ใบเสร็จต้นทางถูกยกเลิกแล้ว — ออกใบลด/เพิ่มหนี้ไม่ได้");
  }
  const { error } = await supabase.from("adjustment_notes").upsert({
    note_no: a.note_no, kind, receipt_no: a.receipt_no || null, invoice_no: a.invoice_no || null, quote_no: a.quote_no || null,
    boq_no: a.boq_no || null, job_no: a.job_no || null, customer_id: a.customer_id || null, site_id: a.site_id || null,
    issue_date: a.issue_date || null, reason: a.reason?.trim() || null, is_vat: !!a.is_vat, items: a.items || [],
    base: Number(a.base) || 0, vat_amt: Number(a.vat_amt) || 0, total: Number(a.total) || 0,
    wht_rate: Number(a.wht_rate) || 3, wht_amt: Number(a.wht_amt) || 0, net: Number(a.net) || 0,
    note: a.note?.trim() || null, internal_note: a.internal_note?.trim() || null, ..._termCols(a), ..._signCols(a),
    status: a.status === "cancelled" ? "cancelled" : "issued", created_by: user?.id || null,
  }, { onConflict: "note_no" });
  if (error) throw error;
  bustCache("listAdjustmentNotes"); bustCache("listDocLinks");
  syncInternalNote({ invoiceNo: a.invoice_no }, a.internal_note).catch(() => {});
}
export async function setAdjustmentNoteWht(note_no, items, wht_rate, wht_amt, net) {
  const { error } = await supabase.from("adjustment_notes").update({ items: items || [], wht_rate: Number(wht_rate) || 3, wht_amt: Number(wht_amt) || 0, net: Number(net) || 0 }).eq("note_no", note_no);
  if (error) throw error;
  bustCache("listAdjustmentNotes");
  await logAudit({ action: "edit", target_type: "adjustment_note", target_no: note_no, reason: `แก้หัก ณ ที่จ่าย → ${Number(wht_amt) || 0} บาท` });
}
export async function setAdjustmentNoteStatus(note_no, status, reason) {
  const patch = { status };
  if (status === "cancelled") { patch.cancel_reason = reason || null; patch.cancelled_at = new Date().toISOString(); }
  const { error } = await supabase.from("adjustment_notes").update(patch).eq("note_no", note_no);
  if (error) throw error;
  bustCache("listAdjustmentNotes"); bustCache("listDocLinks");
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "adjustment_note", target_no: note_no, reason: reason || null });
}
export async function deleteAdjustmentNote(note_no, reason) {
  const { data: snap } = await supabase.from("adjustment_notes").select("*").eq("note_no", note_no).maybeSingle();
  await logAudit({ action: "delete", target_type: "adjustment_note", target_no: note_no, reason: reason || null, snapshot: snap || null });
  const { error } = await supabase.from("adjustment_notes").delete().eq("note_no", note_no);
  if (error) throw error;
  bustCache("listAdjustmentNotes"); bustCache("listDocLinks");
}

// toggle a receipt's paid status (and sync the linked invoice)
// ---------- BILLING NOTES (ใบวางบิล) ----------
export function listBillingNotes() { return _cached("listBillingNotes", _loadBillingNotes, _SHORT_TTL); }
async function _loadBillingNotes() {
  const [bn, iv, cu, si, ct, rc, qt] = await Promise.all([
    _allRows((f, t) => supabase.from("billing_notes").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("billing_no").range(f, t)),
    _allRows((f, t) => supabase.from("invoices").select("invoice_no,total,wht_amt,installment,pct,status,issue_date,quote_no", { count: "exact" }).order("invoice_no").range(f, t)),
    _allRows((f, t) => supabase.from("customers").select("*", { count: "exact" }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("receipts").select("invoice_no,status", { count: "exact" }).order("receipt_no").range(f, t)),
    _allRows((f, t) => supabase.from("quotations").select("quote_no,vat", { count: "exact" }).order("quote_no").range(f, t)),
  ]);
  if (bn.error) throw bn.error;
  const receiptedInv = new Set((rc.data || []).filter((r) => r.status !== "cancelled").map((r) => r.invoice_no));
  const quoteVat = Object.fromEntries((qt.data || []).map((q) => [q.quote_no, !!q.vat]));   // VAT status per quote
  const invByNo = Object.fromEntries((iv.data || []).map((x) => [x.invoice_no, { ...x, vat: !!quoteVat[x.quote_no], hasReceipt: receiptedInv.has(x.invoice_no) }]));
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cx = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const cxb = Object.fromEntries((cu.data || []).map((c) => [c.id, c.branch]));
  const ctype = Object.fromEntries((cu.data || []).map((c) => [c.id, c.type]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  return (bn.data || []).map((b) => {
    const invoices = (b.invoice_nos || []).map((no) => invByNo[no]).filter(Boolean);
    // ยอดรวมนับเฉพาะใบแจ้งหนี้ที่ยังไม่ยกเลิก — ใบยกเลิกยังโชว์ในรายการ (ติดป้าย) แต่ห้ามเข้าเงิน/เข้าใบพิมพ์
    const live = invoices.filter((x) => x.status !== "cancelled");
    const total = live.reduce((a, x) => a + (Number(x.total) || 0), 0);
    const wht = live.reduce((a, x) => a + (Number(x.wht_amt) || 0), 0);   // หัก ณ ที่จ่าย รวม (นิติบุคคล)
    const vat = live.some((x) => x.vat);   // ใบวางบิลถือเป็น VAT ถ้ามีใบแจ้งหนี้ VAT อยู่ → เลือกหัวกระดาษ/บัญชีให้ถูก
    const s = b.site_id ? sm[b.site_id] : null; const ct0 = cc[b.customer_id];
    return { ...b, customerName: cn[b.customer_id] || null, customerCode: b.customer_id || null, customerTaxId: cx[b.customer_id] || null, customerBranch: cxb[b.customer_id] || null,
      customerType: ctype[b.customer_id] || null, vat,
      customerAddr: ca[b.customer_id] || null, siteName: s?.site_name || null, siteAddress: s?.address || null, mapUrl: (s && s.map_url) || _gmap(s?.address || ca[b.customer_id]),
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      invoices, liveInvoices: live, total, wht, net: Math.round((total - wht) * 100) / 100, missing: (b.invoice_nos || []).length - invoices.length };
  });
}
export async function saveBillingNote(b) {
  const uid = await _uid();
  const { error } = await supabase.from("billing_notes").upsert({
    billing_no: b.billing_no, customer_id: b.customer_id || null, site_id: b.site_id || null,
    issue_date: b.issue_date || null, note: b.note || null, internal_note: b.internal_note?.trim() || null, invoice_nos: b.invoice_nos || [], ..._signCols(b),
    status: b.status || "open", created_by: uid,
  }, { onConflict: "billing_no" });
  if (error) throw error;
  syncInternalNote({ invoiceNo: (b.invoice_nos || [])[0] }, b.internal_note).catch(() => {});
}
// ใบวางบิลมีใบเสร็จ live ในสมาชิกไหม — ตัวล็อกโซ่ฝั่ง server (เดิมเช็คแค่ใน UI จาก data ตอนโหลดหน้า → 2 เครื่องแข่งกันหลุดได้)
async function _bnLiveReceipts(billing_no) {
  const { data: b } = await supabase.from("billing_notes").select("invoice_nos").eq("billing_no", billing_no).maybeSingle();
  const nos = b?.invoice_nos || [];
  if (!nos.length) return 0;
  const { count, error } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).in("invoice_no", nos).neq("status", "cancelled");
  if (error) throw error;
  return count || 0;
}
export async function setBillingNoteStatus(billing_no, status, reason) {
  if (status === "cancelled" && (await _bnLiveReceipts(billing_no)) > 0)
    throw new Error("ยกเลิกใบวางบิลนี้ไม่ได้ — มีใบแจ้งหนี้ในใบนี้ที่ออกใบเสร็จแล้ว · ต้องยกเลิกใบเสร็จก่อน");
  const { error } = await supabase.from("billing_notes").update({ status }).eq("billing_no", billing_no);
  if (error) throw error;
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "billing_note", target_no: billing_no, reason });
  syncCashEntriesFromDocs().catch(() => {}); // reconcile cash flow after any status change
}
export async function deleteBillingNote(billing_no, reason) {
  if ((await _bnLiveReceipts(billing_no)) > 0)
    throw new Error("ลบใบวางบิลนี้ไม่ได้ — มีใบแจ้งหนี้ในใบนี้ที่ออกใบเสร็จแล้ว · ต้องยกเลิก/ลบใบเสร็จก่อน");
  const { data: snap } = await supabase.from("billing_notes").select("*").eq("billing_no", billing_no).maybeSingle();
  const { error } = await supabase.from("billing_notes").delete().eq("billing_no", billing_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "billing_note", target_no: billing_no, reason, snapshot: snap });
  syncCashEntriesFromDocs().catch(() => {}); // reconcile cash flow after delete
}

export async function setReceiptStatus(receipt_no, status, invoice_no, reason) {
  const { error } = await supabase.from("receipts").update({ status }).eq("receipt_no", receipt_no);
  if (error) throw error;
  if (invoice_no) await supabase.from("invoices").update({ status: status === "paid" ? "paid" : "unpaid" }).eq("invoice_no", invoice_no).neq("status", "cancelled"); // ห้ามปลุกใบที่ยกเลิกแล้ว
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "receipt", target_no: receipt_no, reason });
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
  syncBankReceipts().catch(() => {});        // paid→post / cancelled→remove the bank-ledger deposit
}
// จองใบก่อนยิงเข้า FlowAccount (mig 175) — คืน "claimed" = จองได้ ยิงต่อได้ · "taken" = ส่ง/กำลังส่งอยู่แล้ว
// กันสองแท็บ/สองคนกดส่งใบเดียวกันพร้อมกัน = สร้างเอกสารซ้ำใน FlowAccount
export async function claimReceiptFlowAccount(receipt_no) {
  const { data, error } = await supabase.rpc("claim_receipt_flowaccount", { p_receipt_no: receipt_no });
  if (!error) return data === true ? "claimed" : "taken";
  // ⚠️ ห้าม degrade เป็นเช็กแบบไม่ atomic (SELECT flowaccount_id แล้วถือว่า claimed) — สองแท็บอ่าน null
  //    พร้อมกันจะจองทั้งคู่ = สร้างเอกสารซ้ำใน FlowAccount · โยน error ให้ลองใหม่ดีกว่าเสี่ยงส่งซ้ำ
  //    (รวมเคส RPC หายเพราะยังไม่รัน migration 175 หรือ schema cache กำลัง reload หลังรัน)
  if (/claim_receipt_flowaccount|PGRST202|42883|does not exist|schema cache/i.test(error.message || "")) {
    throw new Error("ยังส่ง FlowAccount ไม่ได้ — ต้องรัน migration 175 ใน Supabase ก่อน (ระบบกันส่งซ้ำ) แล้วลองใหม่");
  }
  throw error;
}
// ปล่อยการจอง เมื่อส่งไม่สำเร็จ (ยังไม่ได้เลขจริงจาก FlowAccount) — ให้แก้แล้วส่งใหม่ได้
export async function releaseReceiptFlowAccount(receipt_no) {
  await supabase.rpc("release_receipt_flowaccount", { p_receipt_no: receipt_no }).catch(() => {});
}
export async function saveReceiptFlowAccount(receipt_no, faId, faNo) {
  // RPC ประทับเลขแบบ "เขียนครั้งเดียว" (mig 175 — มีเลขแล้วไม่ทับ) · gate เฉพาะ role ที่ส่ง FlowAccount ได้
  // ⚠️ ห้ามกลืน error — ถ้า FA สร้างเอกสารแล้วแต่บันทึกเลขกลับไม่ได้ ผู้เรียกต้องรู้ เพื่อเตือนไม่ให้กดส่งซ้ำ
  const { error } = await supabase.rpc("set_receipt_flowaccount", { p_receipt_no: receipt_no, p_fa_id: faId ? String(faId) : null, p_fa_no: faNo || null });
  if (!error) return;   // data true = ประทับแล้ว · data false = มีเลขอยู่แล้ว — ทั้งคู่ถือว่าเลขถูกบันทึกไว้แล้ว
  // fallback (pre-084/085 หรือ RPC หาย): เขียนตรงแบบเขียนครั้งเดียว (ไม่ทับใบที่มีเลขแล้ว)
  const { error: e2 } = await supabase.from("receipts")
    .update({ flowaccount_id: faId ? String(faId) : null, flowaccount_no: faNo || null, flowaccount_at: new Date().toISOString() })
    .eq("receipt_no", receipt_no).is("flowaccount_id", null);
  if (e2) throw e2;
}
export async function deleteReceipt(receipt_no, invoice_no, reason) {
  const { data: snap } = await supabase.from("receipts").select("*").eq("receipt_no", receipt_no).maybeSingle();
  const { error } = await supabase.from("receipts").delete().eq("receipt_no", receipt_no);
  if (error) throw error;
  if (invoice_no) await supabase.from("invoices").update({ status: "unpaid" }).eq("invoice_no", invoice_no).neq("status", "cancelled"); // ห้ามปลุกใบที่ยกเลิกแล้ว
  await logAudit({ action: "delete", target_type: "receipt", target_no: receipt_no, reason, snapshot: snap });
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
  syncBankReceipts().catch(() => {});        // remove the bank-ledger deposit for the deleted receipt
}

// ---------- JOB ORDERS (ใบงาน) ----------
const _gmap = (a) => (a && a.trim()) ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a.trim()) : null;
// resolve address/map LIVE from the linked customer site (so editing the customer flows to job orders)
function _resolveJo(jo, custName, custAddr, siteMap, teamName, custContact) {
  const s = jo.site_id ? siteMap[jo.site_id] : null;
  const address = (s && s.address) || jo.address || (custAddr && custAddr[jo.customer_id]) || null;
  const map_url = (s && s.map_url) || jo.map_url || _gmap(address);
  const cc = custContact ? custContact[jo.customer_id] : null;
  return { ...jo, address, map_url,
    contact_name: jo.contact_name || (s && s.contact_name) || (cc && cc.name) || null,
    contact_phone: jo.contact_phone || (s && s.phone) || (cc && cc.phone) || null,
    customerAddr: custAddr ? (custAddr[jo.customer_id] || null) : null,
    customerName: custName ? (custName[jo.customer_id] || null) : null,
    mainContactName: (cc && cc.name) || null, mainContactPhone: (cc && cc.phone) || null,
    siteName: (s && s.site_name) || null, siteAddress: (s && s.address) || null,
    siteContactName: (s && s.contact_name) || null, siteContactPhone: (s && s.phone) || null,
    teamName: teamName ? (teamName[jo.assigned_team] || jo.assigned_team) : jo.assigned_team };
}
// first contact per customer (live fallback for the snapshot contact on the job order)
function _firstContacts(rows) { const m = {}; (rows || []).forEach((c) => { if (!m[c.customer_id]) m[c.customer_id] = c; }); return m; }

// fieldOnly = โหมดจอช่าง: ให้ฐานข้อมูลกรองทีมและ "ตัดราคาออก" ตั้งแต่ต้นทาง (mig 166)
// เดิมโหลด quotation_items ทั้งตารางแบบ select * ลงมือถือช่าง = ราคาต่อหน่วย+ส่วนลดของทุกลูกค้าอยู่ในเครื่อง
// ⚠️ โหมดออฟฟิศ (ค่าเริ่มต้น) ต้องได้ผลเท่าเดิมเป๊ะ — quoteGrand/salesName/boq_no ถูกใช้ที่หน้าแชตและแผงพรีวิว
//    ถ้าเผลอให้ออฟฟิศไปใช้โหมดช่าง มูลค่างานจะกลายเป็น 0 บาททุกใบแบบเงียบ ๆ
export function listJobOrders(opts = {}) { return _cached("listJobOrders:" + JSON.stringify(opts || {}), () => _loadJobOrders(opts), _SHORT_TTL); }
async function _loadJobOrders({ fieldOnly = false, team = null } = {}) {
  if (fieldOnly) {
    const { data, error } = await supabase.rpc("jobs_for_team", { p_team: team || null });
    // ยังไม่รัน mig 166 → ถอยไปทางเดิม จอช่างต้องไม่พังระหว่างรอ deploy/รัน SQL
    // (ยังเห็นราคาอยู่เหมือนเดิมจนกว่าจะรัน migration — เป็นสถานะชั่วคราวที่ยอมรับได้ ดีกว่าเปิดแอปไม่ได้)
    if (error && /jobs_for_team|does not exist|PGRST202/i.test(error.message || "")) return listJobOrders();
    if (error) throw error;
    return (data || []).map((r) => {
      const site = r.site_id ? { site_name: r.site_name, address: r.site_address, map_url: r.site_map_url, contact_name: r.site_contact_name, phone: r.site_phone } : null;
      const address = (site && site.address) || r.address || r.customer_address || null;
      return {
        ...r,
        customerName: r.customer_name || null,
        address, map_url: (site && site.map_url) || r.map_url || _gmap(address),
        customerAddr: r.customer_address || null,
        siteName: site?.site_name || null, siteAddress: site?.address || null,
        siteContactName: site?.contact_name || null, siteContactPhone: site?.phone || null,
        mainContactName: r.main_contact?.name || null, mainContactPhone: r.main_contact?.phone || null,
        contact_name: r.contact_name || site?.contact_name || r.main_contact?.name || null,
        contact_phone: r.contact_phone || site?.phone || r.main_contact?.phone || null,
        teamName: r.team_name || r.assigned_team || null,
        visits: r.visits || [],
        confirmItems: r.quote_no ? (r.confirm_items || []) : null,
        quoteGrand: 0,       // จอช่างไม่ต้องรู้มูลค่างาน — ตั้งใจให้เป็น 0
        salesName: null,
        createdByName: null,
      };
    });
  }
  const _rows = (build) => _fetchAll(build).then((rows) => ({ data: rows })); // กันเพดาน 1000 แถวทุกก้อน — ใบงาน/ลูกค้า/รอบนัดโตเรื่อย ๆ
  const [j, cu, tm, si, ct, qt, qit, jv] = await Promise.all([
    _rows((f, t) => supabase.from("job_orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("job_no").range(f, t)),
    _rows((f, t) => supabase.from("customers").select("id,name,address", { count: "exact" }).order("id").range(f, t)),
    supabase.from("teams").select("id,name"),
    _rows((f, t) => supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("quotations").select("quote_no,boq_no,discount_type,discount_value,vat,created_by", { count: "exact" }).order("quote_no").range(f, t)),
    _rows((f, t) => supabase.from("quotation_items").select("*", { count: "exact" }).order("id").range(f, t)), // select * เผื่อคอลัมน์ discount (mig 142) ยังไม่ได้รัน
    _rows((f, t) => supabase.from("job_visits").select("*", { count: "exact" }).order("visit_date", { ascending: true }).order("id").range(f, t)),
  ]);
  if (j.error) throw j.error; if (cu.error) throw cu.error; if (tm.error) throw tm.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (qt.error) throw qt.error; if (qit.error) throw qit.error;
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const tn = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  const visitsByJob = {}; (jv?.data || []).forEach((v) => { (visitsByJob[v.job_no] = visitsByJob[v.job_no] || []).push({ ...v, teamName: v.assigned_team ? (tn[v.assigned_team] || v.assigned_team) : null }); });
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  const cb = await _creators(); // id → name (for job creator + quote salesperson)
  const salesByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, cb[x.created_by] || null]));
  const boqByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, x.boq_no]));
  // grand total per quote + confirmation item list (AC + service only, no materials) for the order-confirmation copy
  const subByQuote = {}, confirmByQuote = {};
  (qit.data || []).forEach((x) => {
    subByQuote[x.quote_no] = (subByQuote[x.quote_no] || 0) + Number(x.qty) * Number(x.unit_price) - (Number(x.discount) || 0);
    if (x.kind === "ac" || x.kind === "service") (confirmByQuote[x.quote_no] = confirmByQuote[x.quote_no] || []).push({ name: x.name, qty: Number(x.qty), unit: x.unit });
  });
  const grandByQuote = {}; (qt.data || []).forEach((x) => { const sub = subByQuote[x.quote_no] || 0; const disc = x.discount_type === "percent" ? sub * Number(x.discount_value || 0) / 100 : Number(x.discount_value || 0); const after = sub - disc; grandByQuote[x.quote_no] = after + (x.vat ? after * 0.07 : 0); });
  return (j.data || []).map((jo) => ({ ..._resolveJo(jo, cn, ca, sm, tn, cc), visits: visitsByJob[jo.job_no] || [], boq_no: jo.quote_no ? (boqByQuote[jo.quote_no] || null) : null, quoteGrand: jo.quote_no ? (grandByQuote[jo.quote_no] || 0) : 0, confirmItems: jo.quote_no ? (confirmByQuote[jo.quote_no] || []) : null, createdByName: cb[jo.created_by] || null, salesName: jo.quote_no ? (salesByQuote[jo.quote_no] || null) : null }));
}

// job-order history for one customer (newest first) — for the customer detail timeline
export async function listCustomerJobs(customerId) {
  const [j, tm] = await Promise.all([
    supabase.from("job_orders").select("job_no,title,details,scheduled_at,end_date,slot,status,assigned_team,created_at").eq("customer_id", customerId).order("scheduled_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("teams").select("id,name"),
  ]);
  if (j.error) throw j.error;
  const tn = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  return (j.data || []).map((r) => ({ ...r, teamName: r.assigned_team ? (tn[r.assigned_team] || r.assigned_team) : null }));
}

// all documents + jobs for one customer (newest first) — for the customer detail history with type filter
export async function listCustomerDocs(customerId) {
  const [q, iv, rc, jo, tm, ho, an, bn] = await Promise.all([
    supabase.from("quotations").select("quote_no,title,status,issue_date,created_at,site_id").eq("customer_id", customerId),
    supabase.from("invoices").select("invoice_no,status,issue_date,total,installment,pct,created_at,site_id").eq("customer_id", customerId),
    supabase.from("receipts").select("receipt_no,status,issue_date,net,created_at,site_id").eq("customer_id", customerId),
    supabase.from("job_orders").select("job_no,title,scheduled_at,end_date,slot,status,assigned_team,created_at,site_id").eq("customer_id", customerId),
    supabase.from("teams").select("id,name"),
    // ใบส่งมอบงาน (mig 202 ho_no) — โชว์ในประวัติลูกค้าเหมือนเอกสารอื่น · fallback ถ้ายังไม่รัน 202
    supabase.from("job_handovers").select("id,ho_no,job_no,status,doc_date,created_at,cust_rating").eq("customer_id", customerId)
      .then((r) => (r.error && /ho_no|cust_rating|column/i.test(r.error.message || "") ? supabase.from("job_handovers").select("id,job_no,status,doc_date,created_at").eq("customer_id", customerId) : r))
      .catch(() => ({ data: [] })),
    // ใบลด/เพิ่มหนี้ (mig 218) — fallback ถ้ายังไม่รัน
    supabase.from("adjustment_notes").select("note_no,kind,status,issue_date,net,reason,created_at,site_id").eq("customer_id", customerId).then((r) => r).catch(() => ({ data: [] })),
    // ใบวางบิล — โชว์ในประวัติลูกค้า (ส่งเข้าแชต/อีเมลได้)
    supabase.from("billing_notes").select("billing_no,status,issue_date,created_at,site_id").eq("customer_id", customerId).then((r) => r).catch(() => ({ data: [] })),
  ]);
  const tn = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  const entries = [
    ...(q.data || []).map((x) => ({ type: "quote", no: x.quote_no, title: x.title, status: x.status, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
    ...(iv.data || []).map((x) => ({ type: "invoice", no: x.invoice_no, title: `งวด ${x.installment} (${Math.round(x.pct)}%)`, status: x.status, amount: x.total, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
    ...(rc.data || []).map((x) => ({ type: "receipt", no: x.receipt_no, status: x.status, amount: x.net, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
    ...(jo.data || []).map((x) => ({ type: "job", no: x.job_no, title: x.title, status: x.status, date: x.scheduled_at || x.created_at, created: x.created_at, teamName: x.assigned_team ? (tn[x.assigned_team] || x.assigned_team) : null, scheduled_at: x.scheduled_at, end_date: x.end_date, slot: x.slot, site_id: x.site_id })),
    ...(ho.data || []).map((x) => ({ type: "handover", no: x.ho_no || ("HO#" + String(x.id).slice(0, 6)), hoId: x.id, jobNo: x.job_no, title: x.job_no ? `งาน ${x.job_no}` : "ใบส่งมอบงาน", status: x.status, rating: x.cust_rating || null, date: x.doc_date || x.created_at, created: x.created_at })),
    ...(an.data || []).map((x) => ({ type: x.kind === "debit" ? "debitnote" : "creditnote", no: x.note_no, title: x.reason || (x.kind === "debit" ? "เพิ่มหนี้" : "ลดหนี้"), status: x.status, amount: x.net, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
    ...(bn.data || []).map((x) => ({ type: "billing", no: x.billing_no, title: "ใบวางบิล / ใบแจ้งหนี้รวม", status: x.status, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
  ];
  // newest-created first (true timeline order — independent of issue/appointment dates)
  return entries.sort((a, b) => new Date(b.created || b.date || 0) - new Date(a.created || a.date || 0));
}

// job orders assigned to a team (technician view) — address/map/contact resolved live
// งานของทีม (จอช่าง) — ⚠️ เดิมอ่านประวัติงานทั้งหมดของทีมแบบเรียงวันนัดจากเก่าไปใหม่ ไม่มี limit
// ทีมที่ทำวันละ ~5 งานจะเกินเพดาน 1000 แถวภายในราว 1 ปี แล้วของที่หายคือ "งานที่กำลังจะถึง"
// (แถวท้ายสุดของลำดับ) = ช่างเปิดมาไม่เห็นงานตัวเอง โดยไม่มี error อะไรเลย
// ⇒ ดึงจากใหม่→เก่าแบบมี limit แล้วค่อยเรียงกลับ · ตารางลูกดึงเฉพาะไอดีที่งานชุดนี้อ้างถึง
export async function listTeamJobOrders(team, { limit = 500 } = {}) {
  const j = await supabase.from("job_orders").select("*").eq("assigned_team", team).order("scheduled_at", { ascending: false }).limit(limit);
  if (j.error) throw j.error;
  j.data = (j.data || []).slice().reverse();
  const cids = _capNos(_idsOf(j.data, "customer_id")), sids = _capNos(_idsOf(j.data, "site_id"));
  // ลูกค้าเกิน 200 ราย → _capNos คืน null = อ่านทั้งตาราง จึงต้องผ่าน _allRows ไม่งั้นโดนเพดานซ้ำที่เดิม
  const [si, cu, ct] = await Promise.all([
    _allRows((f, t) => _onlyIds(supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone", { count: "exact" }), "id", sids).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("id,name,address", { count: "exact" }), "id", cids).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customer_contacts").select("customer_id,name,phone", { count: "exact" }), "customer_id", cids).order("id").range(f, t)),
  ]);
  if (si.error) throw si.error; if (cu.error) throw cu.error; if (ct.error) throw ct.error;
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cc = _firstContacts(ct.data);
  return (j.data || []).map((jo) => _resolveJo(jo, cn, ca, sm, null, cc));
}

// ---------- job timeline (append-only log of status changes + photo/comment updates) ----------
export async function listJobLogs(job_no) {
  // job_no can be a single value or an array (shared board for linked jobs)
  let q = supabase.from("job_logs").select("*").order("created_at", { ascending: true });
  q = Array.isArray(job_no) ? q.in("job_no", job_no) : q.eq("job_no", job_no);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// shared timeline for a linked-job group: all logs across every job in the group
export async function listJobLogsByGroup(groupNo) {
  const { data: jobs } = await supabase.from("job_orders").select("job_no").or(`group_no.eq.${groupNo},job_no.eq.${groupNo}`);
  const nos = (jobs || []).map((j) => j.job_no);
  return nos.length ? listJobLogs(nos) : [];
}

// add one timeline entry (a comment + any photos). Unlimited entries per job.
export async function addJobLog(job_no, { note, photos, author, parent_id }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("job_logs").insert({
    job_no, type: "update", note: note?.trim() || null, photos: photos || [],
    parent_id: parent_id || null, author: author || null, created_by: user?.id || null,
  });
  if (error) throw error;
  const [watchers, cn] = await Promise.all([_jobWatchers(job_no), _jobCust(job_no)]);
  notify(watchers, { category: "job", title: `🔧 ${cn || "งาน"} · ${job_no}`, body: `${(note || "").trim() || "📷 เพิ่มรูป/ไฟล์งาน"}`.slice(0, 140), url: "joborders", ref_type: "job", ref_no: job_no });
}

const _JOB_ST_TH = { pending: "รอเริ่มงาน", scheduled: "นัดแล้ว", in_progress: "กำลังทำ", awaiting_approval: "รออนุมัติ", reschedule: "นัดหมายเพิ่ม", quote_pending: "รอทำใบเสนอราคา", done: "เสร็จแล้ว", cancelled: "ยกเลิก" };

export async function saveJobOrder(jo, author) {
  const { data: { user } } = await supabase.auth.getUser();
  // การ์ดฝั่ง server: ใบที่ยกเลิกแล้วห้ามบันทึกทับ (หน้าเก่าค้างจากอีกเครื่อง) + เอาไว้คงสถานะ quote_pending/ปลดล็อกตอนนัดรอบใหม่
  const { data: curHead, error: chErr } = await supabase.from("job_orders").select("status,locked").eq("job_no", jo.job_no).maybeSingle();
  if (chErr) throw chErr;   // อ่านการ์ดไม่ได้ ห้ามเดินต่อ — ไม่งั้นการ์ดทั้งชุดหลุดเงียบ
  if (curHead?.status === "cancelled") throw new Error(`ใบงาน ${jo.job_no} ถูกยกเลิกแล้ว — บันทึกทับไม่ได้ (รีเฟรชหน้าจอ)`);
  // รอบเข้างาน: รอบเดิม (มี id) ที่ "ฟอร์มไม่ได้แตะสถานะ" (status === _orig ตอนโหลด) → ใช้สถานะสดจาก DB
  // กันเคสออฟฟิศเปิดฟอร์มค้าง ช่างกดส่งอนุมัติระหว่างนั้นแล้วโดนทับ · ฟอร์มตั้งใจแก้ (นัดหมายเพิ่ม/ปลดล็อกรอบ/dropdown) → ค่าฟอร์มชนะ
  let visitRows = null, backup = [];
  if (Array.isArray(jo.visits)) {
    const { data: curV, error: cvErr } = await supabase.from("job_visits").select("*").eq("job_no", jo.job_no).order("id");
    if (cvErr) throw cvErr;
    backup = curV || [];
    const freshStat = Object.fromEntries(backup.map((v) => [v.id, v.status]));
    visitRows = jo.visits
      .filter((v) => v.visit_date)
      .map((v) => {
        const untouched = v.id && v._orig != null && v._orig === (v.status || "scheduled");
        // พก id เดิมไว้ให้ขั้นบันทึกแยกออกว่าแถวไหน update แถวไหน insert
        // (ห้ามส่ง id ไปกับ insert — job_visits.id เป็น generated always identity ต้องถอดออกก่อนเสมอ)
        return { id: v.id || null, job_no: jo.job_no, visit_date: v.visit_date, end_date: v.end_date || null, slot: v.slot || null, scheduled_at: v.scheduled_at || null, assigned_team: v.assigned_team || null,
          status: (untouched && freshStat[v.id]) || v.status || "scheduled", note: v.note || null, created_by: user?.id || null };
      });
  }
  // แยกว่าแถวไหนแก้ของเดิม แถวไหนเพิ่มใหม่ แถวไหนผู้ใช้เอาออก
  // ⚠️ ต้องเทียบ "รอบที่มีตอนเปิดฟอร์ม" (visitIdsLoaded) ไม่ใช่เทียบกับ DB สด
  //    ไม่งั้นรอบที่เครื่องอื่นเพิ่งเพิ่มระหว่างที่ฟอร์มเปิดค้าง จะถูกมองว่า "ผู้ใช้ลบ" แล้วโดนลบทิ้ง
  let vKeep = [], vFresh = [], vGone = [], vFinal = null;
  if (visitRows) {
    const byId = Object.fromEntries(backup.map((v) => [String(v.id), v]));
    vKeep = visitRows.filter((v) => v.id && byId[String(v.id)]);
    vFresh = visitRows.filter((v) => !(v.id && byId[String(v.id)]));
    const loaded = Array.isArray(jo.visitIdsLoaded) ? jo.visitIdsLoaded.map(String) : backup.map((v) => String(v.id));
    const stay = new Set(vKeep.map((v) => String(v.id)));
    vGone = loaded.filter((id) => byId[id] && !stay.has(id));
    const goneSet = new Set(vGone);
    const otherAdded = backup.filter((v) => !stay.has(String(v.id)) && !goneSet.has(String(v.id)));
    vFinal = [...visitRows, ...otherAdded];   // ชุดรอบที่จะเป็นจริงหลังบันทึก
  }
  // สถานะหัวใบ: มีรอบ → คำนวณจาก "ชุดรอบหลังบันทึก" (รวมรอบที่เครื่องอื่นเพิ่มไว้)
  // คง "รอทำใบเสนอราคา" เมื่อรอบเสร็จหมด (เดิมโดนบันทึกทับกลับเป็น "เสร็จ" หลุดคิวทำใบเสนอ)
  const headStatus = vFinal && vFinal.length
    ? (((jo.status === "quote_pending" || curHead?.status === "quote_pending") && vFinal.every((v) => v.status === "done" || v.status === "cancelled")) ? "quote_pending" : deriveJobStatus(vFinal))
    : (jo.status || "pending");
  const jHead = {
    job_no: jo.job_no, group_no: jo.group_no || null, quote_no: jo.quote_no || null, customer_id: jo.customer_id || null, site_id: jo.site_id || null,
    title: jo.title?.trim() || null, job_type: jo.job_type || "install", contact_name: jo.contact_name?.trim() || null, contact_phone: jo.contact_phone?.trim() || null,
    address: jo.address?.trim() || null, map_url: jo.map_url?.trim() || null, details: jo.details?.trim() || null,
    sales_note: jo.sales_note?.trim() || null, sales_photos: jo.sales_photos || [], internal_note: jo.internal_note?.trim() || null,
    survey_job_no: jo.survey_job_no || null,   // mig 220 — ผูกใบสำรวจต้นทาง
    assigned_team: jo.assigned_team || null, scheduled_at: jo.scheduled_at || null,
    end_date: jo.end_date || null, slot: jo.slot || null, issue_date: jo.issue_date || null,
    status: headStatus, created_by: user?.id || null,
  };
  // ใบที่ล็อกปิดไว้ (เช่น อนุมัติแบบ "เสร็จ รอนัดหมายเพิ่ม") พอออฟฟิศตั้งรอบนัดใหม่ → ปลดล็อกให้เอง
  // ไม่งั้นช่างกด "เริ่มทำรอบนี้" แล้วชนการ์ด locked ใน RPC (mig 150) จนกว่าจะมีคนมากดปลดล็อกเอง
  if (curHead?.locked && ["pending", "scheduled", "in_progress"].includes(headStatus)) jHead.locked = false;
  // ⚠️ ใบเดิม: ห้ามส่ง created_by ไปกับ upsert — ON CONFLICT DO UPDATE เขียนทุกคอลัมน์ที่ส่งไป
  //    คนที่กด "บันทึกใบงาน" ครั้งล่าสุดจะกลายเป็น "ออกใบงานโดย" แทนคนออกจริง แล้วกู้ไม่ได้
  //    (created_at ไม่ได้ส่งไปด้วย แถวเลยดูปกติทุกอย่าง ไม่มีอะไรส่อว่าข้อมูลเพี้ยน)
  //    กติกาเดียวกับรอบเข้างานด้านล่างที่ตัด created_by ออกก่อนแก้แถวเดิม
  if (curHead) delete jHead.created_by;
  let { error } = await supabase.from("job_orders").upsert(jHead, { onConflict: "job_no" });
  if (error && /issue_date/i.test(error.message || "")) { delete jHead.issue_date; ({ error } = await supabase.from("job_orders").upsert(jHead, { onConflict: "job_no" })); } // pre-119 fallback
  if (error && /survey_job_no/i.test(error.message || "")) { delete jHead.survey_job_no; ({ error } = await supabase.from("job_orders").upsert(jHead, { onConflict: "job_no" })); } // pre-220 fallback
  if (error) throw error;
  // บันทึกรอบเข้างาน — แก้ของเดิมคง id ไว้ ห้ามลบทิ้งแล้วสร้างใหม่
  // id ของรอบคือสิ่งที่มือถือช่างถืออยู่ ถ้าเปลี่ยนทุกครั้งที่ออฟฟิศกดบันทึก ช่างที่เปิดหน้าค้างจะกดอัปเดตไม่ได้
  // ลำดับสำคัญ: แก้ → เพิ่ม → ลบ (ลบท้ายสุด) พังกลางทางแล้วจะ "มีรอบเกิน" ซึ่งแก้ตามได้ ดีกว่า "รอบหาย"
  if (visitRows) {
    for (const v of vKeep) {
      const { id, job_no: _j, created_by: _c, ...fields } = v;   // ไม่แตะ created_by ของแถวเดิม
      const { error: eU } = await supabase.from("job_visits").update(fields).eq("id", id).eq("job_no", jo.job_no);
      if (eU) throw eU;
    }
    if (vFresh.length) {
      const { error: eI } = await supabase.from("job_visits").insert(vFresh.map(({ id: _id, ...rest }) => rest));
      if (eI) throw eI;
    }
    if (vGone.length) {
      const { error: eD } = await supabase.from("job_visits").delete().in("id", vGone).eq("job_no", jo.job_no);
      if (eD) throw eD;
    }
  }
  // audit trail: record who created/edited the job (best-effort)
  await supabase.from("job_logs").insert({ job_no: jo.job_no, type: "edit", status: headStatus || null, author: author || null, created_by: user?.id || null });
  // handoff: notify the assigned team's members
  if (jo.assigned_team) {
    const { data: tm } = await supabase.from("profiles").select("id").eq("team", jo.assigned_team);
    const cnA = await _custName(jo.customer_id);
    notify((tm || []).map((p) => p.id), { category: "job", title: `🔧 มอบหมายงานใหม่: ${cnA || jo.job_no}`, body: `${jo.title || "งานติดตั้ง/บริการ"} · ${jo.job_no}`, url: "joborders", ref_type: "job", ref_no: jo.job_no });
  }
  syncInternalNote({ quoteNo: jo.quote_no }, jo.internal_note).catch(() => {});
}

export async function updateJobStatus(job_no, status, author) {
  // ผ่าน RPC (mig 150): ช่างเปลี่ยนสถานะงานไม่มีรอบนัดได้จริง + การ์ดกันงานยกเลิก/ล็อก + จำกัดทิศทางของช่างฝั่ง server
  // (เดิมเขียนตรง job_orders — role tech โดน RLS กรองเงียบ 0 แถวแต่จอบอกสำเร็จ + ลง timeline ปลอม)
  let { error } = await supabase.rpc("set_job_status", { p_job: job_no, p_status: status });
  if (error && /set_job_status|schema cache/i.test(error.message || "")) {
    // pre-150 fallback: เขียนตรง + เช็คจำนวนแถว — RLS กรองเงียบ = 0 แถว ต้องแจ้ง error ไม่ใช่หลอกว่าสำเร็จ
    const { data, error: e2 } = await supabase.from("job_orders").update({ status }).eq("job_no", job_no).select("job_no");
    if (e2) throw e2;
    if (!data?.length) throw new Error("ไม่มีสิทธิ์เปลี่ยนสถานะใบงานนี้ — แจ้งออฟฟิศ (หรือรอรัน migration 150)");
  } else if (error) throw error;
  // record the status change on the timeline (best-effort — don't fail the status update if logging fails)
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("job_logs").insert({ job_no, type: "status", status, author: author || null, created_by: user?.id || null });
  { const [w, cn] = await Promise.all([_jobWatchers(job_no), _jobCust(job_no)]); notify(w, { category: "job", title: `📋 ${cn || "งาน"} · ${job_no}`, body: `สถานะ → ${_JOB_ST_TH[status] || status}`, url: "joborders", ref_type: "job", ref_no: job_no }); }
}

export async function lockJob(job_no) {
  const { error } = await supabase.from("job_orders").update({ locked: true }).eq("job_no", job_no);
  if (error) throw error;
}

export async function unlockJob(job_no) {
  const { error } = await supabase.from("job_orders").update({ locked: false }).eq("job_no", job_no);
  if (error) throw error;
}

// ===================== ใบส่งมอบงาน · job handovers =====================
const HANDOVER_COLS_BASE = "id,job_no,customer_id,customer_name,contact_name,contact_phone,address,doc_ref,doc_date,work_types,detail,fix_note,forms,tech_sign_url,tech_name,cust_sign_url,cust_name,status,created_by,created_at,updated_at";
// เพิ่มคะแนนความพอใจลูกค้า (mig 200) + เลขที่เอกสาร ho_no (mig 202) — ถ้ายังไม่รัน migration select จะ error เรื่องคอลัมน์ → fallback เป็น BASE
const HANDOVER_COLS = HANDOVER_COLS_BASE + ",cust_rating,cust_comment,cust_rated_at,ho_no";
const _preRate = (e) => /cust_rating|cust_comment|cust_rated_at|ho_no|column|PGRST/i.test(e?.message || "");

// list handovers (optionally for one job), newest first, with the creator's name attached
export async function listHandovers(jobNo) {
  // กันเพดาน 1000 แถว — ทะเบียนใบส่งมอบโตเรื่อย ๆ เกินพันใบ ใบเก่า (มีลายเซ็นลูกค้า) จะหายจากหน้าค้นหาเงียบ ๆ
  const _rows = (cols) => _fetchAll((f, t) => {
    let q = supabase.from("job_handovers").select(cols, { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t);
    if (jobNo) q = q.eq("job_no", jobNo);
    return q;
  });
  let rows;
  try { rows = await _rows(HANDOVER_COLS); } catch (e) { if (_preRate(e)) rows = await _rows(HANDOVER_COLS_BASE); else throw e; }
  const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
  let names = {};
  if (ids.length) {
    const { data: ps } = await supabase.from("profiles").select("id,name,email").in("id", ids);
    names = Object.fromEntries((ps || []).map((p) => [p.id, p.name || p.email]));
  }
  return rows.map((r) => ({ ...r, creatorName: names[r.created_by] || "" }));
}

// ธงย่อของใบส่งมอบต่อใบงาน (ให้หน้าใบงานใช้) — เลือกแค่ 3 คอลัมน์ ไม่ดึง forms ที่เป็น JSON ก้อนใหญ่
// ต้องผ่าน _fetchAll: ถ้าโดนเพดาน 1000 แถว งานเก่าที่มีใบเซ็นแล้วจริงจะขึ้นป้ายเตือนผิด
// แล้วออฟฟิศจะเลิกเชื่อคำเตือนภายในสัปดาห์เดียว
export async function listHandoverFlags() {
  const rows = await _fetchAll((f, t) => supabase.from("job_handovers")
    .select("job_no,status,cust_sign_url", { count: "exact" })
    .order("job_no").order("id").range(f, t));
  const m = {};
  for (const r of rows || []) {
    if (!r.job_no) continue;
    const e = m[r.job_no] || (m[r.job_no] = { any: false, submitted: false, signed: false });
    e.any = true;
    // ใบร่างยังไม่ใช่หลักฐานรับมอบ — ช่างยังแก้เองได้ นับเป็น "ผ่าน" ไม่ได้
    if (r.status !== "draft") e.submitted = true;
    if (r.status !== "draft" && r.cust_sign_url) e.signed = true;
  }
  return m;
}
export async function getHandover(id) {
  let { data, error } = await supabase.from("job_handovers").select(HANDOVER_COLS).eq("id", id).single();
  if (error && _preRate(error)) ({ data, error } = await supabase.from("job_handovers").select(HANDOVER_COLS_BASE).eq("id", id).single());
  if (error) throw error;
  return data;
}

// insert (no id) or update (id present); returns the saved row
export async function saveHandover(h) {
  const fields = {
    job_no: h.job_no || null, customer_id: h.customer_id || null, customer_name: h.customer_name || null,
    contact_name: h.contact_name || null, contact_phone: h.contact_phone || null, address: h.address || null,
    doc_ref: h.doc_ref || null, doc_date: h.doc_date || null, work_types: h.work_types || [],
    detail: h.detail || null, fix_note: h.fix_note || null, forms: h.forms || [],
    tech_sign_url: h.tech_sign_url || null, tech_name: h.tech_name || null,
    cust_sign_url: h.cust_sign_url || null, cust_name: h.cust_name || null,
    status: h.status || "draft", updated_at: new Date().toISOString(),
    ...(h.ho_no ? { ho_no: h.ho_no } : {}),   // เลขที่เอกสาร (mig 202)
  };
  const stripHo = (f) => { const { ho_no, ...rest } = f; return rest; };   // ตัด ho_no ถ้ายังไม่รัน mig 202
  let saved, wasSubmitted = false;
  if (h.id) {
    const { data: prev } = await supabase.from("job_handovers").select("status").eq("id", h.id).maybeSingle();
    wasSubmitted = prev?.status === "submitted";
    let { data, error } = await supabase.from("job_handovers").update(fields).eq("id", h.id).select(HANDOVER_COLS_BASE).single();
    if (error && /ho_no|column|PGRST204/i.test(error.message || "")) ({ data, error } = await supabase.from("job_handovers").update(stripHo(fields)).eq("id", h.id).select(HANDOVER_COLS_BASE).single());
    if (error) throw /PGRST116|coerce/i.test(error.message || "") ? new Error("บันทึกไม่ได้ — ใบนี้ส่งแล้ว ช่างแก้ไขเองไม่ได้ (ต้องให้ออฟฟิศแก้)") : error;
    saved = { ...data, ho_no: fields.ho_no || data?.ho_no || null };
  } else {
    fields.created_by = await _uid();
    let { data, error } = await supabase.from("job_handovers").insert(fields).select(HANDOVER_COLS_BASE).single();
    if (error && /ho_no|column|PGRST204/i.test(error.message || "")) ({ data, error } = await supabase.from("job_handovers").insert(stripHo(fields)).select(HANDOVER_COLS_BASE).single());
    if (error) throw error;
    saved = { ...data, ho_no: fields.ho_no || null };
  }
  // ส่งใบส่งมอบ (ครั้งแรกเท่านั้น — บันทึกซ้ำใบที่ส่งแล้วไม่แจ้งซ้ำ) → ลงไทม์ไลน์ + แจ้งออฟฟิศ (best-effort)
  if (fields.status === "submitted" && !wasSubmitted && fields.job_no) {
    try {
      const uid = await _uid();
      await supabase.from("job_logs").insert({ job_no: fields.job_no, type: "update", note: `📝 ส่งใบส่งมอบงานแล้ว${fields.cust_sign_url ? " (ลูกค้าเซ็นรับแล้ว ✓)" : ""}`, author: h.tech_name || null, created_by: uid });
      notify(await _jobWatchers(fields.job_no), { category: "job", title: `📝 งาน ${fields.job_no} ส่งใบส่งมอบงานแล้ว`, url: "joborders", ref_type: "job", ref_no: fields.job_no });
    } catch { /* ignore */ }
  }
  // นัดบริการรอบถัดไป (mig 192): ช่างกรอก next_date ในฟอร์มล้าง/PM → สร้างนัด + แจ้งออฟฟิศ (best-effort · pre-192 ข้าม)
  if (fields.status === "submitted" && !wasSubmitted) {
    try {
      const uid = await _uid();
      const rems = (fields.forms || []).filter((f) => f && f.next_date && (f.kind === "wash" || f.kind === "pmc"))
        .map((f) => ({ due_date: f.next_date, kind: f.kind, customer_name: fields.customer_name, contact_phone: fields.contact_phone, job_no: fields.job_no, handover_id: saved?.id || null, note: f.kind === "wash" ? "นัดล้างรอบถัดไป" : "นัด PM รอบถัดไป", created_by: uid }));
      if (rems.length) {
        const { error } = await supabase.from("service_reminders").insert(rems);
        if (!error) notify(await _usersByRole(["admin", "exec", "sales", "field_sales", "hr"]), { category: "job", title: `🔔 นัดบริการรอบถัดไป ${rems.length} รายการ · ${fields.customer_name || fields.job_no || "-"}`, body: rems.map((r) => `${r.note} ${r.due_date}`).join(" · "), url: "handover", ref_type: "handover" });
      }
    } catch { /* ignore — best-effort */ }
  }
  return saved;
}

// นัดบริการรอบถัดไป (service reminders · mig 192) — สร้าง/ดู/อัปเดตสถานะ
export async function createServiceReminder(r) {
  const uid = await _uid();
  const { error } = await supabase.from("service_reminders").insert({ ...r, created_by: uid });
  if (error) throw error;
}
export async function listServiceReminders(status = "open") {
  let q = supabase.from("service_reminders").select("*").order("due_date", { ascending: true });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function setReminderStatus(id, status) {
  const { error } = await supabase.from("service_reminders").update({ status }).eq("id", id);
  if (error) throw error;
}
// ส่งลิงก์ใบส่งมอบงาน (หน้า public) ให้ลูกค้าทาง LINE — คืน {sent, url, reason} · ไม่ผูก LINE = คืน url ให้คัดลอกเอง
export async function sendHandoverLine(id) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/handover-send", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ id }),
  });
  // อ่าน body แบบ text ก่อน แล้วค่อย parse — ถ้า server crash ระดับแพลตฟอร์ม (ไม่ใช่ JSON) จะได้เห็นข้อความจริง
  const raw = await r.text().catch(() => "");
  let out = {}; try { out = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }
  if (!r.ok) throw new Error(out.error || (raw ? raw.slice(0, 160) : "ส่งไม่สำเร็จ (" + r.status + ")"));
  return out;
}

// ขอ "ลิงก์สาธารณะ" ของใบส่งมอบงาน (มี token) เพื่อคัดลอกไปส่งเอง — ไม่ push LINE
// คืน { url: ลิงก์เอกสาร (?ho=), rateUrl: ลิงก์ให้คะแนน (?rate=) }
export async function getHandoverLink(id) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`/api/handover-link?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
  const raw = await r.text().catch(() => "");
  let out = {}; try { out = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }
  if (!r.ok) throw new Error(out.error || (raw ? raw.slice(0, 160) : "ขอลิงก์ไม่สำเร็จ (" + r.status + ")"));
  return { url: out.url, rateUrl: out.rateUrl || (out.url || "").replace("?ho=", "?rate=") };
}

// ขอลิงก์ "ให้คะแนน" ของใบงาน (ผูก job_no — ไม่ต้องมีใบส่งมอบ) เพื่อส่งในแชต/คัดลอก
export async function getJobRateLink(jobNo) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`/api/rate-link?job=${encodeURIComponent(jobNo)}`, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
  const raw = await r.text().catch(() => "");
  let out = {}; try { out = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }
  if (!r.ok) throw new Error(out.error || (raw ? raw.slice(0, 160) : "ขอลิงก์ไม่สำเร็จ (" + r.status + ")"));
  return out.rateUrl;
}

// ลบใบส่งมอบ: กติกาบ้าน — ต้องมีเหตุผล + ลง audit พร้อม snapshot (ใบที่ส่งแล้วมีลายเซ็นลูกค้า เป็นหลักฐานงาน)
export async function deleteHandover(id, reason) {
  const { data: snap } = await supabase.from("job_handovers").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("job_handovers").delete().eq("id", id);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "handover", target_no: snap?.job_no || String(id), reason: reason || null, snapshot: snap }).catch(() => {});
}

// draw-on-screen signature (a PNG data URL) → public URL in storage (reuses the staff-signature uploader)
export async function uploadSignatureDataUrl(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return uploadSignature(blob);
}

// (setJobVisitsStatus ถูกถอดออก 2026-07-17 — ไม่มีหน้าไหนเรียกแล้ว และสาขา no-visit ของมันมีบั๊ก RLS-เงียบ
//  แบบเดียวกับที่ mig 150 แก้ · ถ้าต้องใช้ ให้เรียกผ่าน set_job_status/set_job_visits_status RPC เท่านั้น)

// update one visit's status, then recompute the job's overall status — via SECURITY DEFINER RPC
export async function updateVisitStatus(visitId, jobNo, status, author, opts = {}) {
  // opts.jobOverride / opts.lock (mig 150): อนุมัติแบบ "เสร็จ → รอทำใบเสนอราคา/ล็อกปิดงาน" จบใน transaction เดียว
  // — เดิมเป็น 3 คำสั่งแยก เน็ตสะดุดกลางทางงานไปค้างผิดคิวโดยไม่มีปุ่มให้ทำซ้ำ
  const { data: { user } } = await supabase.auth.getUser();
  const args = { p_visit_id: visitId, p_status: status };
  if (opts.jobOverride != null) args.p_job_override = opts.jobOverride;
  if (opts.lock != null) args.p_lock = opts.lock;
  let { data, error } = await supabase.rpc("set_visit_status", args);
  if (error && (opts.jobOverride != null || opts.lock != null) && /set_visit_status|schema cache/i.test(error.message || "")) {
    // pre-150 fallback: RPC เก่ารับ 2 อาร์กิวเมนต์ — ถอยไปทำทีละจังหวะแบบเดิม
    ({ data, error } = await supabase.rpc("set_visit_status", { p_visit_id: visitId, p_status: status }));
    if (error) throw error;
    if (opts.jobOverride) { const e2 = (await supabase.from("job_orders").update({ status: opts.jobOverride }).eq("job_no", jobNo)).error; if (e2) throw e2; }
    if (opts.lock === true) await lockJob(jobNo);
    else if (opts.lock === false) await unlockJob(jobNo).catch(() => {});
  } else if (error) throw error;
  await supabase.from("job_logs").insert({ job_no: jobNo, type: "status", status, author: author || null, created_by: user?.id || null });
  if (opts.jobOverride) await supabase.from("job_logs").insert({ job_no: jobNo, type: "status", status: opts.jobOverride, author: author || null, created_by: user?.id || null });
  { const [w, cn] = await Promise.all([_jobWatchers(jobNo), _jobCust(jobNo)]); notify(w, { category: "job", title: `📋 ${cn || "งาน"} · ${jobNo}`, body: `รอบงาน → ${_JOB_ST_TH[status] || status}`, url: "joborders", ref_type: "job", ref_no: jobNo }); }
  return data;
}

// ---------- job order templates (มิ migration 070) ----------
export async function listJobTemplates() {
  const { data, error } = await supabase.from("job_order_templates").select("*").order("name");
  if (error) throw error;
  return data || [];
}
export async function saveJobTemplate(t) {
  const uid = await _uid();
  const { error } = await supabase.from("job_order_templates").insert({
    name: t.name, job_type: t.job_type || "maintenance", title: t.title || null, details: t.details || null, created_by: uid,
  });
  if (error) throw error;
}
export async function deleteJobTemplate(id) {
  const { error } = await supabase.from("job_order_templates").delete().eq("id", id);
  if (error) throw error;
}

// ---------- website orders (มิ migration 071) ----------
export async function listWebOrders() {
  // เพดาน 1000 แถว: คำสั่งซื้อเว็บโตเรื่อย ๆ เกินพันแล้วใบเก่าหาย + ยอดนับตามสถานะผิด → แบ่งหน้าเหมือนลิสต์อื่น
  const data = await _fetchAll((f, t) => supabase.from("web_orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t));
  // ชื่อลูกค้าที่ผูกไว้ — การ์ดต้องบอกได้ว่า "ผูกกับใคร" ไม่ใช่แค่ "ผูกแล้ว"
  const ids = [...new Set((data || []).map((o) => o.customer_id).filter(Boolean))];
  const nameBy = {};
  for (let i = 0; i < ids.length; i += 300) {   // .in() ยาวเกินไปจะโดนตัด — ซอยทีละ 300 เหมือนที่อื่น
    const { data: cs } = await supabase.from("customers").select("id,name").in("id", ids.slice(i, i + 300));
    (cs || []).forEach((c) => { nameBy[c.id] = c.name; });
  }
  // ผูกไว้แต่หาชื่อไม่เจอ = ลูกค้าถูกลบ (FK on delete set null ยังไม่ทันวิ่ง) — ให้การ์ดบอกตรง ๆ ดีกว่าโชว์ว่าง
  return (data || []).map((o) => ({ ...o, customerName: o.customer_id ? (nameBy[o.customer_id] || null) : null }));
}
// รายชื่อลูกค้าแบบเบา (id/ชื่อ/เบอร์) — ใช้ค้นหาเพื่อผูกคำสั่งซื้อเว็บกับลูกค้าที่มีอยู่แล้ว
// ไม่ใช้ listCustomers() เพราะดึงทุกคอลัมน์ + ที่อยู่ไซต์ทั้งฐาน หนักเกินความจำเป็นสำหรับช่องค้นหา
export function listCustomersLite() { return _cached("listCustomersLite", _loadCustomersLite, _SHORT_TTL); }
async function _loadCustomersLite() {
  const [c, cc, cs] = await Promise.all([
    _fetchAll((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("customer_contacts").select("customer_id,phone", { count: "exact" }).order("id").range(f, t)),
    _fetchAll((f, t) => supabase.from("customer_sites").select("customer_id,phone", { count: "exact" }).order("id").range(f, t)),
  ]);
  const ph = {};
  [...cc, ...cs].forEach((x) => { if (x.phone) (ph[x.customer_id] = ph[x.customer_id] || []).push(x.phone); });
  return c.map((x) => ({ ...x, phones: [...new Set(ph[x.id] || [])] }));
}
// ผูกคำสั่งซื้อเว็บกับลูกค้าในระบบ (mig 163 — คอลัมน์ customer_id มีตั้งแต่ mig 071 แต่ไม่เคยมีใครเขียน)
// customerId = null คือ "ยกเลิกการผูก" (ผูกผิดราย)
export async function setWebOrderCustomer(id, customerId) {
  // ⚠️ ต้อง .select() แล้วเช็กว่ามีแถวเปลี่ยนจริง — RLS ปฏิเสธ update จะคืน "0 แถว ไม่มี error"
  //    ไม่เช็ก = การ์ดขึ้นว่าผูกแล้ว พอรีเฟรชป้ายก็หายไปเฉย ๆ โดยไม่มีใครรู้ว่าทำไม
  const { data, error } = await supabase.from("web_orders").update({ customer_id: customerId ?? null }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("ผูกลูกค้าไม่สำเร็จ — ไม่พบคำสั่งซื้อใบนี้ หรือสิทธิ์ไม่พอ");
}
// ผูกเลข BOQ ที่สร้างจากคำสั่งซื้อนี้ + เลื่อนสถานะเป็น "เสนอราคาแล้ว"
export async function setWebOrderBoq(id, boqNo) {
  let { error } = await supabase.from("web_orders").update({ boq_no: boqNo, status: "quoted" }).eq("id", id);
  // ยังไม่รัน mig 163 → อย่างน้อยให้สถานะขยับ แล้วบอกให้ไปรัน migration (ไม่ใช่พังทั้งจอ)
  if (error && /boq_no|PGRST204/i.test(error.message || "")) {
    ({ error } = await supabase.from("web_orders").update({ status: "quoted" }).eq("id", id));
    if (!error) throw new Error("บันทึกสถานะแล้ว แต่ยังผูกเลข BOQ ไม่ได้ — ต้องรัน migration 163 ใน Supabase ก่อน");
  }
  if (error) throw error;
}
export async function setWebOrderStatus(id, status) {
  const { error } = await supabase.from("web_orders").update({ status }).eq("id", id);
  if (error) throw error;
}
// ---------- website client logos (มิ migration 072) ----------
export async function listWebClients() {
  const { data, error } = await supabase.from("web_clients").select("*").order("sort").order("id");
  if (error) throw error;
  return data || [];
}
export async function saveWebClient(c) {
  const row = { name: c.name, logo_url: c.logo_url || null, sort: Number(c.sort) || 0, active: c.active !== false };
  if (c.id) { const { error } = await supabase.from("web_clients").update(row).eq("id", c.id); if (error) throw error; }
  else { const { error } = await supabase.from("web_clients").insert(row); if (error) throw error; }
}
export async function deleteWebClient(id) {
  const { error } = await supabase.from("web_clients").delete().eq("id", id);
  if (error) throw error;
}
// upload a logo as-is (NO downscale → keeps PNG transparency) to the public photos bucket
export async function uploadWebLogo(file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `web-clients/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "image/png" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// ---------- web hero banners (ภาพปก/สไลด์โชว์ บนเว็บ) ----------
export async function listWebBanners() {
  const { data, error } = await supabase.from("web_banners").select("*").order("sort").order("id");
  if (error) throw error;
  return data || [];
}
export async function saveWebBanner(b) {
  const row = { image_url: b.image_url || null, caption: b.caption?.trim() || null, link_url: b.link_url?.trim() || null, sort: Number(b.sort) || 0, active: b.active !== false };
  if (b.id) { const { error } = await supabase.from("web_banners").update(row).eq("id", b.id); if (error) throw error; }
  else { const { error } = await supabase.from("web_banners").insert(row); if (error) throw error; }
}
export async function deleteWebBanner(id) {
  const { error } = await supabase.from("web_banners").delete().eq("id", id);
  if (error) throw error;
}
// upload a full-size hero banner image as-is (keep resolution) to the public photos bucket
export async function uploadWebBanner(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `web-banners/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// ---------- generic website content manager (เมนู "จัดการเว็บไซต์") ----------
// one helper set drives all 5 content types (ปก/ผลงาน/โลโก้/บทความ/ข่าว) — table whitelist only
const WEB_KINDS = { banners: "web_banners", portfolio: "web_portfolio", clients: "web_clients", articles: "web_articles", press: "web_press", ads: "web_ads", services: "web_services", reviews: "web_reviews" };
export async function listWebItems(kind) {
  const t = WEB_KINDS[kind]; if (!t) throw new Error("unknown web kind");
  const { data, error } = await supabase.from(t).select("*").order("sort").order("id");
  if (error) throw error; return data || [];
}
export async function saveWebItem(kind, row) {
  const t = WEB_KINDS[kind]; if (!t) throw new Error("unknown web kind");
  const r = { ...row }; delete r.created_at;
  // pre-172 fallback: ยังไม่ได้รันมิเกรชันคอลัมน์ images (อัลบั้มหลายรูป) → บันทึกต่อได้ด้วยรูปปกใบเดียว
  // ⚠️ ห้ามเงียบ! ต้องคืนธง degraded ให้ผู้เรียกเตือนผู้ใช้ ไม่งั้นอัปโหลด 12 รูปแล้วขึ้น "เพิ่มแล้ว ✓"
  //    ทั้งที่เก็บแค่รูปปก อีก 11 รูปกลายเป็นไฟล์กำพร้าใน storage และกู้จากหน้าจอไม่ได้
  const write = async (body) => (body.id
    ? (({ id, ...rest }) => supabase.from(t).update(rest).eq("id", id))(body)
    : supabase.from(t).insert((({ id, ...rest }) => rest)(body)));
  let { error } = await write(r);
  let degraded = null;
  if (error && /images/i.test(error.message || "") && "images" in r) {
    const kept = (r.images || []).length;
    delete r.images;
    ({ error } = await write(r));
    if (!error && kept > 1) degraded = "images";   // เก็บได้แค่รูปปก — ผู้เรียกต้องบอกผู้ใช้
  }
  if (error) throw error;
  return degraded ? { degraded } : null;
}
export async function deleteWebItem(kind, id) {
  const t = WEB_KINDS[kind]; if (!t) throw new Error("unknown web kind");
  const { error } = await supabase.from(t).delete().eq("id", id); if (error) throw error;
}

// ---------- รีวิวลูกค้าจริง (จากคะแนนบนใบงาน mig 203) + ส่งขึ้นเว็บ ----------
// หน้ารีวิวในแอป: รวมงานที่ลูกค้าให้คะแนน + ปุ่มส่งขึ้นเว็บ (insert web_reviews พร้อม source_job) / ลบจากเว็บ
export async function listReviews() {
  const rows = await _fetchAll((f, t) => supabase.from("job_orders")
    .select("job_no,customer_id,assigned_team,cust_rating,cust_comment,cust_rated_at", { count: "exact" })
    .not("cust_rating", "is", null).gt("cust_rating", 0)
    .order("cust_rated_at", { ascending: false, nullsFirst: false }).order("job_no").range(f, t)).catch(() => []);
  const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
  const [cu, tm, wr] = await Promise.all([
    custIds.length ? supabase.from("customers").select("id,name").in("id", custIds) : Promise.resolve({ data: [] }),
    supabase.from("teams").select("id,name"),
    supabase.from("web_reviews").select("id,source_job"),   // published set (source_job) — ถ้ายังไม่รัน 208 คอลัมน์หาย → treated as none
  ]);
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const tn = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  const pub = {}; if (!wr.error) (wr.data || []).forEach((w) => { if (w.source_job) pub[w.source_job] = w.id; });
  return rows.map((j) => ({
    job_no: j.job_no, customer_name: cn[j.customer_id] || "", team: tn[j.assigned_team] || "",
    rating: j.cust_rating, comment: j.cust_comment, rated_at: j.cust_rated_at,
    published: j.job_no in pub, web_review_id: pub[j.job_no] || null,
  }));
}
// ส่งรีวิวจริงขึ้นเว็บ (insert web_reviews) — ใช้ชื่อจริงแบบสุภาพ + โยง source_job
export async function publishReview({ job_no, name, role, text, stars }) {
  const row = { name: (name || "ลูกค้า").trim(), role: (role || "ลูกค้า AMC AIR").trim(), text: (text || "").trim(), stars: Math.min(5, Math.max(1, Number(stars) || 5)), active: true, sort: 0, source_job: job_no };
  let { error } = await supabase.from("web_reviews").insert(row);
  if (error && /source_job|column|PGRST204/i.test(error.message || "")) { const { source_job, ...rest } = row; ({ error } = await supabase.from("web_reviews").insert(rest)); }
  if (error) throw error;
}
// ลบรีวิวออกจากเว็บ (ลบแถว web_reviews)
export async function unpublishReview(webReviewId) {
  const { error } = await supabase.from("web_reviews").delete().eq("id", webReviewId); if (error) throw error;
}
// upload any website image as-is (keeps resolution/transparency) to the public photos bucket
export async function uploadWebImage(file, folder) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${(folder || "web").replace(/[^a-z0-9-]/g, "")}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

export async function deleteJobOrder(job_no, reason) {
  const [{ data: head }, { data: visits }] = await Promise.all([
    supabase.from("job_orders").select("*").eq("job_no", job_no).maybeSingle(),
    supabase.from("job_visits").select("*").eq("job_no", job_no),
  ]);
  const { error } = await supabase.from("job_orders").delete().eq("job_no", job_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "job_order", target_no: job_no, reason, snapshot: head ? { ...head, visits: visits || [] } : null });
  syncCashEntriesFromDocs().catch(() => {}); // refresh cash flow after job delete
}

// ใบงานเชื่อม: แตกใบใหม่จากใบหนึ่ง (เลขราก + A/B/C) คัดลอกข้อมูลลูกค้า/งาน · ทีม+รอบให้ออฟฟิศกำหนดเอง
export async function createLinkedJob(base) {
  const { data: { user } } = await supabase.auth.getUser();
  const group = base.group_no || base.job_no;
  if (!base.group_no) await supabase.from("job_orders").update({ group_no: group }).eq("job_no", base.job_no);
  const { data: sibs } = await supabase.from("job_orders").select("job_no").like("job_no", group + "%");
  const used = new Set((sibs || []).map((s) => s.job_no).filter((n) => n.startsWith(group) && /^[A-Z]$/.test(n.slice(group.length))).map((n) => n.slice(group.length)));
  let suffix = "A"; for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) { suffix = c; break; } }
  const newNo = group + suffix;
  const row = {
    job_no: newNo, group_no: group, quote_no: base.quote_no || null, customer_id: base.customer_id || null, site_id: base.site_id || null,
    title: base.title || null, job_type: base.job_type || "install", contact_name: base.contact_name || null, contact_phone: base.contact_phone || null,
    address: base.address || null, map_url: base.map_url || null, details: base.details || null, sales_note: base.sales_note || null,
    sales_photos: base.sales_photos || [], status: "pending", created_by: user?.id || null,
  };
  const e = (await supabase.from("job_orders").insert(row)).error; if (e) throw e;
  return newNo;
}

// งานแก้ไข/เคลม (mig 188): แตกใบงานเชื่อม ประเภท "แก้ไขงาน" ผูกใบต้นเรื่อง (rework_of)
// + ติดธงเคลมที่ "ใบต้นเรื่อง" → KPI ตัดเคลม −5 ให้ทีมที่ทำพลาด · ใบแก้ไม่ติดธง = ทีมที่ไปแก้ไม่โดนตัด
// ต้นทุนงานแก้ไหลเข้ากำไรงานเดิม (quote เดียวกัน) = ต้นทุนแก้กินมาร์จินงานเดิม (ไม่เก็บเงินลูกค้าเพิ่ม)
export async function createReworkJob(base, { markClaim = true } = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  const group = base.group_no || base.job_no;
  if (!base.group_no) await supabase.from("job_orders").update({ group_no: group }).eq("job_no", base.job_no);
  const { data: sibs } = await supabase.from("job_orders").select("job_no").like("job_no", group + "%");
  const used = new Set((sibs || []).map((s) => s.job_no).filter((n) => n.startsWith(group) && /^[A-Z]$/.test(n.slice(group.length))).map((n) => n.slice(group.length)));
  let suffix = "A"; for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) { suffix = c; break; } }
  const newNo = group + suffix;
  const row = {
    job_no: newNo, group_no: group, quote_no: base.quote_no || null, customer_id: base.customer_id || null, site_id: base.site_id || null,
    title: `🔁 แก้ไขงาน ${base.job_no}` + (base.title ? ` · ${base.title}` : ""), job_type: "fix", rework_of: base.job_no,
    contact_name: base.contact_name || null, contact_phone: base.contact_phone || null,
    address: base.address || null, map_url: base.map_url || null, details: base.details || null,
    sales_photos: [], status: "pending", is_claim: false, created_by: user?.id || null,
  };
  let e = (await supabase.from("job_orders").insert(row)).error;
  if (e && /rework_of/.test(e.message || "")) { delete row.rework_of; e = (await supabase.from("job_orders").insert(row)).error; }  // pre-188 fallback
  if (e) throw e;
  if (markClaim) await supabase.from("job_orders").update({ is_claim: true }).eq("job_no", base.job_no);   // เคลมติดที่ใบต้นเรื่อง
  return newNo;
}

// cancel/void a confirmed transaction (admin only — RLS). Stock recomputes automatically.
export async function deleteTransaction(id, reason) {
  const { data: snap } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  // เช็คว่าลบได้จริง — RLS ไม่มีสิทธิ์ = 0 แถวแบบเงียบ (ก่อน mig 151 ตารางนี้ไม่มีนโยบายลบเลย)
  const { data: gone, error } = await supabase.from("transactions").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!gone?.length) throw new Error("ลบไม่สำเร็จ — ไม่มีสิทธิ์ลบรายการสต๊อก (รัน migration 151 ใน Supabase ก่อน)");
  await logAudit({ action: "delete", target_type: "transaction", target_no: id, reason, snapshot: snap });
}
// ยกเลิกการบันทึกทั้งชุด (batch) — ใช้กับ "ยกเลิกรับเข้าทั้งใบ PO": ลบทุกรายการในชุด (สต๊อกคืนอัตโนมัติ)
// และถ้าชุดนี้อ้างใบสั่งซื้อ → ลบชุด "เบิกเข้างานอัตโนมัติ" คู่กัน (ผูกด้วยคอลัมน์ po_no, mig 151) + คืนสถานะ PO เป็น "รอรับของ"
export async function cancelTransactionGroup({ ids, ref_no, po_no }, reason) {
  if (!ids?.length) throw new Error("ไม่มีรายการในชุดนี้");
  const { data: snap } = await supabase.from("transactions").select("*").in("id", ids);
  // ต้องลบได้จริงก่อนถึงจะเด้ง PO กลับ "รอรับของ" — เดิม RLS ไม่มีนโยบายลบ: แถวอยู่ครบแต่ใบเด้งกลับ → กดรับใหม่ = สต๊อกเบิ้ลสองเท่า
  const { data: gone, error } = await supabase.from("transactions").delete().in("id", ids).select("id");
  if (error) throw error;
  if (!gone?.length) throw new Error("ยกเลิกไม่สำเร็จ — ไม่มีสิทธิ์ลบรายการสต๊อก (รัน migration 151 ใน Supabase ก่อน) ใบยังคงสถานะเดิม");
  if (po_no) {
    // ลบเฉพาะ "ชุดเบิกอัตโนมัติที่เกิดคู่กับรอบนี้" (twin_ref = เลขชุดรับของรอบนี้ — mig 155)
    // ⚠️ ห้ามลบด้วย po_no เฉย ๆ: ใบที่ทยอยรับหลายรอบจะโดนลบรายการของรอบก่อนหน้าไปด้วย = สต๊อกหายทั้งที่ของอยู่จริง
    let twinQ = supabase.from("transactions").delete();
    twinQ = ref_no ? twinQ.eq("twin_ref", ref_no) : twinQ.eq("po_no", po_no).eq("type", "withdraw").in("id", []);
    let { data: twin, error: eTwin } = await twinQ.select("id");
    // pre-155 fallback: ยังไม่มีคอลัมน์ twin_ref → ลบชุดเบิกที่ตรา po_no เดียวกัน (ปลอดภัยเฉพาะใบที่รับรอบเดียว)
    if (eTwin && /twin_ref/i.test(eTwin.message || "")) {
      ({ data: twin } = await supabase.from("transactions").delete().eq("po_no", po_no).eq("type", "withdraw").select("id"));
    }
    const { error: e2 } = await supabase.from("purchase_orders").update({ status: "open", received_at: null }).eq("po_no", po_no).eq("status", "received");
    if (e2) throw e2;
    await logAudit({ action: "delete", target_type: "transaction_batch", target_no: ref_no || String(ids[0]), reason, snapshot: { po_no, rows: snap || [], twin_deleted: (twin || []).length } });
    syncCashEntriesFromDocs().catch(() => {});  // PO เด้งกลับ "คาดว่าจะจ่าย"
    return;
  }
  await logAudit({ action: "delete", target_type: "transaction_batch", target_no: ref_no || String(ids[0]), reason, snapshot: { po_no: null, rows: snap || [] } });
}
// edit a movement's quantity (stock + value recompute automatically from the transactions table)
export async function updateTransaction(id, qty, reason) {
  const { data: snap } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  const { data: upd, error } = await supabase.from("transactions").update({ qty: Number(qty) }).eq("id", id).select("id");
  if (error) throw error;
  if (!upd?.length) throw new Error("แก้ไขไม่สำเร็จ — ไม่มีสิทธิ์แก้รายการสต๊อก");
  // กติกาบ้าน: แก้ตัวเลขย้อนหลังต้องมีร่องรอย — เก็บค่าเดิมทั้งแถวไว้ใน audit
  await logAudit({ action: "update", target_type: "transaction", target_no: id, reason: reason || `แก้จำนวน ${snap?.qty} → ${qty}`, snapshot: snap }).catch(() => {});
}

export async function listRecentTransactions(limit = 60) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
// ค้นธุรกรรมทั้งฐาน (ไม่ใช่แค่ 60 รายการล่าสุด) — จับ เลขเอกสาร (WD/PC/RT) / เลขงาน หรือ PO / รหัสวัสดุ
// codes = รหัสวัสดุที่ชื่อตรงคำค้น (คัดจากฝั่งแอป) → ค้นด้วยชื่อวัสดุได้ด้วย
export async function searchTransactions(q, codes = [], limit = 400) {
  const t = String(q || "").trim().replace(/[%,()]/g, "");
  if (!t) return [];
  const ors = [`ref_no.ilike.%${t}%`, `job_no.ilike.%${t}%`, `material_code.ilike.%${t}%`];
  if (codes.length) ors.push(`material_code.in.(${codes.map((c) => `"${String(c).replace(/[",]/g, "")}"`).join(",")})`);
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .or(ors.join(","))
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  // ดึง "ทั้งชุด" ของ ref_no ที่เจอ — ชุดต้องครบทุกแถว ไม่งั้นยอดรวม/ปุ่มยกเลิกทั้งชุดทำงานกับชุดไม่ครบ
  const refs = [...new Set((data || []).map((r) => r.ref_no).filter(Boolean))].slice(0, 100);
  if (!refs.length) return data || [];
  const full = await supabase.from("transactions").select("*").in("ref_no", refs).order("id", { ascending: false }).limit(1000);
  if (full.error) return data || [];
  return [...(full.data || []), ...(data || []).filter((r) => !r.ref_no)];
}

// ธุรกรรมตามช่วงวันที่ (YYYY-MM-DD) — ใหม่→เก่า · ผ่าน _fetchAll (ไม่ติดเพดาน 1000 แถว) สำหรับหน้าเคลื่อนไหวสินค้า
export async function listTransactionsRange(from, to) {
  return _fetchAll((f, t) => {
    let q = supabase.from("transactions").select("*", { count: "exact" }).order("id", { ascending: false });
    if (from) q = q.gte("txn_date", from);
    if (to) q = q.lte("txn_date", to);
    return q.range(f, t);
  });
}
// transactions since a date (YYYY-MM-DD); null = all-time. For dashboards.
export async function listTransactionsSince(startDate) {
  // limit(10000) ใช้ไม่ได้จริง — Supabase ตัดที่ 1000 แถวเสมอ ต้องดึงเป็นช่วง ๆ
  return _fetchAll((f, t) => {
    let q = supabase.from("transactions").select("*", { count: "exact" }).order("id");
    if (startDate) q = q.gte("txn_date", startDate);
    return q.range(f, t);
  });
}

// ต้นทุนวัสดุที่เบิก/คืน รวมต่อใบงาน → { job_no: { withdraw, return } }
export async function jobMaterialCost() {
  const rows = await _fetchAll((f, t) =>
    supabase.from("transactions").select("job_no,type,value", { count: "exact" }).not("job_no", "is", null).order("id").range(f, t)   // ไม่มี order = แถวซ้ำ/หายระหว่างหน้า
  );
  const m = {};
  rows.forEach((r) => {
    if (!r.job_no) return;
    const j = m[r.job_no] || (m[r.job_no] = { withdraw: 0, return: 0 });
    if (r.type === "withdraw" || r.type === "damage") j.withdraw += Number(r.value) || 0;
    else if (r.type === "return") j.return += Number(r.value) || 0;
  });
  return m;
}

// สต๊อกคงเหลือย้อนหลัง ณ วันที่ (asOf 'YYYY-MM-DD' รวมวันนั้น · null/ว่าง = ปัจจุบัน/ทั้งหมด)
// สูตรตรงกับ view material_stock (mig 086): init_stock + (purchase+return+adjust_in) − withdraw − adjust_out − damage(เฉพาะ job_no ว่าง)
// คืนสินค้าที่มีสต๊อกได้ (kind ≠ service) พร้อม onHand (จำนวน) · value คิดด้วยต้นทุนปัจจุบัน (ประมาณ — ไม่เก็บต้นทุนย้อนหลังต่อวัน)
export async function stockAsOf(asOf) {
  const [mats, txs] = await Promise.all([
    listMaterialsLite(),
    _fetchAll((f, t) => {
      let b = supabase.from("transactions").select("material_code,type,qty,job_no", { count: "exact" }).order("id").range(f, t);
      if (asOf) b = b.lte("txn_date", asOf);
      return b;
    }),
  ]);
  const delta = {};
  txs.forEach((x) => {
    const c = x.material_code; if (!c) return;
    let s = 0;
    if (x.type === "purchase" || x.type === "return" || x.type === "adjust_in") s = Number(x.qty) || 0;
    else if (x.type === "withdraw" || x.type === "adjust_out") s = -(Number(x.qty) || 0);
    else if (x.type === "damage" && !x.job_no) s = -(Number(x.qty) || 0);
    delta[c] = (delta[c] || 0) + s;
  });
  return mats.filter((m) => m.kind !== "service").map((m) => {
    const onHand = (Number(m.init_stock) || 0) + (delta[m.code] || 0);
    return { code: m.code, th: m.th, kind: m.kind, cat: m.cat, catName: m.catName, unit: m.unit, cost: Number(m.cost) || 0, tracked: m.tracked, onHand, value: onHand * (Number(m.cost) || 0) };
  });
}

// all movements for one material (for the detail drawer)
export async function listMaterialMovements(code) {
  // ครบทุกแถวจริง (เดิม limit 300 แต่หัวข้อบอก "ตลอดอายุ" — ของหมุนเร็วยอดสรุปขาด) · กรองรายรหัส ไม่หนัก
  const data = await _fetchAll((f, t) => supabase.from("transactions").select("*", { count: "exact" }).eq("material_code", code).order("id", { ascending: false }).range(f, t));
  return data || [];
}

// ---------- ADMIN: manage teams (admin only — RLS) ----------
export async function saveTeam(t) {
  const row = { id: t.id.trim().toUpperCase(), name: t.name.trim(), lead: t.lead?.trim() || null };
  if (t.type !== undefined) row.type = t.type || "permanent";
  if (t.phone !== undefined) row.phone = t.phone?.trim() || null;
  if (t.tax_id !== undefined) row.tax_id = t.tax_id?.trim() || null;
  if (t.bank_info !== undefined) row.bank_info = t.bank_info?.trim() || null;
  if (t.payout_rate !== undefined) row.payout_rate = Number(t.payout_rate) || 0;
  const { error } = await supabase.from("teams").upsert(row, { onConflict: "id" });
  if (error) throw error;
  bustCache("teams");
}

// ===================== SUBCONTRACTOR (labor + payout) =====================
// save the per-line labor for a job order
export async function saveJobLabor(jobNo, lines, total) {
  const { error } = await supabase.from("job_orders").update({ labor_lines: lines, labor_total: Number(total) || 0 }).eq("job_no", jobNo);
  if (error) throw error;
  syncCashEntriesFromDocs().catch(() => {}); // แก้ยอดค่าแรง → อัปเดต "ค่าแรงรอจ่าย" ในกระแสเงินสด
}
// office review of a sub job (rating 1-5 + claim flag)
export async function saveJobReview(jobNo, rating, isClaim) {
  const { error } = await supabase.from("job_orders").update({ rating: rating || null, is_claim: !!isClaim }).eq("job_no", jobNo);
  if (error) throw error;
}
// confirm / un-confirm a job's labor (locks it, then it shows up under "ค่าแรงรอจ่าย")
export async function confirmJobLabor(jobNo, confirmed) {
  const uid = await _uid();
  const patch = confirmed
    ? { labor_confirmed: true, labor_confirmed_at: new Date().toISOString(), labor_confirmed_by: uid }
    : { labor_confirmed: false, labor_confirmed_at: null, labor_confirmed_by: null };
  const { error } = await supabase.from("job_orders").update(patch).eq("job_no", jobNo);
  if (error) throw error;
  syncCashEntriesFromDocs().catch(() => {}); // ยืนยัน/ยกเลิกค่าแรง → คาดว่าจะจ่าย (labor_owed) เด้งเข้า/ออกกระแสเงินสด
}
export async function listSubPayouts() {
  // ประวัติการเงิน — ต้องไล่ทีละหน้า ไม่งั้นใบเก่าหลุดหายเงียบเมื่อเกิน 1000 ใบ
  const { data, error } = await _allRows((f, t) => supabase.from("sub_payouts").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t));
  if (error) throw error; return data || [];
}

// สกอร์การ์ดผลงาน (mig 198) — วัด KPI จริงต่อคน/ต่อทีมในช่วงเวลา · office เท่านั้น
// คืน { sales:[{user_id,name,role,quotes,won,close_rate,revenue}], teams:[{team_id,name,type,jobs_done,claims,claim_rate,rating_avg}] }
export async function listKpiScorecard(from, to) {
  const { data, error } = await supabase.rpc("kpi_scorecard", { p_from: from, p_to: to });
  if (error) { if (/function|does not exist|schema cache|PGRST202/i.test(error.message || "")) return { sales: [], teams: [] }; throw error; }
  const d = data || {};
  return { sales: Array.isArray(d.sales) ? d.sales : [], teams: Array.isArray(d.teams) ? d.teams : [] };
}

// หัวหน้าทีมช่างซัพดู "งานค้างจ่าย" ของทีมตัวเอง (อ่านอย่างเดียว) — ผ่าน RPC security definer (mig 197)
// คืน { jobs:[งานยืนยันค่าแรงแล้วยังจ่ายไม่ครบ], payouts:[ใบจ่ายที่ออกแล้วรอโอน] } เฉพาะทีมของผู้เรียก
// ถ้ายังไม่รัน mig 197 → คืนโครงว่าง (หน้าจอไม่พัง)
export async function listMySubPending() {
  const { data, error } = await supabase.rpc("sub_pending_for_team");
  if (error) { if (/function|does not exist|schema cache|PGRST202/i.test(error.message || "")) return { jobs: [], payouts: [] }; throw error; }
  const d = data || {};
  return { jobs: Array.isArray(d.jobs) ? d.jobs : [], payouts: Array.isArray(d.payouts) ? d.payouts : [] };
}

// ---------- รายงานกำไร-ขาดทุน (P&L เฟส 3) ----------
// ต้นทุนของที่ "เบิกเข้างานจริง" ในช่วง (COGS) แยก เครื่อง/วัสดุ/อะไหล่ · value = qty×unit_cost (ต้นทุนเฉลี่ย ณ เวลานั้น)
// withdraw+damage = ต้นทุนที่ใช้ไป · return = คืนกลับ (ลบ) · adjust_* ไม่นับ (ปรับนับสต๊อก ไม่ใช่ต้นทุนงาน)
// service ไม่นับ (ต้นทุนบริการ = ค่าแรง คิดจาก sub_payouts/เงินเดือนแยก)
export async function costOfGoodsByGroup(from, to) {
  const [txs, mats, cats] = await Promise.all([
    _fetchAll((f, t) => {
      let b = supabase.from("transactions").select("material_code,type,value", { count: "exact" }).in("type", ["withdraw", "damage", "return"]).order("id").range(f, t);
      if (from) b = b.gte("txn_date", from);
      if (to) b = b.lte("txn_date", to);
      return b;
    }),
    listMaterialsLite(),
    listCategories(),
  ]);
  const catGroup = Object.fromEntries(cats.map((c) => [c.id, c.mat_group]));
  const gOf = Object.fromEntries(mats.map((m) => {
    let g = null;
    if (m.kind === "ac") g = "ac";
    else if (m.kind === "material" || !m.kind) g = catGroup[m.category] === "part" ? "part" : "material";
    return [m.code, g];   // service → null (ไม่นับใน COGS ของ)
  }));
  const acc = { ac: 0, material: 0, part: 0 };
  txs.forEach((x) => {
    const g = gOf[x.material_code];
    if (!g) return;
    acc[g] += (x.type === "return" ? -1 : 1) * (Number(x.value) || 0);
  });
  return acc;
}

// สลิปเงินเดือนของงวด (period 'YYYY-MM') ที่อยู่ในช่วง — เทียบสตริงปลอดภัยเพราะ zero-padded
export async function listPayslipsRange(fromYM, toYM) {
  return _fetchAll((f, t) => {
    let b = supabase.from("payslips").select("period,net,status,paid_at", { count: "exact" }).order("period").range(f, t);
    if (fromYM) b = b.gte("period", fromYM);
    if (toYM) b = b.lte("period", toYM);
    return b;
  });
}
const _r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
// create a payout batch for a sub team from per-job allocation lines (supports partial / split payments).
// lines: [{job_no, amount, vat, total, customerName}]  → wht 3% applies only to the VAT-billed jobs' allocated amount.
export async function createSubPayout({ team, lines, whtRate, note }) {
  const uid = await _uid();
  const ls = (lines || []).filter((l) => (Number(l.amount) || 0) > 0);
  if (!ls.length) throw new Error("ไม่มีรายการที่จะจ่าย");
  const jobNos = ls.map((l) => l.job_no);
  // guard ฝั่ง server: อ่านยอดค้างสดก่อนสร้างใบ — กัน 2 เครื่องกด "จ่ายเต็มจำนวน" งานเดียวกันพร้อมกัน (ใบจ่ายซ้ำ 2 ใบยอดเต็ม)
  const { data: jrows, error: ej } = await supabase.from("job_orders").select("job_no,labor_total,labor_paid_amt,labor_paid,payout_id").in("job_no", jobNos);
  if (ej) throw ej;
  const cur = Object.fromEntries((jrows || []).map((j) => [j.job_no, j]));
  for (const l of ls) {
    const j = cur[l.job_no];
    if (!j) throw new Error(`ไม่พบใบงาน ${l.job_no}`);
    const rem = _r2((Number(j.labor_total) || 0) - (Number(j.labor_paid_amt) || 0));
    if ((Number(l.amount) || 0) > rem + 0.01) throw new Error(`ยอดจ่ายของ ${l.job_no} เกินค้างจ่าย (เหลือ ${rem.toLocaleString("en-US")} บาท) — อาจมีคนตั้งจ่ายพร้อมกันจากอีกเครื่อง รีเฟรชแล้วลองใหม่`);
  }
  const gross = _r2(ls.reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const vatBase = _r2(ls.filter((l) => l.vat).reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const whtAmt = _r2(vatBase * (Number(whtRate) || 0) / 100);
  const net = _r2(gross - whtAmt);
  const { data, error } = await supabase.from("sub_payouts").insert({
    team, job_nos: jobNos, lines: ls, gross, wht_rate: Number(whtRate) || 0, wht_amt: whtAmt,
    net, status: "unpaid", note: note || null, created_by: uid,
  }).select("id").single();
  if (error) throw error;
  // bump each job's cumulative allocated amount (optimistic: อัปเดตเฉพาะเมื่อยอดยังเท่าตอนอ่าน) — ชนกันเมื่อไหร่ถอยคืนทั้งหมดแล้วถอนใบจ่ายทิ้ง
  const bumped = []; // บรรทัดที่ bump สำเร็จแล้ว — ไว้ถอยคืนถ้าบรรทัดถัดไปชน (ไม่งั้นยอดค้างจ่ายหายทั้งที่ไม่มีใบจริง)
  for (const l of ls) {
    const j = cur[l.job_no];
    const paid = _r2((Number(j.labor_paid_amt) || 0) + (Number(l.amount) || 0));
    const done = paid >= (Number(j.labor_total) || 0) - 0.01;
    let q = supabase.from("job_orders").update({ labor_paid_amt: paid, labor_paid: done, payout_id: data.id });
    q = j.labor_paid_amt == null ? q.is("labor_paid_amt", null) : q.eq("labor_paid_amt", j.labor_paid_amt);
    const { data: ok, error: eu } = await q.eq("job_no", l.job_no).select("job_no");
    if (eu || !ok || !ok.length) {
      for (const b of bumped) { // best-effort คืนค่าเดิมของบรรทัดที่ทำไปแล้ว
        try { await supabase.from("job_orders").update({ labor_paid_amt: b.prevPaid, labor_paid: b.prevDone, payout_id: b.prevPayout }).eq("job_no", b.job_no); } catch (_) { /* ignore */ }
      }
      try { await supabase.from("sub_payouts").delete().eq("id", data.id); } catch (_) { /* best-effort rollback */ }
      if (eu) throw eu;
      throw new Error(`ใบงาน ${l.job_no} ถูกตั้งจ่ายพร้อมกันจากอีกเครื่อง — ถอนใบนี้และคืนยอดให้แล้ว รีเฟรชแล้วลองใหม่`);
    }
    bumped.push({ job_no: l.job_no, prevPaid: j.labor_paid_amt ?? 0, prevDone: !!j.labor_paid, prevPayout: j.payout_id ?? null });
  }
  syncCashEntriesFromDocs().catch(() => {}); // new payout → "คาดว่าจะจ่าย" in cash flow
  return data.id;
}
// mark a payout paid + choose the paying account → posts an "out" line into that account's
// ledger (kind='payout') for bank reconciliation. Cash flow is handled separately by the sync.
// Back-compat: paySubPayout(id, "โอนเงิน") still works (no account).
export async function paySubPayout(id, opts) {
  const { accountId, method, payDate, slipUrl, note } = typeof opts === "string" ? { method: opts } : (opts || {});
  const uid = await _uid();
  const { data: p, error: e0 } = await supabase.from("sub_payouts").select("net,team,status").eq("id", id).single();
  if (e0) throw e0;
  if (p.status === "paid") throw new Error("ใบนี้บันทึกจ่ายแล้ว");
  const day = payDate || new Date().toISOString().slice(0, 10);
  const noteTxt = (note || "").trim();
  // paid_at ใช้วันที่จ่ายที่ผู้ใช้เลือก (เที่ยง UTC = ตกวันเดียวกันตามเวลาไทยแน่นอน) — กระแสเงินสดลงวันเดียวกับเดินบัญชี ไม่ใช่วันกดปุ่ม
  const patch = { status: "paid", paid_at: payDate ? `${payDate}T12:00:00.000Z` : new Date().toISOString(), method: method || null, paid_from: accountId || null, pay_slip_url: slipUrl || null, pay_note: noteTxt || null };
  let upd = await supabase.from("sub_payouts").update(patch).eq("id", id);
  if (upd.error && /pay_note/i.test(upd.error.message || "")) { delete patch.pay_note; upd = await supabase.from("sub_payouts").update(patch).eq("id", id); } // pre-221 fallback
  if (upd.error && /pay_slip_url/i.test(upd.error.message || "")) { delete patch.pay_slip_url; upd = await supabase.from("sub_payouts").update(patch).eq("id", id); } // pre-128 fallback
  if (upd.error && /paid_from|column|PGRST204/i.test(upd.error.message || "")) { delete patch.paid_from; upd = await supabase.from("sub_payouts").update(patch).eq("id", id); }
  if (upd.error) throw upd.error;
  if (accountId) {
    const { error: eAcc } = await supabase.from("account_entries").insert({ account_id: accountId, direction: "out", amount: Number(p.net) || 0, kind: "payout", ref_type: "payout", ref_id: id, note: `จ่ายค่าแรงช่างซัพ · ทีม ${p.team}${noteTxt ? " · " + noteTxt : ""}`, entry_date: day, created_by: uid });
    if (eAcc) throw eAcc;
  }
  syncCashEntriesFromDocs().catch(() => {}); // paid → move to "จ่ายจริง" in cash flow
}
// cancel an unpaid payout → give the allocated amounts back so the jobs return to "รอจ่าย"
export async function cancelSubPayout(id, reason) {
  const { data: p, error } = await supabase.from("sub_payouts").select("id,status,lines,job_nos").eq("id", id).single();
  if (error) throw error;
  if (p.status === "paid") throw new Error("ใบนี้บันทึกจ่ายแล้ว ยกเลิกไม่ได้");
  const lines = p.lines || [];
  const jobNos = lines.length ? lines.map((l) => l.job_no) : (p.job_nos || []);
  if (jobNos.length) {
    const { data: jrows } = await supabase.from("job_orders").select("job_no,labor_paid_amt").in("job_no", jobNos);
    const cur = Object.fromEntries((jrows || []).map((j) => [j.job_no, j]));
    if (lines.length) {
      for (const l of lines) {
        const j = cur[l.job_no]; if (!j) continue;
        const paid = Math.max(0, _r2((Number(j.labor_paid_amt) || 0) - (Number(l.amount) || 0)));
        await supabase.from("job_orders").update({ labor_paid_amt: paid, labor_paid: false }).eq("job_no", l.job_no);
      }
    } else {
      // legacy payout without per-job lines → fully release
      await supabase.from("job_orders").update({ labor_paid_amt: 0, labor_paid: false }).in("job_no", jobNos);
    }
  }
  await supabase.from("account_entries").delete().eq("ref_type", "payout").eq("ref_id", id); // defensive: drop any linked bank-ledger line
  const { error: delErr } = await supabase.from("sub_payouts").delete().eq("id", id);
  if (delErr) throw delErr;
  await logAudit({ action: "cancel", target_type: "sub_payout", target_no: String(id), reason, snapshot: p }); // กติกาบ้าน: ยกเลิกลงประวัติเสมอ
  syncCashEntriesFromDocs().catch(() => {}); // removed payout → update its cash-flow line
}
// edit an existing payout's per-job amounts (accounting correction; works on paid ones too).
// recomputes gross/wht/net and adjusts each job's cumulative labor_paid_amt by the delta.
export async function updateSubPayout({ id, lines, whtRate }) {
  const { data: old, error: e0 } = await supabase.from("sub_payouts").select("id,lines,job_nos,wht_rate").eq("id", id).single();
  if (e0) throw e0;
  const oldAmt = Object.fromEntries((old.lines || []).map((l) => [l.job_no, Number(l.amount) || 0]));
  const ls = (lines || []).filter((l) => (Number(l.amount) || 0) > 0);
  if (!ls.length) throw new Error("ต้องมีอย่างน้อย 1 รายการที่มียอด");
  const rate = whtRate != null ? Number(whtRate) : (Number(old.wht_rate) || 0);
  const jobNos = ls.map((l) => l.job_no);
  const gross = _r2(ls.reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const vatBase = _r2(ls.filter((l) => l.vat).reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const whtAmt = _r2(vatBase * rate / 100);
  const net = _r2(gross - whtAmt);
  const { error } = await supabase.from("sub_payouts").update({ lines: ls, job_nos: jobNos, gross, wht_rate: rate, wht_amt: whtAmt, net }).eq("id", id);
  if (error) throw error;
  await supabase.from("account_entries").update({ amount: net }).eq("ref_type", "payout").eq("ref_id", id); // keep the bank-ledger line in sync (paid payouts)
  syncCashEntriesFromDocs().catch(() => {}); // edited net → refresh cash-flow line
  // re-balance each job's cumulative paid amount by (new − old) for this payout
  const newAmt = Object.fromEntries(ls.map((l) => [l.job_no, Number(l.amount) || 0]));
  const allJobs = [...new Set([...Object.keys(oldAmt), ...jobNos])];
  const { data: jrows } = await supabase.from("job_orders").select("job_no,labor_total,labor_paid_amt").in("job_no", allJobs);
  const cur = Object.fromEntries((jrows || []).map((j) => [j.job_no, j]));
  for (const jn of allJobs) {
    const j = cur[jn]; if (!j) continue;
    const delta = _r2((newAmt[jn] || 0) - (oldAmt[jn] || 0));
    const paid = Math.max(0, _r2((Number(j.labor_paid_amt) || 0) + delta));
    const done = paid >= (Number(j.labor_total) || 0) - 0.01;
    await supabase.from("job_orders").update({ labor_paid_amt: paid, labor_paid: done }).eq("job_no", jn);
  }
  return id;
}
// hard-delete a payout (ธุรการเท่านั้น — กติกาบ้าน "ลบถาวร = admin") — works on paid ones too;
// releases each job's cumulative paid amount back so the labor returns to "รอจ่าย".
export async function deleteSubPayout(id, reason) {
  const { data: p, error } = await supabase.from("sub_payouts").select("*").eq("id", id).single();
  if (error) throw error;
  const lines = p.lines || [];
  const jobNos = lines.length ? lines.map((l) => l.job_no) : (p.job_nos || []);
  if (jobNos.length) {
    const { data: jrows } = await supabase.from("job_orders").select("job_no,labor_paid_amt").in("job_no", jobNos);
    const cur = Object.fromEntries((jrows || []).map((j) => [j.job_no, j]));
    if (lines.length) {
      for (const l of lines) {
        const j = cur[l.job_no]; if (!j) continue;
        const paid = Math.max(0, _r2((Number(j.labor_paid_amt) || 0) - (Number(l.amount) || 0)));
        await supabase.from("job_orders").update({ labor_paid_amt: paid, labor_paid: false, payout_id: null }).eq("job_no", l.job_no);
      }
    } else {
      await supabase.from("job_orders").update({ labor_paid_amt: 0, labor_paid: false, payout_id: null }).in("job_no", jobNos);
    }
  }
  await supabase.from("account_entries").delete().eq("ref_type", "payout").eq("ref_id", id); // remove the bank-ledger out line
  const { error: delErr } = await supabase.from("sub_payouts").delete().eq("id", id);
  if (delErr) throw delErr;
  await logAudit({ action: "delete", target_type: "sub_payout", target_no: String(id), reason, snapshot: p }); // ลบถาวรลงประวัติ + snapshot กู้คืนได้
  syncCashEntriesFromDocs().catch(() => {}); // removed payout → update its cash-flow line
}
export async function deleteTeam(id) {
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) throw error;
  bustCache("teams");
}

// ---------- ADMIN: manage users / profiles ----------
export async function listProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("email");
  if (error) throw error;
  return data || [];
}

// ---------- NOTIFICATIONS (การแจ้งเตือนกิจกรรม) ----------
export const NOTIFY_CATS = [
  { id: "team_chat", label: "แชตทีม" },
  { id: "task", label: "กระดานสั่งงาน" },
  { id: "job", label: "ใบงาน / งานช่าง" },
  { id: "hr", label: "HR (เข้างาน/ลา/เบิก/อนุมัติ)" },
  { id: "customer_chat", label: "แชตลูกค้า (LINE/FB)" },
];
async function _usersByRole(roles) {
  if (!roles?.length) return [];
  const { data } = await supabase.from("profiles").select("id").in("role", roles);
  return (data || []).map((p) => p.id);
}
// who watches a job: office (admin/exec/sales) + the assigned team's members
// ชื่อลูกค้าจาก id · และชื่อลูกค้าจากเลขงาน — ใช้ทำหัวข้อแจ้งเตือนงานให้เห็นว่าเป็นลูกค้าใคร
async function _custName(id) { if (!id) return ""; try { const { data } = await supabase.from("customers").select("name").eq("id", id).maybeSingle(); return data?.name || ""; } catch { return ""; } }
async function _jobCust(job_no) { try { const { data: jo } = await supabase.from("job_orders").select("customer_id").eq("job_no", job_no).maybeSingle(); return jo ? await _custName(jo.customer_id) : ""; } catch { return ""; } }
async function _jobWatchers(job_no) {
  try {
    const { data: jo } = await supabase.from("job_orders").select("assigned_team").eq("job_no", job_no).maybeSingle();
    const office = await _usersByRole(["admin", "exec", "sales", "field_sales", "lead_tech"]); // หัวหน้าช่างคุมทุกทีม — ต้องเห็นความเคลื่อนไหวงานด้วย
    let team = [];
    if (jo?.assigned_team) { const { data } = await supabase.from("profiles").select("id").eq("team", jo.assigned_team); team = (data || []).map((p) => p.id); }
    return [...new Set([...office, ...team])];
  } catch { return []; }
}
let _notifyCfg = null;
async function _notifySettings() {
  if (_notifyCfg) return _notifyCfg;
  try { const { data } = await supabase.from("app_config").select("value").eq("key", "notify_settings").maybeSingle(); _notifyCfg = data?.value || {}; }
  catch { _notifyCfg = {}; }
  return _notifyCfg;
}
export async function getNotifySettings() {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "notify_settings").maybeSingle();
  if (error) throw error;
  return (data?.value && typeof data.value === "object") ? data.value : null;
}
// LINE auto-reply config (welcome + after-hours), stored in app_config. null if unset.
export async function getAutoReply() {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "autoreply").maybeSingle();
  if (error) throw error;
  return (data?.value && typeof data.value === "object") ? data.value : null;
}
export async function saveAutoReply(cfg) {
  const { error } = await supabase.from("app_config").upsert({ key: "autoreply", value: cfg || {} }, { onConflict: "key" });
  if (error) throw error;
}
export async function saveNotifySettings(cfg) {
  _notifyCfg = cfg || {};
  const { error } = await supabase.from("app_config").upsert({ key: "notify_settings", value: cfg || {} }, { onConflict: "key" });
  if (error) throw error;
}
// create notifications (+ optional push) for recipients, minus the actor, respecting per-role on/off. Never throws.
export async function notify(recipientIds, { category, title, body, url, ref_type, ref_no, push = true }) {
  try {
    const uid = await _uid();
    const ids = [...new Set((recipientIds || []).filter((id) => id && id !== uid))];
    if (!ids.length) return;
    const { data: profs } = await supabase.from("profiles").select("id,role").in("id", ids);
    const settings = await _notifySettings();
    const allowed = (profs || []).filter((p) => { const s = settings[p.role]; return !s || s[category] !== false; }).map((p) => p.id);
    if (!allowed.length) return;
    await supabase.from("notifications").insert(allowed.map((id) => ({ user_id: id, category, title, body: body || null, url: url || null, ref_type: ref_type || null, ref_no: ref_no || null, actor: uid })));
    if (push) {
      const { data: { session } } = await supabase.auth.getSession();
      // กดแจ้งเตือนบนมือถือแล้วเด้งเข้าเมนูที่เกี่ยวเลย (hash deep-link เช่น /#expenses) — เหมือน LINE กดแล้วเข้าห้องแชต
      const pushUrl = url ? (String(url).startsWith("/") ? url : "/#" + url + (ref_no ? "/" + encodeURIComponent(ref_no) : "")) : "/";
      if (session) fetch("/api/push-send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ userIds: allowed, title, body: (body || "").slice(0, 180), url: pushUrl }) }).catch(() => {});
    }
  } catch (_) { /* notifications must never break the underlying action */ }
}
export async function listNotifications(limit = 40) {
  const uid = await _uid();
  const { data, error } = await supabase.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error; return data || [];
}
export async function countUnreadNotifications() {
  const uid = await _uid();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid).is("read_at", null);
  if (error) throw error; return count || 0;
}
export async function markNotificationRead(id) {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function markAllNotificationsRead() {
  const uid = await _uid();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
  if (error) throw error;
}
// unread notification counts per menu (grouped by url = module id) → sidebar badges per menu
export async function unreadByModule() {
  const uid = await _uid();
  const { data, error } = await supabase.from("notifications").select("url").eq("user_id", uid).is("read_at", null).not("url", "is", null).order("id").limit(1000);   // limit = เพดานพอดี แต่ป้ายนับพลาดไม่กระทบเงิน จึงยอมได้ ขอแค่ผลคงที่
  if (error) throw error;
  const m = {}; (data || []).forEach((n) => { if (n.url) m[n.url] = (m[n.url] || 0) + 1; });
  return m;
}
// mark every unread notification for one menu read (when the user opens it)
export async function markModuleRead(moduleId) {
  const uid = await _uid();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).eq("url", moduleId).is("read_at", null);
  if (error) throw error;
}

// ---------- TASK BOARD (กระดานสั่งงาน) ----------
// แถบเตือนงานค้าง — เอาเฉพาะงานของฉันที่ยังไม่จบ กรองที่เซิร์ฟเวอร์
// เดิมเรียก listTasks() ซึ่งลากงานทั้งบริษัท + คอมเมนต์ + โปรไฟล์ + ลูกค้า มากรองในเบราว์เซอร์ทุก 3 นาที ทุกเครื่อง
export async function listMyTasks(myId) {
  if (!myId) return [];
  const { data, error } = await supabase.from("tasks")
    .select("id,title,status,due_date,assigner")
    .eq("assignee", myId).in("status", ["todo", "doing"])
    .order("due_date", { ascending: true, nullsFirst: false }).order("id").limit(200);
  if (error) throw error;
  return data || [];
}
export async function listTasks() {
  const [t, profs, cc, cu] = await Promise.all([
    _allRows((f, t) => supabase.from("tasks").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("profiles").select("id,name,email", { count: "exact" }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("task_comments").select("task_id", { count: "exact" }).order("id").range(f, t)),
    _allRows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
  ]);
  // _allRows คืนแค่ { data } — ถ้ายังเช็ค t.error ต่อไปจะกลืน error ตลอดกาล (_fetchAll โยนออกมาเองอยู่แล้ว)
  const nm = Object.fromEntries((profs.data || []).map((p) => [p.id, p.name || p.email]));
  const cnm = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const cnt = {}; (cc.data || []).forEach((c) => { cnt[c.task_id] = (cnt[c.task_id] || 0) + 1; });
  return (t.data || []).map((x) => ({ ...x, assignerName: nm[x.assigner] || "—", assigneeName: nm[x.assignee] || "—", customerName: x.customer_id ? (cnm[x.customer_id] || null) : null, commentCount: cnt[x.id] || 0 }));
}
export async function saveTask(t) {
  const uid = await _uid();
  const me = await _meSafe();   // ชื่อคนสั่ง → ใส่ในแจ้งเตือน (ผู้รับจะรู้ว่าใครสั่ง)
  const row = {
    title: t.title?.trim(), detail: t.detail?.trim() || null,
    assignee: t.assignee || null, priority: t.priority || "normal",
    status: t.status || "todo", due_date: t.due_date || null, customer_id: t.customer_id || null,
    attachments: t.attachments || [], updated_at: new Date().toISOString(),
  };
  if (t.id) { const { error } = await supabase.from("tasks").update(row).eq("id", t.id); if (error) throw error;
    if (row.assignee) notify([row.assignee], { category: "task", title: `📌 ${me?.name || "หัวหน้า"} อัปเดตงาน: ${row.title}`, body: row.detail || "", url: "tasks", ref_type: "task", ref_no: t.id });
    return t.id; }
  row.assigner = uid;
  const { data, error } = await supabase.from("tasks").insert(row).select("id").single();
  if (error) throw error;
  if (row.assignee) notify([row.assignee], { category: "task", title: `📌 ${me?.name || "หัวหน้า"} มอบงานให้คุณ: ${row.title}`, body: `${row.detail ? row.detail + " · " : ""}${row.due_date ? "กำหนด " + row.due_date : ""}`.trim().replace(/ · $/, "") || "", url: "tasks", ref_type: "task", ref_no: data.id });
  return data.id;
}
export async function setTaskStatus(id, status) {
  const { error } = await supabase.from("tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  const ST = { todo: "รอเริ่ม", doing: "กำลังทำ", done: "เสร็จ", cancelled: "ยกเลิก" };
  const { data: t } = await supabase.from("tasks").select("title,assigner,assignee").eq("id", id).maybeSingle();
  if (t) notify([t.assigner, t.assignee], { category: "task", title: `🔄 งาน "${t.title}" → ${ST[status] || status}`, url: "tasks", ref_type: "task", ref_no: id });
}
export async function deleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
export async function listTaskComments(taskId) {
  const [c, profs] = await Promise.all([
    supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true }),
    supabase.from("profiles").select("id,name,email"),
  ]);
  if (c.error) throw c.error;
  const nm = Object.fromEntries((profs.data || []).map((p) => [p.id, p.name || p.email]));
  return (c.data || []).map((x) => ({ ...x, authorName: nm[x.author] || "—" }));
}
export async function addTaskComment(taskId, body, attachments) {
  const uid = await _uid();
  const { error } = await supabase.from("task_comments").insert({ task_id: taskId, author: uid, body: body?.trim() || null, attachments: attachments || [] });
  if (error) throw error;
  const { data: t } = await supabase.from("tasks").select("title,assigner,assignee").eq("id", taskId).maybeSingle();
  if (t) notify([t.assigner, t.assignee], { category: "task", title: `💬 คอมเมนต์ในงาน: ${t.title}`, body: (body || "[ไฟล์แนบ]").slice(0, 120), url: "tasks", ref_type: "task", ref_no: taskId });
}
export async function deleteTaskComment(id) {
  const { error } = await supabase.from("task_comments").delete().eq("id", id);
  if (error) throw error;
}
export async function uploadTaskFile(file) {
  file = await downscaleImage(file);
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `tasks/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// ---------- EXPENSES & ACCOUNTS (เบิกจ่าย + กระเป๋าเงิน) ----------
export async function listAccounts() {
  const [a, e] = await Promise.all([
    supabase.from("accounts").select("*").order("sort"),
    // ยอดคงเหลือทุกบัญชีคิดจากตารางนี้ — โดนเพดาน 1000 แถวเมื่อไหร่ยอดผิดเงียบ ๆ ทั้งระบบ
    _fetchAll((f, t) => supabase.from("account_entries").select("account_id,direction,amount", { count: "exact" }).order("id").range(f, t)).then((rows) => ({ data: rows })),
  ]);
  if (a.error) throw a.error;
  const bal = {}; (e.data || []).forEach((x) => { bal[x.account_id] = (bal[x.account_id] || 0) + (x.direction === "in" ? 1 : -1) * (Number(x.amount) || 0); });
  return (a.data || []).map((ac) => ({ ...ac, balance: Math.round(((Number(ac.opening_balance) || 0) + (bal[ac.id] || 0)) * 100) / 100 }));
}
// set an account's opening/brought-forward balance (ยอดยกมาตั้งต้น) — office only (acc_rw RLS)
export async function setAccountOpening(accountId, amount) {
  const { error } = await supabase.from("accounts").update({ opening_balance: Number(amount) || 0 }).eq("id", accountId);
  if (error) throw error;
}
export async function listAccountEntries({ accountId, from, to } = {}) {
  // .limit(2000) เดิมโดน Supabase ตัดที่ 1000/request อยู่ดี — แถวเก่าสุดหายก่อน ทำยอดยกมาต้นเดือน/กระทบแบงค์เพี้ยน
  return _fetchAll((f, t) => {
    let q = supabase.from("account_entries").select("*", { count: "exact" }).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
    if (accountId) q = q.eq("account_id", accountId);
    if (from) q = q.gte("entry_date", from);
    if (to) q = q.lte("entry_date", to);
    return q.range(f, t);
  });
}
// expense categories (หมวดค่าใช้จ่าย) — for expense requests + manual ledger lines, drives future analysis
export async function listExpenseCategories() {
  const { data, error } = await supabase.from("expense_categories").select("name,sort,active").order("sort").order("name");
  if (error) throw error;
  return (data || []).filter((c) => c.active !== false).map((c) => c.name);
}
export async function addExpenseCategory(name) {
  const nm = (name || "").trim(); if (!nm) throw new Error("ใส่ชื่อหมวด");
  const uid = await _uid();
  const { error } = await supabase.from("expense_categories").insert({ name: nm, created_by: uid });
  if (error && !/duplicate|unique/i.test(error.message || "")) throw error; // already exists → just use it
  return nm;
}
// manual bank-account movement (ฝาก/ถอน/ค่าธรรมเนียม/ดอกเบี้ย) — เพื่อให้ยอดในระบบตรง statement, กระทบแบงค์ได้
export async function addAccountEntry({ accountId, direction, amount, note, entry_date, kind, category }) {
  const uid = await _uid();
  if (!accountId) throw new Error("เลือกบัญชี");
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error("จำนวนเงินต้องมากกว่า 0");
  if (direction !== "in" && direction !== "out") throw new Error("เลือกเงินเข้า/ออก");
  const payload = {
    account_id: accountId, direction, amount: amt, kind: kind || "manual",
    note: note?.trim() || (direction === "in" ? "เงินเข้า/ฝาก" : "เงินออก/ถอน"),
    entry_date: entry_date || new Date().toISOString().slice(0, 10), created_by: uid,
  };
  if (category) payload.category = category;
  let { error } = await supabase.from("account_entries").insert(payload);
  if (error && /category|column|PGRST204/i.test(error.message || "") && payload.category !== undefined) { delete payload.category; ({ error } = await supabase.from("account_entries").insert(payload)); }
  if (error) throw error;
}
// แถวที่กระทบแบงค์ (✓ reconciled) แล้ว ห้ามแก้/ลบ — ไม่งั้นยอดที่เคยตรงกับ statement เพี้ยนโดยธงยังติดอยู่
async function _entryReconciledGuard(id) {
  try {
    const { data } = await supabase.from("account_entries").select("reconciled").eq("id", id).maybeSingle();
    if (data?.reconciled) throw new Error("รายการนี้กระทบแบงค์ (✓) แล้ว — ปลดเครื่องหมายกระทบก่อนแก้/ลบ");
  } catch (e) { if (/กระทบแบงค์/.test(e.message || "")) throw e; /* pre-089 ไม่มีคอลัมน์ — ผ่านได้ */ }
}
export async function updateAccountEntry(id, { amount, note, entry_date, direction } = {}) {
  await _entryReconciledGuard(id);
  const patch = {};
  if (amount != null) patch.amount = Number(amount) || 0;
  if (note !== undefined) patch.note = note?.trim() || null;
  if (entry_date) patch.entry_date = entry_date;
  if (direction) patch.direction = direction;
  const { error } = await supabase.from("account_entries").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteAccountEntry(id) {
  await _entryReconciledGuard(id);
  const { error } = await supabase.from("account_entries").delete().eq("id", id);
  if (error) throw error;
}
// mark one or many ledger lines as reconciled with the bank statement (needs migration 089)
export async function setEntriesReconciled(ids, reconciled) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  const { error } = await supabase.from("account_entries")
    .update({ reconciled: !!reconciled, reconciled_at: reconciled ? new Date().toISOString() : null })
    .in("id", list);
  if (error) throw error;
}
// pull customer payments (paid receipts) into the bank-account ledger for reconciliation.
// routes by VAT: vat_amt>0 → บัญชีธนาคาร(VAT), else → บัญชีธนาคาร(ไม่ VAT). Cash receipts are skipped
// (not a bank deposit). Amount = net (after WHT) — the sum that actually lands in the bank.
// idempotent (kind='receipt', ref_id=receipt_no): inserts new, updates unreconciled, removes stale;
// NEVER touches lines the user already reconciled (reconciled=true). Needs migration 089 for the flag.
export async function syncBankReceipts() {
  const uid = await _uid();
  const today = new Date().toISOString().slice(0, 10);
  // receipts/account_entries ต้องอ่าน "ครบทุกแถว" — sync นี้ลบรายการที่ไม่อยู่ใน desired ทิ้ง ถ้าอ่านโดนเพดาน 1000 แถว = ลบเงินฝากจริง/insert ซ้ำ
  const [accRes, rcRes, cuRes] = await Promise.all([
    supabase.from("accounts").select("id,code"),
    _fetchAll((f, t) => supabase.from("receipts").select("receipt_no,issue_date,vat_amt,wht_amt,net,total,status,payment_method,customer_id", { count: "exact" }).order("receipt_no").range(f, t)).then((rows) => ({ data: rows })),
    _fetchAll((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)).then((rows) => ({ data: rows })),
  ]);
  if (accRes.error) throw accRes.error;
  const accByCode = Object.fromEntries((accRes.data || []).map((a) => [a.code, a.id]));
  const vatAcc = accByCode.vat, novatAcc = accByCode.novat, tradeAcc = accByCode.trade;
  if (!vatAcc || !novatAcc) return { added: 0, updated: 0, removed: 0 };
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const TRADE_METHODS = ["Trade Account", "Trade Baht"];   // Trade Baht = ช่องทางเดียวกัน (label เก่า/ใหม่)

  // existing receipt-sourced entries — resilient to a missing `reconciled` column (pre-089) · _fetchAll กันแถวเกินพันแล้ว insert ซ้ำ
  let ex;
  try { ex = { data: await _fetchAll((f, t) => supabase.from("account_entries").select("id,ref_id,reconciled,account_id,amount,entry_date", { count: "exact" }).eq("ref_type", "receipt").order("id").range(f, t)) }; }
  catch (e) {
    if (!/reconciled|column|PGRST/i.test(e.message || "")) throw e;
    ex = { data: await _fetchAll((f, t) => supabase.from("account_entries").select("id,ref_id,account_id,amount,entry_date", { count: "exact" }).eq("ref_type", "receipt").order("id").range(f, t)) };
  }
  const existing = {}; (ex.data || []).forEach((e) => { existing[e.ref_id] = e; });

  const desired = {};
  (rcRes.data || []).forEach((r) => {
    if (r.status !== "paid") return;
    if (r.payment_method === "เงินสด") return;                 // cash → not a bank deposit
    // เงินเข้าธนาคารจริง = ยอดหลังหัก ณ ที่จ่าย — ใบเก่าที่ net ว่างต้อง fallback เป็น total − wht_amt (สูตรเดียวกับรายงานภาษี)
    const amt = Math.round((Number(r.net) || ((Number(r.total) || 0) - (Number(r.wht_amt) || 0))) * 100) / 100;
    if (amt <= 0) return;
    // Trade Baht (จ่ายผ่าน Trade Account) → บัญชี Trade เดียว (ไม่แยก VAT); อื่น ๆ → ธนาคาร VAT/ไม่ VAT ตามบิล
    const byVat = (Number(r.vat_amt) || 0) > 0 ? vatAcc : novatAcc;
    const account_id = TRADE_METHODS.includes(r.payment_method) ? (tradeAcc || byVat) : byVat;
    desired[r.receipt_no] = { account_id, amount: amt, entry_date: r.issue_date || today,
      note: `รับเงินลูกค้า${r.customer_id && custName[r.customer_id] ? " · " + custName[r.customer_id] : ""} · ${r.receipt_no}` };
  });

  const inserts = [], updates = [], removeIds = [];
  Object.entries(desired).forEach(([rno, d]) => {
    const e = existing[rno];
    if (!e) inserts.push({ account_id: d.account_id, direction: "in", amount: d.amount, kind: "receipt", ref_type: "receipt", ref_id: rno, note: d.note, entry_date: d.entry_date, created_by: uid });
    else if (!e.reconciled && (Math.abs((Number(e.amount) || 0) - d.amount) > 0.005 || e.entry_date !== d.entry_date || e.account_id !== d.account_id))
      updates.push({ id: e.id, account_id: d.account_id, amount: d.amount, entry_date: d.entry_date });
  });
  (ex.data || []).forEach((e) => { if (!desired[e.ref_id] && !e.reconciled) removeIds.push(e.id); });

  if (inserts.length) { const { error } = await supabase.from("account_entries").insert(inserts); if (error) throw error; }
  for (const u of updates) await supabase.from("account_entries").update({ account_id: u.account_id, amount: u.amount, entry_date: u.entry_date }).eq("id", u.id);
  for (let i = 0; i < removeIds.length; i += 100) await supabase.from("account_entries").delete().in("id", removeIds.slice(i, i + 100));
  return { added: inserts.length, updated: updates.length, removed: removeIds.length };
}
export async function transferFunds({ fromId, toId, amount, note, date }) {
  const uid = await _uid(); const amt = Number(amount) || 0;
  if (!fromId || !toId || fromId === toId) throw new Error("เลือกบัญชีต้นทาง/ปลายทางให้ถูกต้อง");
  if (amt <= 0) throw new Error("จำนวนเงินต้องมากกว่า 0");
  const day = date || new Date().toISOString().slice(0, 10);
  const tref = Math.random().toString(36).slice(2, 10);
  const { error } = await supabase.from("account_entries").insert([
    { account_id: fromId, direction: "out", amount: amt, kind: "transfer", ref_type: "transfer", ref_id: tref, note: note || "โอนระหว่างบัญชี", entry_date: day, created_by: uid },
    { account_id: toId, direction: "in", amount: amt, kind: "transfer", ref_type: "transfer", ref_id: tref, note: note || "โอนระหว่างบัญชี", entry_date: day, created_by: uid },
  ]);
  if (error) throw error;
}
// list transfers (paired out/in rows) collapsed into one record each — for the edit/delete history
export async function listTransfers() {
  const { data, error } = await supabase.from("account_entries").select("*").eq("ref_type", "transfer").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const byRef = {};
  (data || []).forEach((r) => {
    const t = byRef[r.ref_id] || (byRef[r.ref_id] = { ref_id: r.ref_id, amount: Number(r.amount) || 0, note: r.note || "", entry_date: r.entry_date, created_at: r.created_at, fromId: null, toId: null });
    if (r.direction === "out") t.fromId = r.account_id; else t.toId = r.account_id;
  });
  return Object.values(byRef).filter((t) => t.fromId && t.toId).sort((a, b) => (b.entry_date || "").localeCompare(a.entry_date || "") || (b.created_at || "").localeCompare(a.created_at || ""));
}
// fix a mis-recorded transfer: update both legs (accounts/amount/note/date) by ref_id
// รายการโอนที่ขาใดขาหนึ่งกระทบแบงค์แล้ว ห้ามแก้/ลบทั้งคู่
async function _transferReconciled(ref_id) {
  try {
    const { data } = await supabase.from("account_entries").select("reconciled").eq("ref_id", ref_id).eq("ref_type", "transfer");
    return (data || []).some((x) => x.reconciled);
  } catch (_) { return false; /* pre-089 */ }
}
export async function updateTransfer(ref_id, { fromId, toId, amount, note, entry_date }) {
  if (await _transferReconciled(ref_id)) throw new Error("รายการโอนนี้กระทบแบงค์ (✓) แล้ว — ปลดเครื่องหมายกระทบทั้ง 2 ขาก่อนแก้");
  const amt = Number(amount) || 0;
  if (!fromId || !toId || fromId === toId) throw new Error("เลือกบัญชีต้นทาง/ปลายทางให้ถูกต้อง");
  if (amt <= 0) throw new Error("จำนวนเงินต้องมากกว่า 0");
  const common = { amount: amt, note: note || "โอนระหว่างบัญชี" };
  if (entry_date) common.entry_date = entry_date;
  const e1 = (await supabase.from("account_entries").update({ ...common, account_id: fromId }).eq("ref_id", ref_id).eq("ref_type", "transfer").eq("direction", "out")).error;
  if (e1) throw e1;
  const e2 = (await supabase.from("account_entries").update({ ...common, account_id: toId }).eq("ref_id", ref_id).eq("ref_type", "transfer").eq("direction", "in")).error;
  if (e2) throw e2;
}
export async function deleteTransfer(ref_id) {
  if (await _transferReconciled(ref_id)) throw new Error("รายการโอนนี้กระทบแบงค์ (✓) แล้ว — ปลดเครื่องหมายกระทบทั้ง 2 ขาก่อนลบ");
  const { error } = await supabase.from("account_entries").delete().eq("ref_id", ref_id).eq("ref_type", "transfer");
  if (error) throw error;
}
export async function uploadExpenseFile(file) {
  file = await downscaleImage(file);
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `expenses/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}
export async function submitExpense(e) {
  const uid = await _uid();
  const { error } = await supabase.from("expense_requests").insert({
    requester: uid, job_no: e.job_no || null, category: e.category || null, title: e.title?.trim(), amount: Number(e.amount) || 0,
    note: e.note?.trim() || null, attachments: e.attachments || [], created_by: uid,
  });
  if (error) throw error;
  const me = await _meSafe();
  notify(await _usersByRole(["admin", "finance", "exec", "hr"]), { category: "hr", title: `🧾 ${me?.name || "พนักงาน"} ขอเบิกค่าใช้จ่าย ${Number(e.amount) || 0} บาท`, body: e.title || "", url: "expenses", ref_type: "expense" });
}
// เติม เลขงาน · ชื่องาน · ชื่อลูกค้า ให้ใบเบิกจ่าย
//  - ใบเบิกที่มี job_no ตรง ๆ (ค่าใช้จ่ายเข้างาน) → จากใบงานนั้น
//  - ใบเบิกค่าสินค้า PO (job_no ว่าง) → โยงผ่าน PO.expense_id → ใบเสนอราคา → ลูกค้า + ใบงาน
async function _enrichExpenseJobs(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((x) => x.id).filter(Boolean);
  let poByExp = {};   // ใบเบิก 1 ใบผูกได้หลาย PO (จ่ายเจ้าหนี้รวมหลายใบ) — เก็บเป็น array
  const poTotals = {};
  try {
    // ⚠️ ต้องแบ่งก้อน — uuid ยาว ~37 ตัว ถ้าใบเบิกเกิน ~180 ใบ URL จะยาวเกินจน 400 แล้ว catch ด้านล่างกลืน error
    // ผลคือหน้าเบิกจ่ายดูปกติแต่ลิงก์ PO/ชื่อลูกค้าหายไปทั้งหน้า (พังเงียบ)
    const data = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: chunk, error } = await supabase.from("purchase_orders").select("po_no,quote_no,expense_id,vat,delivery_date,delivery_method").in("expense_id", ids.slice(i, i + 200));
      if (error) throw error;
      data.push(...(chunk || []));
    }
    data.forEach((p) => { if (p.expense_id) (poByExp[p.expense_id] = poByExp[p.expense_id] || []).push(p); });
    // ยอดต่อใบ (รวม VAT) — ไว้กางดูรายการ PO ในใบเบิกรวมหลายใบ
    const linkedPoNos = Object.values(poByExp).flat().map((p) => p.po_no);
    // แบ่งก้อนด้วยเหตุผลเดียวกับด้านบน — PO ที่ผูกอยู่ก็เกิน 180 ใบได้เมื่อจ่ายเจ้าหนี้รวมหลายใบสะสม
    for (let i = 0; i < linkedPoNos.length; i += 200) {
      const { data: items } = await supabase.from("po_items").select("po_no,qty,price").in("po_no", linkedPoNos.slice(i, i + 200));
      (items || []).forEach((it) => { poTotals[it.po_no] = (poTotals[it.po_no] || 0) + (Number(it.qty) || 0) * (Number(it.price) || 0); });
    }
  } catch (_) { /* pre-100: ไม่มี expense_id — ข้าม */ }
  // ตารางอ้างอิง 3 ตัวนี้เคยอ่านแบบไม่กันเพดาน 1000 แถว — พอใบงาน/ใบเสนอ/ลูกค้าโตเกินนั้น
  // หน้าเบิกจ่ายจะขึ้นชื่องาน/ชื่อลูกค้าเป็นช่องว่าง เหมือนใบเบิกไม่ได้ผูกงานไว้ (พังเงียบ)
  const [joRes, quRes, cuRes] = await Promise.all([
    _allRows((f, t) => supabase.from("job_orders").select("job_no,quote_no,customer_id,title,status", { count: "exact" }).order("job_no").range(f, t)),
    _allRows((f, t) => supabase.from("quotations").select("quote_no,customer_id,title", { count: "exact" }).order("quote_no").range(f, t)),
    _allRows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
  ]);
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const jobByNo = Object.fromEntries((joRes.data || []).map((j) => [j.job_no, j]));
  const quoteInfo = Object.fromEntries((quRes.data || []).map((x) => [x.quote_no, x]));
  const jobByQuote = {}; (joRes.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  return rows.map((x) => {
    let job = x.job_no ? jobByNo[x.job_no] : null;
    let quoteNo = job?.quote_no || null;
    const poList = poByExp[x.id] || [];
    const po = poList[0] || null;
    if (!job && po?.quote_no) { quoteNo = po.quote_no; job = jobByQuote[po.quote_no] || null; }
    const qi = quoteNo ? quoteInfo[quoteNo] : null;
    const custId = job?.customer_id ?? qi?.customer_id ?? null;
    // รายละเอียดต่อ PO (ยอดรวม VAT + ลูกค้าจากใบเสนอที่ผูก) — ใบเบิกรวมหลายใบใช้กางดูรายการ
    const poDetails = poList.map((p) => ({
      po_no: p.po_no, quote_no: p.quote_no || null,
      total: Math.round((poTotals[p.po_no] || 0) * (p.vat ? 1.07 : 1) * 100) / 100,
      customerName: p.quote_no ? (custName[quoteInfo[p.quote_no]?.customer_id] ?? null) : null,
      delivery_date: p.delivery_date || null, delivery_method: p.delivery_method || null,   // วันรับ/ส่งของ (เหมือนใน PO)
    }));
    return { ...x, jobNo: job?.job_no || null, jobTitle: job?.title || qi?.title || null,
      customerName: custId != null ? custName[custId] || null : null, poNo: po?.po_no || null, poNos: poList.map((p) => p.po_no), poDetails, quoteNo };
  });
}
export async function listMyExpenses() {
  const uid = await _uid();
  const data = await _fetchAll((f, t) => supabase.from("expense_requests").select("*", { count: "exact" }).eq("requester", uid).order("created_at", { ascending: false }).order("id").range(f, t));
  return _enrichExpenseJobs(data || []);
}
export function listExpenses(status) { return _cached("listExpenses:" + String(status), () => _loadExpenses(status), _SHORT_TTL); }
async function _loadExpenses(status) {
  // กันเพดาน 1000 แถว — ทุกการจ่าย PO สร้างใบเบิก 1 ใบ ตารางโตเร็ว · PayVendorModal พึ่ง list นี้ตัดสินว่าใบเบิกเดิม "ถูกลบ" หรือยัง
  const build = (f, t) => { let q = supabase.from("expense_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t); if (status) q = q.eq("status", status); return q; };
  const [exRows, profs] = await Promise.all([_fetchAll(build), supabase.from("profiles").select("id,name,email")]);
  const ex = { data: exRows };
  const nm = Object.fromEntries((profs.data || []).map((p) => [p.id, p.name || p.email]));
  const enriched = await _enrichExpenseJobs(ex.data || []);
  return enriched.map((x) => ({ ...x, requesterName: nm[x.requester] || "—", approverName: x.approver ? (nm[x.approver] || "—") : null }));
}
export async function decideExpense(id, status, note) {
  const uid = await _uid();
  const { data: ex0, error: e00 } = await supabase.from("expense_requests").select("requester,status,paid_amount").eq("id", id).maybeSingle();
  if (e00) throw e00;
  if (!ex0) throw new Error("ไม่พบใบเบิกนี้ (อาจถูกจัดการไปแล้ว)");
  // จ่ายบางส่วนไปแล้ว ห้ามถอยสถานะ (ไม่อนุมัติ/คืนรออนุมัติ) — ไม่งั้นเส้นเงินจ่ายจริงหาย/ยอดค้างจ่ายต่อไม่ได้ และ PO กลับเป็นหนี้เต็มก้อน
  if ((status === "rejected" || status === "pending") && Number(ex0.paid_amount) > 0.009)
    throw new Error(`เปลี่ยนสถานะกลับไม่ได้ — ใบนี้จ่ายไปแล้ว ${Number(ex0.paid_amount).toLocaleString("en-US")} บาท (หน้าจออาจค้าง — รีเฟรชก่อน)`);
  // กันอนุมัติใบเบิกของตัวเอง — ยกเว้นธุรการ/ผู้บริหาร (แนวเดียวกับล็อกอนุมัติใบลาฝั่ง HR)
  if (status === "approved" && ex0.requester === uid) {
    const { data: me } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (!["admin", "exec"].includes(me?.role)) throw new Error("อนุมัติใบเบิกของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารเป็นคนอนุมัติ");
  }
  const { error } = await supabase.from("expense_requests").update({ status, approver: uid, decided_at: new Date().toISOString(), decide_note: note || null }).eq("id", id);
  if (error) throw error;
  // คำขอชำระใบสั่งซื้อถูกปฏิเสธ → ปลดลิงก์ให้ PO กลับเป็น "ยังไม่จ่าย" (ส่งขอใหม่ได้)
  if (status === "rejected") { try { await supabase.from("purchase_orders").update({ expense_id: null }).eq("expense_id", id); } catch (_) {} }
  const { data: ex } = await supabase.from("expense_requests").select("requester,title").eq("id", id).maybeSingle();
  const lbl = { approved: "อนุมัติ ✅", rejected: "ไม่อนุมัติ ❌", pending: "กลับเป็นรออนุมัติ" }[status] || status;
  if (ex) notify([ex.requester], { category: "hr", title: `🧾 คำขอเบิก "${ex.title}" : ${lbl}`, body: note || "", url: "expenses", ref_type: "expense" });
}
// แนบใบเสร็จย้อนหลัง (เบิกเงินไปจ่ายก่อน ใบเสร็จตามมาทีหลัง) — ผ่าน RPC มิเกรชัน 133:
// ผู้ขอเบิกเติมรูปใน attachments ของรายการตัวเองได้อย่างเดียว แก้ยอด/สถานะไม่ได้
export async function attachExpenseReceipt(id, urls) {
  const { error } = await supabase.rpc("expense_attach_receipt", { p_id: id, p_urls: urls });
  if (error) throw error;
  // บอกผู้อนุมัติว่าใบเสร็จมาแล้ว (พลาดได้ไม่เป็นไร — รูปแนบสำเร็จไปแล้ว)
  try {
    const { data: ex } = await supabase.from("expense_requests").select("title,approver").eq("id", id).maybeSingle();
    if (ex?.approver) notify([ex.approver], { category: "hr", title: `📎 แนบใบเสร็จแล้ว: "${ex.title}"`, body: `เพิ่มรูปใบเสร็จ ${urls.length} รูป`, url: "expenses", ref_type: "expense" });
  } catch (_) {}
}
// จ่ายเงินเบิก — รองรับ "แบ่งจ่าย": ส่ง amount = งวดนี้ (ไม่ส่ง = จ่ายยอดคงเหลือทั้งหมด)
//  จ่ายครบ → status=paid + ประทับ PO/กระแสเงินสด · จ่ายบางส่วน → paid_amount เพิ่ม สถานะยัง approved
export async function payExpense(id, { accountId, proof, payDate, amount, expectedPayDate } = {}) {
  const uid = await _uid();
  const { data: ex, error: e0 } = await supabase.from("expense_requests").select("*").eq("id", id).single();
  if (e0) throw e0;
  if (ex.status === "paid") throw new Error("จ่ายเงินครบแล้ว");
  // จ่ายได้เฉพาะใบที่ผ่านการอนุมัติ — ใบ pending/rejected จ่ายแล้วเงินออกจากบัญชีแต่กระแสเงินสดมองไม่เห็น (sync ข้าม)
  if (ex.status !== "approved") throw new Error(ex.status === "rejected" ? "ใบนี้ถูกปฏิเสธแล้ว — จ่ายไม่ได้" : "ใบนี้ยังไม่ผ่านการอนุมัติ — อนุมัติก่อนจ่าย");
  const total = Math.round((Number(ex.amount) || 0) * 100) / 100;
  const already = Math.round((Number(ex.paid_amount) || 0) * 100) / 100;
  const remaining = Math.round((total - already) * 100) / 100;
  let payAmt = amount != null && amount !== "" ? Math.round((Number(amount) || 0) * 100) / 100 : remaining;
  if (payAmt <= 0) throw new Error("จำนวนเงินที่จ่ายต้องมากกว่า 0");
  if (payAmt > remaining + 0.005) throw new Error(`จ่ายเกินยอดคงเหลือ (${remaining.toLocaleString()} บาท)`);
  const newPaid = Math.round((already + payAmt) * 100) / 100;
  const fully = newPaid >= total - 0.005;
  const day = payDate || new Date().toISOString().slice(0, 10);

  const upd = { payment_proof: [...(ex.payment_proof || []), ...(proof || [])], paid_amount: newPaid, last_paid_at: day };
  if (expectedPayDate !== undefined) upd.expected_pay_date = expectedPayDate || null;   // วันคาดจ่ายยอดที่เหลือ
  if (fully) { upd.status = "paid"; upd.paid_from = accountId || null; upd.paid_at = new Date().toISOString(); }
  // optimistic lock: อัปเดตเฉพาะเมื่อ paid_amount ยังเท่าตอนที่อ่านมา — กัน 2 ธุรการกดจ่ายใบเดียวกันพร้อมกัน (เงินออก 2 เท่าแต่บันทึกครั้งเดียว)
  let uErr, uRows;
  {
    let q = supabase.from("expense_requests").update(upd).eq("id", id);
    q = ex.paid_amount == null ? q.is("paid_amount", null) : q.eq("paid_amount", ex.paid_amount);
    const r = await q.select("id");
    uErr = r.error; uRows = r.data;
  }
  // pre-111/112: ไม่มีคอลัมน์ paid_amount/last_paid_at/expected_pay_date → บังคับจ่ายเต็มจำนวน
  if (uErr && /paid_amount|last_paid_at|expected_pay_date/i.test(uErr.message || "")) {
    if (!fully) throw new Error("ยังไม่ได้รัน migration 111/112 — แบ่งจ่ายยังไม่พร้อม (จ่ายเต็มยอดก่อน)");
    delete upd.paid_amount; delete upd.last_paid_at; delete upd.expected_pay_date;
    const r2 = await supabase.from("expense_requests").update(upd).eq("id", id).select("id");
    uErr = r2.error; uRows = r2.data;
  }
  if (uErr) throw uErr;
  if (!uRows || !uRows.length) throw new Error("มีคนจ่ายใบนี้พร้อมกันจากอีกเครื่อง — รีเฟรชแล้วเช็คยอดก่อนจ่ายซ้ำ");

  // บันทึกฝั่งบัญชีธนาคาร (รายการเดินบัญชี) เฉพาะยอดงวดนี้
  const noteTxt = `เบิกจ่าย: ${ex.title}${!fully ? ` (งวด · เหลือ ${(remaining - payAmt).toLocaleString()})` : ""}${ex.job_no ? " · งาน " + ex.job_no : ""}`;
  if (accountId) {
    const aePayload = { account_id: accountId, direction: "out", amount: payAmt, kind: "expense", ref_type: "expense", ref_id: id, note: noteTxt, entry_date: day, created_by: uid };
    if (ex.category) aePayload.category = ex.category;
    let aeErr = (await supabase.from("account_entries").insert(aePayload)).error;
    if (aeErr && /category|column|PGRST204/i.test(aeErr.message || "") && aePayload.category !== undefined) { delete aePayload.category; aeErr = (await supabase.from("account_entries").insert(aePayload)).error; }
    if (aeErr) throw aeErr;
  }
  // ชำระใบสั่งซื้อ: ประทับ paid_at บน PO เมื่อจ่ายครบ (ใช้แสดงสถานะ PO — กระแสเงินสด PO ปิดไว้ ให้ใบเบิกคุมแทน)
  if (fully) { try { await supabase.from("purchase_orders").update({ paid_at: new Date(day + "T00:00:00").toISOString() }).eq("expense_id", id); } catch (_) {} }
  // กระแสเงินสด: ให้ syncCashEntriesFromDocs สร้าง/อัปเดตเส้น จ่ายจริง (expense_paid) + ประมาณการยอดค้าง (expense_due) เอง
  syncCashEntriesFromDocs().catch(() => {});
  notify([ex.requester], { category: "hr", title: `💸 ${fully ? "จ่ายเงินเบิกครบแล้ว" : "จ่ายเงินเบิกบางส่วน"} "${ex.title}" ${payAmt.toLocaleString()} บาท`, body: fully ? "แนบหลักฐานการจ่ายเรียบร้อย" : `คงเหลืออีก ${(remaining - payAmt).toLocaleString()} บาท`, url: "expenses", ref_type: "expense" });
}
// ยกเลิกการจ่ายเงินเบิก (ผู้บริหารเท่านั้น — gate ที่ UI) — คืนสถานะ "อนุมัติ · รอจ่าย" + ถอนรายการเงินออก
export async function unpayExpense(id, reason) {
  const { data: ex, error: e0 } = await supabase.from("expense_requests").select("*").eq("id", id).single();
  if (e0) throw e0;
  if (ex.status !== "paid" && !(Number(ex.paid_amount) > 0)) throw new Error("ใบนี้ยังไม่ได้จ่ายเงิน");
  // คืนใบกลับเป็น "อนุมัติ · รอจ่าย" + ล้างยอด/หลักฐานการจ่าย
  const upd = { status: "approved", paid_at: null, paid_from: null, paid_amount: 0, last_paid_at: null, payment_proof: [], expected_pay_date: null };
  let uErr = (await supabase.from("expense_requests").update(upd).eq("id", id)).error;
  if (uErr && /paid_amount|last_paid_at|expected_pay_date|payment_proof/i.test(uErr.message || "")) {
    uErr = (await supabase.from("expense_requests").update({ status: "approved", paid_at: null, paid_from: null }).eq("id", id)).error;   // pre-mig fallback
  }
  if (uErr) throw uErr;
  // ถอนรายการเดินบัญชี (เงินออก) ของการจ่ายใบนี้ · คืน PO ที่ผูกให้กลับเป็นยังไม่จ่าย
  try { await supabase.from("account_entries").delete().eq("ref_type", "expense").eq("ref_id", id); } catch (_) { /* ignore */ }
  try { await supabase.from("purchase_orders").update({ paid_at: null }).eq("expense_id", id); } catch (_) { /* ignore */ }
  await logAudit({ action: "cancel", target_type: "expense", target_no: "เบิก #" + id, reason: reason || null, snapshot: { paid_amount: ex.paid_amount, paid_at: ex.paid_at, paid_from: ex.paid_from } });
  syncCashEntriesFromDocs().catch(() => {});
  try { await notify([ex.requester], { category: "hr", title: `↩️ ยกเลิกการจ่ายเงินเบิก "${ex.title}"`, body: reason || "", url: "expenses", ref_type: "expense" }); } catch (_) { /* ignore */ }
}
// แก้ "วันคาดว่าจะจ่ายยอดค้าง" ของใบเบิก (ประมาณการในกระแสเงินสด) — แก้ได้ตลอด
export async function setExpenseExpectedDate(id, date) {
  const { error } = await supabase.from("expense_requests").update({ expected_pay_date: date || null }).eq("id", id);
  if (error) throw error;
  syncCashEntriesFromDocs().catch(() => {});
}
// approved/paid expense cost rolled up per job → adds to job cost in Profit
export async function jobExpenseCost() {
  // ต้องผ่าน _fetchAll — เดิม select ตรง ๆ โดนเพดาน 1000 แถว ใบเบิกของงานเก่าหลุดหายเงียบ
  // ผลคือต้นทุนงานต่ำกว่าจริง → กำไร/งานสูงเกินจริง โดยไม่มีอะไรฟ้องเลย
  const rows = await _fetchAll((f, t) =>
    supabase.from("expense_requests").select("job_no,amount,status", { count: "exact" })
      .not("job_no", "is", null).in("status", ["approved", "paid"]).order("id").range(f, t)   // ไม่มี order = แถวซ้ำ/หายระหว่างหน้า
  );
  const m = {}; (rows || []).forEach((x) => { if (x.job_no) m[x.job_no] = (m[x.job_no] || 0) + (Number(x.amount) || 0); });
  return m;
}
export async function updateProfile(id, fields) {
  const payload = { role: fields.role, name: fields.name || null, team: ["tech", "assistant"].includes(fields.role) ? (fields.team || null) : null };
  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  if (error) throw error;
}
// create a brand-new login account + set its profile (admin only).
// Uses a throwaway client so the admin's own session is untouched.
export async function createUser({ email, password, name, role, team }) {
  const tmp = createClient(_url, _anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await tmp.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("สร้างบัญชีไม่สำเร็จ (อาจต้องปิด Confirm email ใน Supabase)");
  const { error: e2 } = await supabase.from("profiles").upsert(
    { id: uid, email: email.trim(), name: name?.trim() || email.trim(), role: role || "tech", team: ["tech", "assistant"].includes(role) ? (team || null) : null },
    { onConflict: "id" }
  );
  if (e2) throw e2;
  return data.user;
}

// admin actions that need the service-role key → serverless function (guarded to admin/exec)
async function callAdminUser(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/admin-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { let m = "HTTP " + res.status; try { m = (await res.json()).error || m; } catch { /* ignore */ } throw new Error(m); }
  return res.json();
}
export const adminSetUserEmail = (userId, email) => callAdminUser({ action: "setEmail", userId, email });
export const adminSetUserPassword = (userId, password) => callAdminUser({ action: "setPassword", userId, password });
export const adminDeleteUser = (userId) => callAdminUser({ action: "delete", userId });

// ---------- LINE OA chat ----------
// ตั้งชนิดผู้ติดต่อ LINE (ลูกค้า ↔ ซัพพลายเออร์) + ผูกทะเบียนผู้ขาย — มิเกรชัน 138
export async function setLineContactKind(lineUserId, kind, supplierId = null) {
  const { error } = await supabase.from("line_contacts").update({ kind, supplier_id: supplierId }).eq("line_user_id", lineUserId);
  if (error) throw (error.code === "PGRST204" || /'kind'|supplier_id|schema cache/i.test(error.message || "")) ? new Error("ต้องรัน migration 138 ใน Supabase ก่อน") : error;
}
export async function listLineContacts() {
  const [c, cu, links] = await Promise.all([
    _allRows((f, t) => supabase.from("line_contacts").select("*", { count: "exact" }).order("last_message_at", { ascending: false, nullsFirst: false }).order("line_user_id").range(f, t)),
    _allRows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
    // เพดาน 1000 แถว: ตารางเชื่อมโตตามจำนวน "แชต × ลูกค้าที่ผูก" — เกินพันแล้วแชตบางห้องจะหายลูกค้าที่ผูกเพิ่มไว้
    // order ด้วย 2 คอลัมน์ที่เป็น primary key (mig 081) — แบ่งหน้าโดยไม่มี order ได้แถวซ้ำ/หายระหว่างหน้า
    _allRows((f, t) => supabase.from("line_contact_customers").select("line_user_id,customer_id", { count: "exact" }).order("line_user_id").order("customer_id").range(f, t)),  // many-to-many (mig 081)
  ]);
  if (c.error) throw c.error;
  const cn = Object.fromEntries((cu.data || []).map((x) => [x.id, x.name]));
  const byUid = {}; (links.data || []).forEach((l) => { (byUid[l.line_user_id] = byUid[l.line_user_id] || []).push(l.customer_id); });
  return (c.data || []).map((r) => {
    let ids = byUid[r.line_user_id] || [];
    if (r.customer_id && !ids.some((x) => String(x) === String(r.customer_id))) ids = [r.customer_id, ...ids]; // active not yet in join (legacy)
    return { ...r, display_name: r.custom_name || r.display_name, customerName: r.customer_id ? cn[r.customer_id] : null, custIds: ids };
  });
}
// link an ADDITIONAL customer to a LINE chat + make it the active one (drives the info panel)
export async function addLineCustomer(uid, customerId) {
  if (!customerId) return;
  await supabase.from("line_contact_customers").upsert({ line_user_id: uid, customer_id: customerId }, { onConflict: "line_user_id,customer_id" });
  const { error } = await supabase.from("line_contacts").update({ customer_id: customerId }).eq("line_user_id", uid);
  if (error) throw error;
}
// unlink one customer; if it was the active one, fall back to another linked customer (or none)
export async function removeLineCustomer(uid, customerId) {
  await supabase.from("line_contact_customers").delete().eq("line_user_id", uid).eq("customer_id", customerId);
  const { data: c } = await supabase.from("line_contacts").select("customer_id").eq("line_user_id", uid).maybeSingle();
  if (c && String(c.customer_id) === String(customerId)) {
    const { data: rest } = await supabase.from("line_contact_customers").select("customer_id").eq("line_user_id", uid).limit(1);
    await supabase.from("line_contacts").update({ customer_id: rest && rest[0] ? rest[0].customer_id : null }).eq("line_user_id", uid);
  }
}

// ⚠️ ห้ามโหลดทั้งห้องแบบเรียงเก่า→ใหม่ — พอห้องไหนเกินเพดาน 1000 แถว Supabase จะคืนแค่ 1000 แถวแรก
// = ข้อความเก่าสุด แล้ว "ข้อความใหม่หายทั้งห้อง" ลูกค้าทักมาเมื่อกี้ก็ไม่เห็น (บทเรียนเดียวกับแชตทีม)
// ⇒ ดึงใหม่→เก่าตามจำนวนที่กำหนด แล้วค่อยกลับลำดับตอนแสดง
export const CHAT_TAIL = 400;
export async function listLineMessages(uid, { limit = CHAT_TAIL, before } = {}) {
  let q = supabase.from("line_messages").select("*").eq("line_user_id", uid).order("created_at", { ascending: false }).limit(limit);
  if (before) q = q.lt("created_at", before);   // ไล่ดูย้อนหลังทีละหน้า (ปุ่ม "โหลดข้อความเก่ากว่านี้")
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).reverse();
}

// ค้นข้อความในแชตทุกห้อง (ไม่ใช่แค่บรรทัดล่าสุดที่โหลดมาแล้ว) — คืน "ห้องที่เจอ + ข้อความที่ตรง"
// ต้องค้นฝั่งเซิร์ฟเวอร์: ห้องหนึ่งเก็บได้เป็นหมื่นข้อความ แต่จอโหลดมาแค่ CHAT_TAIL ล่าสุด
export async function searchLineMessages(term, { limit = 300 } = {}) {
  const t = String(term || "").trim();
  if (t.length < 2) return {};                       // 1 ตัวอักษรจับได้เกือบทุกห้อง ไม่มีประโยชน์ + หนักฐานข้อมูล
  // ⚠️ ต้อง escape % _ \ ก่อนยัดเข้า ilike — ลูกค้าพิมพ์ "50%" แล้ว % กลายเป็น wildcard จับมาทั้งตาราง
  const esc = t.replace(/[\\%_]/g, (m) => "\\" + m);
  const { data, error } = await supabase.from("line_messages")
    .select("line_user_id,text,created_at,direction")
    .ilike("text", `%${esc}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  // เก็บข้อความล่าสุดที่ตรงของแต่ละห้อง (เรียงใหม่→เก่ามาแล้ว ตัวแรกที่เจอคือล่าสุด)
  const byRoom = {};
  (data || []).forEach((m) => { if (!byRoom[m.line_user_id]) byRoom[m.line_user_id] = m; });
  return byRoom;
}

export async function linkLineContact(uid, customerId) {
  const { error } = await supabase.from("line_contacts").update({ customer_id: customerId || null }).eq("line_user_id", uid);
  if (error) throw error;
}

export async function markLineRead(uid) {
  await supabase.from("line_contacts").update({ unread: 0 }).eq("line_user_id", uid);
}
// how many chats still have unread (waiting to be answered) — for the sidebar badge
export async function countUnreadChats() {
  const { count, error } = await supabase.from("line_contacts").select("line_user_id", { count: "exact", head: true }).gt("unread", 0);
  if (error) throw error;
  return count || 0;
}

// ===================== FACEBOOK MESSENGER (mirrors LINE shape; psid aliased to line_user_id) =====================
export async function listFbContacts() {
  const [c, cu] = await Promise.all([
    _allRows((f, t) => supabase.from("fb_contacts").select("*", { count: "exact" }).order("last_message_at", { ascending: false, nullsFirst: false }).order("psid").range(f, t)),
    _allRows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
  ]);
  if (c.error) throw c.error;
  const cn = Object.fromEntries((cu.data || []).map((x) => [x.id, x.name]));
  // line_user_id alias so the existing inbox UI can render FB contacts unchanged
  return (c.data || []).map((r) => ({ ...r, line_user_id: r.psid, channel: "fb", display_name: r.custom_name || r.display_name, customerName: r.customer_id ? cn[r.customer_id] : null }));
}
// ใหม่→เก่า + limit แล้วกลับลำดับ ด้วยเหตุผลเดียวกับ listLineMessages (ไม่งั้นข้อความใหม่หายทั้งห้อง)
export async function listFbMessages(psid, { limit = CHAT_TAIL, before } = {}) {
  let q = supabase.from("fb_messages").select("*").eq("psid", psid).order("created_at", { ascending: false }).limit(limit);
  if (before) q = q.lt("created_at", before);   // ไล่ดูย้อนหลังทีละหน้า
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).reverse().map((m) => ({ ...m, line_user_id: m.psid }));
}
export async function linkFbContact(psid, customerId) {
  const { error } = await supabase.from("fb_contacts").update({ customer_id: customerId || null }).eq("psid", psid);
  if (error) throw error;
}
export async function markFbRead(psid) {
  await supabase.from("fb_contacts").update({ unread: 0 }).eq("psid", psid);
}
export async function countUnreadFb() {
  const { count, error } = await supabase.from("fb_contacts").select("psid", { count: "exact", head: true }).gt("unread", 0);
  if (error) throw error;
  return count || 0;
}
async function _fbSend(to, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const r = await fetch("/api/fb-send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ to, ...payload }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || j.msg || "ส่งไม่สำเร็จ");
  return j;
}
export const sendFbMessage = (psid, text, opts) => _fbSend(psid, { text, ...(opts || {}) });
export const sendFbImage = (psid, imageUrl) => _fbSend(psid, { imageUrl });
export const sendFbFile = (psid, fileUrl, fileName) => _fbSend(psid, { fileUrl, fileName });   // PDF/ไฟล์ → Messenger type:"file"

// ── คอมเมนต์ Facebook (mig 193) — รับผ่าน webhook · ตอบ/ซ่อน/ปิด ผ่าน /api/fb-comment ──
export async function listFbComments(status = "open") {
  let q = supabase.from("fb_comments").select("*").order("commented_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return data || [];
}
export async function countOpenFbComments() {
  const { count, error } = await supabase.from("fb_comments").select("id", { count: "exact", head: true }).eq("status", "open");
  if (error) return 0;
  return count || 0;
}
// action: reply | hide | unhide | private | done · reply/private ต้องมี text
export async function fbCommentAction(action, comment_id, text) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const r = await fetch("/api/fb-comment", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, comment_id, text }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || j.msg || "ไม่สำเร็จ");
  return j;
}

// ─────────── อีเมล (กล่อง info@amcair.net ผ่าน Gmail API) ───────────
export async function listEmailThreads() {
  const { data, error } = await supabase.from("email_threads")
    .select("thread_id,subject,from_email,from_name,snippet,last_message_at,last_inbound_at,unread,spam,assigned_to,customer_id")
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(500);
  if (error) throw error;
  return data || [];
}
export async function countEmailUnread() {
  const { count } = await supabase.from("email_threads").select("thread_id", { count: "exact", head: true }).eq("unread", true).neq("spam", true);
  return count || 0;
}
export async function listEmailMessages(threadId) {
  const { data, error } = await supabase.from("email_messages")
    .select("id,direction,from_email,from_name,to_email,subject,body_text,body_html,attachments,created_at,sent_by")
    .eq("thread_id", threadId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function syncEmails() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const r = await fetch("/api/email-sync", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "ดึงอีเมลไม่สำเร็จ");
  return j;
}
export async function sendEmail({ threadId, to, subject, text, html, attachments }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const r = await fetch("/api/email-send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ threadId, to, subject, text, html, attachments }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || "ส่งอีเมลไม่สำเร็จ");
  return j;
}
export async function markEmailRead(threadId) {
  const { error } = await supabase.from("email_threads").update({ unread: false, last_read_at: new Date().toISOString() }).eq("thread_id", threadId);
  if (error) throw error;
}
export async function setEmailOwner(threadId, uid) {
  const { error } = await supabase.from("email_threads").update({ assigned_to: uid || null }).eq("thread_id", threadId);
  if (error) throw error;
}
export async function linkEmailCustomer(threadId, customerId) {
  const { error } = await supabase.from("email_threads").update({ customer_id: customerId || null }).eq("thread_id", threadId);
  if (error) throw error;
}

// ─────────── นัดหมายอิสระในปฏิทิน (ไม่ผูกใบงาน) — calendar_events (mig 216) ───────────
export async function listCalendarEvents() {
  const { data, error } = await supabase.from("calendar_events").select("*").order("start_at", { ascending: true });
  if (error) { if (/calendar_events|relation|does not exist/i.test(error.message || "")) return []; throw error; }
  return data || [];
}
export async function saveCalendarEvent(ev) {
  const { data: { user } } = await supabase.auth.getUser();
  const row = { title: (ev.title || "นัดหมาย").trim(), start_at: ev.start_at, end_at: ev.end_at || null, slot: ev.slot || null, team: ev.team || null, note: ev.note?.trim() || null, customer_id: ev.customer_id || null };
  if (ev.id) { const { error } = await supabase.from("calendar_events").update(row).eq("id", ev.id); if (error) throw error; return ev.id; }
  row.created_by = user?.id || null;
  const { data, error } = await supabase.from("calendar_events").insert(row).select("id").single();
  if (error) throw error;
  return data.id;
}
export async function deleteCalendarEvent(id) {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}

// CRM: set a contact's stage / responsible staff
export async function setLineStage(uid, stage) {
  const { error } = await supabase.from("line_contacts").update({ stage }).eq("line_user_id", uid);
  if (error) throw error;
}
// ปิด/เปิดบอท AI เฉพาะห้องนั้น (mig 164) — ใช้ตอนพนักงานคุยปิดการขายเอง ไม่อยากให้บอทแทรก
export async function setLineAiOff(uid, off) {
  const { error } = await supabase.from("line_contacts").update({ ai_off: !!off }).eq("line_user_id", uid);
  if (error) throw new Error(/ai_off|PGRST204/i.test(error.message || "") ? "ต้องรัน migration 164 ใน Supabase ก่อน" : error.message);
}
export async function setLineOwner(uid, userId) {
  const { error } = await supabase.from("line_contacts").update({ assigned_to: userId || null }).eq("line_user_id", uid);
  if (error) throw error;
}
// โน้ต + แท็กผู้ติดต่อ (mig 189) — LINE + FB
const _noteErr = (e) => new Error(/note|tags|PGRST204/i.test(e?.message || "") ? "ต้องรัน migration 189 ใน Supabase ก่อน" : e.message);
export async function setLineNote(uid, note) { const { error } = await supabase.from("line_contacts").update({ note: note || null }).eq("line_user_id", uid); if (error) throw _noteErr(error); }
export async function setLineTags(uid, tags) { const { error } = await supabase.from("line_contacts").update({ tags: (tags && tags.length) ? tags : null }).eq("line_user_id", uid); if (error) throw _noteErr(error); }
// FB: stage/owner/note/tags (fb_contacts มีคอลัมน์ครบตั้งแต่ mig 043 + note/tags ที่ 189)
export async function setFbStage(psid, stage) { const { error } = await supabase.from("fb_contacts").update({ stage }).eq("psid", psid); if (error) throw error; }
export async function setFbOwner(psid, userId) { const { error } = await supabase.from("fb_contacts").update({ assigned_to: userId || null }).eq("psid", psid); if (error) throw error; }
export async function setFbNote(psid, note) { const { error } = await supabase.from("fb_contacts").update({ note: note || null }).eq("psid", psid); if (error) throw _noteErr(error); }
export async function setFbTags(psid, tags) { const { error } = await supabase.from("fb_contacts").update({ tags: (tags && tags.length) ? tags : null }).eq("psid", psid); if (error) throw _noteErr(error); }
export async function setFbAiOff(psid, off) { const { error } = await supabase.from("fb_contacts").update({ ai_off: !!off }).eq("psid", psid); if (error) throw new Error(/ai_off|PGRST204/i.test(error.message || "") ? "ต้องรัน migration 222 ใน Supabase ก่อน" : error.message); }
// ปักหมุดแชต + เปลี่ยนชื่อลูกค้าในแชต (mig 223) — custom_name ว่าง = คืนชื่อโปรไฟล์เดิม
const _pinErr = (e) => new Error(/pinned|custom_name|PGRST204/i.test(e.message || "") ? "ต้องรัน migration 223 ใน Supabase ก่อน" : e.message);
export async function setLinePinned(uid, pinned) { const { error } = await supabase.from("line_contacts").update({ pinned: !!pinned }).eq("line_user_id", uid); if (error) throw _pinErr(error); }
export async function setFbPinned(psid, pinned) { const { error } = await supabase.from("fb_contacts").update({ pinned: !!pinned }).eq("psid", psid); if (error) throw _pinErr(error); }
export async function setLineName(uid, name) { const { error } = await supabase.from("line_contacts").update({ custom_name: (name || "").trim() || null }).eq("line_user_id", uid); if (error) throw _pinErr(error); }
export async function setFbName(psid, name) { const { error } = await supabase.from("fb_contacts").update({ custom_name: (name || "").trim() || null }).eq("psid", psid); if (error) throw _pinErr(error); }
// ค้นหาข้อความ FB (mirror searchLineMessages) — คืน map keyed by psid (= line_user_id ที่ alias ไว้)
export async function searchFbMessages(term, { limit = 300 } = {}) {
  const t = String(term || "").trim(); if (t.length < 2) return {};
  const esc = t.replace(/[\\%_]/g, (m) => "\\" + m);
  const { data, error } = await supabase.from("fb_messages").select("psid,text,created_at,direction").ilike("text", `%${esc}%`).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  const byRoom = {}; (data || []).forEach((m) => { if (!byRoom[m.psid]) byRoom[m.psid] = m; });
  return byRoom;
}
// staff list (for owner dropdown + showing who replied)
export async function listStaff() {
  let { data, error } = await supabase.from("profiles").select("id,name,email,role,avatar_url").order("name");
  // ห้ามให้ลิสต์พนักงานล้มทั้งก้อน — ถ้า staffMap ว่าง ชื่อผู้ตอบแชตทุกคนจะกลายเป็น "ทีมงาน"
  // ลดรูปลงเรื่อย ๆ: ไม่มี avatar_url (ยังไม่รัน 083) → คอลัมน์หลัก → คอลัมน์ต่ำสุด
  if (error) ({ data, error } = await supabase.from("profiles").select("id,name,email,role").order("name"));
  if (error) ({ data, error } = await supabase.from("profiles").select("id,name,email"));
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, name: p.name || p.email }));
}

// avatars (chat profile pictures) — own profile + group/room
export async function uploadAvatar(file) {
  file = await downscaleImage(file);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}
const avatarErr = (e) => /set_my_avatar|set_room_avatar|schema cache/i.test(e?.message || "") ? new Error("ต้องรัน migration 083 (chat_avatars) ใน Supabase ก่อน") : e;
export async function setMyAvatar(url) {
  const { error } = await supabase.rpc("set_my_avatar", { p_url: url || "" });
  if (error) throw avatarErr(error);
}
export async function setRoomAvatar(roomId, url) {
  const { error } = await supabase.rpc("set_room_avatar", { p_room: roomId, p_url: url || "" });
  if (error) throw avatarErr(error);
}

// send a reply via the serverless function (LINE push). payload = { text } or { imageUrl }.
async function callLineSend(to, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/line-send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ to, ...payload }),
  });
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}
export const sendLineMessage = (to, text, opts) => callLineSend(to, { text, ...(opts || {}) });
export const sendLineImage = (to, imageUrl) => callLineSend(to, { imageUrl });
export const sendLineFile = (to, fileUrl, fileName) => callLineSend(to, { fileUrl, fileName });
export const sendLineSticker = (to, packageId, stickerId) => callLineSend(to, { packageId, stickerId });

// upload an image to send through the chat → public URL (used by LINE image messages)
export async function uploadChatImage(file) {
  file = await downscaleImage(file);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// upload a generated document file (image/pdf) → public URL (for sending docs to customers on LINE)
export async function uploadDocFile(blob, ext, contentType) {
  const path = `docs/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, blob, { upsert: true, contentType: contentType || "application/octet-stream" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// ===================== HR (attendance / leave / holidays) =====================
const _today = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
// วันที่ทำงานต้องมาจากเซิร์ฟเวอร์ (เวลาไทย) — นาฬิกา/โซนเวลาเครื่องพนักงานเชื่อไม่ได้ (mig 165)
// ⚠️ ห้ามแคชไว้ระดับโมดูล: แอปที่เปิดค้างข้ามเที่ยงคืนจะได้วันเก่าแล้วเช็คอินไม่ตรงวัน
async function _hrToday() {
  try { const { data, error } = await supabase.rpc("hr_today"); return (error || !data) ? _today() : String(data).slice(0, 10); }
  catch { return _today(); }   // ยังไม่รัน mig 165 → ใช้วันที่เครื่องไปก่อน (RLS ยังกันอีกชั้น)
}

// staff signature image → public URL (stored on the profile, optionally printed on documents).
// accepts a canvas Blob (png) OR an uploaded image File (keeps its type/extension).
export async function uploadSignature(file) {
  const uid = await _uid();
  const ct = file.type || "image/png";
  const ext = (file.name ? file.name.split(".").pop() : (ct.split("/")[1] || "png")).toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `signatures/${uid}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true, contentType: ct });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}
export async function saveMySignature(url) {
  const uid = await _uid();
  const { error } = await supabase.from("profiles").update({ signature_url: url || null }).eq("id", uid);
  if (error) throw error;
}

export async function uploadAttendancePhoto(blob) {
  const path = `attendance/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabase.storage.from("photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

export async function getHrSettings() {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "hr_settings").maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}
export async function saveHrSettings(s) {
  const { error } = await supabase.from("app_config").upsert({ key: "hr_settings", value: s }, { onConflict: "key" });
  if (error) throw error;
}
export async function listHolidays() {
  const { data, error } = await supabase.from("hr_holidays").select("*").order("day");
  if (error) throw error; return data || [];
}
export async function saveHoliday(day, name) {
  const { error } = await supabase.from("hr_holidays").upsert({ day, name: name || "วันหยุด" }, { onConflict: "day" });
  if (error) throw error;
}
export async function deleteHoliday(day) {
  const { error } = await supabase.from("hr_holidays").delete().eq("day", day);
  if (error) throw error;
}

export async function myAttendanceToday() {
  const uid = await _uid();
  // ต้องใช้วันเดียวกับที่ RLS ตรึงไว้ ไม่งั้นเครื่องที่วันเพี้ยนจะหาแถวไม่เจอแล้วขึ้นว่ายังไม่เช็คอิน
  const { data, error } = await supabase.from("hr_attendance").select("*").eq("user_id", uid).eq("work_date", await _hrToday()).maybeSingle();
  if (error) throw error; return data || null;
}
export async function checkIn({ lat, lng, photo }) {
  const uid = await _uid(), day = await _hrToday();   // วันที่จากเซิร์ฟเวอร์ ให้ตรงกับที่ RLS ตรึงไว้
  const ex = await supabase.from("hr_attendance").select("id,check_in_at").eq("user_id", uid).eq("work_date", day).maybeSingle();
  if (ex.data && ex.data.check_in_at) throw new Error("เช็คอินวันนี้ไปแล้ว");
  const row = { check_in_at: new Date().toISOString(), check_in_lat: lat ?? null, check_in_lng: lng ?? null, check_in_photo: photo || null };
  const { error } = ex.data
    ? await supabase.from("hr_attendance").update(row).eq("id", ex.data.id)
    : await supabase.from("hr_attendance").insert({ user_id: uid, work_date: day, ...row });
  if (error) throw error;
  const me = await _meSafe();
  const now = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  notify(await _usersByRole(["admin", "exec", "hr"]), { category: "hr", title: `🕒 ${me?.name || "พนักงาน"} เข้างาน ${now} น.`, url: "hr", ref_type: "attendance" });
}
export async function checkOut({ lat, lng, photo }) {
  const uid = await _uid(), day = await _hrToday();   // วันที่จากเซิร์ฟเวอร์ ให้ตรงกับที่ RLS ตรึงไว้
  const ex = await supabase.from("hr_attendance").select("id,check_in_at").eq("user_id", uid).eq("work_date", day).maybeSingle();
  if (!ex.data || !ex.data.check_in_at) throw new Error("ยังไม่ได้เช็คอินวันนี้");
  const { error } = await supabase.from("hr_attendance").update({
    check_out_at: new Date().toISOString(), check_out_lat: lat ?? null, check_out_lng: lng ?? null, check_out_photo: photo || null,
  }).eq("id", ex.data.id);
  if (error) throw error;
  const me = await _meSafe();
  const now = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  notify(await _usersByRole(["admin", "exec", "hr"]), { category: "hr", title: `🕔 ${me?.name || "พนักงาน"} ออกงาน ${now} น.`, url: "hr", ref_type: "attendance" });
}
export async function listMyAttendance(fromDay) {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_attendance").select("*").eq("user_id", uid).gte("work_date", fromDay).order("work_date", { ascending: false });
  if (error) throw error; return data || [];
}
// manager: all attendance in a date range, joined with staff name/department
export async function listAttendance(fromDay, toDay) {
  const [attRows, profs] = await Promise.all([
    _fetchAll((f, t) => supabase.from("hr_attendance").select("*", { count: "exact" }).gte("work_date", fromDay).lte("work_date", toDay).order("work_date", { ascending: false }).order("id").range(f, t)), // กันเพดาน 1000 แถว (ทั้งเดือน × ทุกคน)
    supabase.from("profiles").select("id,name,role,department,work_pattern,sat_group"),
  ]);
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return attRows.map((a) => ({ ...a, name: pm[a.user_id]?.name || "-", department: posLabel(pm[a.user_id]), work_pattern: pm[a.user_id]?.work_pattern, sat_group: pm[a.user_id]?.sat_group }));
}

export async function submitLeave({ type, start_date, end_date, days, reason, hours, time_from, time_to }) {
  const uid = await _uid();
  // กันยื่นทับวันเดิม — เดิม insert ตรงเลย พนักงานที่กดส่งซ้ำเพราะเน็ตช้าจะได้ใบลา 2 ใบวันเดียวกัน
  // แล้ว HR เห็นเป็นคนละแถวไม่มีสัญญาณเตือน กดอนุมัติทั้งคู่ → โควตาถูกตัดสองครั้งจากการลาครั้งเดียว
  // (usedThru รวม days ของทุกใบโดยไม่ dedupe ขณะที่ buildLeaveDaySet ใช้คีย์เป็นวันจึงไม่ซ้ำ = ตัวเลขสองฝั่งขัดกันเอง)
  // ช่วงทับกันเมื่อ start เดิม <= end ใหม่ และ end เดิม >= start ใหม่
  const { data: dup } = await supabase.from("hr_leaves").select("id,type,start_date,end_date,status,hours,time_from,time_to")
    .eq("user_id", uid).in("status", ["pending", "approved"])
    .lte("start_date", end_date).gte("end_date", start_date);
  // ⚠️ ลาราย ชม. วันเดียวกันคนละช่วงเวลาเป็นเรื่องปกติ (เช้า 2 ชม. + บ่าย 2 ชม.) ห้ามบล็อก
  //    บล็อกเฉพาะเมื่อมีฝั่งใดฝั่งหนึ่งเป็นลาเต็มวัน หรือทั้งคู่เป็นราย ชม. แล้วช่วงเวลาทับกันจริง
  const newHourly = Number(hours) > 0;
  const clash = (dup || []).find((d) => {
    const oldHourly = Number(d.hours) > 0;
    if (!newHourly || !oldHourly) return true;                       // มีเต็มวันอยู่ฝั่งใดฝั่งหนึ่ง = ทับแน่
    if (!d.time_from || !d.time_to || !time_from || !time_to) return true;   // ไม่รู้เวลา = ถือว่าทับไว้ก่อน
    return d.time_from < time_to && d.time_to > time_from;
  });
  if (clash) {
    const st = clash.status === "approved" ? "อนุมัติแล้ว" : "รออนุมัติ";
    const when = `${clash.start_date}${clash.end_date !== clash.start_date ? ` ถึง ${clash.end_date}` : ""}`;
    const time = Number(clash.hours) > 0 && clash.time_from ? ` ${clash.time_from}–${clash.time_to}` : "";
    throw new Error(`มีใบลาช่วงนี้อยู่แล้ว (${when}${time} · ${st})\nถ้าต้องการแก้ไข ให้ยกเลิกใบเดิมก่อน`);
  }
  const row = { user_id: uid, type, start_date, end_date, days, reason: reason || null,
    hours: Number(hours) > 0 ? Number(hours) : null, time_from: time_from || null, time_to: time_to || null };
  let { error } = await supabase.from("hr_leaves").insert(row);
  // pre-141 fallback: ยังไม่มีคอลัมน์ลาราย ชม. — ส่งแบบเต็มวันไปก่อน ไม่ให้ฟอร์มพังทั้งเมนู
  if (error && /hours|time_from|time_to|unpaid|check/i.test(error.message || "")) {
    const { hours: _h, time_from: _f, time_to: _t, ...basic } = row;
    ({ error } = await supabase.from("hr_leaves").insert(basic));
  }
  if (error) throw error;
  const me = await _meSafe();
  const amount = Number(hours) > 0 ? `${Number(hours)} ชม.` : `${days} วัน`;
  const when = `${start_date}${end_date && end_date !== start_date ? " – " + end_date : ""}${Number(hours) > 0 && time_from ? ` ${time_from}–${time_to}` : ""}`;
  notify(await _usersByRole(["admin", "exec", "hr"]), { category: "hr", title: `📝 ${me?.name || "พนักงาน"} ขอลา (${amount})`, body: `${when}${reason ? " · " + reason : ""}`, url: "hr", ref_type: "leave" });
}
export async function listMyLeaves() {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_leaves").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw error; return data || [];
}
export async function listLeaves(status) {
  // กันเพดาน 1000 แถว — ใบลาสะสมทุกปีไม่มีตัวกรองช่วงวัน พอเกินพันใบ ใบเก่าจะหลุดเงียบ ๆ ทำรายงาน/เงินเดือนย้อนหลังเพี้ยน
  const build = (f, t) => { let q = supabase.from("hr_leaves").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t); if (status) q = q.eq("status", status); return q; };
  const [lvRows, profs] = await Promise.all([_fetchAll(build), supabase.from("profiles").select("id,name,role,department")]);
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return lvRows.map((l) => ({ ...l, name: pm[l.user_id]?.name || "-", department: posLabel(pm[l.user_id]) }));
}
export async function decideLeave(id, status, note) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_leaves").update({ status, decided_by: uid, decided_at: new Date().toISOString(), decide_note: note || null }).eq("id", id);
  if (error) throw error;
  const { data: lv } = await supabase.from("hr_leaves").select("user_id").eq("id", id).maybeSingle();
  const lbl = { approved: "อนุมัติ ✅", rejected: "ไม่อนุมัติ ❌", pending: "กลับเป็นรออนุมัติ" }[status] || status;
  if (lv) notify([lv.user_id], { category: "hr", title: `📝 ใบลาของคุณ: ${lbl}`, body: note || "", url: "attendance", ref_type: "leave" });
}
// HR/admin edit a leave request (type/dates/days/reason)
export async function updateLeave(id, fields) {
  const patch = { type: fields.type, start_date: fields.start_date, end_date: fields.end_date, days: Number(fields.days) || 1, reason: fields.reason || null,
    hours: Number(fields.hours) > 0 ? Number(fields.hours) : null, time_from: fields.time_from || null, time_to: fields.time_to || null };
  let { error } = await supabase.from("hr_leaves").update(patch).eq("id", id);
  if (error && /hours|time_from|time_to/i.test(error.message || "")) {
    const { hours: _h, time_from: _f, time_to: _t, ...basic } = patch;
    ({ error } = await supabase.from("hr_leaves").update(basic).eq("id", id));
  }
  if (error) throw error;
}
// HR/admin delete a leave request
export async function deleteLeave(id) {
  const { error } = await supabase.from("hr_leaves").delete().eq("id", id);
  if (error) throw error;
}

// ---------- CASH ADVANCES (เบิกเงินล่วงหน้า) ----------
export async function submitAdvance({ amount, reason }) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_advances").insert({ user_id: uid, amount: Number(amount) || 0, reason: reason || null, created_by: uid });
  if (error) throw error;
  const me = await _meSafe();
  notify(await _usersByRole(["admin", "finance", "exec", "hr"]), { category: "hr", title: `💵 ${me?.name || "พนักงาน"} ขอเบิกเงินล่วงหน้า ${Number(amount) || 0} บาท`, body: reason || "", url: "hr", ref_type: "advance" });
}
export async function listMyAdvances() {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_advances").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw error; return data || [];
}
// staff can withdraw their own request while it's still pending
// ยกเลิกใบลาของตัวเองตอนยังรออนุมัติ (mig 146 — RLS กันลบใบที่ตัดสินแล้ว)
export async function cancelMyLeave(id) {
  const { error } = await supabase.from("hr_leaves").delete().eq("id", id).eq("status", "pending");
  if (error) throw error;
}
export async function cancelMyAdvance(id) {
  const { error } = await supabase.from("hr_advances").delete().eq("id", id).eq("status", "pending");
  if (error) throw error;
}
export async function listAdvances(status) {
  // กันเพดาน 1000 แถว — คำขอเบิกสะสมเรื่อย ๆ เหมือนใบลา
  const build = (f, t) => { let q = supabase.from("hr_advances").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t); if (status) q = q.eq("status", status); return q; };
  const [avRows, profs] = await Promise.all([_fetchAll(build), supabase.from("profiles").select("id,name,role,department")]);
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return avRows.map((a) => ({ ...a, name: pm[a.user_id]?.name || "-", department: posLabel(pm[a.user_id]) }));
}
export async function decideAdvance(id, status, note) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_advances").update({ status, decided_by: uid, decided_at: new Date().toISOString(), decide_note: note || null }).eq("id", id);
  if (error) throw error;
  const { data: av } = await supabase.from("hr_advances").select("user_id,amount").eq("id", id).maybeSingle();
  const lbl = { approved: "อนุมัติ ✅", rejected: "ไม่อนุมัติ ❌", pending: "กลับเป็นรออนุมัติ" }[status] || status;
  if (av) notify([av.user_id], { category: "hr", title: `💵 คำขอเบิก ${av.amount || 0} บาท: ${lbl}`, body: note || "", url: "attendance", ref_type: "advance" });
}
// settle approved advances once their payroll run is paid (so they aren't deducted twice)
export async function markAdvancesPaid(period, ids) {
  if (!ids || !ids.length) return;
  const { error } = await supabase.from("hr_advances").update({ status: "paid", period }).in("id", ids);
  if (error) throw error;
}
// โอนเงินเบิกล่วงหน้าให้พนักงานจริง (mig 129) — แนบสลิป + ลงเดินบัญชี · ไม่แตะสถานะหักเงินเดือน
export async function payAdvanceOut(id, { accountId, payDate, slipUrl }) {
  const uid = await _uid();
  const { data: a, error: e0 } = await supabase.from("hr_advances").select("amount,user_id,paid_out_at").eq("id", id).single();
  if (e0) throw e0;
  if (a.paid_out_at) throw new Error("รายการนี้โอนจ่ายแล้ว");
  const patch = { paid_out_at: new Date().toISOString(), paid_from: accountId || null, pay_slip_url: slipUrl || null };
  const { error } = await supabase.from("hr_advances").update(patch).eq("id", id);
  if (error) throw new Error(/paid_out_at|paid_from|pay_slip_url|PGRST204/i.test(error.message || "") ? "ยังไม่ได้รัน migration 129 ใน Supabase" : error.message || error);
  if (accountId) {
    const { error: eAcc } = await supabase.from("account_entries").insert({ account_id: accountId, direction: "out", amount: Number(a.amount) || 0, kind: "advance", ref_type: "advance", ref_id: id, note: "จ่ายเบิกเงินล่วงหน้าพนักงาน", entry_date: payDate || new Date().toISOString().slice(0, 10), created_by: uid });
    if (eAcc) throw eAcc;
  }
  notify([a.user_id], { category: "hr", title: `💸 โอนเงินเบิกล่วงหน้า ${Number(a.amount) || 0} บาทให้แล้ว`, body: "ยอดนี้จะถูกหักจากรอบเงินเดือนถัดไป", url: "attendance", ref_type: "advance" });
}
// HR/admin edit a cash-advance request (amount / request_date / reason)
export async function updateAdvance(id, fields) {
  const patch = { amount: Number(fields.amount) || 0, request_date: fields.request_date, reason: fields.reason || null };
  const { error } = await supabase.from("hr_advances").update(patch).eq("id", id);
  if (error) throw error;
}
// HR/admin delete a cash-advance request
export async function deleteAdvance(id) {
  const { error } = await supabase.from("hr_advances").delete().eq("id", id);
  if (error) throw error;
}

// ---------- OT REQUESTS (ใบขอ OT) — พนักงานขอ · HR อนุมัติ · คิดเงินเฉพาะที่อนุมัติ (mig 184) ----------
// ชั่วโมง OT จากเวลา "HH:MM"–"HH:MM" → บล็อกครึ่งชั่วโมง (ปัดลง) · รองรับข้ามเที่ยงคืน
export function otHoursFromTimes(from, to) {
  const mm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const a = mm(from), b = mm(to); if (a == null || b == null) return 0;
  let diff = b - a; if (diff < 0) diff += 24 * 60;
  return Math.floor(diff / 30) / 2;
}
export async function submitOt({ ot_date, time_from, time_to, reason, job_no }) {
  const uid = await _uid();
  // flow ใหม่ (mig 186): ขอแค่วัน+เวลาเริ่ม · ชั่วโมงคิดตอนเช็คเอาท์ · time_to อาจว่างได้
  const hours = time_to ? otHoursFromTimes(time_from, time_to) : 0;
  const row = { user_id: uid, ot_date, time_from: time_from || null, time_to: time_to || null, hours, reason: reason || null, job_no: job_no || null, created_by: uid };
  let { error } = await supabase.from("hr_ot").insert(row);
  if (error && /job_no/i.test(error.message || "")) { delete row.job_no; ({ error } = await supabase.from("hr_ot").insert(row)); } // ก่อนรัน mig 185
  if (error) throw error;
  const me = await _meSafe();
  notify(await _usersByRole(["admin", "exec", "hr"]), { category: "hr", title: `⏱️ ${me?.name || "พนักงาน"} ขอทำ OT (${ot_date} เริ่ม ${time_from || "-"})${job_no ? ` · งาน ${job_no}` : ""}`, body: reason || "", url: "hr", ref_type: "ot" });
}
// เช็คเอาท์ OT ที่อนุมัติแล้ว — บันทึกเวลาเลิก + คิดชั่วโมง (พนักงานกดเองเมื่อทำเสร็จ · mig 186)
export async function checkoutOt(id, time_to) {
  const uid = await _uid();
  const { data: ot, error: e0 } = await supabase.from("hr_ot").select("time_from, ot_date, status").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!ot) throw new Error("ไม่พบใบขอ OT");
  if (ot.status !== "approved") throw new Error("เช็คเอาท์ได้เฉพาะ OT ที่อนุมัติแล้ว");
  const hours = otHoursFromTimes(ot.time_from, time_to);
  if (!(hours > 0)) throw new Error("เวลาเลิกต้องมากกว่าเวลาเริ่ม");
  const { error } = await supabase.from("hr_ot").update({ time_to, hours }).eq("id", id).eq("user_id", uid).eq("status", "approved");
  if (error) throw error;
  const me = await _meSafe();
  notify(await _usersByRole(["admin", "exec", "hr"]), { category: "hr", title: `✅ ${me?.name || "พนักงาน"} เช็คเอาท์ OT ${hours} ชม. (${ot.ot_date})`, body: "", url: "hr", ref_type: "ot" });
}
// HR เช็คเอาท์ OT แทนพนักงาน (เผื่อลืม/ไม่สะดวก) — ใช้สิทธิ์ผู้จัดการ (RLS mig 184), ไม่จำกัด user_id
export async function hrCheckoutOt(id, time_to) {
  const { data: ot, error: e0 } = await supabase.from("hr_ot").select("time_from, ot_date, status, user_id").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!ot) throw new Error("ไม่พบใบขอ OT");
  if (ot.status !== "approved") throw new Error("เช็คเอาท์ได้เฉพาะ OT ที่อนุมัติแล้ว");
  const hours = otHoursFromTimes(ot.time_from, time_to);
  if (!(hours > 0)) throw new Error("เวลาเลิกต้องมากกว่าเวลาเริ่ม");
  const { error } = await supabase.from("hr_ot").update({ time_to, hours }).eq("id", id).eq("status", "approved");
  if (error) throw error;
  if (ot.user_id) notify([ot.user_id], { category: "hr", title: `✅ HR เช็คเอาท์ OT ให้ ${hours} ชม. (${ot.ot_date})`, body: "", url: "attendance", ref_type: "ot" });
}
export async function listMyOt() {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_ot").select("*").eq("user_id", uid).order("ot_date", { ascending: false });
  if (error) throw error; return data || [];
}
export async function cancelMyOt(id) {
  const { error } = await supabase.from("hr_ot").delete().eq("id", id).eq("status", "pending");
  if (error) throw error;
}
// ดึงลูกค้า+รายละเอียดของใบงานตามเลขงาน (ผู้จัดการ HR มีสิทธิ์อ่าน job_orders) — ไว้โชว์ท้ายเลขงาน OT
async function _jobBriefMap(jobNos) {
  const ids = [...new Set((jobNos || []).filter(Boolean))];
  if (!ids.length) return {};
  const { data: jobs } = await supabase.from("job_orders").select("job_no, details, contact_name, customer_id").in("job_no", ids);
  const custIds = [...new Set((jobs || []).map((j) => j.customer_id).filter(Boolean))];
  let cn = {};
  if (custIds.length) { const { data: cs } = await supabase.from("customers").select("id,name").in("id", custIds); cn = Object.fromEntries((cs || []).map((c) => [c.id, c.name])); }
  return Object.fromEntries((jobs || []).map((j) => [j.job_no, { customer: j.customer_id ? (cn[j.customer_id] || null) : (j.contact_name || null), details: j.details || null }]));
}
export async function listOt(status) {
  const build = (f, t) => { let q = supabase.from("hr_ot").select("*", { count: "exact" }).order("ot_date", { ascending: false }).order("id").range(f, t); if (status) q = q.eq("status", status); return q; };
  const [rows, profs] = await Promise.all([_fetchAll(build), supabase.from("profiles").select("id,name,role,department")]);
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  const jm = await _jobBriefMap(rows.map((r) => r.job_no)).catch(() => ({}));
  return rows.map((a) => ({ ...a, name: pm[a.user_id]?.name || "-", department: posLabel(pm[a.user_id]), jobCustomer: jm[a.job_no]?.customer || null, jobDetails: jm[a.job_no]?.details || null }));
}
// HR แก้เวลา OT (เวลาเริ่ม/เลิก) — คิดชั่วโมงใหม่ · ใช้สิทธิ์ผู้จัดการ (RLS mig 184)
export async function hrEditOt(id, { time_from, time_to }) {
  const hours = time_to ? otHoursFromTimes(time_from, time_to) : 0;
  if (time_to && !(hours > 0)) throw new Error("เวลาเลิกต้องมากกว่าเวลาเริ่ม");
  const { error } = await supabase.from("hr_ot").update({ time_from: time_from || null, time_to: time_to || null, hours }).eq("id", id).neq("status", "paid");
  if (error) throw error;
}
export async function decideOt(id, status, note) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_ot").update({ status, decided_by: uid, decided_at: new Date().toISOString(), decide_note: note || null }).eq("id", id);
  if (error) throw error;
  const { data: ot } = await supabase.from("hr_ot").select("user_id,hours,ot_date").eq("id", id).maybeSingle();
  const lbl = { approved: "อนุมัติ ✅", rejected: "ไม่อนุมัติ ❌", pending: "กลับเป็นรออนุมัติ" }[status] || status;
  if (ot) notify([ot.user_id], { category: "hr", title: `⏱️ OT ${ot.hours || 0} ชม. (${ot.ot_date}): ${lbl}`, body: note || "", url: "attendance", ref_type: "ot" });
}
// แนว A (mig 191 · เจ้าของเคาะ 2026-08-02): HR/หัวหน้า "อนุมัติเป็น OT" จากเวลาเข้างานจริง
// พนักงานยุ่งจนไม่ได้ยื่นใบ OT เอง → HR ดูเวลาที่อยู่เกิน แล้วกดปุ่มเดียว = สร้างใบ hr_ot อนุมัติทันที
// ใช้ reason นี้เป็นตัวระบุว่าเป็น "ใบที่ HR ออกจากเวลาจริง" (ถอนได้ · แยกจากใบที่พนักงานยื่นเอง)
export const AUTO_OT_REASON = "อนุมัติจากเวลาเข้างานจริง (HR)";
export async function createAutoOt({ user_id, ot_date, time_from, time_to, hours }) {
  const me = await _uid();
  const h = Math.round((Number(hours) || 0) * 100) / 100;
  if (!(h > 0)) throw new Error("ไม่มีชั่วโมง OT ให้อนุมัติ (ต้องเช็คเอาท์ก่อน)");
  const { error } = await supabase.from("hr_ot").insert({
    user_id, ot_date, time_from: time_from || null, time_to: time_to || null,
    hours: h, reason: AUTO_OT_REASON, status: "approved",
    decided_by: me, decided_at: new Date().toISOString(), created_by: me,
  });
  if (error) throw error;
  notify([user_id], { category: "hr", title: `✅ HR อนุมัติ OT ให้ ${h} ชม. (${ot_date})`, body: "อนุมัติจากเวลาเข้างานจริง", url: "attendance", ref_type: "ot" });
}
// ถอนใบ OT ที่ HR ออกจากเวลาจริง (เฉพาะที่ยังไม่ปิดจ่าย)
export async function removeAutoOt(user_id, ot_date) {
  const { error } = await supabase.from("hr_ot").delete()
    .eq("user_id", user_id).eq("ot_date", ot_date).eq("reason", AUTO_OT_REASON).neq("status", "paid");
  if (error) throw error;
}
// ใบ OT ทั้งหมดของวันเดียว — ไว้เช็คว่าคนไหนถูก HR อนุมัติ OT จากเวลาจริงแล้ว (หน้า HR วันนี้)
export async function listOtOn(day) {
  const { data, error } = await supabase.from("hr_ot").select("user_id, hours, reason, status").eq("ot_date", day);
  if (error) throw error;
  return data || [];
}
// settle approved OT once its payroll run is paid (so it isn't re-counted)
export async function markOtPaid(period, ids) {
  if (!ids || !ids.length) return;
  const { error } = await supabase.from("hr_ot").update({ status: "paid", period }).in("id", ids);
  if (error) throw error;
}

// ---------- LOANS (เงินยืม — ผ่อนอัตโนมัติจนครบ, mig 184) ----------
export async function listLoans(activeOnly) {
  let q = supabase.from("hr_loans").select("*").order("created_at", { ascending: false });
  if (activeOnly) q = q.eq("status", "active");
  const [rows, profs] = await Promise.all([q, supabase.from("profiles").select("id,name,role,department")]);
  if (rows.error) throw rows.error;
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return (rows.data || []).map((l) => ({ ...l, name: pm[l.user_id]?.name || "-", department: posLabel(pm[l.user_id]) }));
}
export async function listMyLoans() {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_loans").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw error; return data || [];
}
export async function saveLoan({ id, user_id, principal, installment, note }) {
  const uid = await _uid();
  const P = Number(principal) || 0, I = Number(installment) || 0;
  if (id) {   // แก้ยอด/ค่างวด → recompute balance = ยอดยืม − ที่หักไปแล้ว
    const { data: pays } = await supabase.from("hr_loan_payments").select("amount").eq("loan_id", id);
    const paid = (pays || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const bal = Math.max(0, P - paid);
    const { error } = await supabase.from("hr_loans").update({ principal: P, installment: I, note: note || null, balance: bal, status: bal <= 0 ? "closed" : "active" }).eq("id", id);
    if (error) throw error; return;
  }
  const { error } = await supabase.from("hr_loans").insert({ user_id, principal: P, installment: I, balance: P, status: P <= 0 ? "closed" : "active", note: note || null, created_by: uid });
  if (error) throw error;
}
export async function deleteLoan(id) {
  const { error } = await supabase.from("hr_loans").delete().eq("id", id);
  if (error) throw error;
}
// ยกเลิกจ่ายรอบ — คืน OT ที่ปิดไปให้เป็น approved อีกครั้ง
export async function unsettleOt(period) {
  const { error } = await supabase.from("hr_ot").update({ status: "approved", period: null }).eq("period", period).eq("status", "paid");
  if (error) throw error;
}
// ยกเลิกจ่ายรอบ — ลบงวดผ่อนของรอบนั้น แล้ว recompute balance เงินยืมที่กระทบ
export async function unsettleLoan(period) {
  const { data: pays } = await supabase.from("hr_loan_payments").select("loan_id").eq("period", period);
  const loanIds = [...new Set((pays || []).map((p) => p.loan_id))];
  await supabase.from("hr_loan_payments").delete().eq("period", period);
  for (const lid of loanIds) {
    const [{ data: loan }, { data: ps }] = await Promise.all([
      supabase.from("hr_loans").select("principal").eq("id", lid).maybeSingle(),
      supabase.from("hr_loan_payments").select("amount").eq("loan_id", lid),
    ]);
    const paid = (ps || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const bal = Math.max(0, (Number(loan?.principal) || 0) - paid);
    await supabase.from("hr_loans").update({ balance: bal, status: bal <= 0 ? "closed" : "active" }).eq("id", lid);
  }
}
// ตอนทำจ่ายทั้งรอบ — บันทึกงวดผ่อน (idempotent ต่อ period ผ่าน unique loan+period) แล้ว recompute balance
export async function markLoanPaid(period, items) {
  if (!items || !items.length) return;
  for (const it of items) {
    if (!it.id || !(Number(it.amount) > 0)) continue;
    await supabase.from("hr_loan_payments").upsert({ loan_id: it.id, period, amount: Number(it.amount) || 0 }, { onConflict: "loan_id,period", ignoreDuplicates: true });
    const [{ data: loan }, { data: pays }] = await Promise.all([
      supabase.from("hr_loans").select("principal").eq("id", it.id).maybeSingle(),
      supabase.from("hr_loan_payments").select("amount").eq("loan_id", it.id),
    ]);
    const paid = (pays || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const bal = Math.max(0, (Number(loan?.principal) || 0) - paid);
    await supabase.from("hr_loans").update({ balance: bal, status: bal <= 0 ? "closed" : "active" }).eq("id", it.id);
  }
}

// per-person leave quota (per year). Falls back to hr_settings defaults in the UI when no row.
export async function getLeaveQuotas(year) {
  const { data, error } = await supabase.from("hr_leave_quota").select("*").eq("year", year);
  if (error) throw error; return data || [];
}
export async function getMyLeaveQuota(year) {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_leave_quota").select("*").eq("user_id", uid).eq("year", year).maybeSingle();
  if (error) throw error; return data || null;
}
export async function saveLeaveQuota(userId, year, q) {
  const { error } = await supabase.from("hr_leave_quota").upsert(
    { user_id: userId, year, vacation: Number(q.vacation) || 0, personal: Number(q.personal) || 0, sick: Number(q.sick) || 0 },
    { onConflict: "user_id,year" });
  if (error) throw error;
}

// staff list with HR fields (for the HR settings + reports)
export async function listHrStaff() {
  // HR covers permanent staff only — subcontractor-team members are excluded (managed on the ช่างซัพ page)
  let [pr, tm] = await Promise.all([
    supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url,pay_type,base_pay,ot_rate,sso,citizen_id,active").order("name"),
    supabase.from("teams").select("id,type"),
  ]);
  // pre-196 fallback — ยังไม่มีคอลัมน์ active (สถานะพ้นสภาพ)
  if (pr.error && /active/i.test(pr.error.message || "")) pr = await supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url,pay_type,base_pay,ot_rate,sso,citizen_id").order("name");
  // pre-130 fallback — ยังไม่มีคอลัมน์เลขบัตรประชาชน
  if (pr.error && /citizen_id/i.test(pr.error.message || "")) pr = await supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url,pay_type,base_pay,ot_rate,sso").order("name");
  // post-154 fallback — คอลัมน์ค่าจ้างถูกย้ายออกจาก profiles แล้ว
  if (pr.error && /(base_pay|ot_rate|pay_type|sso)/i.test(pr.error.message || "")) pr = await supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url").order("name");
  if (pr.error) throw pr.error;
  const subIds = new Set((tm.data || []).filter((t) => t.type === "sub").map((t) => t.id));
  // ข้อมูลค่าจ้างมาจาก hr_pay (RLS กันคนนอก) — คนที่ไม่มีสิทธิ์จะได้เฉพาะแถวของตัวเอง
  const pay = await _payByUser((pr.data || []).map((p) => p.id));
  // permanent staff ที่ยัง active (พ้นสภาพ = ซ่อนจากรายชื่อปัจจุบัน · pre-196 = active undefined → โชว์หมด)
  return (pr.data || []).filter((p) => !subIds.has(p.team) && p.active !== false)
    .map((p) => ({ ...p, ...(pay ? (pay[p.id] || {}) : {}), department: posLabel(p) }));
}
// ทำให้พ้นสภาพ / คืนสภาพ (mig 196) — ไม่ลบข้อมูล · ชื่อยังอยู่บนเอกสารเก่า
export async function setProfileActive(userId, active) {
  const { error } = await supabase.from("profiles").update({ active: !!active }).eq("id", userId);
  if (error) throw error;
}
// แยกฟิลด์: ข้อมูลค่าจ้าง/เลขบัตร → hr_pay (mig 154) · ที่เหลือ (กะ/แผนก/วันเริ่มงาน) → profiles
const _PAY_FIELDS = ["pay_type", "base_pay", "ot_rate", "sso", "citizen_id", "tax_wht"];
export async function updateHrProfile(id, fields) {
  const payFields = {}, profFields = {};
  Object.entries(fields || {}).forEach(([k, v]) => { (_PAY_FIELDS.includes(k) ? payFields : profFields)[k] = v; });
  if (Object.keys(payFields).length) {
    const { error } = await supabase.from("hr_pay").upsert({ user_id: id, ...payFields, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    // ยังไม่รัน mig 154 → เขียนลงคอลัมน์เดิมใน profiles ไปก่อน
    if (error) Object.assign(profFields, payFields);
    else await logAudit({ action: "update", target_type: "hr_pay", target_no: id, reason: "แก้ข้อมูลค่าจ้าง: " + Object.keys(payFields).join(", ") }).catch(() => {});
  }
  if (Object.keys(profFields).length) {
    const { error } = await supabase.from("profiles").update(profFields).eq("id", id);
    if (error) throw error;
  }
}

// admin/HR manually set a person's check-in/out for a day (correction). times = ISO or null.
export async function adminSaveAttendance(userId, workDate, checkInAt, checkOutAt) {
  const { error } = await supabase.from("hr_attendance").upsert(
    { user_id: userId, work_date: workDate, check_in_at: checkInAt || null, check_out_at: checkOutAt || null },
    { onConflict: "user_id,work_date" });
  if (error) throw error;
}
// HR รับรอง/ถอนรับรอง OT ของคน+วันนั้น (mig 144) — มีผลเมื่อเปิดตั้งค่า "OT ต้องรับรองก่อนคิดเงิน"
export async function setAttendanceOtOk(userId, workDate, ok) {
  const { error } = await supabase.from("hr_attendance").update({ ot_ok: !!ok }).eq("user_id", userId).eq("work_date", workDate);
  if (error) throw error;
}
// HR รับรอง/ถอนรับรอง "งานวันหยุด" ของคน+วันนั้น (mig 191) — ต้องรับรองก่อน ค่าวันหยุดถึงคิดเข้าเงินเดือน
export async function setAttendanceHolOk(userId, workDate, ok) {
  const { error } = await supabase.from("hr_attendance").update({ hol_ok: !!ok }).eq("user_id", userId).eq("work_date", workDate);
  if (error) throw error;
}
// HR/admin delete a day's attendance record (clears it back to "ยังไม่เข้า")
export async function deleteAttendance(userId, workDate) {
  const { error } = await supabase.from("hr_attendance").delete().eq("user_id", userId).eq("work_date", workDate);
  if (error) throw error;
}

// ---------- PAYROLL (เงินเดือน) ----------
export async function listPayslips(period) {
  const { data, error } = await supabase.from("payslips").select("*").eq("period", period);
  if (error) throw error; return data || [];
}
// upsert one payslip line (one per period+user)
const _payslipRow = (p, uid, now) => ({
  period: p.period, user_id: p.user_id, pay_type: p.pay_type || null,
  base: p.base || 0, ot_pay: p.ot_pay || 0, hol_pay: p.hol_pay || 0,   // ค่าทำงานวันหยุด (mig 148)
  present_days: p.present_days || 0, absent_days: p.absent_days || 0, leave_days: p.leave_days || 0, over_leave_days: p.over_leave_days || 0,
  late_min: p.late_min || 0, ot_min: p.ot_min || 0,
  d_late: p.d_late || 0, d_absent: p.d_absent || 0, d_leave: p.d_leave || 0, d_sso: p.d_sso || 0, d_advance: p.d_advance || 0,
  d_tax: p.d_tax || 0,   // ภาษีหัก ณ ที่จ่าย (mig 161) — แช่แข็งไว้กับสลิป
  d_loan: p.d_loan || 0, d_water: p.d_water || 0, d_electric: p.d_electric || 0,   // เงินยืม/ค่าน้ำ/ค่าไฟ (mig 184)
  bonus: p.bonus || 0, other_deduct: p.other_deduct || 0, other_note: p.other_note || null,
  net: p.net || 0, status: p.status || "draft", note: p.note || null, created_by: uid, updated_at: now,
});
export async function savePayslip(p) {
  const uid = await _uid();
  const row = _payslipRow(p, uid, new Date().toISOString());
  let { error } = await supabase.from("payslips").upsert(row, { onConflict: "period,user_id" });
  if (error && /hol_pay/i.test(error.message || "")) { delete row.hol_pay; ({ error } = await supabase.from("payslips").upsert(row, { onConflict: "period,user_id" })); } // pre-148 fallback
  if (error && /d_tax/i.test(error.message || "")) { delete row.d_tax; ({ error } = await supabase.from("payslips").upsert(row, { onConflict: "period,user_id" })); }   // pre-161 fallback
  if (error && /(d_loan|d_water|d_electric)/i.test(error.message || "")) { delete row.d_loan; delete row.d_water; delete row.d_electric; ({ error } = await supabase.from("payslips").upsert(row, { onConflict: "period,user_id" })); }   // pre-184 fallback
  if (error) throw error;
}
// บันทึกสลิปทั้งรอบใน "คำสั่งเดียว" — เดิมวนทีละคน เน็ตหลุดกลางทางแล้วได้รอบครึ่ง ๆ กลาง ๆ
export async function savePayslips(list) {
  const uid = await _uid(); const now = new Date().toISOString();
  const rows = list.map((p) => _payslipRow(p, uid, now));
  let { error } = await supabase.from("payslips").upsert(rows, { onConflict: "period,user_id" });
  if (error && /hol_pay/i.test(error.message || "")) { rows.forEach((r) => delete r.hol_pay); ({ error } = await supabase.from("payslips").upsert(rows, { onConflict: "period,user_id" })); } // pre-148 fallback
  if (error && /d_tax/i.test(error.message || "")) { rows.forEach((r) => delete r.d_tax); ({ error } = await supabase.from("payslips").upsert(rows, { onConflict: "period,user_id" })); }   // pre-161 fallback
  if (error && /(d_loan|d_water|d_electric)/i.test(error.message || "")) { rows.forEach((r) => { delete r.d_loan; delete r.d_water; delete r.d_electric; }); ({ error } = await supabase.from("payslips").upsert(rows, { onConflict: "period,user_id" })); }   // pre-184 fallback
  if (error) throw error;
}
export async function setPayslipPaid(period, paid, meta = {}) {
  const patch = paid
    ? { status: "paid", paid_at: new Date().toISOString(), paid_from: meta.accountId || null, pay_slip_url: meta.slipUrl || null }
    : { status: "draft", paid_at: null, paid_from: null, pay_slip_url: null };
  let { error } = await supabase.from("payslips").update(patch).eq("period", period);
  if (error && /paid_from|pay_slip_url|PGRST204/i.test(error.message || "")) { delete patch.paid_from; delete patch.pay_slip_url; ({ error } = await supabase.from("payslips").update(patch).eq("period", period)); } // pre-130 fallback
  if (error) throw error;
}
// ลงเดินบัญชี: เงินเดือนทั้งรอบ = เงินออกก้อนเดียวจากบัญชีที่เลือก (อ้าง ref salary + รอบ ไว้ลบตอนยกเลิกจ่าย)
export async function bookSalaryEntry(ym, accountId, amount, payDate, headcount) {
  const uid = await _uid();
  // กันซ้ำเมื่อจ่ายรอบเดิมใหม่ — แต่ห้ามลบแถวที่กระทบแบงค์ (✓) แล้ว
  const d1 = await supabase.from("account_entries").delete().eq("ref_type", "salary").eq("ref_id", ym).or("reconciled.is.null,reconciled.eq.false");
  if (d1.error) {
    if (!/reconciled|column|PGRST/i.test(d1.error.message || "")) throw d1.error;
    const d2 = await supabase.from("account_entries").delete().eq("ref_type", "salary").eq("ref_id", ym); // pre-089 ไม่มีคอลัมน์ reconciled
    if (d2.error) throw d2.error;
  }
  const { count } = await supabase.from("account_entries").select("id", { count: "exact", head: true }).eq("ref_type", "salary").eq("ref_id", ym);
  if ((count || 0) > 0) return false; // ยังมีแถวของรอบนี้ที่กระทบแบงค์ค้างอยู่ — ไม่ insert ซ้ำ · คืน false ให้ UI เตือน (ยอดใหม่ไม่ถูกลงเดินบัญชี)
  const { error } = await supabase.from("account_entries").insert({ account_id: accountId, direction: "out", amount: Number(amount) || 0, kind: "salary", ref_type: "salary", ref_id: ym, note: `เงินเดือนรอบ ${ym} (${headcount} คน)`, entry_date: payDate || new Date().toISOString().slice(0, 10), created_by: uid });
  if (error) throw error;
  return true;
}
export async function removeSalaryEntry(ym) {
  // ลบเฉพาะแถวที่ยังไม่กระทบแบงค์ — แถว ✓ แล้วต้องปลดเครื่องหมายเองก่อน (กติกา reconciled ห้ามแตะอัตโนมัติ)
  const d1 = await supabase.from("account_entries").delete().eq("ref_type", "salary").eq("ref_id", ym).or("reconciled.is.null,reconciled.eq.false");
  if (d1.error) {
    if (!/reconciled|column|PGRST/i.test(d1.error.message || "")) throw d1.error;
    const d2 = await supabase.from("account_entries").delete().eq("ref_type", "salary").eq("ref_id", ym); // pre-089
    if (d2.error) throw d2.error;
  }
}
// link a paid payroll run to Cash Flow as an ACTUAL outflow on the month's pay date (วันสิ้นเดือน).
// Reuses the salary source_ref so it overrides that month's auto-estimate; edited=true stops the
// estimate sync from reverting it (และ stale-delete ยกเว้น salary+edited — แถวเดือนเก่าอยู่ถาวร).
// status ต้องเป็น actual — จ่ายจริงแล้ว ไม่งั้น "เงินจริงสะสม" ในกระแสเงินสดไม่เคยรวมเงินเดือน (ขัดกับเดินบัญชี)
export async function upsertPayrollCashEntry(ym, amount, payDate, headcount) {
  const ref = `salary-${ym}`;
  const fields = { direction: "out", status: "actual", entry_date: payDate, amount: Number(amount) || 0,
    note: `เงินเดือนพนักงาน ${headcount} คน · รอบ ${ym}`, edited: true, updated_at: new Date().toISOString() };
  const { data: ex } = await supabase.from("cash_entries").select("id").eq("source_type", "salary").eq("source_ref", ref);
  if (ex && ex.length) { const { error } = await supabase.from("cash_entries").update(fields).eq("source_type", "salary").eq("source_ref", ref); if (error) throw error; }
  else { const uid = await _uid(); const { error } = await supabase.from("cash_entries").insert({ ...fields, source_type: "salary", source_ref: ref, created_by: uid }); if (error) throw error; }
}
// undo the cash-flow link when a payroll run is cancelled (the auto-estimate takes over again)
export async function removePayrollCashEntry(ym) {
  const { error } = await supabase.from("cash_entries").delete().eq("source_type", "salary").eq("source_ref", `salary-${ym}`);
  if (error) throw error;
}
// revert advances settled in this pay period back to "approved" (so a re-run deducts them again)
export async function unsettleAdvances(period) {
  const { error } = await supabase.from("hr_advances").update({ status: "approved", period: null }).eq("period", period).eq("status", "paid");
  if (error) throw error;
}

// the LINE contact linked to a customer (so documents can be sent to them) — null if not linked
export async function lineContactByCustomer(customerId) {
  if (!customerId) return null;
  const { data } = await supabase.from("line_contacts").select("line_user_id,display_name").eq("customer_id", customerId).limit(1).maybeSingle();
  return data || null;
}

// ---------- saved quick replies (canned messages) ----------
export async function listQuickReplies() {
  const { data, error } = await supabase.from("quick_replies").select("*").order("sort").order("id");
  if (error) throw error;
  return data || [];
}
export async function addQuickReply(text, title, images) {
  // put new replies at the end (largest sort + 1)
  const { data } = await supabase.from("quick_replies").select("sort").order("sort", { ascending: false }).limit(1);
  const nextSort = ((data && data[0] && data[0].sort) || 0) + 1;
  const row = { text: text.trim(), title: (title || "").trim() || null, sort: nextSort };
  if (images && images.length) row.images = images;
  let { error } = await supabase.from("quick_replies").insert(row);
  // ยังไม่รัน migration 132 (ไม่มีคอลัมน์ images) → บันทึกเฉพาะข้อความ
  if (error && "images" in row && (error.code === "PGRST204" || /images/.test(error.message || ""))) {
    delete row.images;
    ({ error } = await supabase.from("quick_replies").insert(row));
  }
  if (error) throw error;
}
export async function updateQuickReply(id, fields) {
  const patch = {};
  if (fields.text != null) patch.text = String(fields.text).trim();
  if (fields.title !== undefined) patch.title = (fields.title || "").trim() || null;
  if (fields.images !== undefined) patch.images = fields.images || [];
  let { error } = await supabase.from("quick_replies").update(patch).eq("id", id);
  if (error && "images" in patch && (error.code === "PGRST204" || /images/.test(error.message || ""))) {
    delete patch.images;
    ({ error } = Object.keys(patch).length ? await supabase.from("quick_replies").update(patch).eq("id", id) : { error: null });
  }
  if (error) throw error;
}
// persist a new order: write sort = position for each id (list is small)
export async function saveQuickReplyOrder(ids) {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from("quick_replies").update({ sort: i + 1 }).eq("id", ids[i]);
    if (error) throw error;
  }
}
export async function deleteQuickReply(id) {
  const { error } = await supabase.from("quick_replies").delete().eq("id", id);
  if (error) throw error;
}

// ---------- standard end-of-document term presets (payment / freebies / warranty) ----------
export async function listDocTermPresets() {
  const { data, error } = await supabase.from("doc_term_presets").select("*").order("category").order("sort").order("id");
  if (error) throw error;
  return data || [];
}
export async function addDocTermPreset(category, title, body) {
  const { data } = await supabase.from("doc_term_presets").select("sort").eq("category", category).order("sort", { ascending: false }).limit(1);
  const nextSort = ((data && data[0] && data[0].sort) || 0) + 1;
  const { error } = await supabase.from("doc_term_presets").insert({ category, title: title.trim(), body: (body || "").trim(), sort: nextSort });
  if (error) throw error;
}
export async function updateDocTermPreset(id, fields) {
  const patch = {};
  if (fields.title != null) patch.title = String(fields.title).trim();
  if (fields.body != null) patch.body = String(fields.body).trim();
  const { error } = await supabase.from("doc_term_presets").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteDocTermPreset(id) {
  const { error } = await supabase.from("doc_term_presets").delete().eq("id", id);
  if (error) throw error;
}

// ---------- internal team chat (company room / DMs / groups / project rooms) ----------
async function _uid() { const { data: { user } } = await supabase.auth.getUser(); return user?.id || null; }

// ---------- audit trail (มิ migration 067) ----------
// Records who did a destructive/financial action, when, why, and (for deletes) the full
// record snapshot — so a hard-deleted document can still be reviewed/recovered later.
let _actorNameCache = null;
async function _actorName() {
  if (_actorNameCache) return _actorNameCache;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("name,email").eq("id", user.id).maybeSingle();
  _actorNameCache = data?.name || data?.email || null;
  return _actorNameCache;
}
// best-effort: an audit-write failure must NEVER block the primary action
export async function logAudit({ action, target_type, target_no, reason, snapshot }) {
  try {
    const uid = await _uid();
    const actor_name = await _actorName();
    await supabase.from("audit_logs").insert({
      actor: uid, actor_name, action, target_type,
      target_no: target_no != null ? String(target_no) : null,
      reason: reason ? String(reason).slice(0, 500) : null,
      snapshot: snapshot || null,
    });
  } catch (_) { /* ignore — table may not exist yet, or RLS blocks; never throw */ }
}
export async function listAuditLogs({ type = "all", action = "all", from, to, q, limit = 300 } = {}) {
  let query = supabase.from("audit_logs").select("*").order("ts", { ascending: false }).limit(limit);
  if (type && type !== "all") query = query.eq("target_type", type);
  if (action && action !== "all") query = query.eq("action", action);
  if (from) query = query.gte("ts", from + "T00:00:00");
  if (to) query = query.lte("ts", to + "T23:59:59");
  const { data, error } = await query;
  if (error) throw error;
  let rows = data || [];
  if (q) { const n = q.toLowerCase(); rows = rows.filter((r) => [r.target_no, r.actor_name, r.reason].some((f) => String(f || "").toLowerCase().includes(n))); }
  return rows;
}

// add all permanent staff to the "พนักงานประจำ" group (insert-only) — admin/exec only
export async function syncChatGroups() {
  const { error } = await supabase.rpc("chat_sync_groups");
  if (error) throw error;
}
// back-office group-membership management
export async function listRoomMembers(roomId) {
  const { data, error } = await supabase.rpc("chat_room_members", { p_room: roomId });
  if (error) throw error;
  return (data || []).map((r) => (typeof r === "string" ? r : r.user_id || r));
}
export async function addChatMember(roomId, userId) {
  const { error } = await supabase.rpc("chat_admin_add_member", { p_room: roomId, p_user: userId });
  if (error) throw error;
}
export async function removeChatMember(roomId, userId) {
  const { error } = await supabase.rpc("chat_admin_remove_member", { p_room: roomId, p_user: userId });
  if (error) throw error;
}

// ===================== CASH FLOW (ledger of money in/out · projected vs actual) =====================
export async function listCashEntries() {
  // cash_entries โตเร็วสุดในระบบ (ทุกใบแจ้งหนี้/ใบเสร็จ/PO/เบิกจ่าย/เงินเดือน) — ไม่กันเพดาน 1000 แถว เดือนล่าสุดจะหายจากจอทั้งเดือน
  return _fetchAll((f, t) => supabase.from("cash_entries").select("*", { count: "exact" }).order("entry_date", { ascending: true }).order("id").range(f, t));
}
export async function addCashEntry(e) {
  const uid = await _uid();
  const { error } = await supabase.from("cash_entries").insert({
    direction: e.direction, status: e.status, entry_date: e.entry_date,
    amount: Number(e.amount) || 0, note: e.note || null, source_type: "manual", edited: true, created_by: uid,
  });
  if (error) throw error;
}
export async function updateCashEntry(id, f) {
  const patch = { updated_at: new Date().toISOString(), edited: true };
  ["direction", "status", "entry_date", "note"].forEach((k) => { if (f[k] !== undefined) patch[k] = f[k]; });
  if (f.amount !== undefined) patch.amount = Number(f.amount) || 0;
  const { error } = await supabase.from("cash_entries").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteCashEntry(id, reason) {
  const { data: snap } = await supabase.from("cash_entries").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("cash_entries").delete().eq("id", id);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "cash_entry", target_no: id, reason, snapshot: snap });
}
export async function getOpeningBalance() {
  // ห้าม maybeSingle — ถ้าแถว opening ซ้ำ (บันทึกชนกัน 2 เครื่อง) maybeSingle จะ error เงียบแล้วได้ 0 → ยอดสะสมทั้งจอจมลบทั้งที่รายวันถูก
  const { data, error } = await supabase.from("cash_entries").select("id,amount").eq("source_type", "opening").order("id");
  if (error) throw error;
  return Number(data?.[0]?.amount) || 0;
}
export async function setOpeningBalance(amount) {
  const { data, error } = await supabase.from("cash_entries").select("id").eq("source_type", "opening").order("id");
  if (error) throw error;
  if (data && data.length) {
    const { error: e1 } = await supabase.from("cash_entries").update({ amount: Number(amount) || 0, updated_at: new Date().toISOString() }).eq("id", data[0].id);
    if (e1) throw e1;
    // ล้างแถวซ้ำที่เกิดจากบันทึกชนกัน (mig 147 ใส่ unique index กันเกิดใหม่)
    if (data.length > 1) await supabase.from("cash_entries").delete().in("id", data.slice(1).map((x) => x.id));
  } else {
    const uid = await _uid();
    const { error: e2 } = await supabase.from("cash_entries").insert({ direction: "in", status: "actual", entry_date: "2000-01-01", amount: Number(amount) || 0, note: "เงินสดยกมา", source_type: "opening", source_ref: "opening", created_by: uid });
    if (e2) throw e2;
  }
}
// seed/refresh ledger lines from documents (idempotent; never overwrites user-edited rows)
export async function syncCashEntriesFromDocs() {
  // งานนี้อ่าน 8 ตารางทั้งบริษัท และถูกเรียกท้ายทุกการบันทึกเอกสาร (รวมปุ่มที่ช่างกดบนมือถือ)
  // ⇒ ยิงเฉพาะคนที่ดูแลกระแสเงินสดจริง คนอื่นข้ามไป (ข้อมูลจะถูก sync ตอนบัญชี/ธุรการเปิดหน้าอยู่แล้ว)
  // + RLS ของ cash_entries เขียนได้เฉพาะกลุ่มนี้อยู่แล้ว คนอื่นยิงไปก็ได้แค่โหลดเปล่า ๆ
  try {
    const me = await getProfile();
    if (!["admin", "exec", "finance"].includes(me?.role)) return;
  } catch { return; }
  const _d = (ts) => (ts ? String(ts).slice(0, 10) : null);
  const [inv, rec, pay, po, poItems, cust, team, existing, salaryProfiles, laborJobs, expReq] = await Promise.all([
    // ตารางเอกสารโตเรื่อย ๆ — ถ้าอ่านไม่ครบ (เพดาน 1000 แถว) sync จะลบ cash lines ของใบที่อ่านไม่ถึง
    _fetchAll((f, t) => supabase.from("invoices").select("invoice_no,due_date,issue_date,total,wht_amt,status,customer_id", { count: "exact" }).order("invoice_no").range(f, t)).then((rows) => ({ data: rows })),
    _fetchAll((f, t) => supabase.from("receipts").select("receipt_no,issue_date,net,total,wht_amt,status,customer_id", { count: "exact" }).order("receipt_no").range(f, t)).then((rows) => ({ data: rows })),
    _fetchAll((f, t) => supabase.from("sub_payouts").select("id,team,net,status,paid_at,created_at", { count: "exact" }).order("id").range(f, t)).then((rows) => ({ data: rows })),
    _fetchAll((f, t) => supabase.from("purchase_orders").select("po_no,supplier,status,created_at,received_at,vat,paid_at,expense_id", { count: "exact" }).order("po_no").range(f, t)).then((rows) => ({ data: rows })),
    _fetchAll((f, t) => supabase.from("po_items").select("po_no,qty,price", { count: "exact" }).order("id").range(f, t)).then((rows) => ({ data: rows })), // กันเพดาน 1000 แถว
    _allRows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
    supabase.from("teams").select("id,name"),
    _fetchAll((f, t) => supabase.from("cash_entries").select("id,source_type,source_ref,edited", { count: "exact" }).neq("source_type", "manual").order("id").range(f, t)).then((rows) => ({ data: rows })), // ถ้าอ่านไม่ครบ sync จะสร้างซ้ำ
    // ฐานเงินเดือนพนักงานประจำ (ประมาณการเงินออก) — อยู่ที่ hr_pay ตั้งแต่ mig 154 · fallback ไป profiles ถ้ายังไม่รัน
    supabase.from("hr_pay").select("user_id,base_pay").eq("pay_type", "monthly").gt("base_pay", 0)
      .then((r) => (r.error ? supabase.from("profiles").select("id,base_pay").eq("pay_type", "monthly").gt("base_pay", 0) : { data: (r.data || []).map((x) => ({ id: x.user_id, base_pay: x.base_pay })) })),
    // confirmed subcontractor labor not yet fully covered by a payout = "ค่าแรงรอจ่าย"
    _fetchAll((f, t) => supabase.from("job_orders").select("job_no,assigned_team,labor_total,labor_paid_amt,labor_confirmed_at,scheduled_at,created_at", { count: "exact" }).eq("labor_confirmed", true).gt("labor_total", 0).order("job_no").range(f, t)).then((rows) => ({ data: rows })),
    // ใบเบิกจ่าย (เจ้าของกระแสเงินสดฝั่งจ่าย: จ่ายจริง + ประมาณการยอดค้าง) — mig 112
    _fetchAll((f, t) => supabase.from("expense_requests").select("id,title,amount,paid_amount,status,job_no,expected_pay_date,last_paid_at,paid_at,created_at", { count: "exact" }).in("status", ["pending", "approved", "paid"]).order("id").range(f, t)).then((rows) => ({ data: rows })),
  ]);
  const cn = Object.fromEntries((cust.data || []).map((c) => [c.id, c.name]));
  const tn = Object.fromEntries((team.data || []).map((t) => [t.id, (t.name || "").replace("Team ", "")]));
  const poTotal = {}; (poItems.data || []).forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + Number(it.qty) * Number(it.price); });

  const desired = [];
  // only UNPAID invoices are "expected income" — once paid, the money shows as its receipt (no double count)
  (inv.data || []).forEach((x) => { if (x.status !== "unpaid") return; desired.push({ source_type: "invoice", source_ref: x.invoice_no, direction: "in", status: "projected", entry_date: x.due_date || x.issue_date, amount: Math.max(0, (Number(x.total) || 0) - (Number(x.wht_amt) || 0)), note: `ใบแจ้งหนี้ ${x.invoice_no}${cn[x.customer_id] ? " · " + cn[x.customer_id] : ""}` }); });
  (rec.data || []).forEach((x) => { if (x.status !== "paid") return; desired.push({ source_type: "receipt", source_ref: x.receipt_no, direction: "in", status: "actual", entry_date: x.issue_date, amount: Number(x.net || ((Number(x.total) || 0) - (Number(x.wht_amt) || 0))) || 0, note: `ใบเสร็จ ${x.receipt_no}${cn[x.customer_id] ? " · " + cn[x.customer_id] : ""}` }); }); // fallback = total − WHT (เงินเข้าจริง)
  (pay.data || []).forEach((x) => { const paid = x.status === "paid"; desired.push({ source_type: "payout", source_ref: String(x.id), direction: "out", status: paid ? "actual" : "projected", entry_date: paid ? _d(x.paid_at) : _d(x.created_at), amount: Number(x.net) || 0, note: `จ่ายช่างซัพ${tn[x.team] ? " " + tn[x.team] : ""}` }); });
  // PO: จ่ายจริงเมื่อ "จ่ายเงินแล้ว" (paid_at ผ่านเมนูเบิกจ่าย) — ไม่ผูกกับการรับของ (รับก่อน/จ่ายก่อน เครดิตได้)
  // (fallback pre-100 เดิมถูกถอด — po มาจาก _fetchAll ซึ่ง throw แทนการคืน .error ทำให้ branch นั้นเป็นโค้ดตาย · DB จริงรันเกิน mig 100 ไปไกลแล้ว)
  const poRows = po.data;
  // PO ที่ผูกใบเบิก (expense_id) → ให้ใบเบิกคุมกระแสเงินสดแทน (รองรับแบ่งจ่าย) · PO ตรงที่ไม่ผูกใบเบิก ใช้เส้นนี้ตามเดิม
  (poRows || []).forEach((x) => { if (x.status === "cancelled" || x.expense_id) return; const paid = !!x.paid_at; const amt = Math.round((poTotal[x.po_no] || 0) * (x.vat ? 1.07 : 1) * 100) / 100; desired.push({ source_type: "po", source_ref: x.po_no, direction: "out", status: paid ? "actual" : "projected", entry_date: paid ? _d(x.paid_at) : _d(x.created_at), amount: amt, note: `ใบสั่งซื้อ ${x.po_no}${x.supplier ? " · " + x.supplier : ""}` }); });
  // ใบเบิกจ่าย: ยอดจ่ายแล้ว = จ่ายจริง · ยอดค้าง = ประมาณการจ่าย (วันแก้ได้) — คุมทั้งเบิกทั่วไปและค่าสินค้า PO
  (expReq.data || []).forEach((x) => {
    if (x.status === "rejected") return;
    const total = Math.round((Number(x.amount) || 0) * 100) / 100;
    const paidAmt = Math.round((Number(x.paid_amount) || 0) * 100) / 100;
    const remaining = Math.round((total - paidAmt) * 100) / 100;
    const label = `เบิกจ่าย: ${x.title || ""}${x.job_no ? " · งาน " + x.job_no : ""}`;
    if (paidAmt > 0.01) desired.push({ source_type: "expense_paid", source_ref: String(x.id), direction: "out", status: "actual", entry_date: _d(x.last_paid_at || x.paid_at || x.created_at), amount: paidAmt, note: label + (remaining > 0.01 ? " (จ่ายบางส่วน)" : "") });
    if (remaining > 0.01 && x.status !== "paid") desired.push({ source_type: "expense_due", source_ref: String(x.id), direction: "out", status: "projected", entry_date: x.expected_pay_date || _d(x.created_at), amount: remaining, note: label + (paidAmt > 0.01 ? " (ยอดค้างจ่าย)" : " (รอจ่าย)") });
  });
  // ค่าแรงช่างซัพที่ยืนยันแล้ว แต่ยังเหลือค้างจ่าย (ยังไม่ตั้งเบิก) → คาดว่าจะจ่าย · พอตั้งเบิกแล้ว remaining=0 รายการนี้หายเอง ไปโผล่เป็น payout แทน
  (laborJobs.data || []).forEach((j) => {
    const remaining = Math.round(((Number(j.labor_total) || 0) - (Number(j.labor_paid_amt) || 0)) * 100) / 100;
    if (remaining <= 0.01) return;
    desired.push({ source_type: "labor_owed", source_ref: j.job_no, direction: "out", status: "projected",
      entry_date: _d(j.labor_confirmed_at || j.scheduled_at || j.created_at),
      amount: remaining, note: `ค่าแรงช่างซัพรอจ่าย · ${j.job_no}${tn[j.assigned_team] ? " · " + tn[j.assigned_team] : ""}` });
  });
  const salaryList = salaryProfiles.data || [];
  const totalSalary = salaryList.reduce((s, p) => s + (Number(p.base_pay) || 0), 0);
  if (totalSalary > 0) {
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const yy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, "0");
      desired.push({ source_type: "salary", source_ref: `salary-${yy}-${mm}`, direction: "out", status: "projected", entry_date: `${yy}-${mm}-01`, amount: totalSalary, note: `เงินเดือนพนักงาน ${salaryList.length} คน` });
    }
  }

  // เบิกเงินล่วงหน้าพนักงานที่โอนแล้ว = เงินออกจริง (mig 147 เพิ่ม source_type 'advance') — เงินเดือนสุทธิหัก advance อยู่แล้ว จึงไม่นับซ้ำ (advance + net = gross)
  // อ่านเฉพาะ role office: RLS ของ hr_advances กรองแถวเงียบ ๆ ให้ role อื่นเห็นแค่ของตัวเอง — ถ้าปล่อยผ่าน sync จะกวาดเส้นของคนอื่นทิ้ง (บทเรียนเดียวกับ mig 085)
  let advRows = null, pnAdv = {};
  try {
    const { data: meRow } = await supabase.from("profiles").select("role").eq("id", await _uid()).maybeSingle();
    if (["admin", "exec", "finance", "hr"].includes(meRow?.role)) {
      advRows = await _fetchAll((f, t) => supabase.from("hr_advances").select("id,user_id,amount,paid_out_at", { count: "exact" }).not("paid_out_at", "is", null).order("id").range(f, t));
      pnAdv = Object.fromEntries(((await supabase.from("profiles").select("id,name")).data || []).map((p) => [p.id, p.name]));
    }
  } catch (_) { advRows = null; }
  if (advRows) advRows.forEach((x) => desired.push({ source_type: "advance", source_ref: String(x.id), direction: "out", status: "actual", entry_date: _d(x.paid_out_at), amount: Number(x.amount) || 0, note: `เบิกเงินล่วงหน้า${pnAdv[x.user_id] ? " · " + pnAdv[x.user_id] : ""}` }));

  const exMap = {}; (existing.data || []).forEach((e) => { exMap[`${e.source_type}:${e.source_ref}`] = e; });
  const uid = await _uid();
  const desiredKeys = new Set();
  const toInsert = []; let updated = 0;
  for (const d of desired) {
    if (!d.entry_date || !(d.amount > 0)) continue;
    desiredKeys.add(`${d.source_type}:${d.source_ref}`);
    const ex = exMap[`${d.source_type}:${d.source_ref}`];
    if (!ex) toInsert.push({ ...d, created_by: uid });
    else if (!ex.edited) { await supabase.from("cash_entries").update({ direction: d.direction, status: d.status, entry_date: d.entry_date, amount: d.amount, note: d.note, updated_at: new Date().toISOString() }).eq("id", ex.id); updated++; }
  }
  if (toInsert.length) {
    let { error } = await supabase.from("cash_entries").insert(toInsert);
    // pre-147: CHECK constraint ยังไม่รับ 'advance' — insert ส่วนที่เหลือไปก่อน อย่าให้ sync ทั้งก้อนพัง
    if (error && /source_type|check/i.test(error.message || "")) {
      const noAdv = toInsert.filter((d) => d.source_type !== "advance");
      error = noAdv.length ? (await supabase.from("cash_entries").insert(noAdv)).error : null;
    }
    if (error) throw error;
  }
  // remove stale doc-sourced lines — e.g. an invoice's "คาดว่าจะรับ" line once it's paid (money then shows as its
  // receipt's "ได้รับจริง") or cancelled. Only touch the source types this sync manages; manual/opening lines never touched.
  // หมายเหตุ edited: flag นี้ปกป้องแค่ "ค่าที่แก้มือ" (วัน/ยอด) ไม่ให้ sync เขียนทับตอนเอกสารยังมีชีวิต —
  // แต่พอเอกสารต้นทางถูกยกเลิก/ลบ/จ่ายแล้ว เส้นเงินต้องถูกลบตามเสมอ (เคยเว้น edited ไว้ → ใบแจ้งหนี้ยกเลิกแล้วยอดค้างในประมาณการตลอดกาล)
  // ยกเว้น "salary": desired มีแค่ 12 เดือนข้างหน้า (ไม่ใช่ snapshot ครบชุด) — แถวเงินเดือนจ่ายจริงของเดือนเก่า (edited=true จาก upsertPayrollCashEntry)
  // อยู่นอกหน้าต่างโดยชอบธรรม ห้ามกวาดทิ้ง · ลบได้เฉพาะตัวประมาณการ (ไม่ edited) ที่หลุดหน้าต่าง
  const MANAGED = new Set(["invoice", "receipt", "payout", "po", "salary", "labor_owed", "expense_paid", "expense_due", ...(advRows ? ["advance"] : [])]); // advance จัดการเฉพาะรอบที่อ่าน hr_advances ได้ครบ
  const staleIds = (existing.data || []).filter((e) => MANAGED.has(e.source_type) && !desiredKeys.has(`${e.source_type}:${e.source_ref}`)
    && (e.source_type !== "salary" || !e.edited)).map((e) => e.id);
  for (let i = 0; i < staleIds.length; i += 100) {
    const { error } = await supabase.from("cash_entries").delete().in("id", staleIds.slice(i, i + 100));
    if (error) throw error;
  }
  return { added: toInsert.length, updated, removed: staleIds.length };
}

// rooms visible to me (company + ones I'm a member of) with title, last message, unread count
export async function listChatRooms() {
  const uid = await _uid();
  let [rooms, members, staff] = await Promise.all([
    supabase.from("chat_rooms").select("*"),
    supabase.from("chat_members").select("room_id,user_id,last_read_at"),
    supabase.from("profiles").select("id,name,email,avatar_url"),
  ]);
  if (rooms.error) throw rooms.error;
  if (staff.error && /avatar_url/i.test(staff.error.message || "")) staff = await supabase.from("profiles").select("id,name,email"); // migration 083 not run yet
  const nameById = Object.fromEntries((staff.data || []).map((p) => [p.id, p.name || p.email]));
  const avById = Object.fromEntries((staff.data || []).map((p) => [p.id, p.avatar_url]));
  const memByRoom = {}; (members.data || []).forEach((m) => { (memByRoom[m.room_id] = memByRoom[m.room_id] || []).push(m); });
  const myRead = {}; (members.data || []).forEach((m) => { if (m.user_id === uid) myRead[m.room_id] = m.last_read_at; });
  // ⚠️ เดิมดึง 500 ข้อความล่าสุด "รวมทุกห้อง" ก้อนเดียว — ถ้าห้องบริษัท/DM คุยกันรัวจน 500 ข้อความเต็ม
  //    ห้องเงียบที่มีข้อความยังไม่อ่านจริงจะไม่ติดมาเลย → ป้ายยังไม่อ่าน = 0 ทั้งที่มีของค้าง (กระดิ่ง sidebar ก็ต่ำตาม)
  //    แก้เป็นถามทีละห้อง (จำนวนห้องต่อคนมีจำกัด): ข้อความล่าสุด 1 แถว + นับยังไม่อ่านด้วย count query
  const last = {}, unread = {};
  await Promise.all((rooms.data || []).map(async (r) => {
    const lm = await supabase.from("chat_messages").select("room_id,text,image_url,file_url,file_name,created_at,sender").eq("room_id", r.id).order("created_at", { ascending: false }).limit(1);
    if (lm.data && lm.data[0]) last[r.id] = lm.data[0];
    const lr = myRead[r.id];
    if (lr) {
      const { count } = await supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("room_id", r.id).gt("created_at", lr).neq("sender", uid);
      if (count) unread[r.id] = count;
    }
  }));
  return (rooms.data || []).map((r) => {
    const mem = memByRoom[r.id] || [];
    const otherIds = mem.filter((m) => m.user_id !== uid).map((m) => m.user_id);
    const others = otherIds.map((id) => nameById[id]).filter(Boolean);
    let title = r.name;
    if (r.kind === "dm") title = others[0] || "ส่วนตัว";
    if (!title && r.kind === "company") title = "ทั้งบริษัท";
    if (!title && (r.kind === "group" || r.kind === "project")) title = others.slice(0, 3).join(", ") || "กลุ่ม";
    // DM shows the other person's avatar; group/room shows its own avatar
    const avatar_url = r.kind === "dm" ? (avById[otherIds[0]] || null) : (r.avatar_url || null);
    const lm = last[r.id];
    return { ...r, title, avatar_url, dmPartner: r.kind === "dm" ? (otherIds[0] || null) : null,
      memberNames: others, memberIds: mem.map((m) => m.user_id), memberCount: mem.length,
      lastText: lm ? (lm.text || (lm.image_url ? "[รูปภาพ]" : lm.file_url ? `[ไฟล์] ${lm.file_name || ""}` : "")) : "", lastAt: lm ? lm.created_at : r.created_at, unread: unread[r.id] || 0 };
  }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

// total unread team-chat messages across my rooms — for the sidebar badge + app-icon badge
export async function countUnreadTeamChats() {
  // นับใน query เดียวผ่าน RPC (mig 195) — เลี่ยง listChatRooms ที่วน chat_messages N+1 ต่อห้อง
  const { data, error } = await supabase.rpc("team_unread_count");
  if (!error && typeof data === "number") return data;
  // fallback ก่อนรัน mig 195
  const rooms = await listChatRooms();
  return rooms.reduce((a, r) => a + (r.unread || 0), 0);
}

// โหลดข้อความห้อง — เอา "ล่าสุด" ก่อนเสมอ (เรียงใหม่→เก่า + limit แล้วกลับด้าน)
// ห้ามโหลดทั้งห้องแบบเรียงเก่า→ใหม่: เกินเพดาน 1000 แถวเมื่อไหร่ ข้อความใหม่จะหายทั้งห้อง
// before = created_at ของข้อความบนสุดที่มี → ดึงหน้าถัดไปย้อนหลัง (ปุ่ม "ดูข้อความเก่า")
export const CHAT_PAGE = 150;
export async function listChatMessages(roomId, { before, limit = CHAT_PAGE } = {}) {
  let q = supabase.from("chat_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: false }).limit(limit);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  const msgs = (data || []).reverse();
  // แนบรีแอกชัน (mig 190) — { emoji: {count, mine} } ต่อข้อความ · ไม่มีตาราง (ยังไม่รัน) = ข้าม
  const ids = msgs.map((m) => m.id);
  if (ids.length) {
    try {
      const uid = await _uid().catch(() => null);
      const { data: rx } = await supabase.from("chat_reactions").select("message_id,user_id,emoji").in("message_id", ids);
      const byMsg = {};
      (rx || []).forEach((r) => { const g = byMsg[r.message_id] = byMsg[r.message_id] || {}; const e = g[r.emoji] = g[r.emoji] || { count: 0, mine: false }; e.count++; if (r.user_id === uid) e.mine = true; });
      msgs.forEach((m) => { m.reactions = byMsg[m.id] || {}; });
    } catch (_) { /* ยังไม่รัน mig 190 */ }
  }
  return msgs;
}

// fire-and-forget Web Push to the room's other members (no-op if VAPID isn't configured)
async function _firePush(roomId, body) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const name = (await _meSafe())?.name || "ทีมงาน";
    fetch("/api/push-send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ roomId, title: "แชตทีม · " + name, body, url: "/#teamchat" }),
    }).catch(() => {});
  } catch (_) {}
}

// หมายเหตุ: เลิกสร้าง in-app notification ให้สมาชิกทุกคนทุกข้อความแล้ว (กระดิ่งสแปม)
// — แชตทีมมี unread badge ของตัวเองในเมนู + Web Push (_firePush) ตอนไม่ได้เปิดแอปอยู่แล้ว
// เหลือแจ้งเตือนเฉพาะคนถูก @แท็ก (ใน sendChatMessage ด้านล่าง)
export async function sendChatMessage(roomId, text, mentionIds = [], replyTo = null) {
  const uid = await _uid();
  const row = { room_id: roomId, sender: uid, text: text.trim(), ...(replyTo ? { reply_to: replyTo } : {}) };
  let { error } = await supabase.from("chat_messages").insert(row);
  if (error && /reply_to|PGRST204/i.test(error.message || "") && replyTo) { delete row.reply_to; ({ error } = await supabase.from("chat_messages").insert(row)); }   // pre-190 fallback
  if (error) throw error;
  _firePush(roomId, text.trim());
  if (mentionIds.length) {
    const me = await _meSafe();
    notify(mentionIds.filter((id) => id !== uid), {
      category: "team_chat", title: `📣 ${me?.name || "ทีมงาน"} แท็กคุณ`,
      body: text.trim().slice(0, 120), url: "teamchat", ref_type: "room", ref_no: String(roomId), push: false,
    });
  }
}
export async function sendChatImage(roomId, imageUrl) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_messages").insert({ room_id: roomId, sender: uid, image_url: imageUrl, text: null });
  if (error) throw error;
  _firePush(roomId, "[รูปภาพ]");
}
export async function sendChatFile(roomId, fileUrl, fileName) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_messages").insert({ room_id: roomId, sender: uid, file_url: fileUrl, file_name: fileName || "ไฟล์", text: null });
  if (error) throw error;
  _firePush(roomId, `[ไฟล์] ${fileName || "ไฟล์"}`);
}
// รีแอกชัน (mig 190) — on=ใส่ / off=เอาออก (1 คน 1 อีโมจิต่อข้อความ)
export async function toggleReaction(messageId, emoji, on) {
  const uid = await _uid();
  if (on) { const { error } = await supabase.from("chat_reactions").insert({ message_id: messageId, user_id: uid, emoji }); if (error && !/duplicate|unique|already/i.test(error.message || "")) throw new Error(/chat_reactions|relation|PGRST20/i.test(error.message || "") ? "ต้องรัน migration 190 ใน Supabase ก่อน" : error.message); }
  else { const { error } = await supabase.from("chat_reactions").delete().eq("message_id", messageId).eq("user_id", uid).eq("emoji", emoji); if (error) throw error; }
}
// ลบข้อความตัวเอง (ซอฟต์ ผ่าน RPC — เฉพาะเจ้าของ)
export async function deleteChatMessage(messageId) {
  const { error } = await supabase.rpc("chat_delete_message", { p_msg: messageId });
  if (error) throw new Error(/chat_delete_message|function|schema cache/i.test(error.message || "") ? "ต้องรัน migration 190 ใน Supabase ก่อน" : error.message);
}

// find-or-create a 1:1 DM room — done in a SECURITY DEFINER RPC so it isn't blocked by insert RLS
export async function createDmRoom(otherId) {
  const { data, error } = await supabase.rpc("chat_start_dm", { p_other: otherId });
  if (error) throw error;
  return data;
}

// create a group/project room (+ members) via RPC. memberIds excludes self (added automatically).
export async function createChatRoom({ name, memberIds = [], refType = null, refNo = null }) {
  const { data, error } = await supabase.rpc("chat_create_room", { p_name: name || "", p_members: memberIds, p_ref_type: refType, p_ref_no: refNo });
  if (error) throw error;
  return data;
}

// แปลภาษา ไทย↔พม่า (ตรวจต้นทางอัตโนมัติ) ผ่าน /api/translate — ใช้ในแชตทีม
export async function translateText(text, target) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ text, target }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "แปลไม่สำเร็จ");
  return j.text;
}

// ลบห้องกลุ่ม/ห้องงานถาวร (ธุรการ/ผู้บริหาร) — RPC มิเกรชัน 135: ลบข้อความ+สมาชิก+ห้องทั้งชุด
export async function deleteChatRoom(roomId) {
  const { error } = await supabase.rpc("chat_delete_room", { p_room: roomId });
  if (error) throw /chat_delete_room|schema cache/i.test(error.message || "") ? new Error("ต้องรัน migration 135 ใน Supabase ก่อน") : error;
}

// แก้ชื่อห้องกลุ่ม/ห้องงาน (ทีมหลังบ้าน) — RPC มิเกรชัน 136
export async function renameChatRoom(roomId, name) {
  const { error } = await supabase.rpc("chat_rename_room", { p_room: roomId, p_name: name });
  if (error) throw /chat_rename_room|schema cache/i.test(error.message || "") ? new Error("ต้องรัน migration 136 ใน Supabase ก่อน") : error;
}

// ---------- โน้ตประจำห้องแชต (มิเกรชัน 137) — ข้อความ + รูปแนบไม่จำกัด ----------
const noteErr = (e) => /chat_notes|schema cache/i.test(e?.message || "") ? new Error("ต้องรัน migration 137 ใน Supabase ก่อน") : e;
export async function listChatNotes(roomId) {
  const { data, error } = await supabase.from("chat_notes").select("*").eq("room_id", roomId).order("created_at", { ascending: false });
  if (error) throw noteErr(error);
  return data || [];
}
export async function saveChatNote({ id, room_id, text, images }) {
  const row = { text: (text || "").trim(), images: images || [] };
  if (id) {
    const { error } = await supabase.from("chat_notes").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw noteErr(error);
  } else {
    const uid = await _uid();
    const { error } = await supabase.from("chat_notes").insert({ ...row, room_id, author: uid });
    if (error) throw noteErr(error);
  }
}
export async function deleteChatNote(id) {
  const { error } = await supabase.from("chat_notes").delete().eq("id", id);
  if (error) throw noteErr(error);
}
// ดัชนีโน้ตทุกห้องที่ฉันเห็น (RLS กรองให้) — ใช้ให้ช่องค้นหาห้องหาเนื้อโน้ตเจอด้วย
export async function listAllChatNotes() {
  // limit(2000) เกินเพดานจริง (1000) และไม่มี order → ค้นหาห้องได้ผลไม่แน่นอน ⇒ ไล่ทีละหน้า
  const { data, error } = await _allRows((f, t) => supabase.from("chat_notes").select("room_id,text", { count: "exact" }).order("id").range(f, t));
  if (error) throw noteErr(error);
  return data || [];
}

// mark a room read up to now (creates my membership row for the company room on first open)
export async function markChatRead(roomId) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_members").upsert({ room_id: roomId, user_id: uid, last_read_at: new Date().toISOString() }, { onConflict: "room_id,user_id" });
  if (error) throw error;
}

// ---------- cross-document links (full chain both directions) ----------
// chain is keyed by quote_no: BOQ → quote → invoices/job-orders → receipts
export function listDocLinks() { return _cached("listDocLinks", _loadDocLinks, _SHORT_TTL); }
async function _loadDocLinks() {
  const [q, inv, rc, jo, po, an] = await Promise.all([
    _allRows((f, t) => supabase.from("quotations").select("quote_no,boq_no", { count: "exact" }).order("quote_no").range(f, t)),
    _allRows((f, t) => supabase.from("invoices").select("invoice_no,quote_no", { count: "exact" }).neq("status", "cancelled").order("invoice_no").range(f, t)),
    _allRows((f, t) => supabase.from("receipts").select("receipt_no,invoice_no,quote_no,job_no,boq_no", { count: "exact" }).neq("status", "cancelled").order("receipt_no").range(f, t)), // ใบเสร็จยกเลิกไม่ขึ้นชิป (กติกา: ใบยกเลิก = จบสาย)
    _allRows((f, t) => supabase.from("job_orders").select("job_no,quote_no,status", { count: "exact" }).order("job_no").range(f, t)),
    _allRows((f, t) => supabase.from("purchase_orders").select("po_no,quote_no,status", { count: "exact" }).order("po_no").range(f, t)).catch(() => ({ data: [] })), // pre-100 → ยังไม่มี quote_no
    _allRows((f, t) => supabase.from("adjustment_notes").select("note_no,kind,quote_no,invoice_no,receipt_no", { count: "exact" }).neq("status", "cancelled").order("note_no").range(f, t)).catch(() => ({ data: [] })), // mig 218 ยังไม่รัน → ข้าม
  ]);
  const byQuote = {};
  // สถานะใบงานรายใบ — เอกสารทุกใบในสายใช้ติดป้าย "✓ เสร็จปิดงาน" บนชิปงาน
  const jobStatusBy = Object.fromEntries((jo.data || []).map((x) => [x.job_no, x.status]));
  const ensure = (qn) => (byQuote[qn] = byQuote[qn] || { boqNo: null, jobNos: [], invoiceNos: [], receiptNos: [], poNos: [], poOpen: 0, creditNos: [], debitNos: [] });
  (q.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).boqNo = x.boq_no || null; });
  (jo.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).jobNos.push(x.job_no); });
  (inv.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).invoiceNos.push(x.invoice_no); });
  (rc.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).receiptNos.push(x.receipt_no); });
  (po.data || []).forEach((x) => { if (x.quote_no && x.status !== "cancelled") { const e = ensure(x.quote_no); e.poNos.push(x.po_no); if (x.status === "open") e.poOpen += 1; } });
  // ใบลด/เพิ่มหนี้ (mig 218) — อ้าง quote_no ตรง ๆ หรือสืบจากใบเสร็จ/ใบแจ้งหนี้ต้นทาง
  const invToQuoteEarly = {}; (inv.data || []).forEach((x) => { if (x.quote_no) invToQuoteEarly[x.invoice_no] = x.quote_no; });
  const rcToQuoteEarly = {}; (rc.data || []).forEach((x) => { if (x.quote_no) rcToQuoteEarly[x.receipt_no] = x.quote_no; });
  (an.data || []).forEach((x) => {
    const qn = x.quote_no || (x.invoice_no && invToQuoteEarly[x.invoice_no]) || (x.receipt_no && rcToQuoteEarly[x.receipt_no]);
    if (!qn) return; const e = ensure(qn); (x.kind === "debit" ? e.debitNos : e.creditNos).push(x.note_no);
  });
  // reverse lookups → quote_no (so any doc can find its chain)
  const boqToQuote = {}, jobToQuote = {}, invToQuote = {}, rcToQuote = {}, poToQuote = {}, cnToQuote = {}, dnToQuote = {};
  (q.data || []).forEach((x) => { if (x.boq_no) boqToQuote[x.boq_no] = x.quote_no; });
  (jo.data || []).forEach((x) => { if (x.quote_no) jobToQuote[x.job_no] = x.quote_no; });
  (inv.data || []).forEach((x) => { if (x.quote_no) invToQuote[x.invoice_no] = x.quote_no; });
  (rc.data || []).forEach((x) => { if (x.quote_no) rcToQuote[x.receipt_no] = x.quote_no; });
  (po.data || []).forEach((x) => { if (x.quote_no) poToQuote[x.po_no] = x.quote_no; });
  (an.data || []).forEach((x) => { const qn = x.quote_no || (x.invoice_no && invToQuoteEarly[x.invoice_no]) || (x.receipt_no && rcToQuoteEarly[x.receipt_no]); if (qn) (x.kind === "debit" ? dnToQuote : cnToQuote)[x.note_no] = qn; });
  return { byQuote, boqToQuote, jobToQuote, invToQuote, rcToQuote, poToQuote, cnToQuote, dnToQuote, jobStatusBy };
}

// ---------- เครื่องมือช่าง (mig 122): ทะเบียน + เบิก/คืน/แจ้งชำรุด ----------
const _toolErr = (e) => new Error(/tool/.test(e.message || "") && /relation|find|exist/i.test(e.message || "") ? "ยังไม่ได้รัน migration 122 ใน Supabase" : e.message || e);

export async function listTools() {
  const [t, tm, pf, ty] = await Promise.all([
    supabase.from("tools").select("*").order("name"),
    supabase.from("teams").select("id,name"),
    supabase.from("profiles").select("id,name,email"),
    supabase.from("tool_types").select("id,name,emoji,photo_url")
      .then((r) => r.error ? supabase.from("tool_types").select("id,name,emoji") : r, () => ({ data: [] })),  // pre-181 → ไม่มี photo_url · pre-179 → ว่าง
  ]);
  if (t.error) throw _toolErr(t.error);
  const tn = Object.fromEntries((tm.data || []).map((x) => [x.id, x.name]));
  const pn = Object.fromEntries((pf.data || []).map((x) => [x.id, x.name || x.email]));
  const tyMap = Object.fromEntries((ty.data || []).map((x) => [x.id, x]));
  return (t.data || []).map((x) => ({ ...x,
    teamName: x.team ? (tn[x.team] || x.team) : null,
    holderName: x.holder ? (pn[x.holder] || "—") : null,
    typeName: x.type_id ? (tyMap[x.type_id]?.name || null) : null,
    typeEmoji: x.type_id ? (tyMap[x.type_id]?.emoji || null) : null,
    typePhoto: x.type_id ? (tyMap[x.type_id]?.photo_url || null) : null,
  }));
}

export async function saveTool(t) {
  const row = { code: t.code?.trim() || null, name: t.name?.trim(), brand: t.brand?.trim() || null, detail: t.detail?.trim() || null, photo_url: t.photo_url || null,
    type_id: t.type_id || null,
    location: t.location || "stock", team: t.location === "vehicle" ? (t.team || null) : null,
    holder: t.location === "person" ? (t.holder || null) : null, status: t.status || "normal", note: t.note?.trim() || null };
  const run = () => (t.id ? supabase.from("tools").update(row).eq("id", t.id) : supabase.from("tools").insert(row));
  let { error } = await run();
  if (error && /brand/i.test(error.message || "")) { delete row.brand; ({ error } = await run()); }       // pre-124 fallback
  if (error && /type_id/i.test(error.message || "")) { delete row.type_id; ({ error } = await run()); }    // pre-179 fallback
  if (error) throw _toolErr(error);
}

export async function deleteTool(id) {
  const { error } = await supabase.from("tools").delete().eq("id", id);
  if (error) throw _toolErr(error);
}

// เพิ่มเครื่องมือหลายชิ้นรวดเดียว (ปุ่ม "เติมชุดมาตรฐาน")
export async function addToolsBatch(rows) {
  if (!rows?.length) return;
  const clean = rows.map((r) => ({ name: r.name?.trim(), type_id: r.type_id || null, photo_url: r.photo_url || null,
    location: r.location || "stock", team: r.location === "vehicle" ? (r.team || null) : null,
    holder: r.location === "person" ? (r.holder || null) : null, status: r.status || "normal", note: r.note?.trim() || null }));
  let { error } = await supabase.from("tools").insert(clean);
  if (error && /type_id/i.test(error.message || "")) { clean.forEach((r) => delete r.type_id); ({ error } = await supabase.from("tools").insert(clean)); }
  if (error) throw _toolErr(error);
}

// ---------- เมนูหลัก "ชนิดเครื่องมือ" + ชุดมาตรฐาน (mig 179) ----------
export async function listToolTypes() {
  const { data, error } = await supabase.from("tool_types").select("*").order("sort").order("name");
  if (error) { if (/relation|exist|find/i.test(error.message || "")) return []; throw error; }  // pre-179 → ว่าง
  return data || [];
}
export async function saveToolType(t) {
  const row = { id: (t.id || "tt" + Date.now().toString(36)).trim(), name: t.name?.trim(), emoji: t.emoji?.trim() || null,
    photo_url: t.photo_url || null,
    std_personal: Number(t.std_personal) || 0, std_vehicle: Number(t.std_vehicle) || 0,
    sort: Number(t.sort) || 0, active: t.active === false ? false : true };
  let { error } = await supabase.from("tool_types").upsert(row, { onConflict: "id" });
  if (error && /photo_url/i.test(error.message || "")) { delete row.photo_url; ({ error } = await supabase.from("tool_types").upsert(row, { onConflict: "id" })); }  // pre-181 fallback
  if (error) throw error;
  return row.id;
}
export async function deleteToolType(id) {
  const { error } = await supabase.from("tool_types").delete().eq("id", id);
  if (error) throw error;
}

// คำขอเบิก/คืน/แจ้งชำรุด — สร้างโดยใครก็ได้ รออนุมัติโดยธุรการวัสดุ/ธุรการ/ผู้บริหาร
export async function requestToolMove(m) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("tool_moves").insert({
    tool_id: m.tool_id, move_type: m.move_type, to_loc: m.to_loc || null, to_team: m.to_team || null,
    to_holder: m.to_holder || null, to_status: m.to_status || null, job_no: m.job_no?.trim() || null,
    note: m.note?.trim() || null, requested_by: user?.id || null,
  });
  if (error) throw _toolErr(error);
}

export async function listToolMoves() {
  const [mv, t, pf, tm] = await Promise.all([
    supabase.from("tool_moves").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("tools").select("id,name,code"),
    supabase.from("profiles").select("id,name,email"),
    supabase.from("teams").select("id,name"),
  ]);
  if (mv.error) throw _toolErr(mv.error);
  const tn = Object.fromEntries((t.data || []).map((x) => [x.id, x]));
  const pn = Object.fromEntries((pf.data || []).map((x) => [x.id, x.name || x.email]));
  const tmn = Object.fromEntries((tm.data || []).map((x) => [x.id, x.name]));
  return (mv.data || []).map((x) => ({ ...x, toolName: tn[x.tool_id]?.name || `#${x.tool_id}`, toolCode: tn[x.tool_id]?.code || null,
    requesterName: pn[x.requested_by] || "—", deciderName: x.decided_by ? pn[x.decided_by] || null : null,
    toHolderName: x.to_holder ? pn[x.to_holder] || "—" : null, toTeamName: x.to_team ? tmn[x.to_team] || x.to_team : null }));
}

export async function deleteToolMove(id) {
  const { error } = await supabase.from("tool_moves").delete().eq("id", id);
  if (error) throw _toolErr(error);
}

// อนุมัติ/ปฏิเสธคำขอ — อนุมัติแล้วย้ายเครื่องมือ/อัปเดตสถานะให้เลย
export async function decideToolMove(mv, approve) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("tool_moves")
    .update({ status: approve ? "approved" : "rejected", decided_by: user?.id || null, decided_at: new Date().toISOString() })
    .eq("id", mv.id);
  if (error) throw _toolErr(error);
  if (!approve) return;
  if (mv.move_type === "report") {
    const { error: e2 } = await supabase.from("tools").update({ status: mv.to_status || "broken" }).eq("id", mv.tool_id);
    if (e2) throw _toolErr(e2);
  } else {
    const loc = mv.move_type === "return" ? "stock" : (mv.to_loc || "person");
    const { error: e2 } = await supabase.from("tools").update({
      location: loc, team: loc === "vehicle" ? mv.to_team || null : null, holder: loc === "person" ? mv.to_holder || null : null,
    }).eq("id", mv.tool_id);
    if (e2) throw _toolErr(e2);
  }
}

// ---------- ภาษีมูลค่าเพิ่มเดือนนี้ (การ์ดแดชบอร์ด): ภาษีขายจากใบเสร็จ · ภาษีซื้อจาก PO ที่ติ๊ก VAT ----------
export async function vatSummary(ym) {
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const from = `${ym}-01`, to = `${ym}-${String(last).padStart(2, "0")}`;
  // PO กรองช่วงเดือนฝั่ง server (เดิมดึงทุกปีมากรองฝั่ง client — โดนเพดาน 1000 แถวก่อนกรอง ภาษีซื้อขาด)
  const [rc, po, an] = await Promise.all([
    _fetchAll((f, t) => supabase.from("receipts").select("vat_amt,status,issue_date,receipt_no", { count: "exact" }).neq("status", "cancelled").gte("issue_date", from).lte("issue_date", to).order("receipt_no").range(f, t)).then((rows) => ({ data: rows })),
    _fetchAll((f, t) => supabase.from("purchase_orders").select("po_no,vat,status,issue_date,created_at", { count: "exact" }).neq("status", "cancelled").eq("vat", true)
      .or(`and(issue_date.gte.${from},issue_date.lte.${to}),and(issue_date.is.null,created_at.gte.${from},created_at.lte.${to}T23:59:59)`)
      .order("po_no").range(f, t)).then((rows) => ({ data: rows })),
    // ใบลด/เพิ่มหนี้ (mig 218) มี VAT → ปรับภาษีขายเดือนนั้น (credit ลบ · debit บวก) · fallback ถ้ายังไม่รัน
    supabase.from("adjustment_notes").select("kind,vat_amt,is_vat,status,issue_date").eq("status", "issued").eq("is_vat", true).gte("issue_date", from).lte("issue_date", to).then((r) => r).catch(() => ({ data: [] })),
  ]);
  const noteVat = (an.data || []).reduce((a, x) => a + (x.kind === "debit" ? 1 : -1) * (Number(x.vat_amt) || 0), 0);
  const saleVat = (rc.data || []).reduce((a, r) => a + (Number(r.vat_amt) || 0), 0) + noteVat;
  const pos = (po.data || []).filter((x) => { const d = x.issue_date || (x.created_at || "").slice(0, 10); return d >= from && d <= to; });
  let buyVat = 0;
  const nos = pos.map((x) => x.po_no);
  for (let i = 0; i < nos.length; i += 300) {
    const { data: items, error } = await supabase.from("po_items").select("po_no,qty,price").in("po_no", nos.slice(i, i + 300));
    if (error) throw error;
    (items || []).forEach((it) => { buyVat += (Number(it.qty) || 0) * (Number(it.price) || 0) * 0.07; });   // ราคาที่เก็บเป็นก่อน VAT เสมอ
  }
  return { saleVat: _round2(saleVat), buyVat: _round2(buyVat), net: _round2(saleVat - buyVat), saleCount: (rc.data || []).length, buyCount: pos.length };
}
