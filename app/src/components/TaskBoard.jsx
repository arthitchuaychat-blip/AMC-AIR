import React from "react";
import { listTasks, saveTask, setTaskStatus, deleteTask, listTaskComments, addTaskComment, deleteTaskComment, uploadTaskFile, listProfiles, listCustomers } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import AttachThumb from "./AttachThumb";
import { UIcon } from "../icons";
import { ATTACH_ACCEPT } from "../lib/format";

const STATUS = {
  todo: { th: "รอเริ่ม", c: "b-grey" }, doing: { th: "กำลังทำ", c: "b-blue" },
  done: { th: "เสร็จ", c: "b-green" }, cancelled: { th: "ยกเลิก", c: "b-red" },
};
const COLS = [["todo", "รอเริ่ม"], ["doing", "กำลังทำ"], ["done", "เสร็จ"]];
const PRIO = { low: { th: "ต่ำ", c: "#64748b" }, normal: { th: "ปกติ", c: "#2563eb" }, high: { th: "ด่วน", c: "#dc2626" } };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
const fmtDT = (d) => d ? new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function TaskBoard({ role, me, prefill, onPrefillConsumed, focus, onFocusConsumed, onGoChat }) {
  const myId = me?.id;
  const [tasks, setTasks] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [scope, setScope] = React.useState("all");      // all | assigned (ที่ฉันสั่ง) | received (มอบให้ฉัน)
  const [personF, setPersonF] = React.useState("all");  // filter by a specific staff member
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [editTask, setEditTask] = React.useState(null);
  const [detailId, setDetailId] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  async function load() {
    setLoading(true);
    try { const [t, s, c] = await Promise.all([listTasks(), listProfiles(), listCustomers()]); setTasks(t); setStaff(s); setCusts(c); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // open the create form prefilled from chat ("สร้างงานติดตาม") — with the linked customer + a title hint
  React.useEffect(() => {
    if (!prefill) return;
    setEditTask({ title: prefill.name ? `ติดตามลูกค้า: ${prefill.name}` : "", detail: "", assignee: "", priority: "normal", due_date: "", attachments: [], customer_id: prefill.customerId || "" });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill]);
  // open a specific task's detail (from a notification) — show cancelled too in case it was
  React.useEffect(() => { if (focus == null) return; setDetailId(Number(focus)); setShowCancelled(true); onFocusConsumed && onFocusConsumed(); }, [focus]);

  const canManage = (t) => myId === t.assigner || role === "admin" || role === "exec";
  const canStatus = (t) => canManage(t) || myId === t.assignee;

  const scoped = tasks
    .filter((t) => scope === "all" ? true : scope === "assigned" ? t.assigner === myId : t.assignee === myId)
    .filter((t) => personF === "all" || t.assignee === personF || t.assigner === personF);
  const visible = scoped.filter((t) => showCancelled ? true : t.status !== "cancelled");
  const cancelledCount = scoped.filter((t) => t.status === "cancelled").length;
  const detail = detailId ? tasks.find((t) => t.id === detailId) : null;

  async function move(t, status) { try { await setTaskStatus(t.id, status); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  async function del(t) { if (!await confirmDialog(`ลบงาน "${t.title}" ? (กู้คืนไม่ได้)`)) return; try { await deleteTask(t.id); setDetailId(null); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">กระดานสั่งงาน <span className="page-title-en">Task Board</span></h1>
          <p className="page-sub">สั่งงาน · มอบหมาย · แนบไฟล์/รูป · คอมเมนต์ · ติดตามสถานะ</p></div>
        <button className="btn-primary" onClick={() => setEditTask({ title: "", detail: "", assignee: "", priority: "normal", due_date: "", attachments: [], customer_id: "" })}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สั่งงานใหม่</button>
      </div>

      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ["assigned", "งานที่ฉันสั่ง"], ["received", "งานที่มอบให้ฉัน"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (scope === v ? " on" : "")} onClick={() => setScope(v)}
            style={scope === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
        {cancelledCount > 0 && <button className={"cat-chip" + (showCancelled ? " on" : "")} onClick={() => setShowCancelled((v) => !v)}
          style={showCancelled ? { background: "#dc2626", color: "#fff", borderColor: "#dc2626" } : {}}>ยกเลิก ({cancelledCount})</button>}
        {(() => {
          const ids = new Set(); tasks.forEach((t) => { if (t.assignee) ids.add(t.assignee); if (t.assigner) ids.add(t.assigner); });
          const opts = staff.filter((p) => ids.has(p.id));
          if (!opts.length) return null;
          return (
            <select className="inp" style={{ width: "auto", flex: "none", marginLeft: 4 }} value={personF} onChange={(e) => setPersonF(e.target.value)}>
              <option value="all">👤 ทุกพนักงาน</option>
              {opts.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
            </select>
          );
        })()}
      </div>

      {loading ? <div className="empty">กำลังโหลด…</div> : (
        <div className="tb-board">
          {COLS.map(([sv, sl]) => {
            const col = visible.filter((t) => t.status === sv);
            return (
              <div className="tb-col" key={sv}>
                <div className="tb-col-head"><span className={"job-badge " + STATUS[sv].c}>{sl}</span><span className="tb-col-n">{col.length}</span></div>
                <div className="tb-col-body">
                  {col.length === 0 && <div className="tb-empty">— ว่าง —</div>}
                  {col.map((t) => (
                    <button type="button" className="tb-card" key={t.id} onClick={() => setDetailId(t.id)}>
                      <div className="tb-card-top">
                        <span className="tb-prio" style={{ background: PRIO[t.priority]?.c || "#2563eb" }} title={"ความสำคัญ: " + (PRIO[t.priority]?.th || "")} />
                        <span className="tb-card-title">{t.title}</span>
                      </div>
                      <div className="tb-card-meta">
                        <span>👤 {t.assigneeName}</span>
                        {t.due_date && <span className="tb-due">📅 {fmtDate(t.due_date)}</span>}
                      </div>
                      {t.customerName && <div className="tb-card-cust" onClick={(e) => { e.stopPropagation(); onGoChat && onGoChat(t.customer_id); }} role="button" title="เปิดแชตลูกค้า">🏢 {t.customerName} <span className="tb-card-chat">💬 แชต</span></div>}
                      <div className="tb-card-foot">
                        {(t.attachments?.length || 0) > 0 && <span>📎 {t.attachments.length}</span>}
                        {t.commentCount > 0 && <span>💬 {t.commentCount}</span>}
                        <span className="tb-by">สั่งโดย {t.assignerName}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editTask && <TaskEditor task={editTask} staff={staff} custs={custs} onClose={() => setEditTask(null)} onSaved={() => { setEditTask(null); load(); }} flash={flash} />}
      {detail && <TaskDetail task={detail} me={me} canManage={canManage(detail)} canStatus={canStatus(detail)} staff={staff} onGoChat={onGoChat}
        onClose={() => setDetailId(null)} onMove={move} onEdit={(t) => { setDetailId(null); setEditTask({ id: t.id, title: t.title, detail: t.detail || "", assignee: t.assignee || "", priority: t.priority, due_date: t.due_date || "", attachments: t.attachments || [], status: t.status, customer_id: t.customer_id ? String(t.customer_id) : "" }); }}
        onDelete={del} onChanged={load} flash={flash} />}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// shared multi-file attach control
function AttachRow({ files, onChange, flash }) {
  const inp = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  async function pick(e) {
    const list = Array.from(e.target.files || []); e.target.value = "";
    if (!list.length) return;
    setBusy(true);
    try { const urls = []; for (const f of list) urls.push(await uploadTaskFile(f)); onChange([...(files || []), ...urls]); }
    catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
    setBusy(false);
  }
  return (
    <div className="tb-attach">
      <div className="tb-attach-grid">
        {(files || []).map((u, i) => (
          <div className="tb-att" key={i}><AttachThumb url={u} />
            <button type="button" className="tb-att-x" onClick={() => onChange(files.filter((_, j) => j !== i))}><UIcon name="x" size={12} /></button></div>
        ))}
      </div>
      <input ref={inp} type="file" accept={ATTACH_ACCEPT} multiple style={{ display: "none" }} onChange={pick} />
      <button type="button" className="btn-ghost sm" disabled={busy} onClick={() => inp.current?.click()}><UIcon name="plus" size={13} /> {busy ? "กำลังอัปโหลด…" : "แนบไฟล์/รูป"}</button>
    </div>
  );
}

function TaskEditor({ task, staff, custs = [], onClose, onSaved, flash }) {
  const [f, setF] = React.useState(task);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.title?.trim()) return flash("ใส่ชื่องานก่อน", true);
    setBusy(true);
    try { await saveTask(f); flash(f.id ? "บันทึกงานแล้ว ✓" : "สั่งงานแล้ว ✓"); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div className="modal-head"><div className="modal-title">{f.id ? "แก้ไขงาน" : "สั่งงานใหม่"}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>ชื่องาน</span><input className="inp" value={f.title} autoFocus onChange={(e) => set("title", e.target.value)} placeholder="เช่น ไปเก็บเงินลูกค้า / เตรียมของเข้างานพรุ่งนี้" /></label>
          <label className="fld"><span>รายละเอียด</span><textarea className="inp" rows={3} style={{ resize: "vertical" }} value={f.detail} onChange={(e) => set("detail", e.target.value)} placeholder="อธิบายงานที่ต้องทำ" /></label>
          <div className="fld-row">
            <label className="fld"><span>มอบหมายให้</span>
              <select className="inp" value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
                <option value="">— เลือกผู้รับมอบหมาย —</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
              </select></label>
            <label className="fld"><span>ความสำคัญ</span>
              <select className="inp" value={f.priority} onChange={(e) => set("priority", e.target.value)}>
                <option value="low">ต่ำ</option><option value="normal">ปกติ</option><option value="high">ด่วน</option>
              </select></label>
          </div>
          <label className="fld"><span>ลูกค้าที่เกี่ยวข้อง (ไม่บังคับ · ใช้ติดตามลูกค้า)</span>
            <select className="inp" value={f.customer_id || ""} onChange={(e) => set("customer_id", e.target.value)}>
              <option value="">— ไม่ผูกกับลูกค้า —</option>
              {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <label className="fld"><span>กำหนดเสร็จ (ไม่บังคับ)</span><input className="inp" type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></label>
          <div className="fld"><span>ไฟล์/รูปแนบ</span><AttachRow files={f.attachments} onChange={(a) => set("attachments", a)} flash={flash} /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{f.id ? "บันทึก" : "สั่งงาน"}</button></div>
      </div>
    </div>
  );
}

function TaskDetail({ task, me, canManage, canStatus, onGoChat, onClose, onMove, onEdit, onDelete, onChanged, flash }) {
  const [comments, setComments] = React.useState(null);
  const [body, setBody] = React.useState("");
  const [atts, setAtts] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  async function loadC() { try { setComments(await listTaskComments(task.id)); } catch (e) { flash("โหลดคอมเมนต์ไม่สำเร็จ", true); } }
  React.useEffect(() => { loadC(); }, [task.id]);
  async function send() {
    if (!body.trim() && !atts.length) return;
    setBusy(true);
    try { await addTaskComment(task.id, body, atts); setBody(""); setAtts([]); await loadC(); onChanged(); }
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function delC(c) { if (!await confirmDialog("ลบคอมเมนต์นี้?")) return; try { await deleteTaskComment(c.id); await loadC(); onChanged(); } catch (e) { flash("ลบไม่สำเร็จ", true); } }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-head"><div className="modal-title">{task.title} <span className={"job-badge " + STATUS[task.status].c}>{STATUS[task.status].th}</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          <div className="tb-detail-meta">
            <div><span>ผู้สั่งงาน</span><b>{task.assignerName}</b></div>
            <div><span>ผู้รับมอบหมาย</span><b>{task.assigneeName}</b></div>
            <div><span>ความสำคัญ</span><b style={{ color: PRIO[task.priority]?.c }}>{PRIO[task.priority]?.th}</b></div>
            {task.due_date && <div><span>กำหนดเสร็จ</span><b>{fmtDate(task.due_date)}</b></div>}
            {task.customerName && <div><span>ลูกค้า</span><b>🏢 {task.customerName} {onGoChat && <button className="tb-chat-link" onClick={() => onGoChat(task.customer_id)}>💬 เปิดแชต</button>}</b></div>}
          </div>
          {task.detail && <div className="tb-detail-body">{task.detail}</div>}
          {(task.attachments?.length || 0) > 0 && <div className="tb-attach-grid" style={{ marginBottom: 10 }}>{task.attachments.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div>}

          {canStatus && (
            <div className="tb-status-row"><span>เปลี่ยนสถานะ:</span>
              {["todo", "doing", "done"].map((s) => <button key={s} className={"cat-chip" + (task.status === s ? " on" : "")} onClick={() => onMove(task, s)}
                style={task.status === s ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{STATUS[s].th}</button>)}
              {task.status !== "cancelled" && <button className="cat-chip" style={{ color: "#dc2626" }} onClick={() => onMove(task, "cancelled")}>ยกเลิกงาน</button>}
            </div>
          )}

          <div className="tb-comments">
            <div className="sec-title" style={{ fontSize: 13, marginBottom: 6 }}>คอมเมนต์</div>
            {comments === null && <div className="empty sm">กำลังโหลด…</div>}
            {comments && comments.length === 0 && <div className="empty sm">ยังไม่มีคอมเมนต์</div>}
            {comments && comments.map((c) => (
              <div className="tb-cmt" key={c.id}>
                <div className="tb-cmt-head"><b>{c.authorName}</b><span>{fmtDT(c.created_at)}</span>
                  {(me?.id === c.author) && <button className="tb-cmt-x" onClick={() => delC(c)}><UIcon name="trash" size={12} /></button>}</div>
                {c.body && <div className="tb-cmt-body">{c.body}</div>}
                {(c.attachments?.length || 0) > 0 && <div className="tb-attach-grid">{c.attachments.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="tb-composer">
          <AttachRow files={atts} onChange={setAtts} flash={flash} />
          <div className="tb-composer-row">
            <input className="inp" value={body} onChange={(e) => setBody(e.target.value)} placeholder="เขียนคอมเมนต์…" onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn-primary" disabled={busy || (!body.trim() && !atts.length)} onClick={send}><UIcon name="chat" size={15} color="#fff" /> ส่ง</button>
          </div>
          <div className="tb-detail-actions">
            {canManage && <button className="btn-ghost sm" onClick={() => onEdit(task)}><UIcon name="edit" size={13} /> แก้ไขงาน</button>}
            {canManage && <button className="btn-ghost sm danger" onClick={() => onDelete(task)}><UIcon name="trash" size={13} /> ลบงาน</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
