import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import { listPurchaseOrders, savePurchaseOrder, deletePurchaseOrder, listMaterials, listSuppliers } from "../lib/api";
import { InternalNoteField, InternalNoteTag } from "./InternalNote";
import { fmtBaht, fmtNum, matchText, fmtDocDate } from "../lib/format";
import { can } from "../lib/permissions";
import { MaterialThumb, UIcon } from "../icons";
import DateRangeBar, { inDateRange } from "./DateRangeBar";
import ItemPicker from "./ItemPicker";
import ItemBrowser from "./ItemBrowser";

const STATUS = { open: { th: "รอรับของ", cls: "b-amber" }, received: { th: "รับแล้ว", cls: "b-green" }, cancelled: { th: "ยกเลิก", cls: "b-red" } };
const PO_FILTERS = [{ id: "all", label: "ทั้งหมด" }, { id: "open", label: "รอรับของ" }, { id: "received", label: "รับแล้ว" }, { id: "cancelled", label: "ยกเลิก" }];

function genPoNo() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `PO-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// searchable supplier field — suggests names from the Suppliers register (mig 092), still allows free text
function SupplierPicker({ value, onChange }) {
  const [sups, setSups] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { listSuppliers().then((s) => setSups(s.map((x) => x.name).filter(Boolean))).catch(() => {}); }, []);
  const v = (value || "").trim();
  const matches = (v ? sups.filter((n) => matchText(v, n)) : sups).slice(0, 8);
  return (
    <div style={{ position: "relative" }}>
      <input className="inp" value={value} placeholder="พิมพ์ค้นหาชื่อผู้ขาย…"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && (
        <div className="sup-ac">
          {matches.map((n) => (
            <button type="button" key={n} className="sup-ac-item" onMouseDown={() => { onChange(n); setOpen(false); }}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrders({ role, prefill, onPrefillConsumed, onReceive }) {
  const isAdmin = can(role, "po", "edit");
  const [pos, setPos] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // {po_no, supplier, note, vat, items:[{code,qty,price}]} or null
  const [q, setQ] = React.useState("");
  const [statusF, setStatusF] = React.useState("all");
  const [dateR, setDateR] = React.useState({ from: "", to: "" });

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  const shown = pos.filter((po) => (statusF === "all" || po.status === statusF)
    && inDateRange(po.created_at, dateR)
    && (matchText(q, po.po_no, po.supplier, po.note) || (po.items || []).some((it) => matchText(q, it.material_code, matMap[it.material_code]?.th))));

  async function load() {
    setLoading(true);
    try { const [p, m] = await Promise.all([listPurchaseOrders(), listMaterials()]); setPos(p); setMats(m); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 2800); }

  // open editor prefilled from dashboard reorder
  React.useEffect(() => {
    if (!prefill || !prefill.length || !mats.length) return;
    setEditing({ po_no: genPoNo(), supplier: "", note: "", vat: false,
      items: prefill.map((p) => ({ code: p.code, qty: Number(p.qty) || 1, price: matMap[p.code]?.cost ?? 0 })) });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, mats]);

  function startNew() { setEditing({ po_no: genPoNo(), supplier: "", note: "", internal_note: "", vat: false, items: [] }); }
  function startEdit(po) { setEditing({ _edit: true, po_no: po.po_no, supplier: po.supplier || "", note: po.note || "", internal_note: po.internal_note || "", vat: !!po.vat, items: po.items.map((i) => ({ code: i.material_code, qty: i.qty, price: i.price })) }); }

  const setItem = (code, field, val) => setEditing((e) => ({ ...e, items: e.items.map((x) => x.code === code ? { ...x, [field]: val } : x) }));
  const removeItem = (code) => setEditing((e) => ({ ...e, items: e.items.filter((x) => x.code !== code) }));
  // add from ItemPicker/ItemBrowser (same UX as sales docs) — purchase price defaults to the material cost
  const addLinePO = (m, _target, qty = 1) => setEditing((e) => {
    const add = Math.max(1, Number(qty) || 1);
    const i = e.items.findIndex((x) => x.code === m.code);
    if (i >= 0) { const items = [...e.items]; items[i] = { ...items[i], qty: items[i].qty + add }; return { ...e, items }; }
    return { ...e, items: [...e.items, { code: m.code, qty: add, price: Number(m.cost) || 0 }] };
  });

  const editTotal = editing ? editing.items.reduce((a, x) => a + (Number(x.qty) || 0) * (Number(x.price) || 0), 0) : 0;

  async function save() {
    if (!editing.po_no.trim()) return flash("ใส่เลขใบสั่งซื้อ", true);
    if (!editing.items.length) return flash("เพิ่มวัสดุอย่างน้อย 1 รายการ", true);
    if (editing._edit && !await confirmDialog(`ยืนยันบันทึกการแก้ไขใบสั่งซื้อ ${editing.po_no} ?`)) return;
    try { await savePurchaseOrder({ po_no: editing.po_no.trim(), supplier: editing.supplier, note: editing.note, internal_note: editing.internal_note, vat: editing.vat, status: "open" }, editing.items); flash("บันทึกใบสั่งซื้อแล้ว"); setEditing(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(po) {
    if (!await confirmDialog(`ลบใบสั่งซื้อ ${po.po_no}?`)) return;
    try { await deletePurchaseOrder(po.po_no); flash("ลบใบสั่งซื้อแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  function copyPo(po) {
    const text = `ใบสั่งซื้อ ${po.po_no}${po.supplier ? ` · ${po.supplier}` : ""}\n`
      + po.items.map((it, i) => `${i + 1}. ${matMap[it.material_code]?.th || it.material_code} (${it.material_code}) — ${fmtNum(it.qty)} ${matMap[it.material_code]?.unit || ""} @ ${fmtBaht(it.price)}`).join("\n")
      + `\nรวม ${po.items.length} รายการ · ${po.vat ? `${fmtBaht(po.subtotal)} + VAT 7% ${fmtBaht(po.vatAmt)} = ${fmtBaht(po.total)}` : fmtBaht(po.total)}`;
    const done = () => flash("คัดลอกใบสั่งซื้อแล้ว — ส่งซัพพลายเออร์ได้เลย");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => window.prompt("คัดลอก:", text));
    else window.prompt("คัดลอก:", text);
  }

  // ---------- EDITOR ----------
  if (editing) {
    return (
      <div className="adm">
        <div className="adm-head">
          <div><h1 className="page-title">ใบสั่งซื้อ <span className="page-title-en">Purchase Order</span></h1>
            <p className="page-sub">แก้ไขรายการ/จำนวน/ราคาได้ · บันทึกแล้วคัดลอกส่งซัพพลายเออร์</p></div>
        </div>
        <div className="doc-edit-wrap">
        <div className="card" style={{ flex: 1, maxWidth: 860 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขใบสั่งซื้อ · PO No.</span><input className="inp" value={editing.po_no} onChange={(e) => setEditing({ ...editing, po_no: e.target.value })} /></label>
            <label className="fld"><span>ซัพพลายเออร์ · Supplier</span><SupplierPicker value={editing.supplier} onChange={(v) => setEditing((e) => ({ ...e, supplier: v }))} /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>หมายเหตุ</span><input className="inp" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="(ไม่บังคับ)" /></label>
            <label className="fld"><span>ราคา VAT</span>
              <button type="button" className={"vat-toggle" + (editing.vat ? " on" : "")} onClick={() => setEditing((e) => ({ ...e, vat: !e.vat }))}>
                {editing.vat ? "รวม VAT 7%" : "ไม่รวม VAT"}
              </button></label>
          </div>
          <InternalNoteField value={editing.internal_note} onChange={(v) => setEditing({ ...editing, internal_note: v })} />

          <div className="fld"><span>เพิ่มรายการ (ค้นหาสินค้า/วัสดุ)</span>
            <ItemPicker items={mats} placeholder="ค้นหา รหัส / ชื่อสินค้า หรือกดลูกศร…" onPick={addLinePO} />
            <p className="page-sub" style={{ marginTop: 6 }}>เลือกจากช่องค้นหา หรือเลือกจากแคตตาล็อกด้านขวา → ปรับราคาซื้อ/จำนวนในรายการด้านล่างได้</p>
          </div>

          {editing.items.length > 0 && (
            <div className="line-list">
              {editing.items.map((it) => { const m = matMap[it.code]; return (
                <div className="po-edit-row" key={it.code}>
                  <MaterialThumb mat={m || { color: "#888" }} size={32} radius={8} />
                  <div className="line-info"><div className="line-name">{m?.th || it.code}</div><div className="line-sub">{m?.unit}</div></div>
                  <div className="inp inp-unit po-edit-in"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={it.price} onChange={(e) => setItem(it.code, "price", Number(e.target.value) || 0)} /></div>
                  <div className="inp inp-unit po-edit-in"><input type="number" min="1" value={it.qty} onChange={(e) => setItem(it.code, "qty", Math.max(1, Number(e.target.value) || 1))} /><span className="unit-suf">{m?.unit}</span></div>
                  <span className="po-edit-val">{fmtBaht((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
                  <button className="line-x" onClick={() => removeItem(it.code)}><UIcon name="x" size={14} /></button>
                </div>
              ); })}
              {editing.vat ? (
                <>
                  <div className="line-total" style={{ borderBottom: "1px dashed var(--line-2)" }}><span>ยอดก่อน VAT ({editing.items.length} รายการ)</span><b>{fmtBaht(editTotal)}</b></div>
                  <div className="line-total" style={{ borderBottom: "1px dashed var(--line-2)", color: "var(--ink-3)" }}><span>VAT 7%</span><b>{fmtBaht(editTotal * 0.07)}</b></div>
                  <div className="line-total"><span>ยอดรวมสุทธิ (รวม VAT)</span><b>{fmtBaht(editTotal * 1.07)}</b></div>
                </>
              ) : (
                <div className="line-total"><span>รวม {editing.items.length} รายการ (ไม่รวม VAT)</span><b>{fmtBaht(editTotal)}</b></div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึกใบสั่งซื้อ</button>
          </div>
        </div>
        <ItemBrowser mats={mats} onAdd={addLinePO} />
        </div>
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบสั่งซื้อ <span className="page-title-en">Purchase Orders</span></h1>
          <p className="page-sub">{pos.length} ใบ · สร้าง → ส่งซัพพลายเออร์ → รับสินค้าเข้าสต๊อก</p></div>
        {isAdmin && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบสั่งซื้อ</button>}
      </div>

      <div className="cat-filter" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {PO_FILTERS.map((f) => (
            <button key={f.id} className={"cat-chip" + (statusF === f.id ? " on" : "")} onClick={() => setStatusF(f.id)}
              style={statusF === f.id ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{f.label}</button>
          ))}
          <DateRangeBar value={dateR} onChange={setDateR} />
        </div>
        <div className="cat-search">
          <UIcon name="search" size={17} color="var(--ink-3)" />
          <input placeholder="ค้นหาเลข PO / ร้าน / วัสดุ" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
        </div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && pos.length === 0 && <div className="empty">ยังไม่มีใบสั่งซื้อ</div>}
      {!loading && pos.length > 0 && shown.length === 0 && <div className="empty">ไม่พบใบสั่งซื้อที่ตรงเงื่อนไข</div>}

      <div className="job-cards">
        {shown.map((po) => {
          const st = STATUS[po.status] || STATUS.open;
          return (
            <div className={"card job-card" + (po.status !== "open" ? " closed" : "")} key={po.po_no}>
              <div className="job-card-head" style={{ cursor: "default" }}>
                <div className="job-card-id"><span className="job-no">{po.po_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta">{po.supplier || "ไม่ระบุร้าน"} · {po.items.length} รายการ{po.note ? ` · ${po.note}` : ""}</div>
                <div className="job-card-cost"><span className="doc-date">📅 {fmtDocDate(po.created_at)}</span><span>มูลค่ารวม{po.vat ? " (รวม VAT)" : ""}</span><b>{fmtBaht(po.total)}</b></div>
              </div>
              <InternalNoteTag note={po.internal_note} />
              <div className="job-lines">
                {po.items.map((it) => { const m = matMap[it.material_code]; return (
                  <div className="po-view-row" key={it.material_code}>
                    <span className="po-view-name">{m?.th || it.material_code}</span>
                    <span className="po-view-q">{fmtNum(it.qty)} {m?.unit || ""} × {fmtBaht(it.price)}</span>
                    <span className="po-view-v">{fmtBaht(it.qty * it.price)}</span>
                  </div>
                ); })}
                <div className="job-actions">
                  <button className="btn-ghost sm" onClick={() => copyPo(po)}><UIcon name="catalog" size={14} /> คัดลอกส่งซัพพลายเออร์</button>
                  {po.status === "open" && isAdmin && <>
                    <button className="btn-ghost sm" onClick={() => startEdit(po)}><UIcon name="edit" size={14} /> แก้ไข</button>
                    <button className="btn-primary" onClick={() => onReceive && onReceive(po)}><UIcon name="purchase" size={15} color="#fff" /> รับสินค้าเข้าสต๊อก</button>
                    <button className="btn-ghost sm danger" onClick={() => del(po)}><UIcon name="trash" size={14} /></button>
                  </>}
                  {po.status === "received" && <span className="job-closed-note">รับเข้าสต๊อกแล้ว {po.received_at ? new Date(po.received_at).toLocaleDateString("th-TH") : ""}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600,
      padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center",
    }}>{toast.msg}</div>
  );
}
