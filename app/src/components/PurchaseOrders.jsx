import React from "react";
import { listPurchaseOrders, savePurchaseOrder, deletePurchaseOrder, listMaterials } from "../lib/api";
import { fmtBaht, fmtNum } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";
import ItemPicker from "./ItemPicker";

const STATUS = { open: { th: "รอรับของ", cls: "open" }, received: { th: "รับแล้ว", cls: "closed" }, cancelled: { th: "ยกเลิก", cls: "closed" } };

function genPoNo() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `PO-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export default function PurchaseOrders({ role, prefill, onPrefillConsumed, onReceive }) {
  const isAdmin = role === "admin" || role === "exec";
  const [pos, setPos] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // {po_no, supplier, note, items:[{code,qty,price}]} or null
  const [pick, setPick] = React.useState({ code: "", qty: 1, price: "" });

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

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
    setEditing({ po_no: genPoNo(), supplier: "", note: "",
      items: prefill.map((p) => ({ code: p.code, qty: Number(p.qty) || 1, price: matMap[p.code]?.cost ?? 0 })) });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, mats]);

  function startNew() { setEditing({ po_no: genPoNo(), supplier: "", note: "", items: [] }); }
  function startEdit(po) { setEditing({ _edit: true, po_no: po.po_no, supplier: po.supplier || "", note: po.note || "", items: po.items.map((i) => ({ code: i.material_code, qty: i.qty, price: i.price })) }); }

  function addItem() {
    if (!pick.code || pick.qty < 1) return;
    setEditing((e) => {
      const i = e.items.findIndex((x) => x.code === pick.code);
      const price = pick.price === "" ? (matMap[pick.code]?.cost ?? 0) : Number(pick.price);
      const items = [...e.items];
      if (i >= 0) items[i] = { ...items[i], qty: items[i].qty + Number(pick.qty), price };
      else items.push({ code: pick.code, qty: Number(pick.qty), price });
      return { ...e, items };
    });
    setPick({ code: pick.code, qty: 1, price: "" });
  }
  const setItem = (code, field, val) => setEditing((e) => ({ ...e, items: e.items.map((x) => x.code === code ? { ...x, [field]: val } : x) }));
  const removeItem = (code) => setEditing((e) => ({ ...e, items: e.items.filter((x) => x.code !== code) }));

  const editTotal = editing ? editing.items.reduce((a, x) => a + (Number(x.qty) || 0) * (Number(x.price) || 0), 0) : 0;

  async function save() {
    if (!editing.po_no.trim()) return flash("ใส่เลขใบสั่งซื้อ", true);
    if (!editing.items.length) return flash("เพิ่มวัสดุอย่างน้อย 1 รายการ", true);
    if (editing._edit && !window.confirm(`ยืนยันบันทึกการแก้ไขใบสั่งซื้อ ${editing.po_no} ?`)) return;
    try { await savePurchaseOrder({ po_no: editing.po_no.trim(), supplier: editing.supplier, note: editing.note, status: "open" }, editing.items); flash("บันทึกใบสั่งซื้อแล้ว"); setEditing(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(po) {
    if (!confirm(`ลบใบสั่งซื้อ ${po.po_no}?`)) return;
    try { await deletePurchaseOrder(po.po_no); flash("ลบใบสั่งซื้อแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  function copyPo(po) {
    const text = `ใบสั่งซื้อ ${po.po_no}${po.supplier ? ` · ${po.supplier}` : ""}\n`
      + po.items.map((it, i) => `${i + 1}. ${matMap[it.material_code]?.th || it.material_code} (${it.material_code}) — ${fmtNum(it.qty)} ${matMap[it.material_code]?.unit || ""} @ ${fmtBaht(it.price)}`).join("\n")
      + `\nรวม ${po.items.length} รายการ · ${fmtBaht(po.total)}`;
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
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขใบสั่งซื้อ · PO No.</span><input className="inp" value={editing.po_no} onChange={(e) => setEditing({ ...editing, po_no: e.target.value })} /></label>
            <label className="fld"><span>ซัพพลายเออร์ · Supplier</span><input className="inp" value={editing.supplier} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} placeholder="ชื่อร้าน/ผู้ขาย" /></label>
          </div>
          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="(ไม่บังคับ)" /></label>

          <div className="fld"><span>เพิ่มรายการวัสดุ</span>
            <ItemPicker items={mats.filter((m) => m.tracked)} placeholder="ค้นหาวัสดุ หรือกดลูกศรเพื่อเลือก…"
              onPick={(m) => setEditing((e) => {
                const i = e.items.findIndex((x) => x.code === m.code);
                if (i >= 0) { const items = [...e.items]; items[i] = { ...items[i], qty: items[i].qty + 1 }; return { ...e, items }; }
                return { ...e, items: [...e.items, { code: m.code, qty: 1, price: m.cost }] };
              })} />
            <p className="page-sub" style={{ marginTop: 6 }}>เลือกแล้วปรับจำนวน/ราคาได้ในรายการด้านล่าง</p>
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
              <div className="line-total"><span>รวม {editing.items.length} รายการ</span><b>{fmtBaht(editTotal)}</b></div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึกใบสั่งซื้อ</button>
          </div>
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

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && pos.length === 0 && <div className="empty">ยังไม่มีใบสั่งซื้อ</div>}

      <div className="job-cards">
        {pos.map((po) => {
          const st = STATUS[po.status] || STATUS.open;
          return (
            <div className={"card job-card" + (po.status !== "open" ? " closed" : "")} key={po.po_no}>
              <div className="job-card-head" style={{ cursor: "default" }}>
                <div className="job-card-id"><span className="job-no">{po.po_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta">{po.supplier || "ไม่ระบุร้าน"} · {po.items.length} รายการ{po.note ? ` · ${po.note}` : ""}</div>
                <div className="job-card-cost"><span>มูลค่ารวม</span><b>{fmtBaht(po.total)}</b></div>
              </div>
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
