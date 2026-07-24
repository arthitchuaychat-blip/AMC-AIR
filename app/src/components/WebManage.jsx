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
  // multiImage = 1 อัลบั้มเก็บได้หลายรูป (mig 172 คอลัมน์ images) · รูปแรก = รูปปก
  { kind: "portfolio", chip: "📸 อัลบั้มผลงาน", label: "อัลบั้มผลงาน", imageLabel: "รูปผลงาน", aspect: "4/3", folder: "web-portfolio", imageRequired: true, multiImage: true,
    hint: "1 อัลบั้มใส่รูปได้ไม่จำกัด (เลือกหลายรูปพร้อมกันได้) · รูปแรก = รูปปก · โชว์ที่หน้าแรก (สุ่มหมุน) + หน้าผลงาน + แกลเลอรี · ต้องรัน migration 172 ก่อน ไม่งั้นเก็บได้แค่รูปปก",
    fields: [{ key: "title", ph: "คำบรรยายผลงาน (เช่น ติดตั้งแอร์ คอนโด)" }], primary: "title", primaryFallback: "(ผลงาน)" },
  { kind: "clients", chip: "🏢 โลโก้ลูกค้า", label: "โลโก้ลูกค้า", imageLabel: "โลโก้", aspect: "1/1", folder: "web-clients", imageRequired: false, imageKey: "logo_url",
    hint: "อัปโหลดโลโก้ (PNG พื้นโปร่งใสสวยสุด) + ชื่อ → โชว์ในหมวด “องค์กรที่ไว้วางใจเรา”",
    fields: [{ key: "name", ph: "ชื่อลูกค้า/องค์กร", required: true }], primary: "name" },
  { kind: "articles", chip: "📝 บทความ", label: "บทความเรื่องแอร์", imageLabel: "รูปบทความ", aspect: "16/9", folder: "web-articles", imageRequired: false,
    hint: "ใส่ “เนื้อหาบทความ” → เว็บสร้างหน้าบทความแยกให้เอง (amcair.net/a/เลข) ติด Google ได้ · ถ้าไม่ใส่เนื้อหาจะใช้ลิงก์นอกตามเดิม",
    fields: [{ key: "title", ph: "หัวข้อบทความ", required: true }, { key: "excerpt", ph: "คำโปรย (สรุปสั้น ๆ)" }, { key: "body", ph: "เนื้อหาบทความเต็ม — เว้นบรรทัดว่างเพื่อขึ้นย่อหน้าใหม่", multiline: true }, { key: "link_url", ph: "ลิงก์อ่านต่อภายนอก (ใช้เมื่อไม่ใส่เนื้อหา)" }], primary: "title",
    viewUrl: (b) => (b.body ? `https://www.amcair.net/a/${b.id}` : b.link_url || null) },
  { kind: "press", chip: "📰 ข่าวในสื่อ", label: "ข่าวในสื่อต่าง ๆ", imageLabel: "รูปข่าว", aspect: "16/9", folder: "web-press", imageRequired: false,
    hint: "ชื่อสื่อ + หัวข้อข่าว + รูป → โชว์ในหมวด “ในสื่อ” + ภาพข่าวล่าสุดในแถบซ้าย · ใส่ลิงก์ข่าวได้",
    fields: [{ key: "source", ph: "ชื่อสื่อ (เช่น ไทยรัฐ, ช่อง 7)" }, { key: "title", ph: "หัวข้อข่าว", required: true }, { key: "link_url", ph: "ลิงก์ข่าว" }], primary: "title" },
  { kind: "ads", chip: "📢 โฆษณาแถบข้าง", label: "ภาพโฆษณา (แถบข้างเว็บ)", imageLabel: "ภาพโฆษณา", aspect: "4/3", folder: "web-ads", imageRequired: true,
    hint: "ภาพโฆษณาที่เรียงในแถบซ้ายของเว็บ (ใต้ตัวกรองค้นหา) · ใส่ลิงก์กดได้ · เรียงลำดับด้วย ◀▶",
    fields: [{ key: "title", ph: "ชื่อ/คำบรรยาย (ไม่ใส่ก็ได้)" }, { key: "link_url", ph: "ลิงก์ (ถ้ามี)" }], primary: "title", primaryFallback: "(โฆษณา)" },
  { kind: "services", chip: "🛠️ การ์ดบริการ", label: "การ์ดบริการ (หมวด “ครบทุกเรื่องแอร์”)", imageLabel: "รูปไอคอน", aspect: "1/1", folder: "web-services", imageRequired: false,
    hint: "การ์ด 4 บริการบนหน้าแรก · ไอคอนใช้อีโมจิ (หรืออัปโหลดรูปแทน) · จุดเด่นพิมพ์บรรทัดละ 1 ข้อ เว็บใส่ ✓ ให้เอง · ต้องรัน migration 131 ก่อน",
    fields: [
      { key: "emoji", ph: "อีโมจิไอคอน เช่น ❄️ 💧 ↔️ 🔧" },
      { key: "title", ph: "ชื่อบริการ (เช่น ติดตั้งแอร์)", required: true },
      { key: "subtitle", ph: "คำโปรยใต้ชื่อ (สั้น ๆ 1 บรรทัด)" },
      { key: "bullets", ph: "จุดเด่น — บรรทัดละ 1 ข้อ", multiline: true },
      { key: "svc", ph: "หมวดค้นหาเมื่อกด: ติดตั้ง / ล้าง / ย้าย / ซ่อม / รื้อถอน / อื่นๆ (เว้นว่าง = กดไม่ลิงก์)" },
    ], primary: "title" },
  { kind: "reviews", chip: "⭐ รีวิวลูกค้า", label: "รีวิวลูกค้า (หมวด “ลูกค้าพูดถึงเรา”)", imageLabel: "รูปลูกค้า", aspect: "1/1", folder: "web-reviews", imageRequired: false,
    hint: "รีวิวบนหน้าแรก · ไม่ใส่รูปจะใช้อักษรย่อจากชื่อ · ดาวใส่ 1–5 · ต้องรัน migration 134 ก่อน",
    fields: [
      { key: "name", ph: "ชื่อลูกค้า (เช่น คุณกนกวรรณ)", required: true },
      { key: "role", ph: "คำอธิบายใต้ชื่อ (เช่น ลูกค้าบ้านพักอาศัย / เจ้าของร้านอาหาร)" },
      { key: "text", ph: "ข้อความรีวิว", multiline: true, required: true },
      { key: "stars", ph: "จำนวนดาว 1–5 (ไม่ใส่ = 5)" },
    ], primary: "name" },
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

// แถบรูปในอัลบั้ม — รูปแรก = ปก · ย้ายลำดับ/ลบได้ทีละรูป
function PhotoStrip({ imgs, aspect, busy, onRemove, onMove }) {
  return (
    <div className="wb-strip">
      {imgs.map((u, i) => (
        <div className="wb-strip-item" key={u + i} style={{ aspectRatio: aspect }}>
          <img src={u} alt="" />
          {i === 0 && <span className="wb-cover">ปก</span>}
          <div className="wb-strip-acts">
            <button type="button" title="เลื่อนซ้าย" disabled={busy || i === 0} onClick={() => onMove(i, -1)}>◀</button>
            <button type="button" title="เลื่อนขวา" disabled={busy || i === imgs.length - 1} onClick={() => onMove(i, 1)}>▶</button>
            <button type="button" className="danger" title="ลบรูปนี้" disabled={busy} onClick={() => onRemove(i)}>✕</button>
          </div>
        </div>
      ))}
      <span className="jo-dim" style={{ fontSize: 11.5, alignSelf: "center" }}>{imgs.length} รูป · รูปแรกคือปก</span>
    </div>
  );
}

function WebItemManager({ cfg, flash }) {
  const [list, setList] = React.useState(null);
  const [img, setImg] = React.useState("");
  const [imgs, setImgs] = React.useState([]);   // อัลบั้มหลายรูป (โหมด multiImage) — ลำดับในนี้คือลำดับบนเว็บ
  const [vals, setVals] = React.useState({});
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [edit, setEdit] = React.useState(null);   // { id, vals } — แก้ไขข้อความของรายการเดิม

  async function load() {
    try { setList(await listWebItems(cfg.kind)); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน migration 072/078/079 แล้วหรือยัง?)", true); setList([]); }
  }
  React.useEffect(() => { load(); }, [cfg.kind]);

  async function onImg(e) {
    const files = [...(e.target.files || [])]; e.target.value = ""; if (!files.length) return;
    setUploading(true);
    try {
      if (cfg.multiImage) {
        // อัปโหลดทีละไฟล์ตามลำดับที่เลือก — เก็บลำดับให้ตรงกับที่ผู้ใช้เห็น (Promise.all จะสลับลำดับได้)
        const urls = [];
        for (const file of files) urls.push(await uploadWebImage(file, cfg.folder));
        setImgs((s) => [...s, ...urls]);
      } else setImg(await uploadWebImage(files[0], cfg.folder));
    } catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
    setUploading(false);
  }
  // แก้ลำดับ/ลบรูปในอัลบั้ม (ใช้ทั้งฟอร์มเพิ่มและตอนแก้ไข)
  const rmAt = (arr, i) => arr.filter((_, j) => j !== i);
  const swapAt = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const a = arr.slice(); [a[i], a[j]] = [a[j], a[i]]; return a; };
  async function add() {
    if (cfg.imageRequired && !(cfg.multiImage ? imgs.length : img)) return flash("อัปโหลดรูปก่อน", true);
    for (const f of cfg.fields) if (f.required && !(vals[f.key] || "").trim()) return flash(`กรอก "${f.ph}" ก่อน`, true);
    setBusy(true);
    // ⚠️ image_url ต้องเป็นรูปแรกของ images เสมอ — เว็บบันเดิลเก่า/แท็ก og:image ยังอ่านคอลัมน์นี้ (mig 172)
    const row = cfg.multiImage
      ? { image_url: imgs[0] || null, images: imgs, sort: (list?.length || 0) + 1 }
      : { [cfg.imageKey || "image_url"]: img || null, sort: (list?.length || 0) + 1 };
    cfg.fields.forEach((f) => { row[f.key] = (vals[f.key] || "").trim() || null; });
    try {
      const res = await saveWebItem(cfg.kind, row);
      setImg(""); setVals({});
      if (res?.degraded === "images") { await load(); flash("ยังไม่ได้รัน migration 172 — เก็บได้เฉพาะรูปปก รูปที่เหลือยังไม่ถูกบันทึก (รูปยังอยู่ในฟอร์ม กด SQL แล้วบันทึกใหม่ได้)", true); }   // คงรูปไว้ในฟอร์มให้บันทึกซ้ำได้
      else { setImgs([]); await load(); flash("เพิ่มแล้ว ✓"); }
    }
    catch (e) { const m = e.message || String(e); flash("บันทึกไม่สำเร็จ: " + m + (/body/.test(m) ? " — ต้องรัน migration 101 ก่อน" : ""), true); }
    setBusy(false);
  }
  function startEdit(b) {
    const v = {}; cfg.fields.forEach((f) => { v[f.key] = b[f.key] || ""; });
    // อัลบั้มเก่าที่ยังไม่ได้ย้ายข้อมูล (images ว่าง) → ใช้รูปปกเดิมเป็นรูปแรก จะได้ไม่กลายเป็นอัลบั้มเปล่า
    setEdit({ id: b.id, vals: v, imgs: cfg.multiImage ? (b.images?.length ? [...b.images] : (b.image_url ? [b.image_url] : [])) : null });
  }
  async function saveEdit(b) {
    // image_url เป็น NOT NULL (mig 079) — ลบรูปหมดแล้วบันทึกจะเด้ง error ดิบจากฐานข้อมูล
    if (cfg.multiImage && cfg.imageRequired && !(edit.imgs || []).length) return flash("อัลบั้มต้องมีอย่างน้อย 1 รูป — เพิ่มรูปก่อน หรือกดลบทั้งอัลบั้มแทน", true);
    setBusy(true);
    const row = { ...b };
    cfg.fields.forEach((f) => { row[f.key] = (edit.vals[f.key] || "").trim() || null; });
    if (cfg.multiImage) { row.images = edit.imgs || []; row.image_url = (edit.imgs || [])[0] || null; }
    try {
      const res = await saveWebItem(cfg.kind, row);
      if (res?.degraded === "images") { await load(); flash("ยังไม่ได้รัน migration 172 — เก็บได้เฉพาะรูปปก รูปที่เหลือยังไม่ถูกบันทึก (รูปยังอยู่ในฟอร์ม กด SQL แล้วบันทึกใหม่ได้)", true); }   // ไม่ปิดฟอร์ม รูปที่เพิ่มยังอยู่
      else { setEdit(null); await load(); flash("บันทึกแล้ว ✓"); }
    }
    catch (e) { const m = e.message || String(e); flash("บันทึกไม่สำเร็จ: " + m + (/body/.test(m) ? " — ต้องรัน migration 101 ก่อน" : ""), true); }
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
            {cfg.multiImage
              ? (imgs.length ? <img src={imgs[0]} alt="" style={{ objectFit: "cover" }} /> : <span>{uploading ? "กำลังอัปโหลด…" : "+ " + cfg.imageLabel}</span>)
              : (img ? <img src={img} alt="" style={{ objectFit: "cover" }} /> : <span>{uploading ? "กำลังอัปโหลด…" : "+ " + cfg.imageLabel}</span>)}
            <input type="file" accept="image/*" multiple={!!cfg.multiImage} hidden disabled={uploading} onChange={onImg} />
          </label>
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 8 }}>
            {cfg.fields.map((f) => f.multiline ? (
              <textarea key={f.key} className="inp" rows={5} placeholder={f.ph + (f.required ? " *" : "")} value={vals[f.key] || ""}
                onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                style={{ resize: "vertical", fontFamily: "inherit" }} />
            ) : (
              <input key={f.key} className="inp" placeholder={f.ph + (f.required ? " *" : "")} value={vals[f.key] || ""}
                onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
            ))}
          </div>
          <button className="btn-primary" disabled={busy || uploading} onClick={add}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
        </div>
        {cfg.multiImage && imgs.length > 0 && (
          <PhotoStrip imgs={imgs} aspect={cfg.aspect} busy={uploading}
            onRemove={(i) => setImgs((a) => rmAt(a, i))} onMove={(i, d) => setImgs((a) => swapAt(a, i, d))} />
        )}
      </div>

      {list === null ? <div className="empty">กำลังโหลด…</div>
        : list.length === 0 ? <div className="empty" style={{ padding: 40 }}>ยังไม่มีรายการ — เพิ่มด้านบน</div>
        : (
          <div className="wb-list">
            {list.map((b, i) => (
              <div key={b.id} className={"wb-row" + (b.active ? "" : " off")}>
                <span className="wb-no">{i + 1}</span>
                <div className="wb-thumb" style={{ aspectRatio: cfg.aspect, width: cfg.aspect === "1/1" ? 64 : 130 }}>{b[cfg.imageKey || "image_url"] ? <img src={b[cfg.imageKey || "image_url"]} alt="" /> : <span className="jo-dim" style={{ fontSize: 11, display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>ไม่มีรูป</span>}</div>
                {edit && edit.id === b.id ? (
                  <div className="wb-cap" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {cfg.fields.map((f) => f.multiline ? (
                      <textarea key={f.key} className="inp" rows={6} placeholder={f.ph} value={edit.vals[f.key] || ""}
                        onChange={(e) => setEdit((s) => ({ ...s, vals: { ...s.vals, [f.key]: e.target.value } }))}
                        style={{ resize: "vertical", fontFamily: "inherit", fontWeight: 400 }} />
                    ) : (
                      <input key={f.key} className="inp" placeholder={f.ph} value={edit.vals[f.key] || ""}
                        onChange={(e) => setEdit((s) => ({ ...s, vals: { ...s.vals, [f.key]: e.target.value } }))}
                        style={{ fontWeight: 400 }} />
                    ))}
                    {cfg.multiImage && (<>
                      <PhotoStrip imgs={edit.imgs || []} aspect={cfg.aspect} busy={uploading}
                        onRemove={(i) => setEdit((s) => ({ ...s, imgs: rmAt(s.imgs || [], i) }))}
                        onMove={(i, d) => setEdit((s) => ({ ...s, imgs: swapAt(s.imgs || [], i, d) }))} />
                      <label className="btn-ghost xs" style={{ alignSelf: "flex-start", cursor: uploading ? "default" : "pointer" }}>
                        {uploading ? "กำลังอัปโหลด…" : "＋ เพิ่มรูปเข้าอัลบั้ม"}
                        <input type="file" accept="image/*" multiple hidden disabled={uploading}
                          onChange={async (e) => {
                            const files = [...(e.target.files || [])]; e.target.value = ""; if (!files.length) return;
                            setUploading(true);
                            try { const urls = []; for (const file of files) urls.push(await uploadWebImage(file, cfg.folder)); setEdit((s) => ({ ...s, imgs: [...(s.imgs || []), ...urls] })); }
                            catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
                            setUploading(false);
                          }} />
                      </label>
                    </>)}
                  </div>
                ) : (
                  <div className="wb-cap">{b[cfg.primary] || <span className="jo-dim">{cfg.primaryFallback || "—"}</span>}
                    {cfg.multiImage ? <div className="jo-dim" style={{ fontWeight: 400, fontSize: 12 }}>🖼️ {(b.images?.length || (b.image_url ? 1 : 0))} รูปในอัลบั้ม</div> : null}
                    {b.excerpt ? <div className="jo-dim" style={{ fontWeight: 400, fontSize: 12 }}>{b.excerpt}</div> : null}
                    {b.source ? <div className="jo-dim" style={{ fontWeight: 400, fontSize: 12 }}>{b.source}</div> : null}
                    {b.text ? <div className="jo-dim" style={{ fontWeight: 400, fontSize: 12 }}>{"★".repeat(Math.max(1, Math.min(5, Number(b.stars) || 5)))} “{b.text}”{b.role ? ` — ${b.role}` : ""}</div> : null}
                    {cfg.viewUrl && cfg.viewUrl(b) ? <div style={{ marginTop: 2 }}>
                      {b.body ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0a7d2c", marginRight: 8 }}>📄 มีเนื้อหาเต็ม</span> : null}
                      <a href={cfg.viewUrl(b)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0ea5e9", fontWeight: 700 }}>ดูหน้าเว็บ ↗</a>
                    </div> : null}</div>
                )}
                <div className="wb-acts">
                  {edit && edit.id === b.id ? (<>
                    <button className="btn-ghost xs" style={{ background: "#111", color: "#fff", borderColor: "#111" }} disabled={busy} onClick={() => saveEdit(b)}>บันทึก ✓</button>
                    <button className="btn-ghost xs" onClick={() => setEdit(null)}>ยกเลิก</button>
                  </>) : (<>
                    <button className="btn-ghost xs" onClick={() => move(b, -1)} disabled={i === 0} title="เลื่อนขึ้น">◀</button>
                    <button className="btn-ghost xs" onClick={() => move(b, 1)} disabled={i === list.length - 1} title="เลื่อนลง">▶</button>
                    <button className="btn-ghost xs" onClick={() => startEdit(b)}>แก้ไข</button>
                    <button className="btn-ghost xs" onClick={() => toggleActive(b)}>{b.active ? "ซ่อน" : "แสดง"}</button>
                    <button className="btn-ghost xs danger" onClick={() => remove(b)}>ลบ</button>
                  </>)}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
