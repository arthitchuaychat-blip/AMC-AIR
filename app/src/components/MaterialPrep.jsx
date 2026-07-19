import React from "react";
import { listMaterialPreps, saveMaterialPrep, setPrepStatus, deleteMaterialPrep, listMaterialsLite, listApprovedQuotesLite, getQuoteItems } from "../lib/api";
import { fmtNum, matchText } from "../lib/format";
import { can } from "../lib/permissions";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import ItemPicker from "./ItemPicker";
import ItemBrowser from "./ItemBrowser";
import UnitPick, { unitFactor } from "./UnitPick";
import { UIcon } from "../icons";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useDocPeek } from "./DocPeek";
import DocCardHead from "./DocCard";

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
  const canConfirm = canEdit;   // ยืนยันเอง (ไม่ต้องรออนุมัติ) — คนเตรียมวัสดุกดยืนยันได้เลย
  const canDeleteConfirmed = ["admin", "exec"].includes(role);   // ลบใบที่ยืนยันแล้ว = ธุรการ และเหนือกว่า เท่านั้น
  // ชิปเชื่อมโยง → พรีวิวแผงขวาก่อน · "เปิดหน้าเต็ม" ค่อยเด้งไปเมนูจริง
  const [peekEl, openPeek] = useDocPeek((t, n) => (t === "quote" ? (onOpenQuote && onOpenQuote(n)) : t === "job" ? (onOpenJob && onOpenJob(n)) : null));
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

  // คงเหลือในคลังของหน่วยที่เลือก (สต๊อกเก็บเป็นหน่วยหลักเสมอ → หารด้วยแฟกเตอร์)
  const stockInUnit = (m, unit) => { if (!m || !m.tracked) return null; const f = unitFactor(m, unit); return Math.floor((Math.max(0, Number(m.stock) || 0) / f) * 100) / 100; };
  // แบ่งจำนวนอัตโนมัติ (ตามหน่วยที่เลือก): คลังพอ → เบิกทั้งหมด · ไม่พอ → เบิกเท่าที่มี ที่เหลือสั่งซื้อ (แก้ทับได้)
  const smartSplit = (m, need, unit) => {
    const stock = stockInUnit(m, unit || m?.unit) ?? 0;
    const wd = Math.min(need, stock);
    return { qty_withdraw: wd, qty_buy: Math.max(0, need - wd) };
  };
  const lineFromQuoteItem = (it) => {
    const m = matMap[it.item_code];
    const need = Number(it.qty) || 1;
    const unit = it.unit || m?.unit || "";
    return { code: it.item_code, name: it.name || m?.th || it.item_code, unit, ...smartSplit(m, need, unit) };
  };
  // เปลี่ยนหน่วยของบรรทัด → แปลงจำนวนตามสัดส่วน (ปัดขึ้นให้ครอบ) แล้วแบ่งซื้อ/เบิกใหม่ตามคงเหลือหน่วยใหม่
  const setLineUnit = (i, u) => setEd((e) => ({ ...e, items: e.items.map((x, j) => {
    if (j !== i) return x;
    const m = matMap[x.code]; const oldF = unitFactor(m, x.unit || m?.unit); const newF = unitFactor(m, u);
    const need = Math.ceil(((x.qty_buy + x.qty_withdraw) * oldF) / newF * 100) / 100;
    return { ...x, unit: u, ...smartSplit(m, need, u) };
  }) }));

  // เปิดจากปุ่ม "เตรียมวัสดุ" ในใบเสนอราคา/ใบงาน — ดึงรายการมาให้อัตโนมัติ
  // (จากใบงานส่งมาแค่ quoteNo → ไปดึงรายการของใบเสนอราคาเอง)
  React.useEffect(() => {
    if (!prefill || !mats.length) return;
    let dead = false;
    (async () => {
      let items = prefill.items;
      if (!items && prefill.quoteNo) {
        try { items = (await getQuoteItems(prefill.quoteNo)).filter((it) => it.item_code && it.kind !== "service").map((it) => ({ code: it.item_code, qty: Number(it.qty) || 1 })); }
        catch { items = []; }
      }
      if (dead) return;
      setEd({ prep_no: genNo(), quote_no: prefill.quoteNo || "", job_no: prefill.jobNo || "", title: prefill.title || "", issue_date: new Date().toISOString().slice(0, 10), note: "", status: "draft",
        items: (items || []).map((p) => { const m = matMap[p.code]; return { code: p.code, name: m?.th || p.code, unit: m?.unit || "", ...smartSplit(m, Number(p.qty) || 1) }; }) });
      onPrefillConsumed && onPrefillConsumed();
    })();
    return () => { dead = true; };
  }, [prefill, mats]);

  function startNew() { setEd({ prep_no: genNo(), quote_no: "", job_no: "", title: "", issue_date: new Date().toISOString().slice(0, 10), note: "", status: "draft", items: [] }); }
  function startEdit(p) {
    setEd({ _edit: true, prep_no: p.prep_no, quote_no: p.quote_no || "", job_no: p.job_no || "", title: p.title || "", issue_date: p.issue_date || (p.created_at || "").slice(0, 10), note: p.note || "", status: p.status,
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
    if (i >= 0) { const items = [...e.items]; const need = items[i].qty_buy + items[i].qty_withdraw + Number(qty); items[i] = { ...items[i], ...smartSplit(matMap[m.code], need, items[i].unit) }; return { ...e, items }; }
    return { ...e, items: [...e.items, { code: m.code, name: m.th, unit: m.unit || "", ...smartSplit(m, Number(qty) || 1, m.unit) }] };
  });
  const setLine = (i, k, v) => setEd((e) => ({ ...e, items: e.items.map((x, j) => (j === i ? { ...x, [k]: Math.max(0, Number(v) || 0) } : x)) }));
  const delLine = (i) => setEd((e) => ({ ...e, items: e.items.filter((_, j) => j !== i) }));

  async function save() {
    const items = ed.items.filter((x) => x.qty_buy > 0 || x.qty_withdraw > 0);
    if (!items.length) return flash("ใส่จำนวน ซื้อ หรือ เบิก อย่างน้อย 1 รายการ", true);
    setBusy(true);
    try { await saveMaterialPrep(ed, items); setEd(null); await load(); flash("บันทึกร่างใบเตรียมวัสดุแล้ว ✓ — ตรวจแล้วกด “ยืนยัน” เพื่อสร้างใบสั่งซื้อ/ใบเบิก"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function confirm(p) {
    if (!await confirmDialog(`ยืนยันใบเตรียมวัสดุ ${p.prep_no} ?\nหลังยืนยันจะกดสร้างใบสั่งซื้อ/ใบเบิกได้`)) return;
    try { await setPrepStatus(p.prep_no, "approved", p.status); await load(); flash("ยืนยันแล้ว ✓ — กดสร้างใบสั่งซื้อ/ใบเบิกได้เลย"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function backToDraft(p) {
    try { await setPrepStatus(p.prep_no, "draft", p.status); await load(); flash("กลับเป็นร่าง — แก้ไขได้"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // เคยแตกเป็นใบสั่งซื้อไปแล้วต้องถามก่อน — คนละกะเปิดใบเดิมแล้วนึกว่ายังไม่มีใครสั่ง = ของมาซ้ำ + เจ้าหนี้ซ้ำ
  // ⚠️ ห้ามซ่อนปุ่มทิ้ง: บางใบตั้งใจแตกหลายรอบ (สั่งบางส่วนก่อน) ต้องกดสร้างเพิ่มได้เสมอ
  async function goCreatePo(p) {
    const has = (p.linkedPos || []).length;
    if (has && !await confirmDialog({
      title: "ใบนี้เคยสร้างใบสั่งซื้อไปแล้ว",
      message: `มีใบสั่งซื้อที่แตกจากใบเตรียมวัสดุนี้อยู่แล้ว ${has} ใบ:\n${(p.linkedPos || []).map((x) => `· ${x.po_no}${x.date ? " (" + x.date + ")" : ""}`).join("\n")}\n\n⚠️ นี่ไม่ได้แปลว่า "สั่งครบแล้ว" — ตรวจก่อนว่าที่ขาดคือรายการไหน\n\nสร้างใบสั่งซื้ออีกใบ?`,
      confirmText: "สร้างเพิ่ม",
    })) return;
    onCreatePo && onCreatePo(buyItems(p).map((it) => ({ code: it.material_code, qty: Number(it.qty_buy), unit: it.unit || null })), p.quote_no, p.prep_no);
  }
  // ฝั่งเบิกอันตรายกว่า — กดซ้ำ = ตัดสต๊อกสองเท่าโดยของออกจากคลังจริงครั้งเดียว
  async function goWithdraw(p) {
    const has = (p.linkedWithdraws || []).length;
    if (has && !await confirmDialog({
      title: "ใบนี้เคยเบิกวัสดุไปแล้ว",
      message: `มีชุดเบิกที่ผูกใบเตรียมวัสดุนี้อยู่แล้ว ${has} ชุด:\n${(p.linkedWithdraws || []).map((x) => `· ${x.ref_no}${x.date ? " (" + x.date + ")" : ""}`).join("\n")}\n\n⚠️ เบิกซ้ำ = สต๊อกถูกตัดสองเท่าทั้งที่ของออกจากคลังจริงครั้งเดียว\n\nไปเบิกเพิ่มจริงหรือไม่?`,
      danger: true, confirmText: "เบิกเพิ่ม",
    })) return;
    onWithdraw && onWithdraw(wdItems(p).map((it) => ({ code: it.material_code, qty: Number(it.qty_withdraw), unit: it.unit || null })), p.jobNo, p.jobTeam, p.prep_no);
  }
  async function markDone(p) {
    if (!await confirmDialog(`ปิดใบ ${p.prep_no} (ดำเนินการครบแล้ว)?`)) return;
    try { await setPrepStatus(p.prep_no, "done", p.status); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function remove(p) {
    const confirmed = p.status !== "draft";
    // กติกาบ้าน: ลบต้องระบุเหตุผลเสมอ (ลง audit พร้อม snapshot) — PO ลูกที่รับของ/ตั้งเบิกแล้ว ระบบจะไม่ยอมให้ลบพ่วง
    const reason = await confirmDialog({ title: confirmed ? `ลบใบเตรียมวัสดุ ${p.prep_no} ที่ยืนยันแล้ว?` : `ลบใบเตรียมวัสดุ ${p.prep_no} ?`,
      message: confirmed ? "⚠️ ใบสั่งซื้อและรายการเบิกที่ผูกจะถูกลบตาม (สต๊อกที่เบิกคืนกลับ) — ใบที่รับของ/ตั้งเบิกแล้วลบไม่ได้" : "ข้อมูลเก็บในประวัติการลบ",
      confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ทำผิด · ซ้ำ", required: true } });
    if (reason === false) return;
    try { await deleteMaterialPrep(p.prep_no, confirmed, reason); await load(); flash(confirmed ? "ลบใบเตรียมวัสดุ + PO/เบิกที่ผูกแล้ว ✓" : "ลบแล้ว"); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  // พิมพ์รายการเตรียมวัสดุ (แยก 🛒 สั่งซื้อ / 📦 เบิกจากสต๊อก) — mode "image" | "pdf"
  // HTML ใบเตรียมวัสดุ — แชร์ระหว่าง พรีวิว/สั่งพิมพ์ กับ บันทึกรูป/PDF (หน้าตาเหมือนกันทุกทาง)
  function prepSheetHtml(p) {
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const rows = (its, kindQty) => its.map((it, i) => {
      const m = matMap[it.material_code];
      return `<tr style="background:${i % 2 ? "#f6f9fc" : "#fff"}">
        <td style="padding:8px 10px;color:#64748b;text-align:center">${i + 1}</td>
        <td style="padding:8px 10px">${esc(m?.th || it.name || it.material_code)}<div style="font-size:12px;color:#94a3b8">${esc(it.material_code || "")}</div></td>
        <td style="padding:8px 12px;text-align:right;font-weight:800;white-space:nowrap">${fmtNum(Number(it[kindQty]) || 0)} <span style="font-weight:400;color:#64748b">${esc(it.unit || m?.unit || "")}</span></td>
      </tr>`;
    }).join("");
    const section = (title, color, its, kindQty) => its.length ? `
      <div style="margin-top:14px">
        <div style="font-weight:800;font-size:15px;color:#fff;background:${color};padding:7px 12px;border-radius:8px 8px 0 0">${title} · ${its.length} รายการ</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid ${color}33">
          <tr style="background:${color}1a;font-weight:700;font-size:12.5px;color:#334155">
            <td style="padding:6px 10px;text-align:center;width:36px">#</td><td style="padding:6px 10px">รายการ</td><td style="padding:6px 12px;text-align:right;width:120px">จำนวน</td></tr>
          ${rows(its, kindQty)}
        </table>
      </div>` : "";
    const bItems = buyItems(p), wItems = wdItems(p);
    return `<div style="width:720px;background:#fff;font-family:'IBM Plex Sans Thai','Noto Sans Thai',sans-serif;color:#0f1729;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0ea5e9;padding-bottom:10px">
        <div><div style="font-size:20px;font-weight:800">AMC AIR · ใบเตรียมวัสดุ</div>
          <div style="font-size:13px;color:#475569;margin-top:2px">${esc(p.prep_no)}${p.jobNo ? " · งาน " + esc(p.jobNo) : ""}${p.quote_no ? " · อ้างอิง " + esc(p.quote_no) : ""}</div>
          ${p.customerName ? `<div style="font-size:13px;color:#475569">ลูกค้า ${esc(p.customerName)}${p.title ? " · " + esc(p.title) : ""}</div>` : (p.title ? `<div style="font-size:13px;color:#475569">${esc(p.title)}</div>` : "")}
        </div>
        <div style="text-align:right;font-size:12px;color:#94a3b8">วันที่ ${p.issue_date ? new Date(p.issue_date + "T00:00:00").toLocaleDateString("th-TH") : new Date().toLocaleDateString("th-TH")}</div>
      </div>
      ${section("🛒 สั่งซื้อ — ไปรับที่ร้านค้า", "#c2410c", bItems, "qty_buy")}
      ${section("📦 เบิกจากสต๊อก — คลังของเราเอง", "#0369a1", wItems, "qty_withdraw")}
      ${p.note ? `<div style="margin-top:12px;font-size:13px;color:#475569">หมายเหตุ: ${esc(p.note)}</div>` : ""}
    </div>`;
  }
  // 🖨️ พรีวิว + สั่งพิมพ์ทันที — เปิดหน้าต่างใหม่ตอนคลิก (กัน popup-block) มีปุ่มพิมพ์/ปิด และเด้งหน้าต่างพิมพ์ให้เอง
  function previewPrint(p) {
    const win = window.open("", "_blank");
    if (!win) return flash("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปของแอปนี้แล้วลองใหม่", true);
    win.document.open();
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ใบเตรียมวัสดุ ${p.prep_no}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page{ size:A4; margin:12mm }
  body{ margin:0;background:#eef2f7;-webkit-print-color-adjust:exact;print-color-adjust:exact }
  .bar{ position:sticky;top:0;z-index:9;display:flex;gap:8px;justify-content:center;padding:10px;background:#0f1729 }
  .bar button{ font:inherit;padding:8px 22px;border-radius:8px;border:0;cursor:pointer;font-weight:700 }
  .sheet{ width:fit-content;margin:16px auto;box-shadow:0 4px 18px rgba(15,23,41,.12) }
  @media print{ .bar{ display:none } body{ background:#fff } .sheet{ margin:0 auto;box-shadow:none } .sheet>div{ width:100% !important;box-sizing:border-box } }
</style></head><body>
<div class="bar"><button style="background:#0ea5e9;color:#fff" onclick="print()">🖨️ พิมพ์</button><button style="background:#fff" onclick="close()">ปิด</button></div>
<div class="sheet">${prepSheetHtml(p)}</div>
<script>onload=()=>{ (document.fonts ? document.fonts.ready : Promise.resolve()).then(()=>setTimeout(()=>print(),150)) }<\/script>
</body></html>`);
    win.document.close();
  }
  async function printPrep(p, mode) {
    const html = prepSheetHtml(p);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;";
    host.innerHTML = html;
    document.body.appendChild(host);
    try {
      if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
      await new Promise((r) => setTimeout(r, 60));
      const canvas = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: "#ffffff", logging: false });
      if (mode === "image") {
        const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `เตรียมวัสดุ-${p.prep_no}.png`; a.click();
      } else {
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        const pw = pdf.internal.pageSize.getWidth(), margin = 28;
        const w = pw - margin * 2, h = (canvas.height / canvas.width) * w;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, w, h);
        pdf.save(`เตรียมวัสดุ-${p.prep_no}.pdf`);
      }
      flash(mode === "image" ? "บันทึกรูปแล้ว ✓" : "บันทึก PDF แล้ว ✓");
    } catch (e) { flash("พิมพ์ไม่สำเร็จ: " + (e.message || e), true); }
    document.body.removeChild(host);
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
        <div className="doc-edit-wrap">
        <div className="card" style={{ flex: 1, maxWidth: 860 }}>
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
            <label className="fld" style={{ maxWidth: 170 }}><span>วันที่</span>
              <input className="inp" type="date" value={ed.issue_date || ""} onChange={(e) => setEd((s) => ({ ...s, issue_date: e.target.value }))} />
            </label>
          </div>
          <div className="fld"><span>เพิ่มรายการ (ค้นหาสินค้า/วัสดุ)</span>
            <ItemPicker items={mats.filter((m) => m.kind !== "service")} placeholder="ค้นหารหัส / ชื่อสินค้า…" onPick={addLine} />
            <p className="page-sub" style={{ marginTop: 6 }}>เลือกจากช่องค้นหา หรือเลือกจากแคตตาล็อกด้านขวา (กรองยี่ห้อ/รุ่น/BTU/หมวดได้) → ปรับจำนวน ซื้อ/เบิก ในรายการด้านล่าง</p>
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
                const stk = stockInUnit(m, it.unit);        // คงเหลือในหน่วยที่เลือก
                const overWd = stk != null && it.qty_withdraw > stk;
                return (
                  <div className="line-item" key={it.code || i}>
                    <div className="boq-line">
                      <div className="line-info"><div className="line-name">{it.name}</div><div className="line-sub">{it.code || "-"} · หน่วย: <UnitPick m={m} value={it.unit} onChange={(u) => setLineUnit(i, u)} /></div></div>
                      <span style={{ width: 90, textAlign: "center", fontWeight: 700, color: stk === 0 ? "#dc2626" : "var(--ink-2)" }}>{stk == null ? "—" : `${fmtNum(stk)} ${it.unit || ""}`}</span>
                      <div className="inp inp-unit boq-in" style={{ width: 110, borderColor: overWd ? "#dc2626" : undefined }}>
                        <input type="number" min="0" value={it.qty_withdraw} onChange={(e) => setLine(i, "qty_withdraw", e.target.value)} />
                      </div>
                      <div className="inp inp-unit boq-in" style={{ width: 110 }}>
                        <input type="number" min="0" value={it.qty_buy} onChange={(e) => setLine(i, "qty_buy", e.target.value)} />
                      </div>
                      <button className="line-x" onClick={() => delLine(i)}><UIcon name="x" size={14} /></button>
                    </div>
                    {overWd && <div style={{ fontSize: 12, color: "#dc2626", padding: "0 4px 6px" }}>⚠️ เบิกเกินคงเหลือ ({fmtNum(stk)} {it.unit}) — ส่วนที่เกินควรย้ายไปช่องสั่งซื้อ</div>}
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
        <ItemBrowser mats={mats.filter((m) => m.kind !== "service")} onAdd={addLine} />
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
                <div className={"card job-card doc2" + (p.status === "cancelled" ? " closed" : "")} key={p.prep_no}>
                  <DocCardHead no={p.prep_no} partyIcon="👤" titleFallback="ใบเตรียมวัสดุ"
                    badges={<>
                      <span className={"job-badge " + st.cls}>{st.th}</span>
                      {p.quote_no && <button type="button" className="vat-badge vat-on" style={{ cursor: "pointer", border: "1px solid transparent" }} onClick={() => openPeek("quote", p.quote_no)}>อ้างอิง {p.quote_no} ↗</button>}
                      {p.jobNo && <button type="button" className="vat-badge" style={{ cursor: "pointer", border: "1px solid transparent", background: "#f3e8ff", color: "#7c3aed" }} onClick={() => openPeek("job", p.jobNo)}>งาน {p.jobNo} ↗</button>}
                      {/* แตกไปเป็นใบสั่งซื้อ/ชุดเบิกอะไรแล้วบ้าง — เดิมการ์ดไม่บอกเลย คนละกะจึงกดสร้างซ้ำ
                          ⚠️ ชิปนี้แปลว่า "เคยสร้าง" ไม่ใช่ "สั่งครบแล้ว" (ไม่ได้เทียบจำนวน) */}
                      {(p.linkedPos || []).map((po) => (
                        <button key={po.po_no} type="button" className="vat-badge" style={{ cursor: "pointer", border: "1px solid transparent", background: "#ede9fe", color: "#6d28d9" }}
                          onClick={() => openPeek("po", po.po_no)} title={`เคยสร้างใบสั่งซื้อจากใบนี้${po.date ? " · " + po.date : ""}`}>🛒 {po.po_no} ↗</button>
                      ))}
                      {(p.linkedWithdraws || []).map((w) => (
                        <span key={w.ref_no} className="vat-badge" style={{ background: "#e0f2fe", color: "#0369a1" }} title={`เคยเบิกวัสดุจากใบนี้${w.date ? " · " + w.date : ""}`}>📦 เบิกแล้ว {w.date || ""}</span>
                      ))}
                    </>}
                    title={p.title || p.quoteTitle}
                    sub={`${p.teamName ? "🔧 " + p.teamName : ""}${p.approvedByName ? (p.teamName ? " · " : "") + "อนุมัติ " + p.approvedByName : ""}` || null}
                    date={p.issue_date || p.created_at}
                    amountNode={<div className="dch-amt"><span>เตรียมวัสดุ</span><b style={{ fontSize: 15 }}>🛒 {nb} · 📦 {nw}</b></div>}
                    customer={p.customerName ? { name: p.customerName } : null} />
                  <div className="jo-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 14px" }}>
                    {p.status === "draft" && canEdit && <button className="btn-ghost sm" onClick={() => startEdit(p)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                    {p.status === "draft" && canConfirm && <button className="btn-primary sm" onClick={() => confirm(p)}>✓ ยืนยัน</button>}
                    {p.status === "approved" && canEdit && <button className="btn-ghost sm" onClick={() => backToDraft(p)} title="กลับไปแก้ไขรายการ">↩ กลับเป็นร่าง</button>}
                    {p.status === "approved" && nb > 0 && canEdit && (
                      <button className={(p.linkedPos || []).length ? "btn-ghost sm" : "btn-primary sm"} onClick={() => goCreatePo(p)}>🛒 {(p.linkedPos || []).length ? `สร้างใบสั่งซื้อเพิ่ม (${nb})` : `สร้างใบสั่งซื้อ (${nb})`}</button>
                    )}
                    {p.status === "approved" && nw > 0 && canEdit && (
                      <button className={(p.linkedWithdraws || []).length ? "btn-ghost sm" : "btn-primary sm"} style={(p.linkedWithdraws || []).length ? undefined : { background: "#0369a1" }} onClick={() => goWithdraw(p)}>📦 {(p.linkedWithdraws || []).length ? `เบิกเพิ่ม (${nw})` : `ไปเบิกวัสดุ (${nw})`}</button>
                    )}
                    {p.status === "approved" && canEdit && <button className={((nb === 0 || (p.linkedPos || []).length) && (nw === 0 || (p.linkedWithdraws || []).length)) ? "btn-primary sm" : "btn-ghost sm"} onClick={() => markDone(p)} title="แตกเป็นใบสั่งซื้อ/ใบเบิกครบแล้ว — ปิดใบเพื่อไม่ให้คนอื่นกดสร้างซ้ำ">ปิดใบ (ครบแล้ว)</button>}
                    {(nb > 0 || nw > 0) && <>
                      <button className="btn-ghost sm" onClick={() => previewPrint(p)} title="เปิดพรีวิวแล้วสั่งพิมพ์ได้เลย">🖨️ พิมพ์</button>
                      <button className="btn-ghost sm" onClick={() => printPrep(p, "image")} title="บันทึกรายการเตรียมวัสดุเป็นรูปภาพ">🖼️ รูป</button>
                      <button className="btn-ghost sm" onClick={() => printPrep(p, "pdf")} title="บันทึกรายการเตรียมวัสดุเป็น PDF">📄 PDF</button>
                    </>}
                    {/* ลบ: ร่าง = ธุรการวัสดุลบได้ · ยืนยันแล้ว = เฉพาะธุรการ (ลบ PO/เบิกที่ผูกตามด้วย) */}
                    {p.status === "draft" && canEdit && <button className="btn-ghost sm danger" onClick={() => remove(p)}><UIcon name="trash" size={14} /> ลบ</button>}
                    {p.status !== "draft" && p.status !== "cancelled" && canDeleteConfirmed && <button className="btn-ghost sm danger" onClick={() => remove(p)} title="ลบใบนี้ + PO/เบิกที่ผูก (ธุรการเท่านั้น)"><UIcon name="trash" size={14} /> ลบทั้งสาย</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {peekEl}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
