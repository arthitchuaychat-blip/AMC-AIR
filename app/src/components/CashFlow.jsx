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
const thShort = (s) => new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const thMonthKey = (k) => new Date(k + "-01T00:00:00").toLocaleDateString("th-TH", { month: "long", year: "numeric" });
const weekStartYmd = (s) => { const d = new Date(s + "T00:00:00"); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); };
const weekEndYmd = (startYmd) => { const d = new Date(startYmd + "T00:00:00"); d.setDate(d.getDate() + 6); return ymd(d); };
const SRC = { invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จ", payout: "ช่างซัพ", labor_owed: "ค่าแรงช่างซัพ (รอเบิก)", po: "ใบสั่งซื้อ", manual: "เพิ่มเอง", salary: "เงินเดือน", expense: "เบิกจ่าย", expense_paid: "เบิกจ่าย (จ่ายแล้ว)", expense_due: "เบิกจ่าย (ค้างจ่าย)", advance: "เบิกเงินล่วงหน้า", loan: "ค่างวดผ่อน (สินเชื่อ)" };
const GRAINS = [["day", "รายวัน"], ["week", "สัปดาห์"], ["month", "เดือน"], ["year", "ปี"]];
// จัดหมวดเงินออกจาก source_type — ใช้ทั้งสรุปแยกหมวด + ส่งออก CSV
const CAT = (e) => {
  const s = e.source_type;
  if (s === "salary" || s === "advance") return "คน (เงินเดือน/เบิกล่วงหน้า)";
  if (s === "po") return "วัสดุ/สั่งซื้อ (PO)";
  if (s === "payout" || s === "labor_owed") return "ช่างซัพ";
  if (s === "expense_paid" || s === "expense_due" || s === "expense") return "เบิกจ่าย";
  if (s === "loan") return "ค่างวดผ่อน (สินเชื่อ)";
  if (s === "invoice" || s === "receipt") return "รายรับ";
  return "อื่นๆ";
};

const ENTS = [["all", "รวม 2 กิจการ"], ["company", "🏢 บริษัท"], ["personal", "👤 บุคคล"]];

export default function CashFlow() {
  const [entries, setEntries] = React.useState([]);
  const [opening, setOpening] = React.useState({ company: 0, personal: 0 });
  const [openingInput, setOpeningInput] = React.useState("");
  const [ent, setEnt] = React.useState("all");   // กิจการ: all=รวม · company=บริษัท · personal=บุคคล
  const [grain, setGrain] = React.useState("day");
  const [anchor, setAnchor] = React.useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [withProj, setWithProj] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [edit, setEdit] = React.useState(null);
  const [transfer, setTransfer] = React.useState(false);   // โอนระหว่างบัญชี (บริษัท ↔ บุคคล)
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  async function load(silent) {
    if (!silent) setLoading(true);
    try { const [e, ob] = await Promise.all([listCashEntries(), getOpeningBalance()]); setEntries(e); setOpening(ob); setOpeningInput(String((ent === "personal" ? ob.personal : ob.company) || 0)); }
    catch (err) { flash("โหลดไม่สำเร็จ: " + (err.message || err), true); }
    if (!silent) setLoading(false);
  }
  // auto-sync from documents on open: ใบแจ้งหนี้ → คาดว่าจะรับ, ใบเสร็จ → ได้รับจริง (ตามวันที่รับ) โดยไม่ต้องกดซิงค์
  React.useEffect(() => { (async () => { await load(); try { await syncCashEntriesFromDocs(); await load(true); } catch { /* keep showing existing */ } })(); }, []);

  const sgn = (e) => (e.direction === "in" ? 1 : -1);
  const entOf = (e) => (e.entity === "personal" ? "personal" : "company");
  const ents = React.useMemo(() => entries.filter((e) => e.source_type !== "opening" && (ent === "all" || entOf(e) === ent)), [entries, ent]);
  const openingVal = ent === "all" ? (Number(opening.company) || 0) + (Number(opening.personal) || 0) : (Number(opening[ent]) || 0);
  // เปลี่ยนกิจการ → เติมค่ายกมาของกิจการนั้นในช่องกรอก
  React.useEffect(() => { setOpeningInput(String((ent === "personal" ? opening.personal : opening.company) || 0)); }, [ent, opening]);
  const year = anchor.getFullYear();
  const move = (n) => setAnchor((a) => grain === "day" ? new Date(a.getFullYear(), a.getMonth() + n, 1) : new Date(a.getFullYear() + n, a.getMonth(), 1));
  const title = grain === "day" ? thMonth(anchor) : grain === "year" ? "ทุกปี" : `ปี ${year + 543}`;

  async function saveOpening() {
    if (ent === "all") return;   // โหมดรวม = อ่านอย่างเดียว (แก้ยกมาต้องเลือกกิจการก่อน)
    const v = Number(openingInput) || 0; if (v === (Number(opening[ent]) || 0)) return;
    try { await setOpeningBalance(ent, v); setOpening((o) => ({ ...o, [ent]: v })); flash("บันทึกเงินสดยกมาแล้ว ✓"); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function sync() {
    setBusy(true);
    try { const r = await syncCashEntriesFromDocs(); flash(`ซิงค์จากเอกสารแล้ว ✓ เพิ่ม ${r.added} · อัปเดต ${r.updated}${r.removed ? ` · ลบ ${r.removed}` : ""}`); await load(); }
    catch (e) { flash("ซิงค์ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  // โอนเงินระหว่างบัญชีตัวเอง (บริษัท ↔ บุคคล) — สร้าง 2 บรรทัด (ออก/เข้า) ไม่นับเป็นรายรับ/จ่าย
  async function doTransfer({ from, amount, date, note }) {
    const to = from === "company" ? "personal" : "company";
    const L = { company: "บริษัท", personal: "บุคคล" };
    const amt = Number(amount) || 0;
    if (amt <= 0) return flash("ใส่จำนวนเงินมากกว่า 0", true);
    setBusy(true);
    try {
      await addCashEntry({ direction: "out", status: "actual", entity: from, entry_date: date, amount: amt, note: `🔄 โอนไปบัญชี${L[to]}${note ? " · " + note : ""}` });
      await addCashEntry({ direction: "in", status: "actual", entity: to, entry_date: date, amount: amt, note: `🔄 รับโอนจากบัญชี${L[from]}${note ? " · " + note : ""}` });
      flash(`บันทึกโอน ${L[from]} → ${L[to]} ${fmtBaht(amt)} แล้ว ✓ (ไม่นับเป็นรายรับ/จ่าย)`);
      setTransfer(false); await load();
    } catch (e) { flash("โอนไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function removeEntry(e) {
    // เส้นจากเอกสารลบตรงนี้ไม่ได้ — sync รอบหน้าจะสร้างกลับมาใหม่อยู่ดี ให้ไปจัดการเอกสารต้นทาง
    if (e.source_type && e.source_type !== "manual") {
      if (e.source_type === "opening") return alert("แถวเงินสดยกมา — แก้ที่ช่อง 'เงินสดยกมา' ด้านบนแทน");
      return alert(`ลบตรงนี้ไม่ได้ — รายการนี้มาจาก "${SRC[e.source_type] || e.source_type}" (ลบแล้วระบบจะสร้างกลับมาเอง)\nให้ไปยกเลิก/ลบเอกสารต้นทาง แล้วรายการนี้จะหายตามอัตโนมัติ`);
    }
    const reason = await confirmDialog({ title: `ลบรายการนี้? (${fmtBaht(e.amount)})`, message: e.note || "", confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น บันทึกผิด · ซ้ำ", required: true } });
    if (reason === false) return;
    try { await deleteCashEntry(e.id, reason); flash("ลบแล้ว"); await load(); } catch (err) { flash("ลบไม่สำเร็จ: " + (err.message || err), true); }
  }

  // bucket all entries by grain, compute running actual balance across all time, then filter to view
  const buckets = React.useMemo(() => {
    const map = {};
    ents.forEach((e) => {
      let key, sort, label;
      if (grain === "week") { key = weekStartYmd(e.entry_date); sort = key; label = `${thShort(key)} – ${thShort(weekEndYmd(key))}`; }
      else if (grain === "year") { key = e.entry_date.slice(0, 4); sort = key + "-01-01"; label = `ปี ${Number(key) + 543}`; }
      else { key = e.entry_date.slice(0, 7); sort = key + "-01"; label = thMonthKey(key); }
      const b = map[key] || (map[key] = { key, sort, label, actIn: 0, actOut: 0, projIn: 0, projOut: 0 });
      const amt = Number(e.amount) || 0;
      if (e.status === "actual") { if (e.direction === "in") b.actIn += amt; else b.actOut += amt; }
      else { if (e.direction === "in") b.projIn += amt; else b.projOut += amt; }
    });
    const arr = Object.values(map).sort((a, b) => a.sort.localeCompare(b.sort));
    let run = openingVal; arr.forEach((b) => { run += b.actIn - b.actOut; b.balA = run; });
    return arr;
  }, [ents, grain, openingVal]);

  // ── สรุปเงินสด + จุดต่ำสุด (runway) ──
  const cash = React.useMemo(() => {
    const today = todayYmd();
    const n = new Date(); const monthEnd = ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0));
    let actual = openingVal, projToMonthEnd = 0; const proj = [];
    ents.forEach((e) => {
      const v = sgn(e) * (Number(e.amount) || 0);
      if (e.status === "actual") actual += v;
      else { if (e.entry_date <= monthEnd) projToMonthEnd += v; proj.push({ d: e.entry_date < today ? today : e.entry_date, v }); }
    });
    proj.sort((a, b) => a.d.localeCompare(b.d));
    let r = actual, minBal = actual, minDate = today;
    proj.forEach((p) => { r += p.v; if (r < minBal) { minBal = r; minDate = p.d; } });
    return { nowBal: actual, monthEndBal: actual + projToMonthEnd, minBal, minDate };
  }, [ents, openingVal]);

  // เงินสำรองขั้นต่ำ ต่อกิจการ (เก็บในเครื่อง) — ใช้เตือน runway
  const [reserve, setReserve] = React.useState(0);
  React.useEffect(() => { try { setReserve(Number(localStorage.getItem(`cf_reserve_${ent}`)) || 0); } catch { setReserve(0); } }, [ent]);
  const saveReserve = (v) => { const nn = Math.max(0, Number(v) || 0); setReserve(nn); try { localStorage.setItem(`cf_reserve_${ent}`, String(nn)); } catch { /* ignore */ } };
  const runwayAlert = cash.minBal < 0 || (reserve > 0 && cash.minBal < reserve);

  // ช่วงที่กำลังดู (สำหรับแยกหมวด + ส่งออก)
  const viewRange = grain === "day"
    ? [ymd(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), ymd(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0))]
    : grain === "year" ? null : [`${year}-01-01`, `${year}-12-31`];
  const viewEnts = React.useMemo(() => viewRange ? ents.filter((e) => e.entry_date >= viewRange[0] && e.entry_date <= viewRange[1]) : ents, [ents, grain, anchor, year]); // eslint-disable-line
  const catRows = React.useMemo(() => {
    const m = {}; viewEnts.filter((e) => e.direction === "out").forEach((e) => { const c = CAT(e); m[c] = (m[c] || 0) + (Number(e.amount) || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [viewEnts]);
  const catMax = Math.max(...catRows.map(([, v]) => v), 1);
  const catTotal = catRows.reduce((a, [, v]) => a + v, 0);

  function exportCsv() {
    const head = ["วันที่", "ทิศทาง", "สถานะ", "กิจการ", "หมวด", "จำนวน (+เข้า/−ออก)", "หมายเหตุ"];
    const rows = viewEnts.slice().sort((a, b) => a.entry_date.localeCompare(b.entry_date)).map((e) => [
      e.entry_date, e.direction === "in" ? "เข้า" : "ออก", e.status === "actual" ? "จริง" : "คาดการณ์",
      entOf(e) === "personal" ? "บุคคล" : "บริษัท", CAT(e), sgn(e) * (Number(e.amount) || 0), (e.note || "").replace(/\n/g, " ")]);
    const csv = "﻿" + [head, ...rows].map((a) => a.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `cashflow-${ent}-${grain}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  // สัปดาห์คร่อมปีใหม่ (เริ่ม 29 ธ.ค. จบ 4 ม.ค.) ต้องโผล่ทั้ง 2 ปี — เทียบทั้งวันเริ่มและวันจบสัปดาห์
  const viewBuckets = grain === "year" ? buckets : buckets.filter((b) => b.sort.slice(0, 4) === String(year)
    || (grain === "week" && weekEndYmd(b.key).slice(0, 4) === String(year)));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">กระแสเงินสด <span className="page-title-en">Cash Flow</span></h1>
          <p className="page-sub">เงินเข้า-ออก · ประมาณการ (ใบแจ้งหนี้/ค้างจ่าย) เทียบกับจริง (ใบเสร็จ/จ่ายแล้ว) · ดูราย วัน/สัปดาห์/เดือน/ปี</p></div>
        <div className="cat-head-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="seg">{GRAINS.map(([v, l]) => <button key={v} className={"seg-btn" + (grain === v ? " on" : "")} onClick={() => setGrain(v)}>{l}</button>)}</div>
          <div className="seg">
            <button className={"seg-btn" + (!withProj ? " on" : "")} onClick={() => setWithProj(false)}>จริง</button>
            <button className={"seg-btn" + (withProj ? " on" : "")} onClick={() => setWithProj(true)}>+ คาดการณ์</button>
          </div>
          <div className="seg">{ENTS.map(([v, l]) => <button key={v} className={"seg-btn" + (ent === v ? " on" : "")} onClick={() => setEnt(v)}>{l}</button>)}</div>
          <button className="btn-ghost sm" onClick={exportCsv} title="ส่งออกรายการในช่วงที่ดู เป็นไฟล์ CSV (เปิดใน Excel)">⬇ CSV</button>
          <button className="btn-ghost sm" disabled={busy} onClick={sync}><UIcon name="withdraw" size={15} /> ซิงค์จากเอกสาร</button>
          <button className="btn-ghost sm" onClick={() => setTransfer(true)} title="ย้ายเงินระหว่างบัญชีบริษัท ↔ บุคคล (ไม่นับเป็นรายรับ/จ่าย)">🔄 โอนระหว่างบัญชี</button>
          <button className="btn-primary sm" onClick={() => setEdit({ direction: "in", status: "actual", entry_date: todayYmd(), amount: "", note: "", entity: ent === "personal" ? "personal" : "company" })}><UIcon name="plus" size={15} color="#fff" /> เพิ่มรายการ</button>
        </div>
      </div>

      <div className="cf-bar">
        <div className="sched-nav">
          {grain !== "year" && <>
            <button className="btn-ghost sm" onClick={() => move(-1)}><UIcon name="chevR" size={15} style={{ transform: "rotate(180deg)" }} /></button>
            <button className="btn-ghost sm" onClick={() => setAnchor(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })}>{grain === "day" ? "เดือนนี้" : "ปีนี้"}</button>
            <button className="btn-ghost sm" onClick={() => move(1)}><UIcon name="chevR" size={15} /></button>
          </>}
          <div className="sched-title">{title}</div>
        </div>
        <label className="cf-opening">เงินสดยกมา{ent === "company" ? " (บริษัท)" : ent === "personal" ? " (บุคคล)" : ""} <span className="inp inp-unit" style={{ width: 150 }}><span className="unit-pre">฿</span>
          <input type="number" value={ent === "all" ? (Number(opening.company) || 0) + (Number(opening.personal) || 0) : openingInput} disabled={ent === "all"} title={ent === "all" ? "เลือกกิจการ (บริษัท/บุคคล) ก่อนจึงจะแก้ยอดยกมาได้" : ""} onChange={(e) => setOpeningInput(e.target.value)} onBlur={saveOpening} /></span></label>
        <label className="cf-opening" title="ถ้าเงินคาดการณ์จะต่ำกว่ายอดนี้ ระบบจะเตือนล่วงหน้า (เก็บในเครื่องนี้)">เงินสำรองขั้นต่ำ <span className="inp inp-unit" style={{ width: 130 }}><span className="unit-pre">฿</span>
          <input type="number" min="0" value={reserve} onChange={(e) => saveReserve(e.target.value)} /></span></label>
      </div>

      {ent !== "all" && <div className="cf-carry" style={{ background: ent === "personal" ? "#f5f3ff" : "#eff6ff", borderColor: ent === "personal" ? "#ddd6fe" : "#bfdbfe" }}>
        {ent === "personal"
          ? "👤 กิจการบุคคล — รายได้จากบิล 'ไม่เอา VAT' เข้าที่นี่ · ต้นทุน/เงินเดือน/ช่างซัพ ลงบริษัททั้งหมด (ปรับได้ด้วยการแก้รายการเอง)"
          : "🏢 กิจการบริษัท — รายได้จากบิล VAT + ต้นทุน/เงินเดือน/ช่างซัพทั้งหมดเข้าที่นี่"}
      </div>}

      {!loading && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, margin: "4px 0 12px" }}>
          <div style={{ background: "var(--surface-2,#f3f7f8)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
            <div className="jo-dim" style={{ fontSize: 12 }}>💵 เงินสดตอนนี้ (จริง)</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: cash.nowBal < 0 ? "var(--down)" : "var(--ink)" }}>{fmtBaht(cash.nowBal)}</div>
          </div>
          <div style={{ background: "var(--surface-2,#f3f7f8)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
            <div className="jo-dim" style={{ fontSize: 12 }}>🔮 คาดการณ์สิ้นเดือนนี้</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: cash.monthEndBal < 0 ? "var(--down)" : "var(--up)" }}>{fmtBaht(cash.monthEndBal)}</div>
            <div className="jo-dim" style={{ fontSize: 11 }}>รวมใบแจ้งหนี้/หนี้ที่คาดว่าจะเข้า-ออก</div>
          </div>
          <div style={{ background: "var(--surface-2,#f3f7f8)", border: `1px solid ${runwayAlert ? "#f59e0b" : "var(--line)"}`, borderRadius: 12, padding: "12px 14px" }}>
            <div className="jo-dim" style={{ fontSize: 12 }}>📉 จุดต่ำสุดที่คาด</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: cash.minBal < 0 ? "var(--down)" : runwayAlert ? "#b45309" : "var(--ink)" }}>{fmtBaht(cash.minBal)}</div>
            <div className="jo-dim" style={{ fontSize: 11 }}>~{thShort(cash.minDate)}</div>
          </div>
        </div>
        {runwayAlert && <div style={{ border: `1.5px solid ${cash.minBal < 0 ? "#dc2626" : "#f59e0b"}`, background: cash.minBal < 0 ? "#fef2f2" : "#fffbeb", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
          <b style={{ color: cash.minBal < 0 ? "#b91c1c" : "#b45309" }}>{cash.minBal < 0 ? "🔴 เงินสดคาดว่าจะติดลบ" : "⚠️ เงินสดจะต่ำกว่าเงินสำรองที่ตั้งไว้"}</b>
          {" "}— ประมาณ <b>{thDate(cash.minDate)}</b> เงินจะเหลือ <b>{fmtBaht(cash.minBal)}</b>{reserve > 0 ? ` (เงินสำรอง ${fmtBaht(reserve)})` : ""}
          <div className="jo-dim" style={{ marginTop: 2 }}>ทางแก้: เร่งเก็บใบแจ้งหนี้ค้างรับ · เลื่อนรายจ่ายที่ยังไม่ถึงกำหนด · หรือเตรียมเงินสำรองเพิ่ม</div>
        </div>}
      </>}
      {loading ? <div className="empty">กำลังโหลด…</div> : (
        grain === "day"
          ? <DayView ents={ents} opening={openingVal} anchor={anchor} withProj={withProj} sgn={sgn} onEdit={setEdit} onDel={removeEntry} />
          : <SummaryTable buckets={viewBuckets} withProj={withProj} grain={grain} />
      )}

      {!loading && catRows.length > 0 && (
        <div style={{ background: "var(--surface,#fff)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <b style={{ fontSize: 15 }}>💸 เงินออกแยกหมวด <span className="jo-dim" style={{ fontWeight: 400, fontSize: 12.5 }}>({grain === "day" ? thMonth(anchor) : grain === "year" ? "ทุกปี" : `ปี ${year + 543}`} · จริง+คาดการณ์)</span></b>
            <span className="jo-dim" style={{ fontSize: 12.5 }}>รวมออก {fmtBaht(catTotal)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {catRows.map(([c, v]) => (
              <div key={c} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 170, flex: "none", fontSize: 12.5 }}>{c}</div>
                <div style={{ flex: 1, background: "var(--surface-2,#eef3f6)", borderRadius: 7, height: 20, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${v / catMax * 100}%`, background: "linear-gradient(90deg,#f59e0b,#dc2626)", borderRadius: 7, minWidth: 2 }} />
                </div>
                <div style={{ width: 96, flex: "none", textAlign: "right", fontWeight: 700, fontSize: 12.5 }}>{fmtBaht(v)}</div>
                <div style={{ width: 40, flex: "none", textAlign: "right", fontSize: 11.5, color: "var(--ink-3)" }}>{catTotal ? Math.round(v / catTotal * 100) : 0}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {edit && <CashEntryModal entry={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
      {transfer && <TransferModal defaultDate={todayYmd()} defaultFrom={ent === "personal" ? "personal" : "company"} busy={busy} onClose={() => setTransfer(false)} onConfirm={doTransfer} />}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// ---- summary table for week / month / year ----
function SummaryTable({ buckets, withProj, grain }) {
  if (buckets.length === 0) return <div className="empty">ยังไม่มีรายการในช่วงนี้ — กด “ซิงค์จากเอกสาร” หรือ “เพิ่มรายการ”</div>;
  const tot = buckets.reduce((a, b) => ({ actIn: a.actIn + b.actIn, actOut: a.actOut + b.actOut, projIn: a.projIn + b.projIn, projOut: a.projOut + b.projOut }), { actIn: 0, actOut: 0, projIn: 0, projOut: 0 });
  const head = grain === "week" ? "สัปดาห์" : grain === "year" ? "ปี" : "เดือน";
  return (
    <div className="card" style={{ padding: 0, overflow: "auto" }}>
      <table className="cf-table">
        <thead><tr>
          <th style={{ textAlign: "left" }}>{head}</th>
          <th>รับจริง</th><th>จ่ายจริง</th><th>สุทธิจริง</th>
          {withProj && <><th>คาดว่าจะรับ</th><th>คาดว่าจะจ่าย</th></>}
          <th>เงินสดสะสม</th>
        </tr></thead>
        <tbody>
          {buckets.map((b) => { const net = b.actIn - b.actOut; return (
            <tr key={b.key}>
              <td style={{ textAlign: "left" }}>{b.label}</td>
              <td className="up">{b.actIn ? fmtBaht(b.actIn) : "—"}</td>
              <td className="down">{b.actOut ? "−" + fmtBaht(b.actOut) : "—"}</td>
              <td style={{ fontWeight: 700, color: net >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(net)}</td>
              {withProj && <><td style={{ color: "#2563eb" }}>{b.projIn ? fmtBaht(b.projIn) : "—"}</td><td style={{ color: "#d97706" }}>{b.projOut ? "−" + fmtBaht(b.projOut) : "—"}</td></>}
              <td style={{ fontWeight: 700, color: b.balA >= 0 ? "var(--ink)" : "var(--down)" }}>{fmtBaht(b.balA)}</td>
            </tr>
          ); })}
        </tbody>
        <tfoot><tr>
          <td style={{ textAlign: "left" }}>รวม</td>
          <td className="up">{fmtBaht(tot.actIn)}</td><td className="down">−{fmtBaht(tot.actOut)}</td>
          <td style={{ color: (tot.actIn - tot.actOut) >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(tot.actIn - tot.actOut)}</td>
          {withProj && <><td style={{ color: "#2563eb" }}>{fmtBaht(tot.projIn)}</td><td style={{ color: "#d97706" }}>−{fmtBaht(tot.projOut)}</td></>}
          <td>—</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

// ---- detailed daily view (within a month) ----
function DayView({ ents, opening, anchor, withProj, sgn, onEdit, onDel }) {
  const monthStart = ymd(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const monthEnd = ymd(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
  let priorActual = opening, priorForecast = opening;
  ents.forEach((e) => { if (e.entry_date < monthStart) { const v = sgn(e) * (Number(e.amount) || 0); priorForecast += v; if (e.status === "actual") priorActual += v; } });
  const inMonth = ents.filter((e) => e.entry_date >= monthStart && e.entry_date <= monthEnd);
  const byDate = {}; inMonth.forEach((e) => { (byDate[e.entry_date] = byDate[e.entry_date] || []).push(e); });
  const dates = Object.keys(byDate).sort();
  const sum = (f) => inMonth.filter(f).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const actIn = sum((e) => e.status === "actual" && e.direction === "in");
  const actOut = sum((e) => e.status === "actual" && e.direction === "out");
  const projIn = sum((e) => e.status === "projected" && e.direction === "in");
  const projOut = sum((e) => e.status === "projected" && e.direction === "out");
  let runA = priorActual, runF = priorForecast;
  return (
    <>
      <div className="kpi-grid jp-kpi">
        <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{fmtBaht(actIn)}</div><div className="stat-label">รับจริง (เดือนนี้)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "var(--down)" }}>−{fmtBaht(actOut)}</div><div className="stat-label">จ่ายจริง (เดือนนี้)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: (actIn - actOut) >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(actIn - actOut)}</div><div className="stat-label">สุทธิจริง</div></div>
        {withProj && <div className="stat-card"><div className="stat-val" style={{ color: "#2563eb" }}>{fmtBaht(projIn)}</div><div className="stat-label">คาดว่าจะรับ</div></div>}
        {withProj && <div className="stat-card"><div className="stat-val" style={{ color: "#d97706" }}>−{fmtBaht(projOut)}</div><div className="stat-label">คาดว่าจะจ่าย</div></div>}
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
              {withProj && <CfCol title="ประมาณการ" entries={proj} onEdit={onEdit} onDel={onDel} />}
              <CfCol title="รับ-จ่ายจริง" entries={act} onEdit={onEdit} onDel={onDel} />
            </div>
          </div>
        );
      })}
    </>
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
  const [f, setF] = React.useState({ direction: entry.direction || "in", status: entry.status || "actual", entity: entry.entity === "personal" ? "personal" : "company", entry_date: entry.entry_date || todayYmd(), amount: entry.amount ?? "", note: entry.note || "" });
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
          {/* เส้นจากเอกสาร: ล็อกทิศทาง/สถานะ — พลิกใบเสร็จเป็น "เงินออก" ได้ = ยอดสะสมเพี้ยน 2 เท่า (แก้ได้แค่วัน/ยอด/โน้ต) */}
          {(() => { const locked = !isNew && entry?.source_type && entry.source_type !== "manual"; return (
          <div className="fld-row">
            <label className="fld"><span>ประเภท{locked ? " 🔒" : ""}</span>
              <select className="inp" value={f.direction} disabled={locked} onChange={(e) => set("direction", e.target.value)}>
                <option value="in">เงินเข้า (รับ)</option><option value="out">เงินออก (จ่าย)</option>
              </select></label>
            <label className="fld"><span>สถานะ{locked ? " 🔒" : ""}</span>
              <select className="inp" value={f.status} disabled={locked} onChange={(e) => set("status", e.target.value)}>
                <option value="actual">จริง (เกิดขึ้นแล้ว)</option><option value="projected">ประมาณการ</option>
              </select></label>
          </div>
          ); })()}
          {(() => { const locked = !isNew && entry?.source_type && entry.source_type !== "manual"; return (
          <label className="fld"><span>กิจการ{locked ? " 🔒" : ""}</span>
            <select className="inp" value={f.entity} disabled={locked} onChange={(e) => set("entity", e.target.value)}>
              <option value="company">🏢 บริษัท (เงินเข้า/ออกบัญชีบริษัท)</option><option value="personal">👤 บุคคล (อาทิตย์)</option>
            </select></label>
          ); })()}
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

// โอนเงินระหว่างบัญชีตัวเอง (บริษัท ↔ บุคคล) — สร้าง 2 บรรทัดอัตโนมัติ ไม่นับเป็นรายรับ/จ่าย
function TransferModal({ defaultDate, defaultFrom, busy, onClose, onConfirm }) {
  const [from, setFrom] = React.useState(defaultFrom === "personal" ? "personal" : "company");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(defaultDate || todayYmd());
  const [note, setNote] = React.useState("");
  const to = from === "company" ? "personal" : "company";
  const L = { company: "🏢 บริษัท (VAT)", personal: "👤 บุคคล (NOVAT)" };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-head"><div className="modal-title">🔄 โอนเงินระหว่างบัญชี</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
            <label className="fld" style={{ flex: 1, margin: 0 }}><span>จากบัญชี</span>
              <select className="inp" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="company">🏢 บริษัท (VAT)</option><option value="personal">👤 บุคคล (NOVAT)</option>
              </select></label>
            <div style={{ paddingBottom: 8, fontSize: 20, color: "var(--ink-3)" }}>→</div>
            <label className="fld" style={{ flex: 1, margin: 0 }}><span>ไปบัญชี</span>
              <div className="inp" style={{ background: "var(--surface-2)", display: "flex", alignItems: "center", color: "var(--ink-2)" }}>{L[to]}</div></label>
          </div>
          <label className="fld"><span>จำนวนเงิน</span><span className="inp inp-unit"><span className="unit-pre">฿</span>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></span></label>
          <label className="fld"><span>วันที่</span><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="fld"><span>หมายเหตุ (ไม่บังคับ)</span><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เติมเงินซื้อของ" /></label>
          <div className="jo-dim">ระบบจะบันทึก 2 บรรทัด: เงินออกฝั่ง {L[from]} + เงินเข้าฝั่ง {L[to]} · <b>ไม่นับเป็นรายรับ/รายจ่าย</b> (มุมมอง "รวม 2 กิจการ" จะหักล้างเป็นศูนย์)</div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={() => onConfirm({ from, amount, date, note })}>บันทึกการโอน</button></div>
      </div>
    </div>
  );
}
