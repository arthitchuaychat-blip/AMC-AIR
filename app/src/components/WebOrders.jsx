import React from "react";
import { listWebOrders, setWebOrderStatus, setWebOrderCustomer, setWebOrderBoq } from "../lib/api";
import { fmtBaht } from "../lib/format";
import { can } from "../lib/permissions";
import CustomerFormModal from "./CustomerFormModal";

const STATUS = [
  ["new", "ใหม่", "#dc2626", "#fee2e2"],
  ["contacted", "ติดต่อแล้ว", "#d97706", "#fef3c7"],
  ["quoted", "เสนอราคาแล้ว", "#1d4ed8", "#dbeafe"],
  ["done", "ปิดการขาย", "#059669", "#dcf5e8"],
  ["cancelled", "ยกเลิก", "#64748b", "#f1f5f9"],
];
const ST = Object.fromEntries(STATUS.map((s) => [s[0], s]));
const thDateTime = (s) => { try { return new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };

export default function WebOrders({ role, onCreateBoq, onOpenCustomer }) {
  const [rows, setRows] = React.useState(null);
  const [custForm, setCustForm] = React.useState(null);   // { order, initial } → เปิดฟอร์มลูกค้าที่เติมข้อมูลจากใบนี้ให้แล้ว
  const [statusF, setStatusF] = React.useState("all");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };

  async function load() {
    try { setRows(await listWebOrders()); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน 071_website.sql แล้วหรือยัง?)", true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);
  // บันทึกลูกค้าเสร็จ → ผูกกลับเข้าใบคำสั่งซื้อทันที ไม่ต้องให้คนมากดผูกเอง
  async function onCustSaved(cid) {
    const o = custForm?.order;
    setCustForm(null);
    if (!o) return;
    try { await setWebOrderCustomer(o.id, cid); setRows((rs) => rs.map((x) => x.id === o.id ? { ...x, customer_id: cid } : x)); flash("ผูกลูกค้าเข้าคำสั่งซื้อแล้ว ✓"); }
    catch (e) { flash("สร้างลูกค้าแล้ว แต่ผูกกลับไม่สำเร็จ: " + (e.message || e), true); }
  }

  // ลูกค้ากรอกหมุดมาในโน้ตในรูป "📍 หมุด: <url>" (company-website) — แยกออกมาใส่ช่องแผนที่ของไซต์
  function splitPin(note) {
    const m = String(note || "").match(/📍\s*หมุด:\s*(\S+)/);
    return { mapUrl: m ? m[1] : "", rest: String(note || "").replace(/📍\s*หมุด:\s*\S+/, "").trim() };
  }
  function openCustForm(o) {
    const { mapUrl, rest } = splitPin(o.note);
    setCustForm({ order: o, initial: {
      type: "person", name: o.name || "", address: o.address || "", email: o.email || "",
      note: ["ลูกค้าจากเว็บไซต์", rest].filter(Boolean).join(" · "),
      contacts: [{ name: o.name || "", phone: o.phone || "", role: "" }],
      sites: [{ site_name: "", contact_name: o.name || "", phone: o.phone || "", address: o.address || "", map_url: mapUrl }],
    } });
  }
  // ⚠️ ส่งไปแค่ "รหัสสินค้า + จำนวน" — ห้ามส่งราคาจากเว็บ นั่นคือ "ราคาขาย"
  //    ถ้าเอาไปใส่ช่องต้นทุนของ BOQ ต้นทุนจะเท่าราคาขาย กำไรทั้งสายเอกสารกลายเป็น ~0 หรือติดลบ
  //    ให้หน้า BOQ ไปหาต้นทุนจริงจากตารางสินค้าเอง
  function toBoq(o) {
    if (!o.customer_id) return flash("ผูกลูกค้าก่อน — กด “สร้างลูกค้าจากใบนี้”", true);
    onCreateBoq && onCreateBoq({
      customerId: o.customer_id, orderId: o.id, title: `คำสั่งซื้อจากเว็บ #${o.id}`,
      items: (o.items || []).map((it) => ({ code: it.code || it.material_code || null, name: it.name || "", qty: Number(it.qty) || 1 })),
    });
  }

  async function changeStatus(o, status) {
    try { await setWebOrderStatus(o.id, status); setRows((rs) => rs.map((x) => x.id === o.id ? { ...x, status } : x)); }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
  }

  const counts = React.useMemo(() => {
    const c = {}; (rows || []).forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; }); return c;
  }, [rows]);
  const shown = (rows || []).filter((o) => statusF === "all" || o.status === statusF);

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">คำสั่งซื้อจากเว็บ <span className="page-title-en">Web Orders</span></h1>
          <p className="page-sub">คำสั่งซื้อ/ขอใบเสนอราคา ที่ส่งเข้ามาจากเว็บไซต์ · จัดการรูป/เนื้อหาเว็บที่เมนู “จัดการเว็บไซต์”</p></div>
        <div className="cat-head-actions" style={{ gap: 8 }}>
          <button className="btn-ghost sm" onClick={load}>🔄 รีเฟรช</button>
        </div>
      </div>

      <div className="cat-filter" style={{ marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className={"cat-chip" + (statusF === "all" ? " on" : "")} onClick={() => setStatusF("all")}>ทั้งหมด ({rows?.length || 0})</button>
        {STATUS.map(([v, l, c]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: c, color: "#fff", borderColor: c } : {}}>{l}{counts[v] ? ` (${counts[v]})` : ""}</button>
        ))}
      </div>

      {rows === null ? <div className="empty">กำลังโหลด…</div>
        : shown.length === 0 ? <div className="empty" style={{ padding: 40 }}>{statusF === "all" ? "ยังไม่มีคำสั่งซื้อจากเว็บ" : "ไม่มีรายการในสถานะนี้"}</div>
        : (
          <div className="wo-list">
            {shown.map((o) => { const st = ST[o.status] || ST.new; const items = Array.isArray(o.items) ? o.items : []; return (
              <div key={o.id} className="wo-card card">
                <div className="wo-head">
                  <span className="wo-badge" style={{ color: st[2], background: st[3] }}>{st[1]}</span>
                  <b className="wo-name">{o.name}</b>
                  <a className="wo-phone" href={`tel:${o.phone}`}>📞 {o.phone}</a>
                  <span className="wo-time">{thDateTime(o.created_at)}</span>
                </div>
                {(o.address || o.note) && (
                  <div className="wo-meta">
                    {o.address && <div>📍 {o.address}</div>}
                    {o.email && <div>✉️ {o.email}</div>}
                    {o.note && <div>📝 {o.note}</div>}
                  </div>
                )}
                {items.length > 0 && (
                  <div className="wo-items">
                    {items.map((it, i) => (
                      <div className="wo-item" key={i}>
                        <span>{it.name}</span>
                        <span className="wo-item-qty">× {it.qty}</span>
                        <span className="wo-item-pr">{it.price ? fmtBaht(it.price * it.qty) : "สอบถาม"}</span>
                      </div>
                    ))}
                    <div className="wo-total"><span>รวมโดยประมาณ</span><b>{fmtBaht(o.total)}</b></div>
                  </div>
                )}
                <div className="wo-acts" style={{ borderBottom: "1px dashed var(--line-2)", paddingBottom: 8, marginBottom: 8 }}>
                  {!o.customer_id && can(role, "customers", "edit") && (
                    <button className="btn-primary sm" onClick={() => openCustForm(o)}>➕ สร้างลูกค้าจากใบนี้</button>
                  )}
                  {o.customer_id && (<>
                    <span className="vat-badge vat-on" style={{ cursor: onOpenCustomer ? "pointer" : "default" }} onClick={() => onOpenCustomer && onOpenCustomer(o.customer_id)}>✓ ผูกลูกค้าแล้ว ↗</span>
                    {o.boq_no
                      ? <span className="vat-badge" style={{ background: "#ede9fe", color: "#6d28d9" }}>🧾 {o.boq_no}</span>
                      : <button className="btn-primary sm" onClick={() => toBoq(o)}>🧾 สร้าง BOQ จากใบนี้</button>}
                  </>)}
                </div>
                <div className="wo-acts">
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>เปลี่ยนสถานะ:</span>
                  {STATUS.map(([v, l, c]) => (
                    <button key={v} className={"wo-st-btn" + (o.status === v ? " on" : "")}
                      style={o.status === v ? { background: c, color: "#fff", borderColor: c } : {}}
                      onClick={() => changeStatus(o, v)}>{l}</button>
                  ))}
                </div>
              </div>
            ); })}
          </div>
        )}

      {custForm && <CustomerFormModal initial={custForm.initial} onClose={() => setCustForm(null)} onSaved={onCustSaved} />}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
