// HR cron รายวัน (09:15 ไทย) — 2 เรื่อง:
// (1) พนักงานที่วันนี้เป็นวันทำงานแต่ "ยังไม่เช็คอิน" → แจ้งเตือนตัวพนักงาน + สรุปให้ HR/ธุรการ/ผู้บริหาร
// (2) เมื่อวานเช็คอินแต่ "ไม่ได้เช็คเอาท์" → แจ้งพนักงาน (ให้แจ้งธุรการแก้เวลา) + รวมในสรุป HR
// ใช้ env เดิม: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ตัวเดียวกับ mentor-cron)
// ทดสอบเอง: GET /api/hr-cron?dry=1 (ดูรายชื่อโดยไม่ส่งแจ้งเตือน)

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

const pad = (n) => String(n).padStart(2, "0");
// วันที่ตามเวลาไทย (UTC+7)
function thDate(offsetDays = 0) {
  const t = new Date(Date.now() + 7 * 3600e3 + offsetDays * 86400e3);
  return { ymd: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, dow: t.getUTCDay() }; // dow: 0=อาทิตย์ 6=เสาร์
}
async function q(path) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: H() });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  try {
    if (!SB() || !KEY()) return res.status(500).json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
    const dry = req.query?.dry === "1";
    const today = thDate(0), yesterday = thDate(-1);

    const [profiles, teams, holidays, leaves, attToday, attYest] = await Promise.all([
      q("profiles?select=id,name,email,role,team,work_pattern,base_pay"),
      q("teams?select=id,type"),
      q(`hr_holidays?select=day&day=eq.${today.ymd}`),
      q(`hr_leaves?select=user_id&status=eq.approved&start_date=lte.${today.ymd}&end_date=gte.${today.ymd}`),
      q(`hr_attendance?select=user_id&work_date=eq.${today.ymd}`),
      q(`hr_attendance?select=user_id,check_in_at,check_out_at&work_date=eq.${yesterday.ymd}`),
    ]);

    const subTeams = new Set(teams.filter((t) => t.type === "sub").map((t) => t.id));
    // พนักงานประจำ = มี role และไม่อยู่ทีมช่างซัพ (เกณฑ์เดียวกับหน้า HR)
    const staff = profiles.filter((p) => p.role && !(p.team && subTeams.has(p.team)));
    const byId = Object.fromEntries(staff.map((p) => [p.id, p]));
    const hrIds = staff.filter((p) => ["admin", "exec", "hr"].includes(p.role)).map((p) => p.id);

    // ---- (1) ยังไม่เช็คอินวันนี้ ----
    let missing = [];
    const isHoliday = holidays.length > 0;
    if (!isHoliday && today.dow !== 0) {   // อาทิตย์/วันหยุดบริษัท = ไม่เช็ค
      const onLeave = new Set(leaves.map((l) => l.user_id));
      const checked = new Set(attToday.map((a) => a.user_id));
      missing = staff.filter((p) =>
        !checked.has(p.id) && !onLeave.has(p.id)
        && (today.dow !== 6 || (p.work_pattern || "mon_sat") === "mon_sat")   // เสาร์: เช็คเฉพาะแพตเทิร์น จ-ส (กลุ่มเสาร์เว้นเสาร์ไม่เช็ค กัน false alarm)
        && (p.work_pattern || Number(p.base_pay) > 0));                       // ต้องเป็นคนที่ตั้งค่าการทำงาน/เงินเดือนไว้
    }

    // ---- (2) เมื่อวานลืมเช็คเอาท์ ----
    const noOut = attYest.filter((a) => a.check_in_at && !a.check_out_at && byId[a.user_id]).map((a) => byId[a.user_id]);

    const out = { date: today.ymd, missing: missing.map((p) => p.name || p.email), noCheckout: noOut.map((p) => p.name || p.email) };
    if (dry) return res.status(200).json({ dry: true, ...out });

    const notif = [];
    missing.forEach((p) => notif.push({ user_id: p.id, category: "hr", title: "⏰ อย่าลืมเช็คอินเข้างานวันนี้", body: "ยังไม่พบการเช็คอินของคุณ — เปิดเมนู เข้างาน/ลา เพื่อเช็คอิน (หากลา/หยุด แจ้งหัวหน้างาน)", url: "attendance", ref_type: "attendance" }));
    noOut.forEach((p) => notif.push({ user_id: p.id, category: "hr", title: "📌 เมื่อวานยังไม่ได้เช็คเอาท์", body: `วันที่ ${yesterday.ymd} มีเช็คอินแต่ไม่มีเวลาออก — แจ้งธุรการ/HR แก้เวลาให้ถูกต้อง (มีผล OT และสถิติ)`, url: "attendance", ref_type: "attendance" }));
    if (missing.length || noOut.length) {
      const body = [
        missing.length ? `ยังไม่เช็คอิน (${missing.length}): ${out.missing.join(", ")}` : null,
        noOut.length ? `เมื่อวานไม่เช็คเอาท์ (${noOut.length}): ${out.noCheckout.join(", ")}` : null,
      ].filter(Boolean).join("\n");
      hrIds.forEach((id) => notif.push({ user_id: id, category: "hr", title: `🕘 สรุปเช้า ${today.ymd} — เช็คอินขาด ${missing.length} · ลืมเช็คเอาท์ ${noOut.length}`, body, url: "hr", ref_type: "attendance" }));
    }
    if (notif.length) {
      const r = await fetch(`${SB()}/rest/v1/notifications`, { method: "POST", headers: H(), body: JSON.stringify(notif) });
      if (!r.ok) throw new Error(`notifications → ${r.status} ${await r.text()}`);
    }
    return res.status(200).json({ sent: notif.length, ...out });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
