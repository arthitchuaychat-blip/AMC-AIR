import React from "react";
import { bulkImportCustomers } from "../lib/api";
import { UIcon } from "../icons";

// อ่านหัวคอลัมน์เองได้ (จับชื่อคอลัมน์ไทย/อังกฤษ) + รองรับลูกค้าหลายไซต์
// แยกลูกค้าด้วย "ชื่อลูกค้า" · ลูกค้า 1 ราย = หลายแถวที่ชื่อเดียวกัน · แต่ละแถว = 1 ไซต์
// แต่ละไซต์เก็บ: ชื่อไซต์ · ผู้ติดต่อ · เบอร์โทร · ที่อยู่ · แผนที่
// เบอร์/ที่อยู่หลักของลูกค้า = ดึงจากไซต์แรกอัตโนมัติ
const HEADER = "ชื่อลูกค้า,ชนิด,เลขผู้เสียภาษี,VAT,ชื่อไซต์,ผู้ติดต่อ,เบอร์โทร,ที่อยู่,แผนที่,หมายเหตุ";
const SAMPLE_ROWS = [
  "บริษัท เอ จำกัด,นิติบุคคล,0105531059913,ใช่,สำนักงานใหญ่,คุณสมชาย,0812345678,123/4 ถ.สุขุมวิท กรุงเทพฯ,https://maps.app.goo.gl/xxxx,",
  "บริษัท เอ จำกัด,นิติบุคคล,0105531059913,,สาขาลาดพร้าว,คุณสมหญิง,0823456789,99 ถ.ลาดพร้าว,https://maps.app.goo.gl/yyyy,",
  "คุณสมหญิง ใจดี,บุคคล,,,บ้าน,คุณสมหญิง,0890001111,88 นนทบุรี 11000,,",
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
const isUrl = (s) => /^https?:\/\//i.test((s || "").trim());

// ---------- column header detection ----------
const HEADER_ALIASES = {
  name: ["ชื่อลูกค้า", "ชื่อ", "name", "customer"],
  type: ["ชนิด", "ประเภท", "ประเภทลูกค้า", "type", "kind"],
  tax_id: ["เลขผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี", "เลขภาษี", "taxid", "tax"],
  site_name: ["ชื่อไซต์", "ไซต์", "ไชต์", "ชื่อสาขา", "สาขา", "site", "branch"],
  contact: ["ผู้ติดต่อ", "ชื่อผู้ติดต่อ", "ติดต่อ", "contact"],
  phone: ["เบอร์โทร", "เบอร์", "โทรศัพท์", "โทร", "phone", "tel", "mobile"],
  address: ["ที่อยู่", "address", "addr"],
  map: ["แผนที่", "ลิงก์แผนที่", "googlemaps", "map", "พิกัด", "gps", "ลิงก์"],
  vat: ["vat", "ภาษีมูลค่าเพิ่ม"],
  note: ["หมายเหตุ", "note", "remark"],
};
const norm = (s) => (s || "").toString().toLowerCase().replace(/\(.*?\)/g, "").replace(/[\s_]+/g, "").trim();
function mapHeader(cells) {
  if (!cells) return null;
  const map = {}; let hits = 0;
  cells.forEach((c, idx) => {
    const n = norm(c); if (!n) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] != null) continue;
      if (aliases.some((a) => { const na = norm(a); return n === na || n.startsWith(na) || na.startsWith(n); })) { map[field] = idx; hits++; break; }
    }
  });
  return hits >= 2 && map.name != null ? map : null;
}

// quote-aware split for comma; plain split for tab (Google Sheets paste)
function splitCells(line, delim) {
  if (delim === "\t") return line.split("\t").map((c) => c.trim().replace(/^"|"$/g, ""));
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

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
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) { setParsed({ rows: [], errors: [], branches: 0 }); return; }
    const delim = lines[0].includes("\t") ? "\t" : ",";
    const table = lines.map((l) => splitCells(l, delim));
    const colMap = mapHeader(table[0]);
    // require a header row so columns are unambiguous
    if (!colMap) { setMsg("ไม่พบหัวคอลัมน์ — แถวแรกต้องเป็นชื่อคอลัมน์ (เช่น ชื่อลูกค้า, ชนิด, ที่อยู่, แผนที่ ...)"); setParsed(null); return; }

    const get = (cells, field) => (colMap[field] != null ? (cells[colMap[field]] || "").trim() : "");
    const byName = new Map(); const order = []; const errors = [];
    for (let i = 1; i < table.length; i++) {
      const cells = table[i];
      const name = get(cells, "name");
      if (!name) { errors.push({ line: i + 1 }); continue; }
      const key = name.toLowerCase(); // แยกลูกค้าด้วยชื่อ
      let g = byName.get(key);
      if (!g) {
        const ctype = custType(get(cells, "type"));
        const tax = get(cells, "tax_id");
        const vatCell = get(cells, "vat");
        const vat = colMap.vat != null && vatCell ? isVat(vatCell) : (ctype === "company" ? true : !!tax);
        g = { cust: { type: ctype, name, tax_id: tax, vat, address: "", note: get(cells, "note") }, contacts: [], sites: [] };
        byName.set(key, g); order.push(g);
      }
      // each row = one site (with its own contact/phone/address/map)
      const saddr = get(cells, "address");
      const scontact = get(cells, "contact");
      const sphone = get(cells, "phone");
      const map_url = isUrl(get(cells, "map")) ? get(cells, "map").trim() : "";
      const rawSite = get(cells, "site_name");
      if (saddr || scontact || sphone || map_url || rawSite) {
        const sname = rawSite || (g.cust.type === "company" ? "สำนักงาน" : "บ้าน");
        g.sites.push({ site_name: sname, contact_name: scontact, phone: sphone, address: saddr, map_url });
        // main address + main contact = first site
        if (!g.cust.address && saddr) g.cust.address = saddr;
        if (!g.contacts.length && (scontact || sphone)) g.contacts.push({ name: scontact || name, phone: sphone || "", role: "" });
      }
    }
    const rows = order;
    setParsed({ rows, errors, branches: rows.reduce((a, r) => a + r.sites.length, 0) }); setMsg(null);
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

  const multiSite = parsed && parsed.branches > parsed.rows.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 680 }}>
        <div className="modal-head">
          <div className="modal-title">นำเข้าลูกค้าหลายราย <span>จาก Google Sheets / CSV</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="page-sub" style={{ marginBottom: 8 }}>
            คัดลอกหลายแถวจาก Google Sheets มาวางได้เลย หรืออัปโหลด <b>.csv</b> · แถวแรกต้องเป็น <b>หัวคอลัมน์</b><br />
            คอลัมน์ที่รองรับ: <b>ชื่อลูกค้า · ชนิด · เลขผู้เสียภาษี · VAT · ชื่อไซต์ · ผู้ติดต่อ · เบอร์โทร · ที่อยู่ · แผนที่ · หมายเหตุ</b>
          </p>
          <ul className="bulk-help">
            <li>แยกลูกค้าด้วย <b>ชื่อลูกค้า</b> — ลูกค้า 1 รายมีได้หลายไซต์ (ใส่หลายแถว ชื่อลูกค้าเดียวกัน แต่ละแถว = 1 ไซต์)</li>
            <li>แต่ละไซต์มี <b>ผู้ติดต่อ · เบอร์โทร · ที่อยู่ · แผนที่</b> ของตัวเอง · เบอร์+ที่อยู่หลักของลูกค้าดึงจากไซต์แรกให้</li>
            <li><b>VAT</b> เว้นว่างได้ (นิติบุคคลรับเสมอ · บุคคลธรรมดารับเฉพาะมีเลขภาษี) · <b>แผนที่</b> = ลิงก์ Google Maps</li>
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
              {multiSite && <span> · {parsed.branches} ไซต์</span>}
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
