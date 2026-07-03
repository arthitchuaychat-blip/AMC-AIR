import React from "react";

// สินค้า 2 หน่วย (เช่น ขายเป็นเมตร ซื้อเป็นม้วน · 1 ม้วน = purchaseQty เมตร)
// unitFactor(m, "ม้วน") = 15 · unitFactor(m, "เมตร") = 1 — ใช้แปลงเข้าหน่วยหลัก (สต๊อกเป็นหน่วยหลักเสมอ)
export const isDualUnit = (m) => !!(m?.purchaseUnit && Number(m.purchaseQty) > 1 && m.purchaseUnit !== m.unit);
export const unitFactor = (m, unit) => (m?.purchaseUnit && unit === m.purchaseUnit && Number(m.purchaseQty) > 1) ? Number(m.purchaseQty) : 1;

// dropdown เลือกหน่วยนับ (แทน unit-suf เดิม) — สินค้าหน่วยเดียวแสดงเป็นข้อความเฉย ๆ
export default function UnitPick({ m, value, onChange }) {
  const u = value || m?.unit || "";
  if (!isDualUnit(m)) return <span className="unit-suf">{u}</span>;
  return (
    <select className="unit-suf unit-pick" value={u} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(e.target.value)} title="เลือกหน่วยนับ">
      <option value={m.unit}>{m.unit}</option>
      <option value={m.purchaseUnit}>{m.purchaseUnit}</option>
    </select>
  );
}
