import React from "react";
import { listTeamJobOrders, updateJobStatus } from "../lib/api";
import { UIcon } from "../icons";
import JobTimeline from "./JobTimeline";

const STATUS = {
  pending: { th: "รอเริ่มงาน", cls: "open" }, scheduled: { th: "นัดแล้ว", cls: "open" },
  in_progress: { th: "กำลังทำ", cls: "open" }, done: { th: "เสร็จแล้ว", cls: "closed" }, cancelled: { th: "ยกเลิก", cls: "closed" },
};

export default function MyJobs({ team, me, onWithdraw }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [tab, setTab] = React.useState("todo"); // todo | doing | done

  async function load() {
    if (!team) { setLoading(false); return; }
    setLoading(true);
    try { setList(await listTeamJobOrders(team)); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [team]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); }

  async function setStatus(jo, status) {
    const label = STATUS[status]?.th || status;
    if (!window.confirm(`ยืนยันเปลี่ยนสถานะงาน ${jo.job_no} เป็น "${label}" ?`)) return;
    try { await updateJobStatus(jo.job_no, status, me); flash("อัปเดตสถานะแล้ว"); await load(); }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
  }

  const todo = list.filter((j) => j.status === "pending" || j.status === "scheduled");
  const doing = list.filter((j) => j.status === "in_progress");
  const finished = list.filter((j) => j.status === "done" || j.status === "cancelled");
  const shown = tab === "todo" ? todo : tab === "doing" ? doing : finished;

  if (!team) {
    return <div className="adm"><div className="adm-head"><div><h1 className="page-title">งานของฉัน</h1></div></div>
      <div className="empty">บัญชีนี้ยังไม่ได้สังกัดทีมช่าง — ติดต่อฝ่ายธุรการให้กำหนดทีมให้ครับ</div></div>;
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">งานของฉัน <span className="page-title-en">My Jobs · {team}</span></h1>
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
          const dt = jo.scheduled_at ? new Date(jo.scheduled_at) : null;
          return (
            <div className={"card myjob" + (jo.status === "done" ? " closed" : "")} key={jo.job_no}>
              <div className="myjob-head">
                <div>
                  <div className="myjob-no">{jo.job_no} <span className={"job-badge " + st.cls}>{st.th}</span></div>
                  {jo.customerName && <div className="myjob-cust">🏢 {jo.customerName}</div>}
                  {jo.customerAddr && jo.customerAddr !== jo.address && <div className="myjob-custaddr">{jo.customerAddr}</div>}
                  <div className="myjob-title">{jo.title || "งานติดตั้ง/บริการ"}</div>
                </div>
                {dt && <div className="myjob-when">{dt.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}<br /><b>{dt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</b></div>}
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
                    <div className="tl-photos">{jo.sales_photos.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>)}</div>
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
