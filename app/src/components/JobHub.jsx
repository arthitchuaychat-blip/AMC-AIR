import React from "react";
import { UIcon } from "../icons";
import { can } from "../lib/permissions";

// A6 — งานบริการและติดตั้ง: ยุบทางเข้า ใบงาน + ปฏิทินงาน + วัสดุ/ต้นทุน + ส่งมอบงาน เป็นเมนูเดียว
// ⚠️ ตัวนี้ "เป็นหน้า joborders เดิม" (host) — deep-link ทั้งหมดที่ go("joborders") ยังลงแท็บใบงานปกติ
// เอกสาร/ข้อมูล/สถานะเดิมคงเดิมทุกอย่าง · คุมสิทธิ์รายแท็บด้วย can() — ช่างไม่มีสิทธิ์ jobs จะไม่เห็นแท็บต้นทุน
// (หน้า handover/schedule/jobs เดิมยังอยู่แยกเผื่อ deep-link/ลิงก์เก่า/#hash)
const JobOrders = React.lazy(() => import("./JobOrders"));
const Schedule = React.lazy(() => import("./Schedule"));
const Jobs = React.lazy(() => import("./Jobs"));
const Handover = React.lazy(() => import("./Handover"));

const TABS = [
  { key: "joborders", icon: "wrench", label: "ใบงาน" },
  { key: "schedule", icon: "calendar", label: "ปฏิทินงาน" },
  { key: "jobs", icon: "box", label: "วัสดุ & ต้นทุน" },
  { key: "handover", icon: "check", label: "ส่งมอบงาน" },
];

export default function JobHub({ role, me, myTeam, jobFocus, onJobFocusConsumed, joPrefill, onJoPrefillConsumed,
  joSchedule, onJoScheduleConsumed, jobSurveyCust, onSurveyConsumed, onCreatePrep, onMovement,
  onOpenQuote, onOpenBoq, onOpenDoc, onGoChat }) {
  const tabs = TABS.filter((t) => can(role, t.key));
  const [tab, setTab] = React.useState(tabs[0]?.key || "joborders");
  const [focus, setFocus] = React.useState(jobFocus || null);
  const [sched, setSched] = React.useState(joSchedule || null);
  const [hoStart, setHoStart] = React.useState(null);
  React.useEffect(() => { if (jobFocus) { setFocus(jobFocus); setTab("joborders"); } }, [jobFocus]);
  React.useEffect(() => { if (joSchedule) { setSched(joSchedule); setTab("joborders"); } }, [joSchedule]);
  React.useEffect(() => { if (joPrefill || jobSurveyCust) setTab("joborders"); }, [joPrefill, jobSurveyCust]);
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  if (!cur) return <div className="empty">ไม่มีสิทธิ์เข้าถึงเมนูนี้</div>;
  return (
    <div>
      {tabs.length > 1 && (
        <div className="view-seg hub-tabs" style={{ marginBottom: 14, maxWidth: 620, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.key} className={"seg-btn hub-tab" + (cur.key === t.key ? " on" : "")} aria-pressed={cur.key === t.key} onClick={() => setTab(t.key)}>
              <UIcon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </div>
      )}
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
        {cur.key === "joborders" && <JobOrders role={role} me={me} myTeam={myTeam}
          focus={focus} onFocusConsumed={() => { setFocus(null); onJobFocusConsumed && onJobFocusConsumed(); }}
          prefill={joPrefill} onPrefillConsumed={onJoPrefillConsumed}
          schedule={sched} onScheduleConsumed={() => { setSched(null); onJoScheduleConsumed && onJoScheduleConsumed(); }}
          surveyFor={jobSurveyCust} onSurveyConsumed={onSurveyConsumed}
          onHandover={(jo) => { setHoStart(jo); setTab("handover"); }}
          onCreatePrep={onCreatePrep} onMovement={onMovement}
          onOpenQuote={onOpenQuote} onOpenBoq={onOpenBoq} onOpenDoc={onOpenDoc} onGoChat={onGoChat} />}
        {cur.key === "schedule" && <Schedule role={role} team={myTeam} me={me}
          onOpenJob={(jn) => { if (can(role, "joborders")) { setFocus(jn); setTab("joborders"); } }}
          onNewJob={(s) => { setSched(s); setTab("joborders"); }} />}
        {cur.key === "jobs" && <Jobs role={role} />}
        {cur.key === "handover" && <Handover role={role} me={me} startJob={hoStart} onStartConsumed={() => setHoStart(null)} onOpenDoc={onOpenDoc} />}
      </React.Suspense>
    </div>
  );
}
