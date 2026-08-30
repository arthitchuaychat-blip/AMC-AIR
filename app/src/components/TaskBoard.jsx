import React from "react";
import { listTasks, saveTask, setTaskStatus, deleteTask, listTaskComments, addTaskComment, deleteTaskComment, uploadTaskFile, listProfiles, listCustomers } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import AttachThumb from "./AttachThumb";
import { UIcon } from "../icons";
import { ATTACH_ACCEPT } from "../lib/format";
import { useLang } from "../lib/i18n";

const STATUS = {
  todo: { th: "รอเริ่ม", my: "မစသေး", c: "b-grey" }, doing: { th: "กำลังทำ", my: "လုပ်နေဆဲ", c: "b-blue" },
  done: { th: "เสร็จ", my: "ပြီးဆုံး", c: "b-green" }, cancelled: { th: "ยกเลิก", my: "ပယ်ဖျက်", c: "b-red" },
};
const COLS = ["todo", "doing", "done"];
const PRIO = { low: { th: "ต่ำ", my: "နိမ့်", c: "#64748b" }, normal: { th: "ปกติ", my: "ပုံမှန်", c: "#2563eb" }, high: { th: "ด่วน", my: "အရေးကြီး", c: "#dc2626" } };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
const fmtDT = (d) => d ? new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function TaskBoard({ role, me, prefill, onPrefillConsumed, focus, onFocusConsumed, onGoChat }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);          // Thai default, Burmese when toggled
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
  const [dragId, setDragId] = React.useState(null);   // การ์ดที่กำลังลาก
  const [overCol, setOverCol] = React.useState(null);  // คอลัมน์ปลายทางที่เมาส์อยู่
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  async function load() {
    setLoading(true);
    try { const [t, s, c] = await Promise.all([listTasks(), listProfiles(), listCustomers()]); setTasks(t); setStaff(s); setCusts(c); }
    catch (e) { flash(L("โหลดไม่สำเร็จ: ", "ဖွင့်၍ မရပါ: ") + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // open the create form prefilled from chat ("สร้างงานติดตาม") — with the linked customer + a title hint
  React.useEffect(() => {
    if (!prefill) return;
    setEditTask({ title: prefill.name ? `ติดตามลูกค้า: ${prefill.name}` : "", detail: "", assignee: "", priority: "normal", due_date: "", attachments: [], customer_id: prefill.customerId || "" });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill]);
  // open a specific task's detail (from a notification / reminder bar) — show cancelled too in case it was
  // id ของงานเป็น uuid (ตัวอักษร) — ห้ามแปลง Number ไม่งั้นได้ NaN แล้วหางานไม่เจอ (แผ่นงานไม่เด้ง)
  React.useEffect(() => { if (focus == null) return; setDetailId(String(focus)); setShowCancelled(true); onFocusConsumed && onFocusConsumed(); }, [focus]);

  const canManage = (t) => myId === t.assigner || role === "admin" || role === "exec";
  const canStatus = (t) => canManage(t) || myId === t.assignee;

  // เห็นเฉพาะงานของตัวเอง: ที่ฉันสั่ง หรือ ที่มอบให้ฉัน (ทุกแท็บกรองในขอบเขตของฉันเสมอ)
  const mine = (t) => t.assigner === myId || t.assignee === myId;
  const scoped = tasks
    .filter((t) => scope === "assigned" ? t.assigner === myId : scope === "received" ? t.assignee === myId : mine(t))
    .filter((t) => personF === "all" || t.assignee === personF || t.assigner === personF);
  const visible = scoped.filter((t) => showCancelled ? true : t.status !== "cancelled");
  const cancelledCount = scoped.filter((t) => t.status === "cancelled").length;
  const detail = detailId ? tasks.find((t) => t.id === detailId) : null;

  async function move(t, status) { try { await setTaskStatus(t.id, status); await load(); } catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်ပါ: ") + (e.message || e), true); } }
  // เรียงในคอลัมน์: ด่วนก่อน → แล้วกำหนดเสร็จใกล้สุดก่อน (ไม่มีกำหนดไปท้าย)
  const PRIO_RANK = { high: 0, normal: 1, low: 2 };
  const sortCol = (arr) => arr.slice().sort((a, b) => { const pr = (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1); if (pr) return pr; const ad = a.due_date || "9999-12-31", bd = b.due_date || "9999-12-31"; return ad < bd ? -1 : ad > bd ? 1 : 0; });
  // ลากการ์ดวางในคอลัมน์ → เปลี่ยนสถานะ (เฉพาะคนที่มีสิทธิ์เปลี่ยนสถานะงานนั้น)
  async function onDropCol(sv) {
    const t = tasks.find((x) => x.id === dragId); setDragId(null); setOverCol(null);
    if (!t || t.status === sv) return;
    if (!canStatus(t)) return flash(L("ไม่มีสิทธิ์ย้ายงานนี้", "ဤအလုပ်ကို ရွှေ့ခွင့် မရှိ"), true);
    await move(t, sv);
  }
  async function del(t) { if (!await confirmDialog(L(`ลบงาน "${t.title}" ? (กู้คืนไม่ได้)`, `အလုပ် "${t.title}" ဖျက်မလား? (ပြန်ရမည်မဟုတ်)`))) return; try { await deleteTask(t.id); setDetailId(null); flash(L("ลบแล้ว", "ဖျက်ပြီး")); await load(); } catch (e) { flash(L("ลบไม่สำเร็จ: ", "ဖျက်၍ မရပါ: ") + (e.message || e), true); } }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">{L("กระดานสั่งงาน", "အလုပ် ဘုတ်")} <span className="page-title-en">Task Board</span></h1>
          <p className="page-sub">{L("สั่งงาน · มอบหมาย · แนบไฟล์/รูป · คอมเมนต์ · ลากการ์ดเปลี่ยนสถานะ · เรียงด่วน/ใกล้กำหนดขึ้นก่อน", "အလုပ်ခွဲဝေ · တာဝန်ပေး · ဖိုင်/ဓာတ်ပုံ တွဲ · မှတ်ချက် · ကတ်ဆွဲ၍ အခြေအနေ ပြောင်း")}</p></div>
        <button className="btn-primary" onClick={() => setEditTask({ title: "", detail: "", assignee: "", priority: "normal", due_date: "", attachments: [], customer_id: "" })}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> {L("สั่งงานใหม่", "အလုပ်အသစ် ခွဲဝေ")}</button>
      </div>

      <div className="cat-filter">
        {[["all", L("ของฉันทั้งหมด", "ကျွန်ုပ်၏ အားလုံး")], ["assigned", L("งานที่ฉันสั่ง", "ကျွန်ုပ် ခွဲဝေသော အလုပ်")], ["received", L("งานที่มอบให้ฉัน", "ကျွန်ုပ်ကို ပေးအပ်သော အလုပ်")]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (scope === v ? " on" : "")} onClick={() => setScope(v)}
            style={scope === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
        {cancelledCount > 0 && <button className={"cat-chip" + (showCancelled ? " on" : "")} onClick={() => setShowCancelled((v) => !v)}
          style={showCancelled ? { background: "#dc2626", color: "#fff", borderColor: "#dc2626" } : {}}>{L("ยกเลิก", "ပယ်ဖျက်")} ({cancelledCount})</button>}
        {(() => {
          const ids = new Set(); tasks.forEach((t) => { if (t.assignee) ids.add(t.assignee); if (t.assigner) ids.add(t.assigner); });
          const opts = staff.filter((p) => ids.has(p.id));
          if (!opts.length) return null;
          return (
            <select className="inp" style={{ width: "auto", flex: "none", marginLeft: 4 }} value={personF} onChange={(e) => setPersonF(e.target.value)}>
              <option value="all">👤 {L("ทุกพนักงาน", "ဝန်ထမ်းအားလုံး")}</option>
              {opts.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
            </select>
          );
        })()}
      </div>

      {loading ? <div className="empty">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div> : (
        <div className="tb-board">
          {COLS.map((sv) => {
            const col = sortCol(visible.filter((t) => t.status === sv));
            return (
              <div className={"tb-col" + (overCol === sv ? " tb-col-over" : "")} key={sv}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverCol(sv); } }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); onDropCol(sv); }}>
                <div className="tb-col-head"><span className={"job-badge " + STATUS[sv].c}>{L(STATUS[sv].th, STATUS[sv].my)}</span><span className="tb-col-n">{col.length}</span></div>
                <div className="tb-col-body">
                  {col.length === 0 && <div className="tb-empty">— {L("ว่าง · ลากการ์ดมาวางได้", "ဗလာ")} —</div>}
                  {col.map((t) => (
                    <div role="button" tabIndex={0} className={"tb-card" + (dragId === t.id ? " tb-card-drag" : "")} key={t.id}
                      draggable={canStatus(t)}
                      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => setDetailId(t.id)} onKeyDown={(e) => { if (e.key === "Enter") setDetailId(t.id); }}>
                      <div className="tb-card-top">
                        <span className="tb-prio" style={{ background: PRIO[t.priority]?.c || "#2563eb" }} title={L("ความสำคัญ: ", "ဦးစားပေး: ") + (PRIO[t.priority] ? L(PRIO[t.priority].th, PRIO[t.priority].my) : "")} />
                        <span className="tb-card-title">{t.title}</span>
                      </div>
                      <div className="tb-card-meta">
                        <span>👤 {t.assigneeName}</span>
                        {t.due_date && <span className="tb-due">📅 {fmtDate(t.due_date)}</span>}
                      </div>
                      {t.customerName && <div className="tb-card-cust" onClick={(e) => { e.stopPropagation(); onGoChat && onGoChat(t.customer_id); }} role="button" title={L("เปิดแชตลูกค้า", "ဖောက်သည် ချက်ဖွင့်ရန်")}>🏢 {t.customerName} <span className="tb-card-chat">💬 {L("แชต", "ချက်")}</span></div>}
                      <div className="tb-card-foot">
                        {(t.attachments?.length || 0) > 0 && <span>📎 {t.attachments.length}</span>}
                        {t.commentCount > 0 && <span>💬 {t.commentCount}</span>}
                        <span className="tb-by">{L("สั่งโดย", "ခွဲဝေသူ")} {t.assignerName}</span>
                      </div>
                    </div>
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
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const inp = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  async function pick(e) {
    const list = Array.from(e.target.files || []); e.target.value = "";
    if (!list.length) return;
    setBusy(true);
    try { const urls = []; for (const f of list) urls.push(await uploadTaskFile(f)); onChange([...(files || []), ...urls]); }
    catch (err) { flash(L("อัปโหลดไม่สำเร็จ: ", "တင်၍ မရပါ: ") + (err.message || err), true); }
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
      <button type="button" className="btn-ghost sm" disabled={busy} onClick={() => inp.current?.click()}><UIcon name="plus" size={13} /> {busy ? L("กำลังอัปโหลด…", "တင်နေသည်…") : L("แนบไฟล์/รูป", "ဖိုင်/ဓာတ်ပုံ တွဲ")}</button>
    </div>
  );
}

function TaskEditor({ task, staff, custs = [], onClose, onSaved, flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [f, setF] = React.useState(task);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.title?.trim()) return flash(L("ใส่ชื่องานก่อน", "အလုပ်အမည် အရင်ဖြည့်ပါ"), true);
    setBusy(true);
    try { await saveTask(f); flash(f.id ? L("บันทึกงานแล้ว ✓", "အလုပ် သိမ်းပြီး ✓") : L("สั่งงานแล้ว ✓", "အလုပ် ခွဲဝေပြီး ✓")); onSaved(); }
    catch (e) { flash(L("บันทึกไม่สำเร็จ: ", "သိမ်း၍ မရပါ: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div className="modal-head"><div className="modal-title">{f.id ? L("แก้ไขงาน", "အလုပ် ပြင်ဆင်") : L("สั่งงานใหม่", "အလုပ်အသစ် ခွဲဝေ")}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>{L("ชื่องาน", "အလုပ်အမည်")}</span><input className="inp" value={f.title} autoFocus onChange={(e) => set("title", e.target.value)} placeholder={L("เช่น ไปเก็บเงินลูกค้า / เตรียมของเข้างานพรุ่งนี้", "ဥပမာ - ဖောက်သည်ဆီ ငွေသွားကောက် / မနက်ဖြန်အလုပ်အတွက် ပစ္စည်းပြင်ဆင်")} /></label>
          <label className="fld"><span>{L("รายละเอียด", "အသေးစိတ်")}</span><textarea className="inp" rows={3} style={{ resize: "vertical" }} value={f.detail} onChange={(e) => set("detail", e.target.value)} placeholder={L("อธิบายงานที่ต้องทำ", "လုပ်ရမည့် အလုပ်ကို ရှင်းပြပါ")} /></label>
          <div className="fld-row">
            <label className="fld"><span>{L("มอบหมายให้", "တာဝန်ပေးရန်")}</span>
              <select className="inp" value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
                <option value="">— {L("เลือกผู้รับมอบหมาย", "တာဝန်ခံ ရွေးပါ")} —</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
              </select></label>
            <label className="fld"><span>{L("ความสำคัญ", "ဦးစားပေး")}</span>
              <select className="inp" value={f.priority} onChange={(e) => set("priority", e.target.value)}>
                <option value="low">{L("ต่ำ", "နိမ့်")}</option><option value="normal">{L("ปกติ", "ပုံမှန်")}</option><option value="high">{L("ด่วน", "အရေးကြီး")}</option>
              </select></label>
          </div>
          <label className="fld"><span>{L("ลูกค้าที่เกี่ยวข้อง (ไม่บังคับ · ใช้ติดตามลูกค้า)", "သက်ဆိုင်သော ဖောက်သည် (မဖြစ်မနေမဟုတ် · ဖောက်သည် ခြေရာခံရန်)")}</span>
            <Combo className="inp" value={f.customer_id || ""} onChange={(e) => set("customer_id", e.target.value)} placeholder={L("— ไม่ผูกกับลูกค้า —", "— ဖောက်သည်နှင့် မချိတ် —")}>
              <option value="">— {L("ไม่ผูกกับลูกค้า", "ဖောက်သည်နှင့် မချိတ်")} —</option>
              {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Combo></label>
          <label className="fld"><span>{L("กำหนดเสร็จ (ไม่บังคับ)", "ပြီးရမည့်ရက် (မဖြစ်မနေမဟုတ်)")}</span><input className="inp" type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></label>
          <div className="fld"><span>{L("ไฟล์/รูปแนบ", "တွဲဖိုင်/ဓာတ်ပုံ")}</span><AttachRow files={f.attachments} onChange={(a) => set("attachments", a)} flash={flash} /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>{L("ยกเลิก", "မလုပ်တော့")}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{f.id ? L("บันทึก", "သိမ်းရန်") : L("สั่งงาน", "အလုပ်ခွဲဝေ")}</button></div>
      </div>
    </div>
  );
}

function TaskDetail({ task, me, canManage, canStatus, onGoChat, onClose, onMove, onEdit, onDelete, onChanged, flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [comments, setComments] = React.useState(null);
  const [body, setBody] = React.useState("");
  const [atts, setAtts] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  async function loadC() { try { setComments(await listTaskComments(task.id)); } catch (e) { flash(L("โหลดคอมเมนต์ไม่สำเร็จ", "မှတ်ချက် ဖွင့်၍ မရပါ"), true); } }
  React.useEffect(() => { loadC(); }, [task.id]);
  async function send() {
    if (!body.trim() && !atts.length) return;
    setBusy(true);
    try { await addTaskComment(task.id, body, atts); setBody(""); setAtts([]); await loadC(); onChanged(); }
    catch (e) { flash(L("ส่งไม่สำเร็จ: ", "ပို့၍ မရပါ: ") + (e.message || e), true); }
    setBusy(false);
  }
  async function delC(c) { if (!await confirmDialog(L("ลบคอมเมนต์นี้?", "ဒီမှတ်ချက် ဖျက်မလား?"))) return; try { await deleteTaskComment(c.id); await loadC(); onChanged(); } catch (e) { flash(L("ลบไม่สำเร็จ", "ဖျက်၍ မရပါ"), true); } }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-head"><div className="modal-title">{task.title} <span className={"job-badge " + STATUS[task.status].c}>{L(STATUS[task.status].th, STATUS[task.status].my)}</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          <div className="tb-detail-meta">
            <div><span>{L("ผู้สั่งงาน", "အလုပ်ပေးသူ")}</span><b>{task.assignerName}</b></div>
            <div><span>{L("ผู้รับมอบหมาย", "တာဝန်ခံ")}</span><b>{task.assigneeName}</b></div>
            <div><span>{L("ความสำคัญ", "ဦးစားပေး")}</span><b style={{ color: PRIO[task.priority]?.c }}>{PRIO[task.priority] ? L(PRIO[task.priority].th, PRIO[task.priority].my) : ""}</b></div>
            {task.due_date && <div><span>{L("กำหนดเสร็จ", "ပြီးရမည့်ရက်")}</span><b>{fmtDate(task.due_date)}</b></div>}
            {task.customerName && <div><span>{L("ลูกค้า", "ဖောက်သည်")}</span><b>🏢 {task.customerName} {onGoChat && <button className="tb-chat-link" onClick={() => onGoChat(task.customer_id)}>💬 {L("เปิดแชต", "ချက်ဖွင့်")}</button>}</b></div>}
          </div>
          {task.detail && <div className="tb-detail-body">{task.detail}</div>}
          {(task.attachments?.length || 0) > 0 && <div className="tb-attach-grid" style={{ marginBottom: 10 }}>{task.attachments.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div>}

          {canStatus && (
            <div className="tb-status-row"><span>{L("เปลี่ยนสถานะ:", "အခြေအနေ ပြောင်း:")}</span>
              {["todo", "doing", "done"].map((s) => <button key={s} className={"cat-chip" + (task.status === s ? " on" : "")} onClick={() => onMove(task, s)}
                style={task.status === s ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{L(STATUS[s].th, STATUS[s].my)}</button>)}
              {task.status !== "cancelled" && <button className="cat-chip" style={{ color: "#dc2626" }} onClick={() => onMove(task, "cancelled")}>{L("ยกเลิกงาน", "အလုပ် ပယ်ဖျက်")}</button>}
            </div>
          )}

          <div className="tb-comments">
            <div className="sec-title" style={{ fontSize: 13, marginBottom: 6 }}>{L("คอมเมนต์", "မှတ်ချက်")}</div>
            {comments === null && <div className="empty sm">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div>}
            {comments && comments.length === 0 && <div className="empty sm">{L("ยังไม่มีคอมเมนต์", "မှတ်ချက် မရှိသေးပါ")}</div>}
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
            <input className="inp" value={body} onChange={(e) => setBody(e.target.value)} placeholder={L("เขียนคอมเมนต์…", "မှတ်ချက် ရေးရန်…")} onKeyDown={(e) => { if (e.nativeEvent?.isComposing || e.keyCode === 229) return; if (e.key === "Enter") send(); }} />
            <button className="btn-primary" disabled={busy || (!body.trim() && !atts.length)} onClick={send}><UIcon name="chat" size={15} color="#fff" /> {L("ส่ง", "ပို့")}</button>
          </div>
          <div className="tb-detail-actions">
            {canManage && <button className="btn-ghost sm" onClick={() => onEdit(task)}><UIcon name="edit" size={13} /> {L("แก้ไขงาน", "အလုပ် ပြင်ဆင်")}</button>}
            {canManage && <button className="btn-ghost sm danger" onClick={() => onDelete(task)}><UIcon name="trash" size={13} /> {L("ลบงาน", "အလုပ် ဖျက်")}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
