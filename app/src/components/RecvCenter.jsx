import React from "react";
import { UIcon } from "../icons";
import { can } from "../lib/permissions";

// A3 — ศูนย์รับเงิน: ยุบทางเข้า เงินค้างรับ + ใบวางบิล + ใบเสร็จ/ใบกำกับ เป็นเมนูเดียว
// หน้าเปลือกสลับแท็บ — เอกสาร/ข้อมูล/สถานะเดิมคงเดิมทุกอย่าง · คุมสิทธิ์รายแท็บด้วย can()
// วางบิล/ค้างรับ กด "ออกใบเสร็จ" → สลับไปแท็บใบเสร็จภายใน (ไม่เด้งออกเมนู)
const Receivables = React.lazy(() => import("./Receivables"));
const BillingNotes = React.lazy(() => import("./BillingNotes"));
const Receipts = React.lazy(() => import("./Receipts"));

const TABS = [
  { key: "receivables", icon: "ret", label: "เงินค้างรับ" },
  { key: "billing", icon: "document", label: "ใบวางบิล" },
  { key: "receipt", icon: "receipt", label: "ใบเสร็จ/ใบกำกับ" },
];

export default function RecvCenter({ role, onOpenInvoice, onOpenDoc, onGoChat, onOpenQuote, onOpenBoq, onOpenJob, receiptFocus, onReceiptFocusConsumed, receiptFromInvoice, onReceiptFromInvoiceConsumed }) {
  const tabs = TABS.filter((t) => can(role, t.key));
  const [tab, setTab] = React.useState(() => (receiptFocus || receiptFromInvoice ? "receipt" : tabs[0]?.key || "receivables"));
  const [fromInv, setFromInv] = React.useState(receiptFromInvoice || null);
  const [focus, setFocus] = React.useState(receiptFocus || null);
  React.useEffect(() => { if (receiptFromInvoice) { setFromInv(receiptFromInvoice); setTab("receipt"); } }, [receiptFromInvoice]);
  React.useEffect(() => { if (receiptFocus) { setFocus(receiptFocus); setTab("receipt"); } }, [receiptFocus]);
  const goReceipt = (invNo) => { setFromInv(invNo || null); setTab("receipt"); };
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  if (!cur) return <div className="empty">ไม่มีสิทธิ์เข้าถึงเมนูนี้</div>;
  return (
    <div>
      {tabs.length > 1 && (
        <div className="view-seg hub-tabs" style={{ marginBottom: 14, maxWidth: 540, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.key} className={"seg-btn hub-tab" + (cur.key === t.key ? " on" : "")} aria-pressed={cur.key === t.key} onClick={() => setTab(t.key)}>
              <UIcon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </div>
      )}
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
        {cur.key === "receivables" && <Receivables role={role} onOpenInvoice={onOpenInvoice} onGoChat={onGoChat} />}
        {cur.key === "billing" && <BillingNotes role={role} onOpenDoc={onOpenDoc} onGoChat={onGoChat} onCreateReceipt={goReceipt} />}
        {cur.key === "receipt" && <Receipts role={role} focus={focus} onFocusConsumed={() => { setFocus(null); onReceiptFocusConsumed && onReceiptFocusConsumed(); }}
          fromInvoice={fromInv} onFromInvoiceConsumed={() => { setFromInv(null); onReceiptFromInvoiceConsumed && onReceiptFromInvoiceConsumed(); }}
          onOpenQuote={onOpenQuote} onOpenBoq={onOpenBoq} onOpenJob={onOpenJob} onOpenDoc={onOpenDoc} onGoChat={onGoChat} />}
      </React.Suspense>
    </div>
  );
}
