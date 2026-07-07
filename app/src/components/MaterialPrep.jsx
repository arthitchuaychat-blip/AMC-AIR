import React from "react";
import { listMaterialPreps, saveMaterialPrep, setPrepStatus, deleteMaterialPrep, listMaterialsLite, listApprovedQuotesLite, getQuoteItems } from "../lib/api";
import { fmtNum, matchText } from "../lib/format";
import { can } from "../lib/permissions";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import ItemPicker from "./ItemPicker";
import { UIcon } from "../icons";

// ใบเตรียมวัสดุ — ประตูก่อนการสั่งซื้อ/เบิก (mig 109)
// ดึงรายการจากใบเสนอราคา (หรือเพิ่มเอง) → แบ่งจำนวน "ซื้อ / เบิกจากคลัง" ต่อรายการ (เห็นคงเหลือช่วยตัดสิน)
// → ธุรการ/ผู้บริหารอนุมัติ → แตกเป็นใบสั่งซื้อ (ร่าง) + ใบเบิก (ร่าง) แล้วดำเนินการตามกระบวนการเดิม
const pad = (n) => String(n).padStart(2, "0");
const genNo = () => { const d = new Date(); return `MP-${String(d.getFullYear()).slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };
const STATUS = {
  draft: { th: "ร่าง", cls: "b-grey" },
  approved: { th: "อนุมัติแล้ว", cls: "b-blue" },
  done: { th: "ดำเนินการแล้ว", cls: "b-green" },
  cancelled: { th: "ยกเลิก", cls: "b-red" },
};

export default function MaterialPrep({ role, prefill, onPrefillConsumed, onCreatePo, onWithdraw, onOpenQuote, onOpenJob }) {
  const canEdit = can(role, "prep", "edit");
  const canApprove = ["admin", "exec"].includes(role);   // คนอนุมัติ: ธุรการ และเหนือกว่า
  const [list, setList] = React.useState(null);
  const [mats, setMats] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [ed, setEd] = React.useState(null);
  const [statusF, setStatusF] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3000); };
  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  async function load() {
    try {
      const [p, m, qs] = await Promise.all([listMaterialPreps(), listMaterialsLite(), listApprovedQuotesLite()]);
      setList(p); setMats(m); setQuotes(qs);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน migration 109 แล้วหรือยัง?)", true); setList([]); }
  }
  React.useEffect(() => { load(); }, []);

  // แบ่งจำนวนอัตโนมัติ: คลังพอ → เบิกทั้งหมด · ไม่พอ → เบิกเท่าที่มี ที่เหลือสั่งซื้อ (แก้ทับได้)
  const smartSplit = (m, need) => {
    const stock = m && m.tracked ? Math.max(0, Number(m.stock) || 0) : 0;
    const wd = Math.min(need, stock);
    return { qty_withdraw: wd, qty_buy: Math.max(0, need - wd) };
  };
  const lineFromQuoteItem = (it) => {
    const m = matMap[it.item_code];
    const need = Number(it.qty) || 1;
    return { code: it.item_code, name: it.name || m?.th || it.item_code, unit: it.unit || m?.unit || "", ...smartSplit(m, need) };
  };

  // เปิดจากปุ่ม "เตรียมวัสดุ" ในใบเสนอราคา — ดึงรายการมาให้อัตโนมัติ
  React.useEffect(() => {
    if (!prefill || !mats.length) return;
    setEd({ prep_no: genNo(), quote_no: prefill.quoteNo || "", title: "", note: "", status: "draft",
      items: (prefill.items || []).map((p) => { const m = matMap[p.code]; return { code: p.code, name: m?.th || p.code, unit: m?.unit || "", ...smartSplit(m, Number(p.qty) || 1) }; }) });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, mats]);

  function startNew() { setEd({ prep_no: genNo(), quote_no: "", title: "", note: "", status: "draft", items: [] }); }
  function startEdit(p) {
    setEd({ _edit: true, prep_no: p.prep_no, quote_no: p.quote_no || "", title: p.title || "", note: p.note || "", status: p.status,
      items: (p.items || []).map((it) => ({ code: it.material_code, name: it.name || matMap[it.material_code]?.th || it.material_code, unit: it.unit || "", qty_buy: Number(it.qty_buy) || 0, qty_withdraw: Number(it.qty_withdraw) || 0 })) });
  }
  async function pullQuote() {
    if (!ed.quote_no) return flash("เลือกใบเสนอราคาก่อน", true);
    try {
      const items = (await getQuoteItems(ed.quote_no)).filter((it) => it.item_code && it.kind !== "service");
      if (!items.length) return flash("ใบเสนอราคานี้ไม่มีรายการสินค้า/วัสดุ", true);
      const existing = new Set(ed.items.map((x) => x.code));
      const add = items.filter((it) => !existing.has(it.item_code)).map(lineFromQuoteItem);
      if (!add.length) return flash("รายการจากใบเสนอราคามีครบแล้ว");
      setEd((e) => ({ ...e, items: [...e.items, ...add] }));
      flash(`ดึงมา ${add.length} รายการ — ตรวจช่อง ซื้อ/เบิก แล้วบันทึก`);
    } catch (e) { flash("ดึงรายการไม่สำเร็จ: " + (e.message || e), true); }
  }
  const addLine = (m, _t, qty = 1) => setEd((e) => {
    const i = e.items.findIndex((x) => x.code === m.code);
    if (i >= 0) { const items = [...e.items]; const need = items[i].qty_buy + items[i].qty_withdraw + Number(qty); items[i] = { ...items[i], ...smartSplit(matMap[m.code], need) }; return { ...e, items }; }
    return { ...e, items: [...e.items, { code: m.code, name: m.th, unit: m.unit || "", ...smartSplit(m, Number(qty) || 1) }] };
  });
  const setLine = (i, k, v) => setEd((e) => ({ ...e, items: e.items.map((x, j) => (j === i ? { ...x, [k]: Math.max(0, Number(v) || 0) } : x)) }));
  const delLine = (i) => setEd((e) => ({ ...e, items: e.items.filter((_, j) => j !== i) }));

  async function save() {
    const items = ed.items.filter((x) => x.qty_buy > 0 || x.qty_withdraw > 0);
    if (!items.length) return flash("ใส่จำนวน ซื้อ หรือ เบิก อย่างน้อย 1 รายการ", true);
    setBusy(true);
    try { await saveMaterialPrep(ed, items); setEd(null); await load(); flash("บันทึกใบเตรียมวัสดุแล้ว ✓" + (canApprove ? "" : " — รอธุรการอนุมัติ")); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function approve(p) {
    if (!await confirmDialog(`อนุมัติใบเตรียมวัสดุ ${p.prep_no} ?\nหลังอนุมัติจะกดสร้างใบสั่งซื้อ/ใบเบิกได้`)) return;
    try { await setPrepStatus(p.prep_no, "approved"); await load(); flash("อนุมัติแล้ว ✓"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function markDone(p) {
    if (!await confirmDialog(`ปิดใบ ${p.prep_no} (ดำเนินการครบแล้ว)?`)) return;
    try { await setPrepStatus(p.prep_no, "done"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function remove(p) {
    if (!await confirmDialog(`ลบใบเตรียมวัสดุ ${p.prep_no} ?`)) return;
    try { await deleteMaterialPrep(p.prep_no); await load(); flash("ลบแล้ว"); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  const buyItems = (p) => (p.items || []).filter((it) => Number(it.qty_buy) > 0);
  const wdItems = (p) => (p.items || []).filter((it) => Number(it.qty_withdraw) > 0);

  const shown = (list || []).filter((p) => (statusF === "all" || p.status === statusF)
    && matchText(q, p.prep_no, p.quote_no, p.title, p.customerName, p.jobNo, p.teamName));

  if (ed) {
    const totBuy = ed.items.reduce((a, x) => a + x.qty_buy, 0), totWd = ed.items.reduce((a, x) => a + x.qty_withdraw, 0);
    return (
      <div className="adm">
        <div className="adm-head">
          <div><h1 className="page-title">{ed._edit ? "แก้ไข" : "สร้าง"}ใบเตรียมวัสดุ <span className="page-title-en">{ed.prep_no}</span></h1>
            <p className="page-sub">แบ่งจำนวนแต่ละรายการ: 🛒 สั่งซื้อ / 📦 เบิกจากคลัง (ระบบแบ่งให้ตามคงเหลือ แก้ทับได้)</p></div>
          <button className="btn-ghost" onClick={() => setEd(null)}>‹ กลับ</button>
        </div>
        <div className="card" style={{ maxWidth: 1000 }}>
          <div className="fld-row">
            <label className="fld"><span>อ้างอิงใบเสนอราคา (ไม่บังคับ)</span>
              <div className="line-add">
                <Combo className="inp" value={ed.quote_no} onChange={(e) => setEd((s) => ({ ...s, quote_no: e.target.value }))}>
                  <option value="">— ไม่อ้างอิง —</option>
                  {quotes.map((x) => <option key={x.quote_no} value={x.quote_no}>{x.quote_no}{x.customerName ? ` · ${x.customerName}` : ""}</option>)}
                </Combo>
                <button type="button" className="btn-ghost sm" onClick={pullQuote} disabled={!ed.quote_no}><UIcon name="box" size={14} /> ดึงรายการ</button>
              </div>
            </label>
            <label className="fld"><span>ชื่องาน/หมายเหตุสั้น</span>
              <input className="inp" value={ed.title} onChange={(e) => setEd((s) => ({ ...s, title: e.target.value }))} placeholder="เช่น เตรียมของงานติดตั้ง 5 เครื่อง" />
            </label>
          </div>
          <div className="fld"><span>เพิ่มรายการ (ค้นหาสินค้า/วัสดุ)</span>
            <ItemPicker items={mats.filter((m) => m.kind !== "service")} placeholder="ค้นหารหัส / ชื่อสินค้า…" onPick={addLine} />
          </div>
          {ed.items.length > 0 && (
            <div className="line-list">
              <div className="boq-line" style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-3)" }}>
                <div className="line-info">รายการ</div>
                <span style={{ width: 90, textAlign: "center" }}>คงเหลือ</span>
                <span style={{ width: 110, textAlign: "center" }}>📦 เบิกจากคลัง</span>
                <span style={{ width: 110, textAlign: "center" }}>🛒 สั่งซื้อ</span>
                <span style={{ width: 30 }} />
              </div>
              {ed.items.map((it, i) => {
                const m = matMap[it.code];
                const stock = m && m.tracked ? Number(m.stock) || 0 : null;
                const overWd = stock != null && it.qty_withdraw > stock;
                return (
                  <div className="line-item" key={it.code || i}>
                    <div className="boq-line">
                      <div className="line-info"><div className="line-name">{it.name}</div><div className="line-sub">{it.code || "-"}{it.unit ? ` · ${it.unit}` : ""}</div></div>
                      <span style={{ width: 90, textAlign: "center", fontWeight: 700, color: stock === 0 ? "#dc2626" : "var(--ink-2)" }}>{stock == null ? "—" : fmtNum(stock)}</span>
                      <div className="inp inp-unit boq-in" style={{ width: 110, borderColor: overWd ? "#dc2626" : undefined }}>
                        <input type="number" min="0" value={it.qty_withdraw} onChange={(e) => setLine(i, "qty_withdraw", e.target.value)} />
                      </div>
                      <div className="inp inp-unit boq-in" style={{ width: 110 }}>
                        <input type="number" min="0" value={it.qty_buy} onChange={(e) => setLine(i, "qty_buy", e.target.value)} />
                      </div>
                      <button className="line-x" onClick={() => delLine(i)}><UIcon name="x" size={14} /></button>
                    </div>
                    {overWd && <div style={{ fontSize: 12, color: "#dc2626", padding: "0 4px 6px" }}>⚠️ เบิกเกินคงเหลือ ({fmtNum(stock)}) — ส่วนที่เกินควรย้ายไปช่องสั่งซื้อ</div>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="qt-totals" style={{ marginTop: 10 }}>
            <div><span>📦 เบิกจากคลังรวม</span><b>{fmtNum(totWd)} ชิ้น</b></div>
            <div><span>🛒 สั่งซื้อรวม</span><b>{fmtNum(totBuy)} ชิ้น</b></div>
          </div>
          <label className="fld" style={{ marginTop: 8 }}><span>หมายเหตุ</span>
            <textarea className="inp" rows={2} value={ed.note} onChange={(e) => setEd((s) => ({ ...s, note: e.target.value }))} style={{ resize: "vertical" }} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" disabled={busy} onClick={save}>✓ บันทึกใบเตรียมวัสดุ</button>
          </div>
        </div>
        {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
      </div>
    );
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">เตรียมวัสดุ <span className="page-title-en">Material Prep</span></h1>
          <p className="page-sub">เตรียมของก่อนเริ่มงาน: ดึงรายการจากใบเสนอราคา → แบ่ง ซื้อ/เบิก → อนุมัติ → แตกเป็นใบสั่งซื้อ + ใบเบิก</p></div>
        <div className="cat-head-actions">
          <div className="cat-search" style={{ maxWidth: 300 }}>
            <UIcon name="search" size={16} color="var(--ink-3)" />
            <input placeholder="ค้นหา เลขใบ / ลูกค้า / งาน" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> สร้างใบเตรียมวัสดุ</button>}
        </div>
      </div>
      <div className="cat-filter" style={{ marginBottom: 14 }}>
        {[["all", "ทั้งหมด"], ["draft", "ร่าง (รออนุมัติ)"], ["approved", "อนุมัติแล้ว"], ["done", "ดำเนินการแล้ว"], ["cancelled", "ยกเลิก"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}} onClick={() => setStatusF(v)}>{l}</button>
        ))}
      </div>

      {list === null ? <div className="empty">กำลังโหลด…</div>
        : shown.length === 0 ? <div className="empty" style={{ padding: 40 }}>ยังไม่มีใบเตรียมวัสดุ — กด "สร้างใบเตรียมวัสดุ" หรือกดปุ่ม 📋 เตรียมวัสดุ จากใบเสนอราคา</div>
        : (
          <div className="job-cards">
            {shown.map((p) => {
              const st = STATUS[p.status] || STATUS.draft;
              const nb = buyItems(p).length, nw = wdItems(p).length;
              return (
                <div className={"card job-card" + (p.status === "cancelled" ? " closed" : "")} key={p.prep_no}>
                  <div className="job-card-head" style={{ cursor: "default" }}>
                    <div className="job-card-id"><span className="job-no">{p.prep_no}</span><span className={"job-badge " + st.cls}>{st.th}</span>
                      {p.quote_no && <button type="button" className="vat-badge vat-on" style={{ cursor: "pointer", border: "1px solid transparent" }} onClick={() => onOpenQuote && onOpenQuote(p.quote_no)}>อ้างอิง {p.quote_no} ↗</button>}
                      {p.jobNo && <button type="button" className="vat-badge" style={{ cursor: "pointer", border: "1px solid transparent", background: "#f3e8ff", color: "#7c3aed" }} onClick={() => onOpenJob && onOpenJob(p.jobNo)}>งาน {p.jobNo} ↗</button>}
                    </div>
                    <div className="job-card-meta">{p.title || p.quoteTitle || "—"}
                      {(p.customerName || p.teamName) && <div style={{ marginTop: 2 }}>
                        {p.customerName ? <span>👤 ลูกค้า <b>{p.customerName}</b></span> : null}
                        {p.teamName ? <span>{p.customerName ? " · " : ""}🔧 ช่าง <b>{p.teamName}</b></span> : null}
                      </div>}
                      <div style={{ marginTop: 2, fontSize: 12.5 }}>🛒 สั่งซื้อ {nb} รายการ · 📦 เบิก {nw} รายการ{p.approvedByName ? ` · อนุมัติโดย ${p.approvedByName}` : ""}</div>
                    </div>
                  </div>
                  <div className="jo-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 14px" }}>
                    {p.status === "draft" && canEdit && <button className="btn-ghost sm" onClick={() => startEdit(p)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                    {p.status === "draft" && canApprove && <button className="btn-primary sm" onClick={() => approve(p)}>✓ อนุมัติ</button>}
                    {p.status === "draft" && !canApprove && <span className="job-badge b-grey">รอธุรการอนุมัติ</span>}
                    {p.status === "approved" && nb > 0 && canEdit && (
                      <button className="btn-primary sm" onClick={() => onCreatePo && onCreatePo(buyItems(p).map((it) => ({ code: it.material_code, qty: Number(it.qty_buy) })), p.quote_no)}>🛒 สร้างใบสั่งซื้อ ({nb})</button>
                    )}
                    {p.status === "approved" && nw > 0 && canEdit && (
                      <button className="btn-primary sm" style={{ background: "#0369a1" }} onClick={() => onWithdraw && onWithdraw(wdItems(p).map((it) => ({ code: it.material_code, qty: Number(it.qty_withdraw) })), p.jobNo, p.jobTeam)}>📦 ไปเบิกวัสดุ ({nw})</button>
                    )}
                    {p.status === "approved" && canEdit && <button className="btn-ghost sm" onClick={() => markDone(p)}>ปิดใบ (ครบแล้ว)</button>}
                    {p.status === "draft" && canEdit && <button className="btn-ghost sm danger" onClick={() => remove(p)}><UIcon name="trash" size={14} /> ลบ</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
