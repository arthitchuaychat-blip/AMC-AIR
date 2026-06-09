import { supabase } from "./supabase";

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

export async function listCategories() {
  const { data, error } = await supabase.from("categories").select("*");
  if (error) throw error;
  return data || [];
}

// auto color palette so teams get distinct chart colors without storing one
const TEAM_PALETTE = ["#2563eb", "#f97316", "#16a34a", "#9333ea", "#0891b2", "#db2777", "#ca8a04", "#0d9488"];
export async function listTeams() {
  const { data, error } = await supabase.from("teams").select("*").order("id");
  if (error) throw error;
  return (data || []).map((t, i) => ({ ...t, color: t.color || TEAM_PALETTE[i % TEAM_PALETTE.length] }));
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
  const payload = {
    code: row.code,
    name_th: row.name_th,
    name_en: row.name_en || row.name_th,
    category: row.category,
    unit: row.unit,
    cost: Number(row.cost) || 0,
    min_stock: Number(row.min_stock) || 0,
  };
  if (isNew) payload.init_stock = Number(row.init_stock) || 0;
  const { error } = await supabase.from("materials").upsert(payload, { onConflict: "code" });
  if (error) throw error;
}

// soft-delete (keep history intact)
export async function deactivateMaterial(code) {
  const { error } = await supabase.from("materials").update({ active: false }).eq("code", code);
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
