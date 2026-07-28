// ตัวช่วย Facebook — ดึง "โทเค็นเพจ" จริงจากค่าใน FB_PAGE_ACCESS_TOKEN
// รองรับทั้ง System User token (ถาวร ไม่หมดอายุ) และ Page token แบบเดิม:
//  - ถ้าตั้ง FB_PAGE_ID → เอาโทเค็นใน env ไปแลกโทเค็นเพจของ page id นั้น (system user → โทเค็นเพจถาวร)
//  - ถ้าไม่ตั้ง FB_PAGE_ID → ถือว่า env เป็นโทเค็นเพจอยู่แล้ว (พฤติกรรมเดิม เข้ากันได้ย้อนหลัง)
export const GRAPH = "https://graph.facebook.com/v19.0";

let _cache = { at: 0, pid: null, token: null };

export async function pageToken() {
  const env = process.env.FB_PAGE_ACCESS_TOKEN;
  const pid = process.env.FB_PAGE_ID;
  if (!env) return null;
  if (!pid) return env;                                    // ไม่มี page id → env เป็นโทเค็นเพจอยู่แล้ว
  if (_cache.token && _cache.pid === pid && (Date.now() - _cache.at) < 50 * 60 * 1000) return _cache.token;  // แคช 50 นาที
  try {
    const r = await fetch(`${GRAPH}/${pid}?fields=access_token&access_token=${env}`).then((x) => x.json());
    if (r && r.access_token) { _cache = { at: Date.now(), pid, token: r.access_token }; return r.access_token; }
  } catch (_) {}
  return env;                                              // แลกไม่ได้ → ใช้ env ตรง ๆ (fallback)
}

export const pageId = () => process.env.FB_PAGE_ID || null;

// รายชื่อเพจที่โทเค็น (system user) เข้าถึงได้ — ใช้ช่วยหา FB_PAGE_ID ที่จะไปตั้งใน Vercel
export async function listPages() {
  const env = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!env) return { error: "no token" };
  return fetch(`${GRAPH}/me/accounts?fields=id,name&access_token=${env}`).then((x) => x.json()).catch((e) => ({ error: String(e) }));
}
