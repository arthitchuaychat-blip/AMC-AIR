import React from "react";

// Read-only availability overview across all permanent teams for the next N days.
// Lets office staff answer "คิวว่างวันไหน" instantly while chatting with a customer.
const DAYS = 14;
const pad = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoOf = (ts) => (ts ? isoLocal(new Date(ts)) : null);
const dShow = (ymd) => { const d = new Date(ymd + "T00:00:00"); return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" }); };

export default function TeamQueuePanel({ jobs, teams }) {
  // permanent teams first, then subcontractor teams (marked "ซัพ")
  const permTeams = [...(teams || [])].sort((a, b) => (a.type === "sub" ? 1 : 0) - (b.type === "sub" ? 1 : 0));
  // occ[teamId][date] = { morning:info, afternoon:info }
  const occ = {};
  const mark = (tid, date, slot, info) => {
    const t = occ[tid] || (occ[tid] = {});
    const o = t[date] || (t[date] = {});
    if (slot === "morning") o.morning = o.morning || info;
    else if (slot === "afternoon") o.afternoon = o.afternoon || info;
    else { o.morning = o.morning || info; o.afternoon = o.afternoon || info; }
  };
  (jobs || []).forEach((j) => {
    if (j.status === "cancelled") return;
    const vs = (j.visits && j.visits.length) ? j.visits : [{ assigned_team: j.assigned_team, scheduled_at: j.scheduled_at, end_date: j.end_date, slot: j.slot, status: j.status, visit_date: isoOf(j.scheduled_at) }];
    vs.forEach((v) => {
      const tid = v.assigned_team || j.assigned_team;
      if (!tid || v.status === "cancelled") return;
      const startYmd = v.visit_date || isoOf(v.scheduled_at);
      if (!startYmd) return;
      const endYmd = (v.end_date && v.end_date > startYmd) ? v.end_date : startYmd;
      const info = { job_no: j.job_no, customer: j.customerName };
      let d = new Date(startYmd + "T00:00:00"); const e = new Date(endYmd + "T00:00:00");
      while (d <= e) { mark(tid, isoLocal(d), v.slot, info); d.setDate(d.getDate() + 1); }
    });
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = []; for (let i = 0; i < DAYS; i++) { const d = new Date(today); d.setDate(d.getDate() + i); days.push(isoLocal(d)); }

  if (!permTeams.length) return <div className="tq-empty">ยังไม่มีทีมช่าง</div>;
  return (
    <div className="tq">
      <div className="tq-legend">🟢 ว่าง · 🔴 มีงาน · (เช้า 09–13 · บ่าย 13–17)</div>
      {days.map((d) => {
        const freeTeams = permTeams.filter((t) => { const o = occ[t.id]?.[d] || {}; return !o.morning || !o.afternoon; });
        return (
          <div className={"tq-day" + (freeTeams.length ? "" : " full")} key={d}>
            <div className="tq-date">{dShow(d)}{freeTeams.length === 0 && <span className="tq-allbusy">เต็มทุกทีม</span>}</div>
            <div className="tq-teams">
              {permTeams.map((t) => {
                const o = occ[t.id]?.[d] || {};
                const dot = (slot, label) => {
                  const busy = o[slot];
                  return <span className={"tq-slot " + (busy ? "busy" : "free")} title={busy ? `${busy.job_no} ${busy.customer || ""}` : "ว่าง"}>{busy ? "🔴" : "🟢"}{label}</span>;
                };
                return (
                  <div className="tq-team" key={t.id}>
                    <span className="tq-tname"><span className="tq-tdot" style={{ background: t.color }} />{(t.name || t.id).replace("Team ", "")}{t.type === "sub" && <span className="tq-sub">ซัพ</span>}</span>
                    <span className="tq-slots">{dot("morning", "เช้า")}{dot("afternoon", "บ่าย")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
