import React from "react";
import { myAttendanceToday, checkIn, checkOut, listMyAttendance, listMyLeaves, submitLeave, getHrSettings, listHolidays, uploadAttendancePhoto, getMyLeaveQuota, submitAdvance, listMyAdvances, cancelMyAdvance, cancelMyLeave, listPayslips } from "../lib/api";
import { fmtBaht } from "../lib/format";
import { DEFAULT_HR_SETTINGS, dayStat, fmtMin, fmtTime, isWorkday, leaveDays, leaveDaysInYear, leaveDaysInRange, leaveLabel, LEAVE_TYPES, LEAVE_HOURS_PER_DAY, buildLeaveDaySet, minutesOf, hrYmd, hrParseYmd, todayYmd } from "../lib/hr";
import { payPeriod, periodStats, computePayslip, frozenPayslip } from "../lib/payroll";
import PayDetailModal from "./PayDetail";
import { useLang, LEAVE_MY, LV_STATUS_MY } from "../lib/i18n";
import { UIcon } from "../icons";

const LV_BADGE = { pending: { th: "รออนุมัติ", cls: "b-amber" }, approved: { th: "อนุมัติ", cls: "b-green" }, rejected: { th: "ไม่อนุมัติ", cls: "b-red" } };
const ADV_BADGE = {
  pending: { th: "รออนุมัติ", my: "အတည်ပြုရန်", cls: "b-amber" },
  approved: { th: "อนุมัติ · รอหัก", my: "အတည်ပြုပြီး", cls: "b-blue" },
  rejected: { th: "ไม่อนุมัติ", my: "ငြင်းပယ်", cls: "b-red" },
  paid: { th: "หักแล้ว", my: "နုတ်ယူပြီး", cls: "b-green" },
};
const thDate = (s) => hrParseYmd(s).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });

function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}), { enableHighAccuracy: true, timeout: 8000 });
  });
}

// LINE / Facebook / IG in-app browsers (and bare Android WebViews) often block the camera file-input,
// so the เช็คอิน button "does nothing". Detect them so we can tell the user to open in a real browser.
function inAppBrowser() {
  const ua = navigator.userAgent || "";
  const m = /Line\//i.test(ua) ? "LINE"
    : /FBAN|FBAV|FB_IAB/i.test(ua) ? "Facebook"
    : /Instagram/i.test(ua) ? "Instagram"
    : /Messenger/i.test(ua) ? "Messenger"
    : /MicroMessenger/i.test(ua) ? "WeChat"
    : /TikTok|musical_ly/i.test(ua) ? "TikTok"
    : /; wv\)/i.test(ua) ? "in-app" : null;
  return m;
}

export default function Attendance({ me }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);          // Thai default, Burmese when toggled
  const lvType = (id) => (lang === "my" ? (LEAVE_MY[id] || leaveLabel(id)) : leaveLabel(id));
  const [today, setToday] = React.useState(undefined); // undefined=loading
  const [settings, setSettings] = React.useState(DEFAULT_HR_SETTINGS);
  const [recent, setRecent] = React.useState([]);
  const [leaves, setLeaves] = React.useState([]);
  const [advances, setAdvances] = React.useState([]);
  const [holidays, setHolidays] = React.useState(new Set());
  const [myQuota, setMyQuota] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  // สรุปเงินเดือนของฉัน (ละเอียด) — เลือกรอบเดือน แล้วเปิดแผงเดียวกับที่ HR เห็น
  const pad2 = (n) => String(n).padStart(2, "0");
  const [payYm, setPayYm] = React.useState(() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; });
  const [payBusy, setPayBusy] = React.useState(false);
  const [payDetail, setPayDetail] = React.useState(null); // props ของ PayDetailModal
  const [toast, setToast] = React.useState(null);
  const fileRef = React.useRef(null);
  const actionRef = React.useRef(null); // "in" | "out"

  const pattern = me?.work_pattern || "mon_sat";
  const satGroup = me?.sat_group || null;
  const inApp = React.useMemo(() => inAppBrowser(), []);
  async function copyLink() { try { await navigator.clipboard.writeText(location.href); flash("คัดลอกลิงก์แล้ว — ไปวางในแอป Chrome/Safari"); } catch { flash("คัดลอกไม่สำเร็จ — พิมพ์ที่อยู่เว็บในเบราว์เซอร์เอง", true); } }

  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  async function load() {
    try {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const [t, s, r, lv, hol, q, av] = await Promise.all([myAttendanceToday(), getHrSettings(), listMyAttendance(hrYmd(since)), listMyLeaves(), listHolidays(), getMyLeaveQuota(new Date().getFullYear()), listMyAdvances()]);
      setToday(t); setSettings(s || DEFAULT_HR_SETTINGS); setRecent(r); setLeaves(lv); setHolidays(new Set((hol || []).map((h) => h.day))); setMyQuota(q); setAdvances(av);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setToday(null); }
  }
  React.useEffect(() => { load(); }, []);

  // selfie picked → upload + GPS + check in/out
  async function onPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const [photo, gps] = await Promise.all([uploadAttendancePhoto(file), getGPS()]);
      if (actionRef.current === "in") { await checkIn({ ...gps, photo }); flash("เช็คอินเข้างานแล้ว ✓"); }
      else { await checkOut({ ...gps, photo }); flash("เช็คเอาท์ออกงานแล้ว ✓"); }
      await load();
    } catch (err) {
      // error ดิบจาก RLS เป็นภาษาอังกฤษ พนักงานอ่านแล้วไม่รู้จะแก้ยังไง
      const m = String(err?.message || err);
      flash(/row.level security|violates row-level/i.test(m)
        ? "เช็คอินไม่สำเร็จ — วันที่ในเครื่องไม่ตรงกับวันที่จริง กรุณาตั้งวันที่/เวลาเป็น “อัตโนมัติ” แล้วลองใหม่"
        : m, true);
    }
    setBusy(false);
  }
  function trigger(action) { actionRef.current = action; fileRef.current && fileRef.current.click(); }

  const st = today ? dayStat(today, settings) : null;
  const mustWorkToday = isWorkday(todayYmd(), pattern, satGroup, holidays);

  // คำนวณสรุปเงินเดือนของตัวเอง — สูตร/ชุดข้อมูลเดียวกับแท็บเงินเดือนของ HR (periodStats + computePayslip)
  // RLS ให้พนักงานเห็นเฉพาะข้อมูลของตัวเองอยู่แล้ว · สลิปที่ HR บันทึก (โบนัส/หักอื่น/สถานะจ่าย) อ่านได้หลังรัน mig 149
  async function openMyPay() {
    setPayBusy(true);
    try {
      const { from, to } = payPeriod(payYm);
      const [attRows, lvAll, hols, hs, advs, slips, myQ] = await Promise.all([
        listMyAttendance(from), listMyLeaves(), listHolidays(), getHrSettings().catch(() => null),
        listMyAdvances(), listPayslips(payYm).catch(() => []), getMyLeaveQuota(Number(payYm.slice(0, 4))).catch(() => null),
      ]);
      const hset = { ...DEFAULT_HR_SETTINGS, ...(hs || {}) };
      const holSet = new Set((hols || []).map((h) => h.day));
      const attByUserDay = { [me.id]: {} };
      attRows.filter((a) => a.work_date >= from && a.work_date <= to).forEach((a) => { attByUserDay[me.id][a.work_date] = a; });
      const approved = lvAll.filter((l) => l.status === "approved");
      const leaveDaySet = buildLeaveDaySet(approved, from, to);
      const stp = periodStats(me, attByUserDay, leaveDaySet, from, to, holSet, hset);
      // ลาเกินโควตา: สูตรเดียวกับ HR — เฉพาะส่วนเกินที่ "เกิดในรอบนี้" แยกรายประเภท
      const yearStart = `${payYm.slice(0, 4)}-01-01`;
      const dayBefore = (s) => { const d = hrParseYmd(s); d.setDate(d.getDate() - 1); return hrYmd(d); };
      const q0 = hset.quota || DEFAULT_HR_SETTINGS.quota;
      const usedThru = (t, cutoff) => approved.filter((l) => l.type === t).reduce((s, l) => s + leaveDaysInRange(l, yearStart, cutoff), 0);
      let over = 0;
      ["vacation", "personal", "sick"].forEach((t) => { const qq = (myQ?.[t] ?? q0[t]) ?? 0; over += Math.max(0, usedThru(t, to) - qq) - Math.max(0, usedThru(t, dayBefore(from)) - qq); });
      stp.overLeave = Math.round((Math.min(stp.leaveDays - (stp.unpaidLeave || 0), Math.max(0, over)) + (stp.unpaidLeave || 0)) * 100) / 100;
      const slip = (slips || []).find((s) => s.user_id === me.id) || null;
      // เบิกล่วงหน้า: รอบที่จ่ายแล้ว = ใบที่ถูกหักในรอบนั้น (period = รอบ) · รอบยังไม่จ่าย = ใบอนุมัติที่ยังไม่ถูกหัก
      const advRows = (advs || []).filter((a) => a.period === payYm || (!a.period && a.status === "approved"));
      const advSum = slip ? Number(slip.d_advance) || 0 : advRows.reduce((x, a) => x + (Number(a.amount) || 0), 0);
      // ⚠️ รอบที่จ่ายแล้ว = ประวัติ อ่านจากสลิปที่บันทึก ห้ามคำนวณสดใหม่ (กติกาเดียวกับหน้า HR)
      //    เดิมคำนวณสดเสมอ: HR แก้เวลาเข้างานย้อนหลังทีเดียว พนักงานเปิดดูแล้วเห็น
      //    "จ่ายแล้ว ยอดตามสลิป X" อยู่บรรทัดบน แต่ท้ายโมดัลขึ้นสุทธิอีกตัว ซึ่งเป็นเงินที่ไม่เคยโอนจริง
      //    ใช้ frozenPayslip ตัวเดียวกับ HR.jsx เพื่อไม่ให้สองหน้าคิดคนละแบบอีก
      const c = slip?.status === "paid"
        ? frozenPayslip(slip)
        : computePayslip({ ...me, bonus: Number(slip?.bonus) || 0, other_deduct: Number(slip?.other_deduct) || 0, advance: advSum }, stp, {});
      const note = slip
        ? (slip.status === "paid" ? L(`✅ รอบนี้จ่ายแล้ว · ยอดสุทธิตามสลิปที่บันทึก ${fmtBaht(slip.net)}`, `✅ ဒီကာလ ပေးချေပြီး · အသားတင် ${fmtBaht(slip.net)}`) : L("📝 รอบนี้ HR บันทึกร่างไว้แล้ว — ตัวเลขอาจขยับได้จนถึงวันจ่าย", "📝 HR မူကြမ်းသိမ်းပြီး — ပေးချေရက်အထိ ပြောင်းနိုင်သည်"))
        : L("⏳ รอบนี้ยังไม่ถูกบันทึกโดย HR — ตัวเลขเป็นการคำนวณสด อาจขยับได้จนถึงวันจ่าย", "⏳ HR မသိမ်းရသေး — အချိန်နှင့်တပြေးညီ တွက်ချက်မှုဖြစ်၍ ပေးချေရက်အထိ ပြောင်းနိုင်သည်");
      setPayDetail({ r: { p: me, st: stp }, c, advRows, settings: hset, period: `${from} ถึง ${to}`, note });
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setPayBusy(false);
  }

  // leave balance: quota (settings) minus approved days this year, per type
  const year = new Date().getFullYear();
  const usedByType = {};
  leaves.filter((l) => l.status === "approved").forEach((l) => { const dY = leaveDaysInYear(l, year); if (dY > 0) usedByType[l.type] = (usedByType[l.type] || 0) + dY; });
  // ใบที่ยังรออนุมัติ — โชว์ให้รู้ว่ามีจองไว้แล้วเท่าไหร่ จะได้ไม่เผลอยื่นเกินสิทธิ์
  const pendByType = {};
  leaves.filter((l) => l.status === "pending").forEach((l) => { const dY = leaveDaysInYear(l, year); if (dY > 0) pendByType[l.type] = (pendByType[l.type] || 0) + dY; });
  const baseQuota = (settings && settings.quota) || DEFAULT_HR_SETTINGS.quota;
  // per-person override (HR-set) wins over the company default
  const quota = { vacation: myQuota?.vacation ?? baseQuota.vacation, personal: myQuota?.personal ?? baseQuota.personal, sick: myQuota?.sick ?? baseQuota.sick };

  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">{L("เข้างาน / ลา", "အလုပ်တက် / ခွင့်")} <span className="page-title-en">Attendance</span></h1>
        <p className="page-sub">{L("เวลาทำงาน", "အလုပ်ချိန်")} {settings.start}–{settings.end} {L("น.", "")} · {mustWorkToday ? L("วันนี้เป็นวันทำงาน", "ဒီနေ့ အလုပ်ရက်ဖြစ်သည်") : L("วันนี้เป็นวันหยุดของคุณ", "ဒီနေ့ သင့်နားရက်ဖြစ်သည်")}</p></div></div>

      <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onPhoto} />

      {/* check-in / check-out card */}
      <div className="card att-clock">
        {today === undefined ? <div className="empty">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div> : (
          <>
            <div className="att-now">
              <div className="att-now-l"><span>{L("เข้างาน", "အလုပ်ဝင်")}</span><b>{today?.check_in_at ? fmtTime(today.check_in_at) : "—"}</b>
                {st?.checkedIn && (st.isLate ? <span className="att-tag late">{L("สาย", "နောက်ကျ")} {fmtMin(st.lateMin)}</span> : <span className="att-tag ok">{L("ตรงเวลา", "အချိန်မီ")}</span>)}</div>
              <div className="att-now-l"><span>{L("ออกงาน", "အလုပ်ဆင်း")}</span><b>{today?.check_out_at ? fmtTime(today.check_out_at) : "—"}</b>
                {st?.checkedOut && st.otMin > 0 && <span className="att-tag ot">OT {fmtMin(st.otMin)}</span>}
                {st?.checkedOut && st.earlyMin > 0 && <span className="att-tag late">{L("ออกก่อน", "စောထွက်")} {fmtMin(st.earlyMin)}</span>}</div>
            </div>
            {inApp && !(today?.check_in_at && today?.check_out_at) && (
              <div className="att-inapp">
                ⚠️ {L(`คุณกำลังเปิดในแอป ${inApp === "in-app" ? "" : inApp} ซึ่งมักถ่ายรูปเช็คอินไม่ได้ (กดปุ่มแล้วไม่มีอะไรเกิดขึ้น)`,
                       `${inApp === "in-app" ? "App အတွင်း" : inApp} ဘရောက်ဇာတွင် ကင်မရာ အလုပ်မလုပ်တတ်ပါ`)}
                <br />{L("วิธีแก้: เปิดด้วย Chrome หรือ Safari หรือ “เพิ่มลงหน้าจอโฮม” แล้วเปิดจากไอคอน", "Chrome / Safari ဖြင့်ဖွင့်ပါ")}
                <button className="btn-ghost sm" style={{ marginTop: 6 }} onClick={copyLink}>📋 {L("คัดลอกลิงก์", "Link ကူးရန်")}</button>
              </div>
            )}
            {(() => { const missed = recent.filter((a) => a.work_date < todayYmd() && a.check_in_at && !a.check_out_at); return missed.length > 0 && (
              <div className="att-inapp">
                ⏰ {L(`คุณลืมเช็คเอาท์ ${missed.length} วัน (ล่าสุด ${thDate(missed[0].work_date)}) — แจ้งฝ่ายบุคคลให้แก้เวลาให้ ไม่งั้นชั่วโมงงาน/OT วันนั้นหาย`,
                       `Check-out မမှတ်ရသေးသောရက် ${missed.length} ရက် ရှိသည် — HR ကို အကြောင်းကြားပါ`)}
              </div>
            ); })()}
            <div className="att-actions">
              {!today?.check_in_at && <button className="btn-primary att-big" disabled={busy} onClick={() => trigger("in")}>📸 {L("เช็คอินเข้างาน", "အလုပ်ဝင်ချိန် မှတ်တမ်းတင်")}</button>}
              {today?.check_in_at && !today?.check_out_at && <button className="btn-primary att-big ok" disabled={busy} onClick={() => trigger("out")}>📸 {L("เช็คเอาท์ออกงาน", "အလုပ်ဆင်းချိန် မှတ်တမ်းတင်")}</button>}
              {today?.check_in_at && today?.check_out_at && <div className="att-done">✅ {L("บันทึกเวลาวันนี้ครบแล้ว", "ဒီနေ့ အချိန်မှတ်တမ်း ပြည့်စုံပါပြီ")}</div>}
            </div>
            <p className="page-sub" style={{ margin: 0 }}>{L("ระบบจะถ่ายเซลฟี่ + บันทึกพิกัด GPS ตอนเช็คอิน/เอาท์", "Check-in/out တွင် Selfie ရိုက်ပြီး GPS တည်နေရာ မှတ်တမ်းတင်ပါမည်")}</p>
          </>
        )}
      </div>

      {/* leave balance + request */}
      <div className="damage-layout">
        <div className="card">
          <div className="sec-head"><div><div className="sec-title">{L("วันลาคงเหลือ", "ကျန်ရှိသော ခွင့်ရက်")} ({L("ปี", "နှစ်")} {lang === "my" ? year : year + 543})</div></div></div>
          <div className="att-bal">
            {LEAVE_TYPES.filter((t) => t.id !== "unpaid").map((t) => { const q = quota[t.id] ?? 0, used = usedByType[t.id] || 0, pend = pendByType[t.id] || 0; return (
              <div className="att-bal-item" key={t.id}><span>{lvType(t.id)}</span><b>{Math.max(0, q - used)}</b><small>/ {q} {L("วัน", "ရက်")}{pend > 0 ? ` · ${L("รออนุมัติ", "စောင့်ဆိုင်း")} ${pend}` : ""}</small></div>
            ); })}
            {usedByType.unpaid > 0 && <div className="att-bal-item"><span>{lvType("unpaid")}</span><b>{usedByType.unpaid}</b><small>{L("วัน (ไม่มีโควตา)", "ရက်")}</small></div>}
          </div>
          <LeaveForm pattern={pattern} satGroup={satGroup} holidays={holidays} onDone={(m) => { flash(m); load(); }} flash={flash} L={L} lvType={lvType} />
        </div>

        <div className="card">
          <div className="sec-head"><div><div className="sec-title">{L("ใบลาของฉัน", "ကျွန်ုပ်၏ ခွင့်လျှောက်လွှာများ")}</div></div></div>
          <div className="set-list">
            {leaves.length === 0 && <div className="empty sm">{L("ยังไม่มีใบลา", "ခွင့်လျှောက်လွှာ မရှိသေးပါ")}</div>}
            {leaves.map((l) => { const b = LV_BADGE[l.status] || LV_BADGE.pending; return (
              <div className="att-leave-row" key={l.id}>
                <div><b>{lvType(l.type)}</b> · {thDate(l.start_date)}{l.end_date !== l.start_date ? ` – ${thDate(l.end_date)}` : ""} <span className="att-days">{Number(l.hours) > 0 ? `${Number(l.hours)} ${L("ชม.", "နာရီ")}${l.time_from && l.time_to ? ` (${String(l.time_from).slice(0, 5)}–${String(l.time_to).slice(0, 5)})` : ""}` : `${l.days} ${L("วัน", "ရက်")}`}</span>
                  {l.reason && <div className="jo-dim">{l.reason}</div>}</div>
                <div className="hr-leave-act">
                  <span className={"job-badge " + b.cls}>{lang === "my" ? (LV_STATUS_MY[l.status] || b.th) : b.th}</span>
                  {l.status === "pending" && <button className="btn-ghost sm" onClick={async () => { try { await cancelMyLeave(l.id); flash(L("ยกเลิกใบลาแล้ว", "ခွင့်လျှောက်လွှာ ပယ်ဖျက်ပြီး")); load(); } catch (e) { flash((e.message || e), true); } }}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>}
                </div>
              </div>
            ); })}
          </div>
        </div>
      </div>

      {/* cash advance request + my advances */}
      <div className="damage-layout">
        <div className="card">
          <div className="sec-head"><div><div className="sec-title">{L("เบิกเงินล่วงหน้า", "ကြိုတင်ငွေထုတ်")}</div>
            <div className="sec-sub">{L("ส่งคำขอเบิก · หักจากเงินเดือนรอบถัดไปเมื่ออนุมัติ", "တောင်းဆို၍ အတည်ပြုပါက နောက်လစာမှ နုတ်ယူမည်")}</div></div></div>
          <AdvanceForm onDone={(m) => { flash(m); load(); }} flash={flash} L={L} />
        </div>

        <div className="card">
          <div className="sec-head"><div><div className="sec-title">{L("การเบิกของฉัน", "ကျွန်ုပ်၏ ကြိုတင်ထုတ်ယူမှု")}</div></div></div>
          <div className="set-list">
            {advances.length === 0 && <div className="empty sm">{L("ยังไม่มีรายการเบิก", "ကြိုတင်ထုတ်ယူမှု မရှိသေးပါ")}</div>}
            {advances.map((a) => { const b = ADV_BADGE[a.status] || ADV_BADGE.pending; return (
              <div className="att-leave-row" key={a.id}>
                <div><b>{fmtBaht(a.amount)}</b> <span className="jo-dim">· {thDate(a.request_date)}</span>
                  {a.reason && <div className="jo-dim">{a.reason}</div>}
                  {a.status === "paid" && a.period && <div className="jo-dim">{L("หักในรอบ", "နုတ်ယူသည့်လ")} {a.period}</div>}
                  {a.decide_note && <div className="jo-dim">{L("หมายเหตุ", "မှတ်ချက်")}: {a.decide_note}</div>}</div>
                <div className="hr-leave-act">
                  <span className={"job-badge " + b.cls}>{L(b.th, b.my)}</span>
                  {a.status === "pending" && <button className="btn-ghost sm" onClick={async () => { try { await cancelMyAdvance(a.id); flash(L("ยกเลิกคำขอแล้ว", "တောင်းဆိုမှု ပယ်ဖျက်ပြီး")); load(); } catch (e) { flash((e.message || e), true); } }}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>}
                </div>
              </div>
            ); })}
          </div>
        </div>
      </div>

      {/* signature toggle — only for staff who already have an uploaded signature (HR uploads it) */}
      {me?.signature_url && (
        <div className="card">
          <div className="sec-head"><div><div className="sec-title">{L("ลายเซ็นในเอกสาร", "စာရွက်တွင် လက်မှတ်")}</div>
            <div className="sec-sub">{L("เปิดสวิตช์เพื่อใส่ลายเซ็นของคุณในเอกสารที่คุณออก (ปิดได้ตลอด)", "ဖွင့်လျှင် သင်ထုတ်သော စာရွက်တွင် လက်မှတ်ပါမည်")}</div></div></div>
          <SignatureToggle me={me} L={L} />
        </div>
      )}

      {/* สรุปเงินเดือนของฉัน — พนักงานเห็นรายละเอียดของตัวเองแบบเดียวกับที่ HR เห็น */}
      <div className="card">
        <div className="sec-head"><div><div className="sec-title">🧾 {L("เงินเดือนของฉัน (ละเอียด)", "ကျွန်ုပ်၏ လစာ (အသေးစိတ်)")}</div>
          <div className="sec-sub">{L("เข้างาน · ขาด · ลา · มาสาย · OT · ค่าวันหยุด · เบิกล่วงหน้า — แจกแจงรายวันเหมือนสลิปเงินเดือน (รอบตัดวันที่ 25)", "အလုပ်တက် · ပျက် · ခွင့် · နောက်ကျ · OT · လစာ အသေးစိတ်")}</div></div></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input className="inp" type="month" value={payYm} onChange={(e) => setPayYm(e.target.value)} style={{ width: 170 }} />
          <button className="btn-primary sm" disabled={payBusy} onClick={openMyPay}>{payBusy ? L("กำลังคำนวณ…", "တွက်နေသည်…") : "🔍 " + L("ดูรายละเอียดรอบนี้", "ဒီလ အသေးစိတ်ကြည့်ရန်")}</button>
        </div>
        <p className="page-sub" style={{ marginBottom: 0 }}>{L("ตัวเลขคิดจากข้อมูลเข้างาน/ลา/เบิกของคุณเองแบบสด ๆ — ยอดจ่ายจริงยึดตามสลิปที่ HR ส่งให้ตอนจ่าย", "အတည်ပြု လစာမှာ HR ပေးပို့သော စလစ်အတိုင်း ဖြစ်သည်")}</p>
      </div>

      {/* recent attendance */}
      <div className="card">
        <div className="sec-head"><div><div className="sec-title">{L("ประวัติเข้างาน 30 วันล่าสุด", "နောက်ဆုံး ၃၀ ရက် အလုပ်တက်မှတ်တမ်း")}</div></div></div>
        <div className="set-list">
          {recent.length === 0 && <div className="empty sm">{L("ยังไม่มีบันทึก", "မှတ်တမ်း မရှိသေးပါ")}</div>}
          {recent.map((a) => { const s = dayStat(a, settings); return (
            <div className="att-hist" key={a.id}>
              <span className="att-hist-d">{thDate(a.work_date)}</span>
              <span>{L("เข้า", "ဝင်")} <b>{fmtTime(a.check_in_at)}</b> {s.isLate && <span className="att-tag late sm">{L("สาย", "နောက်ကျ")} {fmtMin(s.lateMin)}</span>}</span>
              <span>{L("ออก", "ထွက်")} <b>{fmtTime(a.check_out_at)}</b> {s.otMin > 0 && <span className="att-tag ot sm">OT {fmtMin(s.otMin)}</span>}</span>
            </div>
          ); })}
        </div>
      </div>

      {payDetail && <PayDetailModal {...payDetail} lang={lang} onClose={() => setPayDetail(null)} />}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// signature is uploaded by HR; here the staff only chooses whether to print it on their documents.
function SignatureToggle({ me, L }) {
  const [on, setOn] = React.useState(() => { try { return localStorage.getItem("amc_sign_on") === "1"; } catch { return false; } });
  const toggle = (v) => { setOn(v); try { v ? localStorage.setItem("amc_sign_on", "1") : localStorage.removeItem("amc_sign_on"); } catch (_) {} };
  return (
    <div className="sigpad">
      <div className="sig-saved"><span className="sig-saved-l">{L("ลายเซ็นของคุณ", "သင့်လက်မှတ်")}:</span><img src={me.signature_url} alt="" /></div>
      <label className="sig-toggle"><input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} /> {L("ใส่ลายเซ็นในเอกสารที่ฉันออก (เปิด/ปิดได้)", "ကျွန်ုပ်ထုတ်သော စာရွက်တွင် လက်မှတ်ထည့်ရန်")}</label>
    </div>
  );
}

function AdvanceForm({ onDone, flash, L }) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    const amt = Number(amount) || 0;
    if (amt <= 0) return flash(L("กรอกจำนวนเงินที่ต้องการเบิก", "ထုတ်ယူမည့်ပမာဏ ဖြည့်ပါ"), true);
    setBusy(true);
    try { await submitAdvance({ amount: amt, reason }); setAmount(""); setReason(""); onDone(L("ส่งคำขอเบิกแล้ว รออนุมัติ ✓", "ကြိုတင်ထုတ် တောင်းဆိုပြီး · အတည်ပြုရန် စောင့်ဆိုင်း ✓")); }
    catch (e) { flash(L("ส่งคำขอไม่สำเร็จ: ", "တောင်းဆို၍ မရပါ: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="att-leaveform">
      <label className="fld"><span>{L("จำนวนเงินที่ขอเบิก (บาท)", "ထုတ်ယူလိုသည့်ပမာဏ (ဘတ်)")}</span>
        <span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></span></label>
      <label className="fld"><span>{L("เหตุผล", "အကြောင်းပြချက်")}</span><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L("เช่น ค่ารักษา / เหตุฉุกเฉิน", "ဥပမာ - ဆေးကုသစရိတ် / အရေးပေါ်")} /></label>
      <button className="btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={submit}>{L("ส่งคำขอเบิก", "တောင်းဆိုရန်")}</button>
    </div>
  );
}

function LeaveForm({ pattern, satGroup, holidays, onDone, flash, L, lvType }) {
  const [type, setType] = React.useState("vacation");
  const [start, setStart] = React.useState(todayYmd());
  const [end, setEnd] = React.useState(todayYmd());
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // ลาราย ชม. (mig 141): เลือกวันเดียว + ช่วงเวลา — คิดโควตา/หักเงินเป็นเศษวัน (8 ชม. = 1 วัน)
  const [mode, setMode] = React.useState("day");   // day | hour
  const [tFrom, setTFrom] = React.useState("08:00");
  const [tTo, setTTo] = React.useState("12:00");
  const hours = mode === "hour" ? Math.max(0, Math.round(((minutesOf(tTo) ?? 0) - (minutesOf(tFrom) ?? 0)) / 30) / 2) : 0; // ปัดเป็นครึ่งชั่วโมง
  const days = mode === "hour"
    ? Math.round(hours / LEAVE_HOURS_PER_DAY * 100) / 100
    : ((start && end && end >= start) ? leaveDays(start, end, pattern, satGroup, holidays) : 0);
  async function submit() {
    if (mode === "hour") {
      if (!start) return flash(L("เลือกวันที่ลา", "ခွင့်ရက် ရွေးပါ"), true);
      if (hours <= 0) return flash(L("ช่วงเวลาไม่ถูกต้อง (เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม)", "အချိန် မမှန်ပါ"), true);
    } else if (!start || !end || end < start) return flash("เลือกช่วงวันที่ให้ถูกต้อง", true);
    setBusy(true);
    try {
      await submitLeave({ type, start_date: start, end_date: mode === "hour" ? start : end, days,
        reason, hours: mode === "hour" ? hours : null, time_from: mode === "hour" ? tFrom : null, time_to: mode === "hour" ? tTo : null });
      setReason(""); onDone(L("ส่งใบลาแล้ว รออนุมัติ ✓", "ခွင့်လျှောက်လွှာ ပို့ပြီး · အတည်ပြုရန် စောင့်ဆိုင်း ✓"));
    }
    catch (e) { flash(L("ส่งใบลาไม่สำเร็จ: ", "ခွင့်လျှောက်၍ မရပါ: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="att-leaveform">
      <div className="fld-row">
        <label className="fld"><span>{L("ประเภท", "အမျိုးအစား")}</span>
          <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t.id} value={t.id}>{lvType ? lvType(t.id) : t.label}</option>)}</select></label>
        <label className="fld"><span>{L("ช่วงการลา", "ခွင့်ပုံစံ")}</span>
          <select className="inp" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="day">{L("เต็มวัน", "တစ်နေ့လုံး")}</option>
            <option value="hour">{L("ราย ชม.", "နာရီအလိုက်")}</option>
          </select></label>
        <label className="fld"><span>{L("จำนวน", "အရေအတွက်")}</span><div className="inp" style={{ display: "flex", alignItems: "center", fontWeight: 700, whiteSpace: "nowrap" }}>
          {mode === "hour" ? `${hours} ${L("ชม.", "နာရီ")} (${days} ${L("วัน", "ရက်")})` : `${days} ${L("วัน", "ရက်")}`}</div></label>
      </div>
      {mode === "hour" && (
        <div className="fld-row">
          <label className="fld"><span>{L("วันที่ลา", "ခွင့်ရက်")}</span><input className="inp" type="date" value={start} onChange={(e) => { setStart(e.target.value); setEnd(e.target.value); }} /></label>
          <label className="fld"><span>{L("ตั้งแต่เวลา", "စချိန်")}</span><input className="inp" type="time" value={tFrom} onChange={(e) => setTFrom(e.target.value)} /></label>
          <label className="fld"><span>{L("ถึงเวลา", "ဆုံးချိန်")}</span><input className="inp" type="time" value={tTo} onChange={(e) => setTTo(e.target.value)} /></label>
        </div>
      )}
      {mode !== "hour" && <div className="fld-row">
        <label className="fld"><span>{L("ตั้งแต่", "မှ")}</span><input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="fld"><span>{L("ถึง", "အထိ")}</span><input className="inp" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>}
      <label className="fld"><span>{L("เหตุผล", "အကြောင်းပြချက်")}</span><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L("เช่น ไปธุระ / ป่วย", "ဥပမာ - ကိစ္စရှိ / ဖျားနာ")} /></label>
      <button className="btn-primary" disabled={busy || (mode === "hour" ? hours <= 0 : days < 1)} onClick={submit}>{L("ส่งใบลา", "ခွင့်တင်ရန်")}</button>
    </div>
  );
}
