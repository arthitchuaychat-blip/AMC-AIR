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

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data || { id: user.id, email: user.email, role: "tech", name: user.email };
}

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
    const { data, error } = await supabase.from("material_stock").select("*").eq("active", true).range(from, from + PAGE - 1);
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
  const FULL = "code,name_th,name_en,kind,brand,btu,ac_type,category,unit,cost,sale_price,description,photo_url,tracked,min_stock,init_stock,power_cost_year,features,purchase_unit,purchase_qty,btu_min,btu_max,series,voltage,refrigerant,seer,pipe_size,energy_label";
  let cols = FULL;
  for (let from = 0; ; from += PAGE) {
    let { data, error } = await supabase.from("materials").select(cols).eq("active", true).range(from, from + PAGE - 1);
    // pre-106 fallback: retry without the AC series/spec columns
    if (error && /series|voltage|refrigerant|seer|pipe_size|energy_label/i.test(error.message || "")) {
      cols = cols.replace(",series,voltage,refrigerant,seer,pipe_size,energy_label", "");
      ({ data, error } = await supabase.from("materials").select(cols).eq("active", true).range(from, from + PAGE - 1));
    }
    // pre-103 fallback: retry without the service BTU-range columns
    if (error && /btu_min|btu_max/i.test(error.message || "")) {
      cols = cols.replace(",btu_min,btu_max", "");
      ({ data, error } = await supabase.from("materials").select(cols).eq("active", true).range(from, from + PAGE - 1));
    }
    // pre-098 fallback: retry without the purchase-unit columns so the pickers still load
    if (error && /purchase_unit|purchase_qty/i.test(error.message || "")) {
      cols = cols.replace(",purchase_unit,purchase_qty", "");
      ({ data, error } = await supabase.from("materials").select(cols).eq("active", true).range(from, from + PAGE - 1));
    }
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all.map((m) => enrich(m, catMap)).sort((a, b) => a.code.localeCompare(b.code));
}

// add or update a material (admin only — enforced by RLS)
export async function saveMaterial(row, isNew) {
  const kind = row.kind || "material";
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
    tracked: kind === "service" ? false : (row.tracked !== false),
    unit: row.unit,
    cost: Number(row.cost) || 0,
    sale_price: Number(row.sale_price) || 0,
    description: row.description?.trim() || null,
    photo_url: row.photo_url || null,
    min_stock: Number(row.min_stock) || 0,
    power_cost_year: (row.power_cost_year === "" || row.power_cost_year == null) ? null : Number(row.power_cost_year),
    features: row.features?.trim() || null,
    web_published: !!row.web_published,
    purchase_unit: row.purchase_unit?.trim() || null,
    purchase_qty: Number(row.purchase_qty) > 0 ? Number(row.purchase_qty) : null,
  };
  if (isNew) payload.init_stock = Number(row.init_stock) || 0;
  let { error } = await supabase.from("materials").upsert(payload, { onConflict: "code" });
  // graceful fallback: if migration 087/098 (new columns) hasn't been run yet, the schema
  // cache rejects those columns and blocks EVERY save — retry without them so the catalog still works
  if (error && /power_cost_year|features|purchase_unit|purchase_qty|btu_min|btu_max|series|voltage|refrigerant|seer|pipe_size|energy_label/i.test(error.message || "")) {
    delete payload.power_cost_year; delete payload.features; delete payload.purchase_unit; delete payload.purchase_qty;
    delete payload.btu_min; delete payload.btu_max;
    delete payload.series; delete payload.voltage; delete payload.refrigerant; delete payload.seer; delete payload.pipe_size; delete payload.energy_label;
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
    ref_no: ref,
    recorded_by: user?.id || null,
  }));
  const { error } = await supabase.from("transactions").insert(payload);
  if (error) throw error;
}

// ---------- STOCK COUNT (นับสต๊อก) ----------
const _round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// list all count sessions with a per-session summary (counted / over / short)
export async function listStockCounts() {
  const [scRes, itemRes, profRes] = await Promise.all([
    supabase.from("stock_counts").select("*").order("created_at", { ascending: false }),
    supabase.from("stock_count_items").select("count_id,counted_qty,diff"),
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
  const { data, error } = await supabase.from("stock_count_items").select("*").eq("count_id", id);
  if (error) throw error; return data || [];
}
// save typed "counted" quantities on a draft (null = not counted yet)
export async function saveStockCountCounts(id, counts) {
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
export async function applyStockCount(id) {
  const uid = await _uid();
  const { data: sc, error: e0 } = await supabase.from("stock_counts").select("id,count_no,status").eq("id", id).single();
  if (e0) throw e0;
  if (sc.status === "applied") throw new Error("รอบนี้อัพเดทสต๊อกไปแล้ว");
  const { data: items, error: e1 } = await supabase.from("stock_count_items").select("id,material_code,counted_qty,unit_cost").eq("count_id", id);
  if (e1) throw e1;
  const counted = (items || []).filter((it) => it.counted_qty != null);
  if (!counted.length) throw new Error("ยังไม่มีรายการที่นับ — กรอกยอดนับก่อน");
  const codes = counted.map((it) => it.material_code);
  const sysMap = {};
  for (let i = 0; i < codes.length; i += 300) {
    const { data: ms } = await supabase.from("material_stock").select("code,current_stock,cost").in("code", codes.slice(i, i + 300));
    (ms || []).forEach((m) => { sysMap[m.code] = m; });
  }
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
        qty: Math.abs(diff), unit_cost: uc, ref_no: sc.count_no, reason: `ปรับยอดจากการนับสต๊อก ${sc.count_no}`, recorded_by: uid });
      adjusted++;
    }
  }
  if (txns.length) { const { error: e2 } = await supabase.from("transactions").insert(txns); if (e2) throw e2; }
  const { error: e3 } = await supabase.from("stock_counts").update({ status: "applied", applied_by: uid, applied_at: now, updated_at: now }).eq("id", id);
  if (e3) throw e3;
  return { adjusted, counted: counted.length };
}
export async function deleteStockCount(id) {
  const { error } = await supabase.from("stock_counts").delete().eq("id", id); // cascades items
  if (error) throw error;
}

// aggregate all job_no'd movements + the jobs (status) table
async function _jobAggregate() {
  const [txnRes, jobRes] = await Promise.all([
    supabase.from("transactions").select("*").not("job_no", "is", null)
      .in("type", ["withdraw", "return", "damage"]).order("id", { ascending: true }).limit(5000),
    supabase.from("jobs").select("*"),
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
  const [poRes, itemRes, qRes, cuRes, joRes, tmRes] = await Promise.all([
    supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("po_items").select("*"),
    supabase.from("quotations").select("quote_no,customer_id,title"),
    supabase.from("customers").select("id,name"),
    supabase.from("job_orders").select("job_no,quote_no,team,status"),
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
      jobNo: job?.job_no || null, teamName: job ? teamName[job.team] || job.team || null : null };
  });
}

// รายการในใบเสนอราคา (ดึงเข้าใบเตรียมวัสดุ)
export async function getQuoteItems(quote_no) {
  const { data, error } = await supabase.from("quotation_items").select("*").eq("quote_no", quote_no).order("id");
  if (error) throw error; return data || [];
}

// ---------- ใบเตรียมวัสดุ (mig 109) — ประตูก่อนสั่งซื้อ/เบิก: แบ่งจำนวน ซื้อ/เบิก ต่อรายการ + ขั้นอนุมัติ ----------
export async function listMaterialPreps() {
  const [pRes, iRes, qRes, cuRes, joRes, tmRes] = await Promise.all([
    supabase.from("material_preps").select("*").order("created_at", { ascending: false }),
    supabase.from("material_prep_items").select("*").order("id"),
    supabase.from("quotations").select("quote_no,customer_id,title"),
    supabase.from("customers").select("id,name"),
    supabase.from("job_orders").select("job_no,quote_no,team,status"),
    supabase.from("teams").select("id,name"),
  ]);
  if (pRes.error) throw pRes.error;
  const byPrep = {}; (iRes.data || []).forEach((it) => { (byPrep[it.prep_no] = byPrep[it.prep_no] || []).push(it); });
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const quoteInfo = Object.fromEntries((qRes.data || []).map((x) => [x.quote_no, x]));
  const teamName = Object.fromEntries((tmRes.data || []).map((t) => [t.id, t.name]));
  const jobByQuote = {}; (joRes.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  const cb = await _creators();
  return (pRes.data || []).map((p) => {
    const qi = p.quote_no ? quoteInfo[p.quote_no] : null;
    const job = p.quote_no ? jobByQuote[p.quote_no] : null;
    return { ...p, items: byPrep[p.prep_no] || [],
      customerName: qi ? custName[qi.customer_id] || null : null, quoteTitle: qi?.title || null,
      jobNo: job?.job_no || null, jobTeam: job?.team || null, teamName: job ? teamName[job.team] || job.team || null : null,
      createdByName: cb[p.created_by] || null, approvedByName: cb[p.approved_by] || null };
  });
}
export async function saveMaterialPrep(head, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const e1 = (await supabase.from("material_preps").upsert({
    prep_no: head.prep_no, quote_no: head.quote_no || null, title: head.title?.trim() || null,
    note: head.note?.trim() || null, status: head.status || "draft", created_by: user?.id || null,
  }, { onConflict: "prep_no" })).error;
  if (e1) throw new Error(/material_preps/.test(e1.message || "") && /relation|find/i.test(e1.message || "") ? "ยังไม่ได้รัน migration 109 ใน Supabase" : e1.message);
  const e2 = (await supabase.from("material_prep_items").delete().eq("prep_no", head.prep_no)).error;
  if (e2) throw e2;
  const rows = items.filter((it) => (Number(it.qty_buy) || 0) > 0 || (Number(it.qty_withdraw) || 0) > 0)
    .map((it) => ({ prep_no: head.prep_no, material_code: it.code || null, name: it.name || null, unit: it.unit || null, qty_buy: Number(it.qty_buy) || 0, qty_withdraw: Number(it.qty_withdraw) || 0 }));
  if (rows.length) { const e3 = (await supabase.from("material_prep_items").insert(rows)).error; if (e3) throw e3; }
}
export async function setPrepStatus(prep_no, status) {
  const patch = { status };
  if (status === "approved") { const { data: { user } } = await supabase.auth.getUser(); patch.approved_by = user?.id || null; patch.approved_at = new Date().toISOString(); }
  const { error } = await supabase.from("material_preps").update(patch).eq("prep_no", prep_no);
  if (error) throw error;
}
export async function deleteMaterialPrep(prep_no) {
  const { error } = await supabase.from("material_preps").delete().eq("prep_no", prep_no);
  if (error) throw error;
}

export async function savePurchaseOrder(po, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const head = { po_no: po.po_no, supplier: po.supplier || null, note: po.note || null, internal_note: po.internal_note?.trim() || null, status: po.status || "open", vat: !!po.vat, price_incl: !!po.price_incl, quote_no: po.quote_no || null, created_by: user?.id || null };
  let e1 = (await supabase.from("purchase_orders").upsert(head, { onConflict: "po_no" })).error;
  // pre-096/097/100 fallback — ตัดเฉพาะคอลัมน์ที่ schema ไม่รู้จักจริง ๆ (ชื่อคอลัมน์อยู่ใน error message ของ PostgREST)
  // ห้ามเหมารวม: เคยตัด vat ทิ้งไปด้วยตอน price_incl ยังไม่รัน migration → ใบสั่งซื้อโหมดรวม VAT ถูกเก็บเป็นไม่มี VAT
  for (const c of ["price_incl", "vat", "quote_no"]) {
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

export async function deletePurchaseOrder(po_no) {
  const { error } = await supabase.from("purchase_orders").delete().eq("po_no", po_no);
  if (error) throw error;
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
}

export async function markPoReceived(po_no) {
  const { error } = await supabase.from("purchase_orders").update({ status: "received", received_at: new Date().toISOString() }).eq("po_no", po_no);
  if (error) throw error;
  syncCashEntriesFromDocs().catch(() => {}); // อัปเดตกระแสเงินสด (จ่ายจริงอิงการจ่ายเงิน ไม่ใช่การรับของ)
}

// ตัวเลขเบา ๆ สำหรับแท็บ "ภาพรวม" ของแดชบอร์ด (นับ/รวมอย่างเดียว ไม่ join อะไรหนัก)
export async function dashboardActionLite() {
  const today = new Date().toISOString().slice(0, 10);
  const [inv, exp, po, poi, sp, lj] = await Promise.all([
    supabase.from("invoices").select("total,wht_amt,status,due_date"),
    supabase.from("expense_requests").select("id,status,amount"),
    supabase.from("purchase_orders").select("po_no,status,vat,expense_id,paid_at").then(async (r) =>
      (r.error && /expense_id|paid_at|vat/i.test(r.error.message || "")) ? await supabase.from("purchase_orders").select("po_no,status") : r), // pre-096/100 fallback
    supabase.from("po_items").select("po_no,qty,price"),
    supabase.from("sub_payouts").select("status,net"),
    supabase.from("job_orders").select("labor_total,labor_paid_amt").eq("labor_confirmed", true).gt("labor_total", 0)
      .then(async (r) => (r.error ? { data: [] } : r)), // pre-045 fallback
  ]);
  const unpaid = (inv.data || []).filter((x) => x.status === "unpaid");
  const pend = (exp.data || []).filter((x) => x.status === "pending");
  const pos = po.data || [];
  // ---- ยอดค้างจ่าย (เจ้าหนี้) ----
  const poTotal = {}; (poi.data || []).forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + (Number(it.qty) || 0) * (Number(it.price) || 0); });
  const poPayable = pos.filter((x) => x.status !== "cancelled" && !x.paid_at)
    .reduce((a, x) => a + (poTotal[x.po_no] || 0) * (x.vat ? 1.07 : 1), 0);               // PO ที่ยังไม่จ่ายเงิน (รวม VAT)
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
// 4 ประเภทไม่ทับกัน: PO ยังไม่จ่าย · เบิกอนุมัติรอจ่าย (ไม่รวมใบเบิกของ PO) · ใบจ่ายซัพรอจ่าย · ค่าแรงยืนยันแล้วยังไม่ตั้งเบิก
export async function listPayables() {
  const [po, poi, exp, sp, lj, tm] = await Promise.all([
    supabase.from("purchase_orders").select("*").neq("status", "cancelled").order("created_at", { ascending: false }),
    supabase.from("po_items").select("po_no,qty,price"),
    supabase.from("expense_requests").select("*").eq("status", "approved").order("created_at", { ascending: false }),
    supabase.from("sub_payouts").select("*").neq("status", "paid").order("created_at", { ascending: false }),
    supabase.from("job_orders").select("job_no,team,labor_total,labor_paid_amt,scheduled_at").eq("labor_confirmed", true).gt("labor_total", 0)
      .then((r) => (r.error ? { data: [] } : r)),
    supabase.from("teams").select("id,name"),
  ]);
  if (po.error) throw po.error;
  const cb = await _creators();
  const teamName = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  const poTotal = {}; (poi.data || []).forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + (Number(it.qty) || 0) * (Number(it.price) || 0); });
  const rows = [];
  (po.data || []).filter((x) => !x.paid_at).forEach((x) => rows.push({
    type: "po", refNo: x.po_no, name: x.supplier || "(ไม่ระบุผู้ขาย)",
    title: x.quote_no ? `อ้างอิง ${x.quote_no}` : null,
    amount: (poTotal[x.po_no] || 0) * (x.vat ? 1.07 : 1),
    date: (x.created_at || "").slice(0, 10),
    status: x.expense_id ? "ส่งเบิกแล้ว · รอจ่าย" : "ยังไม่ตั้งเบิกจ่าย",
  }));
  const poExpIds = new Set((po.data || []).map((x) => x.expense_id).filter(Boolean));
  (exp.data || []).filter((x) => !poExpIds.has(x.id)).forEach((x) => rows.push({
    type: "expense", refNo: `เบิก #${x.id}`, name: cb[x.requester] || cb[x.created_by] || "(ไม่ระบุผู้ขอ)",
    title: x.title || x.category || null, amount: Number(x.amount) || 0,
    date: (x.created_at || "").slice(0, 10), status: "อนุมัติแล้ว · รอจ่าย", expenseId: x.id,
  }));
  (sp.data || []).forEach((x) => rows.push({
    type: "payout", refNo: `ใบจ่ายซัพ ${(x.id || "").slice(0, 6)}`, name: teamName[x.team] || x.team || "ทีมช่างซัพ",
    title: (x.job_nos || []).join(", ") || null, amount: Number(x.net) || 0,
    date: (x.created_at || "").slice(0, 10), status: "รอจ่าย",
  }));
  (lj.data || []).forEach((j) => {
    const owed = Math.max(0, (Number(j.labor_total) || 0) - (Number(j.labor_paid_amt) || 0));
    if (owed > 0) rows.push({
      type: "labor", refNo: j.job_no, name: teamName[j.team] || j.team || "ทีมช่างซัพ",
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
    supabase.from("customers").select("id,name"),
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
  const { error: e2 } = await supabase.from("purchase_orders").update({ expense_id: ex.id }).eq("po_no", po.po_no);
  if (e2) throw new Error(/expense_id|column|PGRST204/i.test(e2.message || "") ? "ยังไม่ได้รัน migration 100 (PO ↔ เบิกจ่าย) ใน Supabase" : (e2.message || e2));
  const me = await getProfile();
  notify(await _usersByRole(["admin", "finance", "exec", "hr"]), { category: "hr", title: `🛒 ${me?.name || "พนักงาน"} ขออนุมัติจ่ายค่าสินค้า ${po.po_no} · ${Number(po.total) || 0} บาท`, body: po.supplier || "", url: "expenses", ref_type: "expense" });
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
    _fetchAll((f, t) => supabase.from("customer_contacts").select("*", { count: "exact" }).range(f, t)),
    _fetchAll((f, t) => supabase.from("customer_sites").select("*", { count: "exact" }).range(f, t)),
  ]);
  const byC = {}, byS = {};
  cc.forEach((x) => { (byC[x.customer_id] = byC[x.customer_id] || []).push(x); });
  cs.forEach((x) => { (byS[x.customer_id] = byS[x.customer_id] || []).push(x); });
  return c.map((cu) => ({ ...cu, contacts: byC[cu.id] || [], sites: byS[cu.id] || [] }));
}

export async function saveCustomer(cust, contacts, sites) {
  const { data: { user } } = await supabase.auth.getUser();
  const fields = { type: cust.type, name: cust.name.trim(), address: cust.address?.trim() || null, tax_id: cust.tax_id?.trim() || null, email: cust.email?.trim() || null, vat: !!cust.vat, note: cust.note?.trim() || null };
  let id = cust.id;
  if (id) {
    const e = (await supabase.from("customers").update(fields).eq("id", id)).error; if (e) throw e;
  } else {
    const r = await supabase.from("customers").insert({ ...fields, created_by: user?.id || null }).select("id").single();
    if (r.error) throw r.error; id = r.data.id;
  }
  await supabase.from("customer_contacts").delete().eq("customer_id", id);
  const cRows = contacts.filter((x) => (x.name || x.phone)).map((x) => ({ customer_id: id, name: x.name?.trim() || null, phone: x.phone?.trim() || null, role: x.role?.trim() || null }));
  if (cRows.length) { const e = (await supabase.from("customer_contacts").insert(cRows)).error; if (e) throw e; }
  await supabase.from("customer_sites").delete().eq("customer_id", id);
  const sRows = sites.filter((x) => (x.site_name || x.address || x.contact_name || x.phone || x.map_url)).map((x) => ({ customer_id: id, site_name: x.site_name?.trim() || null, address: x.address?.trim() || null, map_url: x.map_url?.trim() || null, contact_name: x.contact_name?.trim() || null, phone: x.phone?.trim() || null }));
  if (sRows.length) { const e = (await supabase.from("customer_sites").insert(sRows)).error; if (e) throw e; }
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
    _fetchAll((f, t) => supabase.from("supplier_contacts").select("*", { count: "exact" }).range(f, t)),
    _fetchAll((f, t) => supabase.from("supplier_sites").select("*", { count: "exact" }).range(f, t)),
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
export async function deleteSupplier(id) {
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) throw error;
}

// ---------- BOQ (ใบประมาณการต้นทุน) ----------
export async function listBoqs() {
  const [b, it, cu, si, ct, qt] = await Promise.all([
    supabase.from("boqs").select("*").order("created_at", { ascending: false }),
    supabase.from("boq_items").select("*").order("id"),
    supabase.from("customers").select("id,name,address,tax_id"),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
    supabase.from("quotations").select("quote_no,boq_no,status"),
  ]);
  if (b.error) throw b.error; if (it.error) throw it.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (qt.error) throw qt.error;
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
  const cb = await _creators();
  return (b.data || []).map((bo) => {
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
  const e1 = (await supabase.from("boqs").upsert({
    boq_no: boq.boq_no, customer_id: boq.customer_id || null, site_id: boq.site_id || null,
    title: boq.title?.trim() || null, note: boq.note?.trim() || null, internal_note: boq.internal_note?.trim() || null, ..._termCols(boq), ..._signCols(boq), status: boq.status || "open", created_by: user?.id || null,
  }, { onConflict: "boq_no" })).error;
  if (e1) throw e1;
  const e2 = (await supabase.from("boq_items").delete().eq("boq_no", boq.boq_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const e3 = (await supabase.from("boq_items").insert(items.map((x) => ({
      boq_no: boq.boq_no, section: x.section, item_code: x.code || null, name: x.name || null,
      description: x.description?.trim() || null,
      unit: x.unit || null, qty: Number(x.qty) || 0, unit_cost: Number(x.unit_cost) || 0,
    })))).error;
    if (e3) throw e3;
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
  // chain safety: block if a quotation was created from this BOQ (checked live, not from the UI flag)
  const { count, error: ce } = await supabase.from("quotations").select("quote_no", { count: "exact", head: true }).eq("boq_no", boq_no);
  if (ce) throw ce;
  if ((count || 0) > 0) throw new Error("ลบ BOQ นี้ไม่ได้ — มีใบเสนอราคาอ้างอิงอยู่ · ต้องลบใบเสนอราคา (และเอกสารถัดไป) ก่อน");
  const [{ data: head }, { data: items }] = await Promise.all([
    supabase.from("boqs").select("*").eq("boq_no", boq_no).maybeSingle(),
    supabase.from("boq_items").select("*").eq("boq_no", boq_no),
  ]);
  const { error } = await supabase.from("boqs").delete().eq("boq_no", boq_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "boq", target_no: boq_no, reason, snapshot: head ? { ...head, items: items || [] } : null });
}
export async function setBoqStatus(boq_no, status) {
  const { error } = await supabase.from("boqs").update({ status }).eq("boq_no", boq_no);
  if (error) throw error;
}
export async function setJobStatus(job_no, status) {
  const { error } = await supabase.from("job_orders").update({ status }).eq("job_no", job_no);
  if (error) throw error;
}

// ---------- QUOTATIONS (ใบเสนอราคา) ----------
export async function listQuotations() {
  const [q, it, cu, si, ct, jo, inv] = await Promise.all([
    supabase.from("quotations").select("*").order("created_at", { ascending: false }),
    supabase.from("quotation_items").select("*").order("id"),
    supabase.from("customers").select("id,name,address,tax_id,type"),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
    supabase.from("job_orders").select("job_no,quote_no,scheduled_at,status"),
    supabase.from("invoices").select("quote_no,total,status"),
  ]);
  if (q.error) throw q.error; if (it.error) throw it.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (jo.error) throw jo.error;
  const byQ = {}; (it.data || []).forEach((x) => { (byQ[x.quote_no] = byQ[x.quote_no] || []).push(x); });
  const custName = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const custAddr = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const custTax = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const custType = Object.fromEntries((cu.data || []).map((c) => [c.id, c.type]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const firstContact = {}; (ct.data || []).forEach((c) => { if (!firstContact[c.customer_id]) firstContact[c.customer_id] = c; });
  const jobByQuote = {}; (jo.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  const billedByQ = {}; (inv.data || []).forEach((x) => { if (x.status !== "cancelled") billedByQ[x.quote_no] = (billedByQ[x.quote_no] || 0) + Number(x.total || 0); });
  const cb = await _creators();
  return (q.data || []).map((qo) => {
    const items = byQ[qo.quote_no] || [];
    // วิธีการรับเงิน: ราคาบัตรปรับเข้า "ราคาต่อหน่วยของแต่ละรายการ" (ปัดขึ้นบาทเต็ม/หน่วย) — ไม่มีบรรทัดค่าธรรมเนียม
    // unit_price ที่เก็บ = ราคาเงินสดเสมอ · price_show = ราคาที่แสดง/พิมพ์ตามวิธีชำระ
    const payMethod = qo.pay_method || "cash";
    const payRate = payMethod === "card_full" ? 0.04 : payMethod === "card_inst10" ? 0.14 : 0;
    const adjU = (u) => payRate ? Math.ceil(Math.round((Number(u) || 0) * (1 + payRate) * 100) / 100) : Number(u) || 0;
    const itemsX = items.map((x) => ({ ...x, price_show: adjU(x.unit_price) }));
    const subtotal = itemsX.reduce((a, x) => a + Number(x.qty) * x.price_show, 0);
    const discount = qo.discount_type === "percent" ? subtotal * Number(qo.discount_value || 0) / 100 : Number(qo.discount_value || 0);
    const afterDisc = subtotal - discount;
    const vatAmt = qo.vat ? afterDisc * 0.07 : 0;
    const grand = afterDisc + vatAmt;
    const whtAmt = qo.wht ? afterDisc * (Number(qo.wht_rate) || 3) / 100 : 0; // หัก ณ ที่จ่าย คิดจากฐานก่อน VAT
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
      hasInvoice: (billedByQ[qo.quote_no] || 0) > 0, billedPct: grand > 0 ? (billedByQ[qo.quote_no] || 0) / grand * 100 : 0,
      items: itemsX, subtotal, discount, afterDisc, payMethod, vatAmt, grand, whtAmt, netPay: grand - whtAmt };
  });
}

export async function saveQuotation(q, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const head = {
    quote_no: q.quote_no, customer_id: q.customer_id || null, site_id: q.site_id || null, boq_no: q.boq_no || null,
    title: q.title?.trim() || null, status: q.status || "draft",
    issue_date: q.issue_date || null, valid_until: q.valid_until || null,
    discount_type: q.discount_type || "amount", discount_value: Number(q.discount_value) || 0,
    vat: !!q.vat, wht: !!q.wht, wht_rate: Number(q.wht_rate) || 3, note: q.note?.trim() || null, internal_note: q.internal_note?.trim() || null, ..._termCols(q), ..._signCols(q),
    pay_method: q.pay_method && q.pay_method !== "cash" ? q.pay_method : null,   // เงินสด = ค่าเริ่มต้น (เก็บ null)
    approved_at: q.status === "approved" ? (q.approved_at || new Date().toISOString()) : null,
    created_by: user?.id || null,
  };
  let e1 = (await supabase.from("quotations").upsert(head, { onConflict: "quote_no" })).error;
  // ยังไม่รัน migration 105 → บันทึกต่อได้ (แค่ยังไม่เก็บวิธีการรับเงิน)
  if (e1 && /pay_method/i.test(e1.message || "")) {
    delete head.pay_method;
    e1 = (await supabase.from("quotations").upsert(head, { onConflict: "quote_no" })).error;
  }
  if (e1) throw e1;
  const e2 = (await supabase.from("quotation_items").delete().eq("quote_no", q.quote_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const e3 = (await supabase.from("quotation_items").insert(items.map((x) => ({
      quote_no: q.quote_no, item_code: x.code || null, name: x.name || null, kind: x.kind || null,
      description: x.description?.trim() || null,
      unit: x.unit || null, qty: Number(x.qty) || 0, unit_price: Number(x.unit_price) || 0,
    })))).error;
    if (e3) throw e3;
  }
  syncInternalNote({ quoteNo: q.quote_no, boqNo: q.boq_no }, q.internal_note).catch(() => {});
}

export async function deleteQuotation(quote_no, reason) {
  // chain safety: block if an invoice or job order was created from this quotation
  const [iv, jo] = await Promise.all([
    supabase.from("invoices").select("invoice_no", { count: "exact", head: true }).eq("quote_no", quote_no),
    supabase.from("job_orders").select("job_no", { count: "exact", head: true }).eq("quote_no", quote_no),
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
}

export async function setQuotationStatus(quote_no, status, reason) {
  const patch = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  const { error } = await supabase.from("quotations").update(patch).eq("quote_no", quote_no);
  if (error) throw error;
  if (status === "cancelled" || status === "approved")
    await logAudit({ action: status === "approved" ? "approve" : "cancel", target_type: "quotation", target_no: quote_no, reason });
}

// id → name map of document creators (for the "ผู้สร้างเอกสาร" audit line)
async function _creators() {
  const { data } = await supabase.from("profiles").select("id,name");
  return Object.fromEntries((data || []).map((p) => [p.id, p.name]));
}

// ---------- INVOICES (ใบแจ้งหนี้ · แบ่งงวดได้) ----------
export async function listInvoices() {
  const [iv, cu, si, ct, qt, rc] = await Promise.all([
    supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,name,address,tax_id"),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
    supabase.from("quotations").select("quote_no,boq_no,title"),
    supabase.from("receipts").select("invoice_no,status"),
  ]);
  if (iv.error) throw iv.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (qt.error) throw qt.error;
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cx = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  const boqByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, x.boq_no]));
  const titleByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, x.title]));
  const receiptedInv = new Set((rc.data || []).filter((r) => r.status !== "cancelled").map((r) => r.invoice_no));
  const cb = await _creators();
  return (iv.data || []).map((x) => {
    const s = x.site_id ? sm[x.site_id] : null; const ct0 = cc[x.customer_id];
    return { ...x, boq_no: x.boq_no || (x.quote_no ? boqByQuote[x.quote_no] : null) || null,
      title: x.quote_no ? (titleByQuote[x.quote_no] || null) : null,
      customerName: cn[x.customer_id] || null, customerCode: x.customer_id || null, customerTaxId: cx[x.customer_id] || null,
      customerAddr: ca[x.customer_id] || null, siteName: s?.site_name || null, siteAddress: s?.address || null,
      mapUrl: (s && s.map_url) || _gmap(s?.address || ca[x.customer_id]),
      createdByName: cb[x.created_by] || null,
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null, hasReceipt: receiptedInv.has(x.invoice_no) };
  });
}
// billed total (non-cancelled) per quote_no — used to compute remaining
export function billedByQuote(invoices) {
  const m = {};
  (invoices || []).forEach((x) => { if (x.status !== "cancelled") m[x.quote_no] = (m[x.quote_no] || 0) + Number(x.total || 0); });
  return m;
}
export async function saveInvoice(inv) {
  const { data: { user } } = await supabase.auth.getUser();
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
  const { error } = await supabase.from("invoices").update({ items: items || [], wht_rate: Number(wht_rate) || 3, wht_amt: Number(wht_amt) || 0 }).eq("invoice_no", invoice_no);
  if (error) throw error;
}
export async function setInvoiceStatus(invoice_no, status, reason) {
  // chain safety: cannot cancel an invoice that already has a receipt
  if (status === "cancelled") {
    const { count, error: ce } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", invoice_no);
    if (ce) throw ce;
    if ((count || 0) > 0) throw new Error("ยกเลิกใบแจ้งหนี้นี้ไม่ได้ — ออกใบเสร็จจากใบนี้แล้ว · ต้องลบใบเสร็จก่อน");
  }
  const { error } = await supabase.from("invoices").update({ status }).eq("invoice_no", invoice_no);
  if (error) throw error;
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "invoice", target_no: invoice_no, reason });
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background (cancel removes the "คาดว่าจะรับ" line)
}
export async function deleteInvoice(invoice_no, reason) {
  // chain safety: block if a receipt was issued from this invoice
  const { count, error: ce } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", invoice_no);
  if (ce) throw ce;
  if ((count || 0) > 0) throw new Error("ลบใบแจ้งหนี้นี้ไม่ได้ — ออกใบเสร็จจากใบนี้แล้ว · ต้องลบใบเสร็จก่อน");
  const { data: snap } = await supabase.from("invoices").select("*").eq("invoice_no", invoice_no).maybeSingle();
  const { error } = await supabase.from("invoices").delete().eq("invoice_no", invoice_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "invoice", target_no: invoice_no, reason, snapshot: snap });
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
}

// ---------- RECEIPTS (ใบเสร็จรับเงิน) ----------
export async function listReceipts() {
  const [rc, cu, si, ct, jo, qt] = await Promise.all([
    supabase.from("receipts").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,name,address,tax_id"),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
    supabase.from("job_orders").select("job_no,quote_no"),
    supabase.from("quotations").select("quote_no,title"),
  ]);
  if (rc.error) throw rc.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error; if (jo.error) throw jo.error; if (qt.error) throw qt.error;
  const titleByQuote = Object.fromEntries((qt.data || []).map((x) => [x.quote_no, x.title]));
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cx = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  const jobByQuote = {}; (jo.data || []).forEach((j) => { if (j.quote_no && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j.job_no; });
  const cb = await _creators();
  return (rc.data || []).map((x) => {
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
  const { error } = await supabase.from("receipts").upsert({
    receipt_no: r.receipt_no, invoice_no: r.invoice_no || null, quote_no: r.quote_no || null, boq_no: r.boq_no || null, job_no: r.job_no || null,
    customer_id: r.customer_id || null, site_id: r.site_id || null, issue_date: r.issue_date || null, payment_method: r.payment_method || null,
    base: Number(r.base) || 0, vat_amt: Number(r.vat_amt) || 0, total: Number(r.total) || 0, wht_amt: Number(r.wht_amt) || 0, net: Number(r.net) || 0,
    wht: !!r.wht, wht_rate: Number(r.wht_rate) || 3, items: r.items || [],
    status, note: r.note?.trim() || null, internal_note: r.internal_note?.trim() || null, ..._termCols(r), ..._signCols(r), created_by: user?.id || null,
  }, { onConflict: "receipt_no" });
  if (error) throw error;
  if (r.invoice_no) await supabase.from("invoices").update({ status: status === "paid" ? "paid" : "unpaid" }).eq("invoice_no", r.invoice_no);
  syncCashEntriesFromDocs().catch(() => {}); // auto-update cash flow in background
  syncBankReceipts().catch(() => {});        // auto-post the deposit into the bank-account ledger
  syncInternalNote({ invoiceNo: r.invoice_no }, r.internal_note).catch(() => {});
}
// update per-line WHT selection + rate + recomputed amounts on a receipt
export async function setReceiptWht(receipt_no, items, wht, wht_rate, wht_amt, net) {
  const { error } = await supabase.from("receipts").update({ items: items || [], wht: !!wht, wht_rate: Number(wht_rate) || 3, wht_amt: Number(wht_amt) || 0, net: Number(net) || 0 }).eq("receipt_no", receipt_no);
  if (error) throw error;
}
// toggle a receipt's paid status (and sync the linked invoice)
// ---------- BILLING NOTES (ใบวางบิล) ----------
export async function listBillingNotes() {
  const [bn, iv, cu, si, ct, rc, qt] = await Promise.all([
    supabase.from("billing_notes").select("*").order("created_at", { ascending: false }),
    supabase.from("invoices").select("invoice_no,total,wht_amt,installment,pct,status,issue_date,quote_no"),
    supabase.from("customers").select("id,name,address,tax_id,type"),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
    supabase.from("receipts").select("invoice_no,status"),
    supabase.from("quotations").select("quote_no,vat"),
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
    const total = invoices.reduce((a, x) => a + (Number(x.total) || 0), 0);
    const wht = invoices.reduce((a, x) => a + (Number(x.wht_amt) || 0), 0);   // หัก ณ ที่จ่าย รวม (นิติบุคคล)
    const vat = invoices.some((x) => x.vat);   // ใบวางบิลถือเป็น VAT ถ้ามีใบแจ้งหนี้ VAT อยู่ → เลือกหัวกระดาษ/บัญชีให้ถูก
    const s = b.site_id ? sm[b.site_id] : null; const ct0 = cc[b.customer_id];
    return { ...b, customerName: cn[b.customer_id] || null, customerCode: b.customer_id || null, customerTaxId: cx[b.customer_id] || null,
      customerType: ctype[b.customer_id] || null, vat,
      customerAddr: ca[b.customer_id] || null, siteName: s?.site_name || null, siteAddress: s?.address || null, mapUrl: (s && s.map_url) || _gmap(s?.address || ca[b.customer_id]),
      mainContactName: ct0?.name || null, mainContactPhone: ct0?.phone || null, siteContactName: s?.contact_name || null, siteContactPhone: s?.phone || null,
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      invoices, total, wht, net: Math.round((total - wht) * 100) / 100, missing: (b.invoice_nos || []).length - invoices.length };
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
export async function setBillingNoteStatus(billing_no, status, reason) {
  const { error } = await supabase.from("billing_notes").update({ status }).eq("billing_no", billing_no);
  if (error) throw error;
  if (status === "cancelled") await logAudit({ action: "cancel", target_type: "billing_note", target_no: billing_no, reason });
}
export async function deleteBillingNote(billing_no, reason) {
  const { data: snap } = await supabase.from("billing_notes").select("*").eq("billing_no", billing_no).maybeSingle();
  const { error } = await supabase.from("billing_notes").delete().eq("billing_no", billing_no);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "billing_note", target_no: billing_no, reason, snapshot: snap });
}

export async function setReceiptStatus(receipt_no, status, invoice_no, reason) {
  const { error } = await supabase.from("receipts").update({ status }).eq("receipt_no", receipt_no);
  if (error) throw error;
  if (invoice_no) await supabase.from("invoices").update({ status: status === "paid" ? "paid" : "unpaid" }).eq("invoice_no", invoice_no);
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
  if (invoice_no) await supabase.from("invoices").update({ status: "unpaid" }).eq("invoice_no", invoice_no);
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

export async function listJobOrders() {
  const [j, cu, tm, si, ct, qt, qit, jv] = await Promise.all([
    supabase.from("job_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,name,address"),
    supabase.from("teams").select("id,name"),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
    supabase.from("quotations").select("quote_no,boq_no,discount_type,discount_value,vat,created_by"),
    supabase.from("quotation_items").select("quote_no,name,unit,qty,unit_price,kind"),
    supabase.from("job_visits").select("*").order("visit_date", { ascending: true }),
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
    subByQuote[x.quote_no] = (subByQuote[x.quote_no] || 0) + Number(x.qty) * Number(x.unit_price);
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
export async function listTeamJobOrders(team) {
  const [j, si, cu, ct] = await Promise.all([
    supabase.from("job_orders").select("*").eq("assigned_team", team).order("scheduled_at", { ascending: true }),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customers").select("id,name,address"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
  ]);
  if (j.error) throw j.error; if (si.error) throw si.error; if (cu.error) throw cu.error; if (ct.error) throw ct.error;
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

const _JOB_ST_TH = { pending: "รอเริ่มงาน", scheduled: "นัดแล้ว", in_progress: "กำลังทำ", awaiting_approval: "รออนุมัติ", reschedule: "นัดหมายเพิ่ม", done: "เสร็จแล้ว", cancelled: "ยกเลิก" };

export async function saveJobOrder(jo, author) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("job_orders").upsert({
    job_no: jo.job_no, group_no: jo.group_no || null, quote_no: jo.quote_no || null, customer_id: jo.customer_id || null, site_id: jo.site_id || null,
    title: jo.title?.trim() || null, job_type: jo.job_type || "install", contact_name: jo.contact_name?.trim() || null, contact_phone: jo.contact_phone?.trim() || null,
    address: jo.address?.trim() || null, map_url: jo.map_url?.trim() || null, details: jo.details?.trim() || null,
    sales_note: jo.sales_note?.trim() || null, sales_photos: jo.sales_photos || [], internal_note: jo.internal_note?.trim() || null,
    assigned_team: jo.assigned_team || null, scheduled_at: jo.scheduled_at || null,
    end_date: jo.end_date || null, slot: jo.slot || null,
    status: jo.status || "pending", created_by: user?.id || null,
  }, { onConflict: "job_no" });
  if (error) throw error;
  // replace this job's visits (job_visits) when provided
  if (Array.isArray(jo.visits)) {
    await supabase.from("job_visits").delete().eq("job_no", jo.job_no);
    const rows = jo.visits
      .filter((v) => v.visit_date)
      .map((v) => ({ job_no: jo.job_no, visit_date: v.visit_date, end_date: v.end_date || null, slot: v.slot || null, scheduled_at: v.scheduled_at || null, assigned_team: v.assigned_team || null, status: v.status || "scheduled", note: v.note || null, created_by: user?.id || null }));
    if (rows.length) { const e2 = (await supabase.from("job_visits").insert(rows)).error; if (e2) throw e2; }
  }
  // audit trail: record who created/edited the job (best-effort)
  await supabase.from("job_logs").insert({ job_no: jo.job_no, type: "edit", status: jo.status || null, author: author || null, created_by: user?.id || null });
  // handoff: notify the assigned team's members
  if (jo.assigned_team) {
    const { data: tm } = await supabase.from("profiles").select("id").eq("team", jo.assigned_team);
    notify((tm || []).map((p) => p.id), { category: "job", title: `🔧 มอบหมายงาน ${jo.job_no}`, body: jo.title || "", url: "joborders", ref_type: "job", ref_no: jo.job_no });
  }
  syncInternalNote({ quoteNo: jo.quote_no }, jo.internal_note).catch(() => {});
}

export async function updateJobStatus(job_no, status, author) {
  const { error } = await supabase.from("job_orders").update({ status }).eq("job_no", job_no);
  if (error) throw error;
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
  let q = supabase.from("job_handovers").select(HANDOVER_COLS).order("created_at", { ascending: false });
  if (jobNo) q = q.eq("job_no", jobNo);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
  let names = {};
  if (ids.length) {
    const { data: ps } = await supabase.from("profiles").select("id,name,email").in("id", ids);
    names = Object.fromEntries((ps || []).map((p) => [p.id, p.name || p.email]));
  }
  return rows.map((r) => ({ ...r, creatorName: names[r.created_by] || "" }));
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
  if (h.id) {
    const { data, error } = await supabase.from("job_handovers").update(fields).eq("id", h.id).select(HANDOVER_COLS).single();
    if (error) throw error;
    return data;
  }
  fields.created_by = await _uid();
  const { data, error } = await supabase.from("job_handovers").insert(fields).select(HANDOVER_COLS).single();
  if (error) throw error;
  return data;
}

export async function deleteHandover(id) {
  const { error } = await supabase.from("job_handovers").delete().eq("id", id);
  if (error) throw error;
}

// draw-on-screen signature (a PNG data URL) → public URL in storage (reuses the staff-signature uploader)
export async function uploadSignatureDataUrl(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return uploadSignature(blob);
}

// office quick action: move every visit of a job whose status is in fromStatuses → toStatus,
// then recompute the job's overall status (server-side RPC so RLS on job_orders doesn't block it).
export async function setJobVisitsStatus(jobNo, fromStatuses, toStatus, author) {
  const { data: { user } } = await supabase.auth.getUser();
  // no-visit job → update the job row directly
  const { count } = await supabase.from("job_visits").select("id", { count: "exact", head: true }).eq("job_no", jobNo);
  if (!count) { const e = (await supabase.from("job_orders").update({ status: toStatus }).eq("job_no", jobNo)).error; if (e) throw e; }
  else { const { data, error } = await supabase.rpc("set_job_visits_status", { p_job: jobNo, p_from: fromStatuses, p_to: toStatus }); if (error) throw error; var jobStatus = data; }
  await supabase.from("job_logs").insert({ job_no: jobNo, type: "status", status: toStatus, author: author || null, created_by: user?.id || null });
  notify(await _jobWatchers(jobNo), { category: "job", title: `📋 งาน ${jobNo} → ${_JOB_ST_TH[toStatus] || toStatus}`, url: "joborders", ref_type: "job", ref_no: jobNo });
  return jobStatus || toStatus;
}

// update one visit's status, then recompute the job's overall status — via SECURITY DEFINER RPC
export async function updateVisitStatus(visitId, jobNo, status, author) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("set_visit_status", { p_visit_id: visitId, p_status: status });
  if (error) throw error;
  await supabase.from("job_logs").insert({ job_no: jobNo, type: "status", status, author: author || null, created_by: user?.id || null });
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
const WEB_KINDS = { banners: "web_banners", portfolio: "web_portfolio", clients: "web_clients", articles: "web_articles", press: "web_press", ads: "web_ads" };
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
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "transaction", target_no: id, reason, snapshot: snap });
}
// ยกเลิกการบันทึกทั้งชุด (batch) — ใช้กับ "ยกเลิกรับเข้าทั้งใบ PO": ลบทุกรายการในชุด (สต๊อกคืนอัตโนมัติ)
// และถ้าชุดนี้อ้างใบสั่งซื้อ → คืนสถานะ PO เป็น "รอรับของ" + อัปเดตกระแสเงินสด (actual → projected)
export async function cancelTransactionGroup({ ids, ref_no, po_no }, reason) {
  if (!ids?.length) throw new Error("ไม่มีรายการในชุดนี้");
  const { data: snap } = await supabase.from("transactions").select("*").in("id", ids);
  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) throw error;
  await logAudit({ action: "delete", target_type: "transaction_batch", target_no: ref_no || String(ids[0]), reason, snapshot: { po_no: po_no || null, rows: snap || [] } });
  if (po_no) {
    const { error: e2 } = await supabase.from("purchase_orders").update({ status: "open", received_at: null }).eq("po_no", po_no).eq("status", "received");
    if (e2) throw e2;
    syncCashEntriesFromDocs().catch(() => {});  // PO เด้งกลับ "คาดว่าจะจ่าย"
  }
}
// edit a movement's quantity (stock + value recompute automatically from the transactions table)
export async function updateTransaction(id, qty) {
  const { error } = await supabase.from("transactions").update({ qty: Number(qty) }).eq("id", id);
  if (error) throw error;
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

// transactions since a date (YYYY-MM-DD); null = all-time. For dashboards.
export async function listTransactionsSince(startDate) {
  let q = supabase.from("transactions").select("*").limit(10000);
  if (startDate) q = q.gte("txn_date", startDate);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ต้นทุนวัสดุที่เบิก/คืน รวมต่อใบงาน → { job_no: { withdraw, return } }
export async function jobMaterialCost() {
  const rows = await _fetchAll((f, t) =>
    supabase.from("transactions").select("job_no,type,value", { count: "exact" }).not("job_no", "is", null).range(f, t)
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
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("material_code", code)
    .order("id", { ascending: false })
    .limit(300);
  if (error) throw error;
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
  const { data, error } = await supabase.from("sub_payouts").select("*").order("created_at", { ascending: false });
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
  const gross = _r2(ls.reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const vatBase = _r2(ls.filter((l) => l.vat).reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const whtAmt = _r2(vatBase * (Number(whtRate) || 0) / 100);
  const net = _r2(gross - whtAmt);
  const { data, error } = await supabase.from("sub_payouts").insert({
    team, job_nos: jobNos, lines: ls, gross, wht_rate: Number(whtRate) || 0, wht_amt: whtAmt,
    net, status: "unpaid", note: note || null, created_by: uid,
  }).select("id").single();
  if (error) throw error;
  // bump each job's cumulative allocated amount; lock the job when fully allocated
  const { data: jrows } = await supabase.from("job_orders").select("job_no,labor_total,labor_paid_amt").in("job_no", jobNos);
  const cur = Object.fromEntries((jrows || []).map((j) => [j.job_no, j]));
  for (const l of ls) {
    const j = cur[l.job_no]; if (!j) continue;
    const paid = _r2((Number(j.labor_paid_amt) || 0) + (Number(l.amount) || 0));
    const done = paid >= (Number(j.labor_total) || 0) - 0.01;
    await supabase.from("job_orders").update({ labor_paid_amt: paid, labor_paid: done, payout_id: data.id }).eq("job_no", l.job_no);
  }
  syncCashEntriesFromDocs().catch(() => {}); // new payout → "คาดว่าจะจ่าย" in cash flow
  return data.id;
}
// mark a payout paid + choose the paying account → posts an "out" line into that account's
// ledger (kind='payout') for bank reconciliation. Cash flow is handled separately by the sync.
// Back-compat: paySubPayout(id, "โอนเงิน") still works (no account).
export async function paySubPayout(id, opts) {
  const { accountId, method, payDate } = typeof opts === "string" ? { method: opts } : (opts || {});
  const uid = await _uid();
  const { data: p, error: e0 } = await supabase.from("sub_payouts").select("net,team,status").eq("id", id).single();
  if (e0) throw e0;
  if (p.status === "paid") throw new Error("ใบนี้บันทึกจ่ายแล้ว");
  const day = payDate || new Date().toISOString().slice(0, 10);
  const patch = { status: "paid", paid_at: new Date().toISOString(), method: method || null, paid_from: accountId || null };
  let upd = await supabase.from("sub_payouts").update(patch).eq("id", id);
  if (upd.error && /paid_from|column|PGRST204/i.test(upd.error.message || "")) { delete patch.paid_from; upd = await supabase.from("sub_payouts").update(patch).eq("id", id); }
  if (upd.error) throw upd.error;
  if (accountId) {
    const { error: eAcc } = await supabase.from("account_entries").insert({ account_id: accountId, direction: "out", amount: Number(p.net) || 0, kind: "payout", ref_type: "payout", ref_id: id, note: `จ่ายค่าแรงช่างซัพ · ทีม ${p.team}`, entry_date: day, created_by: uid });
    if (eAcc) throw eAcc;
  }
  syncCashEntriesFromDocs().catch(() => {}); // paid → move to "จ่ายจริง" in cash flow
}
// cancel an unpaid payout → give the allocated amounts back so the jobs return to "รอจ่าย"
export async function cancelSubPayout(id) {
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
// hard-delete a payout (admin/finance correction) — works on paid ones too;
// releases each job's cumulative paid amount back so the labor returns to "รอจ่าย".
export async function deleteSubPayout(id) {
  const { data: p, error } = await supabase.from("sub_payouts").select("id,lines,job_nos").eq("id", id).single();
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
    const office = await _usersByRole(["admin", "exec", "sales"]);
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
      if (session) fetch("/api/push-send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ userIds: allowed, title, body: (body || "").slice(0, 180), url: "/" }) }).catch(() => {});
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
  const { data, error } = await supabase.from("notifications").select("url").eq("user_id", uid).is("read_at", null).not("url", "is", null).limit(1000);
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
export async function listTasks() {
  const [t, profs, cc, cu] = await Promise.all([
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,name,email"),
    supabase.from("task_comments").select("task_id"),
    supabase.from("customers").select("id,name"),
  ]);
  if (t.error) throw t.error;
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
    supabase.from("account_entries").select("account_id,direction,amount"),
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
  let q = supabase.from("account_entries").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
  if (accountId) q = q.eq("account_id", accountId);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  const { data, error } = await q.limit(2000);
  if (error) throw error; return data || [];
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
export async function updateAccountEntry(id, { amount, note, entry_date, direction } = {}) {
  const patch = {};
  if (amount != null) patch.amount = Number(amount) || 0;
  if (note !== undefined) patch.note = note?.trim() || null;
  if (entry_date) patch.entry_date = entry_date;
  if (direction) patch.direction = direction;
  const { error } = await supabase.from("account_entries").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteAccountEntry(id) {
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
  const [accRes, rcRes, cuRes] = await Promise.all([
    supabase.from("accounts").select("id,code"),
    supabase.from("receipts").select("receipt_no,issue_date,vat_amt,net,total,status,payment_method,customer_id"),
    supabase.from("customers").select("id,name"),
  ]);
  if (accRes.error) throw accRes.error; if (rcRes.error) throw rcRes.error;
  const accByCode = Object.fromEntries((accRes.data || []).map((a) => [a.code, a.id]));
  const vatAcc = accByCode.vat, novatAcc = accByCode.novat, tradeAcc = accByCode.trade;
  if (!vatAcc || !novatAcc) return { added: 0, updated: 0, removed: 0 };
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const TRADE_METHODS = ["Trade Account", "Trade Baht"];   // Trade Baht = ช่องทางเดียวกัน (label เก่า/ใหม่)

  // existing receipt-sourced entries — resilient to a missing `reconciled` column (pre-089)
  let ex = await supabase.from("account_entries").select("id,ref_id,reconciled,account_id,amount,entry_date").eq("ref_type", "receipt");
  if (ex.error && /reconciled|column|PGRST/i.test(ex.error.message || "")) ex = await supabase.from("account_entries").select("id,ref_id,account_id,amount,entry_date").eq("ref_type", "receipt");
  if (ex.error) throw ex.error;
  const existing = {}; (ex.data || []).forEach((e) => { existing[e.ref_id] = e; });

  const desired = {};
  (rcRes.data || []).forEach((r) => {
    if (r.status !== "paid") return;
    if (r.payment_method === "เงินสด") return;                 // cash → not a bank deposit
    const amt = Math.round((Number(r.net) || Number(r.total) || 0) * 100) / 100;
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
export async function updateTransfer(ref_id, { fromId, toId, amount, note, entry_date }) {
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
  const me = await getProfile();
  notify(await _usersByRole(["admin", "finance", "exec", "hr"]), { category: "hr", title: `🧾 ${me?.name || "พนักงาน"} ขอเบิกค่าใช้จ่าย ${Number(e.amount) || 0} บาท`, body: e.title || "", url: "expenses", ref_type: "expense" });
}
// เติม เลขงาน · ชื่องาน · ชื่อลูกค้า ให้ใบเบิกจ่าย
//  - ใบเบิกที่มี job_no ตรง ๆ (ค่าใช้จ่ายเข้างาน) → จากใบงานนั้น
//  - ใบเบิกค่าสินค้า PO (job_no ว่าง) → โยงผ่าน PO.expense_id → ใบเสนอราคา → ลูกค้า + ใบงาน
async function _enrichExpenseJobs(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((x) => x.id).filter(Boolean);
  let poByExp = {};
  try {
    const { data } = await supabase.from("purchase_orders").select("po_no,quote_no,expense_id").in("expense_id", ids.length ? ids : ["_"]);
    (data || []).forEach((p) => { if (p.expense_id) poByExp[p.expense_id] = p; });
  } catch (_) { /* pre-100: ไม่มี expense_id — ข้าม */ }
  const [joRes, quRes, cuRes] = await Promise.all([
    supabase.from("job_orders").select("job_no,quote_no,customer_id,title,status"),
    supabase.from("quotations").select("quote_no,customer_id,title"),
    supabase.from("customers").select("id,name"),
  ]);
  const custName = Object.fromEntries((cuRes.data || []).map((c) => [c.id, c.name]));
  const jobByNo = Object.fromEntries((joRes.data || []).map((j) => [j.job_no, j]));
  const quoteInfo = Object.fromEntries((quRes.data || []).map((x) => [x.quote_no, x]));
  const jobByQuote = {}; (joRes.data || []).forEach((j) => { if (j.quote_no && j.status !== "cancelled" && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
  return rows.map((x) => {
    let job = x.job_no ? jobByNo[x.job_no] : null;
    let quoteNo = job?.quote_no || null;
    const po = poByExp[x.id] || null;
    if (!job && po?.quote_no) { quoteNo = po.quote_no; job = jobByQuote[po.quote_no] || null; }
    const qi = quoteNo ? quoteInfo[quoteNo] : null;
    const custId = job?.customer_id ?? qi?.customer_id ?? null;
    return { ...x, jobNo: job?.job_no || null, jobTitle: job?.title || qi?.title || null,
      customerName: custId != null ? custName[custId] || null : null, poNo: po?.po_no || null, quoteNo };
  });
}
export async function listMyExpenses() {
  const uid = await _uid();
  const { data, error } = await supabase.from("expense_requests").select("*").eq("requester", uid).order("created_at", { ascending: false });
  if (error) throw error;
  return _enrichExpenseJobs(data || []);
}
export async function listExpenses(status) {
  let q = supabase.from("expense_requests").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const [ex, profs] = await Promise.all([q, supabase.from("profiles").select("id,name,email")]);
  if (ex.error) throw ex.error;
  const nm = Object.fromEntries((profs.data || []).map((p) => [p.id, p.name || p.email]));
  const enriched = await _enrichExpenseJobs(ex.data || []);
  return enriched.map((x) => ({ ...x, requesterName: nm[x.requester] || "—", approverName: x.approver ? (nm[x.approver] || "—") : null }));
}
export async function decideExpense(id, status, note) {
  const uid = await _uid();
  const { error } = await supabase.from("expense_requests").update({ status, approver: uid, decided_at: new Date().toISOString(), decide_note: note || null }).eq("id", id);
  if (error) throw error;
  // คำขอชำระใบสั่งซื้อถูกปฏิเสธ → ปลดลิงก์ให้ PO กลับเป็น "ยังไม่จ่าย" (ส่งขอใหม่ได้)
  if (status === "rejected") { try { await supabase.from("purchase_orders").update({ expense_id: null }).eq("expense_id", id); } catch (_) {} }
  const { data: ex } = await supabase.from("expense_requests").select("requester,title").eq("id", id).maybeSingle();
  const lbl = { approved: "อนุมัติ ✅", rejected: "ไม่อนุมัติ ❌", pending: "กลับเป็นรออนุมัติ" }[status] || status;
  if (ex) notify([ex.requester], { category: "hr", title: `🧾 คำขอเบิก "${ex.title}" : ${lbl}`, body: note || "", url: "expenses", ref_type: "expense" });
}
// จ่ายเงินเบิก — รองรับ "แบ่งจ่าย": ส่ง amount = งวดนี้ (ไม่ส่ง = จ่ายยอดคงเหลือทั้งหมด)
//  จ่ายครบ → status=paid + ประทับ PO/กระแสเงินสด · จ่ายบางส่วน → paid_amount เพิ่ม สถานะยัง approved
export async function payExpense(id, { accountId, proof, payDate, amount, expectedPayDate } = {}) {
  const uid = await _uid();
  const { data: ex, error: e0 } = await supabase.from("expense_requests").select("*").eq("id", id).single();
  if (e0) throw e0;
  if (ex.status === "paid") throw new Error("จ่ายเงินครบแล้ว");
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
  let uErr = (await supabase.from("expense_requests").update(upd).eq("id", id)).error;
  // pre-111/112: ไม่มีคอลัมน์ paid_amount/last_paid_at/expected_pay_date → บังคับจ่ายเต็มจำนวน
  if (uErr && /paid_amount|last_paid_at|expected_pay_date/i.test(uErr.message || "")) {
    if (!fully) throw new Error("ยังไม่ได้รัน migration 111/112 — แบ่งจ่ายยังไม่พร้อม (จ่ายเต็มยอดก่อน)");
    delete upd.paid_amount; delete upd.last_paid_at; delete upd.expected_pay_date;
    uErr = (await supabase.from("expense_requests").update(upd).eq("id", id)).error;
  }
  if (uErr) throw uErr;

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
  const { data } = await supabase.from("expense_requests").select("job_no,amount,status").not("job_no", "is", null).in("status", ["approved", "paid"]);
  const m = {}; (data || []).forEach((x) => { if (x.job_no) m[x.job_no] = (m[x.job_no] || 0) + (Number(x.amount) || 0); });
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
export async function listLineContacts() {
  const [c, cu, links] = await Promise.all([
    supabase.from("line_contacts").select("*").order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("customers").select("id,name"),
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

export async function listLineMessages(uid) {
  const { data, error } = await supabase.from("line_messages").select("*").eq("line_user_id", uid).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
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
    supabase.from("fb_contacts").select("*").order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("customers").select("id,name"),
  ]);
  if (c.error) throw c.error;
  const cn = Object.fromEntries((cu.data || []).map((x) => [x.id, x.name]));
  // line_user_id alias so the existing inbox UI can render FB contacts unchanged
  return (c.data || []).map((r) => ({ ...r, line_user_id: r.psid, channel: "fb", customerName: r.customer_id ? cn[r.customer_id] : null }));
}
export async function listFbMessages(psid) {
  const { data, error } = await supabase.from("fb_messages").select("*").eq("psid", psid).order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((m) => ({ ...m, line_user_id: m.psid }));
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
export async function setMyAvatar(url) {
  const { error } = await supabase.rpc("set_my_avatar", { p_url: url || "" });
  if (error) throw error;
}
export async function setRoomAvatar(roomId, url) {
  const { error } = await supabase.rpc("set_room_avatar", { p_room: roomId, p_url: url || "" });
  if (error) throw error;
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
  const { data, error } = await supabase.from("hr_attendance").select("*").eq("user_id", uid).eq("work_date", _today()).maybeSingle();
  if (error) throw error; return data || null;
}
export async function checkIn({ lat, lng, photo }) {
  const uid = await _uid(), day = _today();
  const ex = await supabase.from("hr_attendance").select("id,check_in_at").eq("user_id", uid).eq("work_date", day).maybeSingle();
  if (ex.data && ex.data.check_in_at) throw new Error("เช็คอินวันนี้ไปแล้ว");
  const row = { check_in_at: new Date().toISOString(), check_in_lat: lat ?? null, check_in_lng: lng ?? null, check_in_photo: photo || null };
  const { error } = ex.data
    ? await supabase.from("hr_attendance").update(row).eq("id", ex.data.id)
    : await supabase.from("hr_attendance").insert({ user_id: uid, work_date: day, ...row });
  if (error) throw error;
  const me = await getProfile();
  notify(await _usersByRole(["admin", "exec"]), { category: "hr", title: `🕒 ${me?.name || "พนักงาน"} เช็คอินเข้างาน`, url: "hr", ref_type: "attendance" });
}
export async function checkOut({ lat, lng, photo }) {
  const uid = await _uid(), day = _today();
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
  const [att, profs] = await Promise.all([
    supabase.from("hr_attendance").select("*").gte("work_date", fromDay).lte("work_date", toDay).order("work_date", { ascending: false }),
    supabase.from("profiles").select("id,name,role,department,work_pattern,sat_group"),
  ]);
  if (att.error) throw att.error;
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return (att.data || []).map((a) => ({ ...a, name: pm[a.user_id]?.name || "-", department: posLabel(pm[a.user_id]), work_pattern: pm[a.user_id]?.work_pattern, sat_group: pm[a.user_id]?.sat_group }));
}

export async function submitLeave({ type, start_date, end_date, days, reason }) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_leaves").insert({ user_id: uid, type, start_date, end_date, days, reason: reason || null });
  if (error) throw error;
  const me = await getProfile();
  notify(await _usersByRole(["admin", "exec"]), { category: "hr", title: `📝 ${me?.name || "พนักงาน"} ขอลา (${days} วัน)`, body: reason || "", url: "hr", ref_type: "leave" });
}
export async function listMyLeaves() {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_leaves").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw error; return data || [];
}
export async function listLeaves(status) {
  let q = supabase.from("hr_leaves").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const [lv, profs] = await Promise.all([q, supabase.from("profiles").select("id,name,role,department")]);
  if (lv.error) throw lv.error;
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return (lv.data || []).map((l) => ({ ...l, name: pm[l.user_id]?.name || "-", department: posLabel(pm[l.user_id]) }));
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
  const patch = { type: fields.type, start_date: fields.start_date, end_date: fields.end_date, days: Number(fields.days) || 1, reason: fields.reason || null };
  const { error } = await supabase.from("hr_leaves").update(patch).eq("id", id);
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
  const me = await getProfile();
  notify(await _usersByRole(["admin", "finance", "exec"]), { category: "hr", title: `💵 ${me?.name || "พนักงาน"} ขอเบิกเงินล่วงหน้า ${Number(amount) || 0} บาท`, body: reason || "", url: "hr", ref_type: "advance" });
}
export async function listMyAdvances() {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_advances").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw error; return data || [];
}
// staff can withdraw their own request while it's still pending
export async function cancelMyAdvance(id) {
  const { error } = await supabase.from("hr_advances").delete().eq("id", id).eq("status", "pending");
  if (error) throw error;
}
export async function listAdvances(status) {
  let q = supabase.from("hr_advances").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const [av, profs] = await Promise.all([q, supabase.from("profiles").select("id,name,role,department")]);
  if (av.error) throw av.error;
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return (av.data || []).map((a) => ({ ...a, name: pm[a.user_id]?.name || "-", department: posLabel(pm[a.user_id]) }));
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
  const [pr, tm] = await Promise.all([
    supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date,signature_url,pay_type,base_pay,ot_rate,sso").order("name"),
    supabase.from("teams").select("id,type"),
  ]);
  if (pr.error) throw pr.error;
  const subIds = new Set((tm.data || []).filter((t) => t.type === "sub").map((t) => t.id));
  // permanent staff only (drop subcontractor-team members); position label follows the Settings role
  return (pr.data || []).filter((p) => !subIds.has(p.team)).map((p) => ({ ...p, department: posLabel(p) }));
}
export async function updateHrProfile(id, fields) {
  const { error } = await supabase.from("profiles").update(fields).eq("id", id);
  if (error) throw error;
}

// admin/HR manually set a person's check-in/out for a day (correction). times = ISO or null.
export async function adminSaveAttendance(userId, workDate, checkInAt, checkOutAt) {
  const { error } = await supabase.from("hr_attendance").upsert(
    { user_id: userId, work_date: workDate, check_in_at: checkInAt || null, check_out_at: checkOutAt || null },
    { onConflict: "user_id,work_date" });
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
export async function savePayslip(p) {
  const uid = await _uid();
  const { error } = await supabase.from("payslips").upsert({
    period: p.period, user_id: p.user_id, pay_type: p.pay_type || null,
    base: p.base || 0, ot_pay: p.ot_pay || 0,
    present_days: p.present_days || 0, absent_days: p.absent_days || 0, leave_days: p.leave_days || 0, over_leave_days: p.over_leave_days || 0,
    late_min: p.late_min || 0, ot_min: p.ot_min || 0,
    d_late: p.d_late || 0, d_absent: p.d_absent || 0, d_leave: p.d_leave || 0, d_sso: p.d_sso || 0, d_advance: p.d_advance || 0,
    bonus: p.bonus || 0, other_deduct: p.other_deduct || 0, other_note: p.other_note || null,
    net: p.net || 0, status: p.status || "draft", note: p.note || null, created_by: uid, updated_at: new Date().toISOString(),
  }, { onConflict: "period,user_id" });
  if (error) throw error;
}
export async function setPayslipPaid(period, paid) {
  const patch = paid ? { status: "paid", paid_at: new Date().toISOString() } : { status: "draft", paid_at: null };
  const { error } = await supabase.from("payslips").update(patch).eq("period", period);
  if (error) throw error;
}
// link a paid payroll run to Cash Flow as a projected outflow on the month's pay date (วันสิ้นเดือน).
// Reuses the salary source_ref so it overrides that month's auto-estimate; edited=true stops the
// estimate sync from reverting it.
export async function upsertPayrollCashEntry(ym, amount, payDate, headcount) {
  const ref = `salary-${ym}`;
  const fields = { direction: "out", status: "projected", entry_date: payDate, amount: Number(amount) || 0,
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
export async function addQuickReply(text, title) {
  // put new replies at the end (largest sort + 1)
  const { data } = await supabase.from("quick_replies").select("sort").order("sort", { ascending: false }).limit(1);
  const nextSort = ((data && data[0] && data[0].sort) || 0) + 1;
  const { error } = await supabase.from("quick_replies").insert({ text: text.trim(), title: (title || "").trim() || null, sort: nextSort });
  if (error) throw error;
}
export async function updateQuickReply(id, fields) {
  const patch = {};
  if (fields.text != null) patch.text = String(fields.text).trim();
  if (fields.title !== undefined) patch.title = (fields.title || "").trim() || null;
  const { error } = await supabase.from("quick_replies").update(patch).eq("id", id);
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
  const { data, error } = await supabase.from("cash_entries").select("*").order("entry_date", { ascending: true });
  if (error) throw error; return data || [];
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
  const { data } = await supabase.from("cash_entries").select("amount").eq("source_type", "opening").maybeSingle();
  return Number(data?.amount) || 0;
}
export async function setOpeningBalance(amount) {
  const { data } = await supabase.from("cash_entries").select("id").eq("source_type", "opening").maybeSingle();
  if (data?.id) { await supabase.from("cash_entries").update({ amount: Number(amount) || 0, updated_at: new Date().toISOString() }).eq("id", data.id); }
  else { const uid = await _uid(); await supabase.from("cash_entries").insert({ direction: "in", status: "actual", entry_date: "2000-01-01", amount: Number(amount) || 0, note: "เงินสดยกมา", source_type: "opening", source_ref: "opening", created_by: uid }); }
}
// seed/refresh ledger lines from documents (idempotent; never overwrites user-edited rows)
export async function syncCashEntriesFromDocs() {
  const _d = (ts) => (ts ? String(ts).slice(0, 10) : null);
  const [inv, rec, pay, po, poItems, cust, team, existing, salaryProfiles, laborJobs, expReq] = await Promise.all([
    supabase.from("invoices").select("invoice_no,due_date,issue_date,total,wht_amt,status,customer_id"),
    supabase.from("receipts").select("receipt_no,issue_date,net,total,status,customer_id"),
    supabase.from("sub_payouts").select("id,team,net,status,paid_at,created_at"),
    supabase.from("purchase_orders").select("po_no,supplier,status,created_at,received_at,vat,paid_at,expense_id"),
    supabase.from("po_items").select("po_no,qty,price"),
    supabase.from("customers").select("id,name"),
    supabase.from("teams").select("id,name"),
    supabase.from("cash_entries").select("id,source_type,source_ref,edited").neq("source_type", "manual"),
    supabase.from("profiles").select("id,base_pay").eq("pay_type", "monthly").gt("base_pay", 0),
    // confirmed subcontractor labor not yet fully covered by a payout = "ค่าแรงรอจ่าย"
    supabase.from("job_orders").select("job_no,assigned_team,labor_total,labor_paid_amt,labor_confirmed_at,scheduled_at,created_at").eq("labor_confirmed", true).gt("labor_total", 0),
    // ใบเบิกจ่าย (เจ้าของกระแสเงินสดฝั่งจ่าย: จ่ายจริง + ประมาณการยอดค้าง) — mig 112
    supabase.from("expense_requests").select("id,title,amount,paid_amount,status,job_no,expected_pay_date,last_paid_at,paid_at,created_at").in("status", ["pending", "approved", "paid"]),
  ]);
  const cn = Object.fromEntries((cust.data || []).map((c) => [c.id, c.name]));
  const tn = Object.fromEntries((team.data || []).map((t) => [t.id, (t.name || "").replace("Team ", "")]));
  const poTotal = {}; (poItems.data || []).forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + Number(it.qty) * Number(it.price); });

  const desired = [];
  // only UNPAID invoices are "expected income" — once paid, the money shows as its receipt (no double count)
  (inv.data || []).forEach((x) => { if (x.status !== "unpaid") return; desired.push({ source_type: "invoice", source_ref: x.invoice_no, direction: "in", status: "projected", entry_date: x.due_date || x.issue_date, amount: Math.max(0, (Number(x.total) || 0) - (Number(x.wht_amt) || 0)), note: `ใบแจ้งหนี้ ${x.invoice_no}${cn[x.customer_id] ? " · " + cn[x.customer_id] : ""}` }); });
  (rec.data || []).forEach((x) => { if (x.status !== "paid") return; desired.push({ source_type: "receipt", source_ref: x.receipt_no, direction: "in", status: "actual", entry_date: x.issue_date, amount: Number(x.net || x.total) || 0, note: `ใบเสร็จ ${x.receipt_no}${cn[x.customer_id] ? " · " + cn[x.customer_id] : ""}` }); });
  (pay.data || []).forEach((x) => { const paid = x.status === "paid"; desired.push({ source_type: "payout", source_ref: String(x.id), direction: "out", status: paid ? "actual" : "projected", entry_date: paid ? _d(x.paid_at) : _d(x.created_at), amount: Number(x.net) || 0, note: `จ่ายช่างซัพ${tn[x.team] ? " " + tn[x.team] : ""}` }); });
  // PO: จ่ายจริงเมื่อ "จ่ายเงินแล้ว" (paid_at ผ่านเมนูเบิกจ่าย) — ไม่ผูกกับการรับของ (รับก่อน/จ่ายก่อน เครดิตได้)
  // pre-100 fallback: ถ้ายังไม่มีคอลัมน์ paid_at (ดึงไม่ได้ทั้งก้อน) → ดึงชุดเก่าแล้วใช้เกณฑ์รับของแบบเดิมไปก่อน
  let poRows = po.data;
  if (po.error && /paid_at/i.test(po.error.message || "")) {
    const legacy = await supabase.from("purchase_orders").select("po_no,supplier,status,created_at,received_at,vat");
    poRows = (legacy.data || []).map((x) => ({ ...x, paid_at: x.status === "received" ? x.received_at : null }));
  }
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
  if (toInsert.length) { const { error } = await supabase.from("cash_entries").insert(toInsert); if (error) throw error; }
  // remove stale doc-sourced lines — e.g. an invoice's "คาดว่าจะรับ" line once it's paid (money then shows as its
  // receipt's "ได้รับจริง") or cancelled. Only touch the source types this sync manages; keep user-edited + manual/opening/expense.
  const MANAGED = new Set(["invoice", "receipt", "payout", "po", "salary", "labor_owed", "expense_paid", "expense_due"]);
  const staleIds = (existing.data || []).filter((e) => MANAGED.has(e.source_type) && !e.edited && !desiredKeys.has(`${e.source_type}:${e.source_ref}`)).map((e) => e.id);
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
    return { ...r, title, avatar_url, memberNames: others, memberIds: mem.map((m) => m.user_id), memberCount: mem.length,
      lastText: lm ? (lm.text || (lm.image_url ? "[รูปภาพ]" : lm.file_url ? `[ไฟล์] ${lm.file_name || ""}` : "")) : "", lastAt: lm ? lm.created_at : r.created_at, unread: unread[r.id] || 0 };
  }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

// total unread team-chat messages across my rooms — for the sidebar badge + app-icon badge
export async function countUnreadTeamChats() {
  const rooms = await listChatRooms();
  return rooms.reduce((a, r) => a + (r.unread || 0), 0);
}

export async function listChatMessages(roomId) {
  const { data, error } = await supabase.from("chat_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// fire-and-forget Web Push to the room's other members (no-op if VAPID isn't configured)
async function _firePush(roomId, body) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const name = (await getProfile())?.name || "ทีมงาน";
    fetch("/api/push-send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ roomId, title: "แชตทีม · " + name, body, url: "/" }),
    }).catch(() => {});
  } catch (_) {}
}

// in-app notification for a team-chat room's members (push is handled separately by _firePush)
async function _notifyChatRoom(roomId, body) {
  try {
    const { data: mem } = await supabase.from("chat_members").select("user_id").eq("room_id", roomId);
    const me = await getProfile();
    notify((mem || []).map((m) => m.user_id), { category: "team_chat", title: `แชตทีม · ${me?.name || "ทีมงาน"}`, body, url: "teamchat", ref_type: "room", ref_no: String(roomId), push: false });
  } catch (_) {}
}
export async function sendChatMessage(roomId, text, mentionIds = []) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_messages").insert({ room_id: roomId, sender: uid, text: text.trim() });
  if (error) throw error;
  _firePush(roomId, text.trim()); _notifyChatRoom(roomId, text.trim());
  if (mentionIds.length) {
    const me = await getProfile();
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
  _firePush(roomId, "[รูปภาพ]"); _notifyChatRoom(roomId, "[รูปภาพ]");
}
export async function sendChatFile(roomId, fileUrl, fileName) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_messages").insert({ room_id: roomId, sender: uid, file_url: fileUrl, file_name: fileName || "ไฟล์", text: null });
  if (error) throw error;
  _firePush(roomId, `[ไฟล์] ${fileName || "ไฟล์"}`); _notifyChatRoom(roomId, `[ไฟล์] ${fileName || "ไฟล์"}`);
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
    supabase.from("quotations").select("quote_no,boq_no"),
    supabase.from("invoices").select("invoice_no,quote_no").neq("status", "cancelled"),
    supabase.from("receipts").select("receipt_no,invoice_no,quote_no,job_no,boq_no"),
    supabase.from("job_orders").select("job_no,quote_no"),
    supabase.from("purchase_orders").select("po_no,quote_no,status").then((r) => (r.error ? { data: [] } : r)), // pre-100 → ยังไม่มี quote_no
  ]);
  const byQuote = {};
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
  return { byQuote, boqToQuote, jobToQuote, invToQuote, rcToQuote, poToQuote };
}
