// Daily automation cron (รันเช้า ~08:00 ไทย = 01:00 UTC) — 2 งาน:
//  (2) เตือนนัดหมายลูกค้าล่วงหน้า 1 วัน → ส่ง LINE หาลูกค้าที่มีนัดพรุ่งนี้ (เฉพาะที่ผูกบัญชี LINE)
//  (3) สรุปเช้าให้ทีมออฟฟิศ → นัดวันนี้ / แชตค้างตอบ / สต๊อกต่ำ (เข้ากระดิ่งแจ้งเตือน + web push)
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_ACCESS_TOKEN, (VAPID_* สำหรับ push), CRON_SECRET
// กันยิงซ้ำ/สแปมลูกค้า: การส่งจริงต้องมี Authorization: Bearer <CRON_SECRET> (Vercel แนบให้อัตโนมัติเมื่อตั้ง env)
// ทดสอบเอง (ไม่ส่งจริง): GET /api/daily-cron?dry=1
import webpush from "web-push";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

const SLOT = { morning: "เช้า (09:00–12:00)", afternoon: "บ่าย (13:00–17:00)", full: "เต็มวัน", custom: "" };
const JOB_ICON = { survey: "🔍 สำรวจหน้างาน", install: "🔧 ติดตั้ง", repair: "🛠️ ซ่อม", maintenance: "🧊 ล้าง/บำรุงรักษา", other: "📋 บริการ" };
const TH_MONTH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const pad = (n) => String(n).padStart(2, "0");
// วันที่/ขอบเขตตามเวลาไทย (UTC+7)
function thDay(offsetDays = 0) {
  const t = new Date(Date.now() + 7 * 3600e3 + offsetDays * 86400e3);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  const ymd = `${y}-${pad(m)}-${pad(d)}`;
  return {
    ymd,
    thai: `${d} ${TH_MONTH[m]} ${(y + 543) % 100}`,          // เช่น 14 ส.ค. 69
    startISO: `${ymd}T00:00:00+07:00`,                        // ต้นวัน (ไทย)
    endISO: `${new Date(Date.parse(`${ymd}T00:00:00+07:00`) + 86400e3).toISOString()}`, // +1 วัน
  };
}
async function q(path) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: H() });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}
const enc = encodeURIComponent;

// ── ส่ง LINE push หาลูกค้า + บันทึกลงประวัติแชต (ให้โผล่ในหน้าแชตของแอป) ──
async function linePush(to, text) {
  const tok = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!tok) return { ok: false, reason: "no-line-token" };
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!r.ok) return { ok: false, reason: await r.text().catch(() => String(r.status)) };
  const sent = await r.json().catch(() => ({}));
  const mid = (sent.sentMessages || [])[0]?.id || null;
  // log outgoing (sent_by = null → หน้าแชตจะขึ้นว่า "ส่งจากแอป")
  await fetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: H(), body: JSON.stringify({ line_user_id: to, direction: "out", type: "text", text, sent_by: null, line_message_id: mid }) }).catch(() => {});
  await fetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${enc(to)}`, { method: "PATCH", headers: H(), body: JSON.stringify({ last_message: text.slice(0, 120), last_message_at: new Date().toISOString() }) }).catch(() => {});
  return { ok: true };
}

// ── web push หาพนักงาน (ทำงานเองฝั่งเซิร์ฟเวอร์ เพราะ cron ไม่มี JWT ผู้ใช้) ──
async function pushUsers(userIds, title, body, url) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !userIds.length) return;
  try {
    const inList = userIds.map((id) => `"${id}"`).join(",");
    const subs = await q(`push_subscriptions?user_id=in.(${inList})&select=endpoint,p256dh,auth`);
    if (!subs.length) return;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@amcair.net", pub, priv);
    const payload = JSON.stringify({ title, body: (body || "").slice(0, 180), url: url || "/", tag: "daily-cron" });
    await Promise.all(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 }).catch(() => {})));
  } catch { /* push ล้มเหลวไม่ให้กระทบงานอื่น */ }
}

export default async function handler(req, res) {
  try {
    if (!SB() || !KEY()) return res.status(500).json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
    const dry = req.query?.dry === "1";
    if (!dry) {
      const secret = process.env.CRON_SECRET;
      const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!secret) return res.status(503).json({ error: "ตั้ง CRON_SECRET ใน Vercel ก่อน (กันการยิงซ้ำ/สแปมลูกค้า) — หรือทดสอบด้วย ?dry=1" });
      if (auth !== secret) return res.status(401).json({ error: "unauthorized" });
    }

    const today = thDay(0), tomorrow = thDay(1);
    const result = { date: today.ymd, apptReminders: { sent: 0, skippedNoLine: 0, list: [] }, digest: {} };

    // ═══════════ (1) หมดอายุใบเสนอราคาอัตโนมัติ: ร่าง/ส่งแล้ว ที่เลยวันยืนราคา → หมดอายุ ═══════════
    try {
      if (dry) {
        const over = await q(`quotations?select=quote_no&status=in.(draft,sent)&valid_until=lt.${today.ymd}`).catch(() => []);
        result.quotesExpired = over.length;
      } else {
        const rr = await fetch(`${SB()}/rest/v1/quotations?status=in.(draft,sent)&valid_until=lt.${today.ymd}`, {
          method: "PATCH", headers: { ...H(), Prefer: "return=representation" },
          body: JSON.stringify({ status: "expired" }),
        });
        result.quotesExpired = rr.ok ? (await rr.json().catch(() => [])).length : 0;
      }
    } catch (_) { result.quotesExpired = 0; }

    // ═══════════ (2) เตือนนัดหมายลูกค้าล่วงหน้า 1 วัน (นัดพรุ่งนี้) ═══════════
    try {
      const range = `scheduled_at=gte.${enc(tomorrow.startISO)}&scheduled_at=lt.${enc(tomorrow.endISO)}`;
      const [jobs, visits] = await Promise.all([
        q(`job_orders?select=job_no,customer_id,title,job_type,slot,scheduled_at,address,status&${range}&status=not.in.(cancelled,done)`),
        q(`job_visits?select=job_no,slot,scheduled_at,status&${range}&status=not.in.(cancelled,done)`).catch(() => []),
      ]);
      // รวมนัดต่อใบงาน (ถ้ามี visit พรุ่งนี้ ใช้ slot ของ visit) — dedup ตาม job_no
      const apptByJob = {};
      jobs.forEach((j) => { apptByJob[j.job_no] = { job_no: j.job_no, customer_id: j.customer_id, title: j.title, job_type: j.job_type, slot: j.slot, address: j.address }; });
      if (visits.length) {
        // เติมใบงานที่มีเฉพาะ visit พรุ่งนี้ (scheduled_at หลักไม่ตรง) → ต้องดึงข้อมูลใบงานนั้นเพิ่ม
        const missing = [...new Set(visits.map((v) => v.job_no).filter((no) => !apptByJob[no]))];
        if (missing.length) {
          const extra = await q(`job_orders?select=job_no,customer_id,title,job_type,slot,address,status&job_no=in.(${missing.map((n) => `"${n}"`).join(",")})&status=not.in.(cancelled,done)`).catch(() => []);
          extra.forEach((j) => { apptByJob[j.job_no] = { job_no: j.job_no, customer_id: j.customer_id, title: j.title, job_type: j.job_type, slot: j.slot, address: j.address }; });
        }
        visits.forEach((v) => { if (apptByJob[v.job_no] && v.slot) apptByJob[v.job_no].slot = v.slot; });
      }
      const appts = Object.values(apptByJob).filter((a) => a.customer_id);
      // จับกลุ่มตามลูกค้า
      const byCust = {};
      appts.forEach((a) => { (byCust[a.customer_id] = byCust[a.customer_id] || []).push(a); });
      const custIds = Object.keys(byCust);
      if (custIds.length) {
        // หาบัญชี LINE ของลูกค้า (2 ทาง: line_contact_customers ก่อน แล้ว fallback line_contacts.customer_id)
        const inCust = custIds.map((id) => `"${id}"`).join(",");
        const [links, contacts] = await Promise.all([
          q(`line_contact_customers?select=line_user_id,customer_id&customer_id=in.(${inCust})`).catch(() => []),
          q(`line_contacts?select=line_user_id,customer_id&customer_id=in.(${inCust})`).catch(() => []),
        ]);
        const lineOf = {};
        contacts.forEach((c) => { if (c.customer_id && !lineOf[c.customer_id]) lineOf[c.customer_id] = c.line_user_id; });
        links.forEach((l) => { if (l.customer_id) lineOf[l.customer_id] = l.line_user_id; }); // link ตารางเฉพาะ = แม่นสุด ทับได้
        for (const cid of custIds) {
          const uid = lineOf[cid];
          if (!uid) { result.apptReminders.skippedNoLine++; continue; }
          const items = byCust[cid].map((a) => {
            const kind = JOB_ICON[a.job_type] || "📋 บริการ";
            const slot = SLOT[a.slot] || "";
            const addr = a.address ? ` (${String(a.address).slice(0, 40)})` : "";
            return `• ${kind}${slot ? " · " + slot : ""}${addr}`;
          }).join("\n");
          const msg = `🔔 แจ้งเตือนนัดหมายพรุ่งนี้\n📅 ${tomorrow.thai}\n\nทีมช่าง AMC AIR มีนัดเข้าบริการ:\n${items}\n\nหากไม่สะดวกหรือต้องการเลื่อนนัด แจ้งกลับทางแชตนี้ได้เลยครับ 🙏\n☎️ 099-262-9090`;
          result.apptReminders.list.push({ customer_id: cid, jobs: byCust[cid].map((a) => a.job_no) });
          if (!dry) { const r = await linePush(uid, msg); if (r.ok) result.apptReminders.sent++; }
          else result.apptReminders.sent++;
        }
      }
    } catch (e) { result.apptReminders.error = String(e.message || e); }

    // ═══════════ (3) สรุปเช้าให้ทีมออฟฟิศ ═══════════
    try {
      const rangeToday = `scheduled_at=gte.${enc(today.startISO)}&scheduled_at=lt.${enc(today.endISO)}`;
      const [jobsToday, visitsToday, unread, materials, stockRows, staff, overdue] = await Promise.all([
        q(`job_orders?select=job_no,customer_id,status&${rangeToday}&status=not.in.(cancelled,done)`).catch(() => []),
        q(`job_visits?select=job_no,status&${rangeToday}&status=not.in.(cancelled,done)`).catch(() => []),
        q(`line_contacts?select=line_user_id&unread=gt.0`).catch(() => []),
        q(`materials?select=code,name_th,min_stock,tracked&tracked=eq.true&min_stock=gt.0`).catch(() => []),
        q(`material_stock?select=code,current_stock`).catch(() => []),
        q(`profiles?select=id,role`).catch(() => []),
        // หนี้ค้างเกินกำหนด = ใบแจ้งหนี้ยังไม่จ่าย + เลยวันครบกำหนดแล้ว
        q(`invoices?select=invoice_no,total,wht_amt,due_date,customer_id&status=eq.unpaid&due_date=lt.${today.ymd}&order=due_date.asc`).catch(() => []),
      ]);
      const jobNos = new Set([...jobsToday.map((j) => j.job_no), ...visitsToday.map((v) => v.job_no)]);
      const nAppt = jobNos.size;
      const nUnread = unread.length;
      const stockMap = Object.fromEntries(stockRows.map((s) => [s.code, Number(s.current_stock) || 0]));
      const low = materials.filter((m) => stockMap[m.code] != null && stockMap[m.code] < Number(m.min_stock));
      const nLow = low.length;
      // ชื่อลูกค้าของใบที่ค้าง (ดึงเฉพาะ id ที่เกี่ยว)
      const nOd = overdue.length;
      const odAmt = overdue.reduce((a, x) => a + Math.max(0, (Number(x.total) || 0) - (Number(x.wht_amt) || 0)), 0);
      let odNames = [];
      if (nOd) {
        const ids = [...new Set(overdue.map((x) => x.customer_id).filter(Boolean))];
        const custs = ids.length ? await q(`customers?select=id,name&id=in.(${ids.map((i) => `"${i}"`).join(",")})`).catch(() => []) : [];
        const cn = Object.fromEntries(custs.map((c) => [c.id, c.name]));
        odNames = [...new Set(overdue.map((x) => cn[x.customer_id]).filter(Boolean))];
      }

      const lines = [
        `📅 นัดวันนี้: ${nAppt} งาน`,
        `💬 แชตลูกค้าค้างตอบ: ${nUnread} ห้อง`,
        `💰 หนี้ค้างเกินกำหนด: ${nOd} ใบ ${Math.round(odAmt).toLocaleString("en-US")} บาท${nOd ? " — " + odNames.slice(0, 5).join(", ") + (odNames.length > 5 ? " …" : "") : ""}`,
        `📦 สต๊อกต่ำกว่าขั้นต่ำ: ${nLow} รายการ${nLow ? " — " + low.slice(0, 5).map((m) => m.name_th || m.code).join(", ") + (nLow > 5 ? " …" : "") : ""}`,
      ];
      result.digest = { appointments: nAppt, unreadChats: nUnread, overdueInvoices: nOd, overdueAmount: Math.round(odAmt), lowStock: nLow };

      const office = staff.filter((p) => ["admin", "exec", "hr"].includes(p.role)).map((p) => p.id);
      const title = `🌅 สรุปเช้า ${today.thai} — นัด ${nAppt} · แชตค้าง ${nUnread} · หนี้ค้าง ${nOd} · สต๊อกต่ำ ${nLow}`;
      const body = lines.join("\n");
      if (!dry && office.length) {
        const rows = office.map((id) => ({ user_id: id, category: "job", title, body, url: "dashboard", ref_type: "digest" }));
        await fetch(`${SB()}/rest/v1/notifications`, { method: "POST", headers: H(), body: JSON.stringify(rows) }).catch(() => {});
        await pushUsers(office, title, body, "dashboard");
      }
      result.digest.recipients = office.length;
      result.digest.preview = title + "\n" + body;
    } catch (e) { result.digest.error = String(e.message || e); }

    return res.status(200).json({ dry, ...result });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
