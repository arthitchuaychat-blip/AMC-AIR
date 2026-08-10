import React from "react";
import { listJobLogs, listJobLogsByGroup, addJobLog, uploadMaterialPhoto } from "../lib/api";
import { ATTACH_ACCEPT, isImageUrl } from "../lib/format";
import { JOB_STATUSES } from "../lib/schedule";
import AttachThumb from "./AttachThumb";
import Lightbox from "./Lightbox";

// ป้ายสถานะดึงจากชุดกลาง (lib/schedule.js) — กติกาบ้าน: ทุกเมนูใช้ชุดเดียวกัน (เดิม hardcode แล้ว quote_pending โชว์เป็นอังกฤษดิบ)
const STATUS_TH = Object.fromEntries(JOB_STATUSES.map(([v, l]) => [v, l]));
const STATUS_ACTION = { pending: "🕒 รอจ่ายงาน", scheduled: "📌 นัดหมายแล้ว", in_progress: "🔧 เริ่ม/กำลังทำงาน", awaiting_approval: "📤 ส่งอนุมัติ", reschedule: "📅 ส่งไปนัดหมายเพิ่ม", quote_pending: "📝 เสร็จ · ส่งไปรอทำใบเสนอราคา", done: "✅ อนุมัติงานเสร็จ", cancelled: "❌ ยกเลิกงาน" };
const fmtWhen = (s) => { const d = new Date(s); return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น."; };

// ลิงก์ในข้อความกดได้ — เว็บไซต์ (http/https/www.) และลิงก์แผนที่ (maps.app.goo.gl / goo.gl/maps) เปิดแท็บใหม่
// (export ให้โน้ตถึงทีมช่าง/บรีฟ ในใบงาน · งานของฉัน · ตารางงาน · ช่างซัพ ใช้ตัวเดียวกัน)
const URL_SPLIT = /((?:https?:\/\/|www\.|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)[^\s<>"']+)/gi;
export function Linkify({ text }) {
  return String(text || "").split(URL_SPLIT).map((p, i) =>
    /^(https?:\/\/|www\.|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(p)
      ? <a key={i} href={/^https?:\/\//i.test(p) ? p : `https://${p}`} target="_blank" rel="noopener noreferrer"
          style={{ color: "#1d4ed8", textDecoration: "underline", wordBreak: "break-all" }}
          onClick={(e) => e.stopPropagation()}>{/^(maps\.|goo\.gl|https?:\/\/(maps\.|www\.google\.[^/]+\/maps))/i.test(p) ? "📍 " : ""}{p}</a>
      : p);
}

// single image thumbnail: tries to display directly, if it fails fetches as blob + converts HEIC
async function blobifyUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  let blob = await res.blob();
  if (blob.type === "image/heic" || blob.type === "image/heif" || /\.(heic|heif)$/i.test(url)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.85 });
    blob = Array.isArray(out) ? out[0] : out;
  }
  return URL.createObjectURL(blob);
}

function ImgThumb({ url, onClick }) {
  const [src, setSrc] = React.useState(url);
  const [state, setState] = React.useState("idle");
  const tried = React.useRef(false);   // กัน loop: ถ้าแปลง blob แล้วรูปยัง error อีก → เลิก (ไม่วนซ้ำ)

  async function handleError() {
    if (state === "loading") return;
    if (tried.current) { setState("failed"); return; }
    tried.current = true; setState("loading");
    try { setSrc(await blobifyUrl(url)); setState("idle"); }
    catch { setState("failed"); }
  }

  if (state === "failed") return <AttachThumb url={url} />;
  return (
    <button type="button" className="tl-photo" onClick={onClick}>
      <img src={src} alt="" loading="lazy" decoding="async" onError={handleError} />
    </button>
  );
}

// photos of one entry → image cells (open the lightbox) + file chips. onOpen(images, index)
function Photos({ photos, onOpen }) {
  if (!photos?.length) return null;
  const imgs = photos.filter(isImageUrl);
  return (
    <div className="tl-photos">
      {photos.map((u, i) => isImageUrl(u)
        ? <ImgThumb key={i} url={u} onClick={() => onOpen(imgs, imgs.indexOf(u))} />
        : <AttachThumb key={i} url={u} />)}
    </div>
  );
}

// shared add box (top-level comment or a reply when parentId/jobNo is the parent's)
function Composer({ jobNo, author, parentId, placeholder, onPosted, flash, compact }) {
  const [note, setNote] = React.useState("");
  const [photos, setPhotos] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  async function onFiles(e) {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    setUploading(true);
    try { const urls = []; for (const f of files) urls.push(await uploadMaterialPhoto(f, jobNo)); setPhotos((p) => [...p, ...urls]); }
    catch (ex) { flash && flash("อัปโหลดไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false);
  }
  async function post() {
    if (!note.trim() && photos.length === 0) return;
    setBusy(true);
    try { await addJobLog(jobNo, { note, photos, author, parent_id: parentId || null }); setNote(""); setPhotos([]); await onPosted(); flash && flash(parentId ? "ตอบกลับแล้ว ✓" : "เพิ่มบันทึกแล้ว ✓"); }
    catch (e) { flash && flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className={"tl-add" + (compact ? " tl-add-reply" : "")}>
      <div className="myjob-photos">
        {photos.map((u, i) => (
          <div className="myjob-photo" key={i}><AttachThumb url={u} />
            <button type="button" className="myjob-photo-x" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} aria-label="ลบไฟล์">×</button></div>
        ))}
        <label className="myjob-addphoto">{uploading ? "…" : "＋ รูป/ไฟล์"}<input type="file" accept={ATTACH_ACCEPT} multiple onChange={onFiles} hidden /></label>
      </div>
      <textarea className="inp" rows={compact ? 1 : 2} placeholder={placeholder || "เพิ่มบันทึก/คอมเมนต์ความคืบหน้า…"} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary sm" disabled={busy || uploading || (!note.trim() && photos.length === 0)} onClick={post}>{busy ? "กำลังบันทึก…" : (parentId ? "ตอบกลับ" : "เพิ่มลงไทม์ไลน์")}</button>
    </div>
  );
}

// Append-only timeline of a job: status changes + photo/comment updates (with replies).
export default function JobTimeline({ jobNo, groupNo, linked, canPost, author, flash }) {
  const [logs, setLogs] = React.useState(null);
  const [lightbox, setLightbox] = React.useState(null);   // { images, index }
  const [replyTo, setReplyTo] = React.useState(null);     // parent log id whose reply box is open

  const shared = !!linked && !!groupNo;
  async function load() { try { setLogs(shared ? await listJobLogsByGroup(groupNo) : await listJobLogs(jobNo)); } catch (e) { flash && flash("โหลดความเคลื่อนไหวไม่สำเร็จ: " + (e.message || e), true); setLogs([]); } }
  // ⚠️ dep เป็น `shared` (boolean) ไม่ใช่ `linked` (อาร์เรย์) — ไม่งั้น parent สร้าง linked ใหม่ทุกเรนเดอร์ → โหลดซ้ำไม่หยุด → หน้ากระพริบ
  React.useEffect(() => { load(); }, [jobNo, groupNo, shared]);
  const openLb = (images, index) => setLightbox({ images, index });

  // split into top-level entries + replies grouped by parent
  const tops = (logs || []).filter((l) => !l.parent_id);
  const repliesBy = {}; (logs || []).filter((l) => l.parent_id).forEach((r) => { (repliesBy[r.parent_id] = repliesBy[r.parent_id] || []).push(r); });

  return (
    <div className="tl">
      <div className="tl-title">ความเคลื่อนไหวของงาน · Timeline{shared ? " (รวมใบงานเชื่อม)" : ""}</div>

      {canPost && <Composer jobNo={jobNo} author={author} onPosted={load} flash={flash} />}

      {logs === null && <div className="tl-empty">กำลังโหลด…</div>}
      {logs && tops.length === 0 && <div className="tl-empty">ยังไม่มีความเคลื่อนไหว</div>}
      {logs && tops.length > 0 && (
        <div className="tl-list">
          {tops.slice().reverse().map((l) => {
            const replies = (repliesBy[l.id] || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
            const isComment = l.type !== "status" && l.type !== "edit";
            return (
              <div className={"tl-item" + (l.type === "status" ? " status" : "")} key={l.id}>
                <span className="tl-dot" />
                <div className="tl-body">
                  <div className="tl-meta">{fmtWhen(l.created_at)}{l.author ? ` · ${l.author}` : ""}{shared ? <span className="tl-jobtag">{l.job_no}</span> : null}</div>
                  {l.type === "status"
                    ? <div className="tl-status">{STATUS_ACTION[l.status] || `เปลี่ยนสถานะเป็น ${STATUS_TH[l.status] || l.status}`}</div>
                    : l.type === "edit"
                    ? <div className="tl-status">✏️ บันทึก/แก้ไขใบงาน{l.status ? ` · สถานะ: ${STATUS_TH[l.status] || l.status}` : ""}</div>
                    : <>
                        {l.note && <div className="tl-note"><Linkify text={l.note} /></div>}
                        <Photos photos={l.photos} onOpen={openLb} />
                      </>}

                  {/* replies */}
                  {(replies.length > 0 || (canPost && isComment)) && (
                    <div className="tl-replies">
                      {replies.map((r) => (
                        <div className="tl-reply" key={r.id}>
                          <div className="tl-meta">↳ {fmtWhen(r.created_at)}{r.author ? ` · ${r.author}` : ""}</div>
                          {r.note && <div className="tl-note"><Linkify text={r.note} /></div>}
                          <Photos photos={r.photos} onOpen={openLb} />
                        </div>
                      ))}
                      {canPost && isComment && (replyTo === l.id
                        ? <Composer jobNo={l.job_no} author={author} parentId={l.id} placeholder="ตอบกลับคอมเมนต์นี้…" compact onPosted={() => { setReplyTo(null); load(); }} flash={flash} />
                        : <button className="tl-reply-btn" onClick={() => setReplyTo(l.id)}>↳ ตอบกลับ</button>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lightbox && <Lightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
