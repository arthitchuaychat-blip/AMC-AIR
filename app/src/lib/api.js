import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { deriveJobStatus } from "./schedule";

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
    minStock: Number(m.min_stock),
    stock: Number(m.current_stock ?? m.init_stock ?? 0),
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
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("materials")
      .select("code,name_th,name_en,kind,brand,btu,ac_type,category,unit,cost,sale_price,description,tracked,min_stock,init_stock")
      .eq("active", true).range(from, from + PAGE - 1);
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
    category: kind === "material" ? (row.category || null) : null,
    brand: kind === "ac" ? (row.brand || null) : null,
    btu: kind === "ac" && row.btu ? Number(row.btu) : null,
    ac_type: kind === "ac" ? (row.ac_type || null) : null,
    tracked: kind === "service" ? false : (row.tracked !== false),
    unit: row.unit,
    cost: Number(row.cost) || 0,
    sale_price: Number(row.sale_price) || 0,
    description: row.description?.trim() || null,
    photo_url: row.photo_url || null,
    min_stock: Number(row.min_stock) || 0,
  };
  if (isNew) payload.init_stock = Number(row.init_stock) || 0;
  const { error } = await supabase.from("materials").upsert(payload, { onConflict: "code" });
  if (error) throw error;
}

// update a material's (weighted-average) unit cost — used by purchase moving average
export async function updateMaterialCost(code, cost) {
  const { error } = await supabase.from("materials").update({ cost }).eq("code", code);
  if (error) throw error;
}

// upload a product photo to Supabase Storage (bucket "photos") -> returns public URL
export async function uploadMaterialPhoto(file, code) {
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

// bulk import (upsert by code) — admin only via RLS
export async function bulkUpsertMaterials(rows) {
  const { error } = await supabase.from("materials").upsert(rows, { onConflict: "code" });
  if (error) throw error;
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
export async function recordTransactions(rows) {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = rows.map((t) => ({
    txn_date: t.txn_date || new Date().toISOString().slice(0, 10),
    type: t.type,
    job_no: t.job_no?.trim() || null,
    team: t.type === "purchase" ? null : (t.team || null),
    material_code: t.material_code,
    qty: Number(t.qty),
    unit_cost: Number(t.unit_cost) || 0,
    reason: t.type === "damage" ? (t.reason || null) : null,
    recorded_by: user?.id || null,
  }));
  const { error } = await supabase.from("transactions").insert(payload);
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
  const [poRes, itemRes] = await Promise.all([
    supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("po_items").select("*"),
  ]);
  if (poRes.error) throw poRes.error;
  if (itemRes.error) throw itemRes.error;
  const byPo = {};
  (itemRes.data || []).forEach((it) => { (byPo[it.po_no] = byPo[it.po_no] || []).push(it); });
  return (poRes.data || []).map((po) => {
    const items = (byPo[po.po_no] || []).map((it) => ({ material_code: it.material_code, qty: Number(it.qty), price: Number(it.price) }));
    return { ...po, items, total: items.reduce((a, it) => a + it.qty * it.price, 0) };
  });
}

export async function savePurchaseOrder(po, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const e1 = (await supabase.from("purchase_orders").upsert(
    { po_no: po.po_no, supplier: po.supplier || null, note: po.note || null, status: po.status || "open", created_by: user?.id || null },
    { onConflict: "po_no" }
  )).error;
  if (e1) throw e1;
  const e2 = (await supabase.from("po_items").delete().eq("po_no", po.po_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const e3 = (await supabase.from("po_items").insert(items.map((it) => ({ po_no: po.po_no, material_code: it.code, qty: Number(it.qty), price: Number(it.price) || 0 })))).error;
    if (e3) throw e3;
  }
}

export async function deletePurchaseOrder(po_no) {
  const { error } = await supabase.from("purchase_orders").delete().eq("po_no", po_no);
  if (error) throw error;
}

export async function markPoReceived(po_no) {
  const { error } = await supabase.from("purchase_orders").update({ status: "received", received_at: new Date().toISOString() }).eq("po_no", po_no);
  if (error) throw error;
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
  const fields = { type: cust.type, name: cust.name.trim(), address: cust.address?.trim() || null, tax_id: cust.tax_id?.trim() || null, vat: !!cust.vat, note: cust.note?.trim() || null };
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
  const quoteByBoq = {}; (qt.data || []).forEach((q) => { if (q.boq_no && q.status !== "cancelled" && !quoteByBoq[q.boq_no]) quoteByBoq[q.boq_no] = q.quote_no; });
  const cb = await _creators();
  return (b.data || []).map((bo) => {
    const items = byBoq[bo.boq_no] || [];
    const ct0 = cc[bo.customer_id];
    const s = bo.site_id ? sm[bo.site_id] : null;
    return { ...bo, customerName: custName[bo.customer_id] || null, customerCode: bo.customer_id || null,
      customerAddr: custAddr[bo.customer_id] || null, customerTaxId: custTax[bo.customer_id] || null,
      siteName: s?.site_name || null, siteAddress: s?.address || null, createdByName: cb[bo.created_by] || null,
      mapUrl: (s && s.map_url) || _gmap(s?.address || custAddr[bo.customer_id]),
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      quoteNo: quoteByBoq[bo.boq_no] || null, hasQuote: !!quoteByBoq[bo.boq_no],
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

export async function saveBoq(boq, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const e1 = (await supabase.from("boqs").upsert({
    boq_no: boq.boq_no, customer_id: boq.customer_id || null, site_id: boq.site_id || null,
    title: boq.title?.trim() || null, note: boq.note?.trim() || null, ..._termCols(boq), status: boq.status || "open", created_by: user?.id || null,
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

export async function deleteBoq(boq_no) {
  // chain safety: block if a quotation was created from this BOQ (checked live, not from the UI flag)
  const { count, error: ce } = await supabase.from("quotations").select("quote_no", { count: "exact", head: true }).eq("boq_no", boq_no);
  if (ce) throw ce;
  if ((count || 0) > 0) throw new Error("ลบ BOQ นี้ไม่ได้ — มีใบเสนอราคาอ้างอิงอยู่ · ต้องลบใบเสนอราคา (และเอกสารถัดไป) ก่อน");
  const { error } = await supabase.from("boqs").delete().eq("boq_no", boq_no);
  if (error) throw error;
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
    const subtotal = items.reduce((a, x) => a + Number(x.qty) * Number(x.unit_price), 0);
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
      siteAddress, address, map_url, createdByName: cb[qo.created_by] || null, contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      jobNo: jobByQuote[qo.quote_no]?.job_no || null, hasJob: !!jobByQuote[qo.quote_no], jobScheduledAt: jobByQuote[qo.quote_no]?.scheduled_at || null,
      hasInvoice: (billedByQ[qo.quote_no] || 0) > 0, billedPct: grand > 0 ? (billedByQ[qo.quote_no] || 0) / grand * 100 : 0,
      items, subtotal, discount, afterDisc, vatAmt, grand, whtAmt, netPay: grand - whtAmt };
  });
}

export async function saveQuotation(q, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const e1 = (await supabase.from("quotations").upsert({
    quote_no: q.quote_no, customer_id: q.customer_id || null, site_id: q.site_id || null, boq_no: q.boq_no || null,
    title: q.title?.trim() || null, status: q.status || "draft",
    issue_date: q.issue_date || null, valid_until: q.valid_until || null,
    discount_type: q.discount_type || "amount", discount_value: Number(q.discount_value) || 0,
    vat: !!q.vat, wht: !!q.wht, wht_rate: Number(q.wht_rate) || 3, note: q.note?.trim() || null, ..._termCols(q),
    approved_at: q.status === "approved" ? (q.approved_at || new Date().toISOString()) : null,
    created_by: user?.id || null,
  }, { onConflict: "quote_no" })).error;
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
}

export async function deleteQuotation(quote_no) {
  // chain safety: block if an invoice or job order was created from this quotation
  const [iv, jo] = await Promise.all([
    supabase.from("invoices").select("invoice_no", { count: "exact", head: true }).eq("quote_no", quote_no),
    supabase.from("job_orders").select("job_no", { count: "exact", head: true }).eq("quote_no", quote_no),
  ]);
  if (iv.error) throw iv.error; if (jo.error) throw jo.error;
  if ((iv.count || 0) > 0 || (jo.count || 0) > 0) throw new Error("ลบใบเสนอราคานี้ไม่ได้ — มีใบแจ้งหนี้/ใบงานอ้างอิงอยู่ · ต้องลบเอกสารถัดไปก่อน");
  const { error } = await supabase.from("quotations").delete().eq("quote_no", quote_no);
  if (error) throw error;
}

export async function setQuotationStatus(quote_no, status) {
  const patch = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  const { error } = await supabase.from("quotations").update(patch).eq("quote_no", quote_no);
  if (error) throw error;
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
      customerAddr: ca[x.customer_id] || null, siteAddress: s?.address || null,
      mapUrl: (s && s.map_url) || _gmap(s?.address || ca[x.customer_id]),
      createdByName: cb[x.created_by] || null,
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
    note: inv.note?.trim() || null, ..._termCols(inv), status: inv.status || "unpaid", created_by: user?.id || null,
  }, { onConflict: "invoice_no" });
  if (error) throw error;
}
// update per-line WHT selection (items) + rate + recomputed amount on an invoice
export async function setInvoiceWht(invoice_no, items, wht_rate, wht_amt) {
  const { error } = await supabase.from("invoices").update({ items: items || [], wht_rate: Number(wht_rate) || 3, wht_amt: Number(wht_amt) || 0 }).eq("invoice_no", invoice_no);
  if (error) throw error;
}
export async function setInvoiceStatus(invoice_no, status) {
  // chain safety: cannot cancel an invoice that already has a receipt
  if (status === "cancelled") {
    const { count, error: ce } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", invoice_no);
    if (ce) throw ce;
    if ((count || 0) > 0) throw new Error("ยกเลิกใบแจ้งหนี้นี้ไม่ได้ — ออกใบเสร็จจากใบนี้แล้ว · ต้องลบใบเสร็จก่อน");
  }
  const { error } = await supabase.from("invoices").update({ status }).eq("invoice_no", invoice_no);
  if (error) throw error;
}
export async function deleteInvoice(invoice_no) {
  // chain safety: block if a receipt was issued from this invoice
  const { count, error: ce } = await supabase.from("receipts").select("receipt_no", { count: "exact", head: true }).eq("invoice_no", invoice_no);
  if (ce) throw ce;
  if ((count || 0) > 0) throw new Error("ลบใบแจ้งหนี้นี้ไม่ได้ — ออกใบเสร็จจากใบนี้แล้ว · ต้องลบใบเสร็จก่อน");
  const { error } = await supabase.from("invoices").delete().eq("invoice_no", invoice_no);
  if (error) throw error;
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
      customerAddr: ca[x.customer_id] || null, siteAddress: s?.address || null, createdByName: cb[x.created_by] || null,
      mapUrl: (s && s.map_url) || _gmap(s?.address || ca[x.customer_id]),
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
    status, note: r.note?.trim() || null, ..._termCols(r), created_by: user?.id || null,
  }, { onConflict: "receipt_no" });
  if (error) throw error;
  if (r.invoice_no) await supabase.from("invoices").update({ status: status === "paid" ? "paid" : "unpaid" }).eq("invoice_no", r.invoice_no);
}
// update per-line WHT selection + rate + recomputed amounts on a receipt
export async function setReceiptWht(receipt_no, items, wht, wht_rate, wht_amt, net) {
  const { error } = await supabase.from("receipts").update({ items: items || [], wht: !!wht, wht_rate: Number(wht_rate) || 3, wht_amt: Number(wht_amt) || 0, net: Number(net) || 0 }).eq("receipt_no", receipt_no);
  if (error) throw error;
}
// toggle a receipt's paid status (and sync the linked invoice)
// ---------- BILLING NOTES (ใบวางบิล) ----------
export async function listBillingNotes() {
  const [bn, iv, cu, si, ct, rc] = await Promise.all([
    supabase.from("billing_notes").select("*").order("created_at", { ascending: false }),
    supabase.from("invoices").select("invoice_no,total,installment,pct,status,issue_date,quote_no"),
    supabase.from("customers").select("id,name,address,tax_id"),
    supabase.from("customer_sites").select("id,site_name,address,map_url,contact_name,phone"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
    supabase.from("receipts").select("invoice_no,status"),
  ]);
  if (bn.error) throw bn.error;
  const receiptedInv = new Set((rc.data || []).filter((r) => r.status !== "cancelled").map((r) => r.invoice_no));
  const invByNo = Object.fromEntries((iv.data || []).map((x) => [x.invoice_no, { ...x, hasReceipt: receiptedInv.has(x.invoice_no) }]));
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const cx = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  return (bn.data || []).map((b) => {
    const invoices = (b.invoice_nos || []).map((no) => invByNo[no]).filter(Boolean);
    const total = invoices.reduce((a, x) => a + (Number(x.total) || 0), 0);
    const s = b.site_id ? sm[b.site_id] : null; const ct0 = cc[b.customer_id];
    return { ...b, customerName: cn[b.customer_id] || null, customerCode: b.customer_id || null, customerTaxId: cx[b.customer_id] || null,
      customerAddr: ca[b.customer_id] || null, siteAddress: s?.address || null, mapUrl: (s && s.map_url) || _gmap(s?.address || ca[b.customer_id]),
      contactName: (s && s.contact_name) || ct0?.name || null, contactPhone: (s && s.phone) || ct0?.phone || null,
      invoices, total, missing: (b.invoice_nos || []).length - invoices.length };
  });
}
export async function saveBillingNote(b) {
  const uid = await _uid();
  const { error } = await supabase.from("billing_notes").upsert({
    billing_no: b.billing_no, customer_id: b.customer_id || null, site_id: b.site_id || null,
    issue_date: b.issue_date || null, note: b.note || null, invoice_nos: b.invoice_nos || [],
    status: b.status || "open", created_by: uid,
  }, { onConflict: "billing_no" });
  if (error) throw error;
}
export async function setBillingNoteStatus(billing_no, status) {
  const { error } = await supabase.from("billing_notes").update({ status }).eq("billing_no", billing_no);
  if (error) throw error;
}
export async function deleteBillingNote(billing_no) {
  const { error } = await supabase.from("billing_notes").delete().eq("billing_no", billing_no);
  if (error) throw error;
}

export async function setReceiptStatus(receipt_no, status, invoice_no) {
  const { error } = await supabase.from("receipts").update({ status }).eq("receipt_no", receipt_no);
  if (error) throw error;
  if (invoice_no) await supabase.from("invoices").update({ status: status === "paid" ? "paid" : "unpaid" }).eq("invoice_no", invoice_no);
}
export async function saveReceiptFlowAccount(receipt_no, faId, faNo) {
  const { error } = await supabase.from("receipts").update({ flowaccount_id: faId ? String(faId) : null, flowaccount_no: faNo || null, flowaccount_at: new Date().toISOString() }).eq("receipt_no", receipt_no);
  if (error) throw error;
}
export async function deleteReceipt(receipt_no, invoice_no) {
  const { error } = await supabase.from("receipts").delete().eq("receipt_no", receipt_no);
  if (error) throw error;
  if (invoice_no) await supabase.from("invoices").update({ status: "unpaid" }).eq("invoice_no", invoice_no);
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
    teamName: teamName ? (teamName[jo.assigned_team] || jo.assigned_team) : jo.assigned_team };
}
// first contact per customer (live fallback for the snapshot contact on the job order)
function _firstContacts(rows) { const m = {}; (rows || []).forEach((c) => { if (!m[c.customer_id]) m[c.customer_id] = c; }); return m; }

export async function listJobOrders() {
  const [j, cu, tm, si, ct, qt, qit, jv] = await Promise.all([
    supabase.from("job_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,name,address"),
    supabase.from("teams").select("id,name"),
    supabase.from("customer_sites").select("id,address,map_url,contact_name,phone"),
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
    supabase.from("customer_sites").select("id,address,map_url,contact_name,phone"),
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
export async function addJobLog(job_no, { note, photos, author }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("job_logs").insert({
    job_no, type: "update", note: note?.trim() || null, photos: photos || [],
    author: author || null, created_by: user?.id || null,
  });
  if (error) throw error;
}

export async function saveJobOrder(jo, author) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("job_orders").upsert({
    job_no: jo.job_no, group_no: jo.group_no || null, quote_no: jo.quote_no || null, customer_id: jo.customer_id || null, site_id: jo.site_id || null,
    title: jo.title?.trim() || null, job_type: jo.job_type || "install", contact_name: jo.contact_name?.trim() || null, contact_phone: jo.contact_phone?.trim() || null,
    address: jo.address?.trim() || null, map_url: jo.map_url?.trim() || null, details: jo.details?.trim() || null,
    sales_note: jo.sales_note?.trim() || null, sales_photos: jo.sales_photos || [],
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
}

export async function updateJobStatus(job_no, status, author) {
  const { error } = await supabase.from("job_orders").update({ status }).eq("job_no", job_no);
  if (error) throw error;
  // record the status change on the timeline (best-effort — don't fail the status update if logging fails)
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("job_logs").insert({ job_no, type: "status", status, author: author || null, created_by: user?.id || null });
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
  return jobStatus || toStatus;
}

// update one visit's status, then recompute the job's overall status — via SECURITY DEFINER RPC
export async function updateVisitStatus(visitId, jobNo, status, author) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("set_visit_status", { p_visit_id: visitId, p_status: status });
  if (error) throw error;
  await supabase.from("job_logs").insert({ job_no: jobNo, type: "status", status, author: author || null, created_by: user?.id || null });
  return data;
}

export async function deleteJobOrder(job_no) {
  const { error } = await supabase.from("job_orders").delete().eq("job_no", job_no);
  if (error) throw error;
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
export async function deleteTransaction(id) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
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
  return data.id;
}
export async function paySubPayout(id, method) {
  const { error } = await supabase.from("sub_payouts").update({ status: "paid", paid_at: new Date().toISOString(), method: method || null }).eq("id", id);
  if (error) throw error;
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
  const { error: delErr } = await supabase.from("sub_payouts").delete().eq("id", id);
  if (delErr) throw delErr;
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
  const { error: delErr } = await supabase.from("sub_payouts").delete().eq("id", id);
  if (delErr) throw delErr;
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
  const [c, cu] = await Promise.all([
    supabase.from("line_contacts").select("*").order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("customers").select("id,name"),
  ]);
  if (c.error) throw c.error;
  const cn = Object.fromEntries((cu.data || []).map((x) => [x.id, x.name]));
  return (c.data || []).map((r) => ({ ...r, customerName: r.customer_id ? cn[r.customer_id] : null }));
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
  const { data, error } = await supabase.from("profiles").select("id,name,email,role").order("name");
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, name: p.name || p.email }));
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
export const sendLineMessage = (to, text) => callLineSend(to, { text });
export const sendLineImage = (to, imageUrl) => callLineSend(to, { imageUrl });
export const sendLineFile = (to, fileUrl, fileName) => callLineSend(to, { fileUrl, fileName });
export const sendLineSticker = (to, packageId, stickerId) => callLineSend(to, { packageId, stickerId });

// upload an image to send through the chat → public URL (used by LINE image messages)
export async function uploadChatImage(file) {
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
    supabase.from("profiles").select("id,name,department,work_pattern,sat_group"),
  ]);
  if (att.error) throw att.error;
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return (att.data || []).map((a) => ({ ...a, name: pm[a.user_id]?.name || "-", department: pm[a.user_id]?.department || "", work_pattern: pm[a.user_id]?.work_pattern, sat_group: pm[a.user_id]?.sat_group }));
}

export async function submitLeave({ type, start_date, end_date, days, reason }) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_leaves").insert({ user_id: uid, type, start_date, end_date, days, reason: reason || null });
  if (error) throw error;
}
export async function listMyLeaves() {
  const uid = await _uid();
  const { data, error } = await supabase.from("hr_leaves").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw error; return data || [];
}
export async function listLeaves(status) {
  let q = supabase.from("hr_leaves").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const [lv, profs] = await Promise.all([q, supabase.from("profiles").select("id,name,department")]);
  if (lv.error) throw lv.error;
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return (lv.data || []).map((l) => ({ ...l, name: pm[l.user_id]?.name || "-", department: pm[l.user_id]?.department || "" }));
}
export async function decideLeave(id, status, note) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_leaves").update({ status, decided_by: uid, decided_at: new Date().toISOString(), decide_note: note || null }).eq("id", id);
  if (error) throw error;
}

// ---------- CASH ADVANCES (เบิกเงินล่วงหน้า) ----------
export async function submitAdvance({ amount, reason }) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_advances").insert({ user_id: uid, amount: Number(amount) || 0, reason: reason || null, created_by: uid });
  if (error) throw error;
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
  const [av, profs] = await Promise.all([q, supabase.from("profiles").select("id,name,department")]);
  if (av.error) throw av.error;
  const pm = Object.fromEntries((profs.data || []).map((p) => [p.id, p]));
  return (av.data || []).map((a) => ({ ...a, name: pm[a.user_id]?.name || "-", department: pm[a.user_id]?.department || "" }));
}
export async function decideAdvance(id, status, note) {
  const uid = await _uid();
  const { error } = await supabase.from("hr_advances").update({ status, decided_by: uid, decided_at: new Date().toISOString(), decide_note: note || null }).eq("id", id);
  if (error) throw error;
}
// settle approved advances once their payroll run is paid (so they aren't deducted twice)
export async function markAdvancesPaid(period, ids) {
  if (!ids || !ids.length) return;
  const { error } = await supabase.from("hr_advances").update({ status: "paid", period }).in("id", ids);
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
    supabase.from("profiles").select("id,name,email,role,team,department,work_pattern,sat_group,hire_date").order("name"),
    supabase.from("teams").select("id,type"),
  ]);
  if (pr.error) throw pr.error;
  const subIds = new Set((tm.data || []).filter((t) => t.type === "sub").map((t) => t.id));
  return (pr.data || []).filter((p) => !subIds.has(p.team));
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
export async function deleteCashEntry(id) {
  const { error } = await supabase.from("cash_entries").delete().eq("id", id);
  if (error) throw error;
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
  const [inv, rec, pay, po, poItems, cust, team, existing] = await Promise.all([
    supabase.from("invoices").select("invoice_no,due_date,issue_date,total,wht_amt,status,customer_id"),
    supabase.from("receipts").select("receipt_no,issue_date,net,total,status,customer_id"),
    supabase.from("sub_payouts").select("id,team,net,status,paid_at,created_at"),
    supabase.from("purchase_orders").select("po_no,supplier,status,created_at,received_at"),
    supabase.from("po_items").select("po_no,qty,price"),
    supabase.from("customers").select("id,name"),
    supabase.from("teams").select("id,name"),
    supabase.from("cash_entries").select("id,source_type,source_ref,edited").neq("source_type", "manual"),
  ]);
  const cn = Object.fromEntries((cust.data || []).map((c) => [c.id, c.name]));
  const tn = Object.fromEntries((team.data || []).map((t) => [t.id, (t.name || "").replace("Team ", "")]));
  const poTotal = {}; (poItems.data || []).forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + Number(it.qty) * Number(it.price); });

  const desired = [];
  // only UNPAID invoices are "expected income" — once paid, the money shows as its receipt (no double count)
  (inv.data || []).forEach((x) => { if (x.status !== "unpaid") return; desired.push({ source_type: "invoice", source_ref: x.invoice_no, direction: "in", status: "projected", entry_date: x.due_date || x.issue_date, amount: Math.max(0, (Number(x.total) || 0) - (Number(x.wht_amt) || 0)), note: `ใบแจ้งหนี้ ${x.invoice_no}${cn[x.customer_id] ? " · " + cn[x.customer_id] : ""}` }); });
  (rec.data || []).forEach((x) => { if (x.status !== "paid") return; desired.push({ source_type: "receipt", source_ref: x.receipt_no, direction: "in", status: "actual", entry_date: x.issue_date, amount: Number(x.net || x.total) || 0, note: `ใบเสร็จ ${x.receipt_no}${cn[x.customer_id] ? " · " + cn[x.customer_id] : ""}` }); });
  (pay.data || []).forEach((x) => { const paid = x.status === "paid"; desired.push({ source_type: "payout", source_ref: String(x.id), direction: "out", status: paid ? "actual" : "projected", entry_date: paid ? _d(x.paid_at) : _d(x.created_at), amount: Number(x.net) || 0, note: `จ่ายช่างซัพ${tn[x.team] ? " " + tn[x.team] : ""}` }); });
  (po.data || []).forEach((x) => { if (x.status === "cancelled") return; const got = x.status === "received"; desired.push({ source_type: "po", source_ref: x.po_no, direction: "out", status: got ? "actual" : "projected", entry_date: got ? _d(x.received_at) : _d(x.created_at), amount: poTotal[x.po_no] || 0, note: `ใบสั่งซื้อ ${x.po_no}${x.supplier ? " · " + x.supplier : ""}` }); });

  const exMap = {}; (existing.data || []).forEach((e) => { exMap[`${e.source_type}:${e.source_ref}`] = e; });
  const uid = await _uid();
  const toInsert = []; let updated = 0;
  for (const d of desired) {
    if (!d.entry_date || !(d.amount > 0)) continue;
    const ex = exMap[`${d.source_type}:${d.source_ref}`];
    if (!ex) toInsert.push({ ...d, created_by: uid });
    else if (!ex.edited) { await supabase.from("cash_entries").update({ direction: d.direction, status: d.status, entry_date: d.entry_date, amount: d.amount, note: d.note, updated_at: new Date().toISOString() }).eq("id", ex.id); updated++; }
  }
  if (toInsert.length) { const { error } = await supabase.from("cash_entries").insert(toInsert); if (error) throw error; }
  return { added: toInsert.length, updated };
}

// rooms visible to me (company + ones I'm a member of) with title, last message, unread count
export async function listChatRooms() {
  const uid = await _uid();
  const [rooms, members, staff] = await Promise.all([
    supabase.from("chat_rooms").select("*"),
    supabase.from("chat_members").select("room_id,user_id,last_read_at"),
    supabase.from("profiles").select("id,name,email"),
  ]);
  if (rooms.error) throw rooms.error;
  const nameById = Object.fromEntries((staff.data || []).map((p) => [p.id, p.name || p.email]));
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
    const others = mem.filter((m) => m.user_id !== uid).map((m) => nameById[m.user_id]).filter(Boolean);
    let title = r.name;
    if (r.kind === "dm") title = others[0] || "ส่วนตัว";
    if (!title && r.kind === "company") title = "ทั้งบริษัท";
    if (!title && (r.kind === "group" || r.kind === "project")) title = others.slice(0, 3).join(", ") || "กลุ่ม";
    const lm = last[r.id];
    return { ...r, title, memberNames: others, memberCount: mem.length,
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

export async function sendChatMessage(roomId, text) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_messages").insert({ room_id: roomId, sender: uid, text: text.trim() });
  if (error) throw error;
  _firePush(roomId, text.trim());
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

// mark a room read up to now (creates my membership row for the company room on first open)
export async function markChatRead(roomId) {
  const uid = await _uid();
  const { error } = await supabase.from("chat_members").upsert({ room_id: roomId, user_id: uid, last_read_at: new Date().toISOString() }, { onConflict: "room_id,user_id" });
  if (error) throw error;
}

// ---------- cross-document links (full chain both directions) ----------
// chain is keyed by quote_no: BOQ → quote → invoices/job-orders → receipts
export async function listDocLinks() {
  const [q, inv, rc, jo] = await Promise.all([
    supabase.from("quotations").select("quote_no,boq_no"),
    supabase.from("invoices").select("invoice_no,quote_no").neq("status", "cancelled"),
    supabase.from("receipts").select("receipt_no,invoice_no,quote_no,job_no,boq_no"),
    supabase.from("job_orders").select("job_no,quote_no"),
  ]);
  const byQuote = {};
  const ensure = (qn) => (byQuote[qn] = byQuote[qn] || { boqNo: null, jobNos: [], invoiceNos: [], receiptNos: [] });
  (q.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).boqNo = x.boq_no || null; });
  (jo.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).jobNos.push(x.job_no); });
  (inv.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).invoiceNos.push(x.invoice_no); });
  (rc.data || []).forEach((x) => { if (x.quote_no) ensure(x.quote_no).receiptNos.push(x.receipt_no); });
  // reverse lookups → quote_no (so any doc can find its chain)
  const boqToQuote = {}, jobToQuote = {}, invToQuote = {}, rcToQuote = {};
  (q.data || []).forEach((x) => { if (x.boq_no) boqToQuote[x.boq_no] = x.quote_no; });
  (jo.data || []).forEach((x) => { if (x.quote_no) jobToQuote[x.job_no] = x.quote_no; });
  (inv.data || []).forEach((x) => { if (x.quote_no) invToQuote[x.invoice_no] = x.quote_no; });
  (rc.data || []).forEach((x) => { if (x.quote_no) rcToQuote[x.receipt_no] = x.quote_no; });
  return { byQuote, boqToQuote, jobToQuote, invToQuote, rcToQuote };
}
