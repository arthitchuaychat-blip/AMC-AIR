import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import { listAllJobs, listMaterials, listJobBriefs, closeJob, reopenJob } from "../lib/api";
import { fmtBaht, fmtNum, matchText } from "../lib/format";
import { JOB_STATUSES, jobStatusDef } from "../lib/schedule";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";

const FILTERS = [{ id: "all", label: "ทั้งหมด" }, { id: "open", label: "เปิดอยู่" }, { id: "closed", label: "ปิดแล้ว" }];

export default function Jobs({ role }) {
  const isAdmin = can(role, "jobs", "edit");
  const [jobs, setJobs] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [briefs, setBriefs] = React.useState({});   // job_no → สถานะใบงาน + ลูกค้า + ชื่องาน
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [statusF, setStatusF] = React.useState("all");   // ตัวกรองสถานะใบงาน (นัดแล้ว/กำลังทำงาน/เสร็จ ฯลฯ)
  const [q, setQ] = React.useState("");
  const [expanded, setExpanded] = React.useState({});
  const [toast, setToast] = React.useState(null);

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  async function load() {
    setLoading(true);
    try {
      const [j, m, b] = await Promise.all([listAllJobs(), listMaterials(), listJobBriefs().catch(() => ({}))]);
      setJobs(j); setMats(m); setBriefs(b);
    }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 2800); }

  const list = jobs.filter((j) => (filter === "all" || j.status === filter)
    && (statusF === "all" || (statusF === "none" ? !briefs[j.job_no] : briefs[j.job_no]?.status === statusF))
    && (matchText(q, j.job_no, j.team, briefs[j.job_no]?.customerName, briefs[j.job_no]?.title) || (j.lines || []).some((l) => matchText(q, l.code, matMap[l.code]?.th))));
  const openCount = jobs.filter((j) => j.status === "open").length;
  // ชิปสถานะใบงาน — โชว์เฉพาะสถานะที่มีงานอยู่จริง (+ งานที่ไม่ผูกใบงาน ถ้ามี)
  const stCount = (s) => jobs.filter((j) => briefs[j.job_no]?.status === s).length;
  const noneCount = jobs.filter((j) => !briefs[j.job_no]).length;

  async function close(j) {
    if (!await confirmDialog(`ปิดงาน ${j.job_no}?\nต้นทุนงาน = ${fmtBaht(j.usedValue)} (ล็อกแล้วรับคืน/ตัดเสียเพิ่มไม่ได้)`)) return;
    try { await closeJob(j.job_no, j.team, j.usedValue); flash(`ปิดงาน ${j.job_no} แล้ว`); await load(); }
    catch (e) { flash("ปิดงานไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function reopen(j) {
    if (!await confirmDialog(`เปิดงาน ${j.job_no} ใหม่?`)) return;
    try { await reopenJob(j.job_no); flash(`เปิดงาน ${j.job_no} ใหม่แล้ว`); await load(); }
    catch (e) { flash("เปิดงานไม่สำเร็จ: " + (e.message || e), true); }
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">งาน <span className="page-title-en">Jobs &amp; Cost</span></h1>
          <p className="page-sub">ต้นทุนวัสดุต่องาน (เบิก − คืน) · ปิดงานเพื่อล็อกต้นทุน</p>
        </div>
        <div className="adm-head-stat">
          <div className="mini-stat"><span>งานเปิดอยู่</span><b>{openCount}</b></div>
          <div className="mini-stat"><span>ทั้งหมด</span><b>{jobs.length}</b></div>
        </div>
      </div>

      <div className="cat-filter" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={"cat-chip" + (filter === f.id ? " on" : "")} onClick={() => setFilter(f.id)}
              style={filter === f.id ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{f.label}</button>
          ))}
        </div>
        <div className="cat-search">
          <UIcon name="search" size={17} color="var(--ink-3)" />
          <input placeholder="ค้นหาเลขงาน / ทีม / ลูกค้า / วัสดุ" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
        </div>
      </div>

      {/* ตัวกรองสถานะใบงาน — โชว์เฉพาะสถานะที่มีอยู่จริง */}
      <div className="cat-filter" style={{ marginTop: 2, alignItems: "center" }}>
        <span className="jo-dim" style={{ fontSize: 12.5, fontWeight: 700 }}>สถานะงาน:</span>
        <button className={"cat-chip" + (statusF === "all" ? " on" : "")} onClick={() => setStatusF("all")}
          style={statusF === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทั้งหมด</button>
        {JOB_STATUSES.filter(([v]) => stCount(v) > 0).map(([v, l, , color]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(statusF === v ? "all" : v)}
            style={statusF === v ? { background: color, color: "#fff", borderColor: color } : { color }}>{l} ({stCount(v)})</button>
        ))}
        {noneCount > 0 && (
          <button className={"cat-chip" + (statusF === "none" ? " on" : "")} onClick={() => setStatusF(statusF === "none" ? "all" : "none")}
            style={statusF === "none" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ไม่ผูกใบงาน ({noneCount})</button>
        )}
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && list.length === 0 && <div className="empty">ไม่มีงาน</div>}

      <div className="job-cards">
        {list.map((j) => {
          const open = expanded[j.job_no];
          const closed = j.status === "closed";
          const b = briefs[j.job_no];
          const st = b ? jobStatusDef(b.status) : null;
          return (
            <div className={"card job-card" + (closed ? " closed" : "")} key={j.job_no}>
              <div className="job-card-head" onClick={() => setExpanded((s) => ({ ...s, [j.job_no]: !s[j.job_no] }))}>
                <div className="job-card-id">
                  <span className="job-no">{j.job_no}</span>
                  <span className={"job-badge " + (closed ? "b-green" : "b-amber")}>{closed ? "ปิดแล้ว" : "เปิดอยู่"}</span>
                  {st && <span className={"job-badge " + st[2]}>{st[1]}</span>}
                </div>
                <div className="job-card-meta">
                  {b && (b.customerName || b.title) && (
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {b.customerName && <>👤 {b.customerName}</>}
                      {b.title && <span className="jo-dim" style={{ fontWeight: 400 }}>{b.customerName ? " · " : ""}📋 {b.title}</span>}
                    </div>
                  )}
                  <div>{j.team || "-"} · {j.date} · {j.lines.length} รายการ{b?.contact ? ` · ${b.contact}` : ""}{b?.phone ? ` · 📞 ${b.phone}` : ""}</div>
                </div>
                <div className="job-card-cost">
                  <span>ต้นทุนงาน</span>
                  <b>{fmtBaht(j.usedValue)}</b>
                </div>
                <UIcon name="chevD" size={16} color="var(--ink-3)" style={{ transform: open ? "rotate(180deg)" : "none", transition: ".15s" }} />
              </div>

              {open && (
                <div className="job-lines">
                  <div className="job-lrow job-lrow-h"><span>วัสดุ</span><span className="c">เบิก</span><span className="c">คืน</span><span className="c">เสีย</span><span className="c">ใช้จริง</span><span className="r">มูลค่า</span></div>
                  {j.lines.map((l) => {
                    const m = matMap[l.code];
                    return (
                      <div className="job-lrow" key={l.code}>
                        <span className="job-lname">{m?.th || l.code}</span>
                        <span className="c">{fmtNum(l.withdrawn)}</span>
                        <span className="c" style={{ color: "var(--up)" }}>{fmtNum(l.returned)}</span>
                        <span className="c" style={{ color: "var(--down)" }}>{fmtNum(l.damaged)}</span>
                        <span className="c"><b>{fmtNum(l.used)}</b> {m?.unit || ""}</span>
                        <span className="r">{fmtBaht(l.used * l.unitCost)}</span>
                      </div>
                    );
                  })}
                  <div className="job-actions">
                    {!closed && isAdmin && <button className="btn-primary" onClick={() => close(j)}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> ปิดงาน · ล็อกต้นทุน</button>}
                    {closed && <span className="job-closed-note">ปิดเมื่อ {j.closed_at ? new Date(j.closed_at).toLocaleDateString("th-TH") : "-"}</span>}
                    {closed && isAdmin && <button className="btn-ghost" onClick={() => reopen(j)}>เปิดงานใหม่</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600,
          padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center",
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
