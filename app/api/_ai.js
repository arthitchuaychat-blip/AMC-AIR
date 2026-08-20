// สมองบอท AI ที่ใช้ร่วมได้ทั้ง LINE และ Facebook — โหลดตั้งค่า + เวลาทำการ + เรียก Claude จากแคตตาล็อกจริง
// ⚠️ prompt/แคตตาล็อก mirror กับ aiAnswer() ใน line-webhook.js (LINE ยังใช้ของตัวเอง) — แก้ prompt ต้องแก้ทั้ง 2 ที่
// ตั้งค่าใช้ชุดเดียวกัน: app_config key=autoreply (ai_enabled, ai_always, open_days/time, ai_extra ฯลฯ)
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

async function tfetch(url, opts = {}, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

export async function getAutoReplyCfg() {
  try {
    const r = await tfetch(`${SB()}/rest/v1/app_config?key=eq.autoreply&select=value`, { headers: sbH() });
    return (r.ok ? (await r.json())[0]?.value : null) || null;
  } catch { return null; }
}

// อยู่ในเวลาทำการไหม (เวลาไทย UTC+7) — เหมือน isOpenNow ใน line-webhook.js เป๊ะ
export function isOpenNow(cfg) {
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  const day = th.getUTCDay();
  const mins = th.getUTCHours() * 60 + th.getUTCMinutes();
  const days = Array.isArray(cfg.open_days) && cfg.open_days.length ? cfg.open_days : [1, 2, 3, 4, 5, 6];
  if (!days.includes(day)) return false;
  const toMin = (s) => { const p = String(s || "").split(":"); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); };
  if (!(mins >= toMin(cfg.open_time || "08:00") && mins < toMin(cfg.close_time || "18:00"))) return false;
  if (cfg.lunch_enabled && mins >= toMin(cfg.lunch_from || "12:00") && mins < toMin(cfg.lunch_to || "13:00")) return false;
  return true;
}

// สมองบอท: ดึงแคตตาล็อกจริง (แอร์+บริการ · ราคาขายเท่านั้น) + เรียก Claude · history = [{role,content}] จบด้วย user
// คืน { text, err }
export async function generateReply({ history, cfg = {}, afterHours = true }) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { text: null, err: "no ANTHROPIC_API_KEY" };
    const AC_FIELDS = "kind,brand,series,name_th,name_en,ac_type,btu,unit,sale_price,seer,energy_label,refrigerant,voltage,pipe_size,power_cost_year,description,features,warranty";
    const SVC_FIELDS = "kind,name_th,btu_min,btu_max,unit,sale_price,description";
    const PAGE = 1000;
    const acFetch = async (fields) => {
      let rows = [], off = 0, status = 200;
      for (;;) {
        const r = await tfetch(`${SB()}/rest/v1/materials?select=${fields}&active=eq.true&kind=eq.ac&order=brand.asc,btu.asc,name_th.asc&limit=${PAGE}&offset=${off}`, { headers: sbH() });
        status = r.status;
        if (!r.ok) return { ok: false, status, rows: [] };
        const page = await r.json();
        rows = rows.concat(page);
        if (page.length < PAGE || off > 20000) break;
        off += page.length;
      }
      return { ok: true, status, rows };
    };
    let [pa, ps] = await Promise.all([
      acFetch(AC_FIELDS),
      tfetch(`${SB()}/rest/v1/materials?select=${SVC_FIELDS}&active=eq.true&kind=eq.service&order=name_th.asc&limit=500`, { headers: sbH() }),
    ]);
    if (!pa.ok) pa = await acFetch(AC_FIELDS.replace(",warranty", ""));
    const prods = [...(pa.ok ? pa.rows : []), ...(ps.ok ? await ps.json() : [])];
    if (!prods.length) return { text: null, err: `catalog empty (status ${pa.status}/${ps.status})` };
    const money = (v) => (Number(v) > 0 ? `${Number(v).toLocaleString("en-US")} บาท` : "สอบถามราคา");
    const clip = (t, n) => { const d = (t == null ? "" : String(t)).replace(/\s+/g, " ").trim(); return d ? d.slice(0, n) : null; };
    const nameEn = (p) => { const e = (p.name_en || "").trim(); return e && !(p.name_th || "").toLowerCase().includes(e.toLowerCase()) ? e : null; };
    const acLine = (p) => [p.brand, p.series, p.name_th, nameEn(p), p.ac_type, p.btu ? `${p.btu} BTU` : null,
      p.seer ? `SEER ${p.seer}` : null, p.energy_label, p.refrigerant, p.voltage,
      p.pipe_size ? `ท่อ ${p.pipe_size}` : null,
      Number(p.power_cost_year) > 0 ? `ค่าไฟ~${Number(p.power_cost_year).toLocaleString("en-US")} บาท/ปี` : null,
      p.warranty ? `ประกัน: ${clip(p.warranty, 120)}` : null,
      money(p.sale_price), clip(p.description, 200), clip(p.features, 300)].filter(Boolean).join(" | ");
    const svcLine = (p) => [p.name_th, (p.btu_min || p.btu_max) ? `สำหรับแอร์ ${p.btu_min || ""}–${p.btu_max || ""} BTU` : null,
      money(p.sale_price) + (p.unit ? `/${p.unit}` : ""), clip(p.description, 250)].filter(Boolean).join(" | ");
    const sec = (title, kind, fn) => { const a = prods.filter((p) => p.kind === kind); return a.length ? `## ${title}\n` + a.map(fn).join("\n") : ""; };
    const catalog = [sec("แอร์", "ac", acLine), sec("ค่าบริการ (ล้าง/ติดตั้ง/ซ่อม)", "service", svcLine)].filter(Boolean).join("\n\n");

    let messages = (history || []).filter((m) => (m.content || "").trim());
    while (messages.length && messages[0].role !== "user") messages = messages.slice(1);
    if (!messages.length) return { text: null, err: "no user message" };
    if (messages[messages.length - 1].role !== "user") return { text: null, err: "history not ending with user" };

    const days = (Array.isArray(cfg.open_days) && cfg.open_days.length ? cfg.open_days : [1, 2, 3, 4, 5, 6])
      .map((d) => ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"][d]).join(", ");
    const rules = `คุณคือผู้ช่วย AI ของ AMC AIR ร้านขาย-ติดตั้ง-ล้าง-ซ่อมแอร์ ${afterHours ? "ตอนนี้อยู่นอกเวลาทำการ คุณตอบลูกค้าทางแชตแทนทีมงาน" : "คุณช่วยตอบลูกค้าทางแชตเบื้องต้น ระหว่างที่ทีมงานอาจยังไม่ว่างตอบทันที"}

กติกาสำคัญ (ต้องทำตามเคร่งครัด):
- ตอบจาก "รายการสินค้าและบริการ" ที่ให้ไว้เท่านั้น ห้ามเดาหรือแต่งราคา รุ่น ส่วนลด หรือโปรโมชั่นที่ไม่มีในข้อมูลเด็ดขาด
- ราคาที่ให้คือราคาขายต่อหน่วย (ถ้ามี /หน่วย ต่อท้าย) — รายการที่เขียนว่า "สอบถามราคา" คือยังไม่ตั้งราคาในระบบ ให้บอกลูกค้าว่าทีมงานจะแจ้งราคาให้ ห้ามประเมินเอง
- ถ้าข้อมูลไม่พอ บอกตรง ๆ ว่า${afterHours ? `ทีมงานจะตอบในเวลาทำการ (${days} ${cfg.open_time || "08:00"}–${cfg.close_time || "18:00"} น.)` : "ทีมงานจะติดต่อกลับโดยเร็ว"} และชวนลูกค้าฝากชื่อ เบอร์โทร และรายละเอียดหน้างานไว้
- ห้ามยืนยันนัดหมายหรือการจอง — รับเรื่องไว้ได้ แต่บอกว่าทีมงานจะโทรยืนยันอีกครั้ง
- แนะนำขนาดแอร์ได้: 9,000 BTU ≈ ห้อง 12–15 ตร.ม. · 12,000 ≈ 16–20 · 18,000 ≈ 24–30 · 24,000 ≈ 32–40 แล้วเลือกรุ่นที่ตรงจากรายการ
- ค่าบริการแบ่งชั้นตามประเภทแอร์ + ช่วง BTU — ก่อนบอกราคา ให้เทียบ BTU ของลูกค้ากับช่วงในรายการทีละแถวอย่างระมัดระวัง เลือกแถวที่ช่วงครอบคลุม BTU นั้นจริง แล้วใช้ราคาตามแถวนั้นเป๊ะ ๆ ห้ามหยิบแถวข้างเคียง
- ข้อมูลรุ่นแอร์อาจมีค่าไฟโดยประมาณต่อปี (ค่าไฟ~x บาท/ปี) ขนาดท่อ ชนิดน้ำยา และคุณสมบัติ — ใช้ช่วยลูกค้าเปรียบเทียบความประหยัด/ความเหมาะสมได้
- ตอบภาษาไทย สุภาพ แทนตัวเองเป็นผู้ชาย ลงท้าย "ครับ" เท่านั้น ห้ามใช้ "ค่ะ/คะ" เด็ดขาด กระชับ ไม่เกิน 6 บรรทัด ใช้อีโมจิพอประมาณ
- เว็บไซต์ www.amcair.net · โทร 099-262-9090 (แจ้งเมื่อเกี่ยวข้อง)${(cfg.ai_extra || "").trim() ? "\n\nข้อมูลเพิ่มเติมจากร้าน:\n" + cfg.ai_extra.trim() : ""}`;

    const r = await tfetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1600,
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: rules },
          { type: "text", text: "รายการสินค้าและบริการ (ราคาหน้าร้านจริง):\n" + catalog, cache_control: { type: "ephemeral" } },
        ],
        messages,
      }),
    }, 40000);
    if (!r.ok) { const b = (await r.text()).slice(0, 250); return { text: null, err: `anthropic ${r.status}: ${b}` }; }
    const data = await r.json();
    if (data.stop_reason === "refusal") return { text: null, err: "refusal" };
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return text ? { text, err: null } : { text: null, err: `empty (stop: ${data.stop_reason})` };
  } catch (e) { return { text: null, err: String(e?.message || e) }; }
}
