import React from "react";
import { UIcon } from "../icons";
import { can } from "../lib/permissions";

// A2 — ศูนย์จ่ายเงิน: ยุบทางเข้า เบิกจ่าย + ค้างจ่าย + หนี้สิน + รายจ่ายประจำ เป็นเมนูเดียว
// เป็นหน้าเปลือกสลับแท็บ — เอกสาร/ข้อมูล/สถานะเดิมคงเดิมทุกอย่าง · คุมสิทธิ์รายแท็บด้วย can()
// การข้ามไป "เบิกจ่าย" จากค้างจ่าย/หนี้สิน/รายจ่ายประจำ จะสลับแท็บภายใน (ไม่เด้งออกเมนู)
const Expenses = React.lazy(() => import("./Expenses"));
const Payables = React.lazy(() => import("./Payables"));
const Loans = React.lazy(() => import("./Loans"));
const Recurring = React.lazy(() => import("./RecurringBills"));

const TABS = [
  { key: "expenses", icon: "wallet", label: "เบิกจ่าย" },
  { key: "payables", icon: "withdraw", label: "ค้างจ่าย" },
  { key: "loans", icon: "building", label: "หนี้สิน" },
  { key: "recurring", icon: "repeat", label: "รายจ่ายประจำ" },
];

export default function PayCenter({ role, me, onOpenDoc, expenseFocus, onExpenseFocusConsumed, onRegisterAsset, onOpenPo, onGoSub, onGoCashflow }) {
  const tabs = TABS.filter((t) => can(role, t.key));
  const [tab, setTab] = React.useState(() => (expenseFocus ? "expenses" : tabs[0]?.key || "expenses"));
  const [focus, setFocus] = React.useState(expenseFocus || null);
  // App ส่ง expenseFocus ใหม่เข้ามา (deep-link จาก PO/บัญชี ขณะหน้านี้เปิดอยู่) → กระโดดไปแท็บเบิกจ่าย
  React.useEffect(() => { if (expenseFocus) { setFocus(expenseFocus); setTab("expenses"); } }, [expenseFocus]);
  const goExpenses = (ref) => { setFocus(ref || null); setTab("expenses"); };
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  if (!cur) return <div className="empty">ไม่มีสิทธิ์เข้าถึงเมนูนี้</div>;
  return (
    <div>
      {tabs.length > 1 && (
        <div className="view-seg hub-tabs" style={{ marginBottom: 14, maxWidth: 640, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.key} className={"seg-btn hub-tab" + (cur.key === t.key ? " on" : "")} aria-pressed={cur.key === t.key} onClick={() => setTab(t.key)}>
              <UIcon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </div>
      )}
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
        {cur.key === "expenses" && <Expenses role={role} me={me} onOpenDoc={onOpenDoc}
          focus={focus} onFocusConsumed={() => { setFocus(null); onExpenseFocusConsumed && onExpenseFocusConsumed(); }}
          onRegisterAsset={onRegisterAsset} />}
        {cur.key === "payables" && <Payables role={role} onOpenPo={onOpenPo} onGoExpenses={goExpenses} onGoSub={onGoSub} />}
        {cur.key === "loans" && <Loans role={role} onGoExpenses={() => goExpenses(null)} onGoCashflow={onGoCashflow} />}
        {cur.key === "recurring" && <Recurring role={role} onGoExpenses={() => goExpenses(null)} onGoCashflow={onGoCashflow} />}
      </React.Suspense>
    </div>
  );
}
