import React from "react";
import { bulkImportCustomers } from "../lib/api";
import { UIcon } from "../icons";

// Flat format (11 cols) — one customer per row (+ optional 1 contact & 1 site):
// ชนิด · ชื่อลูกค้า · เลขผู้เสียภาษี · VAT · ที่อยู่ · ผู้ติดต่อ · เบอร์โทร · ตำแหน่ง · ที่อยู่ไซต์งาน · หมายเหตุ · แผนที่
const HEADER = "ชนิด,ชื่อลูกค้า,เลขผู้เสียภาษี,VAT,ที่อยู่,ผู้ติดต่อ,เบอร์โทร,ตำแหน่ง,ที่อยู่ไซต์งาน,หมายเหตุ,แผนที่";
const SAMPLE_ROWS = [
  "นิติบุคคล,บริษัท เอ จำกัด,0105531059913,ใช่,123/4 ถ.สุขุมวิท กรุงเทพฯ 10110,คุณสมชาย,0812345678,ฝ่ายจัดซื้อ,,ลูกค้าเก่า,https://maps.app.goo.gl/xxxx",
  "บุคคล,คุณสมหญิง ใจดี,,ไม่,88 นนทบุรี 11000,คุณสมหญิง,0890001111,,,,",
];
const TEMPLATE = [HEADER, ...SAMPLE_ROWS].join("\n");

// "นิติบุคคล" มีคำว่า "บุคคล" → ต้องเช็ก "นิติ/บริษัท/จำกัด" ก่อน ไม่งั้นจะถูกตีเป็นบุคคล
const custType = (s) => {
  const t = (s || "").trim();
  if (/นิติ|บริษัท|ห้าง|หจก|บจก|company|co\.|ltd|จำกัด/i.test(t)) return "company";
  if (/บุคคล|person|ind/i.test(t)) return "person";
  return "company";
};
const isVat = (s) => { const t = (s || "").trim().toLowerCase(); if (!t) return true; return !/^(ไม่|no|n|false|0)/.test(t); };

export default function CustomerImportModal({ onDone, onClose }) {
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setText(String(r.result || "")); r.readAsText(f, "utf-8");
  }
  function downloadTemplate() {
    const blob = new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "amc-customers-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function parse() {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
    const rows = [], errors = [];
    lines.forEach((line, i) => {
      const delim = line.includes("\t") ? "\t" : ",";
      const cells = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
      const c0 = (cells[0] || "").toLowerCase();
      if (i === 0 && (c0 === "ชนิด" || c0 === "kind" || c0 === "ชื่อลูกค้า" || c0 === "name")) return; // header
      const [type, name, tax_id, vat, address, cname, cphone, crole, saddr, note, mapUrl] = cells;
      if (!name) { errors.push({ line: i + 1 }); return; }
      rows.push({
        cust: { type: custType(type), name, tax_id: tax_id || "", vat: isVat(vat), address: address || "", note: note || "" },
        contacts: (cname || cphone) ? [{ name: cname || "", phone: cphone || "", role: crole || "" }] : [],
        // map pin lands on a site; if no separate site address, reuse the customer address so the pin still has a label
        sites: (saddr || mapUrl) ? [{ site_name: "", address: saddr || address || "", map_url: mapUrl || "" }] : [],
      });
    });
    setParsed({ rows, errors }); setMsg(null);
  }

  async function doImport() {
    if (!parsed?.rows.length || busy) return;
    setBusy(true);
    try {
      const res = await bulkImportCustomers(parsed.rows);
      if (res.failed) { setMsg(`นำเข้าสำเร็จ ${res.ok} ราย · ล้มเหลว ${res.failed} ราย — ${res.errors.slice(0, 2).join(" | ")}`); setBusy(false); }
      else onDone(res.ok, 0);
    }
    catch (e) { setMsg("นำเข้าไม่สำเร็จ: " + (e.message || e)); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 680 }}>
        <div className="modal-head">
          <div className="modal-title">นำเข้าลูกค้าหลายราย <span>จาก Google Sheets / CSV</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="page-sub" style={{ marginBottom: 8 }}>
            คัดลอกหลายแถวจาก Google Sheets มาวางได้เลย หรืออัปโหลด <b>.csv</b> · 1 แถว = ลูกค้า 1 ราย<br />
            ลำดับคอลัมน์: <b>ชนิด · ชื่อลูกค้า · เลขผู้เสียภาษี · VAT · ที่อยู่ · ผู้ติดต่อ · เบอร์โทร · ตำแหน่ง · ที่อยู่ไซต์งาน · หมายเหตุ · แผนที่</b>
          </p>
          <ul className="bulk-help">
            <li><b>ชนิด</b> = นิติบุคคล / บุคคล · <b>VAT</b> = ใช่ / ไม่ · <b>แผนที่</b> = ใส่ลิงก์ Google Maps (ไม่บังคับ)</li>
            <li>ต้องมีอย่างน้อย <b>ชื่อลูกค้า</b> · ช่องอื่นเว้นว่างได้</li>
            <li>แนะนำให้ <b>คัดลอกจาก Google Sheets มาวางตรง ๆ</b> (คั่นด้วย Tab) — ที่อยู่ที่มีลูกน้ำจะไม่เพี้ยน</li>
          </ul>
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <button className="btn-ghost sm" onClick={downloadTemplate}><UIcon name="withdraw" size={14} /> ดาวน์โหลดฟอร์ม CSV</button>
            <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
              <UIcon name="box" size={14} /> เลือกไฟล์ CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} style={{ display: "none" }} />
            </label>
            <button className="btn-ghost sm" onClick={() => { setText(TEMPLATE); setParsed(null); }}>ใส่ตัวอย่างรูปแบบ</button>
          </div>
          <textarea className="inp bulk-ta" value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }}
            placeholder={SAMPLE_ROWS.join("\n")} rows={9} />
          {parsed && (
            <div className="bulk-preview">
              ✅ พร้อมนำเข้า <b>{parsed.rows.length}</b> ราย
              {parsed.errors.length > 0 && <span style={{ color: "var(--down)" }}> · ข้าม {parsed.errors.length} แถว (ไม่มีชื่อ)</span>}
            </div>
          )}
          {msg && <div className="login-err" style={{ marginTop: 8 }}>{msg}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          {!parsed
            ? <button className="btn-primary" disabled={!text.trim()} onClick={parse}>ตรวจสอบข้อมูล</button>
            : <button className="btn-primary" disabled={!parsed.rows.length || busy} onClick={doImport}>
                <UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {busy ? "กำลังนำเข้า…" : `นำเข้า ${parsed.rows.length} ราย`}
              </button>}
        </div>
      </div>
    </div>
  );
}
