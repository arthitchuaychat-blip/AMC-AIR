import React from "react";
import { listReceipts, listPurchaseOrders } from "../lib/api";
import { fmtBaht, round2, downloadCsv } from "../lib/format";
import { UIcon } from "../icons";

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const thDate = (s) => { try { return new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } };
const netOf = (r) => Number(r.net) || ((Number(r.total) || 0) - (Number(r.wht_amt) || 0));

export default function TaxReport({ role }) {
  const [receipts, setReceipts] = React.useState(null);
  const [pos, setPos] = React.useState([]);   // ใบสั่งซื้อที่ติ๊ก VAT → ภาษีซื้อ
  const [year, setYear] = React.useState(() => new Date().getFullYear());
  const [openMonth, setOpenMonth] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };

  async function load() {
    try {
      const [r, p] = await Promise.all([listReceipts(), listPurchaseOrders().catch(() => [])]);
      setReceipts(r.filter((x) => x.status !== "cancelled" && x.issue_date));
      setPos(p.filter((x) => x.status !== "cancelled" && x.vat));
    }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setReceipts([]); }
  }
  React.useEffect(() => { load(); }, []);
  const poDate = (x) => x.issue_date || (x.created_at || "").slice(0, 10);

  const years = React.useMemo(() => {
    const ys = new Set((receipts || []).map((r) => Number((r.issue_date || "").slice(0, 4))).filter(Boolean));
    ys.add(new Date().getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [receipts]);

  const ofYear = React.useMemo(() => (receipts || []).filter((r) => (r.issue_date || "").slice(0, 4) === String(year)), [receipts, year]);

  // aggregate per month (index 0–11): tax is recognised on the receipt (ใบกำกับภาษี) date
  // ภาษีซื้อ: จากใบสั่งซื้อที่ติ๊ก VAT ตามวันที่ใบ (ประมาณการ — ตอนยื่นจริงใช้ใบกำกับภาษีซื้อจากผู้ขาย)
  const months = React.useMemo(() => {
    const m = Array.from({ length: 12 }, () => ({ count: 0, base: 0, vat: 0, buyVat: 0, buyCount: 0, wht: 0, net: 0, rows: [] }));
    ofYear.forEach((r) => {
      const mi = Number((r.issue_date || "").slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) return;
      const b = m[mi];
      b.count++; b.base += Number(r.base) || 0; b.vat += Number(r.vat_amt) || 0; b.wht += Number(r.wht_amt) || 0; b.net += netOf(r); b.rows.push(r);
    });
    pos.forEach((x) => {
      const d = poDate(x);
      if ((d || "").slice(0, 4) !== String(year)) return;
      const mi = Number((d || "").slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) return;
      m[mi].buyVat += Number(x.vatAmt) || 0; m[mi].buyCount++;
    });
    m.forEach((b) => { b.base = round2(b.base); b.vat = round2(b.vat); b.buyVat = round2(b.buyVat); b.wht = round2(b.wht); b.net = round2(b.net); b.vatDue = round2(b.vat - b.buyVat); b.rows.sort((a, c) => (a.issue_date < c.issue_date ? -1 : 1)); });
    return m;
  }, [ofYear, pos, year]);

  const tot = months.reduce((a, b) => ({ count: a.count + b.count, base: round2(a.base + b.base), vat: round2(a.vat + b.vat), buyVat: round2(a.buyVat + b.buyVat), buyCount: a.buyCount + b.buyCount, wht: round2(a.wht + b.wht), net: round2(a.net + b.net) }), { count: 0, base: 0, vat: 0, buyVat: 0, buyCount: 0, wht: 0, net: 0 });
  tot.vatDue = round2(tot.vat - tot.buyVat);

  function exportMonthly() {
    const headers = ["เดือน", "จำนวนใบเสร็จ", "ยอดก่อน VAT", "ภาษีขาย", "ภาษีซื้อ (ประมาณการ)", "VAT นำส่ง (ขาย−ซื้อ)", "หัก ณ ที่จ่าย", "รับสุทธิ"];
    const rows = months.map((b, i) => [`${TH_MONTHS[i]} ${year + 543}`, b.count, b.base, b.vat, b.buyVat, b.vatDue, b.wht, b.net]);
    rows.push(["รวมทั้งปี", tot.count, tot.base, tot.vat, tot.buyVat, tot.vatDue, tot.wht, tot.net]);
    downloadCsv(`รายงานภาษี-สรุปรายเดือน-${year + 543}`, headers, rows);
  }
  function exportDetail() {
    const headers = ["วันที่", "เลขใบเสร็จ", "ลูกค้า", "เลขผู้เสียภาษี", "ยอดก่อน VAT", "VAT 7%", "หัก ณ ที่จ่าย", "รับสุทธิ"];
    const rows = ofYear.slice().sort((a, b) => (a.issue_date < b.issue_date ? -1 : 1))
      .map((r) => [r.issue_date, r.receipt_no, r.customerName || "", r.customerTaxId || "", round2(r.base), round2(r.vat_amt), round2(r.wht_amt), round2(netOf(r))]);
    if (!rows.length) return flash("ไม่มีข้อมูลในปีนี้", true);
    downloadCsv(`รายงานภาษี-รายใบ-${year + 543}`, headers, rows);
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">รายงานภาษี <span className="page-title-en">VAT / WHT</span></h1>
          <p className="page-sub">สรุปภาษีขาย (VAT) และภาษีหัก ณ ที่จ่าย รายเดือน · คิดจากวันที่ในใบเสร็จ/ใบกำกับภาษี · ส่งออก Excel ได้</p></div>
        <div className="cat-head-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost sm" onClick={exportMonthly}>⬇ Export สรุปรายเดือน</button>
          <button className="btn-ghost sm" onClick={exportDetail}>⬇ Export รายใบ (ทั้งปี)</button>
        </div>
      </div>

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

      <div className="kpi-grid">
        <div className="stat-card"><div className="stat-val">{fmtBaht(tot.base)}</div><div className="stat-label">ยอดขายก่อน VAT (ปีนี้) · {tot.count} ใบ</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#1d4ed8" }}>{fmtBaht(tot.vat)}</div><div className="stat-label">ภาษีขาย (จากใบกำกับ)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#0d9488" }}>{fmtBaht(tot.buyVat)}</div><div className="stat-label">ภาษีซื้อ (จาก PO มี VAT · {tot.buyCount} ใบ)</div></div>
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
        💡 <b>ภาษีขาย</b>คิดจากใบเสร็จ/ใบกำกับภาษีที่ยังไม่ถูกยกเลิก ตามวันที่ในใบเสร็จ · <b>ภาษีซื้อ</b>ประมาณการจากใบสั่งซื้อที่ติ๊ก VAT ตามวันที่ใบสั่งซื้อ (ตอนยื่น ภพ.30 ให้ใช้ยอดจากใบกำกับภาษีซื้อจริงของผู้ขาย) · <b>VAT นำส่ง</b> = ภาษีขาย − ภาษีซื้อ (ติดลบ = ขอคืน/ยกยอด) · หัก ณ ที่จ่าย = ภาษีที่ลูกค้าหักไว้ (เครดิตคืน)
      </p>

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
