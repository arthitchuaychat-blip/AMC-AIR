import React from "react";
import { listTeamJobOrders, updateJobStatus, saveJobEvidence, uploadMaterialPhoto } from "../lib/api";
import { UIcon } from "../icons";

const STATUS = {
  pending: { th: "รอเริ่มงาน", cls: "open" }, scheduled: { th: "นัดแล้ว", cls: "open" },
  in_progress: { th: "กำลังทำ", cls: "open" }, done: { th: "เสร็จแล้ว", cls: "closed" }, cancelled: { th: "ยกเลิก", cls: "closed" },
};

// completion evidence: photos + comment (kept as proof of work)
function JobEvidence({ jo, flash, reload }) {
  const [photos, setPhotos] = React.useState(jo.photos || []);
  const [note, setNote] = React.useState(jo.completion_note || "");
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const dirty = note !== (jo.completion_note || "") || JSON.stringify(photos) !== JSON.stringify(jo.photos || []);

  async function onFiles(e) {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    setUploading(true);
    try { const urls = []; for (const f of files) urls.push(await uploadMaterialPhoto(f, jo.job_no)); setPhotos((p) => [...p, ...urls]); }
    catch (ex) { flash("อัปโหลดรูปไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false);
  }
  const removePhoto = (i) => setPhotos((p) => p.filter((_, j) => j !== i));
  async function save() {
    setBusy(true);
    try { await saveJobEvidence(jo.job_no, photos, note); flash("บันทึกหลักฐานงานแล้ว ✓"); reload(); }
    catch (ex) { flash("บันทึกไม่สำเร็จ: " + (ex.message || ex), true); }
    setBusy(false);
  }
  return (
    <div className="myjob-ev">
      <div className="myjob-ev-title">📸 รูป + บันทึกการทำงาน (หลักฐาน)</div>
      <div className="myjob-photos">
        {photos.map((u, i) => (
          <div className="myjob-photo" key={i}>
            <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>
            <button type="button" className="myjob-photo-x" onClick={() => removePhoto(i)} aria-label="ลบรูป">×</button>
          </div>
        ))}
        <label className="myjob-addphoto">{uploading ? "…" : "＋ รูป"}
          <input type="file" accept="image/*" capture="environment" multiple onChange={onFiles} hidden />
        </label>
      </div>
      <textarea className="inp" rows={2} placeholder="คอมเมนต์ / บันทึกการทำงาน เช่น ติดตั้งเสร็จ ทดสอบแล้วใช้งานปกติ" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary sm" disabled={busy || !dirty} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึกหลักฐาน"}</button>
    </div>
  );
}

export default function MyJobs({ team, onWithdraw }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [done, setDone] = React.useState(false);

  async function load() {
    if (!team) { setLoading(false); return; }
    setLoading(true);
    try { setList(await listTeamJobOrders(team)); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [team]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); }

  async function setStatus(jo, status) {
    try { await updateJobStatus(jo.job_no, status); flash("อัปเดตสถานะแล้ว"); await load(); }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
  }

  const active = list.filter((j) => j.status !== "done" && j.status !== "cancelled");
  const finished = list.filter((j) => j.status === "done" || j.status === "cancelled");
  const shown = done ? finished : active;

  if (!team) {
    return <div className="adm"><div className="adm-head"><div><h1 className="page-title">งานของฉัน</h1></div></div>
      <div className="empty">บัญชีนี้ยังไม่ได้สังกัดทีมช่าง — ติดต่อฝ่ายธุรการให้กำหนดทีมให้ครับ</div></div>;
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">งานของฉัน <span className="page-title-en">My Jobs · {team}</span></h1>
          <p className="page-sub">{active.length} งานที่ต้องทำ</p></div>
        <div className="seg">
          <button className={"seg-btn" + (!done ? " on" : "")} onClick={() => setDone(false)}>ต้องทำ ({active.length})</button>
          <button className={"seg-btn" + (done ? " on" : "")} onClick={() => setDone(true)}>เสร็จแล้ว ({finished.length})</button>
        </div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{done ? "ยังไม่มีงานที่เสร็จ" : "ไม่มีงานค้าง 🎉"}</div>}

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

              <div className="myjob-actions">
                {(jo.status === "pending" || jo.status === "scheduled") && <button className="btn-primary" onClick={() => setStatus(jo, "in_progress")}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> รับงาน / เริ่มทำ</button>}
                {jo.status === "in_progress" && <button className="btn-primary ok" onClick={() => setStatus(jo, "done")}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> ปิดงาน (เสร็จ)</button>}
                {jo.status !== "done" && jo.status !== "cancelled" && <button className="btn-ghost" onClick={() => onWithdraw && onWithdraw(jo)}><UIcon name="withdraw" size={15} /> เบิกวัสดุงานนี้</button>}
              </div>
              {jo.status === "in_progress" && <div className="myjob-hint">เบิกวัสดุเพิ่มได้หลายครั้งจนกว่าจะปิดงาน</div>}

              {(jo.status === "in_progress" || jo.status === "done") && <JobEvidence jo={jo} flash={flash} reload={load} />}
            </div>
          );
        })}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200 }}>{toast.m}</div>}
    </div>
  );
}
