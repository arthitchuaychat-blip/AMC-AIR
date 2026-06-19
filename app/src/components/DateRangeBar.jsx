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

// shared date-range filter with a quick "วันนี้" button — used on every document list
export default function DateRangeBar({ value, onChange }) {
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
      {(v.from || v.to) && <button className="btn-ghost sm" onClick={() => onChange({ from: "", to: "" })}>ล้าง</button>}
    </div>
  );
}
