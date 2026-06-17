import React from "react";
import { myAttendanceToday, checkIn, checkOut, listMyAttendance, listMyLeaves, submitLeave, getHrSettings, listHolidays, uploadAttendancePhoto } from "../lib/api";
import { DEFAULT_HR_SETTINGS, dayStat, fmtMin, fmtTime, isWorkday, leaveDays, leaveLabel, LEAVE_TYPES, hrYmd, hrParseYmd, todayYmd } from "../lib/hr";
import { UIcon } from "../icons";

const LV_BADGE = { pending: { th: "รออนุมัติ", cls: "b-amber" }, approved: { th: "อนุมัติ", cls: "b-green" }, rejected: { th: "ไม่อนุมัติ", cls: "b-red" } };
const thDate = (s) => hrParseYmd(s).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });

function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}), { enableHighAccuracy: true, timeout: 8000 });
  });
}

export default function Attendance({ me }) {
  const [today, setToday] = React.useState(undefined); // undefined=loading
  const [settings, setSettings] = React.useState(DEFAULT_HR_SETTINGS);
  const [recent, setRecent] = React.useState([]);
  const [leaves, setLeaves] = React.useState([]);
  const [holidays, setHolidays] = React.useState(new Set());
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const fileRef = React.useRef(null);
  const actionRef = React.useRef(null); // "in" | "out"

  const pattern = me?.work_pattern || "mon_sat";
  const satGroup = me?.sat_group || null;

  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  async function load() {
    try {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const [t, s, r, lv, hol] = await Promise.all([myAttendanceToday(), getHrSettings(), listMyAttendance(hrYmd(since)), listMyLeaves(), listHolidays()]);
      setToday(t); setSettings(s || DEFAULT_HR_SETTINGS); setRecent(r); setLeaves(lv); setHolidays(new Set((hol || []).map((h) => h.day)));
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
    } catch (err) { flash((err.message || err), true); }
    setBusy(false);
  }
  function trigger(action) { actionRef.current = action; fileRef.current && fileRef.current.click(); }

  const st = today ? dayStat(today, settings) : null;
  const mustWorkToday = isWorkday(todayYmd(), pattern, satGroup, holidays);

  // leave balance: quota (settings) minus approved days this year, per type
  const year = new Date().getFullYear();
  const usedByType = {};
  leaves.filter((l) => l.status === "approved" && String(l.start_date).startsWith(String(year))).forEach((l) => { usedByType[l.type] = (usedByType[l.type] || 0) + Number(l.days || 0); });
  const quota = (settings && settings.quota) || DEFAULT_HR_SETTINGS.quota;

  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">เข้างาน / ลา <span className="page-title-en">Attendance</span></h1>
        <p className="page-sub">เวลาทำงาน {settings.start}–{settings.end} น. · {mustWorkToday ? "วันนี้เป็นวันทำงาน" : "วันนี้เป็นวันหยุดของคุณ"}</p></div></div>

      <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onPhoto} />

      {/* check-in / check-out card */}
      <div className="card att-clock">
        {today === undefined ? <div className="empty">กำลังโหลด…</div> : (
          <>
            <div className="att-now">
              <div className="att-now-l"><span>เข้างาน</span><b>{today?.check_in_at ? fmtTime(today.check_in_at) : "—"}</b>
                {st?.checkedIn && (st.isLate ? <span className="att-tag late">สาย {fmtMin(st.lateMin)}</span> : <span className="att-tag ok">ตรงเวลา</span>)}</div>
              <div className="att-now-l"><span>ออกงาน</span><b>{today?.check_out_at ? fmtTime(today.check_out_at) : "—"}</b>
                {st?.checkedOut && st.otMin > 0 && <span className="att-tag ot">OT {fmtMin(st.otMin)}</span>}
                {st?.checkedOut && st.earlyMin > 0 && <span className="att-tag late">ออกก่อน {fmtMin(st.earlyMin)}</span>}</div>
            </div>
            <div className="att-actions">
              {!today?.check_in_at && <button className="btn-primary att-big" disabled={busy} onClick={() => trigger("in")}>📸 เช็คอินเข้างาน</button>}
              {today?.check_in_at && !today?.check_out_at && <button className="btn-primary att-big ok" disabled={busy} onClick={() => trigger("out")}>📸 เช็คเอาท์ออกงาน</button>}
              {today?.check_in_at && today?.check_out_at && <div className="att-done">✅ บันทึกเวลาวันนี้ครบแล้ว</div>}
            </div>
            <p className="page-sub" style={{ margin: 0 }}>ระบบจะถ่ายเซลฟี่ + บันทึกพิกัด GPS ตอนเช็คอิน/เอาท์</p>
          </>
        )}
      </div>

      {/* leave balance + request */}
      <div className="damage-layout">
        <div className="card">
          <div className="sec-head"><div><div className="sec-title">วันลาคงเหลือ (ปี {year + 543})</div></div></div>
          <div className="att-bal">
            {LEAVE_TYPES.map((t) => { const q = quota[t.id] ?? 0, used = usedByType[t.id] || 0; return (
              <div className="att-bal-item" key={t.id}><span>{t.label}</span><b>{Math.max(0, q - used)}</b><small>/ {q} วัน</small></div>
            ); })}
          </div>
          <LeaveForm pattern={pattern} satGroup={satGroup} holidays={holidays} onDone={(m) => { flash(m); load(); }} flash={flash} />
        </div>

        <div className="card">
          <div className="sec-head"><div><div className="sec-title">ใบลาของฉัน</div></div></div>
          <div className="set-list">
            {leaves.length === 0 && <div className="empty sm">ยังไม่มีใบลา</div>}
            {leaves.map((l) => { const b = LV_BADGE[l.status] || LV_BADGE.pending; return (
              <div className="att-leave-row" key={l.id}>
                <div><b>{leaveLabel(l.type)}</b> · {thDate(l.start_date)}{l.end_date !== l.start_date ? ` – ${thDate(l.end_date)}` : ""} <span className="att-days">{l.days} วัน</span>
                  {l.reason && <div className="jo-dim">{l.reason}</div>}</div>
                <span className={"job-badge " + b.cls}>{b.th}</span>
              </div>
            ); })}
          </div>
        </div>
      </div>

      {/* recent attendance */}
      <div className="card">
        <div className="sec-head"><div><div className="sec-title">ประวัติเข้างาน 30 วันล่าสุด</div></div></div>
        <div className="set-list">
          {recent.length === 0 && <div className="empty sm">ยังไม่มีบันทึก</div>}
          {recent.map((a) => { const s = dayStat(a, settings); return (
            <div className="att-hist" key={a.id}>
              <span className="att-hist-d">{thDate(a.work_date)}</span>
              <span>เข้า <b>{fmtTime(a.check_in_at)}</b> {s.isLate && <span className="att-tag late sm">สาย {fmtMin(s.lateMin)}</span>}</span>
              <span>ออก <b>{fmtTime(a.check_out_at)}</b> {s.otMin > 0 && <span className="att-tag ot sm">OT {fmtMin(s.otMin)}</span>}</span>
            </div>
          ); })}
        </div>
      </div>

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function LeaveForm({ pattern, satGroup, holidays, onDone, flash }) {
  const [type, setType] = React.useState("vacation");
  const [start, setStart] = React.useState(todayYmd());
  const [end, setEnd] = React.useState(todayYmd());
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const days = (start && end && end >= start) ? leaveDays(start, end, pattern, satGroup, holidays) : 0;
  async function submit() {
    if (!start || !end || end < start) return flash("เลือกช่วงวันที่ให้ถูกต้อง", true);
    setBusy(true);
    try { await submitLeave({ type, start_date: start, end_date: end, days, reason }); setReason(""); onDone("ส่งใบลาแล้ว รออนุมัติ ✓"); }
    catch (e) { flash("ส่งใบลาไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="att-leaveform">
      <div className="fld-row">
        <label className="fld"><span>ประเภท</span>
          <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label className="fld"><span>จำนวน (วันทำงาน)</span><div className="inp" style={{ display: "flex", alignItems: "center", fontWeight: 700 }}>{days} วัน</div></label>
      </div>
      <div className="fld-row">
        <label className="fld"><span>ตั้งแต่</span><input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="fld"><span>ถึง</span><input className="inp" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label className="fld"><span>เหตุผล</span><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ไปธุระ / ป่วย" /></label>
      <button className="btn-primary" disabled={busy || days < 1} onClick={submit}>ส่งใบลา</button>
    </div>
  );
}
