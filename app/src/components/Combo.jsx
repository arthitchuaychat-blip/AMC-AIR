import React from "react";

// Searchable drop-in replacement for <select>. Keeps the same usage:
//   <Combo className="inp" value={v} onChange={(e)=>...e.target.value}> <option .../> </Combo>
// onChange is called with a synthetic { target: { value } } so existing handlers work unchanged.
function collectOptions(children) {
  const out = [];
  React.Children.forEach(children, (ch) => {
    if (!ch || typeof ch !== "object") return;
    if (ch.type === "optgroup") { out.push(...collectOptions(ch.props.children)); return; }
    if (ch.type === "option") {
      const label = React.Children.toArray(ch.props.children)
        .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : "")).join("");
      out.push({ value: String(ch.props.value ?? ""), label, disabled: !!ch.props.disabled });
    }
  });
  return out;
}

export default function Combo({ value, onChange, children, className = "", style, disabled, placeholder = "เลือก…", searchThreshold = 6 }) {
  const options = React.useMemo(() => collectOptions(children), [children]);
  const [open, setOpen] = React.useState(false);
  const [qy, setQy] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);

  const sval = String(value ?? "");
  const cur = options.find((o) => o.value === sval);
  const showSearch = options.length > searchThreshold;
  const filtered = qy ? options.filter((o) => o.label.toLowerCase().includes(qy.toLowerCase())) : options;
  const wrapCls = (className || "").replace(/\binp\b/, "").trim();

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  React.useEffect(() => { if (open) { setQy(""); setHi(Math.max(0, filtered.findIndex((o) => o.value === sval))); } }, [open]);
  React.useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[hi];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [hi, open]);

  function pick(o) { if (o.disabled) return; onChange && onChange({ target: { value: o.value } }); setOpen(false); }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  return (
    <div className={"combo " + wrapCls} style={style} ref={ref}>
      <button type="button" className="inp combo-btn" disabled={disabled} onClick={() => !disabled && setOpen((o) => !o)}>
        <span className={cur ? "" : "combo-ph"}>{cur ? cur.label : placeholder}</span>
        <span className="combo-arrow">▾</span>
      </button>
      {open && (
        <div className="combo-pop" onKeyDown={onKey}>
          {showSearch && (
            <input className="combo-search" autoFocus value={qy} placeholder="พิมพ์ค้นหา…"
              onChange={(e) => { setQy(e.target.value); setHi(0); }} />
          )}
          <div className="combo-list" ref={listRef}>
            {filtered.length === 0 && <div className="combo-empty">ไม่พบรายการ</div>}
            {filtered.map((o, i) => (
              <div key={o.value + "|" + i}
                className={"combo-opt" + (o.value === sval ? " sel" : "") + (i === hi ? " hi" : "") + (o.disabled ? " dis" : "")}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
                {o.label || " "}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
