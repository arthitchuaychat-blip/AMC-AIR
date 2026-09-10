import React from "react";
import { UIcon } from "../icons";
import { can } from "../lib/permissions";

// A4 — ลูกค้าและงานขาย: ยุบทางเข้า ลูกค้า + ท่อขาย + ติดตามลูกค้า เป็นเมนูเดียว
// หน้าเปลือกสลับแท็บ — เอกสาร/ข้อมูล/สถานะเดิมคงเดิมทุกอย่าง · คุมสิทธิ์รายแท็บด้วย can()
// ท่อขาย/ติดตาม กด "เปิดลูกค้า" → สลับไปแท็บลูกค้าภายใน (ไม่เด้งออกเมนู)
// หมายเหตุ: การรวม "สถานะลูกค้า" ให้เป็นชุดเดียว (D1) เป็นงานแยก แตะข้อมูล — ยังไม่ทำในนี้
const Customers = React.lazy(() => import("./Customers"));
const Pipeline = React.lazy(() => import("./Pipeline"));
const CustomerFollowup = React.lazy(() => import("./CustomerFollowup"));

const TABS = [
  { key: "customers", icon: "users", label: "ลูกค้า" },
  { key: "pipeline", icon: "target", label: "ท่อขาย" },
  { key: "followup", icon: "phone", label: "ติดตามลูกค้า" },
];

export default function SalesHub({ role, me, custFocus, onCustFocusConsumed, onOpenDoc, onGoChat, onOpenQuote, onCreateJob }) {
  const tabs = TABS.filter((t) => can(role, t.key));
  const [tab, setTab] = React.useState(() => (custFocus ? "customers" : tabs[0]?.key || "customers"));
  const [focus, setFocus] = React.useState(custFocus || null);
  React.useEffect(() => { if (custFocus) { setFocus(custFocus); setTab("customers"); } }, [custFocus]);
  const openCustomer = (id) => { setFocus(String(id)); setTab("customers"); };
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  if (!cur) return <div className="empty">ไม่มีสิทธิ์เข้าถึงเมนูนี้</div>;
  return (
    <div>
      {tabs.length > 1 && (
        <div className="view-seg hub-tabs" style={{ marginBottom: 14, maxWidth: 520, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.key} className={"seg-btn hub-tab" + (cur.key === t.key ? " on" : "")} aria-pressed={cur.key === t.key} onClick={() => setTab(t.key)}>
              <UIcon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </div>
      )}
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
        {cur.key === "customers" && <Customers role={role} focus={focus} onFocusConsumed={() => { setFocus(null); onCustFocusConsumed && onCustFocusConsumed(); }} onOpenDoc={onOpenDoc} />}
        {cur.key === "pipeline" && <Pipeline role={role} me={me} onOpenCustomer={openCustomer} />}
        {cur.key === "followup" && <CustomerFollowup role={role} onGoChat={onGoChat} onOpenCustomer={openCustomer} onOpenQuote={onOpenQuote} onCreateJob={onCreateJob} />}
      </React.Suspense>
    </div>
  );
}
