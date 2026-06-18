import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listQuotations, saveQuotation, deleteQuotation, setQuotationStatus, listCustomers, listMaterialsLite, listBoqs, getCompanies, listDocLinks, syncBoqItems } from "../lib/api";
import DocSlip from "./DocSlip";
import DocTerms from "./DocTerms";
import DocChips from "./DocChips";
import ChatCustomerLink from "./ChatCustomerLink";
import GrowArea from "./GrowArea";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import { fmtBaht, custCode, matchText, matchPhone } from "../lib/format";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";
import ItemPicker from "./ItemPicker";
import ItemBrowser from "./ItemBrowser";

const STATUS = {
  draft: { th: "ร่าง", cls: "b-grey" }, sent: { th: "ส่งแล้ว", cls: "b-blue" },
  approved: { th: "อนุมัติ", cls: "b-green" }, rejected: { th: "ปฏิเสธ", cls: "b-red" }, expired: { th: "หมดอายุ", cls: "b-grey" },
};
const STATUS_OPTS = [["draft", "ร่าง"], ["sent", "ส่งแล้ว"], ["approved", "อนุมัติ"], ["rejected", "ปฏิเสธ"], ["expired", "หมดอายุ"]];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `QT-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Quotation({ role, focus, onFocusConsumed, fromBoq, onFromBoqConsumed, onCreateInvoice, onCreateJob, onOpenBoq, onOpenJob, onOpenDoc, onGoChat }) {
  const canEdit = can(role, "quote", "edit");
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [boqs, setBoqs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printQ, setPrintQ] = React.useState(null);
  const [statusF, setStatusF] = React.useState("all");
  const [vatF, setVatF] = React.useState("all"); // all | vat | novat
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
  React.useEffect(() => { if (!focus) return; setEd(null); setStatusF("all"); setSearch(focus); onFocusConsumed && onFocusConsumed(); }, [focus]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  function startNew() { setEd({ quote_no: genNo(), customer_id: "", site_id: "", boq_no: "", title: "", status: "draft", issue_date: today(), valid_until: "", discount_type: "amount", discount_value: 0, vat: true, wht: false, wht_rate: 3, note: "", terms_payment: "", terms_freebies: "", terms_warranty: "", items: [] }); }
  // create a new quotation prefilled from a BOQ (customer/site + pulled items)
  function startFromBoq(boqNo) {
    const b = boqs.find((x) => x.boq_no === boqNo); if (!b) return;
    const c = custs.find((x) => String(x.id) === String(b.customer_id));
    const items = b.items.filter((x) => ["ac", "charged", "service"].includes(x.section)).map((x) => {
      const m = matMap[x.item_code];
      return { code: x.item_code, name: x.name || m?.th, unit: x.unit || m?.unit, qty: Number(x.qty), unit_price: m?.salePrice || 0, kind: m?.kind, description: x.description || m?.description || "" };
    });
    setEd({ quote_no: genNo(), customer_id: b.customer_id || "", site_id: b.site_id || "", boq_no: boqNo, title: b.title || "", status: "draft", issue_date: today(), valid_until: "", discount_type: "amount", discount_value: 0, vat: c?.vat ?? true, wht: false, wht_rate: 3, note: "", terms_payment: b.terms_payment || "", terms_freebies: b.terms_freebies || "", terms_warranty: b.terms_warranty || "", items });
  }
  React.useEffect(() => { if (!fromBoq || !boqs.length) return; startFromBoq(fromBoq); onFromBoqConsumed && onFromBoqConsumed(); }, [fromBoq, boqs]);
  // chain lock: can't edit/delete a quotation that already has an invoice or job order downstream
  const lockMsg = (q) => (q.hasInvoice || q.hasJob)
    ? `แก้ไข/ลบใบเสนอราคานี้ไม่ได้ — มี${[q.hasInvoice && "ใบแจ้งหนี้", q.hasJob && `ใบงาน ${q.jobNo || ""}`].filter(Boolean).join(" และ ")}แล้ว\nต้องลบเอกสารถัดไป (ใบแจ้งหนี้/ใบเสร็จ/ใบงาน) ก่อน`
    : null;
  function startEdit(q) {
    const lk = lockMsg(q); if (lk) return alert(lk);
    setEd({ _edit: true, quote_no: q.quote_no, customer_id: q.customer_id || "", site_id: q.site_id || "", boq_no: q.boq_no || "", title: q.title || "", status: q.status, issue_date: q.issue_date || today(), valid_until: q.valid_until || "", discount_type: q.discount_type || "amount", discount_value: q.discount_value || 0, vat: q.vat, wht: !!q.wht, wht_rate: q.wht_rate || 3, note: q.note || "", terms_payment: q.terms_payment || "", terms_freebies: q.terms_freebies || "", terms_warranty: q.terms_warranty || "", approved_at: q.approved_at,
      items: q.items.map((x) => ({ code: x.item_code, name: x.name, unit: x.unit, qty: Number(x.qty), unit_price: Number(x.unit_price), kind: x.kind, description: x.description || "" })) });
  }
  // duplicate: copy a quote's items/details into a brand-new quotation (new number, not _edit) — for repeat/similar quotes
  function duplicate(q) {
    setEd({ quote_no: genNo(), customer_id: q.customer_id || "", site_id: q.site_id || "", boq_no: "", title: q.title ? q.title + " (สำเนา)" : "", status: "draft", issue_date: today(), valid_until: "", discount_type: q.discount_type || "amount", discount_value: q.discount_value || 0, vat: q.vat, wht: !!q.wht, wht_rate: q.wht_rate || 3, note: q.note || "", terms_payment: q.terms_payment || "", terms_freebies: q.terms_freebies || "", terms_warranty: q.terms_warranty || "",
      items: q.items.map((x) => ({ code: x.item_code, name: x.name, unit: x.unit, qty: Number(x.qty), unit_price: Number(x.unit_price), kind: x.kind, description: x.description || "" })) });
    flash("คัดลอกเป็นใบเสนอราคาใหม่แล้ว — แก้ไขแล้วกดบันทึก");
  }

  const cust = custs.find((c) => String(c.id) === String(ed?.customer_id));
  const custBoqs = boqs.filter((b) => !ed?.customer_id || String(b.customer_id) === String(ed?.customer_id));

  function setQ(k, v) { setEd((e) => ({ ...e, [k]: v })); }
  function onCustomer(id) {
    const c = custs.find((c) => String(c.id) === String(id));
    const isCompany = c?.type === "company";
    setEd((e) => ({ ...e, customer_id: id, site_id: "", vat: c?.vat ?? true, wht: isCompany ? e.wht : false }));
  }
  const addLine = (m) => setEd((e) => {
    const i = e.items.findIndex((x) => x.code === m.code);
    if (i >= 0) { const items = [...e.items]; items[i] = { ...items[i], qty: items[i].qty + 1 }; return { ...e, items }; }
    return { ...e, items: [...e.items, { code: m.code, name: m.th, unit: m.unit, qty: 1, unit_price: m.salePrice || 0, kind: m.kind, description: m.description || "" }] };
  });
  const setLine = (i, k, v) => setEd((e) => ({ ...e, items: e.items.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
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

  // totals
  const subtotal = ed ? ed.items.reduce((a, x) => a + Number(x.qty) * Number(x.unit_price), 0) : 0;
  const discount = ed ? (ed.discount_type === "percent" ? subtotal * Number(ed.discount_value || 0) / 100 : Number(ed.discount_value || 0)) : 0;
  const afterDisc = subtotal - discount;
  const vatAmt = ed && ed.vat ? afterDisc * 0.07 : 0;
  const grand = afterDisc + vatAmt;
  // หัก ณ ที่จ่าย — เฉพาะลูกค้านิติบุคคลเท่านั้น
  const selCust = ed ? custs.find((c) => String(c.id) === String(ed.customer_id)) : null;
  const canWht = selCust?.type === "company";
  const whtAmt = ed && ed.wht && canWht ? afterDisc * (Number(ed.wht_rate) || 3) / 100 : 0;
  const netPay = grand - whtAmt;

  async function save() {
    if (!ed.items.length) return flash("เพิ่มรายการอย่างน้อย 1 รายการ", true);
    if (ed._edit && !await confirmDialog(`ยืนยันบันทึกการแก้ไขใบเสนอราคา ${ed.quote_no} ?`)) return;
    try {
      await saveQuotation(ed, ed.items);
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
      flash(synced > 0 ? `บันทึกแล้ว · ซิงค์ ${synced} รายการเข้า ${ed.boq_no}` : "บันทึกใบเสนอราคาแล้ว");
      setEd(null); await load();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(q) { const lk = lockMsg(q); if (lk) return alert(lk); if (!await confirmDialog(`ลบ ${q.quote_no}?`)) return; try { await deleteQuotation(q.quote_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  async function approve(q) {
    if (!await confirmDialog(`ยืนยันอนุมัติใบเสนอราคา ${q.quote_no} ?`)) return;
    try { await setQuotationStatus(q.quote_no, "approved"); flash(`อนุมัติ ${q.quote_no} แล้ว ✓`); await load(); }
    catch (e) { flash("อนุมัติไม่สำเร็จ: " + (e.message || e), true); }
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
              <Combo className="inp" value={ed.boq_no} onChange={(e) => setQ("boq_no", e.target.value)}>
                <option value="">— ไม่อ้าง BOQ —</option>{custBoqs.map((b) => <option key={b.boq_no} value={b.boq_no}>{b.boq_no}{b.title ? ` · ${b.title}` : ""}</option>)}
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
                    <div className="inp inp-unit boq-in"><input type="number" min="0" value={it.qty} onChange={(e) => setLine(i, "qty", Math.max(0, Number(e.target.value) || 0))} /><span className="unit-suf">{it.unit}</span></div>
                    <div className="inp inp-unit boq-in"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => setLine(i, "unit_price", Number(e.target.value) || 0)} /></div>
                    <span className="boq-amt">{fmtBaht(it.qty * it.unit_price)}</span>
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
                <input className="inp" type="number" min="0" value={ed.discount_value} onChange={(e) => setQ("discount_value", Number(e.target.value) || 0)} />
              </div>
            </label>
            <label className="fld"><span>ภาษีมูลค่าเพิ่ม</span>
              <button type="button" className={"vat-toggle" + (ed.vat ? " on" : "")} onClick={() => setQ("vat", !ed.vat)}>{ed.vat ? "คิด VAT 7%" : "ไม่คิด VAT"}</button>
            </label>
          </div>
          {canWht && (
          <div className="fld-row">
            <label className="fld"><span>หัก ณ ที่จ่าย <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(ลูกค้านิติบุคคล)</span></span>
              <div className="line-add">
                <button type="button" className={"vat-toggle" + (ed.wht ? " on" : "")} style={{ flex: 1 }} onClick={() => setQ("wht", !ed.wht)}>{ed.wht ? "หัก ณ ที่จ่าย" : "ไม่หัก ณ ที่จ่าย"}</button>
                <div className="inp inp-unit" style={{ width: 110, flex: "none", opacity: ed.wht ? 1 : .5 }}>
                  <input type="number" min="0" step="0.1" value={ed.wht_rate} disabled={!ed.wht} onChange={(e) => setQ("wht_rate", Number(e.target.value) || 0)} /><span className="unit-suf">%</span>
                </div>
              </div>
            </label>
            <div className="fld" />
          </div>
          )}

          <div className="qt-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(subtotal)}</b></div>
            {discount > 0 && <div><span>ส่วนลด</span><b style={{ color: "var(--down)" }}>− {fmtBaht(discount)}</b></div>}
            {ed.vat && <div><span>VAT 7%</span><b>{fmtBaht(vatAmt)}</b></div>}
            <div className="qt-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(grand)}</b></div>
            {ed.wht && canWht && <div><span>หัก ณ ที่จ่าย {Number(ed.wht_rate) || 3}%</span><b style={{ color: "var(--down)" }}>− {fmtBaht(whtAmt)}</b></div>}
            {ed.wht && canWht && <div className="qt-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(netPay)}</b></div>}
          </div>

          <div className="fld-row">
            <label className="fld"><span>สถานะ</span>
              <Combo className="inp" value={ed.status} onChange={(e) => setQ("status", e.target.value)}>{STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Combo>
            </label>
          </div>

          <DocTerms payment={ed.terms_payment} freebies={ed.terms_freebies} warranty={ed.terms_warranty} onChange={(k, v) => setQ(k, v)} />

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึกใบเสนอราคา</button>
          </div>
        </div>
        <ItemBrowser mats={mats} onAdd={addLine} />
        </div>
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบเสนอราคา <span className="page-title-en">Quotations</span></h1><p className="page-sub">{list.length} ใบ</p></div>
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / เบอร์โทร" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบเสนอราคา</button>}
        </div>
      </div>

      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ...STATUS_OPTS].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>
      <div className="cat-filter" style={{ marginTop: -4 }}>
        {[["all", "VAT / ไม่ VAT"], ["vat", "รับ VAT"], ["novat", "ไม่ VAT"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (vatF === v ? " on" : "")} onClick={() => setVatF(v)}
            style={vatF === v ? { background: "#1f74e0", color: "#fff", borderColor: "#1f74e0" } : {}}>{l}</button>
        ))}
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {(() => {
        const fl = list.filter((q) => (statusF === "all" || q.status === statusF)
          && (vatF === "all" || (vatF === "vat" ? !!q.vat : !q.vat))
          && (matchText(search, q.quote_no, q.customerName, q.contactName, q.title, q.boq_no) || matchPhone(search, q.contactPhone)));
        return (<>
      {!loading && fl.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบเสนอราคา" : "ไม่พบใบเสนอราคาที่ตรงเงื่อนไข"}</div>}
      <div className="job-cards">
        {fl.map((q) => {
          const st = STATUS[q.status] || STATUS.draft;
          return (
            <div className={"card job-card" + (q.status !== "draft" && q.status !== "sent" ? " closed" : "")} key={q.quote_no}>
              <div className="job-card-head" style={{ cursor: "default" }}>
                <div className="job-card-id"><span className="job-no">{q.quote_no}</span><span className={"job-badge " + st.cls}>{st.th}</span><span className={"vat-badge " + (q.vat ? "vat-on" : "vat-off")}>{q.vat ? "VAT" : "NO VAT"}</span></div>
                <div className="job-card-meta inv-meta">
                  <span className="inv-cust">{q.title || "ใบเสนอราคา"}</span>
                  <span className="inv-hint">{q.items.length} รายการ</span>
                </div>
                <div className="job-card-cost"><span>ยอดสุทธิ</span><b>{fmtBaht(q.grand)}</b></div>
              </div>
              <div className="jo-info">
                <div className="jo-info-row"><span className="jo-ic">🏢</span><b>{q.customerName || "ไม่ระบุลูกค้า"}</b>{q.customerAddr ? <span className="jo-dim"> · {q.customerAddr}</span> : null}{q.createdByName ? <span className="jo-dim"> · 👤 สร้างโดย {q.createdByName}</span> : null}</div>
                {(q.contactName || q.contactPhone) && <div className="jo-info-row"><span className="jo-ic">👤</span>{q.contactName || "ผู้ติดต่อ"}{q.contactPhone && <a href={`tel:${q.contactPhone}`} className="jo-tel">📞 {q.contactPhone}</a>}</div>}
                {q.siteAddress && <div className="jo-info-row"><span className="jo-ic">📍</span><span style={{ flex: 1 }}>{q.siteAddress}</span>{q.map_url && <a href={q.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm" onClick={(e) => e.stopPropagation()}>แผนที่</a>}</div>}
              </div>
              {(() => { const ch = docLinks.byQuote[q.quote_no] || {}; return <DocChips boqNo={q.boq_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} self={{ type: "quote", no: q.quote_no }} onOpen={onOpenDoc} />; })()}
              <div className="job-lines"><div className="job-actions">
                <ChatCustomerLink role={role} customerId={q.customer_id} onGoChat={onGoChat} />
                <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintQ(q); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
                {canEdit && <button className="btn-ghost sm" onClick={() => duplicate(q)}><UIcon name="clipboard" size={14} /> สร้างซ้ำ</button>}
                {canEdit && <button className="btn-ghost sm" disabled={q.hasInvoice || q.hasJob} title={lockMsg(q) || ""} onClick={() => startEdit(q)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canEdit && (q.status === "draft" || q.status === "sent") && <button className="btn-issue green" onClick={() => approve(q)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.6} /> อนุมัติ</button>}
                {q.status === "approved" && onCreateInvoice && (q.hasInvoice
                  ? <span className="job-badge b-green" title="วางบิลงวดถัดไปได้ที่เมนูใบแจ้งหนี้">✓ ออกใบแจ้งหนี้แล้ว · วางบิล {Math.round(q.billedPct)}%</span>
                  : (canEdit && <button className="btn-primary" onClick={() => onCreateInvoice(q.quote_no)}><UIcon name="clipboard" size={14} color="#fff" /> สร้างใบแจ้งหนี้</button>))}
                {q.status === "approved" && q.hasJob && <span className="job-badge b-green">✓ สร้างใบงานแล้ว</span>}
                {canEdit && q.status === "approved" && !q.hasJob && onCreateJob && <button className="btn-primary" onClick={() => onCreateJob(q)}><UIcon name="clipboard" size={14} color="#fff" /> สร้างใบงาน</button>}
                {canEdit && <button className="btn-ghost sm danger" disabled={q.hasInvoice || q.hasJob} title={lockMsg(q) || ""} onClick={() => del(q)}><UIcon name="trash" size={14} /></button>}
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
          metaRows={[{ label: "วันที่", value: printQ.issue_date }, { label: "ยืนราคาถึง", value: printQ.valid_until }, { label: "อ้างอิง BOQ", value: printQ.boq_no }]}
          projectTitle={printQ.title}
          customer={{ name: printQ.customerName, code: custCode(printQ.customerCode), taxId: printQ.customerTaxId, address: printQ.siteAddress || printQ.customerAddr, contactName: printQ.contactName, contactPhone: printQ.contactPhone, mapUrl: printQ.map_url }}
          terms={printQ.note || co.default_terms} termsPayment={printQ.terms_payment} termsFreebies={printQ.terms_freebies} termsWarranty={printQ.terms_warranty} bank={co.bank_info}
          signLabels={["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]}
          totals={<div className="doc-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(printQ.subtotal)}</b></div>
            {printQ.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(printQ.discount)}</b></div>}
            {printQ.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(printQ.vatAmt)}</b></div> : null}
            <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(printQ.grand)}</b></div>
            {printQ.wht ? <div><span>หัก ณ ที่จ่าย {Number(printQ.wht_rate) || 3}%</span><b>− {fmtBaht(printQ.whtAmt)}</b></div> : null}
            {printQ.wht ? <div className="doc-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(printQ.netPay)}</b></div> : null}
          </div>}>
          {printQ.items.map((it, i) => (
            <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{it.qty} {it.unit || ""}</td><td className="r">{fmtBaht(it.unit_price)}</td><td className="r">{fmtBaht(it.qty * it.unit_price)}</td></tr>
          ))}
        </DocSlip>
      ); })()}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
