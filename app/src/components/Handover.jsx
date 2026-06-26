import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import { listHandovers, deleteHandover, getCompanies } from "../lib/api";
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
  const printWin = React.useRef(null);

  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  async function load() {
    setLoading(true);
    try { const [hs, co] = await Promise.all([listHandovers(), getCompanies().catch(() => null)]); setList(hs); if (co) setCompanies(co); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  // arriving from "งานของฉัน" / ใบงาน with a job to start a new handover for
  React.useEffect(() => {
    if (!startJob) return;
    setEditing(blankHandover(startJob));
    onStartConsumed && onStartConsumed();
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
    if (!await confirmDialog(`ลบใบส่งมอบงานนี้? (${h.customer_name || h.job_no || "ไม่ระบุ"})`)) return;
    try { await deleteHandover(h.id); flash("ลบแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }

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
                {canEdit && <button className="btn-ghost sm" onClick={() => setEditing(h)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canDelete && <button className="btn-ghost sm danger" onClick={() => del(h)}><UIcon name="trash" size={14} /></button>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <HandoverEditor initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} flash={flash} />}
      {printing && <JobHandover handover={printing} company={co} />}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200 }}>{toast.m}</div>}
    </div>
  );
}
