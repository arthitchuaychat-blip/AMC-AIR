// เริ่มขั้นตอนขออนุญาตเข้าถึง Gmail (OAuth) — เปิด /api/gmail-connect ในเบราว์เซอร์
// จะ redirect ไปหน้ายินยอมของ Google · ต้องล็อกอินด้วยบัญชี GMAIL_ADDRESS (info@amcair.net)
// ความปลอดภัย: ทำสำเร็จได้เฉพาะคนที่ล็อกอินบัญชี info@ ได้เท่านั้น (คนอื่นกดก็ยินยอมแทนไม่ได้)
const REDIRECT = "https://app.amcair.net/api/gmail-callback";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify", // อ่านเมล + ทำเครื่องหมายอ่าน/ป้าย
  "https://www.googleapis.com/auth/gmail.send",   // ส่งเมลตอบกลับ
].join(" ");

export default async function handler(req, res) {
  const cid = process.env.GMAIL_OAUTH_CLIENT_ID;
  if (!cid) return res.status(500).send("ยังไม่ได้ตั้ง GMAIL_OAUTH_CLIENT_ID ใน Vercel");
  const params = new URLSearchParams({
    client_id: cid,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",   // ขอ refresh token (ใช้เชื่อมยาว ๆ ไม่ต้องล็อกอินซ้ำ)
    prompt: "consent",        // บังคับให้คืน refresh token เสมอ
    include_granted_scopes: "true",
  });
  if (process.env.GMAIL_ADDRESS) params.set("login_hint", process.env.GMAIL_ADDRESS);
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}
