import React from "react";
import { fmtBaht, fmtDocDate } from "../lib/format";

// หัวการ์ดเอกสารขายมาตรฐาน — ทุกเมนู (BOQ/ใบเสนอราคา/ใบแจ้งหนี้/ใบวางบิล/ใบเสร็จ) หน้าตาเดียวกัน:
//   ช่อง 1 เลขที่+สถานะ · ช่อง 2 ชื่องาน · ช่อง 3 แถบข้อมูลลูกค้า · ช่อง 4 ผู้สร้าง+วันที่+ยอด
// ใช้คู่กับคลาส .doc2 บนการ์ด: <div className="card job-card doc2"><DocCardHead …/>…chips/actions…</div>
// partyIcon: ไอคอนแถบคู่ค้า (ค่าเริ่ม 🏢 ลูกค้า · ใช้ 🏭 ผู้ขาย สำหรับใบสั่งซื้อ ฯลฯ) · titleFallback: ข้อความชื่องานเมื่อว่าง
export default function DocCardHead({ no, badges, title, sub, by, date, amountLabel, amount, amountNode, customer, onClick, partyIcon = "🏢", titleFallback = "— ไม่ระบุชื่องาน —" }) {
  const c = customer || {};
  const addr = c.siteAddress || c.addr;
  const showContact = c.contactName && c.contactName !== c.name;
  return (<>
    <div className={"dch" + (onClick ? " dch-click" : "")} onClick={onClick} role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick(e) : undefined}>
      <div className="dch-id">
        <span className="dch-no">{no}</span>
        {badges ? <div className="dch-badges">{badges}</div> : null}
      </div>
      <div className="dch-mid">
        <div className={"dch-title" + (title ? "" : " none")}>{title || titleFallback}</div>
        {sub ? <div className="dch-sub">{sub}</div> : null}
      </div>
      <div className="dch-right">
        {by ? <span className="dch-by">👤 {by}</span> : null}
        {date ? <span className="dch-date">📅 {fmtDocDate(date)}</span> : null}
        {amountNode || <div className="dch-amt"><span>{amountLabel}</span><b>{fmtBaht(amount)}</b></div>}
      </div>
    </div>
    {(c.name || addr) && (
      <div className="dch-cust">
        <div className="dch-cust-row">
          <span className="dch-ic">{partyIcon}</span><b>{c.name || "ไม่ระบุลูกค้า"}</b>
          {c.code ? <span className="dch-code">{c.code}</span> : null}
          {showContact ? <span className="dch-dim">👤 {c.contactName}</span> : null}
          {c.phone ? <a className="ref-link" href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}>📞 {c.phone}</a> : null}
        </div>
        {addr && (
          <div className="dch-cust-row">
            <span className="dch-ic">📍</span><span className="dch-addr">{addr}</span>
            {c.mapUrl ? <a className="btn-ghost sm" href={c.mapUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>แผนที่</a> : null}
          </div>
        )}
      </div>
    )}
  </>);
}
