import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listBoqs, saveBoq, deleteBoq, setBoqStatus, listCustomers, listMaterialsLite, getCompanies, listDocLinks } from "../lib/api";
import { fmtBaht, fmtNum, custCode, matchText, matchPhone, fmtDocDate } from "../lib/format";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";
import ItemPicker from "./ItemPicker";
import ItemBrowser from "./ItemBrowser";
import UnitPick, { unitFactor } from "./UnitPick";
import DocChips from "./DocChips";
import DocCardHead from "./DocCard";
import { useDocPeek } from "./DocPeek";
import ChatCustomerLink from "./ChatCustomerLink";
import DateRangeBar, { inDateRange } from "./DateRangeBar";
import GrowArea from "./GrowArea";
import DocSlip from "./DocSlip";
import NumIn from "./NumIn";
import DocTerms from "./DocTerms";
import { InternalNoteField, InternalNoteTag, SignToggle } from "./InternalNote";
import { mySignature, defaultSignOn } from "../lib/sign";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import { JOB_TYPES, jobTypeDef } from "../lib/schedule";

const SECTION_LABEL = { ac: "เครื่องปรับอากาศ", free: "วัสดุแถม (ไม่คิดเงิน)", charged: "วัสดุคิดเงิน", service: "ค่าบริการ" };

const SECTIONS = [
  { id: "ac", label: "เครื่องปรับอากาศ", kinds: ["ac"] },
  { id: "free", label: "วัสดุแถมลูกค้า (ไม่คิดเงิน)", kinds: ["material"] },
  { id: "charged", label: "วัสดุคิดเงินเพิ่ม", kinds: ["material"] },
  { id: "service", label: "ค่าบริการ", kinds: ["service"] },
];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `BOQ-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const today = () => new Date().toISOString().slice(0, 10);
const blankItems = () => ({ ac: [], free: [], charged: [], service: [] });

function SectionBlock({ sec, items, pool, onAdd, onSet, onDel, onMove }) {
  const subtotal = items.reduce((a, x) => a + Number(x.qty) * Number(x.unit_cost), 0);
  return (
    <div className={"boq-sec sec-" + sec.id}>
      <div className="boq-sec-head"><span>{sec.label}</span><b>{fmtBaht(subtotal)}</b></div>
      <ItemPicker items={pool} placeholder={`ค้นหา${sec.label}…`}
        onPick={(m) => onAdd({ code: m.code, name: m.th, unit: m.unit, qty: 1, unit_cost: m.cost, description: m.description || "" })} />
      {items.map((it, i) => { const pm = pool.find((p) => p.code === it.code); return (
        <div className={"line-item li-" + sec.id} key={i}>
          <div className="boq-line">
            <div className="line-info"><div className="line-name">{it.name || it.code}</div><div className="line-sub">{it.code}</div></div>
            <div className="inp inp-unit boq-in"><NumIn className="" autoWidth min="0" value={it.qty} onChange={(n) => onSet(i, "qty", Math.max(0, n))} /><UnitPick m={pm} value={it.unit} onChange={(u) => { const ratio = unitFactor(pm, u) / unitFactor(pm, it.unit || pm.unit); onSet(i, "unit", u); onSet(i, "unit_cost", Math.round((Number(it.unit_cost) || 0) * ratio * 100) / 100); }} /></div>
            <div className="inp inp-unit boq-in"><span className="unit-pre">฿</span><NumIn className="" autoWidth min="0" step="0.01" value={it.unit_cost} onChange={(n) => onSet(i, "unit_cost", n)} /></div>
            <span className="boq-amt">{fmtBaht(Number(it.qty) * Number(it.unit_cost))}</span>
            <div className="line-move">
              <button className="line-mv" disabled={i === 0} onClick={() => onMove(i, -1)} title="เลื่อนขึ้น"><UIcon name="chevD" size={13} style={{ transform: "rotate(180deg)" }} /></button>
              <button className="line-mv" disabled={i === items.length - 1} onClick={() => onMove(i, 1)} title="เลื่อนลง"><UIcon name="chevD" size={13} /></button>
            </div>
            <button className="line-x" onClick={() => onDel(i)}><UIcon name="x" size={14} /></button>
          </div>
          <GrowArea className="inp line-desc" placeholder="รายละเอียดสินค้า (Enter ขึ้นบรรทัดใหม่ได้ · แสดงใต้ชื่อในเอกสาร)" value={it.description || ""} onChange={(e) => onSet(i, "description", e.target.value)} />
        </div>
      ); })}
      {items.length === 0 && <div className="empty sm">ยังไม่มีรายการ</div>}
    </div>
  );
}

export default function BOQ({ role, onCreateQuote, focus, onFocusConsumed, onOpenQuote, onOpenDoc, newForCustomer, onNewConsumed, onGoChat }) {
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ชิปเชื่อมโยง → พรีวิวแผงขวาก่อน
  const canEdit = can(role, "boq", "edit");
  const canDelete = role === "admin"; // ลบจริงได้เฉพาะธุรการ
  const [dateR, setDateR] = React.useState({ from: "", to: "" });
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null); // {boq_no, customer_id, site_id, title, note, items{}}
  const [search, setSearch] = React.useState("");
  const [typeF, setTypeF] = React.useState("all"); // กรองตามประเภทงาน (CRM)
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [printB, setPrintB] = React.useState(null);
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });

  async function load() {
    setLoading(true);
    try { const [b, c, m, co, dl] = await Promise.all([listBoqs(), listCustomers(), listMaterialsLite(), getCompanies(), listDocLinks()]); setList(b); setCusts(c); setMats(m); setCompanies(co || { vat: {}, novat: {} }); setDocLinks(dl); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (focus) { setEd(null); setSearch(focus); onFocusConsumed && onFocusConsumed(); } }, [focus]);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printB) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintB(null); }, 120); return () => clearTimeout(t); }, [printB]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  function startNew() { setEd({ boq_no: genNo(), customer_id: "", site_id: "", title: "", job_type: "", issue_date: today(), note: "", sign_on: defaultSignOn(), terms_payment: "", terms_freebies: "", terms_warranty: "", items: blankItems() }); }
  function startNewFor(customerId) { setEd({ boq_no: genNo(), customer_id: String(customerId || ""), site_id: "", title: "", job_type: "", issue_date: today(), note: "", sign_on: defaultSignOn(), terms_payment: "", terms_freebies: "", terms_warranty: "", items: blankItems() }); }
  // open a fresh BOQ pre-filled with this customer (e.g. launched from the chat panel)
  React.useEffect(() => { if (newForCustomer) { startNewFor(newForCustomer); onNewConsumed && onNewConsumed(); } }, [newForCustomer]);
  // chain lock: can't edit/delete a BOQ that already has a quotation downstream
  // delete/cancel: blocked once any quote is created from this BOQ (chain safety)
  const lockMsg = (bo) => bo.hasQuote ? `แก้ไข/ลบ BOQ นี้ไม่ได้ — สร้างใบเสนอราคา ${bo.quoteNo || ""} จาก BOQ นี้แล้ว\nต้องลบใบเสนอราคา (และเอกสารถัดไป) ก่อน` : null;
  // edit: allowed while the linked quote is still a draft; locked only once it's approved
  const editLockMsg = (bo) => bo.quoteApproved ? `แก้ไข BOQ นี้ไม่ได้ — ใบเสนอราคา ${bo.quoteNo || ""} อนุมัติแล้ว\n(แก้ไขได้เฉพาะตอนใบเสนอราคายังไม่อนุมัติ)` : null;
  function startEdit(bo) {
    const lk = editLockMsg(bo); if (lk) return alert(lk);
    const items = blankItems();
    bo.items.forEach((x) => { (items[x.section] = items[x.section] || []).push({ code: x.item_code, name: x.name, unit: x.unit, qty: Number(x.qty), unit_cost: Number(x.unit_cost), description: x.description || "" }); });
    setEd({ _edit: true, _wasCancelled: bo.status === "cancelled", boq_no: bo.boq_no, customer_id: bo.customer_id || "", site_id: bo.site_id || "", title: bo.title || "", job_type: bo.job_type || "", issue_date: bo.issue_date || (bo.created_at || "").slice(0, 10), note: bo.note || "", internal_note: bo.internal_note || "", sign_on: !!bo.sign_url, terms_payment: bo.terms_payment || "", terms_freebies: bo.terms_freebies || "", terms_warranty: bo.terms_warranty || "", items });
  }
  // duplicate: copy items/details into a brand-new BOQ (new number, not _edit) — for similar jobs
  function duplicate(bo) {
    const items = blankItems();
    bo.items.forEach((x) => { (items[x.section] = items[x.section] || []).push({ code: x.item_code, name: x.name, unit: x.unit, qty: Number(x.qty), unit_cost: Number(x.unit_cost), description: x.description || "" }); });
    setEd({ boq_no: genNo(), customer_id: bo.customer_id || "", site_id: bo.site_id || "", title: bo.title ? bo.title + " (สำเนา)" : "", job_type: bo.job_type || "", issue_date: today(), note: bo.note || "", sign_on: defaultSignOn(), terms_payment: bo.terms_payment || "", terms_freebies: bo.terms_freebies || "", terms_warranty: bo.terms_warranty || "", items });
    flash("คัดลอกเป็น BOQ ใหม่แล้ว — แก้ไขลูกค้า/รายการได้ แล้วกดบันทึก");
  }

  const cust = custs.find((c) => String(c.id) === String(ed?.customer_id));
  const total = ed ? Object.values(ed.items).flat().reduce((a, x) => a + Number(x.qty) * Number(x.unit_cost), 0) : 0;
  // pre-compute each section's item pool once (not on every keystroke) — much faster with a large catalog
  const poolByKind = React.useMemo(() => ({ ac: mats.filter((m) => m.kind === "ac"), material: mats.filter((m) => m.kind === "material"), service: mats.filter((m) => m.kind === "service") }), [mats]);
  const poolFor = (sec) => poolByKind[sec.kinds[0]] || [];

  const addItem = (sec, it) => setEd((e) => ({ ...e, items: { ...e.items, [sec]: [...e.items[sec], it] } }));
  const moveItem = (sec, i, dir) => setEd((e) => { const a = [...e.items[sec]]; const j = i + dir; if (j < 0 || j >= a.length) return e; [a[i], a[j]] = [a[j], a[i]]; return { ...e, items: { ...e.items, [sec]: a } }; });
  // add from the right-side browser → route to the section matching the item's kind (material defaults to "คิดเงิน")
  const browserAdd = (m, target, qty = 1) => {
    const sec = m.kind === "ac" ? "ac" : m.kind === "service" ? "service" : (target || "charged");
    addItem(sec, { code: m.code, name: m.th, unit: m.unit, qty: Number(qty) || 1, unit_cost: m.cost, description: m.description || "" });
    flash(`+ ${m.th} × ${Number(qty) || 1}`);
  };
  const setItem = (sec, i, k, v) => setEd((e) => ({ ...e, items: { ...e.items, [sec]: e.items[sec].map((x, j) => j === i ? { ...x, [k]: v } : x) } }));
  const delItem = (sec, i) => setEd((e) => ({ ...e, items: { ...e.items, [sec]: e.items[sec].filter((_, j) => j !== i) } }));

  async function save() {
    // กติกา CRM: BOQ ทุกใบต้องระบุประเภทงาน — ติดไปใบเสนอราคา/ใบงานทั้งสาย
    if (!ed.job_type) return flash("เลือก 'ประเภทงาน' ก่อนบันทึก — ใช้ติดตามงาน (CRM) และติดไปทุกเอกสารที่สร้างต่อจากใบนี้", true);
    // นับรายการในแต่ละหมวด (รวมทุก qty) — ไว้บอกชัดถ้ายังไม่มีรายการเข้า state
    const inState = Object.values(ed.items).reduce((a, arr) => a + arr.length, 0);
    const flat = Object.entries(ed.items).flatMap(([sec, arr]) => arr.filter((x) => Number(x.qty) > 0).map((x) => ({ ...x, section: sec })));
    if (!flat.length) {
      const counts = SECTIONS.map((s) => `${s.label}: ${ed.items[s.id]?.length || 0}`).join(" · ");
      return window.alert(inState > 0
        ? `⚠️ มีรายการ ${inState} ตัว แต่จำนวน (qty) เป็น 0 ทุกตัว — ใส่จำนวนก่อนบันทึก\n\n${counts}`
        : `⚠️ ยังไม่มีรายการในใบ BOQ นี้\nกดปุ่ม “＋ เพิ่ม” ที่การ์ดสินค้าด้านขวา หรือค้นหาในแต่ละหมวดก่อน\n\n${counts}`);
    }
    if (ed._edit && !await confirmDialog(`ยืนยันบันทึกการแก้ไข BOQ ${ed.boq_no} ?`)) return;
    const sig = ed.sign_on ? mySignature() : null;
    try {
      await saveBoq({ ...ed, sign_url: sig?.url || null, sign_name: sig?.name || null }, flat);
      // กติกา: BOQ ที่ยกเลิกแล้วกลับมาแก้ไขได้ — บันทึกสำเร็จ = ปลดสถานะยกเลิก กลับมาใช้งานต่อ
      if (ed._wasCancelled) { try { await setBoqStatus(ed.boq_no, null); } catch { /* non-fatal */ } }
      flash(ed._wasCancelled ? `บันทึก BOQ แล้ว — ใบนี้พ้นสถานะยกเลิก กลับมาใช้งานได้ (${flat.length} รายการ)` : `บันทึก BOQ แล้ว (${flat.length} รายการ)`); setEd(null); await load(); }
    catch (e) { console.error("saveBoq failed:", e); window.alert("❌ บันทึก BOQ ไม่สำเร็จ\n\nสาเหตุจริงจากฐานข้อมูล:\n" + (e.message || String(e)) + "\n\n(กรุณาถ่ายรูปหน้าต่างนี้ส่งให้ผู้ดูแลระบบ)"); }
  }
  async function del(bo) {
    const lk = lockMsg(bo); if (lk) return alert(lk);
    const reason = await confirmDialog({ title: `ลบ BOQ ${bo.boq_no}?`, message: "ข้อมูลจะถูกเก็บไว้ในประวัติการลบ (กู้คืนได้)", confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ทำผิด · ซ้ำ", required: true } });
    if (reason === false) return;
    try { await deleteBoq(bo.boq_no, reason); flash("ลบแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function cancel(bo) {
    const lk = lockMsg(bo); if (lk) return alert(lk);
    const reason = await confirmDialog({ title: `ยกเลิก ${bo.boq_no}?`, message: "เก็บประวัติไว้ ไม่ลบทิ้ง — กลับมาแก้ไขเพื่อใช้งานใหม่ได้", confirmText: "ยกเลิกใบนี้", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น ลูกค้าเปลี่ยนสเปก · เสนอใหม่", required: true } });
    if (reason === false) return;
    try { await setBoqStatus(bo.boq_no, "cancelled", reason); flash("ยกเลิกแล้ว"); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }

  // ---------- EDITOR ----------
  if (ed) {
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">BOQ <span className="page-title-en">Bill of Quantities (ต้นทุน)</span></h1>
          <p className="page-sub">ประมาณการต้นทุน 4 ส่วน · แก้ไขจำนวน/ต้นทุนได้</p></div></div>
        <div className="doc-edit-wrap">
        <div className="card" style={{ flex: 1, maxWidth: 820 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่ BOQ</span><input className="inp" value={ed.boq_no} onChange={(e) => setEd({ ...ed, boq_no: e.target.value })} /></label>
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={ed.issue_date || ""} onChange={(e) => setEd({ ...ed, issue_date: e.target.value })} /></label>
            <label className="fld"><span>ประเภทงาน <b style={{ color: "#dc2626" }}>*</b> <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(ติดไปทุกเอกสารในสาย)</span></span>
              <Combo className="inp" value={ed.job_type || ""} onChange={(e) => setEd({ ...ed, job_type: e.target.value })}>
                <option value="">— เลือกประเภทงาน —</option>
                {JOB_TYPES.map(([v, l, ic]) => <option key={v} value={v}>{ic} {l}</option>)}
              </Combo></label>
            <label className="fld"><span>ชื่องาน</span><input className="inp" value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} placeholder="เช่น ติดตั้งแอร์ออฟฟิศ" /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ลูกค้า</span>
              <Combo className="inp" value={ed.customer_id} onChange={(e) => setEd({ ...ed, customer_id: e.target.value, site_id: "" })}>
                <option value="">— เลือกลูกค้า —</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Combo>
            </label>
            <label className="fld"><span>ไซต์งาน</span>
              <Combo className="inp" value={ed.site_id} onChange={(e) => setEd({ ...ed, site_id: e.target.value })} disabled={!cust || !cust.sites?.length}>
                <option value="">{cust?.sites?.length ? "— เลือกไซต์ —" : "(ไม่มีไซต์)"}</option>
                {cust?.sites?.map((s) => <option key={s.id} value={s.id}>{s.site_name || s.address}</option>)}
              </Combo>
            </label>
          </div>

          {cust && (() => {
            const site = cust.sites?.find((s) => String(s.id) === String(ed.site_id));
            const c0 = cust.contacts?.[0];
            const addr = site?.address || cust.address;
            const map = site?.map_url || (addr ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr) : "");
            return (
              <div className="cust-info-box">
                <div className="cust-info-row">🏢 <b>{cust.name}</b>{cust.tax_id ? <span className="ci-dim"> · เลขภาษี {cust.tax_id}</span> : null}</div>
                {c0 && (c0.name || c0.phone) && <div className="cust-info-row">👤 {c0.name || "ผู้ติดต่อ"}{c0.role ? ` · ${c0.role}` : ""}{c0.phone && <a className="ci-tel" href={`tel:${c0.phone}`}>📞 {c0.phone}</a>}</div>}
                {addr && <div className="cust-info-row">📍 <span className="ci-addr">{addr}</span>{map && <a className="ci-map" href={map} target="_blank" rel="noreferrer">แผนที่</a>}</div>}
              </div>
            );
          })()}

          {SECTIONS.map((sec) => (
            <SectionBlock key={sec.id} sec={sec} items={ed.items[sec.id]} pool={poolFor(sec)}
              onAdd={(it) => addItem(sec.id, it)} onSet={(i, k, v) => setItem(sec.id, i, k, v)} onDel={(i) => delItem(sec.id, i)} onMove={(i, dir) => moveItem(sec.id, i, dir)} />
          ))}

          <div className="line-total" style={{ fontSize: 15 }}><span>ต้นทุนรวมทั้งสิ้น</span><b style={{ fontSize: 20 }}>{fmtBaht(total)}</b></div>
          <DocTerms payment={ed.terms_payment} freebies={ed.terms_freebies} warranty={ed.terms_warranty} docItems={Object.values(ed.items).flat()} onChange={(k, v) => setEd((e) => ({ ...e, [k]: v }))} />
          <InternalNoteField value={ed.internal_note} onChange={(v) => setEd((e) => ({ ...e, internal_note: v }))} />
          <SignToggle on={ed.sign_on} onChange={(v) => setEd((e) => ({ ...e, sign_on: v }))} />
          {(() => { const n = Object.values(ed.items).reduce((a, arr) => a + arr.length, 0); return (
            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
              <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: n > 0 ? "#16a34a" : "#dc2626" }}>{n > 0 ? `📋 มี ${n} รายการในใบ` : "⚠️ ยังไม่มีรายการ — กด ＋เพิ่ม ที่การ์ดขวา"}</span>
              <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึก BOQ{n > 0 ? ` (${n})` : ""}</button>
            </div>
          ); })()}
        </div>
        <ItemBrowser mats={mats} onAdd={browserAdd} matTargets={[{ id: "charged", label: "คิดเงิน" }, { id: "free", label: "แถม" }]} />
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
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / เบอร์โทร" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้าง BOQ</button>}
        </div>
      </div>
      {(() => {
        // base หลังค้นหา+ช่วงวันที่ — ใช้นับจำนวนบนชิปตัวกรองประเภทงาน (CRM)
        const fl0 = list.filter((bo) => inDateRange(bo.created_at, dateR) && (matchText(search, bo.boq_no, bo.customerName, bo.contactName, bo.title) || matchPhone(search, bo.contactPhone)));
        const nType = (v) => fl0.filter((bo) => v === "all" || bo.job_type === v).length;
        const fl = fl0.filter((bo) => typeF === "all" || bo.job_type === typeF);
        return (<>
      <div className="cat-filter">
        {[["all", "ทุกประเภทงาน"], ...JOB_TYPES.map(([v, l, ic]) => [v, `${ic} ${l}`])].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (typeF === v ? " on" : "")} onClick={() => setTypeF(v)}
            style={typeF === v ? { background: "#0891b2", color: "#fff", borderColor: "#0891b2" } : {}}>{l} ({nType(v)})</button>
        ))}
        <DateRangeBar value={dateR} onChange={setDateR} />
      </div>
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && fl.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มี BOQ" : "ไม่พบ BOQ ที่ตรงเงื่อนไข"}</div>}
      <div className="job-cards">
        {fl.map((bo) => (
          <div className="card job-card doc2" key={bo.boq_no}>
            <DocCardHead no={bo.boq_no} onClick={() => openPeek("boq", bo.boq_no)}
              badges={<>
                {bo.status === "cancelled" && <span className="job-badge b-red">ยกเลิกแล้ว</span>}
                {bo.job_type && (() => { const d = jobTypeDef(bo.job_type); return <span className="job-badge" style={{ background: d[3] }}>{d[2]} {d[1]}</span>; })()}
              </>}
              title={bo.title} sub={`${bo.items.length} รายการ`} by={bo.createdByName}
              date={bo.issue_date || bo.created_at} amountLabel="ต้นทุนรวม" amount={bo.total}
              customer={{ name: bo.customerName, contactName: bo.contactName || bo.mainContactName, phone: bo.contactPhone || bo.mainContactPhone, addr: bo.customerAddr, siteAddress: bo.siteAddress, mapUrl: bo.mapUrl }} />
            {(() => { const ch = docLinks.byQuote[bo.quoteNo] || {}; return <DocChips jobStatusBy={docLinks.jobStatusBy || {}} quoteNo={bo.quoteNo} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} poNos={ch.poNos} self={{ type: "boq", no: bo.boq_no }} onOpen={openPeek} />; })()}
            <InternalNoteTag note={bo.internal_note} role={role} />
            <div className="job-lines"><div className="job-actions">
              {bo.status === "cancelled" && <span className="job-badge b-red" title="แก้ไขแล้วบันทึก เพื่อนำใบนี้กลับมาใช้งาน">ยกเลิกแล้ว</span>}
              <ChatCustomerLink role={role} customerId={bo.customer_id} onGoChat={onGoChat} />
              {onCreateQuote && bo.status !== "cancelled" && (bo.hasQuote
                ? <span className="job-badge b-green">✓ ออกใบเสนอราคาแล้ว</span>
                : (canEdit && <button className="btn-primary sm" onClick={() => onCreateQuote(bo.boq_no)}><UIcon name="clipboard" size={14} color="#fff" /> สร้างใบเสนอราคา</button>))}
              <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintB(bo); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
              {canEdit && bo.status !== "cancelled" && <button className="btn-ghost sm" onClick={() => duplicate(bo)}><UIcon name="clipboard" size={14} /> สร้างซ้ำ</button>}
              {canEdit && <button className="btn-ghost sm" disabled={bo.quoteApproved} title={editLockMsg(bo) || (bo.status === "cancelled" ? "แก้ไขแล้วบันทึก — ใบจะกลับมาใช้งานได้" : "")} onClick={() => startEdit(bo)}><UIcon name="edit" size={14} /> แก้ไข</button>}
              {canEdit && bo.status !== "cancelled" && <button className="btn-ghost sm" disabled={bo.hasQuote} title={lockMsg(bo) || ""} onClick={() => cancel(bo)}>ยกเลิก</button>}
              {canDelete && <button className="btn-ghost sm danger" disabled={bo.hasQuote} title={bo.hasQuote ? (lockMsg(bo) || "") : "ลบถาวร (ธุรการ)"} onClick={() => del(bo)}><UIcon name="trash" size={14} /> ลบ</button>}
            </div></div>
          </div>
        ))}
      </div>
        </>);
      })()}

      {printB && (() => { const _c = custs.find((x) => String(x.id) === String(printB.customer_id)); const company = _c?.vat === false ? companies.novat : companies.vat; return (
        <DocSlip company={company} titleTh="ใบประมาณการ (BOQ)" titleEn="BILL OF QUANTITIES" docNo={printB.boq_no}
          metaRows={[{ label: "วันที่", value: printB.issue_date || (printB.created_at || "").slice(0, 10) }, { label: "ชื่องาน", value: printB.title }]}
          projectTitle={printB.title}
          customer={{ name: printB.customerName, code: custCode(printB.customerCode), taxId: printB.customerTaxId, address: printB.customerAddr, contactName: printB.mainContactName, contactPhone: printB.mainContactPhone, siteName: printB.siteName, siteAddress: printB.siteAddress, siteContactName: printB.siteContactName, siteContactPhone: printB.siteContactPhone, mapUrl: printB.mapUrl }}
          terms={printB.note} termsPayment={printB.terms_payment} termsFreebies={printB.terms_freebies} termsWarranty={printB.terms_warranty} bank={null} signLabels={["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"]} signUrl={printB.sign_url} signName={printB.sign_name}
          totals={<div className="doc-totals">
            <div className="doc-grand"><span>ต้นทุนรวมทั้งสิ้น</span><b>{fmtBaht(printB.total)}</b></div>
          </div>}>
          {(() => {
            const order = ["ac", "free", "charged", "service"];
            const bySec = {}; printB.items.forEach((x) => { (bySec[x.section] = bySec[x.section] || []).push(x); });
            let n = 0;
            return order.filter((sec) => bySec[sec]?.length).map((sec) => {
              const rows = bySec[sec];
              const sub = rows.reduce((a, x) => a + Number(x.qty) * Number(x.unit_cost), 0);
              return (
                <React.Fragment key={sec}>
                  <tr className="doc-sec"><td colSpan="6">{SECTION_LABEL[sec] || sec}</td></tr>
                  {rows.map((x) => { n++; return (
                    <tr key={x.item_code + n}><td>{n}</td><td>{x.item_code || "-"}</td><td>{x.name}{x.description ? <div className="doc-item-desc">{x.description}</div> : null}</td><td className="r">{fmtNum(x.qty)} {x.unit || ""}</td><td className="r">{fmtBaht(x.unit_cost)}</td><td className="r">{sec === "free" ? "แถม" : fmtBaht(x.qty * x.unit_cost)}</td></tr>
                  ); })}
                  <tr className="doc-sec-sum"><td colSpan="5" className="r">รวม{SECTION_LABEL[sec] || sec}</td><td className="r">{sec === "free" ? "—" : fmtBaht(sub)}</td></tr>
                </React.Fragment>
              );
            });
          })()}
        </DocSlip>
      ); })()}
      {peekEl}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
