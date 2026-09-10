import React from "react";
import { UIcon } from "../icons";
import { can } from "../lib/permissions";

// A1 — ยุบทางเข้า "คูปอง + รีวิวลูกค้า + จัดการเว็บไซต์" เป็นเมนูเดียว "การตลาดและเว็บไซต์"
// เป็นแค่หน้าเปลือกสลับแท็บ — เอกสาร/ข้อมูล/หน้าเดิมทุกอย่างคงเดิม + คุมสิทธิ์ "รายแท็บ" ด้วย can()
// (แต่ละแท็บโชว์เฉพาะบทบาทที่มีสิทธิ์ในโมดูลนั้น เช่น กราฟิกเห็นรีวิว/เว็บ แต่ไม่เห็นคูปอง)
const Coupons = React.lazy(() => import("./Coupons"));
const Reviews = React.lazy(() => import("./Reviews"));
const WebManage = React.lazy(() => import("./WebManage"));

const TABS = [
  { key: "promo", icon: "ticket", label: "คูปอง / โปรโมชั่น" },
  { key: "reviews", icon: "star", label: "รีวิวลูกค้า" },
  { key: "website", icon: "globe", label: "จัดการเว็บไซต์" },
];

export default function MarketingHub({ role, initial }) {
  const tabs = TABS.filter((t) => can(role, t.key));
  const [tab, setTab] = React.useState(() =>
    initial && tabs.some((t) => t.key === initial) ? initial : tabs[0]?.key || "promo"
  );
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  if (!cur) return <div className="empty">ไม่มีสิทธิ์เข้าถึงเมนูนี้</div>;
  return (
    <div>
      <div className="view-seg hub-tabs" style={{ marginBottom: 14, maxWidth: 560, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.key} className={"seg-btn hub-tab" + (cur.key === t.key ? " on" : "")} aria-pressed={cur.key === t.key} onClick={() => setTab(t.key)}>
            <UIcon name={t.icon} size={18} /> {t.label}
          </button>
        ))}
      </div>
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
        {cur.key === "promo" && <Coupons />}
        {cur.key === "reviews" && <Reviews role={role} />}
        {cur.key === "website" && <WebManage role={role} />}
      </React.Suspense>
    </div>
  );
}
