import React from "react";
import { listCashEntries, addCashEntry, updateCashEntry, deleteCashEntry, getOpeningBalance, setOpeningBalance, syncCashEntriesFromDocs } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";
import { UIcon } from "../icons";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayYmd = () => ymd(new Date());
const thMonth = (d) => d.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
const thDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const SRC = { invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จ", payout: "ช่างซัพ", po: "ใบสั่งซื้อ", manual: "เพิ่มเอง" };

export default function CashFlow() {
  const [entries, setEntries] = React.useState([]);
  const [opening, setOpening] = React.useState(0);
  const [openingInput, setOpeningInput] = React.useState("");
  const [anchor, setAnchor] = React.useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [withProj, setWithProj] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [edit, setEdit] = React.useState(null); // entry being added/edited
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  async function load() {
    setLoading(true);
    try { const [e, ob] = await Promise.all([listCashEntries(), getOpeningBalance()]); setEntries(e); setOpening(ob); setOpeningInput(String(ob || 0)); }
    catch (err) { flash("โหลดไม่สำเร็จ: " + (err.message || err), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const monthStart = ymd(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const monthEnd = ymd(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
  const move = (n) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + n, 1));

  const sgn = (e) => (e.direction === "in" ? 1 : -1);
  const ents = React.useMemo(() => entries.filter((e) => e.source_type !== "opening"), [entries]);

  // running balances carried into this month
  let priorActual = opening, priorForecast = opening;
  ents.forEach((e) => { if (e.entry_date < monthStart) { const v = sgn(e) * (Number(e.amount) || 0); priorForecast += v; if (e.status === "actual") priorActual += v; } });

  // group this month's entries by date
  const inMonth = ents.filter((e) => e.entry_date >= monthStart && e.entry_date <= monthEnd);
  const byDate = {}; inMonth.forEach((e) => { (byDate[e.entry_date] = byDate[e.entry_date] || []).push(e); });
  const dates = Object.keys(byDate).sort();

  // month KPIs
  const sum = (f) => inMonth.filter(f).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const actIn = sum((e) => e.status === "actual" && e.direction === "in");
  const actOut = sum((e) => e.status === "actual" && e.direction === "out");
  const projIn = sum((e) => e.status === "projected" && e.direction === "in");
  const projOut = sum((e) => e.status === "projected" && e.direction === "out");

  async function saveOpening() {
    const v = Number(openingInput) || 0; if (v === opening) return;
    try { await setOpeningBalance(v); setOpening(v); flash("บันทึกเงินสดยกมาแล้ว ✓"); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function sync() {
    setBusy(true);
    try { const r = await syncCashEntriesFromDocs(); flash(`ซิงค์จากเอกสารแล้ว ✓ เพิ่ม ${r.added} · อัปเดต ${r.updated}`); await load(); }
    catch (e) { flash("ซิงค์ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function removeEntry(e) {
    if (!await confirmDialog(`ลบรายการนี้? (${fmtBaht(e.amount)})`)) return;
    try { await deleteCashEntry(e.id); flash("ลบแล้ว"); await load(); } catch (err) { flash("ลบไม่สำเร็จ: " + (err.message || err), true); }
  }

  // running balance accumulators walked day by day
  let runA = priorActual, runF = priorForecast;

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">กระแสเงินสด <span className="page-title-en">Cash Flow</span></h1>
          <p className="page-sub">เงินเข้า-ออกรายวัน · ช่องประมาณการ (ใบแจ้งหนี้/ค้างจ่าย) เทียบกับรับ-จ่ายจริง (ใบเสร็จ/จ่ายแล้ว)</p></div>
        <div className="cat-head-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="seg">
            <button className={"seg-btn" + (!withProj ? " on" : "")} onClick={() => setWithProj(false)}>จริง</button>
            <button className={"seg-btn" + (withProj ? " on" : "")} onClick={() => setWithProj(true)}>จริง + คาดการณ์</button>
          </div>
          <button className="btn-ghost sm" disabled={busy} onClick={sync}><UIcon name="withdraw" size={15} /> ซิงค์จากเอกสาร</button>
          <button className="btn-primary sm" onClick={() => setEdit({ direction: "in", status: "actual", entry_date: todayYmd(), amount: "", note: "" })}><UIcon name="plus" size={15} color="#fff" /> เพิ่มรายการ</button>
        </div>
      </div>

      <div className="cf-bar">
        <div className="sched-nav">
          <button className="btn-ghost sm" onClick={() => move(-1)}><UIcon name="chevR" size={15} style={{ transform: "rotate(180deg)" }} /></button>
          <button className="btn-ghost sm" onClick={() => setAnchor(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })}>เดือนนี้</button>
          <button className="btn-ghost sm" onClick={() => move(1)}><UIcon name="chevR" size={15} /></button>
          <div className="sched-title">{thMonth(anchor)}</div>
        </div>
        <label className="cf-opening">เงินสดยกมา <span className="inp inp-unit" style={{ width: 150 }}><span className="unit-pre">฿</span>
          <input type="number" value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} onBlur={saveOpening} /></span></label>
      </div>

      {loading ? <div className="empty">กำลังโหลด…</div> : (
        <>
          <div className="kpi-grid">
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{fmtBaht(actIn)}</div><div className="stat-label">รับจริง (เดือนนี้)</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--down)" }}>−{fmtBaht(actOut)}</div><div className="stat-label">จ่ายจริง (เดือนนี้)</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: (actIn - actOut) >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(actIn - actOut)}</div><div className="stat-label">สุทธิจริง</div></div>
            {withProj && <div className="stat-card"><div className="stat-val" style={{ color: "#2563eb" }}>{fmtBaht(projIn)}</div><div className="stat-label">คาดว่าจะรับ (ค้างรับ)</div></div>}
            {withProj && <div className="stat-card"><div className="stat-val" style={{ color: "#d97706" }}>−{fmtBaht(projOut)}</div><div className="stat-label">คาดว่าจะจ่าย (ค้างจ่าย)</div></div>}
          </div>

          <div className="cf-carry">ยอดยกมาต้นเดือน · เงินจริง <b>{fmtBaht(priorActual)}</b>{withProj && <> · คาดการณ์ <b style={{ color: "#2563eb" }}>{fmtBaht(priorForecast)}</b></>}</div>

          {dates.length === 0 && <div className="empty">ยังไม่มีรายการในเดือนนี้ — กด “ซิงค์จากเอกสาร” หรือ “เพิ่มรายการ”</div>}

          {dates.map((d) => {
            const dayEnts = byDate[d];
            const proj = dayEnts.filter((e) => e.status === "projected");
            const act = dayEnts.filter((e) => e.status === "actual");
            const actNet = act.reduce((a, e) => a + sgn(e) * (Number(e.amount) || 0), 0);
            const projNet = proj.reduce((a, e) => a + sgn(e) * (Number(e.amount) || 0), 0);
            runA += actNet; runF += actNet + projNet;
            return (
              <div className="cf-day" key={d}>
                <div className="cf-day-head">
                  <span className="cf-day-date">{thDate(d)}</span>
                  <span className="cf-day-bal">เงินจริงสะสม <b style={{ color: runA >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(runA)}</b>
                    {withProj && <> · คาดการณ์ <b style={{ color: "#2563eb" }}>{fmtBaht(runF)}</b></>}</span>
                </div>
                <div className={"cf-cols" + (withProj ? "" : " single")}>
                  {withProj && <CfCol title="ประมาณการ" entries={proj} onEdit={setEdit} onDel={removeEntry} />}
                  <CfCol title="รับ-จ่ายจริง" entries={act} onEdit={setEdit} onDel={removeEntry} />
                </div>
              </div>
            );
          })}
        </>
      )}

      {edit && <CashEntryModal entry={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function CfCol({ title, entries, onEdit, onDel }) {
  return (
    <div className="cf-col">
      <div className="cf-col-title">{title}</div>
      {entries.length === 0 && <div className="cf-col-empty">—</div>}
      {entries.map((e) => {
        const inn = e.direction === "in";
        return (
          <div className="cf-line" key={e.id}>
            <span className="cf-amt" style={{ color: inn ? "var(--up)" : "var(--down)" }}>{inn ? "+" : "−"}{fmtBaht(e.amount)}</span>
            <span className="cf-note">{e.note || "(ไม่มีโน้ต)"}<span className="cf-src">{SRC[e.source_type] || e.source_type}</span></span>
            <span className="cf-acts">
              <button className="cf-ic" title="แก้ไข" onClick={() => onEdit({ ...e })}><UIcon name="edit" size={13} /></button>
              <button className="cf-ic danger" title="ลบ" onClick={() => onDel(e)}><UIcon name="trash" size={13} /></button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CashEntryModal({ entry, onClose, onSaved, flash }) {
  const isNew = !entry.id;
  const [f, setF] = React.useState({ direction: entry.direction || "in", status: entry.status || "actual", entry_date: entry.entry_date || todayYmd(), amount: entry.amount ?? "", note: entry.note || "" });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!(Number(f.amount) > 0)) return flash("ใส่จำนวนเงินก่อน", true);
    if (!f.entry_date) return flash("เลือกวันที่ก่อน", true);
    setBusy(true);
    try {
      if (isNew) await addCashEntry(f);
      else await updateCashEntry(entry.id, f);
      flash("บันทึกแล้ว ✓"); onSaved();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">{isNew ? "เพิ่มรายการเงินสด" : "แก้ไขรายการ"}{!isNew && entry.source_type !== "manual" && <span>จาก {SRC[entry.source_type] || entry.source_type}</span>}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>ประเภท</span>
              <select className="inp" value={f.direction} onChange={(e) => set("direction", e.target.value)}>
                <option value="in">เงินเข้า (รับ)</option><option value="out">เงินออก (จ่าย)</option>
              </select></label>
            <label className="fld"><span>สถานะ</span>
              <select className="inp" value={f.status} onChange={(e) => set("status", e.target.value)}>
                <option value="actual">จริง (เกิดขึ้นแล้ว)</option><option value="projected">ประมาณการ</option>
              </select></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={f.entry_date} onChange={(e) => set("entry_date", e.target.value)} /></label>
            <label className="fld"><span>จำนวนเงิน</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></span></label>
          </div>
          <label className="fld"><span>โน้ต (เป็นยอดอะไร)</span><input className="inp" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น เงินเดือน, ค่าเช่า, มัดจำลูกค้า A" /></label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{isNew ? "เพิ่ม" : "บันทึก"}</button></div>
      </div>
    </div>
  );
}
