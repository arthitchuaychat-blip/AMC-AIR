import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { UIcon } from "../icons";
import { UNITS } from "../lib/format";
import { acPowerCostYear } from "../lib/api";
import { uploadMaterialPhoto, getAcSeries, saveAcSeries, uploadBrochureFile, fetchExternalFile } from "../lib/api";

const KINDS = [{ v: "material", l: "วัสดุ" }, { v: "ac", l: "เครื่องปรับอากาศ" }, { v: "service", l: "บริการ" }];

// หมวดค่าบริการ — id คงที่ ตรงกับแถวในตาราง categories (migration 102)
const SERVICE_CATS = [
  { id: "sv-install", l: "ติดตั้ง" }, { id: "sv-clean", l: "ล้าง" }, { id: "sv-move", l: "ย้าย" },
  { id: "sv-repair", l: "ซ่อม" }, { id: "sv-remove", l: "รื้อถอน" }, { id: "sv-other", l: "อื่นๆ" },
];

// ราคาขายแนะนำจากต้นทุน (กำไรคิดเป็น % ของราคาขาย · ราคาก่อน VAT · แก้ทับได้เสมอ)
// วัสดุ: กำไร 70% → ขาย = ทุน ÷ 0.30 · แอร์: กำไร 5% → ขาย = ทุน ÷ 0.95 · ปัดเศษขึ้นเป็นบาทเต็ม · บริการ: ไม่คำนวณ
const MARGIN = { material: 0.70, ac: 0.05 };
function suggestSale(kind, cost) {
  const c = Number(cost) || 0;
  if (c <= 0 || MARGIN[kind] == null) return null;
  return Math.ceil(c / (1 - MARGIN[kind]));
}

// Add OR edit a catalog item (material / ac / service). `initial` null => add mode.
export default function MaterialModal({ initial, categories, brands = [], btus = [], acTypes = [], seriesList = [], defaultKind = "material", onSaved, onClose, onSave, onAddCategory }) {
  const isNew = !initial || !!initial._dup;   // _dup = สร้างสำเนา → ถือเป็นรายการใหม่ (รหัสใหม่)
  const [f, setF] = React.useState(() => ({
    code: initial?.code || "",
    name_th: initial?.name_th || initial?.th || "",
    name_en: initial?.name_en || initial?.en || "",
    kind: initial?.kind || defaultKind,
    category: initial?.category || initial?.cat || ((initial?.kind || defaultKind) === "service" ? "sv-other" : categories[0]?.id || "pipe"),
    brand: initial?.brand || "",
    btu: initial?.btu || "",
    ac_type: initial?.ac_type || "",
    tracked: initial ? (initial.tracked !== false) : (defaultKind !== "service"),
    unit: initial?.unit || "เมตร",
    cost: initial?.cost ?? "",
    sale_price: initial?.salePrice ?? initial?.sale_price ?? "",
    description: initial?.description ?? "",
    photo_url: initial?.photoUrl ?? initial?.photo_url ?? "",
    min_stock: initial?.minStock ?? initial?.min_stock ?? "",
    init_stock: initial?.stock ?? initial?.init_stock ?? "",
    power_cost_year: initial?.power_cost_year ?? initial?.powerCostYear ?? "",
    features: initial?.features ?? "",
    web_published: initial?.webPublished ?? initial?.web_published ?? false,
    purchase_unit: initial?.purchaseUnit ?? initial?.purchase_unit ?? "",
    purchase_qty: initial?.purchaseQty ?? initial?.purchase_qty ?? "",
    // ช่วง BTU ของบริการ — ถ้าเคยติดแท็ก BTU เดี่ยวไว้ (v291) ดึงมาเป็นค่าต่ำสุดให้เลย
    btu_min: initial?.btu_min ?? ((initial?.kind === "service" && initial?.btu) || ""),
    btu_max: initial?.btu_max ?? "",
    // สเปคแอร์รายขนาด (mig 106)
    series: initial?.series ?? "",
    voltage: initial?.voltage ?? "",
    refrigerant: initial?.refrigerant ?? "",
    seer: initial?.seer ?? "",
    pipe_size: initial?.pipe_size ?? "",
    energy_label: initial?.energy_label ?? "",
    warranty: initial?.warranty ?? "",
  }));
  // ข้อมูลระดับ "รุ่น" (คุณสมบัติ + โบรชัวร์ — ใช้ร่วมทุกขนาดในรุ่น) โหลด/บันทึกที่ตาราง ac_series
  const [srsFeat, setSrsFeat] = React.useState("");
  const [srsBrochure, setSrsBrochure] = React.useState("");
  const [srsUploading, setSrsUploading] = React.useState(false);
  React.useEffect(() => {
    let dead = false;
    const b = (f.brand || "").trim(), s = (f.series || "").trim();
    if (f.kind !== "ac" || !s) { setSrsFeat(""); setSrsBrochure(""); return; }
    const t = setTimeout(async () => {
      try { const row = await getAcSeries(b, s); if (!dead) { setSrsFeat(row?.features || ""); setSrsBrochure(row?.brochure_url || ""); } }
      catch { /* ยังไม่รัน migration 106 — ปล่อยว่าง */ }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [f.kind, f.brand, f.series]);
  async function onBrochure(e) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setSrsUploading(true); setErr(null);
    try { setSrsBrochure(await uploadBrochureFile(file)); }
    catch (ex) { setErr("อัปโหลดโบรชัวร์ไม่สำเร็จ: " + (ex.message || ex)); }
    setSrsUploading(false);
  }
  // "ดึงจากลิงก์": วาง URL จากเว็บผู้ผลิต → เซิร์ฟเวอร์ดาวน์โหลด → เก็บเข้า storage ของเราถาวร
  async function pullBrochureFromLink() {
    const url = window.prompt("วางลิงก์โบรชัวร์ (PDF/รูป) จากเว็บผู้ผลิต:"); if (!url?.trim()) return;
    setSrsUploading(true); setErr(null);
    try { setSrsBrochure(await uploadBrochureFile(await fetchExternalFile(url.trim()))); }
    catch (ex) { setErr("ดึงโบรชัวร์ไม่สำเร็จ: " + (ex.message || ex)); }
    setSrsUploading(false);
  }
  async function pullPhotoFromLink() {
    const url = window.prompt("วางลิงก์รูปสินค้า จากเว็บผู้ผลิต:"); if (!url?.trim()) return;
    setUploading(true); setErr(null);
    try { const file = await fetchExternalFile(url.trim()); setF((s) => ({ ...s, photo_url: null })); const up = await uploadMaterialPhoto(file, f.code || "item"); setF((s) => ({ ...s, photo_url: up })); }
    catch (ex) { setErr("ดึงรูปไม่สำเร็จ: " + (ex.message || ex)); }
    setUploading(false);
  }
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  // เพิ่มหมวดวัสดุใหม่จากในฟอร์ม (พิมพ์ชื่อ → สร้าง → เลือกให้ทันที)
  const [catAdding, setCatAdding] = React.useState(false);
  const [catName, setCatName] = React.useState("");
  async function confirmAddCat() {
    const nm = catName.trim(); if (!nm || !onAddCategory) return;
    try { const id = await onAddCategory(nm); setF((s) => ({ ...s, category: id })); setCatAdding(false); setCatName(""); }
    catch (ex) { setErr("เพิ่มหมวดไม่สำเร็จ (รัน migration 099 หรือยัง?): " + (ex.message || ex)); }
  }
  // ราคาขายอัตโนมัติ: รายการใหม่ → พิมพ์ต้นทุนแล้วเติมราคาขายให้ (จนกว่าจะแก้ราคาขายเอง)
  // รายการเดิม → ไม่ทับราคาที่ตั้งไว้ ใช้ปุ่ม ↻ คำนวณใหม่แทน
  const [spTouched, setSpTouched] = React.useState(!isNew);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  // BTU/SEER เปลี่ยน → คำนวณค่าไฟ/ปีใส่ให้อัตโนมัติ (8 ชม./วัน · 5 บาท/หน่วย) — ยังพิมพ์ทับเองได้
  const setCalcPower = (k) => (e) => setF((s) => {
    const n = { ...s, [k]: e.target.value };
    if (s.kind === "ac") { const auto = acPowerCostYear(n.btu, n.seer); if (auto) n.power_cost_year = auto; }
    return n;
  });
  const setCost = (e) => {
    const v = e.target.value;
    setF((s) => {
      const sug = !spTouched ? suggestSale(s.kind, v) : null;
      return { ...s, cost: v, ...(sug != null ? { sale_price: sug } : {}) };
    });
  };
  const setSale = (e) => { setSpTouched(true); setF((s) => ({ ...s, sale_price: e.target.value })); };
  const applySuggest = () => { const sug = suggestSale(f.kind, f.cost); if (sug != null) { setSpTouched(true); setF((s) => ({ ...s, sale_price: sug })); } };
  const setKind = (kind) => setF((s) => ({
    ...s, kind, tracked: kind === "service" ? false : s.tracked,
    // สลับชนิด → หมวดต้องเป็นชุดของชนิดนั้น (บริการใช้ sv-* · วัสดุใช้หมวดวัสดุ)
    category: kind === "service"
      ? (String(s.category || "").startsWith("sv-") ? s.category : "sv-other")
      : (String(s.category || "").startsWith("sv-") ? (categories[0]?.id || "pipe") : s.category),
  }));
  const valid = f.code && f.name_th;
  const isAc = f.kind === "ac", isService = f.kind === "service", isMat = f.kind === "material";

  async function onPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setErr(null);
    try { const url = await uploadMaterialPhoto(file, f.code); setF((s) => ({ ...s, photo_url: url })); }
    catch (ex) { setErr("อัปโหลดรูปไม่สำเร็จ: " + (ex.message || ex)); }
    setUploading(false);
  }
  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  async function submit() {
    if (!valid || busy) return;
    if (!isNew && !await confirmDialog(`ยืนยันบันทึกการแก้ไข "${f.th || f.code}" ?`)) return;
    setBusy(true); setErr(null);
    try {
      // บริการต้องอยู่หมวด sv-* เสมอ (รายการเก่าที่หมวดเป็นของวัสดุ → อื่นๆ)
      const payload = isService && !String(f.category || "").startsWith("sv-") ? { ...f, category: "sv-other" } : f;
      await onSave(payload, isNew);
      // ข้อมูลของรุ่น (คุณสมบัติ+โบรชัวร์) บันทึกครั้งเดียวใช้ทุกขนาด — พลาดไม่ให้ขวางการบันทึกสินค้า
      if (isAc && (f.series || "").trim()) {
        try { await saveAcSeries({ brand: f.brand, name: f.series.trim(), features: srsFeat, brochure_url: srsBrochure }); }
        catch (ex) { console.warn("saveAcSeries:", ex?.message); }
      }
      onSaved(f.kind);
    }
    catch (e) {
      const m = e.message || String(e);
      setErr((isService && /categor|fkey|foreign/i.test(m) ? "ยังไม่มีหมวดบริการในระบบ — รัน migration 102 ก่อน · " : "") + m);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{isNew ? "เพิ่ม" : "แก้ไข"}{(KINDS.find((k) => k.v === f.kind) || {}).l} <span>{f.kind}</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          {/* kind */}
          <div className="fld" style={{ marginBottom: 6 }}><span>ชนิดรายการ</span>
            <div className="sub-toggle">
              {KINDS.map((k) => <button key={k.v} className={f.kind === k.v ? "on" : ""} onClick={() => setKind(k.v)}>{k.l}</button>)}
            </div>
          </div>

          <div className="fld-row">
            <label className="fld"><span>รหัส · Code *</span>
              <input className="inp" value={f.code} onChange={set("code")} placeholder={isAc ? "เช่น DAIKIN-12K" : isService ? "เช่น SVC-INSTALL" : "เช่น COPP8"} disabled={!isNew} />
            </label>
            {isMat && (
              <label className="fld"><span>หมวดย่อย · Category {onAddCategory && !catAdding && <button type="button" className="sp-suggest" onClick={() => { setCatAdding(true); setCatName(""); }}>＋ หมวดใหม่</button>}</span>
                {catAdding ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="inp" autoFocus value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="ชื่อหมวดใหม่ เช่น #N ท่อลม"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAddCat(); } }} />
                    <button type="button" className="btn-primary sm" onClick={confirmAddCat}>เพิ่ม</button>
                    <button type="button" className="btn-ghost sm" onClick={() => { setCatAdding(false); setCatName(""); }}>ยกเลิก</button>
                  </div>
                ) : (
                  <Combo className="inp" value={f.category} onChange={set("category")}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
                  </Combo>
                )}
              </label>
            )}
            {isService && (
              <label className="fld"><span>หมวดบริการ · Category</span>
                <Combo className="inp" value={SERVICE_CATS.some((c) => c.id === f.category) ? f.category : "sv-other"} onChange={set("category")}>
                  {SERVICE_CATS.map((c) => <option key={c.id} value={c.id}>{c.l}</option>)}
                </Combo>
              </label>
            )}
            {isAc && (
              <label className="fld"><span>ยี่ห้อ · Brand</span>
                <input className="inp" list="brand-list" value={f.brand} onChange={set("brand")} placeholder="เลือก หรือพิมพ์ยี่ห้อใหม่ได้เลย" />
                <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
              </label>
            )}
          </div>

          <label className="fld"><span>ชื่อรายการ (ไทย) *</span>
            <input className="inp" value={f.name_th} onChange={set("name_th")} placeholder={isAc ? "เช่น แอร์ติดผนัง 12000 BTU" : isService ? "เช่น ค่าติดตั้งแอร์" : "เช่น ท่อทองแดงแบบม้วน 1 นิ้ว"} />
          </label>
          <label className="fld"><span>ชื่อรายการ (English)</span>
            <input className="inp" value={f.name_en} onChange={set("name_en")} placeholder="(ไม่บังคับ)" />
          </label>

          {isService && (
            <div className="fld-row">
              <label className="fld"><span>ประเภทแอร์ที่ให้บริการ (ไม่บังคับ)</span>
                <input className="inp" list="svc-actype-list" value={f.ac_type} onChange={set("ac_type")} placeholder="เช่น Wall type — เว้นว่าง = ทุกประเภท" />
                <datalist id="svc-actype-list">{acTypes.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
              <label className="fld"><span>BTU ต่ำสุด (ไม่บังคับ)</span>
                <input className="inp" type="number" list="svc-btu-list" value={f.btu_min} onChange={set("btu_min")} placeholder="เช่น 18000 — เว้นว่าง = ทุกขนาด" />
                <datalist id="svc-btu-list">{btus.map((b) => <option key={b} value={b} />)}</datalist>
              </label>
              <label className="fld"><span>BTU สูงสุด</span>
                <input className="inp" type="number" list="svc-btu-list" value={f.btu_max} onChange={set("btu_max")} placeholder="เช่น 24000 — เว้นว่าง = เท่าต่ำสุด" />
              </label>
            </div>
          )}

          {isAc && (
            <div className="fld-row">
              <label className="fld"><span>รุ่น/ซีรีส์ · Series <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(จัดกลุ่มการ์ดบนเว็บ)</span></span>
                <input className="inp" list="series-list" value={f.series} onChange={set("series")} placeholder="เช่น FTKQ, Apollo III" />
                <datalist id="series-list">{seriesList.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <label className="fld"><span>ฉลากประหยัดไฟ</span>
                <Combo className="inp" value={f.energy_label} onChange={set("energy_label")}>
                  <option value="">— ไม่มี —</option>
                  <option value="เบอร์ 5">เบอร์ 5</option>
                  <option value="เบอร์ 5 ★">เบอร์ 5 ★</option>
                  <option value="เบอร์ 5 ★★">เบอร์ 5 ★★</option>
                  <option value="เบอร์ 5 ★★★">เบอร์ 5 ★★★</option>
                  <option value="มอก.">มอก.</option>
                </Combo>
              </label>
            </div>
          )}
          {isAc && (
            <div className="fld-row">
              <label className="fld"><span>ขนาด BTU</span>
                <input className="inp" type="number" list="btu-list" value={f.btu} onChange={setCalcPower("btu")} placeholder="เลือก หรือพิมพ์ขนาดใหม่ เช่น 12000" />
                <datalist id="btu-list">{btus.map((b) => <option key={b} value={b} />)}</datalist>
              </label>
              <label className="fld"><span>ประเภทแอร์ · Type</span>
                <input className="inp" list="actype-list" value={f.ac_type} onChange={set("ac_type")} placeholder="เลือก หรือพิมพ์ประเภทใหม่ เช่น Wall Type" />
                <datalist id="actype-list">{acTypes.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
            </div>
          )}
          {isAc && (
            <div className="fld-row">
              <label className="fld"><span>กำลังไฟ</span>
                <Combo className="inp" value={f.voltage} onChange={set("voltage")}>
                  <option value="">— ไม่ระบุ —</option><option value="220V">220V</option><option value="380V">380V</option>
                </Combo>
              </label>
              <label className="fld"><span>ชนิดน้ำยา</span>
                <input className="inp" list="refrig-list" value={f.refrigerant} onChange={set("refrigerant")} placeholder="เช่น R32" />
                <datalist id="refrig-list"><option value="R32" /><option value="R410A" /><option value="R22" /></datalist>
              </label>
            </div>
          )}
          {isAc && (
            <div className="fld-row">
              <label className="fld"><span>ค่า SEER</span>
                <input className="inp" type="number" step="0.01" value={f.seer} onChange={setCalcPower("seer")} placeholder="เช่น 14.54" />
              </label>
              <label className="fld"><span>ขนาดท่อน้ำยา · Pipe</span>
                <input className="inp" value={f.pipe_size} onChange={set("pipe_size")} placeholder="เช่น 1/4 1/2" />
              </label>
            </div>
          )}
          {isAc && (
            <label className="fld"><span>⚡ ประมาณค่าไฟ/ปี (บาท) · แสดงบนเว็บ</span>
              <input className="inp" type="number" value={f.power_cost_year} onChange={set("power_cost_year")} placeholder="เว้นว่าง = คำนวณจาก SEER อัตโนมัติ" />
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>คำนวณอัตโนมัติจาก BTU ÷ SEER · ใช้งาน 8 ชม./วัน · ค่าไฟ 5 บาท/หน่วย — พิมพ์ทับเองได้</span>
            </label>
          )}
          {isAc && (
            <label className="fld"><span>🛡️ การรับประกัน · แสดงต่อลูกค้า/บอทนำไปตอบได้</span>
              <input className="inp" value={f.warranty} onChange={set("warranty")} placeholder="เช่น คอมเพรสเซอร์ 5 ปี · อะไหล่ 1 ปี (รัน migration 140 ก่อนใช้)" />
            </label>
          )}
          {isAc && (f.series || "").trim() !== "" && (
            <div style={{ border: "1.5px solid #bae6fd", background: "#f0f9ff", borderRadius: 12, padding: "10px 12px", marginBottom: 4 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0369a1", marginBottom: 6 }}>ข้อมูลของรุ่น {f.series} — ใช้ร่วมกันทุกขนาดในรุ่นนี้ (แก้ที่นี่ = อัปเดตทั้งรุ่น)</div>
              <label className="fld"><span>✨ คุณสมบัติของรุ่น · แสดงบนเว็บ</span>
                <textarea className="inp" value={srsFeat} onChange={(e) => setSrsFeat(e.target.value)} rows={4} style={{ resize: "vertical" }}
                  placeholder={"จุดเด่นของรุ่น เช่น\n• ระบบ Inverter ประหยัดไฟ\n• ฟอกอากาศ PM2.5\n• รับประกันคอมเพรสเซอร์ 10 ปี"} />
              </label>
              <div className="fld"><span>📄 โบรชัวร์รุ่น (PDF/รูป)</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
                    {srsUploading ? "กำลังอัปโหลด…" : (srsBrochure ? "เปลี่ยนโบรชัวร์" : "อัปโหลดโบรชัวร์")}
                    <input type="file" accept="application/pdf,image/*" onChange={onBrochure} style={{ display: "none" }} disabled={srsUploading} />
                  </label>
                  <button type="button" className="btn-ghost sm" disabled={srsUploading} onClick={pullBrochureFromLink} title="วางลิงก์จากเว็บผู้ผลิต ระบบดาวน์โหลดมาเก็บถาวรในระบบเรา">🔗 ดึงจากลิงก์</button>
                  {srsBrochure && <a className="btn-ghost sm" href={srsBrochure} target="_blank" rel="noreferrer">เปิดดู ↗</a>}
                  {srsBrochure && <button type="button" className="btn-ghost sm danger" onClick={() => setSrsBrochure("")}>ลบ</button>}
                </div>
              </div>
            </div>
          )}

          <label className="fld"><span>รายละเอียด</span>
            <textarea className="inp" value={f.description} onChange={set("description")} placeholder="คำอธิบาย / สเปก / หมายเหตุ (ไม่บังคับ)" rows={2} style={{ resize: "vertical" }} />
          </label>
          {!(isAc && (f.series || "").trim()) && (
          <label className="fld"><span>📋 คุณสมบัติสินค้า · แสดงบนเว็บ (ใส่ได้ยาว · ขึ้นบรรทัดใหม่ได้)</span>
            <textarea className="inp" value={f.features} onChange={set("features")} rows={5} style={{ resize: "vertical" }}
              placeholder={"จุดเด่น/สเปกสินค้า เช่น\n• ประหยัดไฟ เบอร์ 5\n• ระบบ Inverter\n• ฟอกอากาศ PM2.5\n• รับประกันคอมเพรสเซอร์ 10 ปี"} />
          </label>
          )}
          <label className="fld"><span>รูปสินค้า</span>
            <div className="photo-field">
              {f.photo_url ? <img src={f.photo_url} className="photo-thumb" alt="" /> : <div className="photo-thumb empty"><UIcon name="camera" size={22} color="var(--ink-3)" /></div>}
              <div className="photo-actions">
                <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
                  <UIcon name="camera" size={14} /> {uploading ? "กำลังอัปโหลด…" : (f.photo_url ? "เปลี่ยนรูป" : "อัปโหลดรูป")}
                  <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} disabled={uploading} />
                </label>
                <button type="button" className="btn-ghost sm" disabled={uploading} onClick={pullPhotoFromLink} title="วางลิงก์รูปจากเว็บผู้ผลิต ระบบดาวน์โหลดมาเก็บถาวรในระบบเรา">🔗 ดึงจากลิงก์</button>
                {f.photo_url && <button className="btn-ghost sm danger" onClick={() => setF((s) => ({ ...s, photo_url: "" }))}>ลบรูป</button>}
              </div>
            </div>
          </label>

          <div className="fld-row3">
            <label className="fld"><span>หน่วย</span>
              <Combo className="inp" value={f.unit} onChange={set("unit")}>
                {[...new Set([f.unit, ...UNITS, "เครื่อง", "งาน", "ชุด"])].filter(Boolean).map((u) => <option key={u} value={u}>{u}</option>)}
              </Combo>
            </label>
            <label className="fld"><span>ต้นทุน/หน่วย</span>
              <input className="inp" type="number" value={f.cost} onChange={setCost} placeholder="0.00" />
            </label>
            <label className="fld"><span>ราคาขาย/หน่วย {MARGIN[f.kind] != null && <button type="button" className="sp-suggest" onClick={applySuggest} title={`คำนวณจากต้นทุน · กำไร ${MARGIN[f.kind] * 100}% ของราคาขาย`}>↻ กำไร {MARGIN[f.kind] * 100}%</button>}</span>
              <input className="inp" type="number" value={f.sale_price} onChange={setSale} placeholder="0.00" />
            </label>
          </div>
          {MARGIN[f.kind] != null && <p className="page-sub" style={{ margin: "-4px 0 8px" }}>💡 ราคาขาย (ก่อน VAT) คำนวณอัตโนมัติจากต้นทุน ({f.kind === "ac" ? "แอร์: กำไร 5%" : "วัสดุ: กำไร 70%"} ของราคาขาย · ปัดเศษขึ้นเป็นบาทเต็ม) — พิมพ์ทับเองได้</p>}

          {/* purchase unit (ซื้อคนละหน่วยกับขาย เช่น ขายเป็นเมตร ซื้อเป็นม้วน) — วัสดุที่นับสต๊อกเท่านั้น */}
          {isMat && (
            <div className="fld-row">
              <label className="fld"><span>หน่วยซื้อ <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(ถ้าซื้อคนละหน่วยกับขาย เช่น ม้วน · เว้นว่าง = หน่วยเดียวกัน)</span></span>
                <input className="inp" value={f.purchase_unit} onChange={set("purchase_unit")} placeholder="เช่น ม้วน / กล่อง / ลัง" />
              </label>
              <label className="fld" style={{ opacity: f.purchase_unit ? 1 : 0.5 }}><span>1 {f.purchase_unit || "หน่วยซื้อ"} = กี่{f.unit || "หน่วย"}</span>
                <div className="inp inp-unit"><input type="number" min="0" step="0.01" value={f.purchase_qty} disabled={!f.purchase_unit} onChange={set("purchase_qty")} placeholder="เช่น 15" /><span className="unit-suf">{f.unit}</span></div>
              </label>
            </div>
          )}

          {/* stock tracking (not for service) */}
          {!isService && (
            <label className="fld"><span>การนับสต๊อก</span>
              <button type="button" className={"vat-toggle" + (f.tracked ? " on" : "")} onClick={() => setF((s) => ({ ...s, tracked: !s.tracked }))}>
                {f.tracked ? "นับสต๊อก (เบิก/คืน/ซื้อได้)" : "ไม่นับสต๊อก (สั่งตามงาน)"}
              </button>
            </label>
          )}
          {!isService && f.tracked && (
            <div className="fld-row">
              <label className="fld"><span>จำนวนขั้นต่ำ</span>
                <input className="inp" type="number" value={f.min_stock} onChange={set("min_stock")} placeholder="0" />
              </label>
              {isNew && (
                <label className="fld"><span>คงเหลือเริ่มต้น</span>
                  <input className="inp" type="number" value={f.init_stock} onChange={set("init_stock")} placeholder="0" />
                </label>
              )}
            </div>
          )}
          {!isNew && !isService && f.tracked && (
            <p className="page-sub" style={{ marginTop: 4 }}>* ยอดคงเหลือปรับผ่านเบิก/คืน/ซื้อ/ตัดเสียเท่านั้น (คำนวณอัตโนมัติ)</p>
          )}

          {/* show on the public website */}
          <label className="fld" style={{ marginTop: 6 }}><span>แสดงบนเว็บไซต์ (ขายออนไลน์)</span>
            <button type="button" className={"vat-toggle" + (f.web_published ? " on" : "")} onClick={() => setF((s) => ({ ...s, web_published: !s.web_published }))}>
              {f.web_published ? "🌐 แสดงบนเว็บ (ลูกค้าเห็น + สั่งซื้อได้)" : "ไม่แสดงบนเว็บ"}
            </button>
          </label>

          {err && <div className="login-err" style={{ marginTop: 10 }}>{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={!valid || busy} onClick={submit}>
            <UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
