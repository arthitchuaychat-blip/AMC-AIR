import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { deriveJobStatus } from "./schedule";
import { ROLE_LABEL } from "./permissions";

// HR position = the role assigned in Settings (single source of truth), falling back to any legacy free-text department
const posLabel = (p) => (p && (ROLE_LABEL[p.role] || p.department)) || "";

const _url = import.meta.env.VITE_SUPABASE_URL;
const _anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  const { error } = await supabase.from("categories").upsert(
    { id: c.id.trim(), name_th: c.name_th.trim(), name_en: c.name_en?.trim() || null },
    { onConflict: "id" }
  );
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
export async function listTeams() {
  const { data, error } = await supabase.from("teams").select("*").order("id");
  if (error) throw error;
  return (data || []).map((t, i) => ({ ...t, color: t.color || TEAM_PALETTE[i % TEAM_PALETTE.length] }));
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
export async function listMaterialsLite() {
  const cats = await listCategories();
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const PAGE = 1000;
  const all = [];
  const FULL = "code,name_th,name_en,kind,brand,btu,ac_type,category,unit,cost,sale_price,description,photo_url,tracked,min_stock,init_stock,power_cost_year,features,purchase_unit,purchase_qty,btu_min,btu_max,series,voltage,refrigerant,seer,pipe_size,energy_label,warranty";
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
}

// แก้เฉพาะ "คุณสมบัติ" ของสินค้ารายตัว (แอร์ที่ไม่มีซีรีส์ ใช้ materials.features แทน ac_series)
export async function setMaterialFeatures(code, features) {
  const { data, error } = await supabase.from("materials").update({ features: (features || "").trim() || null }).eq("code", code).select("code");
  if (error) throw error;
  if (!(data || []).length) throw new Error("ไม่มีรายการถูกอัปเดต (ไม่มีสิทธิ์แก้คลังสินค้า?)");
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

// update a material's (weighted-average) unit cost — used by purchase moving average
export async function updateMaterialCost(code, cost) {
  const { error } = await supabase.from("materials").update({ cost }).eq("code", code);
  if (error) throw error;
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
  const priceOf = {}; items.forEach((it) => { priceOf[it.code] = Number(it.price) || 0; });
  const { data: rows, error } = await supabase.from("transactions").select("id,material_code,qty,unit_cost,type").eq("po_no", poNo);
  if (error || !rows?.length) return 0;
  let n = 0;
  for (const r of rows) {
    const want = priceOf[r.material_code];
    if (want == null || Math.abs((Number(r.unit_cost) || 0) - want) < 0.005) continue;
    const { error: e } = await supabase.from("transactions").update({ unit_cost: want }).eq("id", r.id);
    if (!e) n++;
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
export async function listPurchaseOrders() {
  const _rows = (build) => _fetchAll(build).then((rows) => ({ data: rows })); // กันเพดาน 1000 แถวทุกก้อน (header PO ก็โตเรื่อย ๆ เหมือนใบขาย)
  const [poRes, itemRes, qRes, cuRes, joRes, tmRes] = await Promise.all([
    _rows((f, t) => supabase.from("purchase_orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("po_no").range(f, t)),
    _rows((f, t) => supabase.from("po_items").select("*", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("quotations").select("quote_no,customer_id,title", { count: "exact" }).order("quote_no").range(f, t)),
    _rows((f, t) => supabase.from("customers").select("id,name", { count: "exact" }).order("id").range(f, t)),
    _rows((f, t) => supabase.from("job_orders").select("job_no,quote_no,assigned_team,status", { count: "exact" }).order("job_no").range(f, t)),
    supabase.from("teams").select("id,name"),
    // ใบสั่งซื้อ/ชุดเบิกที่แตกออกจากใบเตรียมวัสดุ (ผูกด้วย prep_no) — ไว้โชว์บนการ์ดและกันกดสร้างซ้ำ
    _rows((f, t) => supabase.from("purchase_orders").select("po_no,prep_no,status,issue_date,created_at", { count: "exact" }).not("prep_no", "is", null).order("po_no").range(f, t)).catch(() => ({ data: [] })),
    _rows((f, t) => supabase.from("transactions").select("ref_no,prep_no,txn_date,type", { count: "exact" }).not("prep_no", "is", null).eq("type", "withdraw").order("id").range(f, t)).catch(() => ({ data: [] })),
  ]);
  if (poRes.error) throw poRes.error;
  if (itemRes.error) throw itemRes.error;
  const byPo = {};
  (itemRes.data || []).forEach((it) => { (byPo[it.po_no] = byPo[it.po_no] || []).push(it); });
  // PO ผูกใบเสนอราคา → โยงต่อถึง ลูกค้า + ใบงาน + ทีมช่าง (ใบงานแรกที่ไม่ถูกยกเลิกของใบเสนอราคานั้น)
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const quoteInfo = Object.fromEntries((qRes.data || []).map((x) => [x.quote_no, x]));
  const teamName = Object.fromEntries((tmRes.data || []).map((t) => [t.id, t.name]));
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
  const head = { po_no: po.po_no, supplier: po.supplier || null, note: po.note || null, internal_note: po.internal_note?.trim() || null, status: po.status || "open", vat: !!po.vat, price_incl: !!po.price_incl, quote_no: po.quote_no || null, prep_no: po.prep_no || null, issue_date: po.issue_date || null, po_type: po.po_type || null, created_by: user?.id || null };
  let e1 = (await supabase.from("purchase_orders").upsert(head, { onConflict: "po_no" })).error;
  // pre-096/097/100/115/119/139 fallback — ตัดเฉพาะคอลัมน์ที่ schema ไม่รู้จักจริง ๆ (ชื่อคอลัมน์อยู่ใน error message ของ PostgREST)
  // ห้ามเหมารวม: เคยตัด vat ทิ้งไปด้วยตอน price_incl ยังไม่รัน migration → ใบสั่งซื้อโหมดรวม VAT ถูกเก็บเป็นไม่มี VAT
  for (const c of ["price_incl", "vat", "quote_no", "prep_no", "issue_date", "po_type"]) {
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
    _rows((f, t) => supabase.from("expense_requests").select("id,status,amount", { count: "exact" }).order("id").range(f, t)),
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
  const poPayable = pos.filter((x) => x.status !== "cancelled" && !x.paid_at && (x.status === "received" || x.expense_id))
    .reduce((a, x) => a + (poTotal[x.po_no] || 0) * (x.vat ? 1.07 : 1), 0);               // PO ที่ยังไม่จ่ายเงิน (รวม VAT) — นับเฉพาะรับของแล้ว/ส่งเบิกแล้ว
  // เบิกอนุมัติแล้วรอจ่าย — ไม่นับใบเบิกที่เป็นค่าจ่าย PO (PO ตัวนั้นถูกนับใน poPayable แล้ว ไม่งั้นซ้ำ)
  const poExpIds = new Set(pos.map((x) => x.expense_id).filter(Boolean));
  const approvedExpenseSum = (exp.data || []).filter((x) => x.status === "approved" && !poExpIds.has(x.id)).reduce((a, x) => a + (Number(x.amount) || 0), 0);
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

export async function listCustomers() {
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

export async function saveCustomer(cust, contacts, sites) {
  const { data: { user } } = await supabase.auth.getUser();
  const fields = { type: cust.type, name: cust.name.trim(), address: cust.address?.trim() || null, tax_id: cust.tax_id?.trim() || null, email: cust.email?.trim() || null, vat: !!cust.vat, note: cust.note?.trim() || null, credit_days: Math.max(0, Math.round(Number(cust.credit_days) || 0)) };
  let id = cust.id;
  const preMig = (e) => /credit_days|PGRST204/i.test(e?.message || "");   // ยังไม่รัน mig 159 → บันทึกส่วนที่เหลือให้ผ่านไปก่อน
  if (id) {
    let e = (await supabase.from("customers").update(fields).eq("id", id)).error;
    if (e && preMig(e)) { const { credit_days, ...rest } = fields; e = (await supabase.from("customers").update(rest).eq("id", id)).error; }
    if (e) throw e;
  } else {
    let r = await supabase.from("customers").insert({ ...fields, created_by: user?.id || null }).select("id").single();
    if (r.error && preMig(r.error)) { const { credit_days, ...rest } = fields; r = await supabase.from("customers").insert({ ...rest, created_by: user?.id || null }).select("id").single(); }
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
export async function listSuppliers() {
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
const _DOC_NO_COL = { boqs: "boq_no", quotations: "quote_no", invoices: "invoice_no", receipts: "receipt_no", billing_notes: "billing_no", purchase_orders: "po_no", material_preps: "prep_no" };
export async function docNoTaken(table, no) {
  const col = _DOC_NO_COL[table];
  if (!col || !no) return false;
  const { count, error } = await supabase.from(table).select(col, { count: "exact", head: true }).eq(col, no);
  if (error) throw error;
  return (count || 0) > 0;
}
export async function listBoqs(opts = {}) {
  const nos = _scopeNos(opts);
  const bP = _allRows((f, t) => _onlyNos(supabase.from("boqs").select("*", { count: "exact" }), "boq_no", nos).order("created_at", { ascending: false }).order("boq_no").range(f, t));
  // เจาะจงใบ → ต้องรู้ customer_id/site_id ของใบนั้นก่อน จึงรอหัวใบมาก่อน · โหลดทั้งหมด → ไม่ต้องรอ ยิงขนานเหมือนเดิม
  const b = nos ? await bP : { data: [] };
  if (b.error) throw b.error;
  const cids = _idsOf(b.data, "customer_id"), sids = _idsOf(b.data, "site_id");
  const [it, cu, si, ct, qt] = await Promise.all([
    // ห้ามอ่านทั้งตารางตรง ๆ — Supabase ตัดที่ 1000 แถว รายการใบใหม่ (id ท้ายตาราง) จะหายทั้งที่บันทึกสำเร็จ
    _allRows((f, t) => _onlyNos(supabase.from("boq_items").select("*", { count: "exact" }), "boq_no", nos).order("id").range(f, t)),
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("id,name,address,tax_id", { count: "exact" }), "id", nos && cids).order("id").range(f, t)),
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
export async function getCompanies() {
  const { data, error } = await supabase.from("company_profile").select("*").in("id", [1, 2]);
  if (error) throw error;
  const m = {}; (data || []).forEach((r) => { m[r.id === 2 ? "novat" : "vat"] = r; });
  return { vat: m.vat || {}, novat: m.novat || {} };
}
// kind: "vat" (id=1) | "novat" (id=2)
export async function saveCompany(c, kind) {
  const id = kind === "novat" ? 2 : 1;
  const { error } = await supabase.from("company_profile").upsert({
    id, name: c.name?.trim() || null, branch: c.branch?.trim() || null, address: c.address?.trim() || null,
    tax_id: c.tax_id?.trim() || null, phone: c.phone?.trim() || null, email: c.email?.trim() || null,
    website: c.website?.trim() || null, bank_info: c.bank_info?.trim() || null, default_terms: c.default_terms?.trim() || null,
  }, { onConflict: "id" });
  if (error) throw error;
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

export async function saveBoq(boq, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const bHead = {
    boq_no: boq.boq_no, customer_id: boq.customer_id || null, site_id: boq.site_id || null, issue_date: boq.issue_date || null,
    job_type: boq.job_type || null,
    title: boq.title?.trim() || null, note: boq.note?.trim() || null, internal_note: boq.internal_note?.trim() || null, ..._termCols(boq), ..._signCols(boq), status: boq.status || "open", created_by: user?.id || null,
  };
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
export async function listQuotations(opts = {}) {
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
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("id,name,address,tax_id,type", { count: "exact" }), "id", cScope).order("id").range(f, t)),
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
  const custType = Object.fromEntries((cu.data || []).map((c) => [c.id, c.type]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const firstContact = {}; (ct.data || []).forEach((c) => { if (!firstContact[c.customer_id]) firstContact[c.customer_id] = c; });
  const jobByQuote = {}; (jo.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  const billedByQ = {}; (inv.data || []).forEach((x) => { if (x.status !== "cancelled") billedByQ[x.quote_no] = (billedByQ[x.quote_no] || 0) + Number(x.total || 0); });
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
    const whtAmt = qo.wht && subtotal > 0 ? afterDisc * (svcSum / subtotal) * (Number(qo.wht_rate) || 3) / 100 : 0;
    const s = qo.site_id ? sm[qo.site_id] : null;
    const siteAddress = (s && s.address) || null;
    const address = siteAddress || custAddr[qo.customer_id] || null;
    const map_url = (s && s.map_url) || _gmap(address);
    const ct0 = firstContact[qo.customer_id];
    return { ...qo, customerName: custName[qo.customer_id] || null, customerAddr: custAddr[qo.customer_id] || null,
      customerTaxId: custTax[qo.customer_id] || null, customerType: custType[qo.customer_id] || null, customerCode: qo.customer_id || null, siteName: s?.site_name || null,
      siteAddress, address, map_url, createdByName: cb[qo.created_by] || null,
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      jobNo: jobByQuote[qo.quote_no]?.job_no || null, hasJob: !!jobByQuote[qo.quote_no], jobScheduledAt: jobByQuote[qo.quote_no]?.scheduled_at || null,
      jobTeam: jobByQuote[qo.quote_no]?.assigned_team || null,   // ทีมช่างของงาน (ไว้กรองรายทีมบนแดชบอร์ด)
      hasInvoice: (billedByQ[qo.quote_no] || 0) > 0, billedPct: grand > 0 ? (billedByQ[qo.quote_no] || 0) / grand * 100 : 0,
      items: itemsX, subtotal, discount, afterDisc, payMethod, vatAmt, grand, whtAmt, netPay: grand - whtAmt };
  });
}

export async function saveQuotation(q, items) {
  const { data: { user } } = await supabase.auth.getUser();
  // guard ฝั่ง server: ใบที่อนุมัติแล้วห้ามบันทึกทับ (หน้าเก่าค้างจากอีกเครื่อง) — ต้องผ่านปุ่ม "คืนสถานะแก้ไข" (มี audit) เท่านั้น
  {
    const { data: cur, error: ce } = await supabase.from("quotations").select("status").eq("quote_no", q.quote_no).maybeSingle();
    if (ce) throw ce;
    if (cur && cur.status === "approved") throw new Error(`ใบเสนอราคา ${q.quote_no} อนุมัติแล้ว — บันทึกทับไม่ได้\nถ้าจำเป็นต้องแก้ กด "คืนสถานะแก้ไข" บนการ์ดก่อน (หน้าอาจค้าง — รีเฟรชแล้วลองใหม่)`);
  }
  const head = {
    quote_no: q.quote_no, customer_id: q.customer_id || null, site_id: q.site_id || null, boq_no: q.boq_no || null,
    title: q.title?.trim() || null, status: q.status || "draft", job_type: q.job_type || null,
    issue_date: q.issue_date || null, valid_until: q.valid_until || null,
    discount_type: q.discount_type || "amount", discount_value: Number(q.discount_value) || 0,
    vat: !!q.vat, wht: !!q.wht, wht_rate: Number(q.wht_rate) || 3, note: q.note?.trim() || null, internal_note: q.internal_note?.trim() || null, ..._termCols(q), ..._signCols(q),
    pay_method: q.pay_method && q.pay_method !== "cash" ? q.pay_method : null,   // เงินสด = ค่าเริ่มต้น (เก็บ null)
    approved_at: q.status === "approved" ? (q.approved_at || new Date().toISOString()) : null,
    created_by: user?.id || null,
  };
  let e1 = (await supabase.from("quotations").upsert(head, { onConflict: "quote_no" })).error;
  // ยังไม่รัน migration 105/139 → บันทึกต่อได้ (แค่ยังไม่เก็บคอลัมน์นั้น)
  for (const c of ["pay_method", "job_type"]) {
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
export async function listInvoices(opts = {}) {
  const nos = _scopeNos(opts);
  const ivP = _allRows((f, t) => _onlyNos(supabase.from("invoices").select("*", { count: "exact" }), "invoice_no", nos).order("created_at", { ascending: false }).order("invoice_no").range(f, t));
  const iv = nos ? await ivP : { data: [] };   // เจาะจงใบ → รอหัวใบก่อน · โหลดทั้งหมด → ยิงขนานเหมือนเดิม
  if (iv.error) throw iv.error;
  const cids = _idsOf(iv.data, "customer_id"), sids = _idsOf(iv.data, "site_id"), qnos = _idsOf(iv.data, "quote_no");
  const [cu, si, ct, qt, rc, bn] = await Promise.all([
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("id,name,address,tax_id", { count: "exact" }), "id", nos && cids).order("id").range(f, t)),
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
      customerName: cn[x.customer_id] || null, customerCode: x.customer_id || null, customerTaxId: cx[x.customer_id] || null,
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
async function _quoteGrand(quote_no) {
  const { data: qo } = await supabase.from("quotations").select("discount_type,discount_value,vat,pay_method,status").eq("quote_no", quote_no).maybeSingle();
  if (!qo) return null;
  let itr = await supabase.from("quotation_items").select("qty,unit_price,discount").eq("quote_no", quote_no);
  if (itr.error) itr = await supabase.from("quotation_items").select("qty,unit_price").eq("quote_no", quote_no); // pre-142
  if (itr.error) return null;
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
    // fail-closed: อ่านใบเสนอไม่ได้ (เน็ต/สิทธิ์พัง) = หยุด ไม่ใช่ข้าม guard — _quoteGrand คืน null เฉพาะกรณีไม่พบใบจริง ๆ
    const qg = await _quoteGrand(inv.quote_no);
    if (qg) {
      if (qg.status !== "approved") throw new Error("ใบเสนอราคานี้ไม่ได้อยู่ในสถานะอนุมัติแล้ว — วางบิลไม่ได้");
      const { data: others, error: oe } = await supabase.from("invoices").select("invoice_no,total,status").eq("quote_no", inv.quote_no).neq("invoice_no", inv.invoice_no);
      if (oe) throw oe;
      const billedOther = (others || []).filter((x) => x.status !== "cancelled").reduce((a, x) => a + Number(x.total || 0), 0);
      if (billedOther + (Number(inv.total) || 0) > qg.grand + 1)
        throw new Error(`ยอดวางบิลรวมเกินยอดใบเสนอราคา — วางแล้ว ${billedOther.toLocaleString("en-US")} + งวดนี้ ${(Number(inv.total) || 0).toLocaleString("en-US")} > ${qg.grand.toLocaleString("en-US")} (อาจมีคนวางบิลพร้อมกันจากอีกเครื่อง — รีเฟรชแล้วลองใหม่)`);
    }
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

export async function listReceipts(opts = {}) {
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
    _allRows((f, t) => _onlyIds(supabase.from("customers").select("id,name,address,tax_id", { count: "exact" }), "id", cScope).order("id").range(f, t)),
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
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  const jobByQuote = {}; (jo.data || []).forEach((j) => { if (j.quote_no && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j.job_no; });
  const cb = await _creators(scoped ? _idsOf(rcR.data, "created_by") : null);
  return (rcR.data || []).map((x) => {
    const s = x.site_id ? sm[x.site_id] : null; const ct0 = cc[x.customer_id];
    return { ...x, job_no: x.job_no || (x.quote_no ? jobByQuote[x.quote_no] : null) || null,
      title: x.quote_no ? (titleByQuote[x.quote_no] || null) : null,
      customerName: cn[x.customer_id] || null, customerCode: x.customer_id || null, customerTaxId: cx[x.customer_id] || null,
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
// toggle a receipt's paid status (and sync the linked invoice)
// ---------- BILLING NOTES (ใบวางบิล) ----------
export async function listBillingNotes() {
  const [bn, iv, cu, si, ct, rc, qt] = await Promise.all([
    _allRows((f, t) => supabase.from("billing_notes").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("billing_no").range(f, t)),
    _allRows((f, t) => supabase.from("invoices").select("invoice_no,total,wht_amt,installment,pct,status,issue_date,quote_no", { count: "exact" }).order("invoice_no").range(f, t)),
    _allRows((f, t) => supabase.from("customers").select("id,name,address,tax_id,type", { count: "exact" }).order("id").range(f, t)),
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
    return { ...b, customerName: cn[b.customer_id] || null, customerCode: b.customer_id || null, customerTaxId: cx[b.customer_id] || null,
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
export async function saveReceiptFlowAccount(receipt_no, faId, faNo) {
  // RPC stamps only the flowaccount_* columns, gated to the FlowAccount-allowed roles (so hr/sales can
  // mark a receipt as sent without broad write access to receipts). Falls back to a direct update if
  // migration 084 hasn't been run yet (works for admin/sales/exec/finance via rc_write).
  const { error } = await supabase.rpc("set_receipt_flowaccount", { p_receipt_no: receipt_no, p_fa_id: faId ? String(faId) : null, p_fa_no: faNo || null });
  if (!error) return;
  const { error: e2 } = await supabase.from("receipts").update({ flowaccount_id: faId ? String(faId) : null, flowaccount_no: faNo || null, flowaccount_at: new Date().toISOString() }).eq("receipt_no", receipt_no);
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
export async function listJobOrders({ fieldOnly = false, team = null } = {}) {
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
  const [q, iv, rc, jo, tm] = await Promise.all([
    supabase.from("quotations").select("quote_no,title,status,issue_date,created_at,site_id").eq("customer_id", customerId),
    supabase.from("invoices").select("invoice_no,status,issue_date,total,installment,pct,created_at,site_id").eq("customer_id", customerId),
    supabase.from("receipts").select("receipt_no,status,issue_date,net,created_at,site_id").eq("customer_id", customerId),
    supabase.from("job_orders").select("job_no,title,scheduled_at,end_date,slot,status,assigned_team,created_at,site_id").eq("customer_id", customerId),
    supabase.from("teams").select("id,name"),
  ]);
  const tn = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  const entries = [
    ...(q.data || []).map((x) => ({ type: "quote", no: x.quote_no, title: x.title, status: x.status, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
    ...(iv.data || []).map((x) => ({ type: "invoice", no: x.invoice_no, title: `งวด ${x.installment} (${Math.round(x.pct)}%)`, status: x.status, amount: x.total, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
    ...(rc.data || []).map((x) => ({ type: "receipt", no: x.receipt_no, status: x.status, amount: x.net, date: x.issue_date || x.created_at, created: x.created_at, site_id: x.site_id })),
    ...(jo.data || []).map((x) => ({ type: "job", no: x.job_no, title: x.title, status: x.status, date: x.scheduled_at || x.created_at, created: x.created_at, teamName: x.assigned_team ? (tn[x.assigned_team] || x.assigned_team) : null, scheduled_at: x.scheduled_at, end_date: x.end_date, slot: x.slot, site_id: x.site_id })),
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
  const watchers = await _jobWatchers(job_no);
  notify(watchers, { category: "job", title: `💬 ความเคลื่อนไหวงาน ${job_no}`, body: (note || "[ไฟล์แนบ]").slice(0, 120), url: "joborders", ref_type: "job", ref_no: job_no });
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
    assigned_team: jo.assigned_team || null, scheduled_at: jo.scheduled_at || null,
    end_date: jo.end_date || null, slot: jo.slot || null, issue_date: jo.issue_date || null,
    status: headStatus, created_by: user?.id || null,
  };
  // ใบที่ล็อกปิดไว้ (เช่น อนุมัติแบบ "เสร็จ รอนัดหมายเพิ่ม") พอออฟฟิศตั้งรอบนัดใหม่ → ปลดล็อกให้เอง
  // ไม่งั้นช่างกด "เริ่มทำรอบนี้" แล้วชนการ์ด locked ใน RPC (mig 150) จนกว่าจะมีคนมากดปลดล็อกเอง
  if (curHead?.locked && ["pending", "scheduled", "in_progress"].includes(headStatus)) jHead.locked = false;
  let { error } = await supabase.from("job_orders").upsert(jHead, { onConflict: "job_no" });
  if (error && /issue_date/i.test(error.message || "")) { delete jHead.issue_date; ({ error } = await supabase.from("job_orders").upsert(jHead, { onConflict: "job_no" })); } // pre-119 fallback
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
    notify((tm || []).map((p) => p.id), { category: "job", title: `🔧 มอบหมายงาน ${jo.job_no}`, body: jo.title || "", url: "joborders", ref_type: "job", ref_no: jo.job_no });
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
  notify(await _jobWatchers(job_no), { category: "job", title: `📋 งาน ${job_no} → ${_JOB_ST_TH[status] || status}`, url: "joborders", ref_type: "job", ref_no: job_no });
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
const HANDOVER_COLS = "id,job_no,customer_id,customer_name,contact_name,contact_phone,address,doc_ref,doc_date,work_types,detail,fix_note,forms,tech_sign_url,tech_name,cust_sign_url,cust_name,status,created_by,created_at,updated_at";

// list handovers (optionally for one job), newest first, with the creator's name attached
export async function listHandovers(jobNo) {
  // กันเพดาน 1000 แถว — ทะเบียนใบส่งมอบโตเรื่อย ๆ เกินพันใบ ใบเก่า (มีลายเซ็นลูกค้า) จะหายจากหน้าค้นหาเงียบ ๆ
  const rows = await _fetchAll((f, t) => {
    let q = supabase.from("job_handovers").select(HANDOVER_COLS, { count: "exact" }).order("created_at", { ascending: false }).order("id").range(f, t);
    if (jobNo) q = q.eq("job_no", jobNo);
    return q;
  });
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
  const { data, error } = await supabase.from("job_handovers").select(HANDOVER_COLS).eq("id", id).single();
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
  };
  let saved, wasSubmitted = false;
  if (h.id) {
    const { data: prev } = await supabase.from("job_handovers").select("status").eq("id", h.id).maybeSingle();
    wasSubmitted = prev?.status === "submitted";
    const { data, error } = await supabase.from("job_handovers").update(fields).eq("id", h.id).select(HANDOVER_COLS).single();
    if (error) throw /PGRST116|coerce/i.test(error.message || "") ? new Error("บันทึกไม่ได้ — ใบนี้ส่งแล้ว ช่างแก้ไขเองไม่ได้ (ต้องให้ออฟฟิศแก้)") : error;
    saved = data;
  } else {
    fields.created_by = await _uid();
    const { data, error } = await supabase.from("job_handovers").insert(fields).select(HANDOVER_COLS).single();
    if (error) throw error;
    saved = data;
  }
  // ส่งใบส่งมอบ (ครั้งแรกเท่านั้น — บันทึกซ้ำใบที่ส่งแล้วไม่แจ้งซ้ำ) → ลงไทม์ไลน์ + แจ้งออฟฟิศ (best-effort)
  if (fields.status === "submitted" && !wasSubmitted && fields.job_no) {
    try {
      const uid = await _uid();
      await supabase.from("job_logs").insert({ job_no: fields.job_no, type: "update", note: `📝 ส่งใบส่งมอบงานแล้ว${fields.cust_sign_url ? " (ลูกค้าเซ็นรับแล้ว ✓)" : ""}`, author: h.tech_name || null, created_by: uid });
      notify(await _jobWatchers(fields.job_no), { category: "job", title: `📝 งาน ${fields.job_no} ส่งใบส่งมอบงานแล้ว`, url: "joborders", ref_type: "job", ref_no: fields.job_no });
    } catch { /* ignore */ }
  }
  return saved;
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
  notify(await _jobWatchers(jobNo), { category: "job", title: `📋 งาน ${jobNo} (รอบ) → ${_JOB_ST_TH[status] || status}`, url: "joborders", ref_type: "job", ref_no: jobNo });
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
  const { data, error } = await supabase.from("web_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
// ผูกคำสั่งซื้อเว็บกับลูกค้าในระบบ (mig 163 — คอลัมน์ customer_id มีตั้งแต่ mig 071 แต่ไม่เคยมีใครเขียน)
export async function setWebOrderCustomer(id, customerId) {
  const { error } = await supabase.from("web_orders").update({ customer_id: customerId }).eq("id", id);
  if (error) throw error;
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
  if (r.id) { const id = r.id; delete r.id; const { error } = await supabase.from(t).update(r).eq("id", id); if (error) throw error; }
  else { delete r.id; const { error } = await supabase.from(t).insert(r); if (error) throw error; }
}
export async function deleteWebItem(kind, id) {
  const t = WEB_KINDS[kind]; if (!t) throw new Error("unknown web kind");
  const { error } = await supabase.from(t).delete().eq("id", id); if (error) throw error;
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
  const { accountId, method, payDate, slipUrl } = typeof opts === "string" ? { method: opts } : (opts || {});
  const uid = await _uid();
  const { data: p, error: e0 } = await supabase.from("sub_payouts").select("net,team,status").eq("id", id).single();
  if (e0) throw e0;
  if (p.status === "paid") throw new Error("ใบนี้บันทึกจ่ายแล้ว");
  const day = payDate || new Date().toISOString().slice(0, 10);
  // paid_at ใช้วันที่จ่ายที่ผู้ใช้เลือก (เที่ยง UTC = ตกวันเดียวกันตามเวลาไทยแน่นอน) — กระแสเงินสดลงวันเดียวกับเดินบัญชี ไม่ใช่วันกดปุ่ม
  const patch = { status: "paid", paid_at: payDate ? `${payDate}T12:00:00.000Z` : new Date().toISOString(), method: method || null, paid_from: accountId || null, pay_slip_url: slipUrl || null };
  let upd = await supabase.from("sub_payouts").update(patch).eq("id", id);
  if (upd.error && /pay_slip_url/i.test(upd.error.message || "")) { delete patch.pay_slip_url; upd = await supabase.from("sub_payouts").update(patch).eq("id", id); } // pre-128 fallback
  if (upd.error && /paid_from|column|PGRST204/i.test(upd.error.message || "")) { delete patch.paid_from; upd = await supabase.from("sub_payouts").update(patch).eq("id", id); }
  if (upd.error) throw upd.error;
  if (accountId) {
    const { error: eAcc } = await supabase.from("account_entries").insert({ account_id: accountId, direction: "out", amount: Number(p.net) || 0, kind: "payout", ref_type: "payout", ref_id: id, note: `จ่ายค่าแรงช่างซัพ · ทีม ${p.team}`, entry_date: day, created_by: uid });
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
async function _jobWatchers(job_no) {
  try {
    const { data: jo } = await supabase.from("job_orders").select("assigned_team").eq("job_no", job_no).maybeSingle();
    const office = await _usersByRole(["admin", "exec", "sales", "lead_tech"]); // หัวหน้าช่างคุมทุกทีม — ต้องเห็นความเคลื่อนไหวงานด้วย
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
  const row = {
    title: t.title?.trim(), detail: t.detail?.trim() || null,
    assignee: t.assignee || null, priority: t.priority || "normal",
    status: t.status || "todo", due_date: t.due_date || null, customer_id: t.customer_id || null,
    attachments: t.attachments || [], updated_at: new Date().toISOString(),
  };
  if (t.id) { const { error } = await supabase.from("tasks").update(row).eq("id", t.id); if (error) throw error;
    if (row.assignee) notify([row.assignee], { category: "task", title: `📌 อัปเดตงาน: ${row.title}`, url: "tasks", ref_type: "task", ref_no: t.id });
    return t.id; }
  row.assigner = uid;
  const { data, error } = await supabase.from("tasks").insert(row).select("id").single();
  if (error) throw error;
  if (row.assignee) notify([row.assignee], { category: "task", title: `📌 ได้รับมอบหมายงานใหม่: ${row.title}`, body: row.detail || "", url: "tasks", ref_type: "task", ref_no: data.id });
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
      const { data: chunk, error } = await supabase.from("purchase_orders").select("po_no,quote_no,expense_id,vat").in("expense_id", ids.slice(i, i + 200));
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
export async function listExpenses(status) {
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
  const payload = { role: fields.role, name: fields.name || null, team: fields.role === "tech" ? (fields.team || null) : null };
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
    { id: uid, email: email.trim(), name: name?.trim() || email.trim(), role: role || "tech", team: role === "tech" ? (team || null) : null },
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
    supabase.from("line_contact_customers").select("line_user_id,customer_id"),  // many-to-many (mig 081)
  ]);
  if (c.error) throw c.error;
  const cn = Object.fromEntries((cu.data || []).map((x) => [x.id, x.name]));
  const byUid = {}; (links.data || []).forEach((l) => { (byUid[l.line_user_id] = byUid[l.line_user_id] || []).push(l.customer_id); });
  return (c.data || []).map((r) => {
    let ids = byUid[r.line_user_id] || [];
    if (r.customer_id && !ids.some((x) => String(x) === String(r.customer_id))) ids = [r.customer_id, ...ids]; // active not yet in join (legacy)
    return { ...r, customerName: r.customer_id ? cn[r.customer_id] : null, custIds: ids };
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
  return (c.data || []).map((r) => ({ ...r, line_user_id: r.psid, channel: "fb", customerName: r.customer_id ? cn[r.customer_id] : null }));
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
export const sendFbMessage = (psid, text) => _fbSend(psid, { text });
export const sendFbImage = (psid, imageUrl) => _fbSend(psid, { imageUrl });
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
  notify(await _usersByRole(["admin", "exec", "hr"]), { category: "hr", title: `🕒 ${me?.name || "พนักงาน"} เช็คอินเข้างาน`, url: "hr", ref_type: "attendance" });
}
export async function checkOut({ lat, lng, photo }) {
  const uid = await _uid(), day = await _hrToday();   // วันที่จากเซิร์ฟเวอร์ ให้ตรงกับที่ RLS ตรึงไว้
  const ex = await supabase.from("hr_attendance").select("id,check_in_at").eq("user_id", uid).eq("work_date", day).maybeSingle();
  if (!ex.data || !ex.data.check_in_at) throw new Error("ยังไม่ได้เช็คอินวันนี้");
  const { error } = await supabase.from("hr_attendance").update({
    check_out_at: new Date().toISOString(), check_out_lat: lat ?? null, check_out_lng: lng ?? null, check_out_photo: photo || null,
  }).eq("id", ex.data.id);
  if (error) throw error;
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
  notify(await _usersByRole(["admin", "exec", "hr"]), { category: "hr", title: `📝 ${me?.name || "พนักงาน"} ขอลา (${amount})`, body: reason || "", url: "hr", ref_type: "leave" });
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
    supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url,pay_type,base_pay,ot_rate,sso,citizen_id").order("name"),
    supabase.from("teams").select("id,type"),
  ]);
  // pre-130 fallback — ยังไม่มีคอลัมน์เลขบัตรประชาชน
  if (pr.error && /citizen_id/i.test(pr.error.message || "")) pr = await supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url,pay_type,base_pay,ot_rate,sso").order("name");
  // post-154 fallback — คอลัมน์ค่าจ้างถูกย้ายออกจาก profiles แล้ว
  if (pr.error && /(base_pay|ot_rate|pay_type|sso)/i.test(pr.error.message || "")) pr = await supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url").order("name");
  if (pr.error) throw pr.error;
  const subIds = new Set((tm.data || []).filter((t) => t.type === "sub").map((t) => t.id));
  // ข้อมูลค่าจ้างมาจาก hr_pay (RLS กันคนนอก) — คนที่ไม่มีสิทธิ์จะได้เฉพาะแถวของตัวเอง
  const pay = await _payByUser((pr.data || []).map((p) => p.id));
  // permanent staff only (drop subcontractor-team members); position label follows the Settings role
  return (pr.data || []).filter((p) => !subIds.has(p.team))
    .map((p) => ({ ...p, ...(pay ? (pay[p.id] || {}) : {}), department: posLabel(p) }));
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
  bonus: p.bonus || 0, other_deduct: p.other_deduct || 0, other_note: p.other_note || null,
  net: p.net || 0, status: p.status || "draft", note: p.note || null, created_by: uid, updated_at: now,
});
export async function savePayslip(p) {
  const uid = await _uid();
  const row = _payslipRow(p, uid, new Date().toISOString());
  let { error } = await supabase.from("payslips").upsert(row, { onConflict: "period,user_id" });
  if (error && /hol_pay/i.test(error.message || "")) { delete row.hol_pay; ({ error } = await supabase.from("payslips").upsert(row, { onConflict: "period,user_id" })); } // pre-148 fallback
  if (error && /d_tax/i.test(error.message || "")) { delete row.d_tax; ({ error } = await supabase.from("payslips").upsert(row, { onConflict: "period,user_id" })); }   // pre-161 fallback
  if (error) throw error;
}
// บันทึกสลิปทั้งรอบใน "คำสั่งเดียว" — เดิมวนทีละคน เน็ตหลุดกลางทางแล้วได้รอบครึ่ง ๆ กลาง ๆ
export async function savePayslips(list) {
  const uid = await _uid(); const now = new Date().toISOString();
  const rows = list.map((p) => _payslipRow(p, uid, now));
  let { error } = await supabase.from("payslips").upsert(rows, { onConflict: "period,user_id" });
  if (error && /hol_pay/i.test(error.message || "")) { rows.forEach((r) => delete r.hol_pay); ({ error } = await supabase.from("payslips").upsert(rows, { onConflict: "period,user_id" })); } // pre-148 fallback
  if (error && /d_tax/i.test(error.message || "")) { rows.forEach((r) => delete r.d_tax); ({ error } = await supabase.from("payslips").upsert(rows, { onConflict: "period,user_id" })); }   // pre-161 fallback
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
  const ids = (rooms.data || []).map((r) => r.id);
  let msgs = [];
  if (ids.length) {
    const r = await supabase.from("chat_messages").select("room_id,text,image_url,file_url,file_name,created_at,sender").in("room_id", ids).order("created_at", { ascending: false }).limit(500);
    msgs = r.data || [];
  }
  const last = {}, unread = {};
  msgs.forEach((m) => {
    if (!last[m.room_id]) last[m.room_id] = m;
    const lr = myRead[m.room_id];
    if (lr && m.sender !== uid && new Date(m.created_at) > new Date(lr)) unread[m.room_id] = (unread[m.room_id] || 0) + 1;
  });
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
  return (data || []).reverse();
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
export async function sendChatMessage(roomId, text, mentionIds = []) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_messages").insert({ room_id: roomId, sender: uid, text: text.trim() });
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
export async function listDocLinks() {
  const [q, inv, rc, jo, po] = await Promise.all([
    _allRows((f, t) => supabase.from("quotations").select("quote_no,boq_no", { count: "exact" }).order("quote_no").range(f, t)),
    _allRows((f, t) => supabase.from("invoices").select("invoice_no,quote_no", { count: "exact" }).neq("status", "cancelled").order("invoice_no").range(f, t)),
    _allRows((f, t) => supabase.from("receipts").select("receipt_no,invoice_no,quote_no,job_no,boq_no", { count: "exact" }).neq("status", "cancelled").order("receipt_no").range(f, t)), // ใบเสร็จยกเลิกไม่ขึ้นชิป (กติกา: ใบยกเลิก = จบสาย)
    _allRows((f, t) => supabase.from("job_orders").select("job_no,quote_no,status", { count: "exact" }).order("job_no").range(f, t)),
    _allRows((f, t) => supabase.from("purchase_orders").select("po_no,quote_no,status", { count: "exact" }).order("po_no").range(f, t)).catch(() => ({ data: [] })), // pre-100 → ยังไม่มี quote_no
  ]);
  const byQuote = {};
  // สถานะใบงานรายใบ — เอกสารทุกใบในสายใช้ติดป้าย "✓ เสร็จปิดงาน" บนชิปงาน
  const jobStatusBy = Object.fromEntries((jo.data || []).map((x) => [x.job_no, x.status]));
  const ensure = (qn) => (byQuote[qn] = byQuote[qn] || { boqNo: null, jobNos: [], invoiceNos: [], receiptNos: [], poNos: [], poOpen: 0 });
  (q.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).boqNo = x.boq_no || null; });
  (jo.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).jobNos.push(x.job_no); });
  (inv.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).invoiceNos.push(x.invoice_no); });
  (rc.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).receiptNos.push(x.receipt_no); });
  (po.data || []).forEach((x) => { if (x.quote_no && x.status !== "cancelled") { const e = ensure(x.quote_no); e.poNos.push(x.po_no); if (x.status === "open") e.poOpen += 1; } });
  // reverse lookups → quote_no (so any doc can find its chain)
  const boqToQuote = {}, jobToQuote = {}, invToQuote = {}, rcToQuote = {}, poToQuote = {};
  (q.data || []).forEach((x) => { if (x.boq_no) boqToQuote[x.boq_no] = x.quote_no; });
  (jo.data || []).forEach((x) => { if (x.quote_no) jobToQuote[x.job_no] = x.quote_no; });
  (inv.data || []).forEach((x) => { if (x.quote_no) invToQuote[x.invoice_no] = x.quote_no; });
  (rc.data || []).forEach((x) => { if (x.quote_no) rcToQuote[x.receipt_no] = x.quote_no; });
  (po.data || []).forEach((x) => { if (x.quote_no) poToQuote[x.po_no] = x.quote_no; });
  return { byQuote, boqToQuote, jobToQuote, invToQuote, rcToQuote, poToQuote, jobStatusBy };
}

// ---------- เครื่องมือช่าง (mig 122): ทะเบียน + เบิก/คืน/แจ้งชำรุด ----------
const _toolErr = (e) => new Error(/tool/.test(e.message || "") && /relation|find|exist/i.test(e.message || "") ? "ยังไม่ได้รัน migration 122 ใน Supabase" : e.message || e);

export async function listTools() {
  const [t, tm, pf] = await Promise.all([
    supabase.from("tools").select("*").order("name"),
    supabase.from("teams").select("id,name"),
    supabase.from("profiles").select("id,name,email"),
  ]);
  if (t.error) throw _toolErr(t.error);
  const tn = Object.fromEntries((tm.data || []).map((x) => [x.id, x.name]));
  const pn = Object.fromEntries((pf.data || []).map((x) => [x.id, x.name || x.email]));
  return (t.data || []).map((x) => ({ ...x, teamName: x.team ? (tn[x.team] || x.team) : null, holderName: x.holder ? (pn[x.holder] || "—") : null }));
}

export async function saveTool(t) {
  const row = { code: t.code?.trim() || null, name: t.name?.trim(), brand: t.brand?.trim() || null, detail: t.detail?.trim() || null, photo_url: t.photo_url || null,
    location: t.location || "stock", team: t.location === "vehicle" ? (t.team || null) : null,
    holder: t.location === "person" ? (t.holder || null) : null, status: t.status || "normal", note: t.note?.trim() || null };
  const run = () => (t.id ? supabase.from("tools").update(row).eq("id", t.id) : supabase.from("tools").insert(row));
  let { error } = await run();
  if (error && /brand/i.test(error.message || "")) { delete row.brand; ({ error } = await run()); } // pre-124 fallback
  if (error) throw _toolErr(error);
}

export async function deleteTool(id) {
  const { error } = await supabase.from("tools").delete().eq("id", id);
  if (error) throw _toolErr(error);
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
  const [rc, po] = await Promise.all([
    _fetchAll((f, t) => supabase.from("receipts").select("vat_amt,status,issue_date,receipt_no", { count: "exact" }).neq("status", "cancelled").gte("issue_date", from).lte("issue_date", to).order("receipt_no").range(f, t)).then((rows) => ({ data: rows })),
    _fetchAll((f, t) => supabase.from("purchase_orders").select("po_no,vat,status,issue_date,created_at", { count: "exact" }).neq("status", "cancelled").eq("vat", true)
      .or(`and(issue_date.gte.${from},issue_date.lte.${to}),and(issue_date.is.null,created_at.gte.${from},created_at.lte.${to}T23:59:59)`)
      .order("po_no").range(f, t)).then((rows) => ({ data: rows })),
  ]);
  const saleVat = (rc.data || []).reduce((a, r) => a + (Number(r.vat_amt) || 0), 0);
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
