import React from "react";

// "เชื่อมโยง" row: clickable chips for every related document in the chain (both directions).
// Pass the doc numbers you want to show; `self` ({type,no}) is excluded. onOpen(type, no) handles navigation.
const LABEL = { boq: (n) => "BOQ " + n, quote: (n) => n, job: (n) => "งาน " + n, invoice: (n) => "บิล " + n, receipt: (n) => "ใบเสร็จ " + n, po: (n) => "สั่งซื้อ " + n };

export default function DocChips({ boqNo, quoteNo, jobNos = [], invoiceNos = [], receiptNos = [], poNos = [], self, onOpen }) {
  const items = [];
  if (boqNo) items.push(["boq", boqNo]);
  if (quoteNo) items.push(["quote", quoteNo]);
  jobNos.forEach((n) => items.push(["job", n]));
  invoiceNos.forEach((n) => items.push(["invoice", n]));
  receiptNos.forEach((n) => items.push(["receipt", n]));
  poNos.forEach((n) => items.push(["po", n]));
  const shown = items.filter(([t, n]) => n && !(self && self.type === t && self.no === n));
  if (!shown.length) return null;
  return (
    <div className="doc-links">
      <span className="doc-links-l">🔗 เชื่อมโยง</span>
      {shown.map(([t, n], i) => (
        <button key={t + n + i} className={"doclink dl-" + t} onClick={(e) => { e.stopPropagation(); onOpen && onOpen(t, n); }}>{LABEL[t](n)}</button>
      ))}
    </div>
  );
}
