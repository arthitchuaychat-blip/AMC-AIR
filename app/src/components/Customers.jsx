import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listCustomers, saveCustomer, deleteCustomer, listCustomerDocs } from "../lib/api";
import { UIcon } from "../icons";
import { custCode, fmtBaht, matchText, matchPhone } from "../lib/format";
import { can } from "../lib/permissions";
import { scheduleLabel } from "../lib/schedule";
import { TYPE_LABEL, DOC_FILTERS, stOf } from "../lib/docmeta";
import CustomerImportModal from "./CustomerImportModal";

const blankCust = () => ({ id: null, type: "company", name: "", tax_id: "", vat: true, address: "", note: "" });
// สีไล่ต่อไซต์ เพื่อแยกกล่องไซต์ให้เห็นง่าย ไม่ตาลาย
const SITE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626"];

export default function Customers({ role, onOpenDoc, focus, onFocusConsumed }) {
  const canEdit = can(role, "customers", "edit");
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // {cust, contacts[], sites[]}
  const [viewing, setViewing] = React.useState(null); // customer being viewed (detail)
  const [viewDocs, setViewDocs] = React.useState([]);
  const [loadingDocs, setLoadingDocs] = React.useState(false);
  const [docF, setDocF] = React.useState("all");
  const [siteF, setSiteF] = React.useState("all"); // filter doc history by site
  const [importing, setImporting] = React.useState(false);
  const [viewMode, setViewMode] = React.useState("grid"); // grid | list
  const [vatF, setVatF] = React.useState("all"); // all | vat | novat

  async function load() {
    setLoading(true);
    try { setList(await listCustomers()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // prefill search when opened from another page (e.g. "เปิดหน้าลูกค้า" in chat)
  React.useEffect(() => { if (focus) { setQ(focus); onFocusConsumed && onFocusConsumed(); } }, [focus]);
  // load this customer's documents + jobs whenever the detail modal opens
  React.useEffect(() => {
    if (!viewing) { setViewDocs([]); return; }
    setDocF("all"); setSiteF("all"); setLoadingDocs(true);
    listCustomerDocs(viewing.id).then(setViewDocs).catch(() => setViewDocs([])).finally(() => setLoadingDocs(false));
  }, [viewing]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const shown = list.filter((c) => {
    if (!(vatF === "all" || (vatF === "vat" ? c.vat : !c.vat))) return false;
    const cs = c.contacts || [], si = c.sites || [];
    return matchText(q, c.name, c.tax_id, c.address, ...cs.map((x) => x.name), ...si.map((s) => s.contact_name), ...si.map((s) => s.address))
      || matchPhone(q, c.tax_id, ...cs.map((x) => x.phone), ...si.map((s) => s.phone));
  });

  function startNew() { setEditing({ cust: blankCust(), contacts: [{ name: "", phone: "", role: "" }], sites: [{ site_name: "", contact_name: "", phone: "", address: "", map_url: "" }] }); }
  function startEdit(c) {
    setEditing({
      cust: { id: c.id, type: c.type, name: c.name, tax_id: c.tax_id || "", vat: c.vat, address: c.address || "", note: c.note || "" },
      contacts: c.contacts.length ? c.contacts.map((x) => ({ name: x.name || "", phone: x.phone || "", role: x.role || "" })) : [{ name: "", phone: "", role: "" }],
      sites: c.sites.length ? c.sites.map((x) => ({ site_name: x.site_name || "", contact_name: x.contact_name || "", phone: x.phone || "", address: x.address || "", map_url: x.map_url || "" })) : [{ site_name: "", contact_name: "", phone: "", address: "", map_url: "" }],
    });
  }
  const setCust = (k, v) => setEditing((e) => ({ ...e, cust: { ...e.cust, [k]: v } }));
  const setRow = (key, i, k, v) => setEditing((e) => ({ ...e, [key]: e[key].map((r, j) => j === i ? { ...r, [k]: v } : r) }));
  const addRow = (key, blank) => setEditing((e) => ({ ...e, [key]: [...e[key], blank] }));
  const delRow = (key, i) => setEditing((e) => ({ ...e, [key]: e[key].filter((_, j) => j !== i) }));

  async function save() {
    if (!editing.cust.name.trim()) return flash("ใส่ชื่อลูกค้า", true);
    if (editing.cust.id && !await confirmDialog(`ยืนยันบันทึกการแก้ไขลูกค้า "${editing.cust.name}" ?`)) return;
    try { await saveCustomer(editing.cust, editing.contacts, editing.sites); flash("บันทึกลูกค้าแล้ว"); setEditing(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(c) {
    if (!await confirmDialog(`ลบลูกค้า "${c.name}"? (ลบใบเสนอราคา/งานที่อ้างถึงไม่ได้ถ้ามี)`)) return;
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
          <div className="fld-row">
            <label className="fld"><span>ชื่อลูกค้า *</span><input className="inp" value={e.cust.name} onChange={(ev) => setCust("name", ev.target.value)} placeholder={e.cust.type === "company" ? "เช่น บริษัท ... จำกัด" : "ชื่อ-นามสกุล"} /></label>
            <label className="fld"><span>รหัสลูกค้า (อัตโนมัติ)</span><input className="inp" value={e.cust.id ? custCode(e.cust.id) : "สร้างอัตโนมัติเมื่อบันทึก"} disabled style={{ maxWidth: 220 }} /></label>
          </div>
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

          <div className="fld"><span>ไซต์งาน / สถานที่ให้บริการ (เพิ่มได้หลายที่)</span>
            {e.sites.map((s, i) => {
              const col = SITE_COLORS[i % SITE_COLORS.length];
              return (
                <div className="crm-site" key={i} style={{ borderLeftColor: col, background: col + "24" }}>
                  <div className="crm-site-head">
                    <span className="crm-site-badge" style={{ background: col }}>📍 ไซต์ {i + 1}{s.site_name ? " · " + s.site_name : ""}</span>
                    <button className="line-x" onClick={() => delRow("sites", i)}><UIcon name="x" size={14} /></button>
                  </div>
                  <div className="crm-row">
                    <input className="inp" value={s.site_name} onChange={(ev) => setRow("sites", i, "site_name", ev.target.value)} placeholder="ชื่อไซต์ (เช่น สาขาลาดพร้าว)" />
                    <input className="inp" value={s.map_url} onChange={(ev) => setRow("sites", i, "map_url", ev.target.value)} placeholder="ลิงก์ Google Maps" />
                  </div>
                  <div className="crm-row">
                    <input className="inp" value={s.contact_name} onChange={(ev) => setRow("sites", i, "contact_name", ev.target.value)} placeholder="👤 ชื่อผู้ติดต่อ (ไซต์นี้)" />
                    <input className="inp" value={s.phone} onChange={(ev) => setRow("sites", i, "phone", ev.target.value)} placeholder="📞 เบอร์โทร (ไซต์นี้)" />
                  </div>
                  <input className="inp" value={s.address} onChange={(ev) => setRow("sites", i, "address", ev.target.value)} placeholder="ที่อยู่ไซต์งาน" />
                </div>
              );
            })}
            <button className="btn-ghost sm" onClick={() => addRow("sites", { site_name: "", contact_name: "", phone: "", address: "", map_url: "" })}><UIcon name="plus" size={13} /> เพิ่มไซต์งาน</button>
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
          <div className="seg view-seg">
            <button className={"seg-btn" + (viewMode === "grid" ? " on" : "")} onClick={() => setViewMode("grid")} title="กริด"><UIcon name="dashboard" size={16} /></button>
            <button className={"seg-btn" + (viewMode === "list" ? " on" : "")} onClick={() => setViewMode("list")} title="แถว"><UIcon name="catalog" size={16} /></button>
          </div>
          {canEdit && <button className="btn-ghost" onClick={() => setImporting(true)}><UIcon name="box" size={15} /> นำเข้าหลายราย</button>}
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มลูกค้า</button>}
        </div>
      </div>

      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ["vat", "VAT"], ["novat", "ไม่ VAT"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (vatF === v ? " on" : "")} onClick={() => setVatF(v)}
            style={vatF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>

      {importing && <CustomerImportModal onClose={() => setImporting(false)}
        onDone={(n, failed) => { setImporting(false); flash(failed ? `นำเข้า ${n} ราย · ล้มเหลว ${failed} ราย` : `นำเข้าลูกค้า ${n} ราย สำเร็จ`, !!failed); load(); }} />}

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{q ? `ไม่พบลูกค้า “${q}”` : "ยังไม่มีลูกค้า"}</div>}

      {viewMode === "grid" && (
      <div className="cat-grid">
        {shown.map((c) => (
          <div className="cat-card clickable-card" key={c.id} onClick={() => setViewing(c)}
            role="button" tabIndex={0} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && setViewing(c)}>
            <div className="cat-card-top">
              <div><div className="cat-card-name">{c.name}</div>
                <div className="cat-card-en"><b className="cust-code">{custCode(c.id)}</b> · {c.type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}{c.tax_id ? ` · ${c.tax_id}` : ""}</div></div>
              <span className={"job-badge " + (c.vat ? "b-blue" : "b-grey")}>{c.vat ? "VAT" : "ไม่ VAT"}</span>
            </div>
            {c.address && <div className="cat-card-desc">{c.address}</div>}
            <div className="crm-meta">
              {c.contacts[0] && <div>📞 {c.contacts[0].name || ""} {c.contacts[0].phone || ""}{c.contacts.length > 1 ? ` +${c.contacts.length - 1}` : ""}</div>}
              {c.sites.length > 0 && <div>📍 {c.sites.length} ไซต์งาน</div>}
            </div>
            <div className="cat-card-move">ดูรายละเอียด <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
          </div>
        ))}
      </div>
      )}

      {viewMode === "list" && (
      <div className="cat-list">
        {shown.map((c) => (
          <div className="cat-lrow" key={c.id} onClick={() => setViewing(c)}>
            <div className="cat-lrow-main">
              <div className="cat-lrow-name">{c.name} <span className={"job-badge " + (c.vat ? "b-blue" : "b-grey")}>{c.vat ? "VAT" : "ไม่ VAT"}</span></div>
              <div className="cat-lrow-sub"><span className="code-chip">{custCode(c.id)}</span> {c.type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}{c.tax_id ? ` · ${c.tax_id}` : ""}</div>
            </div>
            <div className="cat-lrow-col hide-sm"><span>ผู้ติดต่อ</span><b>{c.contacts[0]?.phone || "—"}</b></div>
            <div className="cat-lrow-col"><span>ไซต์งาน</span><b>{c.sites.length}</b></div>
            <UIcon name="chevR" size={16} color="var(--ink-3)" strokeWidth={2} />
          </div>
        ))}
      </div>
      )}

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()} style={{ width: 820, maxWidth: "95vw" }}>
            <div className="modal-head">
              <div className="modal-title">{viewing.name} <span>{custCode(viewing.id)} · {viewing.vat ? "VAT" : "ไม่ VAT"}</span></div>
              <button className="drawer-close" onClick={() => setViewing(null)}><UIcon name="x" size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="cd-grid">
                <div className="cd-k">รหัสลูกค้า</div><div className="cd-v">{custCode(viewing.id)}</div>
                <div className="cd-k">ประเภท</div><div className="cd-v">{viewing.type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}</div>
                <div className="cd-k">เลขผู้เสียภาษี</div><div className="cd-v">{viewing.tax_id || "—"}</div>
                <div className="cd-k">ภาษี</div><div className="cd-v">{viewing.vat ? "คิด VAT 7%" : "ไม่คิด VAT"}</div>
                <div className="cd-k">ที่อยู่หลัก</div><div className="cd-v">{viewing.address || "—"}</div>
                {viewing.note && <><div className="cd-k">หมายเหตุ</div><div className="cd-v">{viewing.note}</div></>}
              </div>

              <div className="cd-sec">ผู้ติดต่อ ({viewing.contacts.length})</div>
              {viewing.contacts.length === 0 && <div className="cd-empty">— ไม่มี —</div>}
              {viewing.contacts.map((ct, i) => (
                <div className="cd-row" key={i}>
                  <span>👤 {ct.name || "ผู้ติดต่อ"}{ct.role ? ` · ${ct.role}` : ""}</span>
                  {ct.phone && <a href={`tel:${ct.phone}`} className="cd-tel">📞 {ct.phone}</a>}
                </div>
              ))}

              <div className="cd-sec">ไซต์งาน ({viewing.sites.length})</div>
              {viewing.sites.length === 0 && <div className="cd-empty">— ไม่มี —</div>}
              {viewing.sites.map((s, i) => {
                const col = SITE_COLORS[i % SITE_COLORS.length];
                return (
                  <div className="cd-site" key={i} style={{ borderLeft: `3px solid ${col}`, background: col + "24", paddingLeft: 9, borderRadius: 8 }}>
                    <div className="cd-site-top"><span>📍 {s.site_name || `ไซต์ ${i + 1}`}</span>
                      {s.map_url && <a href={s.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm">แผนที่</a>}</div>
                    {(s.contact_name || s.phone) && <div className="cd-row" style={{ padding: "2px 0" }}>
                      <span>👤 {s.contact_name || "—"}</span>
                      {s.phone && <a href={`tel:${s.phone}`} className="cd-tel">📞 {s.phone}</a>}
                    </div>}
                    {s.address && <div className="cd-site-addr">{s.address}</div>}
                  </div>
                );
              })}

              {(() => {
                const bySite = viewDocs.filter((e) => siteF === "all" || String(e.site_id) === siteF);
                const shownDocs = bySite.filter((e) => docF === "all" || e.type === docF);
                const count = (t) => bySite.filter((e) => e.type === t).length;
                return (<>
                  <div className="cd-sec">ประวัติเอกสาร &amp; งาน ({bySite.length} รายการ)</div>
                  {viewing.sites.length > 1 && (
                    <Combo className="inp" value={siteF} onChange={(ev) => setSiteF(ev.target.value)} style={{ fontSize: 13, marginBottom: 8 }}>
                      <option value="all">📍 ทุกไซต์ ({viewDocs.length})</option>
                      {viewing.sites.map((s, i) => {
                        const cnt = viewDocs.filter((d) => String(d.site_id) === String(s.id)).length;
                        return <option key={s.id} value={String(s.id)}>📍 {s.site_name || `ไซต์ ${i + 1}`} ({cnt})</option>;
                      })}
                    </Combo>
                  )}
                  <div className="cd-docfilter">
                    {DOC_FILTERS.map(([v, l]) => (
                      <button key={v} className={"cat-chip" + (docF === v ? " on" : "")} onClick={() => setDocF(v)}
                        style={docF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}{v !== "all" && count(v) ? ` (${count(v)})` : ""}</button>
                    ))}
                  </div>
                  {loadingDocs && <div className="cd-empty">กำลังโหลด…</div>}
                  {!loadingDocs && shownDocs.length === 0 && <div className="cd-empty">— ไม่มีรายการ —</div>}
                  <div className="cd-timeline">
                    {shownDocs.map((e) => {
                      const st = stOf(e);
                      const dateTxt = e.type === "job" && e.scheduled_at ? scheduleLabel(e)
                        : (e.date ? new Date(e.date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—");
                      return (
                        <button className="cd-job" key={e.type + e.no} onClick={() => { const t = e.type, n = e.no; setViewing(null); onOpenDoc && onOpenDoc(t, n); }}>
                          <span className={"cd-job-dot " + st[1]} />
                          <div className="cd-job-body">
                            <div className="cd-job-top"><b><span className={"doc-tag dl-" + e.type}>{TYPE_LABEL[e.type]}</span>{e.title || ""}</b><span className={"job-badge " + st[1]}>{st[0]}</span></div>
                            <div className="cd-job-meta">🗓 {dateTxt}{e.teamName ? ` · 👷 ${e.teamName}` : ""}{e.amount != null ? ` · ${fmtBaht(e.amount)}` : ""}</div>
                            <div className="cd-job-no">{e.no} · ดูรายละเอียด ›</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>);
              })()}
            </div>
            <div className="modal-foot">
              {canEdit && <button className="btn-ghost danger" style={{ marginRight: "auto" }} onClick={() => { const c = viewing; setViewing(null); del(c); }}><UIcon name="trash" size={15} /> ลบ</button>}
              {canEdit && <button className="btn-primary" onClick={() => { const c = viewing; setViewing(null); startEdit(c); }}><UIcon name="edit" size={15} color="#fff" /> แก้ไข</button>}
            </div>
          </div>
        </div>
      )}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
