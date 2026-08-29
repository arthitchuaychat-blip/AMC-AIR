import React from "react";
import { listReceipts, listPurchaseOrders, listSubPayouts, listTeams, listAdjustmentNotes, listExpenses } from "../lib/api";
import { fmtBaht, round2, downloadCsv } from "../lib/format";
import { UIcon } from "../icons";

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const thDate = (s) => { try { return new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } };
const netOf = (r) => Number(r.net) || ((Number(r.total) || 0) - (Number(r.wht_amt) || 0));

export default function TaxReport({ role }) {
  const [receipts, setReceipts] = React.useState(null);
  const [notes, setNotes] = React.useState([]);   // ใบลด/เพิ่มหนี้ → ปรับภาษีขาย/ยอดขาย
  const [pos, setPos] = React.useState([]);   // ใบสั่งซื้อที่ติ๊ก VAT → ภาษีซื้อ
  const [expVat, setExpVat] = React.useState([]);   // ใบเบิกจ่าย (ไม่ผ่าน PO) ที่มีภาษีซื้อ + จ่ายแล้ว → ภาษีซื้อเพิ่ม
  const [payouts, setPayouts] = React.useState([]);   // ใบจ่ายช่างซัพที่จ่ายแล้ว → ภาษีที่เราหักไว้ ต้องนำส่ง (ภ.ง.ด.53)
  const [teamName, setTeamName] = React.useState({});
  const [year, setYear] = React.useState(() => new Date().getFullYear());
  const [openMonth, setOpenMonth] = React.useState(null);
  const [tab, setTab] = React.useState("vat");   // vat = ภ.พ.30 (ขาย/ซื้อ) · wht = ภ.ง.ด.53 (ที่เราหักช่างซัพ)
  const [ent, setEnt] = React.useState("company");   // กิจการ: company = บริษัท (จด VAT) · personal = บุคคล (ไม่จด) · all = รวม
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };

  async function load() {
    try {
      const [r, p, sp, an, ex] = await Promise.all([listReceipts(), listPurchaseOrders().catch(() => []), listSubPayouts().catch(() => []), listAdjustmentNotes().catch(() => []), listExpenses().catch(() => [])]);
      setReceipts(r.filter((x) => x.status !== "cancelled" && x.issue_date));
      setNotes((an || []).filter((x) => x.status === "issued" && x.issue_date));
      // ภาษีซื้อรับรู้เมื่อ "รับของ/จ่ายเงิน" แล้วเท่านั้น — ใบที่ยังไม่รับของยังไม่มีใบกำกับภาษีซื้อในมือ
      // เดิมนับทุกใบที่ติ๊ก VAT ตั้งแต่วันสั่ง → ใบที่สั่งค้างไว้ไม่รับของเลยก็ยังนับเป็นภาษีซื้อตลอดไป
      setPos(p.filter((x) => x.status !== "cancelled" && x.vat && (x.status === "received" || x.paid_at)));
      // ใบเบิกจ่ายที่มีภาษีซื้อ (บิลหน้างานไม่ผ่าน PO) + จ่ายเงินแล้ว · ตัดใบที่เป็นการจ่าย PO ออก (กันซ้ำกับภาษีซื้อ PO)
      const poExpIds = new Set((p || []).map((x) => x.expense_id).filter(Boolean));
      setExpVat((ex || []).filter((x) => Number(x.vat_amt) > 0 && Number(x.paid_amount) > 0 && !poExpIds.has(x.id)));
      // ภาษีที่ "เราหักจากช่างซัพ" แล้วต้องนำส่งสรรพากร (ภ.ง.ด.53) — คนละขากับ wht ในใบเสร็จที่ลูกค้าหักเรา
      setPayouts((sp || []).filter((x) => x.status === "paid" && Number(x.wht_amt) > 0));
      try { const ts = await listTeams(); setTeamName(Object.fromEntries((ts || []).map((t) => [t.id, t]))); } catch (_) { /* ชื่อทีมโหลดไม่ได้ก็ยังโชว์รหัสทีมได้ */ }
    }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setReceipts([]); }
  }
  React.useEffect(() => { load(); }, []);
  // timestamptz เก็บเป็น UTC — slice(0,10) ดื้อ ๆ จะร่นไปวันก่อนหน้าสำหรับเวลาหัวค่ำของไทย ต้องแปลงโซนก่อน
  const bkkDay = (ts) => { if (!ts) return ""; const s = String(ts); return s.length <= 10 ? s : new Date(s).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); };
  // ลงเดือนตามวันที่ "ได้รับของ/จ่ายเงิน" ไม่ใช่วันที่สั่ง — สั่งปลายเดือนแต่ของมาเดือนหน้า ต้องเป็นภาษีซื้อของเดือนหน้า
  const poDate = (x) => bkkDay(x.received_at) || bkkDay(x.paid_at) || x.issue_date || bkkDay(x.created_at);

  const years = React.useMemo(() => {
    const ys = new Set((receipts || []).map((r) => Number((r.issue_date || "").slice(0, 4))).filter(Boolean));
    ys.add(new Date().getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [receipts]);

  // นิติบุคคลของเอกสาร: มี VAT = บริษัท (จด VAT) · ไม่มี VAT = บุคคล (ตรงกับกติกาลงบัญชี api.js) — ภ.พ.30 ต้องเป็นของบริษัทเท่านั้น
  const entOfDoc = (r) => (Number(r.vat_amt) || 0) > 0.005 ? "company" : "personal";
  const keepEnt = (e) => ent === "all" || e === ent;
  const ofYear = React.useMemo(() => (receipts || []).filter((r) => (r.issue_date || "").slice(0, 4) === String(year) && keepEnt(entOfDoc(r))), [receipts, year, ent]);
  // ใบลด/เพิ่มหนี้ปีนี้ → แปลงเป็น "แถวแบบใบเสร็จ" ที่มียอดติดเครื่องหมาย (credit ลบ · debit บวก) เพื่อรวมเข้ารายงานภาษีขาย
  const ofYearNotes = React.useMemo(() => (notes || []).filter((a) => (a.issue_date || "").slice(0, 4) === String(year) && keepEnt(entOfDoc(a))).map((a) => {
    const sign = a.kind === "debit" ? 1 : -1;
    return { receipt_no: a.note_no, issue_date: a.issue_date, customerName: a.customerName, customerTaxId: a.customerTaxId,
      base: sign * (Number(a.base) || 0), vat_amt: sign * (Number(a.vat_amt) || 0), wht_amt: sign * (Number(a.wht_amt) || 0), net: sign * (Number(a.net) || 0), _adj: a.kind };
  }), [notes, year]);

  // aggregate per month (index 0–11): tax is recognised on the receipt (ใบกำกับภาษี) date
  // ภาษีซื้อ: จากใบสั่งซื้อที่ติ๊ก VAT และรับของ/จ่ายแล้ว ลงเดือนตามวันรับของ (ประมาณการ — ตอนยื่นจริงใช้ใบกำกับภาษีซื้อจากผู้ขาย)
  // ⚠️ ยังไม่รวม VAT จากใบเบิกจ่าย (บิลหน้างานที่ไม่ได้ผ่าน PO) — ตาราง expense_requests ยังไม่มีคอลัมน์ VAT
  const months = React.useMemo(() => {
    const m = Array.from({ length: 12 }, () => ({ count: 0, base: 0, vat: 0, buyVat: 0, buyCount: 0, wht: 0, net: 0, rows: [] }));
    ofYear.forEach((r) => {
      const mi = Number((r.issue_date || "").slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) return;
      const b = m[mi];
      b.count++; b.base += Number(r.base) || 0; b.vat += Number(r.vat_amt) || 0; b.wht += Number(r.wht_amt) || 0; b.net += netOf(r); b.rows.push(r);
    });
    // ใบลด/เพิ่มหนี้ (ยอดติดเครื่องหมายแล้ว) — ปรับภาษีขาย/ยอดขายเดือนที่ออกเอกสาร
    ofYearNotes.forEach((r) => {
      const mi = Number((r.issue_date || "").slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) return;
      const b = m[mi];
      b.base += r.base; b.vat += r.vat_amt; b.wht += r.wht_amt; b.net += r.net; b.rows.push(r);
    });
    // ภาษีซื้อ = เครดิตของ "บริษัท" เท่านั้น (ใบกำกับภาษีซื้อออกในนามบริษัทที่จด VAT) — มุมมองบุคคลไม่มีภาษีซื้อ
    if (ent !== "personal") pos.forEach((x) => {
      const d = poDate(x);
      if ((d || "").slice(0, 4) !== String(year)) return;
      const mi = Number((d || "").slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) return;
      m[mi].buyVat += Number(x.vatAmt) || 0; m[mi].buyCount++;
    });
    // ภาษีซื้อจากใบเบิกจ่าย (บิลหน้างาน) — ลงเดือนตามวันจ่ายเงิน · เฉลี่ยตามสัดส่วนที่จ่ายจริง · บริษัทเท่านั้น
    if (ent !== "personal") expVat.forEach((x) => {
      const d = bkkDay(x.last_paid_at || x.paid_at) || (x.created_at || "").slice(0, 10);
      if ((d || "").slice(0, 4) !== String(year)) return;
      const mi = Number((d || "").slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) return;
      const amt = Number(x.amount) || 0;
      const share = amt > 0 ? (Number(x.vat_amt) || 0) * (Number(x.paid_amount) || 0) / amt : 0;
      m[mi].buyVat += share; m[mi].buyCount++;
    });
    m.forEach((b) => { b.base = round2(b.base); b.vat = round2(b.vat); b.buyVat = round2(b.buyVat); b.wht = round2(b.wht); b.net = round2(b.net); b.vatDue = round2(b.vat - b.buyVat); b.rows.sort((a, c) => (a.issue_date < c.issue_date ? -1 : 1)); });
    return m;
  }, [ofYear, ofYearNotes, pos, expVat, year, ent]);

  const tot = months.reduce((a, b) => ({ count: a.count + b.count, base: round2(a.base + b.base), vat: round2(a.vat + b.vat), buyVat: round2(a.buyVat + b.buyVat), buyCount: a.buyCount + b.buyCount, wht: round2(a.wht + b.wht), net: round2(a.net + b.net) }), { count: 0, base: 0, vat: 0, buyVat: 0, buyCount: 0, wht: 0, net: 0 });
  tot.vatDue = round2(tot.vat - tot.buyVat);

  // ---------- ภ.ง.ด.53: ภาษีที่ "เรา" หักจากช่างซัพไว้ แล้วต้องนำส่งสรรพากรภายในวันที่ 7 ของเดือนถัดไป ----------
  // รับรู้ตามวันที่จ่ายเงินจริง (paid_at) ตามหลักเกณฑ์ ป.ภาษี — ไม่ใช่วันที่สร้างใบ
  const whtDate = (p) => (p.paid_at || p.created_at || "").slice(0, 10);
  const teamOf = (id) => teamName[id] || {};
  const whtMonths = React.useMemo(() => {
    const m = Array.from({ length: 12 }, () => ({ count: 0, gross: 0, wht: 0, net: 0, rows: [] }));
    payouts.forEach((p) => {
      const d = whtDate(p);
      if (d.slice(0, 4) !== String(year)) return;
      const mi = Number(d.slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) return;
      const b = m[mi];
      b.count++; b.gross += Number(p.gross) || 0; b.wht += Number(p.wht_amt) || 0; b.net += Number(p.net) || 0; b.rows.push(p);
    });
    m.forEach((b) => { b.gross = round2(b.gross); b.wht = round2(b.wht); b.net = round2(b.net); b.rows.sort((a, c) => (whtDate(a) < whtDate(c) ? -1 : 1)); });
    return m;
  }, [payouts, year]);
  const whtTot = whtMonths.reduce((a, b) => ({ count: a.count + b.count, gross: round2(a.gross + b.gross), wht: round2(a.wht + b.wht), net: round2(a.net + b.net) }), { count: 0, gross: 0, wht: 0, net: 0 });
  // ทีมที่ยังไม่กรอกเลขผู้เสียภาษี → ยื่น ภ.ง.ด.53 ไม่ได้ ต้องเตือนไว้
  const whtNoTaxId = React.useMemo(() => {
    const s = new Set();
    whtMonths.forEach((b) => b.rows.forEach((p) => { if (!teamOf(p.team).tax_id) s.add(p.team); }));
    return Array.from(s);
  }, [whtMonths, teamName]);

  function exportWht() {
    const headers = ["เดือนที่จ่าย", "วันที่จ่าย", "ทีมช่างซัพ", "เลขผู้เสียภาษี", "ยอดจ่ายก่อนหัก", "อัตรา %", "ภาษีหัก ณ ที่จ่าย", "จ่ายสุทธิ", "ใบงาน"];
    const rows = [];
    whtMonths.forEach((b, i) => b.rows.forEach((p) => {
      const t = teamOf(p.team);
      rows.push([`${TH_MONTHS[i]} ${year + 543}`, whtDate(p), t.name || p.team || "", t.tax_id || "", round2(p.gross), Number(p.wht_rate) || 3, round2(p.wht_amt), round2(p.net), (p.job_nos || []).join(" ")]);
    }));
    if (!rows.length) return flash("ไม่มีข้อมูลในปีนี้", true);
    rows.push(["รวมทั้งปี", "", "", "", whtTot.gross, "", whtTot.wht, whtTot.net, ""]);
    downloadCsv(`ภงด53-ภาษีหักช่างซัพ-${year + 543}`, headers, rows);
  }

  const entTag = ent === "company" ? "บริษัท" : ent === "personal" ? "บุคคล" : "รวม";
  function exportMonthly() {
    const headers = ["เดือน", "จำนวนใบเสร็จ", "ยอดก่อน VAT", "ภาษีขาย", "ภาษีซื้อ (ประมาณการ)", "VAT นำส่ง (ขาย−ซื้อ)", "หัก ณ ที่จ่าย", "รับสุทธิ"];
    const rows = months.map((b, i) => [`${TH_MONTHS[i]} ${year + 543}`, b.count, b.base, b.vat, b.buyVat, b.vatDue, b.wht, b.net]);
    rows.push(["รวมทั้งปี", tot.count, tot.base, tot.vat, tot.buyVat, tot.vatDue, tot.wht, tot.net]);
    downloadCsv(`รายงานภาษี-สรุปรายเดือน-${entTag}-${year + 543}`, headers, rows);
  }
  function exportDetail() {
    const headers = ["วันที่", "เลขใบเสร็จ", "ลูกค้า", "เลขผู้เสียภาษี", "ยอดก่อน VAT", "VAT 7%", "หัก ณ ที่จ่าย", "รับสุทธิ"];
    const rows = ofYear.slice().sort((a, b) => (a.issue_date < b.issue_date ? -1 : 1))
      .map((r) => [r.issue_date, r.receipt_no, r.customerName || "", r.customerTaxId || "", round2(r.base), round2(r.vat_amt), round2(r.wht_amt), round2(netOf(r))]);
    if (!rows.length) return flash("ไม่มีข้อมูลในปีนี้", true);
    downloadCsv(`รายงานภาษี-รายใบ-${entTag}-${year + 543}`, headers, rows);
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">รายงานภาษี <span className="page-title-en">VAT / WHT</span></h1>
          <p className="page-sub">สรุปภาษีขาย (VAT) และภาษีหัก ณ ที่จ่าย รายเดือน · คิดจากวันที่ในใบเสร็จ/ใบกำกับภาษี · ส่งออก Excel ได้</p></div>
        <div className="cat-head-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          {tab === "vat" ? (<>
            <button className="btn-ghost sm" onClick={exportMonthly}>⬇ Export สรุปรายเดือน</button>
            <button className="btn-ghost sm" onClick={exportDetail}>⬇ Export รายใบ (ทั้งปี)</button>
          </>) : <button className="btn-ghost sm" onClick={exportWht}>⬇ Export ภ.ง.ด.53 (ทั้งปี)</button>}
        </div>
      </div>

      <div className="cat-chips" style={{ marginBottom: 10 }}>
        <button className={"cat-chip" + (tab === "vat" ? " on" : "")} onClick={() => setTab("vat")}>ภาษีขาย/ซื้อ (ภ.พ.30)</button>
        <button className={"cat-chip" + (tab === "wht" ? " on" : "")} onClick={() => setTab("wht")}>ภาษีหัก ณ ที่จ่าย ที่เราหักไว้ (ภ.ง.ด.53){whtTot.count ? ` · ${whtTot.count}` : ""}</button>
      </div>

      {tab === "vat" && (
        <div className="cat-chips" style={{ marginBottom: 10 }}>
          <span className="page-sub" style={{ margin: "0 6px 0 2px", alignSelf: "center", fontSize: 12.5 }}>กิจการ:</span>
          <button className={"cat-chip" + (ent === "company" ? " on" : "")} onClick={() => setEnt("company")}>🏢 บริษัท (จด VAT)</button>
          <button className={"cat-chip" + (ent === "personal" ? " on" : "")} onClick={() => setEnt("personal")}>👤 บุคคล (ไม่จด VAT)</button>
          <button className={"cat-chip" + (ent === "all" ? " on" : "")} onClick={() => setEnt("all")}>รวมทั้งสองกิจการ</button>
        </div>
      )}

      <div className="cf-bar">
        <div className="sched-nav">
          <button className="btn-ghost sm" onClick={() => setYear((y) => y - 1)}><UIcon name="chevR" size={15} style={{ transform: "rotate(180deg)" }} /></button>
          <div className="sched-title">ปี {year + 543}</div>
          <button className="btn-ghost sm" onClick={() => setYear((y) => y + 1)}><UIcon name="chevR" size={15} /></button>
          {years.length > 1 && (
            <select className="inp" style={{ width: "auto", marginLeft: 8 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>ปี {y + 543}</option>)}
            </select>
          )}
        </div>
      </div>

      {tab === "vat" ? (<>
      {ent === "personal" && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 10, borderLeft: "3px solid #6d28d9", background: "#f5f3ff", fontSize: 12.5, color: "#5b21b6" }}>
          👤 <b>กิจการบุคคล (อาทิตย์ ช่วยชาติ) ไม่ได้จด VAT</b> — ยอดขายส่วนนี้<b>ไม่ต้องยื่น ภ.พ.30</b> และไม่มีภาษีซื้อ/ภาษีขาย (แสดงไว้เพื่อดูยอดเฉย ๆ)
        </div>
      )}
      <div className="kpi-grid jp-kpi">
        <div className="stat-card"><div className="stat-val">{fmtBaht(tot.base)}</div><div className="stat-label">ยอดขายก่อน VAT (ปีนี้) · {tot.count} ใบ</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#1d4ed8" }}>{fmtBaht(tot.vat)}</div><div className="stat-label">ภาษีขาย (จากใบกำกับ)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#0d9488" }}>{fmtBaht(tot.buyVat)}</div><div className="stat-label">ภาษีซื้อ (PO + บิลหน้างาน · {tot.buyCount} ใบ)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: tot.vatDue > 0 ? "#dc2626" : "#16a34a" }}>{fmtBaht(Math.abs(tot.vatDue))}</div><div className="stat-label">{tot.vatDue >= 0 ? "VAT นำส่งสุทธิ (ขาย − ซื้อ)" : "VAT ขอคืน (ซื้อ > ขาย)"}</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#d97706" }}>{fmtBaht(tot.wht)}</div><div className="stat-label">ภาษีหัก ณ ที่จ่าย (เครดิตคืน)</div></div>
      </div>

      {receipts === null ? <div className="empty">กำลังโหลด…</div>
        : (tot.count === 0 && tot.buyCount === 0) ? <div className="empty" style={{ padding: 40 }}>ไม่มีใบเสร็จ/ใบสั่งซื้อ VAT ในปี {year + 543}</div>
        : (
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cf-table">
              <thead><tr>
                <th style={{ textAlign: "left" }}>เดือน</th>
                <th>จำนวนใบ</th><th>ยอดก่อน VAT</th><th>ภาษีขาย</th><th>ภาษีซื้อ</th><th>VAT นำส่ง</th><th>หัก ณ ที่จ่าย</th><th>รับสุทธิ</th><th></th>
              </tr></thead>
              <tbody>
                {months.map((b, i) => (b.count === 0 && b.buyCount === 0) ? null : (
                  <React.Fragment key={i}>
                    <tr className="tax-monthrow" onClick={() => setOpenMonth(openMonth === i ? null : i)} style={{ cursor: "pointer" }}>
                      <td style={{ textAlign: "left", fontWeight: 700 }}>{TH_MONTHS[i]}</td>
                      <td>{b.count}</td>
                      <td>{fmtBaht(b.base)}</td>
                      <td style={{ color: "#1d4ed8", fontWeight: 700 }}>{fmtBaht(b.vat)}</td>
                      <td style={{ color: "#0d9488" }}>{b.buyVat ? fmtBaht(b.buyVat) : "—"}</td>
                      <td style={{ fontWeight: 700, color: b.vatDue > 0 ? "#dc2626" : b.vatDue < 0 ? "#16a34a" : undefined }}>{fmtBaht(b.vatDue)}</td>
                      <td style={{ color: "#d97706" }}>{b.wht ? fmtBaht(b.wht) : "—"}</td>
                      <td style={{ fontWeight: 700 }}>{fmtBaht(b.net)}</td>
                      <td><UIcon name="chevR" size={13} style={{ transform: openMonth === i ? "rotate(90deg)" : "none", color: "var(--ink-3)" }} /></td>
                    </tr>
                    {openMonth === i && b.rows.map((r) => (
                      <tr key={r.receipt_no} className="tax-detailrow">
                        <td style={{ textAlign: "left", paddingLeft: 22 }}>
                          <b>{r.receipt_no}</b> <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{thDate(r.issue_date)}</span>
                          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.customerName || "—"}</div>
                        </td>
                        <td></td>
                        <td>{fmtBaht(r.base)}</td>
                        <td style={{ color: "#1d4ed8" }}>{fmtBaht(r.vat_amt)}</td>
                        <td></td><td></td>
                        <td style={{ color: "#d97706" }}>{r.wht_amt ? fmtBaht(r.wht_amt) : "—"}</td>
                        <td>{fmtBaht(netOf(r))}</td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ textAlign: "left" }}>รวมทั้งปี</td>
                <td>{tot.count}</td>
                <td>{fmtBaht(tot.base)}</td>
                <td style={{ color: "#1d4ed8" }}>{fmtBaht(tot.vat)}</td>
                <td style={{ color: "#0d9488" }}>{fmtBaht(tot.buyVat)}</td>
                <td style={{ fontWeight: 700, color: tot.vatDue > 0 ? "#dc2626" : "#16a34a" }}>{fmtBaht(tot.vatDue)}</td>
                <td style={{ color: "#d97706" }}>{fmtBaht(tot.wht)}</td>
                <td>{fmtBaht(tot.net)}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
        )}

      <p className="page-sub" style={{ marginTop: 12, fontSize: 12 }}>
        💡 <b>กิจการ:</b> ภ.พ.30 ยื่นในนาม<b>บริษัท (จด VAT) เท่านั้น</b> — ยอดฝั่งบุคคลแยกไว้ดูต่างหาก · <b>ภาษีขาย</b>คิดจากใบเสร็จ/ใบกำกับภาษีที่ยังไม่ถูกยกเลิก ตามวันที่ในใบเสร็จ · <b>ภาษีซื้อ</b>ประมาณการจากใบสั่งซื้อที่ติ๊ก VAT <b>เฉพาะใบที่รับของ/จ่ายแล้ว</b> (ลงเดือนตามวันรับของ) <b>+ บิลหน้างาน</b>ที่ติ๊ก "มีใบกำกับภาษีซื้อ VAT" ในเมนูเบิกจ่าย (ลงเดือนตามวันจ่าย) · ตอนยื่น ภพ.30 ให้ใช้ยอดจากใบกำกับภาษีซื้อจริงของผู้ขาย · หัก ณ ที่จ่าย = ภาษีที่ลูกค้าหักไว้ (เครดิตคืน)
        <br />⚠️ <b>ภ.พ.30 ยื่นแยกรายเดือน</b> — เดือนที่ภาษีซื้อ &gt; ภาษีขายจะ<b>ยกเครดิตไปหักเดือนถัดไป</b> (ไม่ได้เอามาสุทธิกับทั้งปี) ให้ดูยอดนำส่ง <b>ราย</b>เดือนในตารางเป็นหลัก · การ์ด "รวมทั้งปี" ไว้ดูภาพรวมเท่านั้น
      </p>
      </>) : (<>
      <div className="kpi-grid">
        <div className="stat-card"><div className="stat-val">{fmtBaht(whtTot.gross)}</div><div className="stat-label">ยอดจ่ายช่างซัพก่อนหัก (ปีนี้) · {whtTot.count} ใบ</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#dc2626" }}>{fmtBaht(whtTot.wht)}</div><div className="stat-label">ภาษีที่หักไว้ ต้องนำส่งสรรพากร</div></div>
        <div className="stat-card"><div className="stat-val">{fmtBaht(whtTot.net)}</div><div className="stat-label">จ่ายช่างซัพจริง (สุทธิ)</div></div>
      </div>

      {whtNoTaxId.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #dc2626", marginBottom: 10 }}>
          ⚠️ <b>ยื่น ภ.ง.ด.53 ไม่ได้จนกว่าจะกรอกเลขผู้เสียภาษี</b> ของทีม: {whtNoTaxId.map((id) => teamOf(id).name || id).join(" · ")}
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>กรอกได้ที่ เมนูช่างซัพ → แก้ไขทีม → เลขผู้เสียภาษี</div>
        </div>
      )}

      {whtTot.count === 0 ? <div className="empty" style={{ padding: 40 }}>ยังไม่มีใบจ่ายช่างซัพที่จ่ายแล้วและมีการหักภาษี ในปี {year + 543}</div> : (
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="cf-table">
            <thead><tr>
              <th style={{ textAlign: "left" }}>เดือนที่จ่าย</th>
              <th>จำนวนใบ</th><th>ยอดจ่ายก่อนหัก</th><th>ภาษีหักไว้</th><th>จ่ายสุทธิ</th><th>กำหนดนำส่ง</th><th></th>
            </tr></thead>
            <tbody>
              {whtMonths.map((b, i) => b.count === 0 ? null : (
                <React.Fragment key={i}>
                  <tr className="tax-monthrow" onClick={() => setOpenMonth(openMonth === "w" + i ? null : "w" + i)} style={{ cursor: "pointer" }}>
                    <td style={{ textAlign: "left", fontWeight: 700 }}>{TH_MONTHS[i]}</td>
                    <td>{b.count}</td>
                    <td>{fmtBaht(b.gross)}</td>
                    <td style={{ color: "#dc2626", fontWeight: 700 }}>{fmtBaht(b.wht)}</td>
                    <td>{fmtBaht(b.net)}</td>
                    <td style={{ fontSize: 12, color: "var(--ink-2)" }}>ภายใน 7 {TH_MONTHS[(i + 1) % 12]}</td>
                    <td><UIcon name="chevR" size={13} style={{ transform: openMonth === "w" + i ? "rotate(90deg)" : "none", color: "var(--ink-3)" }} /></td>
                  </tr>
                  {openMonth === "w" + i && b.rows.map((p) => {
                    const t = teamOf(p.team);
                    return (
                      <tr key={p.id} className="tax-detailrow">
                        <td style={{ textAlign: "left", paddingLeft: 22 }}>
                          <b>{t.name || p.team || "—"}</b> <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{thDate(whtDate(p))}</span>
                          <div style={{ fontSize: 12, color: t.tax_id ? "var(--ink-2)" : "#dc2626" }}>{t.tax_id ? "เลขผู้เสียภาษี " + t.tax_id : "⚠️ ไม่มีเลขผู้เสียภาษี"}</div>
                          {(p.job_nos || []).length > 0 && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{(p.job_nos || []).join(", ")}</div>}
                        </td>
                        <td></td>
                        <td>{fmtBaht(p.gross)}</td>
                        <td style={{ color: "#dc2626" }}>{fmtBaht(p.wht_amt)} <span style={{ fontSize: 11, color: "var(--ink-3)" }}>({Number(p.wht_rate) || 3}%)</span></td>
                        <td>{fmtBaht(p.net)}</td>
                        <td></td><td></td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot><tr>
              <td style={{ textAlign: "left" }}>รวมทั้งปี</td>
              <td>{whtTot.count}</td>
              <td>{fmtBaht(whtTot.gross)}</td>
              <td style={{ color: "#dc2626", fontWeight: 700 }}>{fmtBaht(whtTot.wht)}</td>
              <td>{fmtBaht(whtTot.net)}</td>
              <td></td><td></td>
            </tr></tfoot>
          </table>
        </div>
      )}

      <p className="page-sub" style={{ marginTop: 12, fontSize: 12 }}>
        💡 นี่คือภาษีที่ <b>เราหักจากช่างซัพไว้</b> ตอนจ่ายเงิน (คนละขากับแท็บแรกที่ลูกค้าหักเรา) — เป็น<b>หนี้ที่ต้องนำส่งสรรพากร</b> ไม่ใช่เงินของเรา · รับรู้ตามวันที่จ่ายจริง · ยื่น <b>ภ.ง.ด.53</b> ภายในวันที่ 7 ของเดือนถัดไป (ยื่นออนไลน์ถึงวันที่ 15) · ต้องออก<b>หนังสือรับรองการหักภาษี ณ ที่จ่าย</b>ให้ช่างซัพทุกครั้งที่จ่าย
      </p>
      </>)}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
