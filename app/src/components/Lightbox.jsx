import React from "react";
import { UIcon } from "../icons";
import { fileExt } from "../lib/format";

// Fullscreen image viewer: swipe/arrow between images + download the whole album.
export default function Lightbox({ images, index = 0, onClose }) {
  const [i, setI] = React.useState(index);
  const [busy, setBusy] = React.useState(false);
  const n = images.length;
  const go = React.useCallback((d) => setI((c) => (c + d + n) % n), [n]);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);
  // touch swipe
  const tx = React.useRef(null);
  const onTouchStart = (e) => { tx.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => { if (tx.current == null) return; const dx = e.changedTouches[0].clientX - tx.current; if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1); tx.current = null; };

  async function downloadAll() {
    setBusy(true);
    for (let k = 0; k < n; k++) {
      try {
        const r = await fetch(images[k]); const b = await r.blob();
        const u = URL.createObjectURL(b); const a = document.createElement("a");
        a.href = u; a.download = `photo-${k + 1}.${fileExt(images[k]) || "jpg"}`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
      } catch { window.open(images[k], "_blank"); }
    }
    setBusy(false);
  }

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lb-count">{i + 1} / {n}</span>
        <div className="lb-bar-actions">
          {n > 1 && <button className="lb-btn" disabled={busy} onClick={downloadAll} title="ดาวน์โหลดทั้งอัลบั้ม"><UIcon name="catalog" size={16} color="#fff" /> {busy ? "กำลังโหลด…" : `ดาวน์โหลดทั้งอัลบั้ม (${n})`}</button>}
          <a className="lb-btn" href={images[i]} download target="_blank" rel="noreferrer" title="ดาวน์โหลดรูปนี้"><UIcon name="box" size={16} color="#fff" /></a>
          <button className="lb-btn" onClick={onClose}><UIcon name="x" size={18} color="#fff" /></button>
        </div>
      </div>
      <div className="lb-stage" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {n > 1 && <button className="lb-nav lb-prev" onClick={() => go(-1)}><UIcon name="chevR" size={26} color="#fff" style={{ transform: "rotate(180deg)" }} /></button>}
        <img className="lb-img" src={images[i]} alt="" />
        {n > 1 && <button className="lb-nav lb-next" onClick={() => go(1)}><UIcon name="chevR" size={26} color="#fff" /></button>}
      </div>
      {n > 1 && (
        <div className="lb-thumbs" onClick={(e) => e.stopPropagation()}>
          {images.map((u, k) => <button key={k} className={"lb-thumb" + (k === i ? " on" : "")} onClick={() => setI(k)}><img src={u} alt="" /></button>)}
        </div>
      )}
    </div>
  );
}
