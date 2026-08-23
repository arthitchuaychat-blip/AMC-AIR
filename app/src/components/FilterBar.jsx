import React from "react";

// แถบตัวกรองยุบได้ — ครอบชิป/ดรอปดาวน์ตัวกรองของแต่ละเมนู เพื่อประหยัดพื้นที่ด้านบน (เห็นการ์ดมากขึ้น)
// ยุบไว้เป็นค่าเริ่มต้น · จำสถานะเปิด/ปิดต่อเมนูใน localStorage (key = id) · โชว์ตัวเลขตัวกรองที่ใช้อยู่
// ใช้: <FilterBar id="joborders" count={activeCount}>...แถว .cat-filter เดิม...</FilterBar>
// resultCount = จำนวนผลลัพธ์รวมหลังกรองทุกตัวพร้อมกัน (แสดงตลอดแม้ยุบ) · resultLabel = หน่วย (เช่น "ใบ", "รายการ")
export default function FilterBar({ id, count = 0, resultCount, resultLabel = "รายการ", children, defaultOpen = false }) {
  const key = "amc_filt_" + (id || "x");
  const [open, setOpen] = React.useState(() => {
    try { const v = localStorage.getItem(key); return v == null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  React.useEffect(() => { try { localStorage.setItem(key, open ? "1" : "0"); } catch { /* ignore */ } }, [open, key]);
  return (
    <div className="filterbar">
      <div className="filterbar-head">
        <button type="button" className={"filterbar-toggle" + (open ? " open" : "") + (count > 0 ? " active" : "")} onClick={() => setOpen((o) => !o)}>
          <span className="fb-ic">⚙️</span> ตัวกรอง
          {count > 0 && <span className="filterbar-badge">{count}</span>}
          <span className="fb-chev">{open ? "▲" : "▼"}</span>
        </button>
        {typeof resultCount === "number" && (
          <span className={"filterbar-result" + (count > 0 ? " filtered" : "")}>
            {count > 0 ? "🔎 กรองได้ " : "แสดง "}<b>{resultCount.toLocaleString("en-US")}</b> {resultLabel}
          </span>
        )}
      </div>
      {open && <div className="filterbar-body">{children}</div>}
    </div>
  );
}
