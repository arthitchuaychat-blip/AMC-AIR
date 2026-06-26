import React from "react";

// Draw-on-screen signature pad (finger or mouse). Calls onChange(dataUrl|"") whenever the drawing
// changes. If `value` (an existing signature URL) is provided and nothing has been drawn yet, it shows
// that instead of the blank canvas — so re-opening a saved handover keeps the signature visible.
export default function SignaturePad({ value, onChange, label }) {
  const canvasRef = React.useRef(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  const [hasInk, setHasInk] = React.useState(false);

  // size the bitmap to the element (×2 for crispness) once mounted
  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * 2);
    c.height = Math.round(rect.height * 2);
    const ctx = c.getContext("2d");
    ctx.scale(2, 2);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f1729";
  }, []);

  const pos = (e) => {
    const c = canvasRef.current; const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext("2d"); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => {
    if (!drawing.current) return; e.preventDefault();
    const ctx = canvasRef.current.getContext("2d"); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    if (!dirty.current) { dirty.current = true; setHasInk(true); }
  };
  const end = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) emit(); };
  const emit = () => { try { onChange(canvasRef.current.toDataURL("image/png")); } catch { /* ignore */ } };

  const clear = () => {
    const c = canvasRef.current; const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    dirty.current = false; setHasInk(false); onChange("");
  };

  const showSaved = !!value && !hasInk;
  return (
    <div className="sig">
      <div className="sig-bar">
        <span className="sig-label">{label}</span>
        <button type="button" className="sig-clear" onClick={clear}>ล้าง</button>
      </div>
      <div className="sig-canvas-wrap">
        {showSaved && <img className="sig-saved" src={value} alt="" />}
        <canvas
          ref={canvasRef} className="sig-canvas"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        {!hasInk && !showSaved && <span className="sig-hint">เซ็นที่นี่</span>}
      </div>
    </div>
  );
}
