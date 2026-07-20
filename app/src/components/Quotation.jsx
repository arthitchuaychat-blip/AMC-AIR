import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listQuotations, saveQuotation, deleteQuotation, setQuotationStatus, listCustomers, listMaterialsLite, listBoqs, getCompanies, listDocLinks, syncBoqItems, docNoTaken } from "../lib/api";
import DocSlip from "./DocSlip";
import NumIn from "./NumIn";
import DocTerms from "./DocTerms";
import { useFormDraft } from "../lib/useFormDraft";
import { DocNoteField, InternalNoteField, InternalNoteTag, SignToggle } from "./InternalNote";
import { mySignature, defaultSignOn } from "../lib/sign";
import DocChips from "./DocChips";
import DocCardHead from "./DocCard";
import ChatCustomerLink from "./ChatCustomerLink";
import DateRangeBar, { inDateRange, defaultDocRange } from "./DateRangeBar";
import GrowArea from "./GrowArea";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import { jobTypeDef } from "../lib/schedule";
import { fmtBaht, custCode, matchText, matchPhone, fmtDocDate } from "../lib/format";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";
import ItemPicker from "./ItemPicker";
import ItemBrowser from "./ItemBrowser";
import UnitPick, { unitFactor } from "./UnitPick";
import { useDocPeek } from "./DocPeek";

// ⚠️ ต้องมีทุกสถานะที่ setQuotationStatus เขียนได้ — สถานะที่ขาดจะตกไป fallback แล้วโชว์ป้ายผิด
const STATUS = {
  draft: { th: "ร่าง", cls: "b-grey" }, sent: { th: "ส่งแล้ว", cls: "b-blue" },
  approved: { th: "อนุมัติ", cls: "b-green" }, rejected: { th: "ปฏิเสธ", cls: "b-red" }, expired: { th: "หมดอายุ", cls: "b-grey" },
  cancelled: { th: "ยกเลิกแล้ว", cls: "b-red" },
};
const STATUS_OPTS = [["draft", "ร่าง"], ["sent", "ส่งแล้ว"], ["approved", "อนุมัติ"], ["rejected", "ปฏิเสธ"], ["expired", "หมดอายุ"]];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `QT-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Quotation({ role, focus, onFocusConsumed, fromBoq, onFromBoqConsumed, onCreateInvoice, onCreateJob, onCreatePo, onOpenBoq, onOpenJob, onOpenDoc, onGoChat }) {
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ชิปเชื่อมโยง → พรีวิวแผงขวาก่อน
  const canEdit = can(role, "quote", "edit");
  const canDelete = role === "admin"; // ลบจริงได้เฉพาะธุรการ
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [boqs, setBoqs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printQ, setPrintQ] = React.useState(null);
  const [saving, setSaving] = React.useState(false);   // กันกดบันทึกซ้ำตอนเน็ตช้า
  // ร่างอัตโนมัติ — เหตุผลเดียวกับ BOQ (Back ของ Android / แท็บถูกรีโหลด)
  const { draftKey, clearOnSaved, closeGuard } = useFormDraft(ed, setEd, { kind: "quote", idOf: (e) => (e._edit ? e.quote_no : null), label: "ใบเสนอราคา" });
  const [statusF, setStatusF] = React.useState("all");
  const [vatF, setVatF] = React.useState("all"); // all | vat | novat
  const [docF, setDocF] = React.useState("all"); // all | no_invoice | no_job
  const [dateR, setDateR] = React.useState(defaultDocRange);   // เปิดมาเห็น 6 เดือนล่าสุด · เก่ากว่านั้นกด "ดูทั้งหมด"
  // ใบที่ถูกช่วงวันที่ตัดออก — ต้องบอกจำนวนบนแถบตัวกรอง ห้ามซ่อนเงียบ ๆ
  const dateHidden = React.useMemo(() => (list || []).filter((x) => !inDateRange(x.issue_date, dateR)).length, [list, dateR]);
  const [search, setSearch] = React.useState("");
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  async function load() {
    setLoading(true);
    try { const [q, c, m, b, co, dl] = await Promise.all([listQuotations(), listCustomers(), listMaterialsLite(), listBoqs(), getCompanies(), listDocLinks()]); setList(q); setCusts(c); setMats(m); setBoqs(b); setCompanies(co || { vat: {}, novat: {} }); setDocLinks(dl); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printQ) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintQ(null); }, 120); return () => clearTimeout(t); }, [printQ]);
  // open focused on a specific quote (from the dashboard report link)
  // เปิดเจาะจงใบ (มาจากลิงก์/ชิปเชื่อมโยง) → ล้างช่วงวันที่ ไม่งั้นใบเก่ากว่า 6 เดือนจะขึ้นว่าไม่พบ
  React.useEffect(() => { if (!focus) return; setEd(null); setStatusF("all"); setDateR({ from: "", to: "" }); setSearch(focus); onFocusConsumed && onFocusConsumed(); }, [focus]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  function startNew() { setEd({ quote_no: genNo(), customer_id: "", site_id: "", boq_no: "", job_type: "", title: "", status: "draft", issue_date: today(), valid_until: "", discount_type: "amount", discount_value: 0, vat: true, wht: false, wht_rate: 3, pay_method: "cash", note: "", internal_note: "", sign_on: defaultSignOn(), terms_payment: "", terms_freebies: "", terms_warranty: "", items: [] }); }
  // create a new quotation prefilled from a BOQ (customer/site + pulled items)
  function startFromBoq(boqNo) {
    const b = boqs.find((x) => x.boq_no === boqNo); if (!b) return;
    const c = custs.find((x) => String(x.id) === String(b.customer_id));
    const items = b.items.filter((x) => ["ac", "charged", "service"].includes(x.section)).map((x) => {
      const m = matMap[x.item_code];
      return { code: x.item_code, name: x.name || m?.th, unit: x.unit || m?.unit, qty: Number(x.qty), unit_price: m?.salePrice || 0, kind: m?.kind, description: x.description || m?.description || "" };
    });
    setEd({ quote_no: genNo(), customer_id: b.customer_id || "", site_id: b.site_id || "", boq_no: boqNo, job_type: b.job_type || "", title: b.title || "", status: "draft", issue_date: today(), valid_until: "", discount_type: "amount", discount_value: 0, vat: c?.vat ?? true, wht: false, wht_rate: 3, pay_method: "cash", note: b.note || "", internal_note: b.internal_note || "", sign_on: defaultSignOn(), terms_payment: b.terms_payment || "", terms_freebies: b.terms_freebies || "", terms_warranty: b.terms_warranty || "", items });
  }
  React.useEffect(() => { if (!fromBoq || !boqs.length) return; startFromBoq(fromBoq); onFromBoqConsumed && onFromBoqConsumed(); }, [fromBoq, boqs]);
  // chain lock: can't edit/delete a quotation that already has an invoice or job order downstream
  const lockMsg = (q) => (q.hasInvoice || q.hasJob)
    ? `แก้ไข/ลบใบเสนอราคานี้ไม่ได้ — มี${[q.hasInvoice && "ใบแจ้งหนี้", q.hasJob && `ใบงาน ${q.jobNo || ""}`].filter(Boolean).join(" และ ")}แล้ว\nต้องลบเอกสารถัดไป (ใบแจ้งหนี้/ใบเสร็จ/ใบงาน) ก่อน`
    : null;
  function startEdit(q) {
    // ล็อกใบอนุมัติแล้ว — ราคา/รายการคือสัญญากับลูกค้า ถ้าจำเป็นต้องแก้ ให้ "คืนสถานะแก้ไข" ก่อน (ลงประวัติ)
    if (q.status === "approved") return alert(`ใบเสนอราคา ${q.quote_no} อนุมัติแล้ว — แก้ไขไม่ได้\nถ้าจำเป็นต้องแก้ กดปุ่ม "คืนสถานะแก้ไข" บนการ์ดก่อน (ระบบบันทึกเหตุผลไว้ในประวัติ)`);
    const lk = lockMsg(q); if (lk) return alert(lk);
    setEd({ _edit: true, quote_no: q.quote_no, customer_id: q.customer_id || "", site_id: q.site_id || "", boq_no: q.boq_no || "", job_type: q.job_type || "", title: q.title || "", status: q.status, issue_date: q.issue_date || today(), valid_until: q.valid_until || "", discount_type: q.discount_type || "amount", discount_value: q.discount_value || 0, vat: q.vat, wht: !!q.wht, wht_rate: q.wht_rate || 3, pay_method: q.pay_method || "cash", note: q.note || "", internal_note: q.internal_note || "", sign_on: !!q.sign_url, terms_payment: q.terms_payment || "", terms_freebies: q.terms_freebies || "", terms_warranty: q.terms_warranty || "", approved_at: q.approved_at,
      items: q.items.map((x) => ({ code: x.item_code, name: x.name, unit: x.unit, qty: Number(x.qty), unit_price: Number(x.unit_price), discount: Number(x.discount) || 0, kind: x.kind, description: x.description || "" })) });
  }
  // ไม่มี "สร้างซ้ำ" ในใบเสนอราคา — กติกาบริษัท: เอกสารขายเริ่มจาก BOQ เสมอ (อยากได้ใบคล้ายกัน → สร้างซ้ำที่ BOQ แล้วออกใบเสนอจากตรงนั้น)

  const cust = custs.find((c) => String(c.id) === String(ed?.customer_id));
  // BOQ ให้เลือกอ้าง: ของลูกค้าคนนี้ + ไม่นับใบที่ยกเลิก (ยกเว้นใบที่เลือกค้างไว้อยู่แล้ว — เอกสารเก่า)
  const custBoqs = boqs.filter((b) => (!ed?.customer_id || String(b.customer_id) === String(ed?.customer_id))
    && (b.status !== "cancelled" || b.boq_no === ed?.boq_no));

  function setQ(k, v) { setEd((e) => ({ ...e, [k]: v })); }
  function onCustomer(id) {
    const c = custs.find((c) => String(c.id) === String(id));
    const isCompany = c?.type === "company";
    setEd((e) => ({ ...e, customer_id: id, site_id: "", vat: c?.vat ?? true, wht: isCompany ? e.wht : false }));
  }
  const addLine = (m, _target, qty = 1) => setEd((e) => {
    const add = Number(qty) || 1;
    const i = e.items.findIndex((x) => x.code === m.code);
    if (i >= 0) { const items = [...e.items]; items[i] = { ...items[i], qty: items[i].qty + add }; return { ...e, items }; }
    return { ...e, items: [...e.items, { code: m.code, name: m.th, unit: m.unit, qty: add, unit_price: m.salePrice || 0, kind: m.kind, description: m.description || "" }] };
  });
  const setLine = (i, k, v) => setEd((e) => ({ ...e, items: e.items.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
  // สินค้า 2 หน่วย (เมตร/ม้วน): เปลี่ยนหน่วยนับของบรรทัด → แปลงราคา/หน่วยตามสัดส่วน (ราคา/หน่วยหลักคงเดิม)
  const setLineUnit = (i, m, u) => setEd((e) => ({ ...e, items: e.items.map((x, j) => {
    if (j !== i) return x;
    const ratio = unitFactor(m, u) / unitFactor(m, x.unit || m.unit);
    return { ...x, unit: u, unit_price: Math.round(((Number(x.unit_price) || 0) * ratio) * 100) / 100 };
  }) }));
  const delLine = (i) => setEd((e) => ({ ...e, items: e.items.filter((_, j) => j !== i) }));
  const moveLine = (i, dir) => setEd((e) => { const a = [...e.items]; const j = i + dir; if (j < 0 || j >= a.length) return e; [a[i], a[j]] = [a[j], a[i]]; return { ...e, items: a }; });

  function pullFromBoq() {
    const b = boqs.find((x) => x.boq_no === ed.boq_no); if (!b) return flash("เลือก BOQ ก่อน", true);
    const existing = new Set((ed.items || []).map((it) => it.code || it.name));
    const pulled = b.items.filter((x) => ["ac", "charged", "service"].includes(x.section)).map((x) => {
      const m = matMap[x.item_code];
      return { code: x.item_code, name: x.name || m?.th, unit: x.unit || m?.unit, qty: Number(x.qty), unit_price: m?.salePrice || 0, kind: m?.kind, description: x.description || m?.description || "" };
    }).filter((it) => !existing.has(it.code || it.name)); // add only items not already in the quote (keeps your edited prices)
    if (!pulled.length) return flash("ไม่มีรายการใหม่จาก BOQ (มีครบแล้ว)");
    setEd((e) => ({ ...e, items: [...(e.items || []), ...pulled] }));
    flash(`เพิ่ม ${pulled.length} รายการใหม่จาก ${b.boq_no} — ตรวจราคาขายแล้วบันทึก`);
  }

  // totals — วิธีการรับเงิน: ราคาบัตรปรับเข้า "ราคาต่อหน่วยของแต่ละรายการ" โดยตรง (ปัดขึ้นบาทเต็ม/หน่วย)
  // ราคาที่เก็บในระบบ = ราคาเงินสดเสมอ → สลับวิธีไปมาได้ไม่เพี้ยน · ไม่มีบรรทัดค่าธรรมเนียมท้ายเอกสาร
  const payRate = ed?.pay_method === "card_full" ? 0.04 : ed?.pay_method === "card_inst10" ? 0.14 : 0;
  const adjUnit = (u) => payRate ? Math.ceil(Math.round((Number(u) || 0) * (1 + payRate) * 100) / 100) : Number(u) || 0;
  const lineDisc = (x) => Number(x.discount) || 0;   // ส่วนลดรายรายการ (บาท/บรรทัด — mig 142)
  const itemDiscTotal = ed ? ed.items.reduce((a, x) => a + lineDisc(x), 0) : 0;
  const subtotal = ed ? ed.items.reduce((a, x) => a + Number(x.qty) * adjUnit(x.unit_price) - lineDisc(x), 0) : 0;
  const discount = ed ? (ed.discount_type === "percent" ? subtotal * Number(ed.discount_value || 0) / 100 : Number(ed.discount_value || 0)) : 0;
  const afterDisc = subtotal - discount;
  const vatAmt = ed && ed.vat ? afterDisc * 0.07 : 0;
  const grand = afterDisc + vatAmt;
  // หัก ณ ที่จ่าย — เฉพาะลูกค้านิติบุคคล และคิดจาก "ค่าบริการ" ก่อน VAT เท่านั้น (ค่าสินค้าไม่โดนหัก) — เฉลี่ยส่วนลดตามสัดส่วน
  const selCust = ed ? custs.find((c) => String(c.id) === String(ed.customer_id)) : null;
  const canWht = selCust?.type === "company";
  const svcSum = ed ? ed.items.reduce((a, x) => a + ((x.kind || matMap[x.code]?.kind) === "service" ? Number(x.qty) * adjUnit(x.unit_price) - lineDisc(x) : 0), 0) : 0;
  const whtAmt = ed && ed.wht && canWht && subtotal > 0 ? afterDisc * (svcSum / subtotal) * (Number(ed.wht_rate) || 3) / 100 : 0;
  const netPay = grand - whtAmt;

  async function save() {
    const dk = draftKey;   // เก็บไว้ก่อน — setEd(null) ตอนท้ายทำให้ draftKey กลายเป็น null
    if (!ed.items.length) return flash("เพิ่มรายการอย่างน้อย 1 รายการ", true);
    // กติกาบริษัท: เอกสารขายทุกใบต้องเริ่มจาก BOQ — ใบใหม่ต้องอ้าง BOQ เสมอ (ใบเก่าที่ไม่มีแก้ไขต่อได้)
    if (!ed._edit && !ed.boq_no) return flash("ใบเสนอราคาต้องเริ่มจาก BOQ — เลือก BOQ ที่ช่อง 'อ้างอิง BOQ' หรือไปสร้างจากเมนู BOQ (ปุ่ม 'สร้างใบเสนอราคา' บนการ์ด)", true);
    // ไม่มีลูกค้า = เอกสารทั้งสายไม่มีชื่อลูกค้า (ตามหนี้ไม่ได้ · ใบกำกับภาษีใช้ไม่ได้ · เงินเข้าธนาคารไม่รู้ของใคร)
    if (!ed.customer_id) return flash("เลือกลูกค้าก่อนบันทึก — ใบเสนอราคาที่ไม่มีลูกค้าจะทำให้ใบแจ้งหนี้/ใบเสร็จที่ออกต่อไม่มีชื่อลูกค้า ตามหนี้และใช้ทางภาษีไม่ได้", true);
    if (ed._edit && !await confirmDialog(`ยืนยันบันทึกการแก้ไขใบเสนอราคา ${ed.quote_no} ?`)) return;
    setSaving(true);   // ผ่านการตรวจครบแล้วค่อยล็อกปุ่ม (ล็อกก่อนตรวจ = กรอกผิดแล้วปุ่มค้าง)
    try {
      // เลขซ้ำ = upsert ทับใบเดิมเงียบ ๆ — ใบใหม่ต้องเช็คก่อน ชนแล้วออกเลขใหม่ให้อัตโนมัติ
      let quoteNo = ed.quote_no;
      if (!ed._edit && await docNoTaken("quotations", quoteNo)) {
        const fresh = genNo();
        if (fresh === quoteNo || await docNoTaken("quotations", fresh)) return flash(`เลขที่ ${quoteNo} ถูกใช้แล้ว — แก้เลขที่ก่อนบันทึก`, true);
        quoteNo = fresh;
      }
      // ส่วนลดรายบรรทัดห้ามเกินมูลค่าบรรทัด — กันบรรทัดติดลบไหลไปถึงยอดรวม/หัก ณ ที่จ่าย
      const items = ed.items.map((x) => ({ ...x, discount: Math.min(Number(x.discount) || 0, Math.round(Number(x.qty) * adjUnit(x.unit_price) * 100) / 100) }));
      const sig = ed.sign_on ? mySignature() : null;
      await saveQuotation({ ...ed, quote_no: quoteNo, sign_url: sig?.url || null, sign_name: sig?.name || null }, items);
      // sync new items back into the linked BOQ (add only — never removes BOQ items)
      let synced = 0;
      if (ed.boq_no) {
        const rows = (ed.items || []).map((it) => ({
          section: it.kind === "ac" ? "ac" : it.kind === "service" ? "service" : "charged",
          item_code: it.code || null, name: it.name, unit: it.unit, qty: it.qty,
          unit_cost: matMap[it.code]?.cost ?? 0, description: it.description || "",
        }));
        try { synced = await syncBoqItems(ed.boq_no, rows); } catch { /* non-fatal */ }
      }
      const renum = quoteNo !== ed.quote_no ? ` · ⚠️ เลขที่เดิมชนกับใบอื่น — ใบนี้ได้เลขใหม่ ${quoteNo}` : "";
      flash((synced > 0 ? `บันทึกแล้ว · ซิงค์ ${synced} รายการเข้า ${ed.boq_no}` : "บันทึกใบเสนอราคาแล้ว") + renum);
      clearOnSaved(dk); setEd(null); await load();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    finally { setSaving(false); }
  }
  // ลำดับการยกเลิก: ใบสั่งซื้อที่ยังไม่ยกเลิกก็ล็อกใบเสนอราคาด้วย (ยกเลิกจากเอกสารล่าสุดย้อนกลับ)
  const cancelLockMsg = (q) => {
    const lk = lockMsg(q); if (lk) return lk;
    const pos = docLinks.byQuote[q.quote_no]?.poNos || [];
    return pos.length ? `ยกเลิก/ลบใบเสนอราคานี้ไม่ได้ — มีใบสั่งซื้อ ${pos.join(", ")} ผูกอยู่\nต้องยกเลิกใบสั่งซื้อก่อน (ยกเลิกจากเอกสารล่าสุดย้อนกลับ)` : null;
  };
  async function del(q) { const lk = cancelLockMsg(q); if (lk) return alert(lk); const reason = await confirmDialog({ title: `ลบใบเสนอราคา ${q.quote_no}?`, message: "ข้อมูลจะถูกเก็บไว้ในประวัติการลบ (กู้คืนได้)", confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ทำผิด · ซ้ำ", required: true } }); if (reason === false) return; try { await deleteQuotation(q.quote_no, reason); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  async function cancel(q) { const lk = cancelLockMsg(q); if (lk) return alert(lk); const reason = await confirmDialog({ title: `ยกเลิกใบเสนอราคา ${q.quote_no}?`, message: "เก็บประวัติไว้ · ตัดออกจากกำไร", confirmText: "ยกเลิกใบนี้", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น ลูกค้าไม่อนุมัติ · เสนอใหม่", required: true } }); if (reason === false) return; try { await setQuotationStatus(q.quote_no, "cancelled", reason); flash("ยกเลิกแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  async function approve(q) {
    if (!await confirmDialog(`ยืนยันอนุมัติใบเสนอราคา ${q.quote_no} ?`)) return;
    try { await setQuotationStatus(q.quote_no, "approved"); flash(`อนุมัติ ${q.quote_no} แล้ว ✓`); await load(); }
    catch (e) { flash("อนุมัติไม่สำเร็จ: " + (e.message || e), true); }
  }
  // คืนสถานะใบที่อนุมัติแล้วกลับเป็น "ส่งแล้ว" เพื่อแก้ไข — บังคับเหตุผล + ลงประวัติ (ทางเดียวที่จะแก้ใบอนุมัติ)
  async function unapprove(q) {
    const reason = await confirmDialog({ title: `คืนสถานะ ${q.quote_no} เป็น "ส่งแล้ว" เพื่อแก้ไข?`, message: "ใบนี้อนุมัติไปแล้ว — การคืนสถานะถูกบันทึกในประวัติพร้อมเหตุผล", confirmText: "คืนสถานะ", prompt: { label: "เหตุผลที่ขอแก้", placeholder: "เช่น แก้ราคา · เพิ่มรายการ", required: true } });
    if (reason === false) return;
    try { await setQuotationStatus(q.quote_no, "sent", reason); flash("คืนสถานะแล้ว — แก้ไขได้ · เสร็จแล้วอย่าลืมกดอนุมัติใหม่"); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }

  // ---------- EDITOR ----------
  if (ed) {
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">ใบเสนอราคา <span className="page-title-en">Quotation</span></h1>
          <p className="page-sub">ดึงจาก BOQ ได้ (ไม่รวมของแถม) · ส่วนลด · VAT · ราคาขาย</p></div></div>
        <div className="doc-edit-wrap">
        <div className="card" style={{ flex: 1, maxWidth: 860 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่ใบเสนอราคา</span><input className="inp" value={ed.quote_no} onChange={(e) => setQ("quote_no", e.target.value)} /></label>
            <label className="fld"><span>ชื่องาน</span><input className="inp" value={ed.title} onChange={(e) => setQ("title", e.target.value)} placeholder="เช่น ติดตั้งแอร์ออฟฟิศ" /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ลูกค้า</span>
              <Combo className="inp" value={ed.customer_id} onChange={(e) => onCustomer(e.target.value)}>
                <option value="">— เลือกลูกค้า —</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Combo>
            </label>
            <label className="fld"><span>ไซต์งาน</span>
              <Combo className="inp" value={ed.site_id} onChange={(e) => setQ("site_id", e.target.value)} disabled={!cust?.sites?.length}>
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

          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={ed.issue_date} onChange={(e) => setQ("issue_date", e.target.value)} /></label>
            <label className="fld"><span>ยืนราคาถึง</span><input className="inp" type="date" value={ed.valid_until} onChange={(e) => setQ("valid_until", e.target.value)} /></label>
          </div>

          {/* pull from BOQ */}
          <div className="fld"><span>ดึงรายการจาก BOQ (เพิ่มเฉพาะรายการใหม่ · ไม่ทับของเดิม)</span>
            <div className="line-add">
              {/* เลือก BOQ แล้วดึง ลูกค้า/ไซต์/VAT มาให้ด้วย (ถ้ายังไม่ได้เลือก) — เดิมได้แค่เลข BOQ ทำให้บันทึกใบที่ไม่มีลูกค้าได้ */}
              <Combo className="inp" value={ed.boq_no} onChange={(e) => {
                const v = e.target.value; const b = boqs.find((x) => x.boq_no === v);
                setEd((s) => {
                  const next = { ...s, boq_no: v, job_type: b?.job_type || s.job_type || "" };
                  if (b && !s.customer_id) {
                    next.customer_id = b.customer_id || "";
                    next.site_id = b.site_id || "";
                    if (!s.title) next.title = b.title || "";
                    const c = custs.find((x) => String(x.id) === String(b.customer_id));
                    if (c) next.vat = c.vat ?? true;   // ลูกค้าไม่ VAT ต้องไม่โดนบวก 7% + ใช้หัวกระดาษถูกบริษัท
                  }
                  return next;
                });
              }}>
                <option value="">{ed._edit ? "— ไม่อ้าง BOQ —" : "— เลือก BOQ (จำเป็น) —"}</option>{custBoqs.map((b) => <option key={b.boq_no} value={b.boq_no}>{b.boq_no}{b.title ? ` · ${b.title}` : ""}</option>)}
              </Combo>
              <button className="btn-ghost sm" onClick={pullFromBoq} disabled={!ed.boq_no}><UIcon name="box" size={14} /> ดึงรายการ</button>
            </div>
          </div>

          {/* add item */}
          <div className="fld"><span>เพิ่มรายการ (สินค้า/บริการ)</span>
            <ItemPicker items={mats} placeholder="ค้นหาสินค้า/บริการ หรือกดลูกศร…" onPick={addLine} />
          </div>

          {ed.items.length > 0 && (
            <div className="line-list">
              {ed.items.map((it, i) => (
                <div className={"line-item li-" + (it.kind || "material")} key={i}>
                  <div className="boq-line">
                    <div className="line-info"><div className="line-name">{it.name}</div><div className="line-sub">{it.code || "-"}</div></div>
                    <div className="inp inp-unit boq-in"><NumIn className="" autoWidth min="0" value={it.qty} onChange={(n) => setLine(i, "qty", Math.max(0, n))} /><UnitPick m={matMap[it.code]} value={it.unit} onChange={(u) => setLineUnit(i, matMap[it.code], u)} /></div>
                    <div className="inp inp-unit boq-in"><span className="unit-pre">฿</span><NumIn className="" autoWidth min="0" step="0.01"
                      value={payRate ? adjUnit(it.unit_price) : it.unit_price}
                      onChange={(n) => setLine(i, "unit_price", payRate ? n / (1 + payRate) : n)} /></div>
                    <div className="inp inp-unit boq-in" title="ส่วนลดรายการนี้ (บาท) — ไม่เกินมูลค่าบรรทัด" style={lineDisc(it) > 0 ? { borderColor: "#fca5a5" } : {}}>
                      <span className="unit-pre" style={{ color: "var(--down)" }}>ลด</span><NumIn className="" autoWidth min="0" step="0.01" value={it.discount || 0} onChange={(n) => setLine(i, "discount", Math.min(Math.max(0, n), Math.round(Number(it.qty) * adjUnit(it.unit_price) * 100) / 100))} /></div>
                    <span className="boq-amt">{fmtBaht(it.qty * adjUnit(it.unit_price) - lineDisc(it))}</span>
                    <div className="line-move">
                      <button className="line-mv" disabled={i === 0} onClick={() => moveLine(i, -1)} title="เลื่อนขึ้น"><UIcon name="chevD" size={13} style={{ transform: "rotate(180deg)" }} /></button>
                      <button className="line-mv" disabled={i === ed.items.length - 1} onClick={() => moveLine(i, 1)} title="เลื่อนลง"><UIcon name="chevD" size={13} /></button>
                    </div>
                    <button className="line-x" onClick={() => delLine(i)}><UIcon name="x" size={14} /></button>
                  </div>
                  <GrowArea className="inp line-desc" placeholder="รายละเอียดสินค้า (Enter ขึ้นบรรทัดใหม่ได้ · แสดงใต้ชื่อในเอกสาร — แก้เฉพาะใบนี้)" value={it.description || ""} onChange={(e) => setLine(i, "description", e.target.value)} />
                </div>
              ))}
            </div>
          )}

          {/* discount + vat + totals */}
          <div className="fld-row">
            <label className="fld"><span>ส่วนลด</span>
              <div className="line-add">
                <Combo className="inp" style={{ width: 90, flex: "none" }} value={ed.discount_type} onChange={(e) => setQ("discount_type", e.target.value)}>
                  <option value="amount">บาท</option><option value="percent">%</option>
                </Combo>
                <NumIn className="inp" min="0" value={ed.discount_value} onChange={(n) => setQ("discount_value", n)} />
              </div>
            </label>
            <label className="fld"><span>ภาษีมูลค่าเพิ่ม</span>
              <button type="button" className={"vat-toggle" + (ed.vat ? " on" : "")} onClick={() => setQ("vat", !ed.vat)}>{ed.vat ? "คิด VAT 7%" : "ไม่คิด VAT"}</button>
            </label>
          </div>

          {/* วิธีการรับเงิน — ค่าเริ่มต้นเงินสด · บัตรบวกค่าธรรมเนียมอัตโนมัติ */}
          <div className="fld-row">
            <label className="fld"><span>วิธีการรับเงิน</span>
              <div className="line-add" style={{ flexWrap: "wrap" }}>
                {[["cash", "💵 เงินสด/โอน"], ["card_full", "💳 บัตรรูดเต็ม"], ["card_inst10", "💳 ผ่อนบัตร 10 เดือน"]].map(([v, l]) => (
                  <button key={v} type="button" className={"vat-toggle" + ((ed.pay_method || "cash") === v ? " on" : "")}
                    style={{ flex: "none" }} onClick={() => setQ("pay_method", v)}>{l}</button>
                ))}
              </div>
            </label>
          </div>
          {canWht && (
          <div className="fld-row">
            <label className="fld"><span>หัก ณ ที่จ่าย <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(ลูกค้านิติบุคคล)</span></span>
              <div className="line-add">
                <button type="button" className={"vat-toggle" + (ed.wht ? " on" : "")} style={{ flex: 1 }} onClick={() => setQ("wht", !ed.wht)}>{ed.wht ? "หัก ณ ที่จ่าย" : "ไม่หัก ณ ที่จ่าย"}</button>
                <div className="inp inp-unit" style={{ width: 110, flex: "none", opacity: ed.wht ? 1 : .5 }}>
                  <NumIn className="" min="0" step="0.1" value={ed.wht_rate} disabled={!ed.wht} onChange={(n) => setQ("wht_rate", n)} /><span className="unit-suf">%</span>
                </div>
              </div>
            </label>
            <div className="fld" />
          </div>
          )}

          <div className="qt-totals">
            {itemDiscTotal > 0 && <div><span>ส่วนลดรายรายการรวม (หักในแต่ละบรรทัดแล้ว)</span><b style={{ color: "var(--down)" }}>− {fmtBaht(itemDiscTotal)}</b></div>}
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(subtotal)}</b></div>
            {discount > 0 && <div><span>ส่วนลด</span><b style={{ color: "var(--down)" }}>− {fmtBaht(discount)}</b></div>}
            {discount > 0 && <div><span>ยอดหลังหักส่วนลด</span><b>{fmtBaht(afterDisc)}</b></div>}
            {ed.vat && <div><span>VAT 7%</span><b>{fmtBaht(vatAmt)}</b></div>}
            <div className="qt-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(grand)}</b></div>
            {ed.pay_method === "card_inst10" && <div><span>≈ ผ่อนเดือนละ</span><b>{fmtBaht(grand / 10)} × 10 เดือน</b></div>}
            {ed.wht && canWht && <div><span>หัก ณ ที่จ่าย {Number(ed.wht_rate) || 3}%</span><b style={{ color: "var(--down)" }}>− {fmtBaht(whtAmt)}</b></div>}
            {ed.wht && canWht && <div className="qt-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(netPay)}</b></div>}
          </div>

          <div className="fld-row">
            <label className="fld"><span>สถานะ <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(อนุมัติได้จากปุ่มบนการ์ดเท่านั้น — มีบันทึกประวัติ)</span></span>
              <Combo className="inp" value={ed.status} onChange={(e) => setQ("status", e.target.value)}>
                {STATUS_OPTS.filter(([v]) => v !== "approved" || ed.status === "approved").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Combo>
            </label>
          </div>

          <DocTerms payment={ed.terms_payment} freebies={ed.terms_freebies} warranty={ed.terms_warranty} docItems={ed.items} onChange={(k, v) => setQ(k, v)} />
          <DocNoteField value={ed.note} onChange={(v) => setQ("note", v)} />
          <InternalNoteField value={ed.internal_note} onChange={(v) => setQ("internal_note", v)} />
          <SignToggle on={ed.sign_on} onChange={(v) => setQ("sign_on", v)} />

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={async () => { if (await closeGuard()) setEd(null); }}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {saving ? "กำลังบันทึก…" : "บันทึกใบเสนอราคา"}</button>
          </div>
        </div>
        <ItemBrowser mats={mats} onAdd={addLine} />
        </div>
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  // base หลังค้นหา+ช่วงวันที่ — ใช้ทั้งนับจำนวนบนชิปตัวกรองและกรองแสดงผล
  const fl0 = list.filter((q) => inDateRange(q.issue_date, dateR)
    && (matchText(search, q.quote_no, q.customerName, q.contactName, q.title, q.boq_no, q.note, q.internal_note) || matchPhone(search, q.contactPhone)));
  const hasAc = (q) => (q.items || []).some((it) => it.kind === "ac");
  const noAcPo = (q) => hasAc(q) && q.status !== "cancelled" && !(docLinks.byQuote[q.quote_no]?.poNos || []).length; // มีแอร์แต่ยังไม่เปิดใบสั่งซื้อ
  const docPred = (q, f) => f === "all" ? true : f === "no_invoice" ? !q.hasInvoice : f === "no_job" ? !q.hasJob : noAcPo(q);
  const nStatus = (v) => fl0.filter((q) => v === "all" || q.status === v).length;
  const nVat = (v) => fl0.filter((q) => v === "all" || (v === "vat" ? !!q.vat : !q.vat)).length;
  const nDoc = (v) => fl0.filter((q) => docPred(q, v)).length;
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบเสนอราคา <span className="page-title-en">Quotations</span></h1><p className="page-sub">{list.length} ใบ</p></div>
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / เบอร์โทร / หมายเหตุ" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบเสนอราคา</button>}
        </div>
      </div>

      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ...STATUS_OPTS, ["cancelled", "ยกเลิก"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l} ({nStatus(v)})</button>
        ))}
      </div>
      <div className="cat-filter" style={{ marginTop: -4 }}>
        {[["all", "VAT / ไม่ VAT"], ["vat", "รับ VAT"], ["novat", "ไม่ VAT"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (vatF === v ? " on" : "")} onClick={() => setVatF(v)}
            style={vatF === v ? { background: "#1f74e0", color: "#fff", borderColor: "#1f74e0" } : {}}>{l} ({nVat(v)})</button>
        ))}
        <DateRangeBar value={dateR} onChange={setDateR} hidden={dateHidden} />
      </div>
      <div className="cat-filter" style={{ marginTop: -4 }}>
        {[["all", "ทุกใบ"], ["no_invoice", "ยังไม่สร้างใบส่งของ/ใบแจ้งหนี้"], ["no_job", "ยังไม่สร้างใบงาน"], ["no_ac_po", "ยังไม่สั่งซื้อแอร์"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (docF === v ? " on" : "")} onClick={() => setDocF(v)}
            style={docF === v ? { background: v === "no_ac_po" ? "#7c3aed" : "#0891b2", color: "#fff", borderColor: v === "no_ac_po" ? "#7c3aed" : "#0891b2" } : {}}>{l} ({nDoc(v)})</button>
        ))}
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {(() => {
        const fl = fl0.filter((q) => (statusF === "all" || q.status === statusF)
          && (vatF === "all" || (vatF === "vat" ? !!q.vat : !q.vat))
          && docPred(q, docF));
        return (<>
      {!loading && fl.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบเสนอราคา" : "ไม่พบใบเสนอราคาที่ตรงเงื่อนไข"}</div>}
      <div className="job-cards">
        {fl.map((q) => {
          const st = STATUS[q.status] || STATUS.draft;
          return (
            <div className={"card job-card doc2" + (q.status !== "draft" && q.status !== "sent" ? " closed" : "")} key={q.quote_no}>
              <DocCardHead no={q.quote_no} onClick={() => openPeek("quote", q.quote_no)}
                badges={<><span className={"job-badge " + st.cls}>{st.th}</span><span className={"vat-badge " + (q.vat ? "vat-on" : "vat-off")}>{q.vat ? "VAT" : "NO VAT"}</span>{q.job_type && (() => { const d = jobTypeDef(q.job_type); return <span className="job-badge" style={{ background: d[3] }}>{d[2]} {d[1]}</span>; })()}</>}
                title={q.title} sub={`${q.items.length} รายการ`} by={q.createdByName}
                date={q.issue_date || q.created_at} amountLabel="ยอดสุทธิ" amount={q.grand}
                customer={{ name: q.customerName, contactName: q.contactName, phone: q.contactPhone, addr: q.customerAddr, siteAddress: q.siteAddress, mapUrl: q.map_url }} />
              {(() => { const ch = docLinks.byQuote[q.quote_no] || {}; return <DocChips jobStatusBy={docLinks.jobStatusBy || {}} boqNo={q.boq_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} poNos={ch.poNos} self={{ type: "quote", no: q.quote_no }} onOpen={openPeek} />; })()}
              <InternalNoteTag note={q.internal_note} role={role} />
              <div className="job-lines"><div className="job-actions">
                <ChatCustomerLink role={role} customerId={q.customer_id} onGoChat={onGoChat} />
                <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintQ(q); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
                {canEdit && q.status !== "cancelled" && <button className="btn-ghost sm" disabled={q.hasInvoice || q.hasJob || q.status === "approved"} title={q.status === "approved" ? "อนุมัติแล้ว — กด 'คืนสถานะแก้ไข' ก่อน" : (lockMsg(q) || "")} onClick={() => startEdit(q)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canEdit && (q.status === "draft" || q.status === "sent") && <button className="btn-issue green" onClick={() => approve(q)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.6} /> อนุมัติ</button>}
                {canEdit && q.status === "approved" && !q.hasInvoice && !q.hasJob && !(docLinks.byQuote[q.quote_no]?.poNos || []).length &&
                  <button className="btn-ghost sm" title="คืนสถานะเป็น 'ส่งแล้ว' เพื่อแก้ไขใบที่อนุมัติแล้ว (บังคับเหตุผล + ลงประวัติ)" onClick={() => unapprove(q)}>คืนสถานะแก้ไข</button>}
                {q.status === "approved" && onCreateInvoice && (q.hasInvoice
                  ? <span className="job-badge b-green" title="วางบิลงวดถัดไปได้ที่เมนูใบส่งของ/ใบแจ้งหนี้">✓ ออกใบส่งของ/ใบแจ้งหนี้แล้ว · วางบิล {Math.round(q.billedPct)}%</span>
                  : (canEdit && <button className="btn-primary" onClick={() => onCreateInvoice(q.quote_no)}><UIcon name="clipboard" size={14} color="#fff" /> สร้างใบส่งของ/ใบแจ้งหนี้</button>))}
                {q.status === "approved" && q.hasJob && <span className="job-badge b-green">✓ สร้างใบงานแล้ว</span>}
                {canEdit && q.status === "approved" && !q.hasJob && onCreateJob && <button className="btn-primary" onClick={() => onCreateJob(q)}><UIcon name="clipboard" size={14} color="#fff" /> สร้างใบงาน</button>}
                {q.status === "approved" && onCreatePo && can(role, "po", "edit") && hasAc(q) && (() => {
                  const poCount = (docLinks.byQuote[q.quote_no]?.poNos || []).length;
                  return (<>
                    {poCount > 0 && <span className="job-badge b-green" title="กดชิป 'สั่งซื้อ PO-…' ด้านบนเพื่อเปิดใบสั่งซื้อ">✓ สั่งซื้อแล้ว {poCount} ใบ</span>}
                    <button className="btn-ghost sm" style={{ color: "#7c3aed", borderColor: "#ddd6fe", background: "#f5f3ff" }} title="เปิดใบสั่งซื้อ ดึงเฉพาะรายการแอร์จากใบเสนอราคานี้ (ผูกใบเสนอราคาให้อัตโนมัติ)" onClick={() => onCreatePo(q)}>🛒 {poCount > 0 ? "สั่งซื้อแอร์เพิ่ม" : "สั่งซื้อแอร์"}</button>
                  </>);
                })()}
                {canEdit && q.status !== "cancelled" && <button className="btn-ghost sm" disabled={!!cancelLockMsg(q)} title={cancelLockMsg(q) || ""} onClick={() => cancel(q)}>ยกเลิก</button>}
                {canDelete && <button className="btn-ghost sm danger" disabled={!!cancelLockMsg(q)} title={cancelLockMsg(q) || "ลบถาวร (ธุรการ)"} onClick={() => del(q)}><UIcon name="trash" size={14} /></button>}
              </div></div>
            </div>
          );
        })}
      </div>
        </>);
      })()}

      {/* print: full quotation document — letterhead chosen by VAT status */}
      {printQ && (() => { const co = printQ.vat ? companies.vat : companies.novat; return (
        <DocSlip company={co} titleTh="ใบเสนอราคา" titleEn="QUOTATION" docNo={printQ.quote_no}
          metaRows={[{ label: "วันที่", value: printQ.issue_date }, { label: "ยืนราคาถึง", value: printQ.valid_until }, { label: "อ้างอิง BOQ", value: printQ.boq_no },
            ...(printQ.payMethod === "card_full" ? [{ label: "การชำระเงิน", value: "บัตรเครดิต (รูดเต็ม)" }] : printQ.payMethod === "card_inst10" ? [{ label: "การชำระเงิน", value: "ผ่อนบัตรเครดิต 10 เดือน" }] : [])]}
          projectTitle={printQ.title}
          customer={{ name: printQ.customerName, code: custCode(printQ.customerCode), taxId: printQ.customerTaxId, address: printQ.customerAddr, contactName: printQ.mainContactName, contactPhone: printQ.mainContactPhone, siteName: printQ.siteName, siteAddress: printQ.siteAddress, siteContactName: printQ.siteContactName, siteContactPhone: printQ.siteContactPhone, mapUrl: printQ.map_url }}
          terms={printQ.note || co.default_terms} termsPayment={printQ.terms_payment} termsFreebies={printQ.terms_freebies} termsWarranty={printQ.terms_warranty} bank={co.bank_info}
          signLabels={["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]} signUrl={printQ.sign_url} signName={printQ.sign_name}
          discountCol={printQ.items.some((it) => Number(it.discount) > 0)}
          totals={<div className="doc-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(printQ.subtotal)}</b></div>
            {printQ.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(printQ.discount)}</b></div>}
            {printQ.discount > 0 && <div><span>ยอดหลังหักส่วนลด</span><b>{fmtBaht(printQ.afterDisc)}</b></div>}
            {printQ.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(printQ.vatAmt)}</b></div> : null}
            <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(printQ.grand)}</b></div>
            {printQ.payMethod === "card_inst10" ? <div><span>≈ ผ่อนเดือนละ</span><b>{fmtBaht(printQ.grand / 10)} × 10 เดือน</b></div> : null}
            {printQ.wht ? <div><span>หัก ณ ที่จ่าย {Number(printQ.wht_rate) || 3}%</span><b>− {fmtBaht(printQ.whtAmt)}</b></div> : null}
            {printQ.wht ? <div className="doc-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(printQ.netPay)}</b></div> : null}
          </div>}>
          {(() => { const hasD = printQ.items.some((x) => Number(x.discount) > 0); return printQ.items.map((it, i) => (
            <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{it.qty} {it.unit || ""}</td><td className="r">{fmtBaht(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtBaht(it.discount) : "-"}</td>}<td className="r">{fmtBaht(it.qty * (it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
          )); })()}
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
