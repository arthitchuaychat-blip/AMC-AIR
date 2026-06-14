import React from "react";
import { listJobOrders, listTeams } from "../lib/api";
import { UIcon } from "../icons";
import { BUCKETS, slotBucket, jobDays, ymd, parseYmd, thDayMon, thDow, thMonthYear, scheduleLabel, jobTypeDef } from "../lib/schedule";

const STATUS = {
  pending: "รอจ่ายงาน", scheduled: "นัดแล้ว", in_progress: "กำลังทำ", done: "เสร็จ", cancelled: "ยกเลิก",
};
const VIEWS = [["day", "วัน"], ["week", "สัปดาห์"], ["month", "เดือน"]];
const STATUS_FILTERS = [["all", "ทุกสถานะ"], ["scheduled", "นัดแล้ว"], ["in_progress", "กำลังทำ"], ["done", "เสร็จ"]];
const matchStatus = (st, f) => f === "all" || (f === "scheduled" ? (st === "scheduled" || st === "pending") : st === f);
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// Monday-based start of the week containing d
const weekStart = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); };

export default function Schedule({ role, onOpenJob, onNewJob }) {
  const canEdit = ["admin", "sales", "exec", "finance"].includes(role);
  const [view, setView] = React.useState("week");
  const [anchor, setAnchor] = React.useState(today0());
  const [teamF, setTeamF] = React.useState("all");
  const [statusF, setStatusF] = React.useState("all");
  const [jobs, setJobs] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => { (async () => {
    setLoading(true);
    try { const [j, t] = await Promise.all([listJobOrders(), listTeams()]); setJobs(j); setTeams(t); }
    catch (e) { console.error(e); }
    setLoading(false);
  })(); }, []);

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
    return out;
  }, [jobs]);

  // index visit-entries by day (yyyy-mm-dd), respecting the team filter
  const byDay = React.useMemo(() => {
    const m = {};
    entries.filter((e) => (teamF === "all" || e.assigned_team === teamF) && matchStatus(e.status, statusF))
      .forEach((e) => { jobDays(e).forEach((d) => { (m[d] = m[d] || []).push(e); }); });
    return m;
  }, [entries, teamF, statusF]);

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
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
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
        </div>
      </div>

      <div className="sched-bar">
        <div className="sched-nav">
          <button className="btn-ghost sm" onClick={() => move(-1)}><UIcon name="chevR" size={15} style={{ transform: "rotate(180deg)" }} /></button>
          <button className="btn-ghost sm" onClick={() => setAnchor(today0())}>วันนี้</button>
          <button className="btn-ghost sm" onClick={() => move(1)}><UIcon name="chevR" size={15} /></button>
          <div className="sched-title">{title}</div>
        </div>
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
      </div>
      <div className="cat-filter sched-teams" style={{ marginTop: -4 }}>
        {STATUS_FILTERS.map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>

      {loading ? <div className="empty">กำลังโหลด…</div> : (
        view === "week" ? <WeekView /> : view === "day" ? <DayView /> : <MonthView />
      )}
    </div>
  );

  // ---------- a single job chip ----------
  function Chip({ j, big }) {
    const c = teamColor(j.assigned_team);
    const full = slotBucket(j) === "full";
    const multi = jobDays(j).length > 1;
    return (
      <button className={"sched-chip" + (big ? " big" : "") + (full ? " full" : "") + (j.status === "done" ? " sc-done" : "")} onClick={() => onOpenJob && onOpenJob(j.job_no)}
        style={{ background: c, borderColor: c }} title={`${j.job_no} · ${scheduleLabel(j)} · ${STATUS[j.status] || ""}`}>
        <span className="sc-team">{jobTypeDef(j.job_type)[2]} {teamName(j.assigned_team)}{j.status === "in_progress" ? " ●" : j.status === "done" ? " ✓" : ""}</span>
        <span className="sc-title">{j.title || j.customerName || "งาน"}</span>
        {big && j.customerName && j.title && <span className="sc-sub">{j.customerName}</span>}
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
                    {b.id !== "full" && <FreeChips dayKey={k} bucket={b.id} />}
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
              {b.id !== "full" && <div className="sds-free"><FreeChips dayKey={k} bucket={b.id} /></div>}
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
                      onClick={(e) => { e.stopPropagation(); onOpenJob && onOpenJob(j.job_no); }}>
                      {jobTypeDef(j.job_type)[2]} {j.title || j.customerName || teamName(j.assigned_team)}
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
