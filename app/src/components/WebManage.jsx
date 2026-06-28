import React from "react";
import { listWebItems, saveWebItem, deleteWebItem, uploadWebImage } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { UIcon } from "../icons";

// One generic manager drives all 5 website content types. Each tab passes a config describing its
// image + text fields; everything else (upload, reorder, show/hide, delete) is shared.
const TABS = [
  { kind: "banners", chip: "🖼️ ปก/สไลด์โชว์", label: "ภาพปก Hero (สไลด์โชว์)", imageLabel: "ภาพปก", aspect: "16/9", folder: "web-banners", imageRequired: true,
    hint: "ภาพแนวนอน ~1920×720px · โชว์ด้านบนสุดของเว็บ สลับทุก 2 วินาที · เรียงลำดับด้วย ◀▶",
    fields: [{ key: "caption", ph: "ข้อความบนภาพ (ไม่ใส่ก็ได้)" }], primary: "caption", primaryFallback: "(ไม่มีข้อความ)" },
  { kind: "portfolio", chip: "📸 อัลบั้มผลงาน", label: "อัลบั้มผลงาน", imageLabel: "รูปผลงาน", aspect: "4/3", folder: "web-portfolio", imageRequired: true,
    hint: "เพิ่มรูปผลงานได้ไม่จำกัด · โชว์ที่หน้าแรก (สุ่มหมุน) + หน้าผลงาน + แกลเลอรี",
    fields: [{ key: "title", ph: "คำบรรยายผลงาน (เช่น ติดตั้งแอร์ คอนโด)" }], primary: "title", primaryFallback: "(ผลงาน)" },
  { kind: "clients", chip: "🏢 โลโก้ลูกค้า", label: "โลโก้ลูกค้า", imageLabel: "โลโก้", aspect: "1/1", folder: "web-clients", imageRequired: false, imageKey: "logo_url",
    hint: "อัปโหลดโลโก้ (PNG พื้นโปร่งใสสวยสุด) + ชื่อ → โชว์ในหมวด “องค์กรที่ไว้วางใจเรา”",
    fields: [{ key: "name", ph: "ชื่อลูกค้า/องค์กร", required: true }], primary: "name" },
  { kind: "articles", chip: "📝 บทความ", label: "บทความเรื่องแอร์", imageLabel: "รูปบทความ", aspect: "16/9", folder: "web-articles", imageRequired: false,
    hint: "หัวข้อ + คำโปรย + รูป → โชว์ในหมวด “บทความ” · ใส่ลิงก์อ่านต่อได้",
    fields: [{ key: "title", ph: "หัวข้อบทความ", required: true }, { key: "excerpt", ph: "คำโปรย (สรุปสั้น ๆ)" }, { key: "link_url", ph: "ลิงก์อ่านต่อ (ถ้ามี)" }], primary: "title" },
  { kind: "press", chip: "📰 ข่าวในสื่อ", label: "ข่าวในสื่อต่าง ๆ", imageLabel: "รูปข่าว", aspect: "16/9", folder: "web-press", imageRequired: false,
    hint: "ชื่อสื่อ + หัวข้อข่าว + รูป → โชว์ในหมวด “ในสื่อ” + ภาพข่าวล่าสุดในแถบซ้าย · ใส่ลิงก์ข่าวได้",
    fields: [{ key: "source", ph: "ชื่อสื่อ (เช่น ไทยรัฐ, ช่อง 7)" }, { key: "title", ph: "หัวข้อข่าว", required: true }, { key: "link_url", ph: "ลิงก์ข่าว" }], primary: "title" },
  { kind: "ads", chip: "📢 โฆษณาแถบข้าง", label: "ภาพโฆษณา (แถบข้างเว็บ)", imageLabel: "ภาพโฆษณา", aspect: "4/3", folder: "web-ads", imageRequired: true,
    hint: "ภาพโฆษณาที่เรียงในแถบซ้ายของเว็บ (ใต้ตัวกรองค้นหา) · ใส่ลิงก์กดได้ · เรียงลำดับด้วย ◀▶",
    fields: [{ key: "title", ph: "ชื่อ/คำบรรยาย (ไม่ใส่ก็ได้)" }, { key: "link_url", ph: "ลิงก์ (ถ้ามี)" }], primary: "title", primaryFallback: "(โฆษณา)" },
];

export default function WebManage({ role }) {
  const [tab, setTab] = React.useState("banners");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  const cfg = TABS.find((t) => t.kind === tab) || TABS[0];

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">จัดการเว็บไซต์ <span className="page-title-en">Website Content</span></h1>
          <p className="page-sub">ทีมกราฟิกอัปโหลด/แก้ไขรูปและเนื้อหาบนเว็บไซต์ amcair.net ได้เองทั้งหมด</p></div>
      </div>
      <div className="cat-filter" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.kind} className={"cat-chip" + (tab === t.kind ? " on" : "")} onClick={() => setTab(t.kind)}
            style={tab === t.kind ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{t.chip}</button>
        ))}
      </div>

      <WebItemManager key={cfg.kind} cfg={cfg} flash={flash} />

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function WebItemManager({ cfg, flash }) {
  const [list, setList] = React.useState(null);
  const [img, setImg] = React.useState("");
  const [vals, setVals] = React.useState({});
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function load() {
    try { setList(await listWebItems(cfg.kind)); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน migration 072/078/079 แล้วหรือยัง?)", true); setList([]); }
  }
  React.useEffect(() => { load(); }, [cfg.kind]);

  async function onImg(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setUploading(true);
    try { setImg(await uploadWebImage(f, cfg.folder)); } catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
    setUploading(false);
  }
  async function add() {
    if (cfg.imageRequired && !img) return flash("อัปโหลดรูปก่อน", true);
    for (const f of cfg.fields) if (f.required && !(vals[f.key] || "").trim()) return flash(`กรอก "${f.ph}" ก่อน`, true);
    setBusy(true);
    const row = { [cfg.imageKey || "image_url"]: img || null, sort: (list?.length || 0) + 1 };
    cfg.fields.forEach((f) => { row[f.key] = (vals[f.key] || "").trim() || null; });
    try { await saveWebItem(cfg.kind, row); setImg(""); setVals({}); await load(); flash("เพิ่มแล้ว ✓"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function remove(b) {
    if (!await confirmDialog("ลบรายการนี้ออกจากเว็บ?")) return;
    try { await deleteWebItem(cfg.kind, b.id); await load(); flash("ลบแล้ว"); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function toggleActive(b) {
    try { await saveWebItem(cfg.kind, { ...b, active: !b.active }); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function move(b, dir) {
    if (!list) return;
    const i = list.findIndex((x) => x.id === b.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i], c = list[j];
    try { await saveWebItem(cfg.kind, { ...a, sort: c.sort }); await saveWebItem(cfg.kind, { ...c, sort: a.sort }); await load(); }
    catch (e) { flash("ย้ายลำดับไม่สำเร็จ: " + (e.message || e), true); }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">เพิ่ม{cfg.label}</div><div className="sec-sub">{cfg.hint}</div></div></div>
        <div className="wc-add">
          <label className="wc-drop" style={{ width: 120, aspectRatio: cfg.aspect }}>
            {img ? <img src={img} alt="" style={{ objectFit: "cover" }} /> : <span>{uploading ? "กำลังอัปโหลด…" : "+ " + cfg.imageLabel}</span>}
            <input type="file" accept="image/*" hidden disabled={uploading} onChange={onImg} />
          </label>
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 8 }}>
            {cfg.fields.map((f) => (
              <input key={f.key} className="inp" placeholder={f.ph + (f.required ? " *" : "")} value={vals[f.key] || ""}
                onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
            ))}
          </div>
          <button className="btn-primary" disabled={busy || uploading} onClick={add}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
        </div>
      </div>

      {list === null ? <div className="empty">กำลังโหลด…</div>
        : list.length === 0 ? <div className="empty" style={{ padding: 40 }}>ยังไม่มีรายการ — เพิ่มด้านบน</div>
        : (
          <div className="wb-list">
            {list.map((b, i) => (
              <div key={b.id} className={"wb-row" + (b.active ? "" : " off")}>
                <span className="wb-no">{i + 1}</span>
                <div className="wb-thumb" style={{ aspectRatio: cfg.aspect, width: cfg.aspect === "1/1" ? 64 : 130 }}>{b[cfg.imageKey || "image_url"] ? <img src={b[cfg.imageKey || "image_url"]} alt="" /> : <span className="jo-dim" style={{ fontSize: 11, display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>ไม่มีรูป</span>}</div>
                <div className="wb-cap">{b[cfg.primary] || <span className="jo-dim">{cfg.primaryFallback || "—"}</span>}
                  {b.excerpt ? <div className="jo-dim" style={{ fontWeight: 400, fontSize: 12 }}>{b.excerpt}</div> : null}
                  {b.source ? <div className="jo-dim" style={{ fontWeight: 400, fontSize: 12 }}>{b.source}</div> : null}</div>
                <div className="wb-acts">
                  <button className="btn-ghost xs" onClick={() => move(b, -1)} disabled={i === 0} title="เลื่อนขึ้น">◀</button>
                  <button className="btn-ghost xs" onClick={() => move(b, 1)} disabled={i === list.length - 1} title="เลื่อนลง">▶</button>
                  <button className="btn-ghost xs" onClick={() => toggleActive(b)}>{b.active ? "ซ่อน" : "แสดง"}</button>
                  <button className="btn-ghost xs danger" onClick={() => remove(b)}>ลบ</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
