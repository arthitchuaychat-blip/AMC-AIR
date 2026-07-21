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
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${caller.id}&select=role`, { headers: sbH() });
  const role = (pr.ok ? await pr.json() : [])[0]?.role;
  if (!ADMIN.includes(role)) return res.status(403).json({ error: "forbidden" });

  const { action, userId, email, password } = await readJson(req);
  if (!userId) return res.status(400).json({ error: "missing userId" });

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
