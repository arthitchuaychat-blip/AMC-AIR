// ดึงอีเมลล่าสุดของ info@amcair.net เข้ามา mirror ใน Supabase (เรียกตอนเปิดหน้าอีเมล/กดรีเฟรช)
// สิทธิ์: เฉพาะทีมหลังบ้าน (ตรวจ JWT) · โหมดตรวจ: GET ?debug=<CRON_SECRET> คืน JSON ละเอียด
import { SB, KEY, sbH, sbGet, gmailAccessToken, gmail, parseMessage } from "./_gmail.js";

const OFFICE = ["admin", "exec", "finance", "hr", "sales", "field_sales", "graphic"];

export default async function handler(req, res) {
  try {
    const debug = req.query?.debug && process.env.CRON_SECRET && req.query.debug === process.env.CRON_SECRET;
    if (!debug) {
      const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return res.status(401).json({ error: "no auth" });
      const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } });
      if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
      const user = await ur.json();
      const prof = (await sbGet(`profiles?id=eq.${user.id}&select=role`))[0];
      if (!OFFICE.includes(prof?.role)) return res.status(403).json({ error: "forbidden" });
    }

    const self = (process.env.GMAIL_ADDRESS || "").toLowerCase();
    const token = await gmailAccessToken();

    // ── รายชื่อเมล 30 วันล่าสุด (ทั้งเข้า+ออก, ไม่เอา spam/trash) ──
    const list = await gmail(`messages?q=${encodeURIComponent("newer_than:30d -in:spam -in:trash")}&maxResults=60`, token);
    const ids = (list.messages || []).map((m) => m.id);
    if (!ids.length) return res.status(200).json({ ok: true, listCount: 0, new: 0, threads: 0 });

    // ดึงเฉพาะที่ยังไม่มีในฐานข้อมูล
    const existing = new Set((await sbGet(`email_messages?id=in.(${ids.map((i) => `"${i}"`).join(",")})&select=id`)).map((r) => r.id));
    const newIds = ids.filter((i) => !existing.has(i));

    let parseErr = null;
    const parsed = [];
    for (const id of newIds) {
      try { parsed.push(parseMessage(await gmail(`messages/${id}?format=full`, token), self)); }
      catch (e) { if (!parseErr) parseErr = String(e.message || e); }
    }

    let storeErr = null;
    const affected = [...new Set(parsed.map((m) => m.thread_id))];

    // 1) สร้าง "เธรดแม่" ก่อน (แค่ thread_id) — กัน FK ล้ม (email_messages อ้าง email_threads)
    if (affected.length) {
      const stubs = affected.map((tid) => ({ thread_id: tid }));
      await fetch(`${SB()}/rest/v1/email_threads`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(stubs) });
    }

    // 2) ใส่ข้อความ (ลูก)
    if (parsed.length) {
      const rows = parsed.map((m) => ({
        id: m.id, thread_id: m.thread_id, direction: m.direction, from_email: m.from_email, from_name: m.from_name,
        to_email: m.to_email, subject: m.subject, snippet: m.snippet, body_text: m.body_text, message_id_header: m.message_id_header, created_at: m.created_at,
      }));
      const ins = await fetch(`${SB()}/rest/v1/email_messages`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) });
      if (!ins.ok) storeErr = `messages ${ins.status}: ${(await ins.text()).slice(0, 300)}`;
    }

    // 3) อัปเดตสรุปเธรด (คงค่า assigned_to/customer_id/last_read_at เดิม)
    for (const tid of affected) {
      const msgs = await sbGet(`email_messages?thread_id=eq.${encodeURIComponent(tid)}&select=direction,from_email,from_name,to_email,subject,snippet,created_at&order=created_at.asc`);
      if (!msgs.length) continue;
      const latest = msgs[msgs.length - 1];
      const inbound = msgs.filter((m) => m.direction === "in");
      const lastInbound = inbound.length ? inbound[inbound.length - 1] : null;
      const party = lastInbound || latest;
      const prev = (await sbGet(`email_threads?thread_id=eq.${encodeURIComponent(tid)}&select=assigned_to,customer_id,last_read_at`))[0] || {};
      const lastInboundAt = lastInbound?.created_at || null;
      const unread = !!lastInboundAt && (!prev.last_read_at || lastInboundAt > prev.last_read_at);
      const row = {
        thread_id: tid,
        subject: (msgs[0] && msgs[0].subject) || latest.subject,
        from_email: party.direction === "in" ? party.from_email : party.to_email,
        from_name: party.direction === "in" ? party.from_name : "",
        snippet: latest.snippet || "",
        last_message_at: latest.created_at,
        last_inbound_at: lastInboundAt,
        unread,
        assigned_to: prev.assigned_to ?? null,
        customer_id: prev.customer_id ?? null,
        last_read_at: prev.last_read_at ?? null,
        updated_at: new Date().toISOString(),
      };
      const up = await fetch(`${SB()}/rest/v1/email_threads`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
      if (!up.ok && !storeErr) storeErr = `threads ${up.status}: ${(await up.text()).slice(0, 300)}`;
    }

    return res.status(200).json({
      ok: true, listCount: ids.length, existingCount: existing.size, new: parsed.length, threads: affected.length,
      parseErr, storeErr, self,
      sample: debug ? parsed.slice(0, 3).map((p) => ({ subject: p.subject, from: p.from_email, dir: p.direction, hasBody: !!p.body_text })) : undefined,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
