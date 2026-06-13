import React from "react";

// textarea that grows to fit its content (Enter = new line, unlimited). Used for per-line product descriptions.
export default function GrowArea({ value, onChange, className = "", placeholder, rows = 1 }) {
  const ref = React.useRef(null);
  const fit = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } };
  React.useEffect(() => { fit(); }, [value]);
  return (
    <textarea ref={ref} className={className} rows={rows} value={value} placeholder={placeholder}
      onChange={(e) => { onChange(e); fit(); }} style={{ resize: "none", overflow: "hidden" }} />
  );
}
