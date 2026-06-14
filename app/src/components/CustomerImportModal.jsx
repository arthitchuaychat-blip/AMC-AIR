import React from "react";
import { bulkImportCustomers } from "../lib/api";
import { UIcon } from "../icons";

// อ่านหัวคอลัมน์เองได้ (จับชื่อคอลัมน์ไทย/อังกฤษ) + รองรับลูกค้าหลายสาขา
// (ลูกค้า 1 ราย = หลายแถวติดกันที่ชื่อ+เบอร์เดียวกัน · แต่ละแถว = 1 ไซต์/สาขา)
const HEADER = "ชนิด,ชื่อลูกค้า,เลขผู้เสียภาษี,ไซต์,ผู้ติดต่อ,เบอร์โทร,ที่อยู่,แผนที่,VAT,หมายเหตุ";
const SAMPLE_ROWS = [
  "นิติบุคคล,บริษัท เอ จำกัด,0105531059913,สำนักงานใหญ่,คุณสมชาย,0812345678,123/4 ถ.สุขุมวิท กรุงเทพฯ,https://maps.app.goo.gl/xxxx,ใช่,",
  "นิติบุคคล,บริษัท เอ จำกัด,0105531059913,สาขาลาดพร้าว,คุณสมชาย,0812345678,99 ถ.ลาดพร้าว,https://maps.app.goo.gl/yyyy,,",
  "บุคคล,คุณสมหญิง ใจดี,,บ้าน,คุณสมหญิง,0890001111,88 นนทบุรี 11000,,,",
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
  type: ["ชนิด", "ประเภท", "ประเภทลูกค้า", "type", "kind"],
  name: ["ชื่อลูกค้า", "ชื่อ", "name", "customer"],
  tax_id: ["เลขผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี", "เลขภาษี", "taxid", "tax"],
  site_name: ["ไซต์", "ไชต์", "ชื่อไซต์", "ชื่อสาขา", "สาขา", "site", "branch"],
  contact: ["ผู้ติดต่อ", "ติดต่อ", "contact"],
  phone: ["เบอร์โทร", "เบอร์", "โทรศัพท์", "โทร", "phone", "tel", "mobile"],
  role: ["ตำแหน่ง", "role", "position"],
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

  // positional fallback for header-less pastes (legacy flat order)
  function parsePositional(table) {
    const rows = [], errors = [];
    table.forEach((cells, i) => {
      const c0 = (cells[0] || "").toLowerCase();
      if (i === 0 && (c0 === "ชนิด" || c0 === "kind" || c0 === "ชื่อลูกค้า" || c0 === "name")) return;
      const [type, name, tax_id, vat, address, cname, cphone, crole, saddr, note, mapUrl] = cells;
      if (!name) { errors.push({ line: i + 1 }); return; }
      const ctype = custType(type);
      const map_url = isUrl(mapUrl) ? mapUrl : "";
      rows.push({
        cust: { type: ctype, name, tax_id: tax_id || "", vat: isVat(vat), address: address || "", note: note || "" },
        contacts: (cname || cphone) ? [{ name: cname || "", phone: cphone || "", role: crole || "" }] : [],
        sites: (saddr || map_url) ? [{ site_name: ctype === "company" ? "สำนักงาน" : "บ้าน", address: saddr || address || "", map_url }] : [],
      });
    });
    setParsed({ rows, errors, branches: rows.reduce((a, r) => a + r.sites.length, 0) }); setMsg(null);
  }

  function parse() {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) { setParsed({ rows: [], errors: [], branches: 0 }); return; }
    const delim = lines[0].includes("\t") ? "\t" : ",";
    const table = lines.map((l) => splitCells(l, delim));
    const colMap = mapHeader(table[0]);
    if (!colMap) return parsePositional(table); // no recognizable header → legacy positional

    const get = (cells, field) => (colMap[field] != null ? (cells[colMap[field]] || "").trim() : "");
    const groups = [], errors = [];
    let cur = null;
    for (let i = 1; i < table.length; i++) {
      const cells = table[i];
      const name = get(cells, "name");
      const phone = get(cells, "phone");
      if (!name) { errors.push({ line: i + 1 }); continue; }
      // new customer when the name changes, or the phone is present and differs from the current group's
      const startNew = !cur || cur.name !== name || (phone && cur.phone && phone !== cur.phone);
      if (startNew) {
        const ctype = custType(get(cells, "type"));
        const tax = get(cells, "tax_id");
        const vatCell = get(cells, "vat");
        const vat = colMap.vat != null && vatCell ? isVat(vatCell) : (ctype === "company" ? true : !!tax);
        cur = { name, phone, cust: { type: ctype, name, tax_id: tax, vat, address: "", note: get(cells, "note") }, contacts: [], sites: [] };
        const cname = get(cells, "contact"), crole = get(cells, "role");
        if (cname || phone) cur.contacts.push({ name: cname || name, phone: phone || "", role: crole || "" });
        groups.push(cur);
      } else if (phone && !cur.phone) {
        cur.phone = phone;
        if (!cur.contacts.length) cur.contacts.push({ name: get(cells, "contact") || name, phone, role: get(cells, "role") || "" });
      }
      // each row contributes one site/branch
      const saddr = get(cells, "address");
      const rawSite = get(cells, "site_name");
      const map_url = isUrl(get(cells, "map")) ? get(cells, "map").trim() : "";
      if (saddr || map_url || rawSite) {
        const sname = rawSite || (cur.cust.type === "company" ? "สำนักงาน" : "บ้าน");
        cur.sites.push({ site_name: sname, address: saddr || "", map_url });
        if (!cur.cust.address && saddr) cur.cust.address = saddr; // main address = first branch
      }
    }
    const rows = groups.map((g) => ({ cust: g.cust, contacts: g.contacts, sites: g.sites }));
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
            คัดลอกหลายแถวจาก Google Sheets มาวางได้เลย หรืออัปโหลด <b>.csv</b><br />
            มี <b>หัวคอลัมน์</b> แถวแรก ระบบจับชื่อคอลัมน์ให้อัตโนมัติ — คอลัมน์ที่รองรับ:
            <b> ชนิด · ชื่อลูกค้า · เลขผู้เสียภาษี · ไซต์ · ผู้ติดต่อ · เบอร์โทร · ที่อยู่ · แผนที่ · VAT · หมายเหตุ</b>
          </p>
          <ul className="bulk-help">
            <li><b>ลูกค้าหลายสาขา</b> = ใส่หลายแถว ใช้ <b>ชื่อ+เบอร์เดียวกัน</b> แต่ละแถวเป็น 1 สาขา (ใส่ชื่อในคอลัมน์ <b>ไซต์</b>)</li>
            <li><b>VAT</b> เว้นว่างได้ — นิติบุคคลรับ VAT เสมอ · บุคคลธรรมดารับเฉพาะรายที่มีเลขภาษี</li>
            <li><b>แผนที่</b> = ลิงก์ Google Maps (ค่าที่ไม่ใช่ลิงก์จะถูกข้าม) · ต้องมีอย่างน้อย <b>ชื่อลูกค้า</b></li>
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
              {multiSite && <span> · {parsed.branches} ไซต์/สาขา</span>}
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
