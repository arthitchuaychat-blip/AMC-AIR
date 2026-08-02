import React from "react";

// แถบตัวกรองยุบได้ — ครอบชิป/ดรอปดาวน์ตัวกรองของแต่ละเมนู เพื่อประหยัดพื้นที่ด้านบน (เห็นการ์ดมากขึ้น)
// ยุบไว้เป็นค่าเริ่มต้น · จำสถานะเปิด/ปิดต่อเมนูใน localStorage (key = id) · โชว์ตัวเลขตัวกรองที่ใช้อยู่
// ใช้: <FilterBar id="joborders" count={activeCount}>...แถว .cat-filter เดิม...</FilterBar>
export default function FilterBar({ id, count = 0, children, defaultOpen = false }) {
  const key = "amc_filt_" + (id || "x");
  const [open, setOpen] = React.useState(() => {
    try { const v = localStorage.getItem(key); return v == null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  React.useEffect(() => { try { localStorage.setItem(key, open ? "1" : "0"); } catch { /* ignore */ } }, [open, key]);
  return (
    <div className="filterbar">
      <button type="button" className={"filterbar-toggle" + (open ? " open" : "") + (count > 0 ? " active" : "")} onClick={() => setOpen((o) => !o)}>
        <span className="fb-ic">⚙️</span> ตัวกรอง
        {count > 0 && <span className="filterbar-badge">{count}</span>}
        <span className="fb-chev">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="filterbar-body">{children}</div>}
    </div>
  );
}
