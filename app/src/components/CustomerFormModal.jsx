import React from "react";
import { saveCustomer } from "../lib/api";
import { UIcon } from "../icons";
import { custCode } from "../lib/format";

// Full add/edit customer form in a popup. initial = customer obj (with contacts[]/sites[]) for edit, or a seed for new.
// onSaved(id) fires after a successful save.
const seedCust = (i) => ({ id: i?.id || null, type: i?.type || "person", name: i?.name || "", tax_id: i?.tax_id || "", email: i?.email || "", vat: !!i?.vat, credit_days: i?.credit_days ?? 0, address: i?.address || "", note: i?.note || "" });
// สีไล่ต่อไซต์ เพื่อแยกกล่องไซต์ให้เห็นง่าย ไม่ตาลาย
const SITE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626"];

export default function CustomerFormModal({ initial, onClose, onSaved }) {
  const [cust, setCust] = React.useState(() => seedCust(initial));
  const [contacts, setContacts] = React.useState(() => initial?.contacts?.length ? initial.contacts.map((x) => ({ name: x.name || "", phone: x.phone || "", role: x.role || "" })) : [{ name: initial?.name || "", phone: "", role: "" }]);
  // ⚠️ ต้องพก id ของไซต์เดิมไปด้วย — saveCustomer ใช้ id ตัดสินว่า "แก้แถวเดิม" ไม่ใช่ลบทิ้งสร้างใหม่
  // (ถ้า id หาย เอกสารเก่าทุกใบจะหลุดจากไซต์ เพราะ FK เป็น on delete set null)
  const [sites, setSites] = React.useState(() => initial?.sites?.length ? initial.sites.map((x) => ({ id: x.id, site_name: x.site_name || "", contact_name: x.contact_name || "", phone: x.phone || "", address: x.address || "", map_url: x.map_url || "" })) : [{ site_name: "", contact_name: "", phone: "", address: "", map_url: "" }]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => { const esc = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, []);

  const setC = (k, v) => setCust((c) => ({ ...c, [k]: v }));
  const setRow = (setArr, i, k, v) => setArr((rows) => rows.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const addRow = (setArr, blank) => setArr((rows) => [...rows, blank]);
  const delRow = (setArr, i) => setArr((rows) => rows.filter((_, j) => j !== i));

  async function save() {
    if (!cust.name.trim()) return setErr("ใส่ชื่อลูกค้า");
    setBusy(true); setErr(null);
    try { const id = await saveCustomer(cust, contacts, sites); onSaved(id); }
    catch (e) { setErr("บันทึกไม่สำเร็จ: " + (e.message || e)); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxHeight: "90vh" }}>
        <div className="modal-head">
          <div className="modal-title">{cust.id ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้าใหม่"}{cust.id ? <span>{custCode(cust.id)}</span> : null}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="sub-toggle" style={{ maxWidth: 320 }}>
            <button className={cust.type === "company" ? "on" : ""} onClick={() => setC("type", "company")}>นิติบุคคล</button>
            <button className={cust.type === "person" ? "on" : ""} onClick={() => setC("type", "person")}>บุคคลธรรมดา</button>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ชื่อลูกค้า *</span><input className="inp" value={cust.name} onChange={(e) => setC("name", e.target.value)} placeholder={cust.type === "company" ? "เช่น บริษัท ... จำกัด" : "ชื่อ-นามสกุล"} /></label>
            <label className="fld"><span>เลขผู้เสียภาษี</span><input className="inp" value={cust.tax_id} onChange={(e) => setC("tax_id", e.target.value)} placeholder="13 หลัก" /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ภาษีมูลค่าเพิ่ม</span>
              <button type="button" className={"vat-toggle" + (cust.vat ? " on" : "")} onClick={() => setC("vat", !cust.vat)}>{cust.vat ? "คิด VAT 7%" : "ไม่คิด VAT"}</button>
            </label>
            {/* เครดิตเทอม → ใบแจ้งหนี้เติมวันครบกำหนดชำระให้เอง ไม่ต้องคิดเองทุกใบ (ปล่อยว่างแล้วหนี้จะหลุดจาก KPI เกินกำหนด) */}
            <label className="fld"><span>เครดิตเทอม (วัน)</span>
              <input className="inp" type="number" min="0" step="1" value={cust.credit_days}
                onChange={(e) => setC("credit_days", e.target.value)} placeholder="0 = ครบกำหนดวันออกบิล" />
            </label>
          </div>
          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={cust.note} onChange={(e) => setC("note", e.target.value)} placeholder="(ไม่บังคับ)" /></label>
          <label className="fld"><span>อีเมล</span><input className="inp" type="email" value={cust.email} onChange={(e) => setC("email", e.target.value)} placeholder="เช่น contact@company.com (ไม่บังคับ)" /></label>
          <label className="fld"><span>ที่อยู่หลัก</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={cust.address} onChange={(e) => setC("address", e.target.value)} /></label>

          <div className="fld"><span>ผู้ติดต่อ (เพิ่มได้หลายคน)</span>
            {contacts.map((c, i) => (
              <div className="crm-row" key={i}>
                <input className="inp" value={c.name} onChange={(e) => setRow(setContacts, i, "name", e.target.value)} placeholder="ชื่อผู้ติดต่อ" />
                <input className="inp" value={c.phone} onChange={(e) => setRow(setContacts, i, "phone", e.target.value)} placeholder="เบอร์โทร" />
                <input className="inp" value={c.role} onChange={(e) => setRow(setContacts, i, "role", e.target.value)} placeholder="ตำแหน่ง" />
                <button className="line-x" onClick={() => delRow(setContacts, i)}><UIcon name="x" size={14} /></button>
              </div>
            ))}
            <button className="btn-ghost sm" onClick={() => addRow(setContacts, { name: "", phone: "", role: "" })}><UIcon name="plus" size={13} /> เพิ่มผู้ติดต่อ</button>
          </div>

          <div className="fld"><span>ไซต์งาน / สถานที่ให้บริการ (เพิ่มได้หลายที่)</span>
            {sites.map((s, i) => {
              const c = SITE_COLORS[i % SITE_COLORS.length];
              return (
                <div className="crm-site" key={i} style={{ borderLeftColor: c, background: c + "24" }}>
                  <div className="crm-site-head">
                    <span className="crm-site-badge" style={{ background: c }}>📍 ไซต์ {i + 1}{s.site_name ? " · " + s.site_name : ""}</span>
                    <button className="line-x" onClick={() => delRow(setSites, i)}><UIcon name="x" size={14} /></button>
                  </div>
                  <div className="crm-row">
                    <input className="inp" value={s.site_name} onChange={(e) => setRow(setSites, i, "site_name", e.target.value)} placeholder="ชื่อไซต์ (เช่น สาขาลาดพร้าว)" />
                    <input className="inp" value={s.map_url} onChange={(e) => setRow(setSites, i, "map_url", e.target.value)} placeholder="ลิงก์ Google Maps" />
                  </div>
                  <div className="crm-row">
                    <input className="inp" value={s.contact_name} onChange={(e) => setRow(setSites, i, "contact_name", e.target.value)} placeholder="👤 ชื่อผู้ติดต่อ (ไซต์นี้)" />
                    <input className="inp" value={s.phone} onChange={(e) => setRow(setSites, i, "phone", e.target.value)} placeholder="📞 เบอร์โทร (ไซต์นี้)" />
                  </div>
                  <input className="inp" value={s.address} onChange={(e) => setRow(setSites, i, "address", e.target.value)} placeholder="ที่อยู่ไซต์งาน" />
                </div>
              );
            })}
            <button className="btn-ghost sm" onClick={() => addRow(setSites, { site_name: "", contact_name: "", phone: "", address: "", map_url: "" })}><UIcon name="plus" size={13} /> เพิ่มไซต์งาน</button>
          </div>
          {err && <div className="login-err" style={{ marginTop: 8 }}>{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {busy ? "กำลังบันทึก…" : "บันทึกลูกค้า"}</button>
        </div>
      </div>
    </div>
  );
}
