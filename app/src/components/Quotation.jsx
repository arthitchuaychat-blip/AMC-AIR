import React from "react";
import { listQuotations, saveQuotation, deleteQuotation, setQuotationStatus, listCustomers, listMaterials, listBoqs, getCompanies } from "../lib/api";
import DocSlip from "./DocSlip";
import { fmtBaht, custCode } from "../lib/format";
import { UIcon } from "../icons";
import ItemPicker from "./ItemPicker";

const STATUS = {
  draft: { th: "ร่าง", cls: "open" }, sent: { th: "ส่งแล้ว", cls: "open" },
  approved: { th: "อนุมัติ", cls: "closed" }, rejected: { th: "ปฏิเสธ", cls: "closed" }, expired: { th: "หมดอายุ", cls: "closed" },
};
const STATUS_OPTS = [["draft", "ร่าง"], ["sent", "ส่งแล้ว"], ["approved", "อนุมัติ"], ["rejected", "ปฏิเสธ"], ["expired", "หมดอายุ"]];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `QT-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Quotation({ role, focus, onFocusConsumed, onCreateJob }) {
  const canEdit = ["admin", "sales", "exec", "finance"].includes(role);
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [boqs, setBoqs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printQ, setPrintQ] = React.useState(null);
  const [statusF, setStatusF] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  async function load() {
    setLoading(true);
    try { const [q, c, m, b, co] = await Promise.all([listQuotations(), listCustomers(), listMaterials(), listBoqs(), getCompanies()]); setList(q); setCusts(c); setMats(m); setBoqs(b); setCompanies(co || { vat: {}, novat: {} }); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (!printQ) return; const t = setTimeout(() => { window.print(); setPrintQ(null); }, 80); return () => clearTimeout(t); }, [printQ]);
  // open focused on a specific quote (from the dashboard report link)
  React.useEffect(() => { if (!focus) return; setEd(null); setStatusF("all"); setSearch(focus); onFocusConsumed && onFocusConsumed(); }, [focus]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  function startNew() { setEd({ quote_no: genNo(), customer_id: "", site_id: "", boq_no: "", title: "", status: "draft", issue_date: today(), valid_until: "", discount_type: "amount", discount_value: 0, vat: true, wht: false, wht_rate: 3, note: "", items: [] }); }
  function startEdit(q) {
    setEd({ _edit: true, quote_no: q.quote_no, customer_id: q.customer_id || "", site_id: q.site_id || "", boq_no: q.boq_no || "", title: q.title || "", status: q.status, issue_date: q.issue_date || today(), valid_until: q.valid_until || "", discount_type: q.discount_type || "amount", discount_value: q.discount_value || 0, vat: q.vat, wht: !!q.wht, wht_rate: q.wht_rate || 3, note: q.note || "", approved_at: q.approved_at,
      items: q.items.map((x) => ({ code: x.item_code, name: x.name, unit: x.unit, qty: Number(x.qty), unit_price: Number(x.unit_price), kind: x.kind })) });
  }

  const cust = custs.find((c) => String(c.id) === String(ed?.customer_id));
  const custBoqs = boqs.filter((b) => !ed?.customer_id || String(b.customer_id) === String(ed?.customer_id));

  function setQ(k, v) { setEd((e) => ({ ...e, [k]: v })); }
  function onCustomer(id) { setEd((e) => ({ ...e, customer_id: id, site_id: "", vat: custs.find((c) => String(c.id) === String(id))?.vat ?? true })); }
  const addLine = (m) => setEd((e) => {
    const i = e.items.findIndex((x) => x.code === m.code);
    if (i >= 0) { const items = [...e.items]; items[i] = { ...items[i], qty: items[i].qty + 1 }; return { ...e, items }; }
    return { ...e, items: [...e.items, { code: m.code, name: m.th, unit: m.unit, qty: 1, unit_price: m.salePrice || 0, kind: m.kind }] };
  });
  const setLine = (i, k, v) => setEd((e) => ({ ...e, items: e.items.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
  const delLine = (i) => setEd((e) => ({ ...e, items: e.items.filter((_, j) => j !== i) }));

  function pullFromBoq() {
    const b = boqs.find((x) => x.boq_no === ed.boq_no); if (!b) return flash("เลือก BOQ ก่อน", true);
    const pulled = b.items.filter((x) => ["ac", "charged", "service"].includes(x.section)).map((x) => {
      const m = matMap[x.item_code];
      return { code: x.item_code, name: x.name || m?.th, unit: x.unit || m?.unit, qty: Number(x.qty), unit_price: m?.salePrice || 0, kind: m?.kind };
    });
    setEd((e) => ({ ...e, items: pulled }));
    flash(`ดึง ${pulled.length} รายการจาก ${b.boq_no} (ไม่รวมของแถม)`);
  }

  // totals
  const subtotal = ed ? ed.items.reduce((a, x) => a + Number(x.qty) * Number(x.unit_price), 0) : 0;
  const discount = ed ? (ed.discount_type === "percent" ? subtotal * Number(ed.discount_value || 0) / 100 : Number(ed.discount_value || 0)) : 0;
  const afterDisc = subtotal - discount;
  const vatAmt = ed && ed.vat ? afterDisc * 0.07 : 0;
  const grand = afterDisc + vatAmt;
  const whtAmt = ed && ed.wht ? afterDisc * (Number(ed.wht_rate) || 3) / 100 : 0;
  const netPay = grand - whtAmt;

  async function save() {
    if (!ed.items.length) return flash("เพิ่มรายการอย่างน้อย 1 รายการ", true);
    if (ed._edit && !window.confirm(`ยืนยันบันทึกการแก้ไขใบเสนอราคา ${ed.quote_no} ?`)) return;
    try { await saveQuotation(ed, ed.items); flash("บันทึกใบเสนอราคาแล้ว"); setEd(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(q) { if (!confirm(`ลบ ${q.quote_no}?`)) return; try { await deleteQuotation(q.quote_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  async function approve(q) {
    if (!window.confirm(`ยืนยันอนุมัติใบเสนอราคา ${q.quote_no} ?`)) return;
    try { await setQuotationStatus(q.quote_no, "approved"); flash(`อนุมัติ ${q.quote_no} แล้ว ✓`); await load(); }
    catch (e) { flash("อนุมัติไม่สำเร็จ: " + (e.message || e), true); }
  }
  function copyQ(q) {
    const text = `ใบเสนอราคา ${q.quote_no}\nลูกค้า: ${q.customerName || "-"}\n`
      + q.items.map((it, i) => `${i + 1}. ${it.name} — ${it.qty} ${it.unit || ""} × ${fmtBaht(it.unit_price)} = ${fmtBaht(it.qty * it.unit_price)}`).join("\n")
      + `\nรวม ${fmtBaht(q.subtotal)}${q.discount ? ` − ส่วนลด ${fmtBaht(q.discount)}` : ""}${q.vat ? ` + VAT ${fmtBaht(q.vatAmt)}` : ""}\nสุทธิ ${fmtBaht(q.grand)}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => flash("คัดลอกแล้ว")); else window.prompt("คัดลอก:", text);
  }

  // ---------- EDITOR ----------
  if (ed) {
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">ใบเสนอราคา <span className="page-title-en">Quotation</span></h1>
          <p className="page-sub">ดึงจาก BOQ ได้ (ไม่รวมของแถม) · ส่วนลด · VAT · ราคาขาย</p></div></div>
        <div className="card" style={{ maxWidth: 860 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่ใบเสนอราคา</span><input className="inp" value={ed.quote_no} onChange={(e) => setQ("quote_no", e.target.value)} /></label>
            <label className="fld"><span>ชื่องาน</span><input className="inp" value={ed.title} onChange={(e) => setQ("title", e.target.value)} placeholder="เช่น ติดตั้งแอร์ออฟฟิศ" /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ลูกค้า</span>
              <select className="inp" value={ed.customer_id} onChange={(e) => onCustomer(e.target.value)}>
                <option value="">— เลือกลูกค้า —</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="fld"><span>ไซต์งาน</span>
              <select className="inp" value={ed.site_id} onChange={(e) => setQ("site_id", e.target.value)} disabled={!cust?.sites?.length}>
                <option value="">{cust?.sites?.length ? "— เลือกไซต์ —" : "(ไม่มีไซต์)"}</option>
                {cust?.sites?.map((s) => <option key={s.id} value={s.id}>{s.site_name || s.address}</option>)}
              </select>
            </label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={ed.issue_date} onChange={(e) => setQ("issue_date", e.target.value)} /></label>
            <label className="fld"><span>ยืนราคาถึง</span><input className="inp" type="date" value={ed.valid_until} onChange={(e) => setQ("valid_until", e.target.value)} /></label>
          </div>

          {/* pull from BOQ */}
          <div className="fld"><span>ดึงรายการจาก BOQ (ไม่บังคับ)</span>
            <div className="line-add">
              <select className="inp" value={ed.boq_no} onChange={(e) => setQ("boq_no", e.target.value)}>
                <option value="">— ไม่อ้าง BOQ —</option>{custBoqs.map((b) => <option key={b.boq_no} value={b.boq_no}>{b.boq_no}{b.title ? ` · ${b.title}` : ""}</option>)}
              </select>
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
                <div className="boq-line" key={i}>
                  <div className="line-info"><div className="line-name">{it.name}</div><div className="line-sub">{it.code || "-"}</div></div>
                  <div className="inp inp-unit boq-in"><input type="number" min="0" value={it.qty} onChange={(e) => setLine(i, "qty", Math.max(0, Number(e.target.value) || 0))} /><span className="unit-suf">{it.unit}</span></div>
                  <div className="inp inp-unit boq-in"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => setLine(i, "unit_price", Number(e.target.value) || 0)} /></div>
                  <span className="boq-amt">{fmtBaht(it.qty * it.unit_price)}</span>
                  <button className="line-x" onClick={() => delLine(i)}><UIcon name="x" size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* discount + vat + totals */}
          <div className="fld-row">
            <label className="fld"><span>ส่วนลด</span>
              <div className="line-add">
                <select className="inp" style={{ width: 90, flex: "none" }} value={ed.discount_type} onChange={(e) => setQ("discount_type", e.target.value)}>
                  <option value="amount">บาท</option><option value="percent">%</option>
                </select>
                <input className="inp" type="number" min="0" value={ed.discount_value} onChange={(e) => setQ("discount_value", Number(e.target.value) || 0)} />
              </div>
            </label>
            <label className="fld"><span>ภาษีมูลค่าเพิ่ม</span>
              <button type="button" className={"vat-toggle" + (ed.vat ? " on" : "")} onClick={() => setQ("vat", !ed.vat)}>{ed.vat ? "คิด VAT 7%" : "ไม่คิด VAT"}</button>
            </label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>หัก ณ ที่จ่าย</span>
              <div className="line-add">
                <button type="button" className={"vat-toggle" + (ed.wht ? " on" : "")} style={{ flex: 1 }} onClick={() => setQ("wht", !ed.wht)}>{ed.wht ? "หัก ณ ที่จ่าย" : "ไม่หัก ณ ที่จ่าย"}</button>
                <div className="inp inp-unit" style={{ width: 110, flex: "none", opacity: ed.wht ? 1 : .5 }}>
                  <input type="number" min="0" step="0.1" value={ed.wht_rate} disabled={!ed.wht} onChange={(e) => setQ("wht_rate", Number(e.target.value) || 0)} /><span className="unit-suf">%</span>
                </div>
              </div>
            </label>
            <div className="fld" />
          </div>

          <div className="qt-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(subtotal)}</b></div>
            {discount > 0 && <div><span>ส่วนลด</span><b style={{ color: "var(--down)" }}>− {fmtBaht(discount)}</b></div>}
            {ed.vat && <div><span>VAT 7%</span><b>{fmtBaht(vatAmt)}</b></div>}
            <div className="qt-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(grand)}</b></div>
            {ed.wht && <div><span>หัก ณ ที่จ่าย {Number(ed.wht_rate) || 3}%</span><b style={{ color: "var(--down)" }}>− {fmtBaht(whtAmt)}</b></div>}
            {ed.wht && <div className="qt-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(netPay)}</b></div>}
          </div>

          <div className="fld-row">
            <label className="fld"><span>สถานะ</span>
              <select className="inp" value={ed.status} onChange={(e) => setQ("status", e.target.value)}>{STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="fld"><span>หมายเหตุ</span><input className="inp" value={ed.note} onChange={(e) => setQ("note", e.target.value)} placeholder="(ไม่บังคับ)" /></label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึกใบเสนอราคา</button>
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

      {loading && <div className="empty">กำลังโหลด…</div>}
      {(() => {
        const ql = search.trim().toLowerCase();
        const fl = list.filter((q) => (statusF === "all" || q.status === statusF)
          && (!ql || q.quote_no.toLowerCase().includes(ql) || (q.customerName || "").toLowerCase().includes(ql) || (q.contactName || "").toLowerCase().includes(ql) || (q.contactPhone || "").toLowerCase().includes(ql) || (q.title || "").toLowerCase().includes(ql)));
        return (<>
      {!loading && fl.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบเสนอราคา" : "ไม่พบใบเสนอราคาที่ตรงเงื่อนไข"}</div>}
      <div className="job-cards">
        {fl.map((q) => {
          const st = STATUS[q.status] || STATUS.draft;
          return (
            <div className={"card job-card" + (q.status !== "draft" && q.status !== "sent" ? " closed" : "")} key={q.quote_no}>
              <div className="job-card-head" style={{ cursor: "default" }}>
                <div className="job-card-id"><span className="job-no">{q.quote_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta">{q.title || "ใบเสนอราคา"} · {q.items.length} รายการ{q.boq_no ? ` · อ้าง ${q.boq_no}` : ""}</div>
                <div className="job-card-cost"><span>ยอดสุทธิ</span><b>{fmtBaht(q.grand)}</b></div>
              </div>
              <div className="jo-info">
                <div className="jo-info-row"><span className="jo-ic">🏢</span><b>{q.customerName || "ไม่ระบุลูกค้า"}</b>{q.customerAddr ? <span className="jo-dim"> · {q.customerAddr}</span> : null}</div>
                {(q.contactName || q.contactPhone) && <div className="jo-info-row"><span className="jo-ic">👤</span>{q.contactName || "ผู้ติดต่อ"}{q.contactPhone && <a href={`tel:${q.contactPhone}`} className="jo-tel">📞 {q.contactPhone}</a>}</div>}
                {q.siteAddress && <div className="jo-info-row"><span className="jo-ic">📍</span><span style={{ flex: 1 }}>{q.siteAddress}</span>{q.map_url && <a href={q.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm" onClick={(e) => e.stopPropagation()}>แผนที่</a>}</div>}
              </div>
              <div className="job-lines"><div className="job-actions">
                <button className="btn-ghost sm" onClick={() => setPrintQ(q)}><UIcon name="catalog" size={14} /> พิมพ์</button>
                <button className="btn-ghost sm" onClick={() => copyQ(q)}><UIcon name="clipboard" size={14} /> คัดลอก</button>
                {canEdit && <button className="btn-ghost sm" onClick={() => startEdit(q)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canEdit && (q.status === "draft" || q.status === "sent") && <button className="btn-issue green" onClick={() => approve(q)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.6} /> อนุมัติ</button>}
                {canEdit && q.status === "approved" && onCreateJob && <button className="btn-primary" onClick={() => onCreateJob(q)}><UIcon name="clipboard" size={14} color="#fff" /> สร้างใบงาน</button>}
                {canEdit && <button className="btn-ghost sm danger" onClick={() => del(q)}><UIcon name="trash" size={14} /></button>}
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
          metaRows={[{ label: "วันที่", value: printQ.issue_date }, { label: "ยืนราคาถึง", value: printQ.valid_until }]}
          customer={{ name: printQ.customerName, code: custCode(printQ.customerCode), taxId: printQ.customerTaxId, address: printQ.siteAddress || printQ.customerAddr, contactName: printQ.contactName, contactPhone: printQ.contactPhone }}
          terms={printQ.note || co.default_terms} bank={co.bank_info}
          signLabels={["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]}>
          <table className="doc-table">
            <thead><tr><th>#</th><th>รหัส</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">หน่วยละ</th><th className="r">จำนวนเงิน</th></tr></thead>
            <tbody>{printQ.items.map((it, i) => (
              <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}</td><td className="r">{it.qty} {it.unit || ""}</td><td className="r">{fmtBaht(it.unit_price)}</td><td className="r">{fmtBaht(it.qty * it.unit_price)}</td></tr>
            ))}</tbody>
          </table>
          <div className="doc-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(printQ.subtotal)}</b></div>
            {printQ.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(printQ.discount)}</b></div>}
            {printQ.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(printQ.vatAmt)}</b></div> : null}
            <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(printQ.grand)}</b></div>
            {printQ.wht ? <div><span>หัก ณ ที่จ่าย {Number(printQ.wht_rate) || 3}%</span><b>− {fmtBaht(printQ.whtAmt)}</b></div> : null}
            {printQ.wht ? <div className="doc-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(printQ.netPay)}</b></div> : null}
          </div>
        </DocSlip>
      ); })()}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
