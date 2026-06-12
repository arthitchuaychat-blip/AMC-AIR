import React from "react";
import { listAllJobs, listMaterials, closeJob, reopenJob } from "../lib/api";
import { fmtBaht, fmtNum } from "../lib/format";
import { UIcon } from "../icons";

const FILTERS = [{ id: "all", label: "ทั้งหมด" }, { id: "open", label: "เปิดอยู่" }, { id: "closed", label: "ปิดแล้ว" }];

export default function Jobs({ role }) {
  const isAdmin = ["admin", "exec", "finance", "stock"].includes(role);
  const [jobs, setJobs] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [expanded, setExpanded] = React.useState({});
  const [toast, setToast] = React.useState(null);

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  async function load() {
    setLoading(true);
    try { const [j, m] = await Promise.all([listAllJobs(), listMaterials()]); setJobs(j); setMats(m); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 2800); }

  const list = jobs.filter((j) => filter === "all" || j.status === filter);
  const openCount = jobs.filter((j) => j.status === "open").length;

  async function close(j) {
    if (!confirm(`ปิดงาน ${j.job_no}?\nต้นทุนงาน = ${fmtBaht(j.usedValue)} (ล็อกแล้วรับคืน/ตัดเสียเพิ่มไม่ได้)`)) return;
    try { await closeJob(j.job_no, j.team, j.usedValue); flash(`ปิดงาน ${j.job_no} แล้ว`); await load(); }
    catch (e) { flash("ปิดงานไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function reopen(j) {
    if (!confirm(`เปิดงาน ${j.job_no} ใหม่?`)) return;
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

      <div className="cat-filter">
        {FILTERS.map((f) => (
          <button key={f.id} className={"cat-chip" + (filter === f.id ? " on" : "")} onClick={() => setFilter(f.id)}
            style={filter === f.id ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{f.label}</button>
        ))}
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && list.length === 0 && <div className="empty">ไม่มีงาน</div>}

      <div className="job-cards">
        {list.map((j) => {
          const open = expanded[j.job_no];
          const closed = j.status === "closed";
          return (
            <div className={"card job-card" + (closed ? " closed" : "")} key={j.job_no}>
              <div className="job-card-head" onClick={() => setExpanded((s) => ({ ...s, [j.job_no]: !s[j.job_no] }))}>
                <div className="job-card-id">
                  <span className="job-no">{j.job_no}</span>
                  <span className={"job-badge " + (closed ? "b-green" : "b-amber")}>{closed ? "ปิดแล้ว" : "เปิดอยู่"}</span>
                </div>
                <div className="job-card-meta">{j.team || "-"} · {j.date} · {j.lines.length} รายการ</div>
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
