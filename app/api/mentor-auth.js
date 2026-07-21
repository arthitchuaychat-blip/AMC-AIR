// The Top Mentor — ยืนยันตัวตน (admin / mentor) + จัดการบัญชีผู้ใช้
// เก็บใน tm_users (service role เท่านั้น) — รหัสผ่านเก็บเป็น hash, ไม่ส่งกลับ client
// actions (POST {action,...}): status | bootstrapAdmin | login | listUsers | saveUser | deleteUser
import crypto from "crypto";

const SB = () => process.env.MENTOR_SUPABASE_URL;
const KEY = () => process.env.MENTOR_SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const SALT = "tmv1:";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hashPass = (p) => sha(SALT + p);
const b64u = (s) => Buffer.from(s, "utf8").toString("base64url");
const unb64u = (s) => Buffer.from(s, "base64url").toString("utf8");
const hmac = (s) => crypto.createHmac("sha256", KEY()).update(s).digest("hex");
function makeToken(username, role) { const p = `${username}|${role}`; return b64u(p) + "." + hmac(p); }
function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [pb, sig] = token.split(".");
  let p; try { p = unb64u(pb); } catch { return null; }
  if (hmac(p) !== sig) return null;
  const [username, role] = p.split("|");
  return { username, role };
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
async function getUser(username) {
  const r = await fetch(`${SB()}/rest/v1/tm_users?username=eq.${encodeURIComponent(username)}&select=username,data`, { headers: sbH() });
  return (r.ok ? await r.json() : [])[0] || null;
}
async function allUsers() {
  const r = await fetch(`${SB()}/rest/v1/tm_users?select=username,data&order=username`, { headers: sbH() });
  return r.ok ? await r.json() : [];
}
const pub = (u) => ({ username: u.username, role: u.data.role, name: u.data.name || "", mentorName: u.data.mentorName || "" });

// สมาชิกทั่วไป login ด้วยชื่อจริงอังกฤษ (username) + เบอร์โทร (password) จาก tm_members
const digitsOnly = (s) => String(s || "").replace(/\D/g, "");
const normName = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
async function findMemberByLogin(name, pass) {
  const pd = digitsOnly(pass);
  const target = normName(name);
  if (!target || pd.length < 6) return null;
  const r = await fetch(`${SB()}/rest/v1/tm_members?select=id,data`, { headers: sbH() });
  const rows = r.ok ? await r.json() : [];
  for (const row of rows) {
    const d = row.data || {};
    const ph = digitsOnly(d.phone);
    if (ph && ph === pd && normName(d.name) === target) return { id: row.id, name: d.name || "", nick: d.nick || "" };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (!KEY()) return res.status(200).json({ ok: false, error: "server not configured" });

  const body = await readJson(req);
  const action = body.action;

  if (action === "status") {
    const users = await allUsers();
    return res.status(200).json({ ok: true, hasUsers: users.length > 0, hasAdmin: users.some((u) => u.data.role === "admin") });
  }

  if (action === "bootstrapAdmin") {
    const users = await allUsers();
    if (users.some((u) => u.data.role === "admin")) return res.status(200).json({ ok: false, error: "มีบัญชีแอดมินอยู่แล้ว" });
    const { username, password, name } = body;
    if (!username || !password) return res.status(200).json({ ok: false, error: "กรอกชื่อผู้ใช้และรหัสผ่าน" });
    const row = { username: username.trim(), data: { role: "admin", name: name || "ผู้ดูแลระบบ", mentorName: "", hash: hashPass(password) } };
    const r = await fetch(`${SB()}/rest/v1/tm_users`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
    if (!r.ok) return res.status(502).json({ ok: false, error: "สร้างบัญชีไม่สำเร็จ" });
    return res.status(200).json({ ok: true, token: makeToken(row.username, "admin"), user: pub(row) });
  }

  if (action === "login") {
    const { username, password } = body;
    const uname = (username || "").trim();
    const u = await getUser(uname);
    if (u && u.data.hash === hashPass(password || "")) {
      return res.status(200).json({ ok: true, token: makeToken(u.username, u.data.role), user: pub(u) });
    }
    // ไม่ตรงบัญชี tm_users → ลองเป็นสมาชิก (ชื่อจริงอังกฤษ + เบอร์โทร)
    const m = await findMemberByLogin(uname, password || "");
    if (m) {
      const nm = m.name || uname;
      const mentorName = ((m.nick || "").trim() + " " + (m.name || "").trim()).trim();
      return res.status(200).json({ ok: true, token: makeToken("member:" + m.id, "member"), user: { username: nm, role: "member", name: nm, mentorName } });
    }
    return res.status(200).json({ ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  }

  // ---- actions ที่ต้องเป็นแอดมิน ----
  // ⚠️ อ่าน role "สด" จากฐานข้อมูล ไม่เชื่อ role ที่ฝังในโทเคน — โทเคนไม่มีวันหมดอายุ/ไม่มี version
  //    เดิมเช็ก auth.role (จากโทเคน) แล้ว await getUser แค่เอา truthy → คนที่ถูกลดจาก admin
  //    ยังถือโทเคนเก่าที่ decode เป็น admin ได้ตลอดกาล ลบ/เลื่อนบัญชีคนอื่นได้
  const auth = verifyToken(body.token);
  const dbUser = auth && await getUser(auth.username);
  const isAdmin = !!dbUser && dbUser.data?.role === "admin";
  if (["listUsers", "saveUser", "deleteUser"].includes(action)) {
    if (!isAdmin) return res.status(200).json({ ok: false, error: "ต้องเป็นแอดมิน" });
  }

  if (action === "listUsers") {
    const users = await allUsers();
    return res.status(200).json({ ok: true, users: users.map(pub) });
  }

  if (action === "saveUser") {
    const u = body.user || {};
    const uname = (u.username || "").trim();
    if (!uname) return res.status(200).json({ ok: false, error: "กรอกชื่อผู้ใช้" });
    const role = u.role === "admin" ? "admin" : "mentor";
    const existing = await getUser(uname);
    const data = { role, name: u.name || "", mentorName: role === "mentor" ? (u.mentorName || "") : "",
      hash: u.password ? hashPass(u.password) : (existing ? existing.data.hash : null) };
    if (!data.hash) return res.status(200).json({ ok: false, error: "บัญชีใหม่ต้องตั้งรหัสผ่าน" });
    const r = await fetch(`${SB()}/rest/v1/tm_users`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ username: uname, data }) });
    if (!r.ok) return res.status(502).json({ ok: false, error: "บันทึกไม่สำเร็จ" });
    return res.status(200).json({ ok: true, user: pub({ username: uname, data }) });
  }

  if (action === "deleteUser") {
    const uname = (body.username || "").trim();
    if (uname === auth.username) return res.status(200).json({ ok: false, error: "ลบบัญชีตัวเองไม่ได้" });
    const users = await allUsers();
    const target = users.find((x) => x.username === uname);
    if (target && target.data.role === "admin" && users.filter((x) => x.data.role === "admin").length <= 1)
      return res.status(200).json({ ok: false, error: "ต้องมีแอดมินอย่างน้อย 1 บัญชี" });
    await fetch(`${SB()}/rest/v1/tm_users?username=eq.${encodeURIComponent(uname)}`, { method: "DELETE", headers: sbH() });
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: false, error: "unknown action" });
}
