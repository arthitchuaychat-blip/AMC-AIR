// ICS calendar feed of job-order visits → subscribe in Google Calendar (read-only, auto-refresh).
// Feeds can't send auth headers, so access is gated by a secret token in the URL:
//   /api/calendar?token=<CALENDAR_FEED_TOKEN>            → all teams
//   /api/calendar?token=<CALENDAR_FEED_TOKEN>&team=T01   → one team only
// Env: CALENDAR_FEED_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}` });

const SLOT = {
  morning:   { label: "เช้า",    hours: 3, icon: "🌅" },
  afternoon: { label: "บ่าย",    hours: 3, icon: "🌇" },
  full:      { label: "เต็มวัน",  hours: 7, icon: "☀️" },
  custom:    { label: "",         hours: 2, icon: "⏰" },
};
const JOB_ICON = { survey: "🔍", install: "🔧", repair: "🛠️", maintenance: "🧊", other: "📋" };

const pad = (n) => String(n).padStart(2, "0");
const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const esc = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// fold lines at 74 octets per RFC 5545 (be safe for strict parsers like Google)
const fold = (line) => {
  let out = "", rest = line;
  while (Buffer.byteLength(rest, "utf8") > 74) {
    let i = 74; while (Buffer.byteLength(rest.slice(0, i), "utf8") > 74) i--;
    out += rest.slice(0, i) + "\r\n ";
    rest = rest.slice(i);
  }
  return out + rest;
};

async function sbGet(path) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: sbH() });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  const want = process.env.CALENDAR_FEED_TOKEN;
  const token = (req.query.token || "").toString();
  if (!want) return res.status(503).send("ยังไม่ได้ตั้ง CALENDAR_FEED_TOKEN ใน Vercel");
  if (token !== want) return res.status(401).send("invalid token");
  const teamFilter = (req.query.team || "").toString() || null;

  try {
    const [jobs, visits, customers, teams] = await Promise.all([
      sbGet("job_orders?select=job_no,customer_id,assigned_team,scheduled_at,end_date,slot,status,title,job_type,address,contact_name,contact_phone,map_url,details"),
      sbGet("job_visits?select=job_no,assigned_team,scheduled_at,end_date,slot,status,visit_date"),
      sbGet("customers?select=id,name"),
      sbGet("teams?select=id,name"),
    ]);
    const cn = Object.fromEntries(customers.map((c) => [c.id, c.name]));
    const tn = Object.fromEntries(teams.map((t) => [t.id, (t.name || "").replace("Team ", "")]));
    const jobByNo = Object.fromEntries(jobs.map((j) => [j.job_no, j]));
    const visitsByJob = {};
    visits.forEach((v) => { (visitsByJob[v.job_no] = visitsByJob[v.job_no] || []).push(v); });

    const now = new Date();
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AMC AIR//Job Schedule//TH",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-CALNAME:AMC ตารางงาน" + (teamFilter ? ` · ${tn[teamFilter] || teamFilter}` : ""),
      "X-WR-TIMEZONE:Asia/Bangkok",
    ];

    let n = 0;
    jobs.forEach((j) => {
      if (j.status === "cancelled") return;
      const rounds = (visitsByJob[j.job_no] && visitsByJob[j.job_no].length)
        ? visitsByJob[j.job_no]
        : (j.scheduled_at ? [{ assigned_team: j.assigned_team, scheduled_at: j.scheduled_at, end_date: j.end_date, slot: j.slot, status: j.status }] : []);
      rounds.forEach((v, idx) => {
        const team = v.assigned_team || j.assigned_team;
        if (v.status === "cancelled" || !v.scheduled_at) return;
        if (teamFilter && team !== teamFilter) return;
        const start = new Date(v.scheduled_at);
        if (isNaN(start)) return;
        const slot = SLOT[v.slot] || SLOT.custom;
        let end;
        if (v.end_date && (!v.visit_date || v.end_date > v.visit_date)) end = new Date(`${v.end_date}T17:00:00+07:00`);
        else end = new Date(start.getTime() + slot.hours * 3600 * 1000);
        const teamName = tn[team] || team || "ไม่ระบุทีม";
        const cust = cn[j.customer_id] || j.title || j.job_no;
        const icon = JOB_ICON[j.job_type] || "📋";
        const summary = `${icon} ${cust} · ${teamName}`;
        const desc = [
          `ใบงาน: ${j.job_no}`,
          j.title ? `งาน: ${j.title}` : "",
          slot.label ? `ช่วงเวลา: ${slot.label}` : "",
          (j.contact_name || j.contact_phone) ? `ติดต่อ: ${[j.contact_name, j.contact_phone].filter(Boolean).join(" ")}` : "",
          j.address ? `ที่อยู่: ${j.address}` : "",
          j.map_url ? `แผนที่: ${j.map_url}` : "",
          j.details ? `รายละเอียด: ${j.details}` : "",
        ].filter(Boolean).join("\n");
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${j.job_no}-${idx}@amc-air.vercel.app`);
        lines.push(`DTSTAMP:${utc(now)}`);
        lines.push(`DTSTART:${utc(start)}`);
        lines.push(`DTEND:${utc(end)}`);
        lines.push(fold(`SUMMARY:${esc(summary)}`));
        if (j.address) lines.push(fold(`LOCATION:${esc(j.address)}`));
        lines.push(fold(`DESCRIPTION:${esc(desc)}`));
        lines.push(`STATUS:${v.status === "done" ? "CONFIRMED" : "CONFIRMED"}`);
        lines.push("END:VEVENT");
        n++;
      });
    });
    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=900"); // refresh ~15 min
    res.setHeader("Content-Disposition", 'inline; filename="amc-schedule.ics"');
    return res.status(200).send(lines.join("\r\n"));
  } catch (e) {
    return res.status(500).send("error: " + (e.message || e));
  }
}
