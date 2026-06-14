import React from "react";
import { listLineContacts, listJobOrders } from "../lib/api";
import { jobTypeDef } from "../lib/schedule";

// CRM funnel (leads by stage) + open-job overview for the dashboard
const STAGES = [
  ["new", "ใหม่", "#64748b"], ["talking", "กำลังคุย", "#1f74e0"], ["interested", "สนใจ/จะซื้อ", "#d97706"],
  ["followup", "ต้องติดตาม", "#7c3aed"], ["won", "ปิดการขาย", "#16a34a"], ["closed", "จบแล้ว", "#0891b2"], ["lost", "ไม่สนใจ", "#dc2626"],
];
const JOB_STATUS = [["pending", "รอจ่ายงาน", "#64748b"], ["scheduled", "นัดแล้ว", "#2563eb"], ["in_progress", "กำลังทำ", "#d97706"]];
const dot = (c) => ({ width: 10, height: 10, borderRadius: 99, background: c, display: "inline-block", marginRight: 6 });

export default function CrmJobsSummary({ onGo }) {
  const [contacts, setContacts] = React.useState(null);
  const [jobs, setJobs] = React.useState(null);
  React.useEffect(() => {
    listLineContacts().then(setContacts).catch(() => setContacts([]));
    listJobOrders().then(setJobs).catch(() => setJobs([]));
  }, []);

  const stageCount = React.useMemo(() => { const m = {}; (contacts || []).forEach((c) => { const s = c.stage || "new"; m[s] = (m[s] || 0) + 1; }); return m; }, [contacts]);
  const stageMax = Math.max(1, ...STAGES.map((s) => stageCount[s[0]] || 0));
  const statusCount = React.useMemo(() => { const m = {}; (jobs || []).forEach((j) => { m[j.status] = (m[j.status] || 0) + 1; }); return m; }, [jobs]);
  const openJobs = (jobs || []).filter((j) => j.status !== "done" && j.status !== "cancelled");
  const surveyOpen = openJobs.filter((j) => (j.job_type || "install") === "survey").length;

  return (
    <>
      <div className="sec-head" style={{ margin: "22px 0 10px" }}><div><div className="sec-title">CRM & งานช่าง</div><div className="sec-sub">ลูกค้าตามสถานะ · งานค้าง</div></div></div>
      <div className="dash-grid">
        <div className="card span-2 clickable-card" onClick={() => onGo && onGo("chat")}>
          <div className="sec-head"><div><div className="sec-title">ลูกค้าตามสถานะ (CRM)</div><div className="sec-sub">{(contacts || []).length} รายชื่อแชต</div></div></div>
          <div className="tbars">
            {STAGES.map(([id, label, color]) => {
              const v = stageCount[id] || 0;
              return (
                <div className="tbar-row" key={id}>
                  <div className="tbar-label"><span style={dot(color)} /> {label}</div>
                  <div className="tbar-track"><div className="tbar-fill" style={{ width: (v / stageMax * 100) + "%", background: color }} /></div>
                  <div className="tbar-val">{v}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card clickable-card" onClick={() => onGo && onGo("joborders")}>
          <div className="sec-head"><div><div className="sec-title">งานค้าง</div><div className="sec-sub">ยังไม่เสร็จ</div></div><span className="badge-warn">{openJobs.length}</span></div>
          <div className="ret-stat">
            {JOB_STATUS.map(([id, label, color]) => (
              <div className="ret-row" key={id}><span><span style={dot(color)} />{label}</span><b>{statusCount[id] || 0}</b></div>
            ))}
            <div className="ret-divider" />
            <div className="ret-row big"><span>{jobTypeDef("survey")[2]} งานสำรวจค้าง</span><b style={{ color: "#2563eb" }}>{surveyOpen}</b></div>
          </div>
          <div className="cat-card-move" style={{ marginTop: 12 }}>เปิดหน้าใบงาน <span aria-hidden>›</span></div>
        </div>
      </div>
    </>
  );
}
