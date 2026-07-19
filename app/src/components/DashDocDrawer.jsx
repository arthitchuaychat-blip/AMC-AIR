import React from "react";
import { fmtBaht, fmtNum, fmtCompact, fmtDocDate, downloadCsv, inRange, round2 } from "../lib/format";
import { UIcon } from "../icons";

// แผงรายการเอกสารของการ์ดขาย/รับเงิน/กำไรบนแดชบอร์ด — คลิกการ์ดแล้วเห็นว่า "ยอดนี้มาจากใบไหนบ้าง"
// กดแต่ละแถวเปิดเอกสารจริง (แท็บใหม่) · ปุ่ม Export ออกเป็น CSV (เปิดใน Excel/Google Sheets ได้ ภาษาไทยไม่เพี้ยน)
const META = {
  q_all:    { th: "ยอดขายอนุมัติ", en: "Approved sales", color: "#2563eb", icon: "trend", src: "quote" },
  q_vat:    { th: "ยอดขายอนุมัติ · รับ VAT", en: "Approved sales · VAT", color: "#1f74e0", icon: "trend", src: "quote", vat: true },
  q_novat:  { th: "ยอดขายอนุมัติ · ไม่ VAT", en: "Approved sales · No VAT", color: "#64748b", icon: "trend", src: "quote", vat: false },
  rc_all:   { th: "รับเงินแล้ว (ใบเสร็จ)", en: "Paid receipts", color: "#0a6b3d", icon: "check", src: "receipt" },
  rc_vat:   { th: "รับเงินแล้ว · รับ VAT", en: "Paid receipts · VAT", color: "#15803d", icon: "check", src: "receipt", vat: true },
  rc_novat: { th: "รับเงินแล้ว · ไม่ VAT", en: "Paid receipts · No VAT", color: "#4d7c0f", icon: "check", src: "receipt", vat: false },
  est:      { th: "กำไรประมาณการ (BOQ)", en: "Estimated profit · ขาย − ทุน BOQ", color: "#16a34a", icon: "trend", src: "est" },
};

export default function DashDocDrawer({ kind, periodLabel, from, to, quotes, receipts, boqs, onClose, onOpenDoc }) {
  const M = META[kind];
  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  // ---- แปลงข้อมูลเป็นแถวเดียวกันทุกชนิด (เรียงวันที่ใหม่→เก่า) ----
  const rows = React.useMemo(() => {
    if (M.src === "quote" || M.src === "est") {
      const boqCost = Object.fromEntries((boqs || []).map((b) => [b.boq_no, b.total]));
      return (quotes || [])
        .filter((q) => q.status === "approved" && inRange(q.approved_at || q.issue_date, from, to))
        .filter((q) => M.src === "est" ? (q.boq_no && boqCost[q.boq_no] != null) : (M.vat === undefined || !!q.vat === M.vat))
        .map((q) => {
          const cost = q.boq_no != null ? Number(boqCost[q.boq_no]) : null;
          return {
            type: "quote", no: q.quote_no, date: (q.approved_at || q.issue_date || "").slice(0, 10),
            name: q.customerName || "-", title: q.title || "", isVat: !!q.vat,
            base: round2(q.afterDisc || 0), vat: round2(q.vatAmt || 0), total: round2(q.grand || 0),
            wht: round2(q.whtAmt || 0), net: round2((q.grand || 0) - (q.whtAmt || 0)),
            cost: cost != null && !isNaN(cost) ? round2(cost) : null,
            profit: cost != null && !isNaN(cost) ? round2((q.afterDisc || 0) - cost) : null,
          };
        })
        .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.no || "").localeCompare(a.no || ""));
    }
    // ใบเสร็จรับเงินแล้ว — กติกาเดียวกับการ์ด: สถานะชำระแล้ว ตามวันที่รับเงิน · แยก VAT ตามใบเสนอที่ผูก (ใบเก่าดู vat_amt)
    const quoteVat = Object.fromEntries((quotes || []).map((q) => [q.quote_no, !!q.vat]));
    return (receipts || [])
      .filter((r) => r.status === "paid" && inRange(r.issue_date, from, to))
      .map((r) => {
        const total = Number(r.total) || 0;
        const base = Number(r.base) || (total - (Number(r.vat_amt) || 0));
        // ใบเสนอที่ผูกอยู่อาจอยู่นอกช่วงที่แดชบอร์ดโหลดมา → หาไม่เจอต้องถอยไปดูยอด VAT ในใบเสร็จเอง
        // ไม่ใช่ตีเป็น "ไม่ VAT" (ไฟล์ Export ที่เอาไปกระทบยอดกับบัญชีจริงจะผิดตาม)
        const isVat = r.quote_no && quoteVat[r.quote_no] !== undefined ? !!quoteVat[r.quote_no] : (Number(r.vat_amt) || 0) > 0;
        return {
          type: "receipt", no: r.receipt_no, date: (r.issue_date || "").slice(0, 10),
          name: r.customerName || "-", title: r.title || "", isVat,
          base: round2(base), vat: round2(Number(r.vat_amt) || 0), total: round2(total),
          wht: round2(Number(r.wht_amt) || 0), net: round2(Number(r.net) || (total - (Number(r.wht_amt) || 0))),
          quote_no: r.quote_no || "", invoice_no: r.invoice_no || "",
        };
      })
      .filter((r) => M.vat === undefined || r.isVat === M.vat)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.no || "").localeCompare(a.no || ""));
  }, [kind, quotes, receipts, boqs, from, to]);

  const sum = (k) => round2(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));
  const isEst = M.src === "est";
  const big = isEst ? sum("profit") : sum("base");

  function exportCsv() {
    const range = `${from || "ทั้งหมด"}_ถึง_${to || new Date().toISOString().slice(0, 10)}`;
    if (isEst) {
      downloadCsv(`กำไรประมาณการBOQ-${range}`,
        ["เลขที่ใบเสนอ", "วันที่อนุมัติ", "ลูกค้า", "งาน", "ยอดขายก่อน VAT", "ต้นทุน BOQ", "กำไรประมาณการ", "กำไร %"],
        rows.map((r) => [r.no, r.date, r.name, r.title, r.base, r.cost, r.profit, r.base ? round2(r.profit / r.base * 100) : 0]));
    } else if (M.src === "quote") {
      downloadCsv(`ยอดขายอนุมัติ${M.vat === true ? "-VAT" : M.vat === false ? "-ไม่VAT" : ""}-${range}`,
        ["เลขที่ใบเสนอ", "วันที่อนุมัติ", "ลูกค้า", "งาน", "ประเภท", "ก่อน VAT", "VAT", "รวมทั้งสิ้น", "หัก ณ ที่จ่าย", "สุทธิ"],
        rows.map((r) => [r.no, r.date, r.name, r.title, r.isVat ? "VAT" : "ไม่ VAT", r.base, r.vat, r.total, r.wht, r.net]));
    } else {
      downloadCsv(`รับเงินแล้ว-ใบเสร็จ${M.vat === true ? "-VAT" : M.vat === false ? "-ไม่VAT" : ""}-${range}`,
        ["เลขที่ใบเสร็จ", "วันที่รับเงิน", "ลูกค้า", "งาน", "ประเภท", "ก่อน VAT", "VAT", "รวมทั้งสิ้น", "หัก ณ ที่จ่าย", "รับสุทธิ", "ใบเสนอ", "ใบแจ้งหนี้"],
        rows.map((r) => [r.no, r.date, r.name, r.title, r.isVat ? "VAT" : "ไม่ VAT", r.base, r.vat, r.total, r.wht, r.net, r.quote_no, r.invoice_no]));
    }
  }

  const openRow = (r) => onOpenDoc && onOpenDoc(r.type === "receipt" ? "receipt" : "quote", r.no);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} style={{ "--mc": M.color }}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <span className="drawer-ico" style={{ background: `color-mix(in srgb, ${M.color} 14%, white)`, color: M.color }}>
              <UIcon name={M.icon} size={22} strokeWidth={1.9} />
            </span>
            <div>
              <div className="drawer-title">{M.th}</div>
              <div className="drawer-en">{M.en} · {periodLabel}</div>
            </div>
            <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <div className="drawer-big" style={{ color: M.color }}>{fmtBaht(big)}</div>
          <div className="drawer-mini">
            <span><b>{fmtNum(rows.length)}</b> ใบ</span>
            {!isEst && <><span className="sep">·</span><span>ก่อน VAT · รวมทั้งสิ้น <b>{fmtCompact(sum("total"))}</b></span></>}
            {M.src === "receipt" && <><span className="sep">·</span><span>รับสุทธิ <b>{fmtCompact(sum("net"))}</b></span></>}
            {isEst && <><span className="sep">·</span><span>ขาย {fmtCompact(sum("base"))} − ทุน {fmtCompact(sum("cost"))}</span></>}
            <button className="btn-ghost sm" style={{ marginLeft: "auto" }} onClick={exportCsv}>⬇ Export CSV</button>
          </div>
        </div>

        <div className="drawer-body">
          {rows.length === 0 && <div className="empty sm">ไม่มีเอกสารในช่วงนี้</div>}
          {rows.map((r) => (
            <div className="ddoc-row" key={r.no} onClick={() => openRow(r)} role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openRow(r)}>
              <div className="ddoc-mid">
                <div className="ddoc-name"><b>{r.no}</b> · {r.name}</div>
                <div className="ddoc-sub">
                  {fmtDocDate(r.date)}{r.title ? ` · ${r.title}` : ""}
                  {M.vat === undefined && !isEst && <span className={"ddoc-tag" + (r.isVat ? " vat" : "")}> {r.isVat ? "VAT" : "ไม่ VAT"}</span>}
                </div>
              </div>
              <div className="ddoc-amt">
                <div className="ddoc-val" style={isEst && r.profit < 0 ? { color: "#dc2626" } : {}}>{fmtBaht(isEst ? r.profit : r.base)}</div>
                <div className="ddoc-sm">
                  {isEst ? `ขาย ${fmtCompact(r.base)} − ทุน ${fmtCompact(r.cost)}`
                    : M.src === "receipt" ? `รวม ${fmtCompact(r.total)} · สุทธิ ${fmtCompact(r.net)}`
                    : r.vat ? `+VAT ${fmtCompact(r.vat)} = ${fmtCompact(r.total)}` : `รวม ${fmtCompact(r.total)}`}
                </div>
              </div>
              <UIcon name="chevR" size={15} strokeWidth={2.2} color="var(--ink-3)" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
