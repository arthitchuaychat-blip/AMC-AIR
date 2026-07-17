import React from "react";
import { listInvoices, listPurchaseOrders } from "../lib/api";
import { fmtBaht, fmtNum, fmtCompact, downloadCsv, inRange } from "../lib/format";

// รายงานผู้บริหาร 6 ตัว (แท็บในแดชบอร์ด) — คำนวณจากข้อมูลที่แดชบอร์ดโหลดอยู่แล้ว + โหลดเพิ่ม 2 ก้อนแบบขี้เกียจ
// ทุกตารางมี ⬇ Export CSV · ช่วงเวลาตามตัวกรองแดชบอร์ด (from/to)
const R2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const JT = { install: "ติดตั้ง", move: "ย้าย", clean: "ล้าง/บำรุง", repair: "ซ่อม/แก้ไข", survey: "สำรวจ", maintain: "PM", other: "อื่น ๆ" };
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function Card({ title, sub, onExport, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="sec-head"><div><div className="sec-title">{title}</div><div className="sec-sub">{sub}</div></div>
        {onExport && <button className="btn-ghost sm" onClick={onExport}>⬇ Export</button>}</div>
      {children}
    </div>
  );
}
const T = ({ head, rows }) => (
  <div style={{ overflowX: "auto" }}>
    <table className="hr-table"><thead><tr>{head.map((h, i) => <th key={i} style={i === 0 ? { textAlign: "left" } : {}}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={j === 0 ? { textAlign: "left" } : {}}>{c}</td>)}</tr>)}</tbody></table>
  </div>
);

export default function ExecReports({ ov, act, accounts, from, to, periodLabel }) {
  const [invs, setInvs] = React.useState(null);
  const [pos, setPos] = React.useState(null);
  React.useEffect(() => {
    listInvoices().then(setInvs).catch(() => setInvs([]));
    listPurchaseOrders().then(setPos).catch(() => setPos([]));
  }, []);
  const qs = ov?.qs || [], bs = ov?.bs || [], rcs = ov?.rcs || [];
  const inR = (q) => inRange(q.issue_date || q.created_at, from, to);

  // 1) อัตราปิดการขาย — ใบเสนอที่ออกในช่วง แยกรายเซลล์
  const conv = React.useMemo(() => {
    const by = {};
    qs.filter(inR).forEach((q) => {
      const k = q.createdByName || "(ไม่ระบุ)";
      const b = by[k] || (by[k] = { issued: 0, approved: 0, sale: 0 });
      b.issued++; if (q.status === "approved") { b.approved++; b.sale += q.afterDisc || 0; }
    });
    const rows = Object.entries(by).map(([name, b]) => ({ name, ...b, rate: b.issued ? b.approved / b.issued * 100 : 0 })).sort((a, x) => x.sale - a.sale);
    const tot = rows.reduce((a, r) => ({ issued: a.issued + r.issued, approved: a.approved + r.approved, sale: a.sale + r.sale }), { issued: 0, approved: 0, sale: 0 });
    return { rows, tot, rate: tot.issued ? tot.approved / tot.issued * 100 : 0 };
  }, [qs, from, to]);

  // 2) ลูกค้า Top 10 + ลูกค้าหาย (เคยซื้อ ≥2 ครั้ง เงียบเกิน 6 เดือน — ดูทั้งประวัติ ไม่ติดช่วงเวลา)
  const cust = React.useMemo(() => {
    const by = {};
    qs.filter((q) => q.status === "approved").forEach((q) => {
      const k = q.customerName || "(ไม่ระบุ)";
      const b = by[k] || (by[k] = { sale: 0, inSale: 0, count: 0, last: "" });
      b.count++; b.sale += q.afterDisc || 0; if (inR(q)) b.inSale += q.afterDisc || 0;
      const d = (q.approved_at || q.issue_date || "").slice(0, 10);
      if (d > b.last) b.last = d;
    });
    const all = Object.entries(by).map(([name, b]) => ({ name, ...b }));
    const top = all.slice().sort((a, x) => x.sale - a.sale).slice(0, 10);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
    const lost = all.filter((c) => c.count >= 2 && c.last && c.last < cutoff.toISOString().slice(0, 10)).sort((a, x) => x.sale - a.sale).slice(0, 10);
    return { top, lost, all };
  }, [qs, from, to]);

  // 3) อายุหนี้ (DSO) — ใบเสร็จรับเงินแล้วที่ผูกใบแจ้งหนี้: วันที่รับเงิน − วันที่ออกใบแจ้งหนี้
  const dso = React.useMemo(() => {
    if (!invs) return null;
    const invDate = Object.fromEntries(invs.map((i) => [i.invoice_no, i.issue_date || (i.created_at || "").slice(0, 10)]));
    const by = {}; let sum = 0, n = 0;
    rcs.filter((r) => r.status === "paid" && r.invoice_no && invDate[r.invoice_no] && r.issue_date).forEach((r) => {
      const d = daysBetween(invDate[r.invoice_no], r.issue_date);
      if (d < 0 || d > 400) return;
      sum += d; n++;
      const k = r.customerName || "(ไม่ระบุ)";
      const b = by[k] || (by[k] = { sum: 0, n: 0 });
      b.sum += d; b.n++;
    });
    const rows = Object.entries(by).map(([name, b]) => ({ name, avg: b.sum / b.n, n: b.n })).sort((a, x) => x.avg - a.avg).slice(0, 10);
    return { avg: n ? sum / n : 0, n, rows };
  }, [invs, rcs]);

  // 4) กำไรแยกประเภทงาน — ใบเสนออนุมัติในช่วง: ยอดขาย + กำไรประมาณการ (BOQ)
  const byType = React.useMemo(() => {
    const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
    const by = {};
    qs.filter((q) => q.status === "approved" && inRange(q.approved_at || q.issue_date, from, to)).forEach((q) => {
      const k = q.job_type || "other";
      const b = by[k] || (by[k] = { sale: 0, count: 0, est: 0, estN: 0 });
      b.count++; b.sale += q.afterDisc || 0;
      if (q.boq_no && boqCost[q.boq_no] != null) { b.est += (q.afterDisc || 0) - boqCost[q.boq_no]; b.estN++; }
    });
    return Object.entries(by).map(([t, b]) => ({ type: JT[t] || t, ...b, margin: b.sale ? b.est / b.sale * 100 : 0 })).sort((a, x) => x.sale - a.sale);
  }, [qs, bs, from, to]);

  // 5) สรุปผู้ขาย — PO ไม่ยกเลิกทั้งประวัติ: ยอดซื้อสะสม/จำนวนใบ/ซื้อล่าสุด
  const sup = React.useMemo(() => {
    if (!pos) return null;
    const by = {};
    pos.filter((p) => p.status !== "cancelled").forEach((p) => {
      const k = p.supplier || "(ไม่ระบุ)";
      const b = by[k] || (by[k] = { total: 0, count: 0, last: "" });
      b.count++; b.total += Number(p.total) || 0;
      const d = p.issue_date || (p.created_at || "").slice(0, 10);
      if (d > b.last) b.last = d;
    });
    return Object.entries(by).map(([name, b]) => ({ name, ...b, avg: b.total / b.count })).sort((a, x) => x.total - a.total).slice(0, 10);
  }, [pos]);

  // 6) เงินสุทธิพร้อมใช้ (cash position) — เงินทุกบัญชี + ค้างรับ − ค้างจ่าย
  const accTotal = (accounts || []).reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const net = accTotal + (act?.receivable || 0) - (act?.payable || 0);

  const pct = (v) => v.toFixed(0) + "%";
  return (
    <div>
      <p className="page-sub" style={{ margin: "4px 0 12px" }}>ช่วงเวลา: {periodLabel} (ตามตัวกรองด้านบน) · ลูกค้าหาย/ผู้ขาย/อายุหนี้ ดูจากทั้งประวัติ</p>

      <Card title="1) อัตราปิดการขาย (Conversion)" sub={`ใบเสนอที่ออกในช่วง ${fmtNum(conv.tot.issued)} ใบ · อนุมัติ ${fmtNum(conv.tot.approved)} ใบ = ${pct(conv.rate)} · ยอดขาย ${fmtCompact(conv.tot.sale)}`}
        onExport={() => downloadCsv(`อัตราปิดการขาย-${today()}`, ["พนักงานขาย", "ใบเสนอที่ออก", "อนุมัติ", "% ปิดได้", "ยอดขายอนุมัติ"], conv.rows.map((r) => [r.name, r.issued, r.approved, R2(r.rate), R2(r.sale)]))}>
        <T head={["พนักงานขาย", "ออก", "อนุมัติ", "% ปิด", "ยอดขาย"]} rows={conv.rows.map((r) => [r.name, fmtNum(r.issued), fmtNum(r.approved), pct(r.rate), fmtBaht(r.sale)])} />
      </Card>

      <Card title="2) ลูกค้า Top 10 + ลูกค้าที่หายไป" sub="ยอดสะสมจากใบเสนออนุมัติทั้งหมด · 'หาย' = เคยซื้อ ≥2 ครั้ง แต่เงียบเกิน 6 เดือน"
        onExport={() => downloadCsv(`ลูกค้า-${today()}`, ["ลูกค้า", "ยอดสะสม", "จำนวนงาน", "ซื้อล่าสุด", "สถานะ"],
          [...cust.top.map((c) => [c.name, R2(c.sale), c.count, c.last, "Top"]), ...cust.lost.map((c) => [c.name, R2(c.sale), c.count, c.last, "หายเกิน 6 เดือน"])])}>
        <T head={["ลูกค้า (Top 10)", "ยอดสะสม", "งาน", "ล่าสุด"]} rows={cust.top.map((c) => [c.name, fmtBaht(c.sale), fmtNum(c.count), c.last])} />
        {cust.lost.length > 0 && <>
          <div className="sec-sub" style={{ margin: "10px 0 4px", color: "#dc2626", fontWeight: 700 }}>⚠️ ลูกค้าประจำที่เงียบเกิน 6 เดือน — น่าติดต่อกลับ (เมนูติดตามลูกค้า)</div>
          <T head={["ลูกค้า", "ยอดสะสม", "งาน", "ซื้อล่าสุด"]} rows={cust.lost.map((c) => [c.name, fmtBaht(c.sale), fmtNum(c.count), c.last])} />
        </>}
      </Card>

      <Card title="3) อายุหนี้เฉลี่ย (DSO)" sub={dso ? `เฉลี่ยทั้งร้าน ${dso.avg.toFixed(0)} วัน (จาก ${fmtNum(dso.n)} ใบ: ออกใบแจ้งหนี้ → รับเงินจริง) · ตารางเรียงจากเก็บช้าสุด` : "กำลังโหลด…"}
        onExport={dso ? () => downloadCsv(`อายุหนี้-${today()}`, ["ลูกค้า", "เฉลี่ย (วัน)", "จำนวนใบ"], dso.rows.map((r) => [r.name, R2(r.avg), r.n])) : null}>
        {dso && (dso.n ? <T head={["ลูกค้า (ช้าสุด 10 อันดับ)", "เฉลี่ย (วัน)", "ใบ"]} rows={dso.rows.map((r) => [r.name, r.avg.toFixed(0), fmtNum(r.n)])} />
          : <div className="empty sm">ยังไม่มีใบเสร็จที่ผูกใบแจ้งหนี้พอให้คำนวณ</div>)}
      </Card>

      <Card title="4) กำไรแยกประเภทงาน" sub={`ใบเสนออนุมัติในช่วง ${periodLabel} · กำไร = ประมาณการจาก BOQ (กำไรจริงรายงานอยู่หน้า กำไร/งาน)`}
        onExport={() => downloadCsv(`กำไรตามประเภทงาน-${today()}`, ["ประเภทงาน", "จำนวนงาน", "ยอดขาย", "กำไรประมาณการ", "มาร์จิน %"], byType.map((r) => [r.type, r.count, R2(r.sale), R2(r.est), R2(r.margin)]))}>
        <T head={["ประเภทงาน", "งาน", "ยอดขาย", "กำไรประมาณการ", "มาร์จิน"]}
          rows={byType.map((r) => [r.type, fmtNum(r.count), fmtBaht(r.sale), fmtBaht(r.est), pct(r.margin)])} />
      </Card>

      <Card title="5) สรุปผู้ขาย (Top 10)" sub="ยอดซื้อสะสมทั้งประวัติจากใบสั่งซื้อ (ไม่รวมใบยกเลิก) · ใช้ต่อรองราคา/เครดิตเทอม"
        onExport={sup ? () => downloadCsv(`ผู้ขาย-${today()}`, ["ผู้ขาย", "ยอดซื้อสะสม", "จำนวนใบ", "เฉลี่ย/ใบ", "ซื้อล่าสุด"], sup.map((s) => [s.name, R2(s.total), s.count, R2(s.avg), s.last])) : null}>
        {sup ? <T head={["ผู้ขาย", "ยอดสะสม", "ใบ", "เฉลี่ย/ใบ", "ล่าสุด"]} rows={sup.map((s) => [s.name, fmtBaht(s.total), fmtNum(s.count), fmtBaht(s.avg), s.last])} /> : <div className="empty sm">กำลังโหลด…</div>}
      </Card>

      <Card title="6) เงินสุทธิพร้อมใช้ (Cash Position)" sub="เงินทุกบัญชี + เงินค้างรับ − ยอดค้างจ่าย · ประมาณการล่วงหน้าดูเมนูกระแสเงินสด"
        onExport={() => downloadCsv(`เงินสุทธิ-${today()}`, ["รายการ", "จำนวนเงิน"],
          [...(accounts || []).map((a) => [`บัญชี ${a.name}`, R2(a.balance)]), ["เงินค้างรับ", R2(act?.receivable || 0)], ["ยอดค้างจ่าย", -R2(act?.payable || 0)], ["เงินสุทธิพร้อมใช้", R2(net)]])}>
        <div className="kpi-grid">
          <div className="stat-card"><div className="stat-val">{fmtBaht(accTotal)}</div><div className="stat-label">เงินในบัญชีรวม ({(accounts || []).length} บัญชี)</div></div>
          <div className="stat-card"><div className="stat-val" style={{ color: "#1d4ed8" }}>{fmtBaht(act?.receivable || 0)}</div><div className="stat-label">+ เงินค้างรับ</div></div>
          <div className="stat-card"><div className="stat-val" style={{ color: "#dc2626" }}>−{fmtBaht(act?.payable || 0)}</div><div className="stat-label">− ยอดค้างจ่าย</div></div>
          <div className="stat-card"><div className="stat-val" style={{ color: net >= 0 ? "var(--up)" : "#dc2626" }}>{fmtBaht(net)}</div><div className="stat-label">เงินสุทธิพร้อมใช้</div><div className="stat-sub">ยังไม่หักเงินเดือนรอบถัดไป</div></div>
        </div>
      </Card>
    </div>
  );
}
