import React from "react";
import { fmtBaht, fmtNum, downloadCsv } from "../lib/format";
import { UIcon } from "../icons";

// แผงรายการสินค้า/บริการที่ขายในหมวดรายได้หนึ่ง — กดหมวดในการ์ด "รายได้แยกหมวด" แล้วเห็นว่าหมวดนี้ขายอะไรบ้าง
// รวมยอดต่อสินค้า (จำนวนรวม · จำนวนครั้งที่ขาย · ยอดขายรวม) เรียงยอดมาก→น้อย
export default function RevItemsDrawer({ label, color, items, total, periodLabel, onClose }) {
  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const list = items || [];
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} style={{ "--mc": color }}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <span className="drawer-ico" style={{ background: `color-mix(in srgb, ${color} 14%, white)`, color }}><UIcon name="trend" size={20} /></span>
            <div>
              <div className="drawer-title">{label}</div>
              <div className="drawer-en">รายการที่ขายในหมวดนี้ · {periodLabel}</div>
            </div>
            <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <div className="drawer-big" style={{ color }}>{fmtBaht(total)}</div>
          <div className="drawer-mini">
            <span><b>{fmtNum(list.length)}</b> รายการ · ยอดก่อน VAT</span>
            <button className="btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!list.length}
              onClick={() => downloadCsv(`รายได้-${label}`, ["รหัส", "ชื่อ", "จำนวนรวม", "หน่วย", "จำนวนครั้ง", "ยอดขาย"],
                list.map((it) => [it.code, it.name, it.qty, it.unit || "", it.count, Math.round(it.amount * 100) / 100]))}>⬇ Export CSV</button>
          </div>
        </div>
        <div className="drawer-body">
          {!list.length && <div className="empty sm">ไม่มีรายการในหมวดนี้ช่วงนี้</div>}
          {list.map((it, i) => (
            <div className="ddoc-row" key={it.code || it.name || i} style={{ cursor: "default" }}>
              <div className="ddoc-mid">
                <div className="ddoc-name">{it.name}{it.code ? <span style={{ color: "var(--ink-3)", fontWeight: 400 }}> · {it.code}</span> : null}</div>
                <div className="ddoc-sub">ขาย {fmtNum(it.qty)} {it.unit || "หน่วย"} · {fmtNum(it.count)} ครั้ง</div>
              </div>
              <div className="ddoc-amt">
                <div className="ddoc-val">{fmtBaht(it.amount)}</div>
                <div className="ddoc-sm">{total > 0 ? (it.amount / total * 100).toFixed(0) + "%" : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
