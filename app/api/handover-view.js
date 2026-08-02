// Public read-only data for a handover sheet → rendered by the SPA's public route (?ho=<id>&t=<token>).
// No login needed; access is gated by an HMAC token so only the shared link works.
//   GET /api/handover-view?id=<id>&t=<token>  → { handover, company }
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (token secret = HANDOVER_SHARE_SECRET || service key)
const crypto = require("crypto");
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}` });
const SECRET = () => process.env.HANDOVER_SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// stable per-handover token = first 24 hex of HMAC-SHA256("ho:<id>") — shared by view + send endpoints
function shareToken(id) {
  return crypto.createHmac("sha256", SECRET()).update("ho:" + String(id)).digest("hex").slice(0, 24);
}

module.exports = async function handler(req, res) {
  const id = (req.query.id || "").toString();
  const token = (req.query.t || "").toString();
  if (!id || !token) return res.status(400).json({ error: "missing id/token" });
  if (!SECRET()) return res.status(503).json({ error: "server not configured" });
  // constant-time compare of the expected token
  const want = shareToken(id);
  const ok = token.length === want.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(want));
  if (!ok) return res.status(403).json({ error: "invalid token" });
  try {
    const [hr, cr] = await Promise.all([
      fetch(`${SB()}/rest/v1/job_handovers?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: sbH() }),
      fetch(`${SB()}/rest/v1/company_profile?id=in.(1,2)&select=*`, { headers: sbH() }).catch(() => null),
    ]);
    const handover = (hr.ok ? await hr.json() : [])[0];
    if (!handover) return res.status(404).json({ error: "not found" });
    // {vat, novat} shape เหมือน getCompanies (id 1 = จด VAT · id 2 = ไม่จด)
    const rows = (cr && cr.ok ? await cr.json() : []) || [];
    const m = {}; rows.forEach((r) => { m[r.id === 2 ? "novat" : "vat"] = r; });
    const company = { vat: m.vat || {}, novat: m.novat || {} };
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ handover, company });
  } catch (e) {
    return res.status(500).json({ error: "error: " + (e.message || e) });
  }
};
module.exports.shareToken = shareToken;
