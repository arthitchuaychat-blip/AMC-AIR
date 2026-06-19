// Test the FlowAccount OpenAPI connection (sandbox by default) — gets an access token using the
// "one client to one company" flow (client_id + client_secret only). Returns ok + token info, never
// the raw token. Credentials live in Vercel env; this proves connectivity before we build doc-create.
//   FLOWACCOUNT_CLIENT_ID, FLOWACCOUNT_CLIENT_SECRET, FLOWACCOUNT_ENV (sandbox token endpoint = "test", prod = "v1"; default "test")

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const OFFICE = ["admin", "exec", "finance"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  // only office staff may probe the connection
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` } });
  const role = ((pr.ok ? await pr.json() : [])[0] || {}).role;
  if (!OFFICE.includes(role)) return res.status(403).json({ error: "forbidden" });

  const id = process.env.FLOWACCOUNT_CLIENT_ID, secret = process.env.FLOWACCOUNT_CLIENT_SECRET;
  const env = process.env.FLOWACCOUNT_ENV || "test";
  if (!id || !secret) return res.status(200).json({ ok: false, reason: "no-creds", env, msg: "ยังไม่ได้ตั้ง FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET ใน Vercel" });

  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "flowaccount-api", client_id: id, client_secret: secret });
  let r;
  try {
    r = await fetch(`https://openapi.flowaccount.com/${env}/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
    });
  } catch (e) { return res.status(200).json({ ok: false, reason: "network", env, msg: String(e) }); }

  const text = await r.text();
  if (!r.ok) return res.status(200).json({ ok: false, reason: "token-failed", env, status: r.status, msg: text.slice(0, 400) });
  let j = {}; try { j = JSON.parse(text); } catch {}
  return res.status(200).json({ ok: !!j.access_token, env, tokenType: j.token_type || null, expiresIn: j.expires_in || null });
}
