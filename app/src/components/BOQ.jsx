import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listBoqs, saveBoq, deleteBoq, setBoqStatus, listCustomers, listMaterialsLite, getCompanies, listDocLinks, docNoTaken, setWebOrderBoq, aiDraftBoq, uploadExpenseFile, uploadDocFile } from "../lib/api";
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
import DateRangeBar, { inDateRange, defaultDocRange } from "./DateRangeBar";
import FilterBar from "./FilterBar";
import GrowArea from "./GrowArea";
import DocSlip from "./DocSlip";
import NumIn from "./NumIn";
import DocTerms from "./DocTerms";
import { DocNoteField, InternalNoteField, InternalNoteTag, SignToggle } from "./InternalNote";
import { mySignature, defaultSignOn } from "../lib/sign";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import { JOB_TYPES, jobTypeDef } from "../lib/schedule";
import { useFormDraft } from "../lib/useFormDraft";

const SECTION_LABEL = { ac: "เครื่องปรับอากาศ", free: "วัสดุแถม (ไม่คิดเงิน)", charged: "วัสดุคิดเงิน", service: "ค่าบริการ" };

const SECTIONS = [
  { id: "ac", label: "เครื่องปรับอากาศ", kinds: ["ac"] },
  { id: "free", label: "วัสดุแถมลูกค้า (ไม่คิดเงิน)", kinds: ["material"] },
  { id: "charged", label: "วัสดุคิดเงินเพิ่ม", kinds: ["material"] },
  { id: "service", label: "ค่าบริการ", kinds: ["service"] },
];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `BOQ-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
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

export default function BOQ({ role, onCreateQuote, focus, onFocusConsumed, onOpenQuote, onOpenDoc, newForCustomer, onNewConsumed, onGoChat, draft, onDraftConsumed }) {
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ชิปเชื่อมโยง → พรีวิวแผงขวาก่อน
  const canEdit = can(role, "boq", "edit");
  const canDelete = role === "admin"; // ลบจริงได้เฉพาะธุรการ
  const [dateR, setDateR] = React.useState(defaultDocRange);   // เปิดมาเห็น 6 เดือนล่าสุด · เก่ากว่านั้นกด "ดูทั้งหมด"
  const [list, setList] = React.useState([]);
  // ใบที่ถูกช่วงวันที่ตัดออก — ต้องบอกจำนวนบนแถบตัวกรอง ห้ามซ่อนเงียบ ๆ
  const dateHidden = React.useMemo(() => (list || []).filter((x) => !inDateRange(x.issue_date || x.created_at, dateR)).length, [list, dateR]);
  const [custs, setCusts] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null); // {boq_no, customer_id, site_id, title, note, items{}}
  const [aiOpen, setAiOpen] = React.useState(false);   // โมดัลช่วยร่าง BOQ จากแบบ
  const [search, setSearch] = React.useState("");
  const [typeF, setTypeF] = React.useState("all"); // กรองตามประเภทงาน (CRM)
  const [byPerson, setByPerson] = React.useState(""); // กรองตามผู้สร้างเอกสาร
  // ตัวเลือกผู้สร้าง = ชื่อผู้สร้างที่มีจริงในใบทั้งหมด (ก่อนกรอง) — ไม่ยิง API เพิ่ม
  const creatorOpts = React.useMemo(() => Array.from(new Set((list || []).map((d) => d.createdByName).filter(Boolean))).sort(), [list]);
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [printB, setPrintB] = React.useState(null);
  const [saving, setSaving] = React.useState(false);   // กันกดบันทึกซ้ำตอนเน็ตช้า (เดิมกด 2 ที = ได้ 2 ใบ)
  // ร่างอัตโนมัติ — กดปุ่ม Back ของ Android หรือแท็บถูกรีโหลดแล้วที่คีย์ค้างไม่หายทั้งใบ
  const { draftKey, clearOnSaved, closeGuard } = useFormDraft(ed, setEd, { kind: "boq", idOf: (e) => (e._edit ? e.boq_no : null), label: "BOQ" });
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });

  async function load() {
    setLoading(true);
    try { const [b, c, m, co, dl] = await Promise.all([listBoqs(), listCustomers(), listMaterialsLite(), getCompanies(), listDocLinks()]); setList(b); setCusts(c); setMats(m); setCompanies(co || { vat: {}, novat: {} }); setDocLinks(dl); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // เปิดเจาะจงใบ (มาจากลิงก์/ชิปเชื่อมโยง) → ล้างช่วงวันที่ ไม่งั้นใบเก่ากว่า 6 เดือนจะขึ้นว่าไม่พบ
  React.useEffect(() => { if (focus) { setEd(null); setDateR({ from: "", to: "" }); setSearch(focus); onFocusConsumed && onFocusConsumed(); } }, [focus]);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printB) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintB(null); }, 120); return () => clearTimeout(t); }, [printB]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  function startNew() { setEd({ boq_no: genNo(), customer_id: "", site_id: "", title: "", job_type: "", issue_date: today(), note: "", internal_note: "", sign_on: defaultSignOn(), terms_payment: "", terms_freebies: "", terms_warranty: "", items: blankItems() }); }
  function startNewFor(customerId) { setEd({ boq_no: genNo(), customer_id: String(customerId || ""), site_id: "", title: "", job_type: "", issue_date: today(), note: "", internal_note: "", sign_on: defaultSignOn(), terms_payment: "", terms_freebies: "", terms_warranty: "", items: blankItems() }); }
  // open a fresh BOQ pre-filled with this customer (e.g. launched from the chat panel)
  React.useEffect(() => { if (newForCustomer) { startNewFor(newForCustomer); onNewConsumed && onNewConsumed(); } }, [newForCustomer]);
  // เปิด BOQ ใหม่พร้อมรายการจากคำสั่งซื้อหน้าเว็บ
  // ⚠️ ต้องรอ mats โหลดเสร็จก่อน ไม่งั้น matMap ว่าง → ต้นทุนเป็น 0 ทุกบรรทัด
  React.useEffect(() => { if (!draft || !mats.length) return; startNewFromWebOrder(draft); onDraftConsumed && onDraftConsumed(); }, [draft, mats.length]);
  function startNewFromWebOrder(d) {
    const items = blankItems();
    const missing = [];
    (d.items || []).forEach((it) => {
      const m = it.code ? matMap[it.code] : null;
      if (!m) {
        // รุ่นที่ปิดขาย/ถูกลบไปแล้ว — ใส่เป็นบรรทัดชื่ออย่างเดียว ห้ามใส่รหัสที่ไม่มีจริงลง boq_items
        // (จะได้แถวที่หา material ไม่เจอ แล้วต้นทุน/สต๊อกฝั่งท้ายน้ำเพี้ยน)
        missing.push(it.name || it.code || "-");
        items.charged.push({ code: "", name: it.name || it.code || "(ไม่ระบุ)", unit: "", qty: Number(it.qty) || 1, unit_cost: 0, description: "" });
        return;
      }
      // ⚠️ ใช้ "ต้นทุน" จากตารางสินค้าเสมอ — ราคาที่ติดมากับคำสั่งซื้อคือราคาขาย
      //    ถ้าเอามาใส่ช่องต้นทุน กำไรของทั้งสายเอกสารที่งอกจากใบนี้จะกลายเป็น ~0 หรือติดลบ
      const sec = m.kind === "ac" ? "ac" : m.kind === "service" ? "service" : "charged";
      items[sec].push({ code: m.code, name: m.th, unit: m.unit, qty: Number(it.qty) || 1, unit_cost: Number(m.cost) || 0, description: m.description || "" });
    });
    setEd({ boq_no: genNo(), customer_id: String(d.customerId || ""), site_id: "", title: d.title || "", job_type: "", issue_date: today(),
      note: "", internal_note: "", sign_on: defaultSignOn(), terms_payment: "", terms_freebies: "", terms_warranty: "", items, _webOrderId: d.orderId || null });
    if (missing.length) flash(`เติมรายการให้แล้ว — แต่ ${missing.length} รายการหารหัสสินค้าไม่เจอ (${missing.slice(0, 3).join(", ")}) ใส่เป็นบรรทัดเปล่าไว้ ต้องเลือกสินค้าและใส่ต้นทุนเอง`, true);
    else flash("เติมรายการจากคำสั่งซื้อหน้าเว็บให้แล้ว — ตรวจต้นทุนก่อนบันทึก");
  }
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
    setEd({ boq_no: genNo(), customer_id: bo.customer_id || "", site_id: bo.site_id || "", title: bo.title ? bo.title + " (สำเนา)" : "", job_type: bo.job_type || "", issue_date: today(), note: bo.note || "", internal_note: bo.internal_note || "", sign_on: defaultSignOn(), terms_payment: bo.terms_payment || "", terms_freebies: bo.terms_freebies || "", terms_warranty: bo.terms_warranty || "", items });
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
  // ต่อรายการที่ AI ร่างมา (จากแบบ) เข้าใบปัจจุบัน — แยกเข้า section ตามที่ AI จัดให้
  const applyAiLines = (lines) => setEd((e) => {
    const items = { ...e.items };
    (lines || []).forEach((l) => {
      const sec = items[l.section] ? l.section : "charged";
      items[sec] = [...items[sec], { code: l.code || "", name: l.name, unit: l.unit || "", qty: Number(l.qty) || 1, unit_cost: Number(l.unit_cost) || 0, description: l.description || "" }];
    });
    return { ...e, items };
  });

  async function save() {
    const dk = draftKey;   // เก็บไว้ก่อน — setEd(null) ตอนท้ายทำให้ draftKey กลายเป็น null
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
    setSaving(true);   // ผ่านการตรวจครบแล้วค่อยล็อกปุ่ม (ล็อกก่อนตรวจ = กรอกผิดแล้วปุ่มค้าง)
    try {
      // เลขซ้ำ = upsert ทับใบเดิมเงียบ ๆ — ใบใหม่เช็คก่อน ชนแล้วออกเลขใหม่ให้อัตโนมัติ
      let boqNo = ed.boq_no;
      if (!ed._edit && await docNoTaken("boqs", boqNo)) {
        const fresh = genNo();
        if (fresh === boqNo || await docNoTaken("boqs", fresh)) return flash(`เลขที่ ${boqNo} ถูกใช้แล้ว — แก้เลขที่ก่อนบันทึก`, true);
        boqNo = fresh;
      }
      await saveBoq({ ...ed, boq_no: boqNo, sign_url: sig?.url || null, sign_name: sig?.name || null }, flat);
      // กติกา: BOQ ที่ยกเลิกแล้วกลับมาแก้ไขได้ — บันทึกสำเร็จ = ปลดสถานะยกเลิก กลับมาใช้งานต่อ
      if (ed._wasCancelled) { try { await setBoqStatus(ed.boq_no, null); } catch { /* non-fatal */ } }
      // มาจากคำสั่งซื้อหน้าเว็บ → ผูกเลข BOQ กลับเข้าใบนั้น + เลื่อนสถานะเป็น "เสนอราคาแล้ว"
      if (ed._webOrderId) { try { await setWebOrderBoq(ed._webOrderId, boqNo); } catch (e) { flash(e.message || String(e), true); } }
      const renum = boqNo !== ed.boq_no ? ` · ⚠️ เลขที่เดิมชนกับใบอื่น — ใบนี้ได้เลขใหม่ ${boqNo}` : "";
      flash((ed._wasCancelled ? `บันทึก BOQ แล้ว — ใบนี้พ้นสถานะยกเลิก กลับมาใช้งานได้ (${flat.length} รายการ)` : `บันทึก BOQ แล้ว (${flat.length} รายการ)`) + renum); clearOnSaved(dk); setEd(null); await load(); }
    catch (e) { console.error("saveBoq failed:", e); window.alert("❌ บันทึก BOQ ไม่สำเร็จ\n\nสาเหตุจริงจากฐานข้อมูล:\n" + (e.message || String(e)) + "\n\n(กรุณาถ่ายรูปหน้าต่างนี้ส่งให้ผู้ดูแลระบบ)"); }
    finally { setSaving(false); }
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

          <div style={{ margin: "4px 0 10px", padding: "10px 12px", border: "1.5px dashed #c4b5fd", background: "#f5f3ff", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: "#6d28d9" }}>🤖 ให้ AI ช่วยร่างจากแบบ</span>
            <span className="jo-dim" style={{ flex: "1 1 220px", fontSize: 12.5 }}>อัปโหลดแปลน/รูป + วางสเปค + ใส่บรีฟ → AI ร่างรายการวัสดุจากคลังจริงมาให้ตรวจ/แก้</span>
            <button type="button" className="btn-primary sm" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={() => setAiOpen(true)}>เปิดตัวช่วยร่าง BOQ</button>
          </div>

          {SECTIONS.map((sec) => (
            <SectionBlock key={sec.id} sec={sec} items={ed.items[sec.id]} pool={poolFor(sec)}
              onAdd={(it) => addItem(sec.id, it)} onSet={(i, k, v) => setItem(sec.id, i, k, v)} onDel={(i) => delItem(sec.id, i)} onMove={(i, dir) => moveItem(sec.id, i, dir)} />
          ))}

          <div className="line-total" style={{ fontSize: 15 }}><span>ต้นทุนรวมทั้งสิ้น</span><b style={{ fontSize: 20 }}>{fmtBaht(total)}</b></div>
          <DocTerms payment={ed.terms_payment} freebies={ed.terms_freebies} warranty={ed.terms_warranty} docItems={Object.values(ed.items).flat()} onChange={(k, v) => setEd((e) => ({ ...e, [k]: v }))} />
          <DocNoteField value={ed.note} onChange={(v) => setEd((e) => ({ ...e, note: v }))} />
          <InternalNoteField value={ed.internal_note} onChange={(v) => setEd((e) => ({ ...e, internal_note: v }))} />
          <SignToggle on={ed.sign_on} onChange={(v) => setEd((e) => ({ ...e, sign_on: v }))} />
          {(() => { const n = Object.values(ed.items).reduce((a, arr) => a + arr.length, 0); return (
            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
              <button className="btn-ghost" onClick={async () => { if (await closeGuard()) setEd(null); }}>ยกเลิก</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: n > 0 ? "#16a34a" : "#dc2626" }}>{n > 0 ? `📋 มี ${n} รายการในใบ` : "⚠️ ยังไม่มีรายการ — กด ＋เพิ่ม ที่การ์ดขวา"}</span>
              <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {saving ? "กำลังบันทึก…" : "บันทึก BOQ"}{n > 0 ? ` (${n})` : ""}</button>
            </div>
          ); })()}
        </div>
        <ItemBrowser mats={mats} onAdd={browserAdd} matTargets={[{ id: "charged", label: "คิดเงิน" }, { id: "free", label: "แถม" }]} />
        </div>
        {aiOpen && <BoqAiModal onClose={() => setAiOpen(false)} onApply={(lines) => { applyAiLines(lines); flash(`AI ร่างเข้าใบแล้ว ${lines.length} รายการ — ตรวจ/แก้ได้เลย`); setAiOpen(false); }} flash={flash} />}
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
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / เบอร์โทร / หมายเหตุ" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้าง BOQ</button>}
        </div>
      </div>
      {(() => {
        // base หลังค้นหา+ช่วงวันที่ — ใช้นับจำนวนบนชิปตัวกรองประเภทงาน (CRM)
        // กรองด้วยวันที่เดียวกับที่การ์ดแสดง (issue_date) ไม่ใช่วันที่สร้างแถว — ใบที่ลงวันที่ย้อนหลัง
        // เคยหลุดช่วงที่เลือกทั้งที่บนการ์ดขึ้นวันที่ในช่วง · ใบเก่าก่อน mig 119 ไม่มี issue_date → ใช้ created_at
        const fl0 = list.filter((bo) => inDateRange(bo.issue_date || bo.created_at, dateR) && (matchText(search, bo.boq_no, bo.customerName, bo.contactName, bo.title, bo.note, bo.internal_note) || matchPhone(search, bo.contactPhone)));
        const nType = (v) => fl0.filter((bo) => v === "all" || bo.job_type === v).length;
        const fl = fl0.filter((bo) => (typeF === "all" || bo.job_type === typeF) && (!byPerson || (bo.createdByName || "") === byPerson));
        // จำนวนตัวกรองที่ใช้อยู่ (ต่างจากค่าเริ่มต้น) — โชว์บนแถบตัวกรองยุบได้
        // ช่วงวันที่นับเป็น active เฉพาะเมื่อต่างจากค่าเริ่มต้น 6 เดือนล่าสุด (ไม่งั้นจะขึ้น 1 ตลอด)
        const _dfltR = defaultDocRange();
        const dateActive = (dateR.from || dateR.to) && !(dateR.from === _dfltR.from && dateR.to === _dfltR.to);
        const activeCount = (typeF !== "all" ? 1 : 0) + (byPerson ? 1 : 0) + (dateActive ? 1 : 0);
        return (<>
      <FilterBar id="boq" count={activeCount}>
      <div className="cat-filter">
        {[["all", "ทุกประเภทงาน"], ...JOB_TYPES.map(([v, l, ic]) => [v, `${ic} ${l}`])].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (typeF === v ? " on" : "")} onClick={() => setTypeF(v)}
            style={typeF === v ? { background: "#0891b2", color: "#fff", borderColor: "#0891b2" } : {}}>{l} ({nType(v)})</button>
        ))}
        <DateRangeBar value={dateR} onChange={setDateR} hidden={dateHidden} />
        {creatorOpts.length > 0 && (
          <select className="inp" style={{ width: "auto", flex: "none" }} value={byPerson} onChange={(e) => setByPerson(e.target.value)}>
            <option value="">👤 ผู้สร้างทั้งหมด</option>
            {creatorOpts.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>
      </FilterBar>
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
          internal unitHead="ต้นทุน/หน่วย" amountHead="ต้นทุนรวม"
          customer={{ name: printB.customerName, code: custCode(printB.customerCode), address: printB.customerAddr, contactName: printB.mainContactName, contactPhone: printB.mainContactPhone, siteName: printB.siteName, siteAddress: printB.siteAddress, siteContactName: printB.siteContactName, siteContactPhone: printB.siteContactPhone, mapUrl: printB.mapUrl }}
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

// บรีฟสำเร็จรูป — กดใส่เร็ว ๆ
const BRIEF_CHIPS = [
  "ยี่ห้อ Daikin เท่านั้น", "ยี่ห้อ Carrier เท่านั้น", "ยี่ห้อ Mitsubishi เท่านั้น",
  "เลือกรุ่น Inverter เบอร์ 5 เน้นประหยัดไฟ", "ฉนวนหนา 3/4 นิ้ว", "ฉนวนหนา 1/2 นิ้ว",
  "รวมขายึด/แท่นวางคอยล์ร้อน", "ไม่รวมอุปกรณ์ซัพพอร์ต (ลูกค้ามีเอง)",
  "เดินท่อในฝ้า", "ท่อยาวพิเศษ ~15 เมตร/จุด", "รวมงานรื้อเครื่องเก่า", "รวมงานเดินสายไฟ",
];

// โมดัลช่วยร่าง BOQ จากแบบ (Claude vision)
function BoqAiModal({ onClose, onApply, flash }) {
  const [files, setFiles] = React.useState([]);   // [{url, name, isPdf}]
  const [uploading, setUploading] = React.useState(false);
  const [spec, setSpec] = React.useState("");
  const [brief, setBrief] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);   // { summary, lines }

  async function onFiles(e) {
    const list = [...(e.target.files || [])]; if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        const url = isPdf ? await uploadDocFile(f, "pdf", "application/pdf") : await uploadExpenseFile(f);
        setFiles((s) => [...s, { url, name: f.name, isPdf }]);
      }
    } catch (ex) { flash("อัปโหลดไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false); e.target.value = "";
  }
  const addChip = (t) => setBrief((b) => (b.trim() ? b.trim() + " · " + t : t));

  async function run() {
    if (!files.length && !spec.trim()) return flash("ใส่รูปแบบ หรือ วางรายการสเปคก่อน", true);
    setBusy(true); setResult(null);
    try {
      const j = await aiDraftBoq({ imageUrls: files.map((f) => f.url), spec, brief });
      if (!(j.lines || []).length && !(j.questions || []).length && !(j.diag || []).length) { flash(j.summary || "AI ร่างไม่ได้ — ลองเพิ่มรายละเอียด/แบบให้ชัดขึ้น", true); setBusy(false); return; }
      setResult({ ...j, lines: j.lines || [], questions: j.questions || [], diag: j.diag || [] });
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  const SEC_TH = { ac: "เครื่องแอร์", charged: "วัสดุคิดเงิน", free: "วัสดุแถม", service: "ค่าบริการ" };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "94vw", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-head"><div className="modal-title">🤖 ช่วยร่าง BOQ จากแบบ</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          {!result ? (<>
            <label className="fld"><span>1) แบบ/แปลน/รูปหน้างาน <span className="jo-dim" style={{ fontWeight: 400 }}>(รูป หรือ PDF · ใส่ได้หลายไฟล์)</span></span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {files.map((f, i) => (
                  <div key={i} style={{ position: "relative", border: "1px solid var(--line)", borderRadius: 8, padding: f.isPdf ? "8px 10px" : 0, overflow: "hidden" }}>
                    {f.isPdf ? <span style={{ fontSize: 12 }}>📄 {f.name.slice(0, 18)}</span> : <img src={f.url} alt="" style={{ width: 60, height: 60, objectFit: "cover", display: "block" }} />}
                    <button type="button" onClick={() => setFiles((s) => s.filter((_, j) => j !== i))} style={{ position: "absolute", top: 0, right: 0, background: "#dc2626", color: "#fff", border: "none", borderRadius: "0 0 0 6px", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "2px 5px" }}>×</button>
                  </div>
                ))}
                <label className="btn-ghost sm" style={{ cursor: "pointer" }}>📎 {uploading ? "กำลังอัปโหลด…" : "แนบแบบ/รูป"}
                  <input type="file" accept="image/*,application/pdf" multiple onChange={onFiles} style={{ display: "none" }} disabled={uploading} />
                </label>
              </div>
            </label>
            <label className="fld"><span>2) รายการ/สเปค <span className="jo-dim" style={{ fontWeight: 400 }}>(ไม่บังคับ — ถ้าแบบมีจำนวน+ขนาด BTU ครบแล้ว เว้นว่างได้ · AI จะอ่านจากแบบเอง)</span></span>
              <textarea className="inp" rows={4} style={{ resize: "vertical" }} value={spec} onChange={(e) => setSpec(e.target.value)} placeholder={"เช่น\nห้องนอน1  12000 BTU  1 เครื่อง\nห้องนั่งเล่น  24000 BTU  1 เครื่อง\nสำนักงานชั้น2  18000 BTU  3 เครื่อง"} /></label>
            <label className="fld"><span>3) บรีฟถึง AI <span className="jo-dim" style={{ fontWeight: 400 }}>(ความต้องการลูกค้า/เงื่อนไขงาน)</span></span>
              <textarea className="inp" rows={2} style={{ resize: "vertical" }} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="เช่น ลูกค้าอยากได้ Daikin Inverter · ฉนวน 3/4 นิ้ว · รวมขายึด · เดินท่อในฝ้า" /></label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: -4 }}>
              {BRIEF_CHIPS.map((c) => <button key={c} type="button" className="cat-chip" style={{ fontSize: 11.5 }} onClick={() => addChip(c)}>+ {c}</button>)}
            </div>
          </>) : (<>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>📋 <b>AI สรุป:</b> {result.summary || "-"}</div>
            {result.diag?.length > 0 && (
              <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 12px", marginBottom: 10, fontSize: 12 }}>
                <b>📎 ไฟล์ที่ส่งเข้า AI:</b>
                <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{result.diag.map((d, i) => <li key={i} style={{ color: d.includes("✓") ? "var(--ink-2)" : "#dc2626" }}>{d}</li>)}</ul>
              </div>
            )}
            {result.raw && (
              <details style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "6px 12px", marginBottom: 10, fontSize: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>🔎 ข้อความดิบจาก AI (เผื่อส่งให้ทีมช่วยดู)</summary>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "6px 0 0", maxHeight: "30vh", overflowY: "auto" }}>{result.raw}</pre>
              </details>
            )}
            {result.questions?.length > 0 && (
              <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>
                <b>❓ AI อยากขอข้อมูลเพิ่ม (เพื่อร่างให้แม่นขึ้น):</b>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                <div className="jo-dim" style={{ marginTop: 4 }}>ตอบในช่องบรีฟ แล้วกด "↩ แก้ข้อมูล/ร่างใหม่" เพื่อให้ AI ร่างใหม่ให้แม่นขึ้น</div>
              </div>
            )}
            <div className="jo-dim" style={{ marginBottom: 6 }}>ร่าง {result.lines.length} รายการ (⚠️ = ต้องตรวจ) — กด "เติมเข้าใบ" แล้วแก้จำนวน/ราคาต่อได้</div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 8, maxHeight: "48vh", overflowY: "auto" }}>
              {result.lines.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--line-2)", fontSize: 13 }}>
                  <span style={{ flex: "0 0 78px", color: "#7c3aed", fontWeight: 600 }}>{SEC_TH[l.section] || l.section}</span>
                  <span style={{ flex: 1 }}>{l.code ? <b style={{ color: "var(--ink-3)", fontWeight: 500 }}>{l.code} · </b> : null}{l.name}{l.description ? <div className="jo-dim">{l.description}</div> : null}</span>
                  <span style={{ flex: "0 0 90px", textAlign: "right" }}>{fmtNum(l.qty)} {l.unit}</span>
                  <span style={{ flex: "0 0 90px", textAlign: "right", fontWeight: 600 }}>{fmtBaht(l.unit_cost)}</span>
                </div>
              ))}
            </div>
          </>)}
        </div>
        <div className="modal-foot" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>ปิด</button>
          {!result
            ? <button className="btn-primary" style={{ flex: 1, background: "#7c3aed", borderColor: "#7c3aed" }} disabled={busy || uploading} onClick={run}>{busy ? "🤖 AI กำลังอ่านแบบ…" : "🤖 ร่าง BOQ"}</button>
            : <><button className="btn-ghost" style={{ flex: result.lines.length ? "none" : 1 }} onClick={() => setResult(null)}>↩ แก้ข้อมูล/ร่างใหม่</button>
              {result.lines.length > 0 && <button className="btn-primary" style={{ flex: 1 }} onClick={() => onApply(result.lines)}><UIcon name="check" size={15} color="#fff" /> เติมเข้าใบ ({result.lines.length})</button>}</>}
        </div>
      </div>
    </div>
  );
}
