import React from "react";
import { UIcon } from "../icons";

// Combobox: type to search OR click the caret to open & scroll the full list. Pick → onPick(item), then clears.
export default function ItemPicker({ items, onPick, placeholder = "พิมพ์ค้นหา หรือกดลูกศรเพื่อเลือก" }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // multi-term search (every word must match) across name/code/brand/type/BTU — render at most 60 for speed
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matched = terms.length
    ? items.filter((m) => { const h = `${m.th || ""} ${m.en || ""} ${m.code || ""} ${m.brand || ""} ${m.ac_type || ""} ${m.btu || ""}`.toLowerCase(); return terms.every((t) => h.includes(t)); })
    : items;
  const list = matched.slice(0, 60);
  const more = matched.length - list.length;

  return (
    <div className="ipick" ref={ref}>
      <div className="ipick-input" onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
        <UIcon name="search" size={15} color="var(--ink-3)" />
        <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} />
        {q && <button className="cat-search-x" onMouseDown={(e) => { e.preventDefault(); setQ(""); }}><UIcon name="x" size={13} /></button>}
        <button className="ipick-caret" onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }} aria-label="เปิดรายการ">
          <UIcon name="chevD" size={16} color="var(--ink-3)" style={{ transform: open ? "rotate(180deg)" : "none", transition: ".15s" }} />
        </button>
      </div>
      {open && (
        <div className="ipick-list">
          {list.length === 0 && <div className="ipick-empty">ไม่พบรายการ</div>}
          {list.map((m) => (
            <button type="button" className="ipick-opt" key={m.code} onClick={() => { onPick(m); setQ(""); setOpen(false); }}>
              <span className="ipick-name">{m.th}{m.brand ? ` · ${m.brand}` : ""}{m.ac_type ? ` · ${m.ac_type}` : ""}{m.btu ? ` · ${Number(m.btu).toLocaleString()} BTU` : ""}</span>
              <span className="ipick-code">{m.code}</span>
            </button>
          ))}
          {more > 0 && <div className="ipick-empty">…อีก {more} รายการ — พิมพ์เพื่อค้นให้แคบลง</div>}
        </div>
      )}
    </div>
  );
}
