import React from "react";
import { listQuotations, costOfGoodsByGroup, listSubPayouts, listPayslipsRange, listExpenses } from "../lib/api";
import { fmtBaht, inRange, downloadCsv } from "../lib/format";

// รายงานกำไร-ขาดทุน (P&L เฟส 3) — เกณฑ์ "ต้นทุน/ค่าใช้จ่ายที่เกิดจริงในช่วง" เทียบยอดขายอนุมัติในช่วง
//   รายได้ − ต้นทุนขาย(COGS) = กำไรขั้นต้น − ค่าใช้จ่ายดำเนินงาน(OPEX) = กำไรสุทธิ
// แหล่งข้อมูล: รายได้=ใบเสนออนุมัติ · COGS ของ=transactions(เบิก) · ค่าแรงซัพ=sub_payouts(จ่ายแล้ว)
//   เงินเดือน=payslips(งวดในช่วง) · OPEX=expense_requests แยกตามหมวด
// กันนับซ้ำ: ใบเบิกหมวด "ซื้อสินค้า (PO)" ไม่นับใน OPEX (ต้นทุนของนับทาง transactions แล้ว)
const EXCLUDE_OPEX = new Set(["ซื้อสินค้า (PO)"]);

export default function PnLReport({ from, to, periodLabel }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    const opt = from ? { since: from } : {};
    const fromYM = from ? from.slice(0, 7) : null;
    const toYM = to ? to.slice(0, 7) : null;
    (async () => {
      try {
        const [qs, cog, payouts, slips, expenses] = await Promise.all([
          listQuotations(opt),
          costOfGoodsByGroup(from || null, to || null),
          listSubPayouts().catch(() => []),
          listPayslipsRange(fromYM, toYM).catch(() => []),
          listExpenses().catch(() => []),
        ]);
        // รายได้ = ยอดขายอนุมัติในช่วง (ก่อน VAT) — ฐานเดียวกับการ์ด "ยอดขายอนุมัติ" บนแดชบอร์ด
        const revenue = qs.reduce((a, q) => a + (q.status === "approved" && inRange(q.approved_at || q.issue_date, from, to) ? (q.afterDisc || 0) : 0), 0);
        // ค่าแรงช่างซัพ = ยอดจ่ายจริงในช่วง (gross = ต้นทุนค่าแรงเต็มก่อนหัก ณ ที่จ่าย)
        const subLabor = payouts.reduce((a, p) => a + (p.status === "paid" && inRange((p.paid_at || "").slice(0, 10), from, to) ? (Number(p.gross) || 0) : 0), 0);
        // เงินเดือน = รวม net ของสลิปงวดในช่วง (listPayslipsRange กรอง period ให้แล้ว)
        const salary = slips.reduce((a, s) => a + (Number(s.net) || 0), 0);
        // OPEX แยกตามหมวด = ใบเบิก status approved/paid, วันที่ตั้งเบิก (created_at) อยู่ในช่วง
        const opexByCat = {};
        expenses.forEach((e) => {
          if (!(e.status === "approved" || e.status === "paid")) return;
          if (!inRange((e.created_at || "").slice(0, 10), from, to)) return;
          const cat = e.category || "อื่น ๆ";
          if (EXCLUDE_OPEX.has(cat)) return;
          opexByCat[cat] = (opexByCat[cat] || 0) + (Number(e.amount) || 0);
        });
        if (alive) setD({ revenue, cog, subLabor, salary, opexByCat });
      } catch (e) { if (alive) setErr(e.message || String(e)); }
    })();
    return () => { alive = false; };
  }, [from, to]);

  if (err) return <div className="card" style={{ borderLeft: "4px solid #dc2626" }}>⚠️ โหลดรายงานไม่สำเร็จ<div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>{err}</div></div>;
  if (!d) return <div className="empty">กำลังคำนวณกำไร-ขาดทุน…</div>;

  const cogsGoods = d.cog.ac + d.cog.material + d.cog.part;
  const cogs = cogsGoods + d.subLabor;
  const gross = d.revenue - cogs;
  const opexRows = Object.entries(d.opexByCat).sort((a, b) => b[1] - a[1]);
  const opex = d.salary + opexRows.reduce((a, [, v]) => a + v, 0);
  const net = gross - opex;
  const pct = (v) => (d.revenue > 0 ? (v / d.revenue * 100).toFixed(1) + "%" : "–");

  // แถวรายงาน: kind = head(หัวหมวด) · item(รายการย่อย) · sub(ยอดรวมหมวด) · grand(กำไร)
  const rows = [
    ["รายได้ (ยอดขายอนุมัติ ก่อน VAT)", d.revenue, "sub"],
    ["ต้นทุนขาย (COGS)", null, "head"],
    ["   เครื่องปรับอากาศ", d.cog.ac, "item"],
    ["   วัสดุ", d.cog.material, "item"],
    ["   อุปกรณ์เสริม / อะไหล่", d.cog.part, "item"],
    ["   ค่าแรงช่างซับ", d.subLabor, "item"],
    ["รวมต้นทุนขาย", cogs, "sub"],
    [`กำไรขั้นต้น (${pct(gross)})`, gross, "grand"],
    ["ค่าใช้จ่ายดำเนินงาน (OPEX)", null, "head"],
    ["   เงินเดือน", d.salary, "item"],
    ...opexRows.map(([c, v]) => ["   " + c, v, "item"]),
    ["รวมค่าใช้จ่ายดำเนินงาน", opex, "sub"],
    [`กำไรสุทธิ (${pct(net)})`, net, "grand"],
  ];

  const rowStyle = (k) => {
    if (k === "grand") return { fontWeight: 800, fontSize: 15, borderTop: "2px solid var(--line)", background: "var(--bg-soft, #f8fafc)" };
    if (k === "sub") return { fontWeight: 700, borderTop: "1px solid var(--line)" };
    if (k === "head") return { fontWeight: 700, color: "var(--ink-2)", paddingTop: 8 };
    return { color: "var(--ink-1)" };
  };

  return (
    <div className="card">
      <div className="sec-head" style={{ marginBottom: 6 }}>
        <div><div className="sec-title">กำไร-ขาดทุน (P&amp;L) · {periodLabel}</div>
          <div className="sec-sub">ต้นทุน/ค่าใช้จ่ายที่เกิดจริงในช่วง เทียบยอดขายอนุมัติ · ใช้ดูภาพรวม ไม่ใช่บัญชีแม่นรายบิล</div></div>
        <button className="btn-ghost sm" onClick={() => downloadCsv(`กำไรขาดทุน-${new Date().toISOString().slice(0, 10)}`,
          ["รายการ", "จำนวนเงิน"], rows.filter((r) => r[1] != null).map((r) => [r[0].trim(), Math.round(r[1] * 100) / 100]))}>⬇ Export</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map(([label, amt, kind], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", fontSize: 13.5, ...rowStyle(kind) }}>
            <span>{label}</span>
            {amt != null && <span style={{ fontVariantNumeric: "tabular-nums", color: kind === "grand" && amt < 0 ? "#dc2626" : undefined }}>{fmtBaht(amt)}</span>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.6 }}>
        เกณฑ์: ต้นทุนของ = ราคาทุนของที่เบิกเข้างานในช่วง · ค่าแรงช่างซับ = ยอดจ่ายจริงในช่วง · เงินเดือน = สลิปงวดในช่วง · ค่าใช้จ่าย = ใบเบิกที่อนุมัติแล้วในช่วง (ไม่รวมหมวด “ซื้อสินค้า (PO)” ที่นับเป็นต้นทุนของแล้ว)
      </div>
    </div>
  );
}
