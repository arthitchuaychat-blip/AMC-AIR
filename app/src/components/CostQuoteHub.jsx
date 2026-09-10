import React from "react";
import { can } from "../lib/permissions";

// A7 — ต้นทุนและเสนอราคา: ยุบทางเข้า BOQ (ต้นทุน) + ใบเสนอราคา เป็นเมนูเดียว 2 แท็บ
// ⚠️ hub นี้ถูก render ทั้ง view "boq" และ "quote" (initialTab บอกว่าเปิดแท็บไหน)
// → deep-link ทั้ง go("boq") และ go("quote") ลงแท็บถูกต้องเอง ไม่ต้อง redirect
// BOQ กับใบเสนอยังเป็นเอกสารคนละชนิด (ต้นทุน vs ราคาส่งลูกค้า) — แค่รวมทางเข้า · คุมสิทธิ์รายแท็บ
const BOQ = React.lazy(() => import("./BOQ"));
const Quotation = React.lazy(() => import("./Quotation"));

const TABS = [
  { key: "boq", emoji: "📐", label: "ต้นทุน (BOQ)" },
  { key: "quote", emoji: "📝", label: "ใบเสนอราคา" },
];

export default function CostQuoteHub({ initialTab, role,
  boqFocus, onBoqFocusConsumed, boqNewCust, onBoqNewConsumed, boqDraft, onBoqDraftConsumed,
  quoteFocus, onQuoteFocusConsumed, quoteFromBoq, onQuoteFromBoqConsumed,
  onCreateInvoice, onCreateJob, onCreatePo, onOpenJob, onOpenDoc, onGoChat }) {
  const tabs = TABS.filter((t) => can(role, t.key));
  const [tab, setTab] = React.useState(initialTab && tabs.some((t) => t.key === initialTab) ? initialTab : tabs[0]?.key || "quote");
  const [bFocus, setBFocus] = React.useState(boqFocus || null);
  const [qFocus, setQFocus] = React.useState(quoteFocus || null);
  const [qFromBoq, setQFromBoq] = React.useState(quoteFromBoq || null);
  React.useEffect(() => { if (boqFocus) { setBFocus(boqFocus); setTab("boq"); } }, [boqFocus]);
  React.useEffect(() => { if (boqNewCust || boqDraft) setTab("boq"); }, [boqNewCust, boqDraft]);
  React.useEffect(() => { if (quoteFocus) { setQFocus(quoteFocus); setTab("quote"); } }, [quoteFocus]);
  React.useEffect(() => { if (quoteFromBoq) { setQFromBoq(quoteFromBoq); setTab("quote"); } }, [quoteFromBoq]);
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  if (!cur) return <div className="empty">ไม่มีสิทธิ์เข้าถึงเมนูนี้</div>;
  return (
    <div>
      {tabs.length > 1 && (
        <div className="view-seg" style={{ marginBottom: 14, maxWidth: 420, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.key} className={"seg-btn" + (cur.key === t.key ? " on" : "")} onClick={() => setTab(t.key)}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      )}
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
        {cur.key === "boq" && <BOQ role={role} focus={bFocus} onFocusConsumed={() => { setBFocus(null); onBoqFocusConsumed && onBoqFocusConsumed(); }}
          onCreateQuote={(boqNo) => { setQFromBoq(boqNo); setTab("quote"); }}
          newForCustomer={boqNewCust} onNewConsumed={onBoqNewConsumed}
          draft={boqDraft} onDraftConsumed={onBoqDraftConsumed}
          onOpenQuote={(qn) => { setQFocus(qn); setTab("quote"); }} onOpenDoc={onOpenDoc} onGoChat={onGoChat} />}
        {cur.key === "quote" && <Quotation role={role} focus={qFocus} onFocusConsumed={() => { setQFocus(null); onQuoteFocusConsumed && onQuoteFocusConsumed(); }}
          fromBoq={qFromBoq} onFromBoqConsumed={() => { setQFromBoq(null); onQuoteFromBoqConsumed && onQuoteFromBoqConsumed(); }}
          onCreateInvoice={onCreateInvoice} onCreateJob={onCreateJob} onCreatePo={onCreatePo}
          onOpenBoq={(bn) => { setBFocus(bn); setTab("boq"); }} onOpenJob={onOpenJob} onOpenDoc={onOpenDoc} onGoChat={onGoChat} />}
      </React.Suspense>
    </div>
  );
}
