import React from "react";

// ช่องกรอกตัวเลขมาตรฐานของแอป:
// - ลบได้จนว่าง (ค่าที่ส่งให้ระบบ = 0) · ออกจากช่องแล้วโชว์ 0 ให้เอง
// - แตะ/คลิกแล้วเลือกตัวเลขทั้งก้อน พิมพ์ทับได้ทันที ไม่ต้องกดลบทีละตัว
// - autoWidth: ความกว้างยืดตามจำนวนหลัก (ใช้กับช่องเปล่า ๆ — ช่องที่อยู่ในกล่อง .inp-unit ให้กล่องคุมความกว้างเอง)
export default function NumIn({ value, onChange, className = "inp sm", style, autoWidth, ...rest }) {
  const [txt, setTxt] = React.useState(value == null ? "" : String(value));
  const focus = React.useRef(false);
  // ค่าใน state หลักเปลี่ยนจากที่อื่น (เช่น สลับหน่วยแล้วคำนวณราคาใหม่) → sync เข้ามาเมื่อไม่ได้พิมพ์อยู่
  React.useEffect(() => { if (!focus.current) setTxt(value == null ? "" : String(value)); }, [value]);
  const w = autoWidth ? { width: `${Math.min(Math.max(String(txt || "0").length, 3), 12) + 2.5}ch`, boxSizing: "content-box" } : {};
  return (
    <input type="number" inputMode="decimal" className={className} style={{ ...w, ...style }} value={txt}
      onFocus={(e) => { focus.current = true; try { e.target.select(); } catch { /* ignore */ } }}
      onChange={(e) => { const s = e.target.value; setTxt(s); const n = Number(s); onChange(s === "" || !Number.isFinite(n) ? 0 : n); }}
      onBlur={() => { focus.current = false; setTxt(value == null || value === "" ? "0" : String(value)); }}
      {...rest} />
  );
}
