import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { UIcon } from "../icons";
import { UNITS } from "../lib/format";
import { uploadMaterialPhoto } from "../lib/api";

const KINDS = [{ v: "material", l: "วัสดุ" }, { v: "ac", l: "เครื่องปรับอากาศ" }, { v: "service", l: "บริการ" }];

// ราคาขายแนะนำจากต้นทุน (กำไรคิดเป็น % ของราคาขาย · ราคาก่อน VAT · แก้ทับได้เสมอ)
// วัสดุ: กำไร 70% → ขาย = ทุน ÷ 0.30 · แอร์: กำไร 5% → ขาย = ทุน ÷ 0.95 · ปัดเศษขึ้นเป็นบาทเต็ม · บริการ: ไม่คำนวณ
const MARGIN = { material: 0.70, ac: 0.05 };
function suggestSale(kind, cost) {
  const c = Number(cost) || 0;
  if (c <= 0 || MARGIN[kind] == null) return null;
  return Math.ceil(c / (1 - MARGIN[kind]));
}

// Add OR edit a catalog item (material / ac / service). `initial` null => add mode.
export default function MaterialModal({ initial, categories, brands = [], btus = [], acTypes = [], defaultKind = "material", onSaved, onClose, onSave }) {
  const isNew = !initial || !!initial._dup;   // _dup = สร้างสำเนา → ถือเป็นรายการใหม่ (รหัสใหม่)
  const [f, setF] = React.useState(() => ({
    code: initial?.code || "",
    name_th: initial?.name_th || initial?.th || "",
    name_en: initial?.name_en || initial?.en || "",
    kind: initial?.kind || defaultKind,
    category: initial?.category || initial?.cat || categories[0]?.id || "pipe",
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
  }));
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  // ราคาขายอัตโนมัติ: รายการใหม่ → พิมพ์ต้นทุนแล้วเติมราคาขายให้ (จนกว่าจะแก้ราคาขายเอง)
  // รายการเดิม → ไม่ทับราคาที่ตั้งไว้ ใช้ปุ่ม ↻ คำนวณใหม่แทน
  const [spTouched, setSpTouched] = React.useState(!isNew);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setCost = (e) => {
    const v = e.target.value;
    setF((s) => {
      const sug = !spTouched ? suggestSale(s.kind, v) : null;
      return { ...s, cost: v, ...(sug != null ? { sale_price: sug } : {}) };
    });
  };
  const setSale = (e) => { setSpTouched(true); setF((s) => ({ ...s, sale_price: e.target.value })); };
  const applySuggest = () => { const sug = suggestSale(f.kind, f.cost); if (sug != null) { setSpTouched(true); setF((s) => ({ ...s, sale_price: sug })); } };
  const setKind = (kind) => setF((s) => ({ ...s, kind, tracked: kind === "service" ? false : s.tracked }));
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
    try { await onSave(f, isNew); onSaved(f.kind); }
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
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
              <label className="fld"><span>หมวดย่อย · Category</span>
                <Combo className="inp" value={f.category} onChange={set("category")}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
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

          {isAc && (
            <div className="fld-row">
              <label className="fld"><span>ขนาด BTU</span>
                <input className="inp" type="number" list="btu-list" value={f.btu} onChange={set("btu")} placeholder="เช่น 12000" />
                <datalist id="btu-list">{btus.map((b) => <option key={b} value={b} />)}</datalist>
              </label>
              <label className="fld"><span>ประเภทแอร์ · Type</span>
                <input className="inp" list="actype-list" value={f.ac_type} onChange={set("ac_type")} placeholder="เช่น Wall Type" />
                <datalist id="actype-list">{acTypes.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
            </div>
          )}
          {isAc && (
            <label className="fld"><span>⚡ ประมาณค่าไฟ/ปี (บาท) · แสดงบนเว็บ</span>
              <input className="inp" type="number" value={f.power_cost_year} onChange={set("power_cost_year")} placeholder="เช่น 3500 (ค่าไฟทั้งปีโดยประมาณ)" />
            </label>
          )}

          <label className="fld"><span>รายละเอียด</span>
            <textarea className="inp" value={f.description} onChange={set("description")} placeholder="คำอธิบาย / สเปก / หมายเหตุ (ไม่บังคับ)" rows={2} style={{ resize: "vertical" }} />
          </label>
          <label className="fld"><span>📋 คุณสมบัติสินค้า · แสดงบนเว็บ (ใส่ได้ยาว · ขึ้นบรรทัดใหม่ได้)</span>
            <textarea className="inp" value={f.features} onChange={set("features")} rows={5} style={{ resize: "vertical" }}
              placeholder={"จุดเด่น/สเปกสินค้า เช่น\n• ประหยัดไฟ เบอร์ 5\n• ระบบ Inverter\n• ฟอกอากาศ PM2.5\n• รับประกันคอมเพรสเซอร์ 10 ปี"} />
          </label>
          <label className="fld"><span>รูปสินค้า</span>
            <div className="photo-field">
              {f.photo_url ? <img src={f.photo_url} className="photo-thumb" alt="" /> : <div className="photo-thumb empty"><UIcon name="camera" size={22} color="var(--ink-3)" /></div>}
              <div className="photo-actions">
                <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
                  <UIcon name="camera" size={14} /> {uploading ? "กำลังอัปโหลด…" : (f.photo_url ? "เปลี่ยนรูป" : "อัปโหลดรูป")}
                  <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} disabled={uploading} />
                </label>
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
