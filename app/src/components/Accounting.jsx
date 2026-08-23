import React from "react";
import { listAccEntities, listAccChart, listJournal, postJournal, voidJournal, autoPostReceipts, autoPostExpenses, autoPostPayroll } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const thDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const CAT_LABEL = { asset: "สินทรัพย์", liability: "หนี้สิน", equity: "ส่วนของเจ้าของ", revenue: "รายได้", expense: "ต้นทุน/ค่าใช้จ่าย" };
const CAT_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const SCOPE_TAG = { company: "🏢 บริษัท", personal: "👤 บุคคล" };
const REFT = { manual: "ลงเอง", opening: "ยอดยกมา", quotation: "ใบเสนอราคา", invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จ", po: "รับของ PO", po_pay: "จ่ายเจ้าหนี้", expense: "เบิกจ่าย", payout: "ค่าแรงช่างซัพ", payroll: "เงินเดือน" };
// สมุดรายวันเฉพาะ (แยกตาม ref_type) — ขาย/ซื้อ/รับ/จ่าย/ทั่วไป
const BOOK_OF = { invoice: "sales", receipt: "receipt", po: "purchase", po_pay: "payment", expense: "payment", payout: "payment", payroll: "general", manual: "general", opening: "general" };
const BOOKS = [["all", "ทั้งหมด"], ["sales", "ขาย"], ["purchase", "ซื้อ"], ["receipt", "รับเงิน"], ["payment", "จ่ายเงิน"], ["general", "ทั่วไป"]];
const LINKABLE = new Set(["invoice", "receipt", "po", "po_pay", "expense", "payout", "payroll"]);

export default function Accounting({ onOpenRef }) {
  const [tab, setTab] = React.useState("pl");            // pl | bs | ledger | tb | journal | coa
  const [ledgerAcct, setLedgerAcct] = React.useState("");
  const [entity, setEntity] = React.useState("all");     // all | company | personal
  const [entities, setEntities] = React.useState([]);
  const [chart, setChart] = React.useState([]);
  const [journal, setJournal] = React.useState([]);
  const [from, setFrom] = React.useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = React.useState(ymd(new Date()));
  const [loading, setLoading] = React.useState(true);
  const [entry, setEntry] = React.useState(null);        // manual-entry modal state | null
  const [book, setBook] = React.useState("all");         // ตัวกรองสมุดรายวันเฉพาะ
  const [syncing, setSyncing] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  const chartMap = React.useMemo(() => { const m = {}; chart.forEach((a) => { m[a.code] = a; }); return m; }, [chart]);

  React.useEffect(() => {
    Promise.all([listAccEntities().catch(() => []), listAccChart().catch(() => [])])
      .then(([e, c]) => { setEntities(e); setChart(c); });
  }, []);

  const loadJournal = React.useCallback(() => {
    setLoading(true);
    listJournal({ entity, from, to }).then((j) => setJournal(j)).catch((e) => flash(e.message || "โหลดไม่สำเร็จ", true)).finally(() => setLoading(false));
  }, [entity, from, to]);
  React.useEffect(() => { loadJournal(); }, [loadJournal]);

  // ── งบทดลอง: รวมเดบิต/เครดิตต่อบัญชีจากรายการในช่วง ──
  const trial = React.useMemo(() => {
    const acc = {};
    journal.forEach((j) => (j.lines || []).forEach((l) => {
      const a = (acc[l.account_code] ||= { code: l.account_code, d: 0, c: 0 });
      a.d += Number(l.debit) || 0; a.c += Number(l.credit) || 0;
    }));
    const rows = Object.values(acc).map((a) => {
      const net = a.d - a.c, meta = chartMap[a.code] || {};
      return { code: a.code, name: meta.name || a.code, category: meta.category, sort: meta.sort || 9999,
        debit: net >= 0 ? net : 0, credit: net < 0 ? -net : 0 };
    }).filter((r) => r.debit > 0.005 || r.credit > 0.005).sort((a, b) => a.sort - b.sort);
    const totD = rows.reduce((s, r) => s + r.debit, 0), totC = rows.reduce((s, r) => s + r.credit, 0);
    return { rows, totD, totC, balanced: Math.abs(totD - totC) < 0.01 };
  }, [journal, chartMap]);

  const jSum = (j, k) => (j.lines || []).reduce((s, l) => s + (Number(l[k]) || 0), 0);

  // ── งบการเงิน (P&L + งบฐานะ) — ดึงรายการทั้งหมด "ถึงวันที่ to" มาคำนวณ ──
  const [stmtRows, setStmtRows] = React.useState([]);
  const [stmtLoading, setStmtLoading] = React.useState(false);
  React.useEffect(() => {
    if (tab !== "pl" && tab !== "bs" && tab !== "ledger") return;
    setStmtLoading(true);
    listJournal({ entity, to }).then(setStmtRows).catch((e) => flash(e.message || "โหลดไม่สำเร็จ", true)).finally(() => setStmtLoading(false));
  }, [tab, entity, to]);

  // ── บัญชีแยกประเภท (Ledger) — รายการของบัญชีที่เลือก + ยอดยกมา + คงเหลือวิ่ง ──
  const ledger = React.useMemo(() => {
    if (!ledgerAcct) return null;
    const meta = chartMap[ledgerAcct] || {};
    const sideDebit = meta.normal_side !== "credit";
    const rows = [];
    stmtRows.forEach((j) => (j.lines || []).forEach((l) => { if (l.account_code === ledgerAcct) rows.push({ jdate: j.jdate, id: j.id, ref_type: j.ref_type, ref_no: j.ref_no, memo: j.memo, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }); }));
    rows.sort((a, b) => a.jdate < b.jdate ? -1 : a.jdate > b.jdate ? 1 : (a.id - b.id));
    const opening = rows.filter((r) => r.jdate < from).reduce((s, r) => s + r.debit - r.credit, 0);
    let bal = opening; const out = [];
    rows.filter((r) => r.jdate >= from && r.jdate <= to).forEach((r) => { bal += r.debit - r.credit; out.push({ ...r, bal }); });
    const disp = (v) => sideDebit ? v : -v;
    return { meta, opening: disp(opening), rows: out.map((r) => ({ ...r, balDisp: disp(r.bal) })), closing: disp(bal) };
  }, [ledgerAcct, stmtRows, from, to, chartMap]);

  const stmt = React.useMemo(() => {
    const yearStart = `${(to || ymd(new Date())).slice(0, 4)}-01-01`;
    const bal = {}, balY = {};   // bal = สะสมถึง to (งบฐานะ) · balY = เฉพาะปีนี้ (งบกำไรขาดทุน)
    stmtRows.forEach((j) => { const iy = j.jdate >= yearStart; (j.lines || []).forEach((l) => { const s = (Number(l.debit) || 0) - (Number(l.credit) || 0); bal[l.account_code] = (bal[l.account_code] || 0) + s; if (iy) balY[l.account_code] = (balY[l.account_code] || 0) + s; }); });
    const meta = (c) => chartMap[c] || {};
    const sumBy = (src, pred, sign) => Object.entries(src).reduce((a, [c, v]) => pred(meta(c)) ? a + sign * v : a, 0);
    const acctRows = (src, pred, sign) => chart.filter(pred).map((a) => ({ code: a.code, name: a.name, amt: sign * (src[a.code] || 0) })).filter((r) => Math.abs(r.amt) > 0.005);
    // P&L (ปีนี้)
    const isExp = (m, st) => m.category === "expense" && m.subtype === st;
    const revenue = sumBy(balY, (m) => m.category === "revenue", -1);
    const cogs = sumBy(balY, (m) => isExp(m, "cogs"), 1), selling = sumBy(balY, (m) => isExp(m, "selling"), 1), admin = sumBy(balY, (m) => isExp(m, "admin"), 1), finance = sumBy(balY, (m) => isExp(m, "finance"), 1), taxExp = sumBy(balY, (m) => isExp(m, "tax"), 1);
    const gross = revenue - cogs, operating = gross - selling - admin, netProfit = operating - finance - taxExp;
    const pl = {
      revenue, cogs, selling, admin, finance, taxExp, gross, operating, netProfit,
      revRows: acctRows(balY, (a) => a.category === "revenue", -1),
      cogsRows: acctRows(balY, (a) => a.category === "expense" && a.subtype === "cogs", 1),
      sellRows: acctRows(balY, (a) => a.category === "expense" && a.subtype === "selling", 1),
      adminRows: acctRows(balY, (a) => a.category === "expense" && a.subtype === "admin", 1),
      finRows: acctRows(balY, (a) => a.category === "expense" && (a.subtype === "finance" || a.subtype === "tax"), 1),
    };
    // งบฐานะ (สะสมถึง to)
    const assets = sumBy(bal, (m) => m.category === "asset", 1);
    const liab = sumBy(bal, (m) => m.category === "liability", -1);
    const equityAcct = sumBy(bal, (m) => m.category === "equity", -1);
    const netIncomeAll = sumBy(bal, (m) => m.category === "revenue", -1) - sumBy(bal, (m) => m.category === "expense", 1);
    const equity = equityAcct + netIncomeAll;
    const bs = {
      assets, liab, equity, netIncomeAll,
      assetRows: acctRows(bal, (a) => a.category === "asset", 1),
      liabRows: acctRows(bal, (a) => a.category === "liability", -1),
      equityRows: acctRows(bal, (a) => a.category === "equity", -1),
      balanced: Math.abs(assets - (liab + equity)) < 0.05,
    };
    return { yearStart, pl, bs };
  }, [stmtRows, chart, chartMap, to]);

  async function doVoid(j) {
    const ok = await confirmDialog({ title: "ยกเลิกรายการบัญชี?", message: `รายการวันที่ ${thDate(j.jdate)} (${fmtBaht(jSum(j, "debit"))}) — จะถูกยกเลิก (เก็บประวัติไว้ ไม่ลบจริง)`, confirmText: "ยกเลิกรายการ", danger: true });
    if (!ok) return;
    try { await voidJournal(j.id); flash("ยกเลิกแล้ว"); loadJournal(); } catch (e) { flash(e.message || "ไม่สำเร็จ", true); }
  }

  const entName = (code) => entities.find((e) => e.code === code)?.name || (code === "company" ? "บริษัท" : "บุคคล");

  async function runAutoPost() {
    const ok = await confirmDialog({ title: "ดึงเอกสารเข้าบัญชี?", message: `อ่านเอกสารในช่วง ${thDate(from)} – ${thDate(to)} มาลงสมุดรายวันอัตโนมัติ (เกณฑ์คงค้าง)\n\n• ขาย: ใบแจ้งหนี้ → รายได้ + ลูกหนี้ · ใบเสร็จ → เก็บลูกหนี้\n• ซื้อ: รับของ PO → ต้นทุน + เจ้าหนี้ · จ่าย → ตัดเจ้าหนี้\n• เบิกจ่าย · ค่าแรงช่างซัพ · เงินเดือน\n\nแนะนำให้ตั้งช่วงตั้งแต่ต้นปี · ปลอดภัย: ทำซ้ำไม่เบิ้ล · ยกเลิกได้ · ไม่แตะเอกสารขาย`, confirmText: "ดึงเข้าบัญชี", danger: false });
    if (!ok) return;
    setSyncing(true);
    try {
      const [rc, ex, pr] = await Promise.all([autoPostReceipts({ from, to }), autoPostExpenses({ from, to }), autoPostPayroll({ from, to })]);
      const n = (rc.posted || 0) + (ex.posted || 0) + (pr.posted || 0), errN = (rc.errors?.length || 0) + (ex.errors?.length || 0) + (pr.errors?.length || 0);
      flash(n ? `ลงบัญชีใหม่ ${n} รายการ (รับ ${rc.posted || 0} · จ่าย ${ex.posted || 0} · เงินเดือน ${pr.posted || 0})${errN ? ` · พลาด ${errN}` : ""}` : "ไม่มีรายการใหม่ (ลงครบแล้ว)", !!errN);
      loadJournal();
    } catch (e) { flash(e.message || "ไม่สำเร็จ", true); } finally { setSyncing(false); }
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">บัญชี <span className="page-title-en">Accounting</span></h1>
          <p className="page-sub">ระบบบัญชีคู่ · สมุดรายวัน · งบทดลอง — แยกกิจการ บริษัท (VAT) / บุคคล</p>
        </div>
      </div>

      {/* ── สลับกิจการ ── */}
      <div className="acc-entbar">
        {[["all", "รวม 2 กิจการ"], ["company", "🏢 บริษัท"], ["personal", "👤 บุคคล"]].map(([k, lb]) => (
          <button key={k} className={"acc-ent" + (entity === k ? " on" : "")} onClick={() => setEntity(k)}>{lb}</button>
        ))}
        <div className="acc-note">📖 ระบบบัญชีอ่านข้อมูลอย่างเดียว ไม่กระทบโปรแกรมขาย</div>
      </div>

      {/* ── แท็บ ── */}
      <div className="view-seg acc-tabs">
        {[["pl", "งบกำไรขาดทุน"], ["bs", "งบแสดงฐานะ"], ["ledger", "แยกประเภท"], ["tb", "งบทดลอง"], ["journal", "สมุดรายวัน"], ["coa", "ผังบัญชี"]].map(([k, lb]) => (
          <button key={k} className={"seg-btn" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{lb}</button>
        ))}
      </div>

      {/* ── ช่วงวันที่ ── */}
      {tab !== "coa" && (
        <div className="acc-daterow">
          {(tab === "tb" || tab === "journal" || tab === "ledger") && <label>ตั้งแต่ <input type="date" className="inp" value={from} onChange={(e) => setFrom(e.target.value)} /></label>}
          <label>{tab === "pl" ? "งวดถึง" : tab === "bs" ? "ณ วันที่" : "ถึง"} <input type="date" className="inp" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          {tab === "pl" && <span className="acc-hint">งวดปี {to.slice(0, 4)} (ม.ค. – {thDate(to)})</span>}
          {tab === "journal" && <button className="btn-ghost" disabled={syncing} onClick={runAutoPost}>{syncing ? "กำลังดึง…" : "⟳ ดึงเอกสารเข้าบัญชี"}</button>}
          {tab === "journal" && <button className="btn" onClick={() => setEntry(newEntry(entity))}>＋ ลงรายการเอง</button>}
        </div>
      )}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}

      {/* ═══ งบกำไรขาดทุน ═══ */}
      {tab === "pl" && (
        <div className="acc-card">
          {stmtLoading ? <div className="empty">กำลังโหลด…</div> : (
            <table className="acc-table acc-stmt">
              <tbody>
                <StmtSection title="รายได้" rows={stmt.pl.revRows} total={stmt.pl.revenue} />
                <StmtSection title="หัก ต้นทุนขายและบริการ" rows={stmt.pl.cogsRows} total={stmt.pl.cogs} neg />
                <StmtTotal label="กำไรขั้นต้น" amt={stmt.pl.gross} strong />
                <StmtSection title="หัก ค่าใช้จ่ายในการขาย" rows={stmt.pl.sellRows} total={stmt.pl.selling} neg />
                <StmtSection title="หัก ค่าใช้จ่ายในการบริหาร" rows={stmt.pl.adminRows} total={stmt.pl.admin} neg />
                <StmtTotal label="กำไรจากการดำเนินงาน" amt={stmt.pl.operating} strong />
                {(stmt.pl.finance + stmt.pl.taxExp) > 0.005 && <StmtSection title="หัก ต้นทุนการเงิน / ภาษี" rows={stmt.pl.finRows} total={stmt.pl.finance + stmt.pl.taxExp} neg />}
                <StmtTotal label="กำไร(ขาดทุน)สุทธิ" amt={stmt.pl.netProfit} grand />
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ═══ งบแสดงฐานะการเงิน ═══ */}
      {tab === "bs" && (
        <div className="acc-card">
          {stmtLoading ? <div className="empty">กำลังโหลด…</div> : (
            <table className="acc-table acc-stmt">
              <tbody>
                <StmtSection title="สินทรัพย์" rows={stmt.bs.assetRows} total={stmt.bs.assets} strong />
                <tr className="acc-stmt-gap"><td colSpan={2}></td></tr>
                <StmtSection title="หนี้สิน" rows={stmt.bs.liabRows} total={stmt.bs.liab} />
                <StmtSection title="ส่วนของเจ้าของ" rows={[...stmt.bs.equityRows, { code: "—", name: "กำไร(ขาดทุน)สะสม + งวดนี้", amt: stmt.bs.netIncomeAll }]} total={stmt.bs.equity} />
                <StmtTotal label={"รวมหนี้สินและส่วนของเจ้าของ" + (stmt.bs.balanced ? " ✓" : " ⚠ ไม่สมดุล")} amt={stmt.bs.liab + stmt.bs.equity} grand ok={stmt.bs.balanced} />
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ═══ บัญชีแยกประเภท (Ledger) ═══ */}
      {tab === "ledger" && (
        <div className="acc-card">
          <div className="acc-ledger-pick">
            <label>เลือกบัญชี
              <select className="inp" value={ledgerAcct} onChange={(e) => setLedgerAcct(e.target.value)}>
                <option value="">— เลือกบัญชี —</option>
                {CAT_ORDER.map((cat) => { const rs = chart.filter((a) => a.category === cat); return rs.length ? <optgroup key={cat} label={CAT_LABEL[cat]}>{rs.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup> : null; })}
              </select>
            </label>
          </div>
          {!ledgerAcct ? <div className="empty">เลือกบัญชีเพื่อดูรายการเดินบัญชี</div> : stmtLoading ? <div className="empty">กำลังโหลด…</div> : (
            <table className="acc-table acc-ledger">
              <thead><tr><th>วันที่</th><th>รายการ</th><th className="r">เดบิต</th><th className="r">เครดิต</th><th className="r">คงเหลือ</th><th></th></tr></thead>
              <tbody>
                <tr className="acc-led-open"><td colSpan={4}>ยอดยกมา (ก่อน {thDate(from)})</td><td className="r mono">{fmtBaht(ledger.opening)}</td><td></td></tr>
                {ledger.rows.map((r, i) => (
                  <tr key={r.id + "-" + i}>
                    <td className="mono">{thDate(r.jdate)}</td>
                    <td>{REFT[r.ref_type] || r.ref_type}{r.ref_no ? ` ${r.ref_no}` : ""}{r.memo ? <span className="acc-jl-memo"> · {r.memo}</span> : null}</td>
                    <td className="r mono">{r.debit ? fmtBaht(r.debit) : ""}</td>
                    <td className="r mono">{r.credit ? fmtBaht(r.credit) : ""}</td>
                    <td className="r mono">{fmtBaht(r.balDisp)}</td>
                    <td>{onOpenRef && LINKABLE.has(r.ref_type) && r.ref_no && <button className="acc-led-link" title="เปิดเอกสาร" onClick={() => onOpenRef(r.ref_type, r.ref_no)}>↗</button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4}>ยอดคงเหลือ ณ {thDate(to)}</td><td className="r mono">{fmtBaht(ledger.closing)}</td><td></td></tr></tfoot>
            </table>
          )}
        </div>
      )}

      {/* ═══ งบทดลอง ═══ */}
      {tab === "tb" && (
        <div className="acc-card">
          {loading ? <div className="empty">กำลังโหลด…</div> : trial.rows.length === 0 ? (
            <div className="empty">ยังไม่มีรายการบัญชีในช่วงนี้ — ลงรายการที่แท็บ “สมุดรายวัน”</div>
          ) : (
            <table className="acc-table">
              <thead><tr><th>รหัส</th><th>ชื่อบัญชี</th><th className="r">เดบิต</th><th className="r">เครดิต</th></tr></thead>
              <tbody>
                {trial.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="mono">{r.code}</td><td>{r.name}</td>
                    <td className="r mono">{r.debit ? fmtBaht(r.debit) : ""}</td>
                    <td className="r mono">{r.credit ? fmtBaht(r.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={trial.balanced ? "ok" : "bad"}>
                  <td colSpan={2}>รวม {trial.balanced ? "✓ เดบิต = เครดิต" : "⚠ ไม่สมดุล!"}</td>
                  <td className="r mono">{fmtBaht(trial.totD)}</td>
                  <td className="r mono">{fmtBaht(trial.totC)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ═══ สมุดรายวัน ═══ */}
      {tab === "journal" && (() => {
        const shown = journal.filter((j) => book === "all" || (BOOK_OF[j.ref_type] || "general") === book);
        return (
        <div className="acc-card">
          <div className="acc-books">
            {BOOKS.map(([k, lb]) => {
              const c = k === "all" ? journal.length : journal.filter((j) => (BOOK_OF[j.ref_type] || "general") === k).length;
              return <button key={k} className={"acc-book" + (book === k ? " on" : "")} onClick={() => setBook(k)}>{lb}{c ? <span className="acc-book-c">{c}</span> : null}</button>;
            })}
          </div>
          {loading ? <div className="empty">กำลังโหลด…</div> : shown.length === 0 ? (
            <div className="empty">{book === "all" ? "ยังไม่มีรายการ — กด “＋ ลงรายการเอง” เพื่อเริ่ม" : "ไม่มีรายการในสมุดเล่มนี้"}</div>
          ) : shown.map((j) => (
            <div key={j.id} className="acc-je">
              <div className="acc-je-head">
                <span className="acc-je-date">{thDate(j.jdate)}</span>
                <span className="acc-je-ent">{j.entity === "company" ? "🏢" : "👤"} {entName(j.entity)}</span>
                <span className="acc-je-ref">{REFT[j.ref_type] || j.ref_type}{j.ref_no ? ` · ${j.ref_no}` : ""}</span>
                {j.source === "manual" && <span className="acc-je-tag">ลงเอง</span>}
                <span className="acc-je-memo">{j.memo || ""}</span>
                {onOpenRef && LINKABLE.has(j.ref_type) && j.ref_no && <button className="acc-je-link" title="เปิดเอกสารต้นทาง" onClick={() => onOpenRef(j.ref_type, j.ref_no)}>↗ เอกสาร</button>}
                <button className="acc-je-void" title="ยกเลิกรายการ" onClick={() => doVoid(j)}>✕</button>
              </div>
              <table className="acc-jelines">
                <tbody>
                  {(j.lines || []).slice().sort((a, b) => (a.line_no || 0) - (b.line_no || 0)).map((l) => (
                    <tr key={l.id}>
                      <td className="mono acc-jl-code">{l.account_code}</td>
                      <td>{chartMap[l.account_code]?.name || ""}{l.memo ? <span className="acc-jl-memo"> · {l.memo}</span> : null}</td>
                      <td className="r mono">{Number(l.debit) ? fmtBaht(l.debit) : ""}</td>
                      <td className="r mono">{Number(l.credit) ? fmtBaht(l.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        );
      })()}

      {/* ═══ ผังบัญชี ═══ */}
      {tab === "coa" && (
        <div className="acc-card">
          {CAT_ORDER.map((cat) => {
            const rows = chart.filter((a) => a.category === cat);
            if (!rows.length) return null;
            return (
              <div key={cat} className="acc-coa-group">
                <div className="acc-coa-cat">{CAT_LABEL[cat]}</div>
                <table className="acc-table">
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.code}>
                        <td className="mono acc-jl-code">{a.code}</td>
                        <td>{a.name}</td>
                        <td className="acc-coa-scope">{a.entity_scope !== "shared" ? SCOPE_TAG[a.entity_scope] : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {entry && <EntryModal entry={entry} setEntry={setEntry} chart={chart} onSaved={() => { setEntry(null); flash("ลงบัญชีแล้ว"); loadJournal(); }} onError={(m) => flash(m, true)} />}
    </div>
  );
}

function newEntry(entity) {
  return { entity: entity === "all" ? "company" : entity, jdate: ymd(new Date()), ref_no: "", memo: "", lines: [blankLine(), blankLine()] };
}
const blankLine = () => ({ account_code: "", debit: "", credit: "" });

function EntryModal({ entry, setEntry, chart, onSaved, onError }) {
  const [saving, setSaving] = React.useState(false);
  const upd = (patch) => setEntry({ ...entry, ...patch });
  const updLine = (i, patch) => { const lines = entry.lines.map((l, k) => k === i ? { ...l, ...patch } : l); upd({ lines }); };
  const addLine = () => upd({ lines: [...entry.lines, blankLine()] });
  const rmLine = (i) => upd({ lines: entry.lines.filter((_, k) => k !== i) });
  const sumD = entry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const sumC = entry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(sumD - sumC) < 0.01 && sumD > 0;
  const grouped = CAT_ORDER.map((cat) => [CAT_LABEL[cat], chart.filter((a) => a.category === cat && (a.entity_scope === "shared" || a.entity_scope === entry.entity))]);

  async function save() {
    setSaving(true);
    try { await postJournal({ ...entry, source: "manual", ref_type: "manual" }); onSaved(); }
    catch (e) { onError(e.message || "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => setEntry(null)}>
      <div className="modal acc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">ลงรายการสมุดรายวัน <button className="modal-x" onClick={() => setEntry(null)}>✕</button></div>
        <div className="acc-modal-top">
          <label>กิจการ
            <select className="inp" value={entry.entity} onChange={(e) => upd({ entity: e.target.value })}>
              <option value="company">🏢 บริษัท (VAT)</option>
              <option value="personal">👤 บุคคล (ไม่ VAT)</option>
            </select>
          </label>
          <label>วันที่ <input type="date" className="inp" value={entry.jdate} onChange={(e) => upd({ jdate: e.target.value })} /></label>
          <label>อ้างอิง <input className="inp" placeholder="เลขที่/หมายเหตุ" value={entry.ref_no} onChange={(e) => upd({ ref_no: e.target.value })} /></label>
        </div>
        <label className="acc-modal-memo">รายละเอียด <input className="inp" placeholder="คำอธิบายรายการ" value={entry.memo} onChange={(e) => upd({ memo: e.target.value })} /></label>

        <table className="acc-entry-lines">
          <thead><tr><th>บัญชี</th><th className="r">เดบิต</th><th className="r">เครดิต</th><th></th></tr></thead>
          <tbody>
            {entry.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="inp" value={l.account_code} onChange={(e) => updLine(i, { account_code: e.target.value })}>
                    <option value="">— เลือกบัญชี —</option>
                    {grouped.map(([lab, accs]) => accs.length ? (
                      <optgroup key={lab} label={lab}>{accs.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup>
                    ) : null)}
                  </select>
                </td>
                <td><input className="inp r" inputMode="decimal" value={l.debit} onChange={(e) => updLine(i, { debit: e.target.value, credit: "" })} /></td>
                <td><input className="inp r" inputMode="decimal" value={l.credit} onChange={(e) => updLine(i, { credit: e.target.value, debit: "" })} /></td>
                <td>{entry.lines.length > 2 && <button className="acc-rm" onClick={() => rmLine(i)}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={balanced ? "ok" : "bad"}>
              <td><button className="btn-ghost sm" onClick={addLine}>＋ เพิ่มบรรทัด</button></td>
              <td className="r mono">{fmtBaht(sumD)}</td>
              <td className="r mono">{fmtBaht(sumC)}</td>
              <td>{balanced ? "✓" : "≠"}</td>
            </tr>
          </tfoot>
        </table>
        <div className="acc-modal-foot">
          <span className="acc-bal-hint">{balanced ? "สมดุล พร้อมบันทึก" : sumD || sumC ? "เดบิตต้องเท่ากับเครดิต" : "กรอกจำนวนเงิน"}</span>
          <button className="btn" disabled={!balanced || saving} onClick={save}>{saving ? "กำลังบันทึก…" : "บันทึกลงบัญชี"}</button>
        </div>
      </div>
    </div>
  );
}

function StmtSection({ title, rows, total, neg, strong }) {
  return (
    <>
      <tr className="acc-stmt-head"><td>{title}</td><td className="r"></td></tr>
      {rows.map((r) => (
        <tr key={r.code} className="acc-stmt-line"><td><span className="mono acc-jl-code">{r.code}</span> {r.name}</td><td className="r mono">{fmtBaht(r.amt)}</td></tr>
      ))}
      <tr className={"acc-stmt-sub" + (strong ? " strong" : "")}><td>รวม{title.replace(/^หัก /, "")}</td><td className="r mono">{neg ? `(${fmtBaht(total)})` : fmtBaht(total)}</td></tr>
    </>
  );
}
function StmtTotal({ label, amt, strong, grand, ok }) {
  return <tr className={"acc-stmt-total" + (grand ? " grand" : "") + (strong ? " strong" : "") + (ok === false ? " bad" : "")}><td>{label}</td><td className="r mono">{fmtBaht(amt)}</td></tr>;
}
