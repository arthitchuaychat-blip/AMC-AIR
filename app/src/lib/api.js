import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

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
    kind: m.kind || "material",
    brand: m.brand || null,
    btu: m.btu || null,
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
  const [cats, mats] = await Promise.all([
    listCategories(),
    supabase.from("material_stock").select("*").eq("active", true),
  ]);
  if (mats.error) throw mats.error;
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  return (mats.data || []).map((m) => enrich(m, catMap)).sort((a, b) => a.code.localeCompare(b.code));
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
export async function listCustomers() {
  const [c, cc, cs] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("customer_contacts").select("*"),
    supabase.from("customer_sites").select("*"),
  ]);
  if (c.error) throw c.error; if (cc.error) throw cc.error; if (cs.error) throw cs.error;
  const byC = {}, byS = {};
  (cc.data || []).forEach((x) => { (byC[x.customer_id] = byC[x.customer_id] || []).push(x); });
  (cs.data || []).forEach((x) => { (byS[x.customer_id] = byS[x.customer_id] || []).push(x); });
  return (c.data || []).map((cu) => ({ ...cu, contacts: byC[cu.id] || [], sites: byS[cu.id] || [] }));
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
  const sRows = sites.filter((x) => (x.site_name || x.address)).map((x) => ({ customer_id: id, site_name: x.site_name?.trim() || null, address: x.address?.trim() || null, map_url: x.map_url?.trim() || null }));
  if (sRows.length) { const e = (await supabase.from("customer_sites").insert(sRows)).error; if (e) throw e; }
  return id;
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

// bulk import customers (each row = {cust, contacts[], sites[]}). Inserts new records.
export async function bulkImportCustomers(rows) {
  let n = 0;
  for (const r of rows) { await saveCustomer(r.cust, r.contacts || [], r.sites || []); n++; }
  return n;
}

// ---------- BOQ (ใบประมาณการต้นทุน) ----------
export async function listBoqs() {
  const [b, it, cu, si, ct] = await Promise.all([
    supabase.from("boqs").select("*").order("created_at", { ascending: false }),
    supabase.from("boq_items").select("*"),
    supabase.from("customers").select("id,name,address,tax_id"),
    supabase.from("customer_sites").select("id,site_name,address"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
  ]);
  if (b.error) throw b.error; if (it.error) throw it.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error;
  const byBoq = {}; (it.data || []).forEach((x) => { (byBoq[x.boq_no] = byBoq[x.boq_no] || []).push(x); });
  const custName = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const custAddr = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const custTax = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  return (b.data || []).map((bo) => {
    const items = byBoq[bo.boq_no] || [];
    const ct0 = cc[bo.customer_id];
    const s = bo.site_id ? sm[bo.site_id] : null;
    return { ...bo, customerName: custName[bo.customer_id] || null, customerCode: bo.customer_id || null,
      customerAddr: custAddr[bo.customer_id] || null, customerTaxId: custTax[bo.customer_id] || null,
      siteName: s?.site_name || null, siteAddress: s?.address || null,
      contactName: ct0?.name || null, contactPhone: ct0?.phone || null,
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

export async function saveBoq(boq, items) {
  const { data: { user } } = await supabase.auth.getUser();
  const e1 = (await supabase.from("boqs").upsert({
    boq_no: boq.boq_no, customer_id: boq.customer_id || null, site_id: boq.site_id || null,
    title: boq.title?.trim() || null, note: boq.note?.trim() || null, status: boq.status || "open", created_by: user?.id || null,
  }, { onConflict: "boq_no" })).error;
  if (e1) throw e1;
  const e2 = (await supabase.from("boq_items").delete().eq("boq_no", boq.boq_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const e3 = (await supabase.from("boq_items").insert(items.map((x) => ({
      boq_no: boq.boq_no, section: x.section, item_code: x.code || null, name: x.name || null,
      unit: x.unit || null, qty: Number(x.qty) || 0, unit_cost: Number(x.unit_cost) || 0,
    })))).error;
    if (e3) throw e3;
  }
}

export async function deleteBoq(boq_no) {
  const { error } = await supabase.from("boqs").delete().eq("boq_no", boq_no);
  if (error) throw error;
}

// ---------- QUOTATIONS (ใบเสนอราคา) ----------
export async function listQuotations() {
  const [q, it, cu, si, ct] = await Promise.all([
    supabase.from("quotations").select("*").order("created_at", { ascending: false }),
    supabase.from("quotation_items").select("*"),
    supabase.from("customers").select("id,name,address,tax_id"),
    supabase.from("customer_sites").select("id,site_name,address,map_url"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
  ]);
  if (q.error) throw q.error; if (it.error) throw it.error; if (cu.error) throw cu.error; if (si.error) throw si.error; if (ct.error) throw ct.error;
  const byQ = {}; (it.data || []).forEach((x) => { (byQ[x.quote_no] = byQ[x.quote_no] || []).push(x); });
  const custName = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const custAddr = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const custTax = Object.fromEntries((cu.data || []).map((c) => [c.id, c.tax_id]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const firstContact = {}; (ct.data || []).forEach((c) => { if (!firstContact[c.customer_id]) firstContact[c.customer_id] = c; });
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
      customerTaxId: custTax[qo.customer_id] || null, customerCode: qo.customer_id || null, siteName: s?.site_name || null,
      siteAddress, address, map_url, contactName: ct0?.name || null, contactPhone: ct0?.phone || null,
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
    vat: !!q.vat, wht: !!q.wht, wht_rate: Number(q.wht_rate) || 3, note: q.note?.trim() || null,
    approved_at: q.status === "approved" ? (q.approved_at || new Date().toISOString()) : null,
    created_by: user?.id || null,
  }, { onConflict: "quote_no" })).error;
  if (e1) throw e1;
  const e2 = (await supabase.from("quotation_items").delete().eq("quote_no", q.quote_no)).error;
  if (e2) throw e2;
  if (items.length) {
    const e3 = (await supabase.from("quotation_items").insert(items.map((x) => ({
      quote_no: q.quote_no, item_code: x.code || null, name: x.name || null, kind: x.kind || null,
      unit: x.unit || null, qty: Number(x.qty) || 0, unit_price: Number(x.unit_price) || 0,
    })))).error;
    if (e3) throw e3;
  }
}

export async function deleteQuotation(quote_no) {
  const { error } = await supabase.from("quotations").delete().eq("quote_no", quote_no);
  if (error) throw error;
}

export async function setQuotationStatus(quote_no, status) {
  const patch = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  const { error } = await supabase.from("quotations").update(patch).eq("quote_no", quote_no);
  if (error) throw error;
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
    contact_name: jo.contact_name || (cc && cc.name) || null,
    contact_phone: jo.contact_phone || (cc && cc.phone) || null,
    customerAddr: custAddr ? (custAddr[jo.customer_id] || null) : null,
    customerName: custName ? (custName[jo.customer_id] || null) : null,
    teamName: teamName ? (teamName[jo.assigned_team] || jo.assigned_team) : jo.assigned_team };
}
// first contact per customer (live fallback for the snapshot contact on the job order)
function _firstContacts(rows) { const m = {}; (rows || []).forEach((c) => { if (!m[c.customer_id]) m[c.customer_id] = c; }); return m; }

export async function listJobOrders() {
  const [j, cu, tm, si, ct] = await Promise.all([
    supabase.from("job_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,name,address"),
    supabase.from("teams").select("id,name"),
    supabase.from("customer_sites").select("id,address,map_url"),
    supabase.from("customer_contacts").select("customer_id,name,phone"),
  ]);
  if (j.error) throw j.error; if (cu.error) throw cu.error; if (tm.error) throw tm.error; if (si.error) throw si.error; if (ct.error) throw ct.error;
  const cn = Object.fromEntries((cu.data || []).map((c) => [c.id, c.name]));
  const ca = Object.fromEntries((cu.data || []).map((c) => [c.id, c.address]));
  const tn = Object.fromEntries((tm.data || []).map((t) => [t.id, t.name]));
  const sm = Object.fromEntries((si.data || []).map((s) => [s.id, s]));
  const cc = _firstContacts(ct.data);
  return (j.data || []).map((jo) => _resolveJo(jo, cn, ca, sm, tn, cc));
}

// job orders assigned to a team (technician view) — address/map/contact resolved live
export async function listTeamJobOrders(team) {
  const [j, si, cu, ct] = await Promise.all([
    supabase.from("job_orders").select("*").eq("assigned_team", team).order("scheduled_at", { ascending: true }),
    supabase.from("customer_sites").select("id,address,map_url"),
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
  const { data, error } = await supabase.from("job_logs").select("*").eq("job_no", job_no).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
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

export async function saveJobOrder(jo) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("job_orders").upsert({
    job_no: jo.job_no, quote_no: jo.quote_no || null, customer_id: jo.customer_id || null, site_id: jo.site_id || null,
    title: jo.title?.trim() || null, contact_name: jo.contact_name?.trim() || null, contact_phone: jo.contact_phone?.trim() || null,
    address: jo.address?.trim() || null, map_url: jo.map_url?.trim() || null, details: jo.details?.trim() || null,
    sales_note: jo.sales_note?.trim() || null, sales_photos: jo.sales_photos || [],
    assigned_team: jo.assigned_team || null, scheduled_at: jo.scheduled_at || null,
    status: jo.status || "pending", created_by: user?.id || null,
  }, { onConflict: "job_no" });
  if (error) throw error;
}

export async function updateJobStatus(job_no, status, author) {
  const { error } = await supabase.from("job_orders").update({ status }).eq("job_no", job_no);
  if (error) throw error;
  // record the status change on the timeline (best-effort — don't fail the status update if logging fails)
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("job_logs").insert({ job_no, type: "status", status, author: author || null, created_by: user?.id || null });
}

export async function deleteJobOrder(job_no) {
  const { error } = await supabase.from("job_orders").delete().eq("job_no", job_no);
  if (error) throw error;
}

// cancel/void a confirmed transaction (admin only — RLS). Stock recomputes automatically.
export async function deleteTransaction(id) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
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
  const { error } = await supabase.from("teams").upsert(
    { id: t.id.trim().toUpperCase(), name: t.name.trim(), lead: t.lead?.trim() || null },
    { onConflict: "id" }
  );
  if (error) throw error;
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
