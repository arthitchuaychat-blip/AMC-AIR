// Admin user actions that need the service-role key (change email / set password / delete user).
// Guarded: only callers whose profile role is admin/exec may use it.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const ADMIN = ["admin", "exec"];

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });

  // identify caller + verify admin
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const caller = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${caller.id}&select=role,active`, { headers: sbH() });
  const profile = (pr.ok ? await pr.json() : [])[0];
  const role = profile?.role;
  if (!ADMIN.includes(role) || profile?.active === false) return res.status(403).json({ error: "forbidden" });

  const { action, userId, email, password, name, role: newRole, team } = await readJson(req);
  if (action === "create") {
    if (role !== "exec") return res.status(403).json({ error: "เฉพาะผู้บริหารสร้างบัญชีพร้อมกำหนดสิทธิ์ได้" });
    if (!email?.trim() || !password || password.length < 6 || !["exec", "admin", "finance", "hr", "sales", "field_sales", "graphic", "stock", "maid", "lead_tech", "tech", "assistant"].includes(newRole)) return res.status(400).json({ error: "ตรวจอีเมล รหัสผ่าน และตำแหน่งอีกครั้ง" });
    const created = await fetch(`${SB()}/auth/v1/admin/users`, { method: "POST", headers: sbH(), body: JSON.stringify({ email: email.trim(), password, email_confirm: true, user_metadata: { name: name?.trim() || email.trim() } }) });
    if (!created.ok) return res.status(502).json({ error: "สร้างบัญชีไม่สำเร็จ" });
    const account = await created.json();
    const assigned = await fetch(`${SB()}/rest/v1/profiles?id=eq.${account.id}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ role: newRole, team: team || null, active: true }) });
    // A failed assignment leaves the account inactive, never implicitly privileged.
    if (!assigned.ok) return res.status(502).json({ error: "สร้างบัญชีแล้วแต่ยังไม่เปิดใช้งาน — กำหนดตำแหน่งในตั้งค่าผู้ใช้" });
    return res.status(200).json({ id: account.id, ok: true });
  }
  if (!userId) return res.status(400).json({ error: "missing userId" });
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return res.status(400).json({ error: "invalid userId" });
  const target = await fetch(`${SB()}/rest/v1/profiles?id=eq.${userId}&select=role`, { headers: sbH() });
  if (!target.ok) return res.status(502).json({ error: "ตรวจสิทธิ์บัญชีปลายทางไม่สำเร็จ" });
  const targetProfile = (await target.json())[0];
  if (!targetProfile) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
  if (role !== "exec" && targetProfile.role === "exec") return res.status(403).json({ error: "ผู้จัดการเปลี่ยนบัญชีเข้าสู่ระบบหรือลบบัญชีผู้บริหารไม่ได้" });

  try {
    if (action === "setEmail") {
      if (!email?.trim()) return res.status(400).json({ error: "missing email" });
      const r = await fetch(`${SB()}/auth/v1/admin/users/${userId}`, { method: "PUT", headers: sbH(), body: JSON.stringify({ email: email.trim(), email_confirm: true }) });
      if (!r.ok) return res.status(502).json({ error: (await r.text()).slice(0, 300) });
      // keep the profiles email column in sync
      await fetch(`${SB()}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ email: email.trim() }) });
    } else if (action === "setPassword") {
      if (!password || password.length < 6) return res.status(400).json({ error: "รหัสผ่านอย่างน้อย 6 ตัวอักษร" });
      const r = await fetch(`${SB()}/auth/v1/admin/users/${userId}`, { method: "PUT", headers: sbH(), body: JSON.stringify({ password }) });
      if (!r.ok) return res.status(502).json({ error: (await r.text()).slice(0, 300) });
    } else if (action === "delete") {
      if (userId === caller.id) return res.status(400).json({ error: "ลบบัญชีตัวเองไม่ได้" });
      // ⚠️ ลบ auth ก่อน — profiles.id มี on delete cascade จึงหายตามเอง (schema.sql:45)
      //    เดิมลบ profiles ก่อน: ถ้าพนักงานเคยออกเอกสาร/ลงรายการ/ตอบแชต จะมี FK ค้างที่ตาราง 30+ ตัว
      //    → ลบ auth ไม่สำเร็จ แต่ profiles หายไปแล้วถาวร (ชื่อ/role/ทีมหาย) บัญชียังล็อกอินได้แต่กลายเป็น "ช่าง"
      //    ลบ auth ก่อนแล้วล้มเหลว = ทั้งคู่ยังอยู่ครบ กู้ได้ด้วยการไม่ทำอะไร
      const r = await fetch(`${SB()}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: sbH() });
      if (!r.ok) {
        const msg = (await r.text()).slice(0, 300);
        // FK ค้าง = พนักงานมีประวัติในระบบ ลบทิ้งไม่ได้ (ข้อมูลจะกำพร้า) — บอกให้ปิดใช้งานแทน
        return res.status(/foreign key|violates/i.test(msg)
          ? 409 : 502).json({ error: /foreign key|violates/i.test(msg)
          ? "ลบบัญชีนี้ไม่ได้ — พนักงานมีเอกสาร/รายการในระบบอยู่ (ลบแล้วประวัติจะเสียหาย) ให้เปลี่ยนตำแหน่ง/ปิดใช้งานแทนการลบ"
          : msg });
      }
    } else {
      return res.status(400).json({ error: "unknown action" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
