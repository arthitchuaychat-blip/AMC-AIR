import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import { listHandovers, deleteHandover, getCompanies, listServiceReminders, setReminderStatus, sendHandoverLine } from "../lib/api";
import { blankHandover } from "../lib/handover";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import { fmtDocDate, matchText, matchPhone } from "../lib/format";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";
import HandoverEditor from "./HandoverEditor";
import JobHandover from "./JobHandover";
import DateRangeBar, { inDateRange } from "./DateRangeBar";

const STATUS = { draft: { th: "ฉบับร่าง", cls: "b-grey" }, submitted: { th: "ส่งแล้ว", cls: "b-green" } };

export default function Handover({ role, me, startJob, onStartConsumed, focusJob, onFocusConsumed }) {
  const canEdit = can(role, "handover", "edit");
  const canDelete = role === "admin";
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // handover object in the editor
  const [printing, setPrinting] = React.useState(null);
  const [statusF, setStatusF] = React.useState("all");
  const [dateR, setDateR] = React.useState({ from: "", to: "" });
  const [search, setSearch] = React.useState("");
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [reminders, setReminders] = React.useState([]);   // นัดบริการรอบถัดไป (mig 192)
  const printWin = React.useRef(null);

  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  async function load() {
    setLoading(true);
    try {
      const [hs, co, rem] = await Promise.all([listHandovers(), getCompanies().catch(() => null), listServiceReminders("open").catch(() => [])]);
      setList(hs); if (co) setCompanies(co); setReminders(rem || []);
    }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  async function reminderDone(r, status) {
    try { await setReminderStatus(r.id, status); setReminders((s) => s.filter((x) => x.id !== r.id)); flash(status === "done" ? "ทำเครื่องหมายว่าจัดการแล้ว ✓" : "ปิดนัดแล้ว"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  React.useEffect(() => { load(); }, []);

  // arriving from "งานของฉัน" / ใบงาน → continue this job's existing draft (กรอกต่อหลังทำเสร็จ),
  // otherwise start a fresh handover for it.
  React.useEffect(() => {
    if (!startJob) return;
    let cancelled = false;
    (async () => {
      let open = null;
      try { const ex = await listHandovers(startJob.job_no); open = (ex || []).find((x) => x.status === "draft"); } catch { /* ignore */ }
      if (!cancelled) { setEditing(open || blankHandover(startJob)); if (open) flash("เปิดร่างเดิมของงานนี้ — กรอกค่า ‘หลัง’ ต่อได้เลย"); }
      onStartConsumed && onStartConsumed();
    })();
    return () => { cancelled = true; };
  }, [startJob]);
  // arriving focused on a job → filter the list to it
  React.useEffect(() => { if (focusJob) { setSearch(focusJob); onFocusConsumed && onFocusConsumed(); } }, [focusJob]);

  React.useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrinting(null); }, 160);
    return () => clearTimeout(t);
  }, [printing]);
  const co = companies.vat?.name ? companies.vat : (companies.novat || {});
  function print(h) { printWin.current = openPrintWindow(); setPrinting(h); }

  async function onSaved() { setEditing(null); await load(); }
  async function del(h) {
    // กติกาบ้าน: ลบต้องมีเหตุผลเสมอ (ลง audit พร้อม snapshot — ใบที่ส่งแล้วมีลายเซ็นลูกค้าเป็นหลักฐานงาน)
    const reason = await confirmDialog({ title: `ลบใบส่งมอบงานนี้? (${h.customer_name || h.job_no || "ไม่ระบุ"})`,
      message: h.status === "submitted" ? "⚠️ ใบนี้ส่งแล้ว (มีลายเซ็น) — ข้อมูลจะถูกเก็บในประวัติการลบ" : "ข้อมูลจะถูกเก็บในประวัติการลบ",
      confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ทำผิดใบ · ซ้ำ", required: true } });
    if (reason === false) return;
    try { await deleteHandover(h.id, reason); flash("ลบแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  // แก้ใบที่ส่งแล้ว (มีลายเซ็นลูกค้า) — ช่างแก้ไม่ได้ (RLS mig 150 บล็อกอยู่แล้ว — ซ่อนปุ่มไม่ให้เสียแรงกรอกฟรี) · ออฟฟิศแก้ได้แต่ต้องยืนยัน
  const canEditRow = (h) => canEdit && !((role === "tech" || role === "assistant") && h.status === "submitted");
  async function startEdit(h) {
    if (h.status === "submitted" && !await confirmDialog("ใบนี้ส่งแล้ว (มีลายเซ็นลูกค้า) — ยืนยันเปิดแก้ไข?")) return;
    setEditing(h);
  }
  const [sending, setSending] = React.useState(null);
  async function sendLine(h) {
    setSending(h.id);
    try {
      const out = await sendHandoverLine(h.id);
      if (out.sent) flash("ส่งให้ลูกค้าทาง LINE แล้ว ✓");
      else { try { await navigator.clipboard.writeText(out.url); } catch { /* ignore */ } flash((out.reason || "ยังไม่ได้ผูก LINE") + " — คัดลอกลิงก์ให้แล้ว วางส่งเองได้เลย", true); }
    } catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setSending(null);
  }
  // ส่ง LINE ได้เฉพาะฝ่ายออฟฟิศ (ตรงกับสิทธิ์ฝั่ง serverless) และเฉพาะใบที่ส่งแล้ว
  const canSendLine = ["admin", "sales", "exec", "finance", "hr"].includes(role);

  const shown = list.filter((h) =>
    (statusF === "all" || h.status === statusF)
    && inDateRange(h.doc_date || h.created_at, dateR)
    && (!search || matchText(search, h.job_no, h.customer_name, h.contact_name, h.doc_ref, h.creatorName) || matchPhone(search, h.contact_phone)));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบส่งมอบงาน <span className="page-title-en">Service Handover</span></h1>
          <p className="page-sub">{list.length} ใบ · {list.filter((h) => h.status === "submitted").length} ส่งแล้ว</p></div>
        {canEdit && <button className="btn-primary" onClick={() => setEditing(blankHandover(null))}><UIcon name="plus" size={16} color="#fff" /> สร้างใบส่งมอบงาน</button>}
      </div>

      {reminders.length > 0 && (
        <div style={{ border: "1.5px solid #38bdf8", background: "#f0f9ff", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: "#0369a1", marginBottom: 6 }}>🔔 นัดบริการรอบถัดไป {reminders.length} รายการ — ตามลูกค้ากลับมาล้าง/PM (รายได้ต่อเนื่อง)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {reminders.map((r) => { const overdue = r.due_date <= new Date().toISOString().slice(0, 10); return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: overdue ? "#b91c1c" : "#0369a1", minWidth: 96 }}>{fmtDocDate(r.due_date)}{overdue ? " ⚠️" : ""}</span>
                <span style={{ flex: "1 1 200px" }}>{r.note || (r.kind === "wash" ? "นัดล้าง" : "นัด PM")} · <b>{r.customer_name || "—"}</b>{r.contact_phone ? ` · ${r.contact_phone}` : ""}{r.job_no ? ` · ${r.job_no}` : ""}</span>
                <button className="btn-ghost sm ok" onClick={() => reminderDone(r, "done")}>✓ นัดแล้ว/เสร็จ</button>
                <button className="btn-ghost sm" onClick={() => reminderDone(r, "dismissed")}>ปิด</button>
              </div>
            ); })}
          </div>
        </div>
      )}

      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ["draft", "ฉบับร่าง"], ["submitted", "ส่งแล้ว"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
        <input className="inp" placeholder="ค้นหา เลขงาน/ลูกค้า/เบอร์โทร" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260, marginLeft: "auto" }} />
      </div>
      <DateRangeBar value={dateR} onChange={setDateR} />

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">ยังไม่มีใบส่งมอบงาน</div>}

      <div className="ho-list">
        {shown.map((h) => {
          const st = STATUS[h.status] || STATUS.draft;
          const machines = (h.forms || []).length;
          return (
            <div className="ho-card" key={h.id}>
              <div className="ho-card-main">
                <div className="ho-card-top">
                  <b>{h.customer_name || "— ไม่ระบุลูกค้า —"}</b>
                  <span className={"job-badge " + st.cls}>{st.th}</span>
                  {h.job_no && <span className="ho-card-job">{h.job_no}</span>}
                </div>
                <div className="ho-card-sub">
                  {fmtDocDate(h.doc_date || h.created_at)} · {machines} แบบฟอร์ม
                  {h.contact_phone ? ` · ${h.contact_phone}` : ""}
                  {h.creatorName ? ` · โดย ${h.creatorName}` : ""}
                </div>
              </div>
              <div className="ho-card-acts">
                <button className="btn-ghost sm" onClick={() => print(h)}><UIcon name="catalog" size={14} /> พิมพ์/PDF</button>
                {canSendLine && h.status === "submitted" && <button className="btn-ghost sm" disabled={sending === h.id} onClick={() => sendLine(h)} title="ส่งลิงก์ใบส่งมอบงานให้ลูกค้าทาง LINE">{sending === h.id ? "กำลังส่ง…" : "💬 ส่ง LINE"}</button>}
                {canEditRow(h) && <button className="btn-ghost sm" onClick={() => startEdit(h)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canDelete && <button className="btn-ghost sm danger" onClick={() => del(h)}><UIcon name="trash" size={14} /></button>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <HandoverEditor initial={editing} me={me} onClose={() => setEditing(null)} onSaved={onSaved} flash={flash} />}
      {printing && <JobHandover handover={printing} company={co} />}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200 }}>{toast.m}</div>}
    </div>
  );
}
