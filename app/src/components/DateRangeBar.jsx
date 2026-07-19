import React from "react";
import { UIcon } from "../icons";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayStr = () => ymd(new Date());
// keep rows whose date (YYYY-MM-DD prefix) falls within the range; empty range = keep all
export function inDateRange(s, r) {
  if (!r || (!r.from && !r.to)) return true;
  const d = (s || "").slice(0, 10);
  if (!d) return false;
  if (r.from && d < r.from) return false;
  if (r.to && d > r.to) return false;
  return true;
}

// ย้อนหลัง n เดือนถึงวันนี้ (ปลายเปิด — ใบที่ลงวันที่ล่วงหน้ายังเห็น)
export const lastMonths = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return { from: ymd(d), to: "" }; };
// ค่าเริ่มต้นของหน้ารายการเอกสารทุกหน้า — เจ้าของเคาะ 2026-07-19 ให้เปิดมาเห็น 6 เดือนล่าสุด
// เอกสารเก่ากว่านั้นไม่ได้หาย แค่ไม่แสดง กดปุ่ม "ดูทั้งหมด" บนแถบตัวกรองได้ตลอด
// ⚠️ หน้าที่ใช้ค่านี้ ต้องล้างช่วงวันที่ทิ้งเมื่อถูกสั่งให้เปิดเอกสารเจาะจง (prop focus)
//    ไม่งั้นกดลิงก์ไปใบเก่ากว่า 6 เดือนแล้วจะขึ้นว่าไม่พบ ทั้งที่ใบยังอยู่
export const defaultDocRange = () => lastMonths(6);

// shared date-range filter with a quick "วันนี้" button — used on every document list
// hidden = จำนวนใบที่ตกนอกช่วง (ให้บอกผู้ใช้ตรง ๆ ว่ากำลังซ่อนอะไรอยู่ ห้ามซ่อนเงียบ ๆ)
export default function DateRangeBar({ value, onChange, hidden = 0 }) {
  const v = value || { from: "", to: "" };
  const set = (k, val) => onChange({ ...v, [k]: val });
  const t = todayStr();
  return (
    <div className="jo-datefilter">
      <UIcon name="calendar" size={15} color="var(--ink-3)" />
      <input className="inp" type="date" value={v.from} onChange={(e) => set("from", e.target.value)} />
      <span className="jo-date-dash">–</span>
      <input className="inp" type="date" value={v.to} onChange={(e) => set("to", e.target.value)} />
      <button className="btn-ghost sm" onClick={() => onChange({ from: t, to: t })}>วันนี้</button>
      <button className="btn-ghost sm" onClick={() => onChange(lastMonths(6))}>6 เดือน</button>
      {(v.from || v.to) && <button className="btn-ghost sm" onClick={() => onChange({ from: "", to: "" })}>ล้าง</button>}
      {hidden > 0 && (
        <span className="dr-hidden" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)" }}>
          ซ่อนอยู่ {hidden} ใบ (นอกช่วงวันที่)
          <button className="btn-ghost sm" onClick={() => onChange({ from: "", to: "" })}>ดูทั้งหมด</button>
        </span>
      )}
    </div>
  );
}
