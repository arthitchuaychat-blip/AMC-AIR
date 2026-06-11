import React from "react";
import { listCustomers, saveCustomer, deleteCustomer } from "../lib/api";
import { UIcon } from "../icons";

const blankCust = () => ({ id: null, type: "company", name: "", tax_id: "", vat: true, address: "", note: "" });

export default function Customers({ role }) {
  const canEdit = role === "admin" || role === "sales";
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // {cust, contacts[], sites[]}

  async function load() {
    setLoading(true);
    try { setList(await listCustomers()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const ql = q.trim().toLowerCase();
  const shown = list.filter((c) => !ql || c.name.toLowerCase().includes(ql) || (c.tax_id || "").includes(q.trim())
    || c.contacts.some((ct) => (ct.phone || "").includes(q.trim())));

  function startNew() { setEditing({ cust: blankCust(), contacts: [{ name: "", phone: "", role: "" }], sites: [{ site_name: "", address: "", map_url: "" }] }); }
  function startEdit(c) {
    setEditing({
      cust: { id: c.id, type: c.type, name: c.name, tax_id: c.tax_id || "", vat: c.vat, address: c.address || "", note: c.note || "" },
      contacts: c.contacts.length ? c.contacts.map((x) => ({ name: x.name || "", phone: x.phone || "", role: x.role || "" })) : [{ name: "", phone: "", role: "" }],
      sites: c.sites.length ? c.sites.map((x) => ({ site_name: x.site_name || "", address: x.address || "", map_url: x.map_url || "" })) : [{ site_name: "", address: "", map_url: "" }],
    });
  }
  const setCust = (k, v) => setEditing((e) => ({ ...e, cust: { ...e.cust, [k]: v } }));
  const setRow = (key, i, k, v) => setEditing((e) => ({ ...e, [key]: e[key].map((r, j) => j === i ? { ...r, [k]: v } : r) }));
  const addRow = (key, blank) => setEditing((e) => ({ ...e, [key]: [...e[key], blank] }));
  const delRow = (key, i) => setEditing((e) => ({ ...e, [key]: e[key].filter((_, j) => j !== i) }));

  async function save() {
    if (!editing.cust.name.trim()) return flash("ใส่ชื่อลูกค้า", true);
    if (editing.cust.id && !window.confirm(`ยืนยันบันทึกการแก้ไขลูกค้า "${editing.cust.name}" ?`)) return;
    try { await saveCustomer(editing.cust, editing.contacts, editing.sites); flash("บันทึกลูกค้าแล้ว"); setEditing(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(c) {
    if (!confirm(`ลบลูกค้า "${c.name}"? (ลบใบเสนอราคา/งานที่อ้างถึงไม่ได้ถ้ามี)`)) return;
    try { await deleteCustomer(c.id); flash("ลบลูกค้าแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ — อาจมีใบเสนอราคา/งานผูกอยู่", true); }
  }

  // ---------- EDITOR ----------
  if (editing) {
    const e = editing;
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">ลูกค้า <span className="page-title-en">Customer</span></h1>
          <p className="page-sub">ข้อมูลลูกค้า · ผู้ติดต่อหลายคน · ไซต์งานหลายที่</p></div></div>
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="sub-toggle" style={{ maxWidth: 320 }}>
            <button className={e.cust.type === "company" ? "on" : ""} onClick={() => setCust("type", "company")}>นิติบุคคล</button>
            <button className={e.cust.type === "person" ? "on" : ""} onClick={() => setCust("type", "person")}>บุคคลธรรมดา</button>
          </div>
          <label className="fld"><span>ชื่อลูกค้า *</span><input className="inp" value={e.cust.name} onChange={(ev) => setCust("name", ev.target.value)} placeholder={e.cust.type === "company" ? "เช่น บริษัท ... จำกัด" : "ชื่อ-นามสกุล"} /></label>
          <div className="fld-row">
            <label className="fld"><span>เลขผู้เสียภาษี</span><input className="inp" value={e.cust.tax_id} onChange={(ev) => setCust("tax_id", ev.target.value)} placeholder="13 หลัก" /></label>
            <label className="fld"><span>ภาษีมูลค่าเพิ่ม</span>
              <button type="button" className={"vat-toggle" + (e.cust.vat ? " on" : "")} onClick={() => setCust("vat", !e.cust.vat)}>
                {e.cust.vat ? "คิด VAT 7%" : "ไม่คิด VAT"}
              </button>
            </label>
          </div>
          <label className="fld"><span>ที่อยู่หลัก</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={e.cust.address} onChange={(ev) => setCust("address", ev.target.value)} /></label>

          <div className="fld"><span>ผู้ติดต่อ (เพิ่มได้หลายคน)</span>
            {e.contacts.map((c, i) => (
              <div className="crm-row" key={i}>
                <input className="inp" value={c.name} onChange={(ev) => setRow("contacts", i, "name", ev.target.value)} placeholder="ชื่อผู้ติดต่อ" />
                <input className="inp" value={c.phone} onChange={(ev) => setRow("contacts", i, "phone", ev.target.value)} placeholder="เบอร์โทร" />
                <input className="inp" value={c.role} onChange={(ev) => setRow("contacts", i, "role", ev.target.value)} placeholder="ตำแหน่ง" />
                <button className="line-x" onClick={() => delRow("contacts", i)}><UIcon name="x" size={14} /></button>
              </div>
            ))}
            <button className="btn-ghost sm" onClick={() => addRow("contacts", { name: "", phone: "", role: "" })}><UIcon name="plus" size={13} /> เพิ่มผู้ติดต่อ</button>
          </div>

          <div className="fld"><span>ที่อยู่ให้บริการ / ไซต์งาน (เพิ่มได้หลายที่)</span>
            {e.sites.map((s, i) => (
              <div className="crm-site" key={i}>
                <div className="crm-row">
                  <input className="inp" value={s.site_name} onChange={(ev) => setRow("sites", i, "site_name", ev.target.value)} placeholder="ชื่อไซต์ (เช่น สาขาลาดพร้าว)" />
                  <input className="inp" value={s.map_url} onChange={(ev) => setRow("sites", i, "map_url", ev.target.value)} placeholder="ลิงก์ Google Maps" />
                  <button className="line-x" onClick={() => delRow("sites", i)}><UIcon name="x" size={14} /></button>
                </div>
                <input className="inp" value={s.address} onChange={(ev) => setRow("sites", i, "address", ev.target.value)} placeholder="ที่อยู่ไซต์งาน" />
              </div>
            ))}
            <button className="btn-ghost sm" onClick={() => addRow("sites", { site_name: "", address: "", map_url: "" })}><UIcon name="plus" size={13} /> เพิ่มไซต์งาน</button>
          </div>

          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={e.cust.note} onChange={(ev) => setCust("note", ev.target.value)} placeholder="(ไม่บังคับ)" /></label>

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึกลูกค้า</button>
          </div>
        </div>
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ลูกค้า <span className="page-title-en">Customers (CRM)</span></h1><p className="page-sub">{list.length} ราย</p></div>
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาชื่อ / เลขภาษี / เบอร์" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มลูกค้า</button>}
        </div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{q ? `ไม่พบลูกค้า “${q}”` : "ยังไม่มีลูกค้า"}</div>}

      <div className="cat-grid">
        {shown.map((c) => (
          <div className="cat-card" key={c.id}>
            <div className="cat-card-top">
              <div><div className="cat-card-name">{c.name}</div>
                <div className="cat-card-en">{c.type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}{c.tax_id ? ` · ${c.tax_id}` : ""}</div></div>
              <span className={"job-badge " + (c.vat ? "open" : "closed")}>{c.vat ? "VAT" : "ไม่ VAT"}</span>
            </div>
            {c.address && <div className="cat-card-desc">{c.address}</div>}
            <div className="crm-meta">
              {c.contacts[0] && <div>📞 {c.contacts[0].name || ""} {c.contacts[0].phone || ""}{c.contacts.length > 1 ? ` +${c.contacts.length - 1}` : ""}</div>}
              {c.sites.length > 0 && <div>📍 {c.sites.length} ไซต์งาน</div>}
            </div>
            {canEdit && (
              <div className="cat-card-actions">
                <button className="btn-ghost sm" onClick={() => startEdit(c)}><UIcon name="edit" size={14} /> แก้ไข</button>
                <button className="btn-ghost sm danger" onClick={() => del(c)}><UIcon name="trash" size={14} /> ลบ</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
