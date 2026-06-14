import React from "react";
import { listJobLogs, addJobLog, uploadMaterialPhoto } from "../lib/api";
import { ATTACH_ACCEPT } from "../lib/format";
import AttachThumb from "./AttachThumb";

const STATUS_TH = { pending: "รอเริ่มงาน", scheduled: "นัดแล้ว", in_progress: "กำลังทำ", awaiting_approval: "รออนุมัติ", reschedule: "รอนัดหมายใหม่", done: "เสร็จแล้ว", cancelled: "ยกเลิก" };
const fmtWhen = (s) => { const d = new Date(s); return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น."; };

// Append-only timeline of a job: status changes + photo/comment updates.
// canPost=true shows the add-entry box (unlimited photos + comment per entry).
export default function JobTimeline({ jobNo, canPost, author, flash }) {
  const [logs, setLogs] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [photos, setPhotos] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function load() { try { setLogs(await listJobLogs(jobNo)); } catch (e) { flash && flash("โหลดความเคลื่อนไหวไม่สำเร็จ: " + (e.message || e), true); setLogs([]); } }
  React.useEffect(() => { load(); }, [jobNo]);

  async function onFiles(e) {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    setUploading(true);
    try { const urls = []; for (const f of files) urls.push(await uploadMaterialPhoto(f, jobNo)); setPhotos((p) => [...p, ...urls]); }
    catch (ex) { flash && flash("อัปโหลดไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false);
  }
  const removePhoto = (i) => setPhotos((p) => p.filter((_, j) => j !== i));

  async function post() {
    if (!note.trim() && photos.length === 0) return;
    setBusy(true);
    try { await addJobLog(jobNo, { note, photos, author }); setNote(""); setPhotos([]); await load(); flash && flash("เพิ่มบันทึกแล้ว ✓"); }
    catch (e) { flash && flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="tl">
      <div className="tl-title">ความเคลื่อนไหวของงาน · Timeline</div>

      {canPost && (
        <div className="tl-add">
          <div className="myjob-photos">
            {photos.map((u, i) => (
              <div className="myjob-photo" key={i}>
                <AttachThumb url={u} />
                <button type="button" className="myjob-photo-x" onClick={() => removePhoto(i)} aria-label="ลบไฟล์">×</button>
              </div>
            ))}
            <label className="myjob-addphoto">{uploading ? "…" : "＋ รูป/ไฟล์"}
              <input type="file" accept={ATTACH_ACCEPT} multiple onChange={onFiles} hidden />
            </label>
          </div>
          <textarea className="inp" rows={2} placeholder="เพิ่มบันทึก/คอมเมนต์ความคืบหน้า…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary sm" disabled={busy || uploading || (!note.trim() && photos.length === 0)} onClick={post}>{busy ? "กำลังบันทึก…" : "เพิ่มลงไทม์ไลน์"}</button>
        </div>
      )}

      {logs === null && <div className="tl-empty">กำลังโหลด…</div>}
      {logs && logs.length === 0 && <div className="tl-empty">ยังไม่มีความเคลื่อนไหว</div>}
      {logs && logs.length > 0 && (
        <div className="tl-list">
          {logs.slice().reverse().map((l) => (
            <div className={"tl-item" + (l.type === "status" ? " status" : "")} key={l.id}>
              <span className="tl-dot" />
              <div className="tl-body">
                <div className="tl-meta">{fmtWhen(l.created_at)}{l.author ? ` · ${l.author}` : ""}</div>
                {l.type === "status"
                  ? <div className="tl-status">เปลี่ยนสถานะเป็น <b>{STATUS_TH[l.status] || l.status}</b></div>
                  : <>
                      {l.note && <div className="tl-note">{l.note}</div>}
                      {l.photos?.length > 0 && <div className="tl-photos">{l.photos.map((u, i) => <AttachThumb key={i} url={u} />)}</div>}
                    </>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
