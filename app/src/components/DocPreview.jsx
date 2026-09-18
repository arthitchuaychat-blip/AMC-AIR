import React from "react";
import DocCapture from "./DocCapture";
import { UIcon } from "../icons";
import { buildDocHtml, paginate, MM } from "../lib/printDoc";
import "./DocPreview.css";

const PAGE_WIDTH = Math.ceil(210 * MM);

// The same document JSX, stylesheet and measured pages as print/PDF. Scaling happens
// outside the iframe, so a narrow drawer never changes A4 columns or page breaks.
export default function DocPreview({ type, no, title, onClose, onOpenFull }) {
  const [source, setSource] = React.useState("");
  const [copy, setCopy] = React.useState("ต้นฉบับ");
  const [zoom, setZoom] = React.useState("fit");
  const [width, setWidth] = React.useState(0);
  const [layout, setLayout] = React.useState(null);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const viewport = React.useRef(null);
  const frameRef = React.useRef(null);
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  React.useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => { if (node.isConnected) setWidth(node.clientWidth); };   // กัน callback ค้างหลังปิดพรีวิว (แบบเดียวกับ ReportChart)
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const html = React.useMemo(() => {
    if (!source) return "";
    const parsed = new DOMParser().parseFromString(source, "text/html");
    parsed.querySelector(".doc")?.setAttribute("data-copy", copy);
    return buildDocHtml(parsed.body.innerHTML);
  }, [source, copy]);

  const ready = layout?.html === html && !!html;
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.1, (width - 32) / PAGE_WIDTH)) : Number(zoom);

  const captured = React.useCallback((node) => {
    const area = node.querySelector(".print-area");
    if (!area?.querySelector(".doc")) { setError("ไม่พบเนื้อหาเอกสาร"); return; }
    setSource(area.outerHTML);
  }, []);

  const frameLoaded = async (event) => {
    const frame = event.currentTarget;
    const d = frame.contentDocument;
    const current = () => frame.isConnected && frameRef.current === frame && frame.contentDocument === d;
    try {
      if (!d?.querySelector(".doc")) return;
      if (d.fonts?.ready) await d.fonts.ready;
      await Promise.all([...d.images].map((image) => image.complete ? null : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })));
      if (!current()) return;
      const pages = paginate(d);
      if (!pages?.length) throw new Error("จัดหน้าเอกสารไม่สำเร็จ");
      // Only separate the finished sheets on screen; leave their geometry intact.
      const style = d.createElement("style");
      style.textContent = "@media screen{html,body{overflow:hidden;background:#e8edf4}.pg{box-shadow:0 1px 5px #0f17291a}.pg+.pg{margin-top:16px}}";
      d.head.appendChild(style);
      const height = Math.ceil(d.documentElement.scrollHeight);
      d.addEventListener("keydown", (e) => { if (e.key === "Escape") onClose(); });
      setLayout({ html, height, pages: pages.length });
    } catch (e) { if (current()) setError(e.message || "แสดงตัวอย่างไม่สำเร็จ"); }
  };

  const retry = () => { setError(""); setSource(""); setLayout(null); setAttempt((n) => n + 1); };
  const height = ready ? layout.height : Math.ceil(297 * MM);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <section className="drawer doc-preview" role="dialog" aria-modal="true" aria-label={`ตัวอย่าง${title} ${no}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <span className="drawer-ico"><UIcon name="clipboard" size={20} /></span>
            <div className="doc-preview-heading"><div className="drawer-title">{title}</div><div className="drawer-en">{no} · ตัวอย่างเอกสาร</div></div>
            <button ref={closeRef} className="drawer-close" aria-label="ปิดตัวอย่างเอกสาร" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <button className="btn-primary" style={{ width: "100%" }} onClick={onOpenFull}>เปิดหน้าเต็ม (แก้ไข/พิมพ์) ↗</button>
        </div>
        <div className="doc-preview-toolbar">
          <label>ชุดเอกสาร<select value={copy} onChange={(e) => setCopy(e.target.value)} aria-label="ชุดเอกสาร"><option>ต้นฉบับ</option><option>สำเนา</option></select></label>
          <label>ขนาด<select value={zoom} onChange={(e) => setZoom(e.target.value)} aria-label="ขนาดตัวอย่าง"><option value="fit">พอดีหน้าจอ</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label>
          <span className="doc-preview-pages" aria-live="polite">{ready ? `A4 · ${layout.pages} หน้า` : ""}</span>
        </div>
        <div className="doc-preview-viewport" ref={viewport} aria-busy={!ready && !error}>
          {error ? <div className="doc-preview-message" role="alert"><b>โหลดตัวอย่างไม่สำเร็จ</b><p>{error}</p><button className="btn-primary" onClick={retry}>ลองใหม่</button></div> : <>
            {!ready && <div className="doc-preview-message" role="status">กำลังเตรียมตัวอย่างเอกสาร…</div>}
            {html && <div className="doc-preview-canvas" style={{ visibility: ready ? "visible" : "hidden" }}>
              <div className="doc-preview-sheet" style={{ width: PAGE_WIDTH * scale, height: height * scale }}>
                <iframe key={html} ref={frameRef} title={`${title} ${no} — ${copy}`} sandbox="allow-same-origin" srcDoc={html} onLoad={frameLoaded} style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }} />
              </div>
            </div>}
          </>}
        </div>
        {!source && !error && <DocCapture key={attempt} type={type} no={no} onReady={captured} onError={setError} />}
      </section>
    </div>
  );
}
