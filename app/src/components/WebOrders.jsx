import React from "react";
import { listWebOrders, setWebOrderStatus, setWebOrderCustomer, setWebOrderBoq, listCustomersLite } from "../lib/api";
import { fmtBaht, custCode } from "../lib/format";
import { can } from "../lib/permissions";
import CustomerFormModal from "./CustomerFormModal";
import { confirmDialog } from "./ConfirmDialog";

const STATUS = [
  ["new", "ใหม่", "#dc2626", "#fee2e2"],
  ["contacted", "ติดต่อแล้ว", "#d97706", "#fef3c7"],
  ["unreachable", "ติดต่อไม่ได้", "#e11d48", "#ffe4e6"],
  ["recontact", "รอติดต่อใหม่อีกครั้ง", "#0891b2", "#cffafe"],
  ["quoted", "เสนอราคาแล้ว", "#1d4ed8", "#dbeafe"],
  ["done", "ปิดการขาย", "#059669", "#dcf5e8"],
  ["cancelled", "ยกเลิก", "#64748b", "#f1f5f9"],
];
const ST = Object.fromEntries(STATUS.map((s) => [s[0], s]));
const thDateTime = (s) => { try { return new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };
// เทียบเบอร์ด้วย 9 ตัวท้าย — ลูกค้าพิมพ์มาหลายแบบ (0812345678 / 66812345678 / 081-234-5678)
const phoneKey = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };

export default function WebOrders({ role, onCreateBoq, onOpenCustomer }) {
  const [rows, setRows] = React.useState(null);
  const [custForm, setCustForm] = React.useState(null);   // { order, initial } → เปิดฟอร์มลูกค้าที่เติมข้อมูลจากใบนี้ให้แล้ว
  const [statusF, setStatusF] = React.useState("all");
  const [toast, setToast] = React.useState(null);
  const [custs, setCusts] = React.useState(null);         // รายชื่อลูกค้าแบบเบา — ใช้เตือนซ้ำ + ช่องค้นหาผูก
  const [pick, setPick] = React.useState(null);           // ใบที่กำลังเลือกลูกค้าให้
  const [busyLink, setBusyLink] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };

  async function load() {
    try { setRows(await listWebOrders()); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน 071_website.sql แล้วหรือยัง?)", true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);
  // โหลดรายชื่อลูกค้าตามหลัง (ไม่ขวางการแสดงการ์ด) — พลาดก็แค่ไม่มีตัวเตือนซ้ำ ไม่ทำให้หน้าพัง
  React.useEffect(() => { listCustomersLite().then(setCusts).catch(() => setCusts([])); }, []);

  // เบอร์ → ลูกค้าที่มีอยู่แล้ว · ใช้เตือนก่อนกดสร้างใหม่ (ลูกค้ารายเดียวกันมักส่งฟอร์มเข้ามาหลายรอบ)
  const byPhone = React.useMemo(() => {
    const m = {};
    (custs || []).forEach((c) => c.phones.forEach((p) => { const k = phoneKey(p); if (k && !m[k]) m[k] = c; }));
    return m;
  }, [custs]);

  async function link(o, cid, msg) {
    setBusyLink(o.id);
    try {
      await setWebOrderCustomer(o.id, cid);
      const name = cid ? ((custs || []).find((c) => String(c.id) === String(cid))?.name || null) : null;
      // รู้ชื่อ → อัปเดตในหน้าเลย · ไม่รู้ชื่อ → โหลดใหม่ ห้ามเดา ไม่งั้นป้ายจะขึ้นว่า "ลูกค้าถูกลบไปแล้ว"
      if (cid && !name) await load();
      else setRows((rs) => rs.map((x) => x.id === o.id ? { ...x, customer_id: cid, customerName: name } : x));
      flash(msg || (cid ? "ผูกลูกค้าเข้าคำสั่งซื้อแล้ว ✓" : "ยกเลิกการผูกลูกค้าแล้ว"));
      setPick(null);
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusyLink(null);
  }
  async function unlink(o) {
    if (!await confirmDialog(`ยกเลิกการผูกลูกค้าของใบนี้?\n${o.customerName || custCode(o.customer_id)}\n\nข้อมูลลูกค้าในระบบไม่ถูกลบ — แค่เลิกผูกกับคำสั่งซื้อใบนี้`)) return;
    await link(o, null);
  }

  // บันทึกลูกค้าเสร็จ → ผูกกลับเข้าใบคำสั่งซื้อทันที ไม่ต้องให้คนมากดผูกเอง
  async function onCustSaved(cid) {
    const o = custForm?.order;
    setCustForm(null);
    if (!o) return;
    // กันเคสฟอร์มคืนค่าว่าง — เดิมจะขึ้น "ผูกแล้ว ✓" ทั้งที่ไม่ได้ผูก แล้วป้ายก็ไม่ขึ้น
    if (!cid) return flash("สร้างลูกค้าแล้ว แต่ไม่ได้รหัสลูกค้ากลับมา — กด “ผูกลูกค้าที่มีอยู่” เพื่อผูกเอง", true);
    try {
      await setWebOrderCustomer(o.id, cid);
      await load();                                          // ดึงชื่อลูกค้าที่บันทึกจริงมาแสดง (ชื่อในฟอร์มแก้ได้)
      flash("ผูกลูกค้าเข้าคำสั่งซื้อแล้ว ✓");
      listCustomersLite().then(setCusts).catch(() => {});     // ลูกค้าใหม่เข้าลิสต์เตือนซ้ำด้วย
    } catch (e) { flash("สร้างลูกค้าแล้ว แต่ผูกกลับไม่สำเร็จ: " + (e.message || e), true); }
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
                <div className="wo-acts" style={{ borderBottom: "1px dashed var(--line-2)", paddingBottom: 8, marginBottom: 8, alignItems: "center" }}>
                  {!o.customer_id && can(role, "customers", "edit") && (<>
                    <button className="btn-primary sm" disabled={busyLink === o.id} onClick={() => openCustForm(o)}>➕ สร้างลูกค้าจากใบนี้</button>
                    <button className="btn-ghost sm" disabled={busyLink === o.id} onClick={() => setPick({ order: o, q: "" })}>🔗 ผูกลูกค้าที่มีอยู่</button>
                    {/* ลูกค้ารายเดิมมักส่งฟอร์มซ้ำหลายรอบ — กดสร้างใหม่ทุกใบ = ลูกค้าซ้ำ ประวัติงาน/ยอดค้างรับแตกกัน */}
                    {byPhone[phoneKey(o.phone)] && (
                      <span className="vat-badge" style={{ background: "#fef3c7", color: "#b45309" }}>
                        ⚠️ เบอร์นี้มีลูกค้าแล้ว: {byPhone[phoneKey(o.phone)].name}
                        <button className="btn-ghost sm" style={{ marginLeft: 6 }} disabled={busyLink === o.id}
                          onClick={() => link(o, byPhone[phoneKey(o.phone)].id, `ผูกกับ ${byPhone[phoneKey(o.phone)].name} แล้ว ✓`)}>ผูกกับรายนี้</button>
                      </span>
                    )}
                  </>)}
                  {o.customer_id && (<>
                    <span className="vat-badge vat-on" title="เปิดข้อมูลลูกค้า" style={{ cursor: onOpenCustomer ? "pointer" : "default" }}
                      onClick={() => onOpenCustomer && onOpenCustomer(o.customer_id)}>
                      ✓ ผูกลูกค้าแล้ว · {o.customerName || "(ลูกค้าถูกลบไปแล้ว)"} {custCode(o.customer_id)} ↗
                    </span>
                    {can(role, "customers", "edit") && (
                      <button className="btn-ghost sm" title="ผูกผิดราย — เลิกผูกแล้วเลือกใหม่" disabled={busyLink === o.id} onClick={() => unlink(o)}>✕ เลิกผูก</button>
                    )}
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

      {pick && (() => {
        const q = pick.q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
        const hits = (custs || []).filter((c) => !q
          || c.name.toLowerCase().includes(q)
          || custCode(c.id).toLowerCase().includes(q)
          || (qd.length >= 3 && c.phones.some((p) => p.replace(/\D/g, "").includes(qd))));
        return (
          <div className="modal-overlay" onClick={() => setPick(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxHeight: "80vh" }}>
              <div className="modal-head">
                <div className="modal-title">ผูกคำสั่งซื้อกับลูกค้าที่มีอยู่<span>{pick.order.name} · {pick.order.phone}</span></div>
                <button className="drawer-close" onClick={() => setPick(null)}>✕</button>
              </div>
              <div className="modal-body">
                <input className="inp" autoFocus placeholder="ค้นชื่อลูกค้า / เบอร์โทร / รหัส C000123"
                  value={pick.q} onChange={(e) => setPick((p) => ({ ...p, q: e.target.value }))} />
                {custs === null ? <div className="empty" style={{ padding: 24 }}>กำลังโหลดรายชื่อลูกค้า…</div>
                  : hits.length === 0 ? <div className="empty" style={{ padding: 24 }}>ไม่พบลูกค้าที่ตรงกับที่ค้น — ถ้ายังไม่มีในระบบ ให้ปิดหน้านี้แล้วกด “สร้างลูกค้าจากใบนี้”</div>
                  : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {hits.slice(0, 40).map((c) => (
                        <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--line-2)" }}>
                          <b>{custCode(c.id)}</b><span>{c.name}</span>
                          {c.phones.length ? <span className="jo-dim">· {c.phones.slice(0, 2).join(", ")}</span> : null}
                          {phoneKey(pick.order.phone) && c.phones.some((p) => phoneKey(p) === phoneKey(pick.order.phone))
                            ? <span className="vat-badge" style={{ background: "#dcf5e8", color: "#059669" }}>เบอร์ตรงกัน</span> : null}
                          <button className="btn-primary sm" style={{ marginLeft: "auto" }} disabled={busyLink === pick.order.id}
                            onClick={() => link(pick.order, c.id, `ผูกกับ ${c.name} แล้ว ✓`)}>ผูกใบนี้</button>
                        </div>
                      ))}
                      {hits.length > 40 && <div className="page-sub">แสดง 40 รายแรกจาก {hits.length} — พิมพ์ค้นให้แคบลง</div>}
                    </div>
                  )}
              </div>
            </div>
          </div>
        );
      })()}
      {custForm && <CustomerFormModal initial={custForm.initial} onClose={() => setCustForm(null)} onSaved={onCustSaved} />}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
