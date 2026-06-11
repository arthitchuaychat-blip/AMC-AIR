import React from "react";
import { listBoqs, saveBoq, deleteBoq, listCustomers, listMaterials } from "../lib/api";
import { fmtBaht, fmtNum } from "../lib/format";
import { UIcon } from "../icons";

const SECTIONS = [
  { id: "ac", label: "เครื่องปรับอากาศ", kinds: ["ac"] },
  { id: "free", label: "วัสดุแถมลูกค้า (ไม่คิดเงิน)", kinds: ["material"] },
  { id: "charged", label: "วัสดุคิดเงินเพิ่ม", kinds: ["material"] },
  { id: "service", label: "ค่าบริการ", kinds: ["service"] },
];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `BOQ-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const blankItems = () => ({ ac: [], free: [], charged: [], service: [] });

function SectionBlock({ sec, items, mats, onAdd, onSet, onDel }) {
  const [code, setCode] = React.useState("");
  const pool = mats.filter((m) => sec.kinds.includes(m.kind));
  const subtotal = items.reduce((a, x) => a + Number(x.qty) * Number(x.unit_cost), 0);
  function add() {
    const m = mats.find((x) => x.code === code); if (!m) return;
    onAdd({ code: m.code, name: m.th, unit: m.unit, qty: 1, unit_cost: m.cost });
    setCode("");
  }
  return (
    <div className="boq-sec">
      <div className="boq-sec-head"><span>{sec.label}</span><b>{fmtBaht(subtotal)}</b></div>
      <div className="line-add">
        <select className="inp" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">— เลือกรายการ —</option>
          {pool.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.th}{m.brand ? ` (${m.brand})` : ""}</option>)}
        </select>
        <button className="btn-ghost sm" onClick={add} disabled={!code}><UIcon name="plus" size={14} /> เพิ่ม</button>
      </div>
      {items.map((it, i) => (
        <div className="boq-line" key={i}>
          <div className="line-info"><div className="line-name">{it.name || it.code}</div><div className="line-sub">{it.code}</div></div>
          <div className="inp inp-unit boq-in"><input type="number" min="1" value={it.qty} onChange={(e) => onSet(i, "qty", Math.max(0, Number(e.target.value) || 0))} /><span className="unit-suf">{it.unit}</span></div>
          <div className="inp inp-unit boq-in"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={it.unit_cost} onChange={(e) => onSet(i, "unit_cost", Number(e.target.value) || 0)} /></div>
          <span className="boq-amt">{fmtBaht(Number(it.qty) * Number(it.unit_cost))}</span>
          <button className="line-x" onClick={() => onDel(i)}><UIcon name="x" size={14} /></button>
        </div>
      ))}
      {items.length === 0 && <div className="empty sm">ยังไม่มีรายการ</div>}
    </div>
  );
}

export default function BOQ({ role }) {
  const canEdit = role === "admin" || role === "sales";
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null); // {boq_no, customer_id, site_id, title, note, items{}}

  async function load() {
    setLoading(true);
    try { const [b, c, m] = await Promise.all([listBoqs(), listCustomers(), listMaterials()]); setList(b); setCusts(c); setMats(m); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  function startNew() { setEd({ boq_no: genNo(), customer_id: "", site_id: "", title: "", note: "", items: blankItems() }); }
  function startEdit(bo) {
    const items = blankItems();
    bo.items.forEach((x) => { (items[x.section] = items[x.section] || []).push({ code: x.item_code, name: x.name, unit: x.unit, qty: Number(x.qty), unit_cost: Number(x.unit_cost) }); });
    setEd({ boq_no: bo.boq_no, customer_id: bo.customer_id || "", site_id: bo.site_id || "", title: bo.title || "", note: bo.note || "", items });
  }

  const cust = custs.find((c) => String(c.id) === String(ed?.customer_id));
  const total = ed ? Object.values(ed.items).flat().reduce((a, x) => a + Number(x.qty) * Number(x.unit_cost), 0) : 0;

  const addItem = (sec, it) => setEd((e) => ({ ...e, items: { ...e.items, [sec]: [...e.items[sec], it] } }));
  const setItem = (sec, i, k, v) => setEd((e) => ({ ...e, items: { ...e.items, [sec]: e.items[sec].map((x, j) => j === i ? { ...x, [k]: v } : x) } }));
  const delItem = (sec, i) => setEd((e) => ({ ...e, items: { ...e.items, [sec]: e.items[sec].filter((_, j) => j !== i) } }));

  async function save() {
    const flat = Object.entries(ed.items).flatMap(([sec, arr]) => arr.filter((x) => x.qty > 0).map((x) => ({ ...x, section: sec })));
    if (!flat.length) return flash("เพิ่มรายการอย่างน้อย 1 รายการ", true);
    try { await saveBoq(ed, flat); flash("บันทึก BOQ แล้ว"); setEd(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(bo) {
    if (!confirm(`ลบ ${bo.boq_no}?`)) return;
    try { await deleteBoq(bo.boq_no); flash("ลบแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }

  // ---------- EDITOR ----------
  if (ed) {
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">BOQ <span className="page-title-en">Bill of Quantities (ต้นทุน)</span></h1>
          <p className="page-sub">ประมาณการต้นทุน 4 ส่วน · แก้ไขจำนวน/ต้นทุนได้</p></div></div>
        <div className="card" style={{ maxWidth: 820 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่ BOQ</span><input className="inp" value={ed.boq_no} onChange={(e) => setEd({ ...ed, boq_no: e.target.value })} /></label>
            <label className="fld"><span>ชื่องาน</span><input className="inp" value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} placeholder="เช่น ติดตั้งแอร์ออฟฟิศ" /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ลูกค้า</span>
              <select className="inp" value={ed.customer_id} onChange={(e) => setEd({ ...ed, customer_id: e.target.value, site_id: "" })}>
                <option value="">— เลือกลูกค้า —</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="fld"><span>ไซต์งาน</span>
              <select className="inp" value={ed.site_id} onChange={(e) => setEd({ ...ed, site_id: e.target.value })} disabled={!cust || !cust.sites?.length}>
                <option value="">{cust?.sites?.length ? "— เลือกไซต์ —" : "(ไม่มีไซต์)"}</option>
                {cust?.sites?.map((s) => <option key={s.id} value={s.id}>{s.site_name || s.address}</option>)}
              </select>
            </label>
          </div>

          {SECTIONS.map((sec) => (
            <SectionBlock key={sec.id} sec={sec} items={ed.items[sec.id]} mats={mats}
              onAdd={(it) => addItem(sec.id, it)} onSet={(i, k, v) => setItem(sec.id, i, k, v)} onDel={(i) => delItem(sec.id, i)} />
          ))}

          <div className="line-total" style={{ fontSize: 15 }}><span>ต้นทุนรวมทั้งสิ้น</span><b style={{ fontSize: 20 }}>{fmtBaht(total)}</b></div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึก BOQ</button>
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
        <div><h1 className="page-title">BOQ <span className="page-title-en">Bill of Quantities</span></h1><p className="page-sub">{list.length} ใบ · ประมาณการต้นทุนงาน</p></div>
        {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้าง BOQ</button>}
      </div>
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && list.length === 0 && <div className="empty">ยังไม่มี BOQ</div>}
      <div className="job-cards">
        {list.map((bo) => (
          <div className="card job-card" key={bo.boq_no}>
            <div className="job-card-head" style={{ cursor: "default" }}>
              <div className="job-card-id"><span className="job-no">{bo.boq_no}</span></div>
              <div className="job-card-meta">{bo.customerName || "ไม่ระบุลูกค้า"}{bo.title ? ` · ${bo.title}` : ""} · {bo.items.length} รายการ</div>
              <div className="job-card-cost"><span>ต้นทุนรวม</span><b>{fmtBaht(bo.total)}</b></div>
            </div>
            {canEdit && (
              <div className="job-lines"><div className="job-actions">
                <button className="btn-ghost sm" onClick={() => startEdit(bo)}><UIcon name="edit" size={14} /> แก้ไข</button>
                <button className="btn-ghost sm danger" onClick={() => del(bo)}><UIcon name="trash" size={14} /> ลบ</button>
              </div></div>
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
