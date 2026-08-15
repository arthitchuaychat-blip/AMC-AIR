// รับ callback จาก Google หลังผู้ใช้กดยินยอม → แลก code เป็น refresh token
// → ตรวจว่าบัญชีที่ยินยอมคือ GMAIL_ADDRESS จริง → เก็บ refresh token ลง secure_config
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const REDIRECT = "https://app.amcair.net/api/gmail-callback";

function page(title, msg, ok) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:60px auto;padding:0 22px;text-align:center;color:#1f2937">
<div style="font-size:46px">${ok ? "✅" : "⚠️"}</div>
<h2 style="margin:8px 0 6px">AMC · เชื่อมต่ออีเมลบริษัท</h2>
<p style="font-size:16px;line-height:1.7;color:#374151">${msg}</p>
${ok ? '<p style="color:#6b7280;font-size:14px">ปิดหน้านี้แล้วกลับไปที่แอปได้เลยครับ</p>' : ""}
</body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  try {
    const q = req.query || {};
    if (q.error) return res.status(400).send(page("ยกเลิก", `การเชื่อมต่อถูกยกเลิก: ${q.error}`, false));
    const code = q.code;
    if (!code) return res.status(400).send(page("ผิดพลาด", "ไม่พบรหัสยืนยัน (code)", false));

    const cid = process.env.GMAIL_OAUTH_CLIENT_ID, secret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
    if (!cid || !secret) return res.status(500).send(page("ยังตั้งค่าไม่ครบ", "ยังไม่ได้ตั้ง GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET ใน Vercel", false));
    if (!SB() || !KEY()) return res.status(500).send(page("ยังตั้งค่าไม่ครบ", "ไม่พบ SUPABASE env", false));

    // 1) แลก code → tokens
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: cid, client_secret: secret, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
    });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) return res.status(400).send(page("แลก token ไม่สำเร็จ", `Google: ${tok.error_description || tok.error || tr.status}`, false));
    if (!tok.refresh_token) return res.status(400).send(page("ไม่ได้ refresh token", "ลองเปิด /api/gmail-connect ใหม่อีกครั้ง (ระบบตั้ง prompt=consent ไว้แล้ว หากยังไม่ได้ ให้ถอนสิทธิ์เดิมที่ myaccount.google.com ก่อน)", false));

    // 2) ตรวจว่าบัญชีที่ยินยอม = GMAIL_ADDRESS จริง (กันเชื่อมบัญชีผิด)
    const pr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const prof = await pr.json();
    const want = (process.env.GMAIL_ADDRESS || "").toLowerCase().trim();
    if (want && prof.emailAddress && prof.emailAddress.toLowerCase() !== want) {
      return res.status(400).send(page("บัญชีไม่ตรง", `คุณยินยอมด้วย <b>${prof.emailAddress}</b> แต่ระบบตั้งไว้ที่ <b>${want}</b> — โปรดเปิด /api/gmail-connect ใหม่แล้วล็อกอินด้วย ${want}`, false));
    }

    // 3) เก็บ refresh token ลง secure_config (server-only)
    const sr = await fetch(`${SB()}/rest/v1/secure_config`, {
      method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: "gmail_refresh_token", value: tok.refresh_token, updated_at: new Date().toISOString() }),
    });
    if (!sr.ok) return res.status(500).send(page("บันทึกไม่สำเร็จ", `เก็บ token ลงฐานข้อมูลไม่สำเร็จ (${sr.status}) — รัน migration 211 แล้วหรือยัง?`, false));

    return res.status(200).send(page("สำเร็จ", `เชื่อมต่อ <b>${prof.emailAddress || want}</b> เรียบร้อยแล้ว 🎉 แอปพร้อมดึงอีเมลเข้ามาแล้ว`, true));
  } catch (e) {
    return res.status(500).send(page("ผิดพลาด", String(e.message || e), false));
  }
}
