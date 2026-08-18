import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listAdjustmentNotes, saveAdjustmentNote, setAdjustmentNoteStatus, deleteAdjustmentNote, listReceipts, listQuotations, listDocLinks, getCompanies, docNoTaken } from "../lib/api";
import { fmtBaht2, custCode, round2, matchText } from "../lib/format";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";
import DocSlip from "./DocSlip";
import DocTerms from "./DocTerms";
import DocChips from "./DocChips";
import ChatCustomerLink from "./ChatCustomerLink";
import { useDocPeek } from "./DocPeek";
import { DocNoteField, InternalNoteField, SignToggle } from "./InternalNote";
import { mySignature, defaultSignOn } from "../lib/sign";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";

const fmtBaht = fmtBaht2;
// ใบลดหนี้ (credit) / ใบเพิ่มหนี้ (debit) — ปรับยอดหลังออกใบเสร็จ/ใบแจ้งหนี้แล้ว · มีรายการของตัวเอง
const KINDS = {
  credit: { th: "ใบลดหนี้", en: "CREDIT NOTE", verb: "ลด", color: "#dc2626", prefix: "CN" },
  debit: { th: "ใบเพิ่มหนี้", en: "DEBIT NOTE", verb: "เพิ่ม", color: "#2563eb", prefix: "DN" },
};
const NSTATUS = { issued: { th: "ออกแล้ว", cls: "b-green" }, cancelled: { th: "ยกเลิกแล้ว", cls: "b-red" } };
// หัก ณ ที่จ่ายรายบรรทัด (เฉพาะบรรทัดค่าบริการที่ติ๊ก) — สัดส่วนของยอดก่อน VAT
const lineWhtAmt = (items, base, rate) => { const all = (items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0); const fl = (items || []).filter((i) => i.wht).reduce((a, i) => a + (Number(i.amount) || 0), 0); const ratio = all > 0 ? fl / all : 0; return round2((Number(base) || 0) * ratio * (Number(rate) || 0) / 100); };
const blankItem = () => ({ name: "", desc: "", unit: "", qty: 1, price: 0, kind: "service", wht: false });
const today = () => new Date().toISOString().slice(0, 10);
function genNo(kind) { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${KINDS[kind].prefix}-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }

export default function AdjustmentNotes({ role, onOpenDoc, onGoChat }) {
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ชิปเชื่อมโยง → พรีวิวแผงขวา
  const canEdit = can(role, "adjnote", "edit");
  const canDelete = role === "admin";
  const [list, setList] = React.useState([]);
  const [receipts, setReceipts] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printA, setPrintA] = React.useState(null);
  const [kindTab, setKindTab] = React.useState("credit");
  const [statusF, setStatusF] = React.useState("all");
  const [search, setSearch] = React.useState("");

  async function load() {
    setLoading(true);
    try { const [an, rc, q, dl, co] = await Promise.all([listAdjustmentNotes(), listReceipts(), listQuotations(), listDocLinks(), getCompanies()]); setList(an); setReceipts(rc); setQuotes(q); setDocLinks(dl || { byQuote: {} }); setCompanies(co || { vat: {}, novat: {} }); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printA) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintA(null); }, 120); return () => clearTimeout(t); }, [printA]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const openReceipts = receipts.filter((r) => r.status !== "cancelled");
  const rcByNo = React.useMemo(() => Object.fromEntries(receipts.map((r) => [r.receipt_no, r])), [receipts]);
  const quoteByNo = React.useMemo(() => Object.fromEntries(quotes.map((q) => [q.quote_no, q])), [quotes]);

  function startNew(kind) {
    setEd({ note_no: genNo(kind), kind, receipt_no: "", issue_date: today(), reason: "", wht_rate: 3,
      items: [blankItem()], note: "", internal_note: "", sign_on: defaultSignOn(),
      terms_payment: "", terms_freebies: "", terms_warranty: "", _src: null });
  }
  function startEdit(x) {
    setEd({ note_no: x.note_no, kind: x.kind, receipt_no: x.receipt_no || "", issue_date: x.issue_date || today(), reason: x.reason || "",
      wht_rate: Number(x.wht_rate) || 3, items: (x.items || []).length ? x.items.map((i) => ({ ...i })) : [blankItem()],
      note: x.note || "", internal_note: x.internal_note || "", sign_on: !!x.sign_url,
      terms_payment: x.terms_payment || "", terms_freebies: x.terms_freebies || "", terms_warranty: x.terms_warranty || "",
      _src: rcByNo[x.receipt_no] || { customer_id: x.customer_id, is_vat: x.is_vat, customerName: x.customerName, quote_no: x.quote_no, invoice_no: x.invoice_no, boq_no: x.boq_no, job_no: x.job_no, site_id: x.site_id, customerType: x.customerType, customerAddr: x.customerAddr } });
  }
  const setF = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  const setItem = (i, k, v) => setEd((e) => ({ ...e, items: e.items.map((r, j) => j === i ? { ...r, [k]: v } : r) }));
  const addItem = () => setEd((e) => ({ ...e, items: [...e.items, blankItem()] }));
  const delItem = (i) => setEd((e) => ({ ...e, items: e.items.filter((_, j) => j !== i) }));

  function onPickReceipt(receipt_no) {
    const r = rcByNo[receipt_no];
    setEd((e) => ({ ...e, receipt_no, _src: r || null,
      // ตั้งค่าเริ่มต้นธงหัก ณ ที่จ่าย: นิติบุคคล + ค่าบริการ
      items: e.items.map((it) => ({ ...it, wht: (r?.customerType === "company") && it.kind === "service" })) }));
  }
  // ดึงรายการจากใบเดิม (ใบเสนอราคาที่ผูกกับใบเสร็จ) มาเป็นบรรทัดที่จะลด/เพิ่ม — แก้จำนวน/ราคาต่อได้
  function addFromSource(it) {
    const price = Number(it.price_show ?? it.unit_price) || 0;
    const kind = it.kind === "service" ? "service" : "material";
    setEd((e) => {
      const row = { name: it.name, desc: it.description || "", unit: it.unit || "", qty: Number(it.qty) || 1, price, kind, wht: (e._src?.customerType === "company") && kind === "service" };
      const blankOnly = e.items.length === 1 && !e.items[0].name.trim() && !Number(e.items[0].price);
      return { ...e, items: blankOnly ? [row] : [...e.items, row] };
    });
  }

  // ---- ยอดคำนวณ ----
  const src = ed?._src;
  const isVat = !!(src && Number(src.vat_amt) > 0) || !!(src && src.is_vat);
  const items = (ed?.items || []).map((it) => ({ ...it, wht: !!it.wht && it.kind === "service", amount: round2((Number(it.qty) || 0) * (Number(it.price) || 0)) }));
  const base = round2(items.reduce((a, i) => a + i.amount, 0));
  const vatAmt = isVat ? round2(base * 0.07) : 0;
  const total = round2(base + vatAmt);
  const whtRate = Number(ed?.wht_rate) || 3;
  const whtAmt = lineWhtAmt(items, base, whtRate);
  const net = round2(total - whtAmt);

  async function save() {
    if (!src) return flash("เลือกใบเสร็จต้นทางก่อน", true);
    if (!ed.reason.trim()) return flash("ใส่เหตุผลการปรับ (ลูกค้าจะเห็นในเอกสาร)", true);
    if (!items.some((i) => i.name.trim() && i.amount > 0)) return flash("ใส่รายการที่" + KINDS[ed.kind].verb + "อย่างน้อย 1 บรรทัด", true);
    const a = {
      note_no: ed.note_no, kind: ed.kind, receipt_no: ed.receipt_no || null, invoice_no: src.invoice_no || null,
      quote_no: src.quote_no || null, boq_no: src.boq_no || null, job_no: src.job_no || null,
      customer_id: src.customer_id || src.customerCode || null, site_id: src.site_id || null, issue_date: ed.issue_date || null,
      reason: ed.reason, is_vat: isVat, items: items.filter((i) => i.name.trim()),
      base, vat_amt: vatAmt, total, wht_rate: whtRate, wht_amt: whtAmt, net,
      note: ed.note, internal_note: ed.internal_note, terms_payment: ed.terms_payment, terms_freebies: ed.terms_freebies, terms_warranty: ed.terms_warranty,
      ...(() => { const sig = ed.sign_on ? mySignature() : null; return { sign_url: sig?.url || null, sign_name: sig?.name || null }; })(),
    };
    try {
      if (await docNoTaken("adjustment_notes", a.note_no)) return flash(`เลขที่ ${a.note_no} ถูกใช้แล้ว — เปลี่ยนเลขก่อนบันทึก`, true);
      await saveAdjustmentNote(a); flash(`ออก${KINDS[ed.kind].th} ${a.note_no} แล้ว`); setEd(null); await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function cancel(x) {
    const reason = await confirmDialog({ title: `ยกเลิก${KINDS[x.kind].th} ${x.note_no}?`, message: "เก็บประวัติไว้ · เอกสารจะไม่นับในสายเชื่อมโยง", confirmText: "ยกเลิกใบนี้", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น ออกผิด · ยอดผิด", required: true } });
    if (reason === false) return;
    try { await setAdjustmentNoteStatus(x.note_no, "cancelled", reason); flash("ยกเลิกแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(x) {
    const reason = await confirmDialog({ title: `ลบ${KINDS[x.kind].th} ${x.note_no}?`, message: "เก็บไว้ในประวัติการลบ (กู้คืนได้)", confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ออกผิด", required: true } });
    if (reason === false) return;
    try { await deleteAdjustmentNote(x.note_no, reason); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  function doPrint(x) { printWin.current = openPrintWindow(); setPrintA(x); }

  // ---------- EDITOR ----------
  if (ed) {
    const K = KINDS[ed.kind];
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">ออก{K.th} <span className="page-title-en">{K.en}</span></h1>
          <p className="page-sub">ปรับยอด{K.verb}หลังออกใบเสร็จแล้ว · อ้างอิงใบเสร็จต้นทาง</p></div></div>
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่{K.th}</span><input className="inp" value={ed.note_no} onChange={(e) => setF("note_no", e.target.value)} /></label>
            <label className="fld"><span>อ้างอิงใบเสร็จต้นทาง *</span>
              <Combo className="inp" value={ed.receipt_no} onChange={(e) => onPickReceipt(e.target.value)}>
                <option value="">— เลือกใบเสร็จ —</option>
                {openReceipts.map((r) => <option key={r.receipt_no} value={r.receipt_no}>{r.receipt_no} · {r.customerName || "-"} ({fmtBaht(r.total)})</option>)}
              </Combo>
            </label>
          </div>

          {src && (
            <div className="inv-summary">
              <div><span>ลูกค้า</span><b>{src.customerName || "-"} · {custCode(src.customer_id || src.customerCode)}{src.customerType === "company" ? " · นิติบุคคล" : ""}</b></div>
              <div><span>อ้างอิง</span><b>{[src.invoice_no && `บิล ${src.invoice_no}`, src.quote_no, src.boq_no && `BOQ ${src.boq_no}`].filter(Boolean).join(" · ") || "-"}</b></div>
              <div><span>ประเภทภาษี</span><b>{isVat ? "มี VAT (ใบกำกับภาษี)" : "ไม่มี VAT"}</b></div>
            </div>
          )}

          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={ed.issue_date} onChange={(e) => setF("issue_date", e.target.value)} /></label>
            <label className="fld"><span>อัตราหัก ณ ที่จ่าย</span>
              <div className="inp inp-unit" style={{ width: 120 }}>
                <input type="number" min="0" step="0.1" value={ed.wht_rate} onChange={(e) => setF("wht_rate", Number(e.target.value) || 0)} /><span className="unit-suf">%</span>
              </div>
            </label>
          </div>
          <label className="fld"><span>เหตุผลการ{K.verb} * <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(แสดงในเอกสาร ให้ลูกค้าทราบ)</span></span>
            <input className="inp" value={ed.reason} onChange={(e) => setF("reason", e.target.value)} placeholder={ed.kind === "credit" ? "เช่น ยกเลิกงานติดตั้งชั้น 2 ตามที่ตกลง" : "เช่น เพิ่มงานเดินท่อน้ำทิ้งเพิ่มเติม"} /></label>

          {src && (() => {
            const q = quoteByNo[src.quote_no];
            const srcItems = (q?.items || []).filter((it) => it.name);
            if (!srcItems.length) return null;
            return (
              <div className="fld"><span>รายการในใบเดิม <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(กด ＋ เพื่อดึงมา{K.verb} แล้วแก้จำนวน/ราคาได้)</span></span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 6 }}>
                  {srcItems.map((it, i) => {
                    const price = Number(it.price_show ?? it.unit_price) || 0;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", background: "var(--surface-2)", borderRadius: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{it.item_code ? <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>{it.item_code} · </span> : null}{it.name}</div>
                          {it.description ? <div className="page-sub" style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{it.description}</div> : null}
                          <div className="page-sub" style={{ margin: "2px 0 0", fontWeight: 600 }}>{Number(it.qty)} {it.unit || ""} × {fmtBaht(price)} = {fmtBaht(Number(it.qty) * price)}{it.kind === "service" ? " · ค่าบริการ" : ""}</div>
                        </div>
                        <button className="btn-ghost sm" style={{ flex: "none", marginTop: 2 }} onClick={() => addFromSource(it)}><UIcon name="plus" size={13} /> {K.verb}</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div className="fld"><span>รายการที่{K.verb} <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(ดึงจากใบเดิมด้านบน หรือใส่เอง)</span></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ed.items.map((it, i) => {
                const amt = round2((Number(it.qty) || 0) * (Number(it.price) || 0));
                return (
                  <div key={i} className="card" style={{ padding: 8, background: "var(--surface-2)" }}>
                    <div className="crm-row">
                      <input className="inp" style={{ flex: 2 }} value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} placeholder="ชื่อรายการ" />
                      <Combo className="inp" style={{ width: 110, flex: "none" }} value={it.kind} onChange={(e) => setItem(i, "kind", e.target.value)}>
                        <option value="service">ค่าบริการ</option><option value="material">ค่าของ</option>
                      </Combo>
                      <button className="line-x" onClick={() => delItem(i)}><UIcon name="x" size={14} /></button>
                    </div>
                    <input className="inp" style={{ marginTop: 6 }} value={it.desc || ""} onChange={(e) => setItem(i, "desc", e.target.value)} placeholder="รายละเอียด/คำอธิบาย (ไม่บังคับ)" />
                    <div className="crm-row" style={{ marginTop: 6 }}>
                      <input className="inp" style={{ width: 70, flex: "none" }} type="number" min="0" step="1" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} placeholder="จำนวน" />
                      <input className="inp" style={{ width: 90, flex: "none" }} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} placeholder="หน่วย" />
                      <input className="inp" style={{ width: 120, flex: "none" }} type="number" min="0" step="0.01" value={it.price} onChange={(e) => setItem(i, "price", e.target.value)} placeholder="ราคา/หน่วย" />
                      <span style={{ marginLeft: "auto", fontWeight: 700 }}>{fmtBaht(amt)}</span>
                      {it.kind === "service" && (
                        <label style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, fontSize: 13, color: "var(--ink-2)" }}>
                          <input type="checkbox" checked={!!it.wht} onChange={(e) => setItem(i, "wht", e.target.checked)} /> หัก ณ ที่จ่าย
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
              <button className="btn-ghost sm" onClick={addItem}><UIcon name="plus" size={13} /> เพิ่มรายการ</button>
            </div>
          </div>

          <div className="inv-summary" style={{ marginTop: 8 }}>
            <div><span>รวมก่อนภาษี</span><b>{fmtBaht(base)}</b></div>
            {isVat && <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(vatAmt)}</b></div>}
            <div><span>รวมทั้งสิ้น</span><b>{fmtBaht(total)}</b></div>
            {whtAmt > 0 && <div><span>หัก ณ ที่จ่าย {whtRate}%</span><b style={{ color: "var(--down)" }}>− {fmtBaht(whtAmt)}</b></div>}
            <div className="inv-remain"><span>ยอดสุทธิ ({K.verb})</span><b>{fmtBaht(net)}</b></div>
          </div>

          <DocTerms payment={ed.terms_payment} freebies={ed.terms_freebies} warranty={ed.terms_warranty} onChange={(k, v) => setF(k, v)} />
          <DocNoteField value={ed.note} onChange={(v) => setF("note", v)} />
          <InternalNoteField value={ed.internal_note} onChange={(v) => setF("internal_note", v)} />
          <SignToggle on={ed.sign_on} onChange={(v) => setF("sign_on", v)} />

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={!src} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> ออก{K.th}</button>
          </div>
        </div>
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  const fl0 = list.filter((x) => x.kind === kindTab && matchText(search, x.note_no, x.customerName, x.reason, x.receipt_no, x.quote_no));
  const nStatus = (v) => fl0.filter((x) => v === "all" || x.status === v).length;
  const shown = fl0.filter((x) => statusF === "all" || x.status === statusF);
  const K = KINDS[kindTab];
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบเพิ่ม/ลดหนี้ <span className="page-title-en">Credit / Debit Note</span></h1><p className="page-sub">ปรับยอดหลังออกใบเสร็จแล้ว (เพิ่ม/ลดขอบเขตงาน)</p></div>
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / เหตุผล" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={() => startNew(kindTab)}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> ออก{K.th}</button>}
        </div>
      </div>
      {/* แท็บ ลดหนี้ / เพิ่มหนี้ */}
      <div className="sub-toggle" style={{ maxWidth: 360, marginBottom: 10 }}>
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} className={kindTab === k ? "on" : ""} onClick={() => { setKindTab(k); setStatusF("all"); }}>{v.th}</button>
        ))}
      </div>
      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ["issued", "ออกแล้ว"], ["cancelled", "ยกเลิก"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l} ({nStatus(v)})</button>
        ))}
      </div>
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{fl0.length === 0 ? `ยังไม่มี${K.th}` : `ไม่พบ${K.th}`}</div>}
      <div className="job-cards">
        {shown.map((x) => {
          const st = NSTATUS[x.status] || NSTATUS.issued;
          const cancelled = x.status === "cancelled";
          return (
            <div className={"card job-card doc2" + (cancelled ? " closed" : "")} key={x.note_no}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="dch-no">{x.note_no}</div>
                  <div className="dch-badges">
                    <span className="job-badge" style={{ background: KINDS[x.kind].color + "1a", color: KINDS[x.kind].color }}>{KINDS[x.kind].th}</span>
                    <span className={"job-badge " + st.cls}>{st.th}</span>
                    <span className={"vat-badge " + (x.is_vat ? "vat-on" : "vat-off")}>{x.is_vat ? "VAT" : "NO VAT"}</span>
                  </div>
                  <div className="dch-title">{x.customerName || "-"}{x.receipt_no ? ` · อ้างอิง ${x.receipt_no}` : ""}</div>
                  {x.reason && <div className="page-sub" style={{ margin: "2px 0 0" }}>เหตุผล: {x.reason}</div>}
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div className="page-sub" style={{ margin: 0 }}>ยอด{KINDS[x.kind].verb}สุทธิ</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: KINDS[x.kind].color }}>{fmtBaht(x.net)}</div>
                  {x.wht_amt > 0 && <div className="page-sub" style={{ margin: 0 }}>หัก ณ ที่จ่าย {fmtBaht(x.wht_amt)}</div>}
                </div>
              </div>
              {(() => { const ch = docLinks.byQuote[x.quote_no] || {}; return <DocChips jobStatusBy={docLinks.jobStatusBy || {}} boqNo={x.boq_no} quoteNo={x.quote_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} poNos={ch.poNos} creditNos={ch.creditNos} debitNos={ch.debitNos} self={{ type: x.kind === "debit" ? "debitnote" : "creditnote", no: x.note_no }} onOpen={openPeek} />; })()}
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <ChatCustomerLink role={role} customerId={x.customer_id} onGoChat={onGoChat} />
                <button className="btn-ghost sm" onClick={() => doPrint(x)}><UIcon name="catalog" size={14} /> พิมพ์</button>
                {canEdit && !cancelled && <button className="btn-ghost sm" onClick={() => startEdit(x)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canEdit && !cancelled && <button className="btn-ghost sm" style={{ color: "#b45309" }} onClick={() => cancel(x)}>ยกเลิก</button>}
                {canDelete && <button className="btn-ghost sm" style={{ color: "#b91c1c" }} onClick={() => del(x)}><UIcon name="trash" size={14} /> ลบ</button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* พิมพ์ */}
      {printA && (() => {
        const K2 = KINDS[printA.kind];
        const co = printA.is_vat ? companies.vat : companies.novat;
        const its = printA.items || [];
        const allAmt = its.reduce((a, i) => a + (Number(i.amount) || 0), 0);
        const rate = Number(printA.wht_rate) || 3;
        // หัก ณ ที่จ่ายต่อบรรทัด (บรรทัดสุดท้ายรับเศษ)
        const perLineBase = {}, perLineWht = {};
        if (printA.wht_amt > 0 && allAmt > 0) {
          const flagged = its.map((s, i) => ({ s, i })).filter((o) => o.s.wht);
          const whtBaseTot = round2((printA.base || 0) * flagged.reduce((a, o) => a + (Number(o.s.amount) || 0), 0) / allAmt);
          let accB = 0, accW = 0;
          flagged.forEach((o, k) => {
            const last = k === flagged.length - 1;
            const b = last ? round2(whtBaseTot - accB) : round2((printA.base || 0) * (Number(o.s.amount) || 0) / allAmt);
            const w = last ? round2(printA.wht_amt - accW) : round2(b * rate / 100);
            if (!last) { accB = round2(accB + b); accW = round2(accW + w); }
            perLineBase[o.i] = b; perLineWht[o.i] = w;
          });
        }
        return (
          <DocSlip company={co} titleTh={K2.th} titleEn={K2.en} docNo={printA.note_no}
            metaRows={[{ label: "วันที่", value: printA.issue_date }, { label: "อ้างอิงใบเสร็จ", value: printA.receipt_no }, { label: "อ้างอิงใบแจ้งหนี้", value: printA.invoice_no }, { label: "อ้างอิงใบเสนอ", value: printA.quote_no }]}
            projectTitle={`เหตุผลการ${K2.verb}: ${printA.reason || "-"}`}
            customer={{ name: printA.customerName, code: custCode(printA.customerCode), taxId: printA.customerTaxId, branch: printA.customerBranch, address: printA.customerAddr, contactName: printA.mainContactName, contactPhone: printA.mainContactPhone, siteName: printA.siteName, siteAddress: printA.siteAddress, siteContactName: printA.siteContactName, siteContactPhone: printA.siteContactPhone, mapUrl: printA.mapUrl }}
            terms={printA.note} termsPayment={printA.terms_payment} termsFreebies={printA.terms_freebies} termsWarranty={printA.terms_warranty} bank={co.bank_info}
            signLabels={["ผู้ออกเอกสาร", "ผู้รับเอกสาร / ลูกค้า"]} signUrl={printA.sign_url} signName={printA.sign_name}
            unitHead="หน่วยละ" amountHead={`ยอด${K2.verb}`}
            totals={<div className="doc-totals">
              <div><span>รวมยอด{K2.verb}ก่อนภาษี</span><b>{fmtBaht(printA.base)}</b></div>
              {printA.is_vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(printA.vat_amt)}</b></div> : null}
              <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(printA.total)}</b></div>
              {printA.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {rate}%</span><b>− {fmtBaht(printA.wht_amt)}</b></div>}
              <div className="doc-grand"><span>ยอดสุทธิ ({K2.verb})</span><b>{fmtBaht(printA.net)}</b></div>
            </div>}>
            {its.map((it, i) => (
              <tr key={i}><td>{i + 1}</td><td>{it.code || "-"}</td>
                <td>{it.name}{it.desc ? <div className="doc-item-desc">{it.desc}</div> : null}
                  {perLineWht[i] > 0 && <div className="doc-item-desc" style={{ color: "#b91c1c" }}>↳ หัก ณ ที่จ่าย {rate}% จากยอด {fmtBaht(perLineBase[i])} = − {fmtBaht(perLineWht[i])}</div>}
                </td>
                <td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht(it.price)}</td><td className="r">{fmtBaht(Number(it.amount) || (Number(it.qty) * Number(it.price)))}</td></tr>
            ))}
          </DocSlip>
        );
      })()}
      {peekEl}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) { return <div className={"toast" + (t.bad ? " toast-bad" : "")}>{t.m}</div>; }
