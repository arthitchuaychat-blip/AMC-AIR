import React from "react";
import { listJobOrders, listTeams, listCalendarEvents, saveCalendarEvent, deleteCalendarEvent } from "../lib/api";
import { UIcon } from "../icons";
import { BUCKETS, slotDef, slotBucket, jobDays, ymd, parseYmd, thDayMon, thDow, thMonthYear, scheduleLabel, jobTypeDef, JOB_STATUSES, jobStatusDef } from "../lib/schedule";
import JobTimeline, { Linkify } from "./JobTimeline";
import AttachThumb from "./AttachThumb";
import { can } from "../lib/permissions";

const VIEWS = [["list", "รายการ"], ["day", "วัน"], ["week", "สัปดาห์"], ["month", "เดือน"]];
const STATUS = Object.fromEntries(JOB_STATUSES.map(([v, l]) => [v, l]));
const STATUS_FILTERS = [["all", "ทุกสถานะ"], ["scheduled", "นัดแล้ว"], ["in_progress", "กำลังทำ"], ["awaiting_approval", "รออนุมัติ"], ["reschedule", "นัดหมายเพิ่ม"], ["done", "เสร็จ"]];
const matchStatus = (st, f) => f === "all" || (f === "scheduled" ? (st === "scheduled" || st === "pending") : st === f);
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// Monday-based start of the week containing d
const weekStart = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); };

export default function Schedule({ role, team, me, onOpenJob, onNewJob }) {
  const canEdit = can(role, "schedule", "edit");
  const myTeamOnly = role === "tech" || role === "assistant"; // ช่าง/ผู้ช่วยช่างเห็นเฉพาะทีมตัวเอง · หัวหน้าช่าง/ออฟฟิศเห็นทุกทีม
  const [view, setView] = React.useState("day");   // เปิดมาโฟกัส "วันนี้" เสมอ (เปลี่ยนเป็นสัปดาห์/เดือนได้)
  const [anchor, setAnchor] = React.useState(today0());
  const [teamF, setTeamF] = React.useState("all");
  const [statusF, setStatusF] = React.useState("all");
  const [jobs, setJobs] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [detail, setDetail] = React.useState(null); // job/visit entry shown in the popup
  const [gcal, setGcal] = React.useState(false); // Google Calendar subscribe panel
  const [events, setEvents] = React.useState([]);   // นัดหมายอิสระ (calendar_events)
  const [evtEdit, setEvtEdit] = React.useState(null); // { ...event } หรือ {} (สร้างใหม่) → เปิด modal

  React.useEffect(() => { (async () => {
    setLoading(true);
    try {
      const [j, t, ev] = await Promise.all([listJobOrders(role === "tech" || role === "assistant" || role === "lead_tech" ? { fieldOnly: true, team: role === "lead_tech" ? null : team } : {}), listTeams(), listCalendarEvents().catch(() => [])]);
      setJobs(j); setTeams(t); setEvents(ev);
    }
    catch (e) { console.error(e); }
    setLoading(false);
  })(); }, []);
  async function reloadEvents() { try { setEvents(await listCalendarEvents()); } catch { /* noop */ } }
  const openEntry = (j) => { if (j._event) setEvtEdit(j._event); else setDetail(j); };

  const teamColor = (id) => teams.find((t) => t.id === id)?.color || "#94a3b8";
  const teamName = (id) => teams.find((t) => t.id === id)?.name?.replace("Team ", "") || "—";
  const shownTeams = teamF === "all" ? teams : teams.filter((t) => t.id === teamF);

  // flatten each job into one entry per visit (rอบ): carries the job's display fields
  // + that visit's schedule/team, so the whole calendar works per-visit
  const entries = React.useMemo(() => {
    const out = [];
    jobs.forEach((j) => {
      if (j.status === "cancelled") return;
      const vs = (j.visits && j.visits.length)
        ? j.visits
        : (j.scheduled_at ? [{ id: "legacy", assigned_team: j.assigned_team, scheduled_at: j.scheduled_at, end_date: j.end_date, slot: j.slot, status: j.status }] : []);
      vs.forEach((v) => {
        if (v.status === "cancelled" || !v.scheduled_at) return;
        out.push({ ...j, _key: j.job_no + "#" + (v.id ?? "x"), assigned_team: v.assigned_team, scheduled_at: v.scheduled_at, end_date: v.end_date, slot: v.slot, status: v.status });
      });
    });
    // นัดหมายอิสระ (ไม่ผูกใบงาน) — เข้า flow เดียวกัน
    events.forEach((ev) => {
      if (!ev.start_at) return;
      const sd = ymd(new Date(ev.start_at));
      const ed = ev.end_at ? ymd(new Date(ev.end_at)) : null;
      out.push({
        _key: "evt#" + ev.id, _event: ev, job_no: null, job_type: "other", status: "scheduled",
        assigned_team: ev.team || null, scheduled_at: ev.start_at, end_date: (ed && ed > sd) ? ed : null,
        slot: ev.slot || "custom", customerName: "📌 " + (ev.title || "นัดหมาย"), title: null,
      });
    });
    return out;
  }, [jobs, events]);

  // index visit-entries by day (yyyy-mm-dd), respecting the team filter
  const byDay = React.useMemo(() => {
    const m = {};
    entries.filter((e) => e._event || ((myTeamOnly ? e.assigned_team === team : (teamF === "all" || e.assigned_team === teamF)) && matchStatus(e.status, statusF)))
      .forEach((e) => { jobDays(e).forEach((d) => { (m[d] = m[d] || []).push(e); }); });
    return m;
  }, [entries, teamF, statusF, myTeamOnly, team]);

  // which buckets each team has occupied on a given day (full blocks both half-day slots)
  function occupancy(dayKey) {
    const occ = {};
    (byDay[dayKey] || []).forEach((j) => {
      const set = occ[j.assigned_team] || (occ[j.assigned_team] = new Set());
      const b = slotBucket(j);
      if (b === "full") { set.add("full"); set.add("morning"); set.add("afternoon"); } else set.add(b);
    });
    return occ;
  }
  // teams (filtered, assigned only) that are free for a bucket on a day
  function freeTeams(dayKey, bucket) {
    const occ = occupancy(dayKey);
    return shownTeams.filter((t) => !(occ[t.id]?.has(bucket)));
  }

  function move(dir) {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week" || view === "list") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => { const x = new Date(a); x.setMonth(x.getMonth() + dir); return x; });
  }
  const goNew = (date, slot, team) => { if (canEdit && onNewJob) onNewJob({ date, slot, assigned_team: team || "" }); };

  const title = view === "month" ? thMonthYear(anchor)
    : view === "week" ? `${thDayMon(weekStart(anchor))} – ${thDayMon(addDays(weekStart(anchor), 6))}`
    : `${thDow(anchor)} ${thDayMon(anchor)}`;

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ปฏิทินงาน <span className="page-title-en">Schedule</span></h1>
          <p className="page-sub">ตารางงานช่าง · ดูสล็อตว่าง · วางคิวงาน</p></div>
        <div className="cat-head-actions">
          <div className="seg">{VIEWS.map(([v, l]) => (
            <button key={v} className={"seg-btn" + (view === v ? " on" : "")} onClick={() => setView(v)}>{l}</button>
          ))}</div>
          {canEdit && <button className="btn-primary sm" onClick={() => setEvtEdit({ _new: true, start_ymd: ymd(anchor) })} title="สร้างนัดหมายอิสระ (ไม่ต้องผูกใบงาน)">📌 นัดหมาย</button>}
          {canEdit && <button className="btn-ghost sm" onClick={() => setGcal(true)} title="ซิงค์ตารางงานเข้า Google Calendar"><UIcon name="calendar" size={15} /> Google ปฏิทิน</button>}
        </div>
      </div>

      <div className="sched-bar">
        <div className="sched-nav">
          <button className="btn-ghost sm" onClick={() => move(-1)}><UIcon name="chevR" size={15} style={{ transform: "rotate(180deg)" }} /></button>
          <button className="btn-ghost sm" onClick={() => setAnchor(today0())}>วันนี้</button>
          <button className="btn-ghost sm" onClick={() => { setAnchor(addDays(today0(), 1)); setView("day"); }}>พรุ่งนี้</button>
          <button className="btn-ghost sm" onClick={() => move(1)}><UIcon name="chevR" size={15} /></button>
          <div className="sched-title">{title}</div>
        </div>
        {!myTeamOnly && (
          <div className="cat-filter sched-teams">
            <button className={"cat-chip" + (teamF === "all" ? " on" : "")} onClick={() => setTeamF("all")}
              style={teamF === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกทีม</button>
            {teams.map((t) => (
              <button key={t.id} className={"cat-chip" + (teamF === t.id ? " on" : "")} onClick={() => setTeamF(t.id)}
                style={teamF === t.id ? { background: t.color, color: "#fff", borderColor: t.color } : {}}>
                <span style={{ width: 8, height: 8, borderRadius: 9, background: teamF === t.id ? "#fff" : t.color, display: "inline-block", marginRight: 5 }} />{t.name.replace("Team ", "")}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cat-filter sched-teams" style={{ marginTop: -4 }}>
        {STATUS_FILTERS.map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>

      {loading ? <div className="empty">กำลังโหลด…</div> : (
        view === "list" ? <AgendaView /> : view === "week" ? <WeekView /> : view === "day" ? <DayView /> : <MonthView />
      )}

      {detail && <JobDetailModal job={detail} onClose={() => setDetail(null)} />}
      {evtEdit && <EventModal ev={evtEdit} teams={teams} canEdit={canEdit} onClose={() => setEvtEdit(null)} onSaved={() => { setEvtEdit(null); reloadEvents(); }} />}
      {gcal && <GoogleCalModal teams={teams} currentTeam={teamF !== "all" ? teams.find((t) => t.id === teamF) : null} onClose={() => setGcal(false)} />}
    </div>
  );

  // ---------- JOB POP-UP (ดูงาน + ความเคลื่อนไหว โดยไม่ต้องเด้งไปหน้างานของฉัน) ----------
  function JobDetailModal({ job: j, onClose }) {
    const st = jobStatusDef(j.status);
    const readOnly = ["reschedule", "done", "cancelled"].includes(j.status);
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal sched-detail" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div className="modal-title">
              {jobTypeDef(j.job_type)[2]} {j.title || j.customerName || "งาน"}
              <span>{j.job_no}</span>
            </div>
            <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button>
          </div>
          <div className="modal-body">
            <div className="sd-badges">
              <span className={"job-badge " + st[2]}>{st[1]}</span>
              {j.assigned_team && <span className="myjob-team">ทีม {teamName(j.assigned_team)}</span>}
            </div>

            <div className="sd-when">🗓 {scheduleLabel({ scheduled_at: j.scheduled_at, end_date: j.end_date, slot: j.slot })}</div>

            {j.customerName && <div className="myjob-row"><span>🏢</span> <span style={{ flex: 1 }}>{j.customerName}</span></div>}
            {j.contact_name && <div className="myjob-row"><UIcon name="user" size={15} color="var(--ink-3)" /> {j.contact_name}
              {j.contact_phone && <a href={`tel:${j.contact_phone}`} className="myjob-call">📞 {j.contact_phone}</a>}</div>}
            {!j.contact_name && j.contact_phone && <div className="myjob-row"><span>📞</span> <a href={`tel:${j.contact_phone}`} className="myjob-call">{j.contact_phone}</a></div>}
            {j.address && <div className="myjob-row"><span>📍</span> <span style={{ flex: 1 }}>{j.address}</span>
              {j.map_url && <a href={j.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm">แผนที่</a>}</div>}
            {j.details && <div className="myjob-details">{j.details}</div>}

            {(j.sales_note || (j.sales_photos && j.sales_photos.length > 0)) && (
              <div className="myjob-brief">
                <div className="myjob-brief-title">📋 บรีฟจากฝ่ายขาย</div>
                {j.sales_note && <div className="myjob-brief-note"><Linkify text={j.sales_note} /></div>}
                {j.sales_photos && j.sales_photos.length > 0 && (
                  <div className="tl-photos">{j.sales_photos.map((u, i) => <AttachThumb key={i} url={u} />)}</div>
                )}
              </div>
            )}

            {typeof onOpenJob === "function" && (
              <button className="btn-ghost sd-full" onClick={() => { onClose(); onOpenJob(j.job_no); }}>เปิดใบงานเต็ม →</button>
            )}

            {j.status !== "cancelled" && <JobTimeline jobNo={j.job_no} groupNo={j.group_no || j.job_no} linked={!!j.group_no} canPost={!readOnly} author={me} />}
          </div>
        </div>
      </div>
    );
  }

  // ---------- LIST / AGENDA (Google-calendar style) ----------
  function AgendaView() {
    const from = ymd(weekStart(anchor)); // จากต้นสัปดาห์ที่เลือก เป็นต้นไป
    const days = Object.keys(byDay).filter((d) => d >= from).sort();
    const todayKey = ymd(today0());
    if (!days.length) return <div className="empty">ไม่มีงานในช่วงนี้</div>;
    return (
      <div className="sched-agenda">
        {days.map((d) => {
          const dt = parseYmd(d);
          const items = byDay[d].slice().sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""));
          return (
            <div className="agenda-day" key={d}>
              <div className={"agenda-date" + (d === todayKey ? " today" : "")}>
                <b>{thDow(dt)} {dt.getDate()}</b><span>{thDayMon(dt)}{d === todayKey ? " · วันนี้" : ""}</span>
              </div>
              <div className="agenda-items">
                {items.map((j) => {
                  const c = teamColor(j.assigned_team); const sd = slotDef(j.slot);
                  const slotTxt = (!j.slot || j.slot === "custom")
                    ? new Date(j.scheduled_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น."
                    : (sd ? (sd.time || sd.th) : "");
                  return (
                    <button className={"agenda-row" + (j.status === "done" ? " sc-done" : "")} key={j._key} onClick={() => openEntry(j)} style={{ borderLeftColor: c }}>
                      <span className="agenda-slot">{slotTxt}</span>
                      <span className="agenda-meta"><span style={{ width: 8, height: 8, borderRadius: 9, background: c, display: "inline-block", marginRight: 5 }} />{teamName(j.assigned_team)} · <b style={{ color: c }}>{STATUS[j.status] || ""}</b></span>
                      <span className="agenda-main">{jobTypeDef(j.job_type)[2]} {[j.customerName, j.title].filter(Boolean).join(" · ") || "งาน"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- a single job chip ----------
  function Chip({ j, big }) {
    const c = teamColor(j.assigned_team);
    const full = slotBucket(j) === "full";
    const multi = jobDays(j).length > 1;
    return (
      <button className={"sched-chip" + (big ? " big" : "") + (full ? " full" : "") + (j.status === "done" ? " sc-done" : "")} onClick={() => openEntry(j)}
        style={{ background: c, borderColor: c }} title={`${j.job_no} · ${scheduleLabel(j)} · ${STATUS[j.status] || ""}`}>
        <span className="sc-team">{jobTypeDef(j.job_type)[2]} {teamName(j.assigned_team)}{j.status === "in_progress" ? " ●" : j.status === "done" ? " ✓" : j.status === "awaiting_approval" ? " ⏳" : j.status === "reschedule" ? " ↻" : ""}</span>
        <span className="sc-title">{[j.customerName, j.title].filter(Boolean).join(" · ") || "งาน"}</span>
        {multi && <span className="sc-badge">หลายวัน</span>}
      </button>
    );
  }
  function FreeChips({ dayKey, bucket }) {
    const free = freeTeams(dayKey, bucket);
    if (!free.length) return canEdit ? <button className="sched-free all" onClick={() => goNew(dayKey, bucket)}>+ จองคิว</button> : null;
    return (
      <div className="sched-free-wrap">
        {free.map((t) => (
          <button key={t.id} className="sched-free" disabled={!canEdit} onClick={() => goNew(dayKey, bucket, t.id)}
            style={{ borderColor: t.color, color: t.color }}>ว่าง · {t.name.replace("Team ", "")}</button>
        ))}
      </div>
    );
  }

  // ---------- WEEK ----------
  function WeekView() {
    const start = weekStart(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const todayKey = ymd(today0());
    return (
      <div className="sched-week">
        <div className="sw-grid" style={{ gridTemplateColumns: `64px repeat(7, 1fr)` }}>
          <div className="sw-corner" />
          {days.map((d) => {
            const k = ymd(d);
            return <div key={k} className={"sw-dayhead" + (k === todayKey ? " today" : "")}>
              <span className="sw-dow">{thDow(d)}</span><span className="sw-date">{d.getDate()}</span>
            </div>;
          })}
          {BUCKETS.map((b) => (
            <React.Fragment key={b.id}>
              <div className="sw-slotlbl"><b>{b.th}</b><small>{b.time}</small></div>
              {days.map((d) => {
                const k = ymd(d);
                const here = (byDay[k] || []).filter((j) => slotBucket(j) === b.id);
                return (
                  <div key={k + b.id} className={"sw-cell" + (k === todayKey ? " today" : "")}>
                    {here.map((j) => <Chip key={j._key} j={j} />)}
                    {canEdit && b.id !== "full" && <FreeChips dayKey={k} bucket={b.id} />}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // ---------- DAY ----------
  function DayView() {
    const k = ymd(anchor);
    return (
      <div className="sched-day">
        {BUCKETS.map((b) => {
          const here = (byDay[k] || []).filter((j) => slotBucket(j) === b.id);
          return (
            <div className="card sched-day-sec" key={b.id}>
              <div className="sds-head"><div className="sec-title">{b.th}</div><div className="sec-sub">{b.time}</div></div>
              <div className="sds-jobs">
                {here.length === 0 && <div className="sds-empty">— ว่าง —</div>}
                {here.map((j) => <Chip key={j._key} j={j} big />)}
              </div>
              {canEdit && b.id !== "full" && <div className="sds-free"><FreeChips dayKey={k} bucket={b.id} /></div>}
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- MONTH ----------
  function MonthView() {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = weekStart(first);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const todayKey = ymd(today0());
    const mo = anchor.getMonth();
    return (
      <div className="sched-month">
        <div className="sm-dows">{["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => <div key={d} className="sm-dow">{d}</div>)}</div>
        <div className="sm-grid">
          {cells.map((d) => {
            const k = ymd(d);
            const list = (byDay[k] || []);
            const out = d.getMonth() !== mo;
            return (
              <div key={k} className={"sm-cell" + (out ? " out" : "") + (k === todayKey ? " today" : "")}
                onClick={() => { setAnchor(new Date(d.getFullYear(), d.getMonth(), d.getDate())); setView("day"); }}>
                <div className="sm-date">{d.getDate()}</div>
                <div className="sm-jobs">
                  {list.slice(0, 3).map((j) => (
                    <span key={j._key} className="sm-job" style={{ background: teamColor(j.assigned_team) }}
                      title={`${teamName(j.assigned_team)} · ${j.title || j.customerName || "งาน"}`}
                      onClick={(e) => { e.stopPropagation(); openEntry(j); }}>
                      {jobTypeDef(j.job_type)[2]} {[j.customerName, j.title].filter(Boolean).join(" · ") || teamName(j.assigned_team)}
                    </span>
                  ))}
                  {list.length > 3 && <span className="sm-more">+{list.length - 3} เพิ่ม</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

// Google Calendar subscribe panel — build the secret feed URL the user pastes into Google Calendar
function GoogleCalModal({ teams, currentTeam, onClose }) {
  const [token, setToken] = React.useState(() => { try { return localStorage.getItem("amc_cal_token") || ""; } catch { return ""; } });
  const [copied, setCopied] = React.useState("");
  React.useEffect(() => { try { localStorage.setItem("amc_cal_token", token); } catch (_) {} }, [token]);
  const origin = (typeof window !== "undefined" && window.location.origin) || "https://amc-air.vercel.app";
  const base = token ? `${origin}/api/calendar?token=${encodeURIComponent(token)}` : "";
  const teamUrl = (id) => `${base}&team=${id}`;
  const copy = (url, key) => { navigator.clipboard?.writeText(url).then(() => { setCopied(key); setTimeout(() => setCopied(""), 1800); }).catch(() => {}); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 600 }}>
        <div className="modal-head"><div className="modal-title">เชื่อมตารางงานเข้า Google Calendar<span>subscribe แบบอ่านอย่างเดียว · อัปเดตเอง</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <ol className="gcal-steps">
            <li>ตั้งค่า Environment Variable <code>CALENDAR_FEED_TOKEN</code> ใน Vercel (ตั้งรหัสลับเองยาว ๆ เช่น <code>amc-cal-7h2k9</code>) แล้ว Redeploy</li>
            <li>วาง token เดียวกันลงช่องด้านล่าง</li>
            <li>คัดลอกลิงก์ → เปิด <b>Google Calendar</b> (เว็บ) → ข้าง “ปฏิทินอื่นๆ” กด <b>＋ → จาก URL</b> → วางลิงก์ → <b>เพิ่มปฏิทิน</b></li>
          </ol>
          <label className="fld"><span>CALENDAR_FEED_TOKEN (ตามที่ตั้งใน Vercel)</span>
            <input className="inp" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="วาง token ลับที่ตั้งไว้" /></label>

          {!token && <div className="empty sm" style={{ marginTop: 10 }}>ใส่ token ก่อน เพื่อสร้างลิงก์ subscribe</div>}
          {token && (
            <div className="gcal-links">
              <div className="gcal-link">
                <div><b>งานทุกทีม</b><div className="gcal-url">{base}</div></div>
                <button className="btn-ghost sm" onClick={() => copy(base, "all")}>{copied === "all" ? "คัดลอกแล้ว ✓" : "คัดลอก"}</button>
              </div>
              {currentTeam && (
                <div className="gcal-link">
                  <div><b>เฉพาะทีม {currentTeam.name.replace("Team ", "")}</b><div className="gcal-url">{teamUrl(currentTeam.id)}</div></div>
                  <button className="btn-ghost sm" onClick={() => copy(teamUrl(currentTeam.id), "cur")}>{copied === "cur" ? "คัดลอกแล้ว ✓" : "คัดลอก"}</button>
                </div>
              )}
              <details className="gcal-more">
                <summary>ลิงก์แยกแต่ละทีม (เผื่ออยากให้ช่างแต่ละทีม subscribe เฉพาะของตัวเอง)</summary>
                {teams.map((t) => (
                  <div className="gcal-link" key={t.id}>
                    <div><b>{t.name.replace("Team ", "")}</b><div className="gcal-url">{teamUrl(t.id)}</div></div>
                    <button className="btn-ghost sm" onClick={() => copy(teamUrl(t.id), t.id)}>{copied === t.id ? "✓" : "คัดลอก"}</button>
                  </div>
                ))}
              </details>
            </div>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>* เป็นการ “ติดตาม” แบบอ่านอย่างเดียว — แก้ใน Google จะไม่ย้อนกลับมาที่ระบบ · Google รีเฟรชฟีดเองทุก ~ไม่กี่ชั่วโมง</p>
        </div>
        <div className="modal-foot"><button className="btn-primary" onClick={onClose}>เสร็จ</button></div>
      </div>
    </div>
  );
}

// ── นัดหมายอิสระ (ไม่ผูกใบงาน) — สร้าง/แก้ไข/ลบ ──
function EventModal({ ev, teams, canEdit, onClose, onSaved }) {
  const isNew = !ev.id;
  const pad = (n) => String(n).padStart(2, "0");
  const startD = ev.start_at ? new Date(ev.start_at) : null;
  const endD = ev.end_at ? new Date(ev.end_at) : null;
  const toDate = (d) => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : (ev.start_ymd || "");
  const toTime = (d) => d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "09:00";
  const [title, setTitle] = React.useState(ev.title || "");
  const [date, setDate] = React.useState(toDate(startD));
  const [start, setStart] = React.useState(toTime(startD));
  const [end, setEnd] = React.useState(endD ? toTime(endD) : "");
  const [team, setTeam] = React.useState(ev.team || "");
  const [note, setNote] = React.useState(ev.note || "");
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!title.trim() || !date) return;
    setBusy(true);
    try {
      const start_at = new Date(`${date}T${start || "09:00"}`).toISOString();
      const end_at = end ? new Date(`${date}T${end}`).toISOString() : null;
      await saveCalendarEvent({ id: ev.id, title, start_at, end_at, slot: "custom", team: team || null, note });
      onSaved();
    } catch (e) { alert("บันทึกไม่สำเร็จ: " + (e.message || e)); setBusy(false); }
  }
  async function del() {
    if (!ev.id || !window.confirm("ลบนัดหมายนี้?")) return;
    setBusy(true);
    try { await deleteCalendarEvent(ev.id); onSaved(); } catch (e) { alert("ลบไม่สำเร็จ: " + (e.message || e)); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "94vw" }}>
        <div className="modal-head"><div className="modal-title">📌 {isNew ? "นัดหมายใหม่" : "แก้ไขนัดหมาย"}</div><button className="modal-x" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <label className="fld"><span>หัวข้อนัดหมาย</span><input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ประชุมทีม · นัดดูหน้างาน" disabled={!canEdit} /></label>
          <div className="fld-row3">
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEdit} /></label>
            <label className="fld"><span>เวลาเริ่ม</span><input className="inp" type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={!canEdit} /></label>
            <label className="fld"><span>ถึง (ไม่บังคับ)</span><input className="inp" type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!canEdit} /></label>
          </div>
          <label className="fld"><span>ทีม (ไม่บังคับ)</span>
            <select className="inp" value={team} onChange={(e) => setTeam(e.target.value)} disabled={!canEdit}>
              <option value="">— ไม่ระบุทีม —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="fld"><span>โน้ต</span><textarea className="inp" rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} /></label>
        </div>
        <div className="modal-foot">
          {!isNew && canEdit && <button className="btn-ghost danger" disabled={busy} onClick={del}>🗑 ลบ</button>}
          <button className="btn-ghost" onClick={onClose}>ปิด</button>
          {canEdit && <button className="btn-primary" disabled={busy || !title.trim() || !date} onClick={save}>{busy ? "…" : "บันทึก"}</button>}
        </div>
      </div>
    </div>
  );
}
