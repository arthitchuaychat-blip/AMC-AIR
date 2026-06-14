import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import { listJobOrders, updateJobStatus } from "../lib/api";
import { UIcon } from "../icons";
import { slotDef, jobDays, parseYmd, thDayMon } from "../lib/schedule";
import JobTimeline from "./JobTimeline";
import AttachThumb from "./AttachThumb";

const STATUS = {
  pending: { th: "รอเริ่มงาน", cls: "b-grey" }, scheduled: { th: "นัดแล้ว", cls: "b-blue" },
  in_progress: { th: "กำลังทำ", cls: "b-amber" }, done: { th: "เสร็จแล้ว", cls: "b-green" }, cancelled: { th: "ยกเลิก", cls: "b-red" },
};

export default function MyJobs({ role, team, me, onWithdraw }) {
  const allTeams = role === "lead_tech"; // หัวหน้าช่างเห็นงานทุกทีม
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [tab, setTab] = React.useState("todo"); // todo | doing | done

  async function load() {
    if (!allTeams && !team) { setLoading(false); return; }
    setLoading(true);
    try {
      const all = await listJobOrders();
      // a job is "mine" if my team is on ANY of its visits (fallback: legacy assigned_team)
      const mine = allTeams ? all : all.filter((j) =>
        (j.visits && j.visits.length) ? j.visits.some((v) => v.assigned_team === team) : j.assigned_team === team);
      setList(mine);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [team, allTeams]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); }

  async function setStatus(jo, status) {
    const label = STATUS[status]?.th || status;
    if (!await confirmDialog(`ยืนยันเปลี่ยนสถานะงาน ${jo.job_no} เป็น "${label}" ?`)) return;
    try { await updateJobStatus(jo.job_no, status, me); flash("อัปเดตสถานะแล้ว"); await load(); }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
  }

  const todo = list.filter((j) => j.status === "pending" || j.status === "scheduled");
  const doing = list.filter((j) => j.status === "in_progress");
  const finished = list.filter((j) => j.status === "done" || j.status === "cancelled");
  const shown = tab === "todo" ? todo : tab === "doing" ? doing : finished;

  if (!allTeams && !team) {
    return <div className="adm"><div className="adm-head"><div><h1 className="page-title">งานของฉัน</h1></div></div>
      <div className="empty">บัญชีนี้ยังไม่ได้สังกัดทีมช่าง — ติดต่อฝ่ายธุรการให้กำหนดทีมให้ครับ</div></div>;
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">{allTeams ? "งานทุกทีม" : "งานของฉัน"} <span className="page-title-en">{allTeams ? "All Jobs · หัวหน้าช่าง" : `My Jobs · ${team}`}</span></h1>
          <p className="page-sub">{todo.length} ต้องทำ · {doing.length} กำลังทำ</p></div>
        <div className="seg">
          <button className={"seg-btn" + (tab === "todo" ? " on" : "")} onClick={() => setTab("todo")}>ต้องทำ ({todo.length})</button>
          <button className={"seg-btn" + (tab === "doing" ? " on" : "")} onClick={() => setTab("doing")}>กำลังทำ ({doing.length})</button>
          <button className={"seg-btn" + (tab === "done" ? " on" : "")} onClick={() => setTab("done")}>เสร็จแล้ว ({finished.length})</button>
        </div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{tab === "done" ? "ยังไม่มีงานที่เสร็จ" : tab === "doing" ? "ยังไม่มีงานที่กำลังทำ" : "ไม่มีงานค้าง 🎉"}</div>}

      <div className="job-cards">
        {shown.map((jo) => {
          const st = STATUS[jo.status] || STATUS.pending;
          // show the visit(s) relevant to this team (lead sees all visits)
          const myVisits = (jo.visits && jo.visits.length)
            ? (allTeams ? jo.visits : jo.visits.filter((v) => v.assigned_team === team))
            : [];
          const sv = myVisits.slice().sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""))[0] || jo;
          const dt = sv.scheduled_at ? new Date(sv.scheduled_at) : null;
          const days = dt ? jobDays({ scheduled_at: sv.scheduled_at, end_date: sv.end_date, slot: sv.slot }) : [];
          const slot = slotDef(sv.slot);
          const slotTxt = dt ? ((!sv.slot || sv.slot === "custom") ? dt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น." : slot.th) : "";
          const visitTeam = sv.teamName || jo.teamName;
          return (
            <div className={"card myjob" + (jo.status === "done" ? " closed" : "")} key={jo.job_no}>
              <div className="myjob-head">
                <div>
                  <div className="myjob-no">{jo.job_no} <span className={"job-badge " + st.cls}>{st.th}</span>{visitTeam ? <span className="myjob-team">ทีม {visitTeam}</span> : null}{myVisits.length > 1 ? <span className="myjob-team">🔁 {myVisits.length} รอบ</span> : null}</div>
                  {jo.customerName && <div className="myjob-cust">🏢 {jo.customerName}</div>}
                  {jo.customerAddr && jo.customerAddr !== jo.address && <div className="myjob-custaddr">{jo.customerAddr}</div>}
                  <div className="myjob-title">{jo.title || "งานติดตั้ง/บริการ"}</div>
                </div>
                {dt && <div className="myjob-when">
                  {days.length > 1 ? `${thDayMon(dt)} – ${thDayMon(parseYmd(days[days.length - 1]))}` : dt.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}
                  <br /><b>{slotTxt}</b>{days.length > 1 && <span className="myjob-when-multi">{days.length} วัน</span>}
                </div>}
              </div>

              {jo.contact_name && <div className="myjob-row"><UIcon name="user" size={15} color="var(--ink-3)" /> {jo.contact_name}
                {jo.contact_phone && <a href={`tel:${jo.contact_phone}`} className="myjob-call">📞 {jo.contact_phone}</a>}</div>}
              {!jo.contact_name && jo.contact_phone && <div className="myjob-row"><span>📞</span> <a href={`tel:${jo.contact_phone}`} className="myjob-call">{jo.contact_phone}</a></div>}
              {jo.address && <div className="myjob-row"><span>📍</span> <span style={{ flex: 1 }}>{jo.address}</span>
                {jo.map_url && <a href={jo.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm">แผนที่</a>}</div>}
              {jo.details && <div className="myjob-details">{jo.details}</div>}

              {(jo.sales_note || (jo.sales_photos && jo.sales_photos.length > 0)) && (
                <div className="myjob-brief">
                  <div className="myjob-brief-title">📋 บรีฟจากฝ่ายขาย</div>
                  {jo.sales_note && <div className="myjob-brief-note">{jo.sales_note}</div>}
                  {jo.sales_photos && jo.sales_photos.length > 0 && (
                    <div className="tl-photos">{jo.sales_photos.map((u, i) => <AttachThumb key={i} url={u} />)}</div>
                  )}
                </div>
              )}

              <div className="myjob-actions">
                {(jo.status === "pending" || jo.status === "scheduled") && <button className="btn-primary" onClick={() => setStatus(jo, "in_progress")}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> รับงาน / เริ่มทำ</button>}
                {jo.status === "in_progress" && <button className="btn-primary ok" onClick={() => setStatus(jo, "done")}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> ปิดงาน (เสร็จ)</button>}
                {jo.status === "done" && <button className="btn-ghost" onClick={() => setStatus(jo, "in_progress")}><UIcon name="ret" size={15} /> กลับมาทำต่อ</button>}
                {jo.status !== "done" && jo.status !== "cancelled" && <button className="btn-ghost" onClick={() => onWithdraw && onWithdraw(jo)}><UIcon name="withdraw" size={15} /> เบิกวัสดุงานนี้</button>}
              </div>
              {jo.status === "in_progress" && <div className="myjob-hint">เข้าหน้างานได้หลายครั้ง · เบิกวัสดุเพิ่มได้ไม่จำกัด · แนบรูป/คอมเมนต์ลงไทม์ไลน์ด้านล่าง</div>}

              {jo.status !== "cancelled" && <JobTimeline jobNo={jo.job_no} canPost author={me} flash={flash} />}
            </div>
          );
        })}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200 }}>{toast.m}</div>}
    </div>
  );
}
