import React from "react";
import { can } from "../lib/permissions";

// A5 — จัดซื้อและเตรียมงาน: ยุบทางเข้า ใบสั่งซื้อ + เตรียมวัสดุ เป็นเมนูเดียว
// ⚠️ host คือหน้า "po" เดิม → deep-link ทั้งหมดที่ go("po") ยังลงแท็บใบสั่งซื้อปกติ
// เอกสาร/ข้อมูล/สถานะเดิมคงเดิมทุกอย่าง · คุมสิทธิ์รายแท็บด้วย can()
// เตรียมวัสดุ กด "สร้าง PO" → สลับไปแท็บใบสั่งซื้อภายใน (ไม่เด้งออก) · รับของ/เบิก → ไปหน้าเคลื่อนไหวสินค้า
const PurchaseOrders = React.lazy(() => import("./PurchaseOrders"));
const MaterialPrep = React.lazy(() => import("./MaterialPrep"));

const TABS = [
  { key: "po", emoji: "🛍️", label: "ใบสั่งซื้อ" },
  { key: "prep", emoji: "📥", label: "เตรียมวัสดุ" },
];

export default function BuyHub({ role, poPrefill, onPoPrefillConsumed, poFocus, onPoFocusConsumed,
  prepPrefill, onPrepPrefillConsumed, onOpenQuote, onOpenJob, onGoExpenses, onReceive, onWithdraw }) {
  const tabs = TABS.filter((t) => can(role, t.key));
  const [tab, setTab] = React.useState(prepPrefill ? "prep" : tabs[0]?.key || "po");
  const [poPre, setPoPre] = React.useState(poPrefill || null);
  React.useEffect(() => { if (poPrefill) { setPoPre(poPrefill); setTab("po"); } }, [poPrefill]);
  React.useEffect(() => { if (poFocus) setTab("po"); }, [poFocus]);
  React.useEffect(() => { if (prepPrefill) setTab("prep"); }, [prepPrefill]);
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
        {cur.key === "po" && <PurchaseOrders role={role} prefill={poPre} onPrefillConsumed={() => { setPoPre(null); onPoPrefillConsumed && onPoPrefillConsumed(); }}
          focus={poFocus} onFocusConsumed={onPoFocusConsumed}
          onOpenQuote={onOpenQuote} onOpenJob={onOpenJob} onGoExpenses={onGoExpenses} onReceive={onReceive} />}
        {cur.key === "prep" && <MaterialPrep role={role} prefill={prepPrefill} onPrefillConsumed={onPrepPrefillConsumed}
          onCreatePo={(items, quoteNo, prepNo) => { setPoPre({ quoteNo: quoteNo || null, prepNo: prepNo || null, items }); setTab("po"); }}
          onWithdraw={onWithdraw} onOpenQuote={onOpenQuote} onOpenJob={onOpenJob} />}
      </React.Suspense>
    </div>
  );
}
