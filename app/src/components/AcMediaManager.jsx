import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Lightbox from "./Lightbox";
import { UIcon } from "../icons";
import { fmtNum } from "../lib/format";
import {
  fetchExternalFile, uploadMaterialPhoto, uploadBrochureFile, setMaterialsPhoto, setMaterialFeatures,
  listAcSeriesAll, getAcSeries, saveAcSeries, aiDraftSeriesFeatures,
} from "../lib/api";
import { AC_OFFICIAL_MEDIA, AC_OFFICIAL_BROCHURES } from "../lib/acOfficialMedia";

// จัดการ "รูปสินค้า + คุณสมบัติ" ของแอร์ทีละรุ่น (ทุกขนาดในรุ่นใช้รูป/คุณสมบัติร่วมกัน)
// กติการูปของเจ้าของ: รูปสินค้าเดี่ยว พื้นสะอาด ไม่มีลายน้ำ/ข้อความ/โลโก้ร้านอื่น (โลโก้ยี่ห้อบนตัวเครื่องได้)
// เอารูปจากเว็บผู้ผลิตโดยตรง: คลิกขวารูปบนเว็บยี่ห้อ → Copy image address → วางในปุ่ม 🔗

const isOurStorage = (url) => /supabase\.co\/storage/i.test(url || "");

// สถานะรูปของกลุ่ม: ok | none (ไม่มีรูปเลย) | partial (มีบางขนาด) | external (มีรูปที่เป็นลิงก์เว็บอื่น)
function photoStatus(items) {
  const withP = items.filter((m) => m.photoUrl || m.photo_url);
  if (!withP.length) return "none";
  const ext = withP.some((m) => !isOurStorage(m.photoUrl || m.photo_url));
  if (ext) return "external";
  if (withP.length < items.length) return "partial";
  return "ok";
}

const PHOTO_BADGE = {
  none: { l: "ไม่มีรูป", cls: "b-red" },
  external: { l: "รูปลิงก์เว็บอื่น — ควรดึงมาเก็บ", cls: "b-amber" },
  partial: { l: "รูปไม่ครบทุกขนาด", cls: "b-amber" },
  ok: { l: "รูป ✓", cls: "b-green" },
};

export default function AcMediaManager({ mats, onClose, onChanged }) {
  // สำเนาภายใน — อัปเดตทันทีหลังแก้ โดยไม่ต้องรอโหลดคลังใหม่ทั้งหน้า
  const [rows, setRows] = React.useState(() => mats.filter((m) => m.kind === "ac"));
  const [srsMap, setSrsMap] = React.useState({});   // "brand||series" → ac_series row
  const [flt, setFlt] = React.useState("all");      // all | nophoto | external | nofeat
  const [brand, setBrand] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(null);     // group key ที่กางอยู่
  const [busy, setBusy] = React.useState(null);     // group key ที่กำลังทำงาน
  const [feat, setFeat] = React.useState({});       // group key → ข้อความคุณสมบัติในฟอร์ม
  const [featDirty, setFeatDirty] = React.useState({});
  const [err, setErr] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [zoom, setZoom] = React.useState(null);     // รูปทั้งหมดของรุ่นที่กดดูใหญ่ (เช็กลายน้ำ/ความคมชัดก่อนใช้)
  const changedRef = React.useRef(false);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  React.useEffect(() => {
    listAcSeriesAll()
      .then((list) => setSrsMap(Object.fromEntries(list.map((r) => [`${(r.brand || "").trim()}||${(r.name || "").trim()}`, r]))))
      .catch(() => { /* ยังไม่รัน migration 106 — คุณสมบัติรายรุ่นจะบันทึกไม่ได้ */ });
  }, []);
  React.useEffect(() => {
    // Esc: ถ้ากำลังดูรูปใหญ่ ให้ Lightbox ปิดตัวเองก่อน — ไม่ปิดทั้งหน้าจัดการพร้อมกัน
    const esc = (e) => e.key === "Escape" && !zoom && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });
  function close() { onClose(changedRef.current); }

  // จัดกลุ่ม ยี่ห้อ → รุ่น (แอร์ไม่มีรุ่น = กลุ่มของตัวเอง แก้รายตัว)
  const groups = React.useMemo(() => {
    const map = new Map();
    rows.forEach((m) => {
      const b = (m.brand || "").trim(), s = (m.series || "").trim();
      const key = s ? `${b}||${s}` : `item:${m.code}`;
      if (!map.has(key)) map.set(key, { key, brand: b, series: s, single: !s, items: [] });
      map.get(key).items.push(m);
    });
    const out = [...map.values()];
    out.forEach((g) => {
      g.items.sort((a, b2) => (Number(a.btu) || 0) - (Number(b2.btu) || 0));
      g.photo = (g.items.find((m) => m.photoUrl || m.photo_url) || {});
      g.photoUrl = g.photo.photoUrl || g.photo.photo_url || "";
      g.pstat = photoStatus(g.items);
      g.features = g.single
        ? (g.items[0].features || "")
        : (srsMap[`${g.brand}||${g.series}`]?.features || "");
      g.title = g.single ? (g.items[0].th || g.items[0].code) : `${g.brand || "(ไม่ระบุยี่ห้อ)"} ${g.series}`;
    });
    const col = new Intl.Collator("th");
    return out.sort((a, b2) => col.compare(a.brand || "ฮฮ", b2.brand || "ฮฮ") || col.compare(a.series || a.title, b2.series || b2.title));
  }, [rows, srsMap]);

  const brandOpts = React.useMemo(() => [...new Set(rows.map((m) => (m.brand || "").trim()).filter(Boolean))].sort((a, b2) => a.localeCompare(b2, "th")), [rows]);
  const nq = q.trim().toLowerCase();
  const shown = groups.filter((g) =>
    (brand === "all" || (g.brand || "") === brand) &&
    (flt !== "nophoto" || g.pstat === "none" || g.pstat === "partial") &&
    (flt !== "external" || g.pstat === "external") &&
    (flt !== "nofeat" || !(g.features || "").trim()) &&
    (!nq || `${g.title} ${g.items.map((m) => `${m.code} ${m.th}`).join(" ")}`.toLowerCase().includes(nq))
  );
  const stats = React.useMemo(() => ({
    nophoto: groups.filter((g) => g.pstat === "none" || g.pstat === "partial").length,
    external: groups.filter((g) => g.pstat === "external").length,
    nofeat: groups.filter((g) => !(g.features || "").trim()).length,
  }), [groups]);

  // ---- รูป/โบรชัวร์ "ทางการ" ที่ค้นไว้แล้ว (lib/acOfficialMedia.js) → จับคู่กับของจริงในคลัง ----
  // entry แบบ series = ใส่ทุกขนาดในรุ่น · แบบ code = ใส่เฉพาะรหัสนั้น
  const officialTargets = React.useMemo(() => {
    const out = [];
    for (const m of AC_OFFICIAL_MEDIA) {
      if (m.code) {
        const it = rows.find((r) => r.code === m.code);
        if (it) out.push({ m, codes: [it.code], label: `${m.brand} · ${it.th || it.code}`, groupKey: (it.series || "").trim() ? `${(it.brand || "").trim()}||${(it.series || "").trim()}` : `item:${it.code}` });
      } else {
        const its = rows.filter((r) => (r.brand || "").trim() === m.brand && (r.series || "").trim() === m.series);
        if (its.length) out.push({ m, codes: its.map((i) => i.code), label: `${m.brand} ${m.series} (${its.length} ขนาด)`, groupKey: `${m.brand}||${m.series}` });
      }
    }
    return out;
  }, [rows]);
  const officialAuto = officialTargets.filter((t) => !t.m.review);
  const brochureAuto = AC_OFFICIAL_BROCHURES.filter((b) => !b.review);
  const [imp, setImp] = React.useState(null);      // { i, n, label } ระหว่างนำเข้า
  const [impLog, setImpLog] = React.useState(null); // สรุปผลหลังนำเข้า

  // ดาวน์โหลดผ่านเซิร์ฟเวอร์ → เก็บเข้า storage เรา → ผูกให้ทุกรหัสในเป้าหมาย
  async function importOne(t) {
    const file = await fetchExternalFile(t.m.img);
    if (!/^image\//i.test(file.type || "") && !/\.(jpe?g|png|webp|gif)([?#]|$)/i.test(t.m.img)) throw new Error("ลิงก์ไม่ใช่ไฟล์รูป");
    const up = await uploadMaterialPhoto(file, t.codes[0]);
    await setMaterialsPhoto(t.codes, up);
    applyPhotoLocal(t.codes, up);
  }
  async function importBrochure(brand, series, url) {
    const file = await fetchExternalFile(url);
    const stored = await uploadBrochureFile(file);
    let cur = srsMap[`${brand}||${series}`];
    if (!cur) { try { cur = await getAcSeries(brand, series); } catch { /* ยังไม่มีแถว */ } }
    await saveAcSeries({ brand, name: series, features: cur?.features || null, brochure_url: stored });
    setSrsMap((s) => ({ ...s, [`${brand}||${series}`]: { ...(cur || {}), brand, name: series, brochure_url: stored } }));
    changedRef.current = true;
  }
  async function importOfficialAll() {
    const jobs = [
      ...officialAuto.map((t) => ({ kind: "img", label: t.label, run: () => importOne(t) })),
      ...officialAuto.filter((t) => t.m.brochure && t.m.series).map((t) => ({ kind: "pdf", label: `โบรชัวร์ ${t.m.brand} ${t.m.series}`, run: () => importBrochure(t.m.brand, t.m.series, t.m.brochure) })),
      ...brochureAuto.map((b) => ({ kind: "pdf", label: `โบรชัวร์ ${b.brand} ${b.series}`, run: () => importBrochure(b.brand, b.series, b.url) })),
    ];
    if (!await confirmDialog({ title: `นำเข้ารูป/โบรชัวร์ทางการ ${jobs.length} รายการ?`, message: "ระบบจะดาวน์โหลดจากเว็บผู้ผลิตผ่านเซิร์ฟเวอร์ แล้วเก็บถาวรในระบบเรา (ทับรูปเดิมของรุ่นนั้น) — ใช้เวลาสักครู่", confirmText: "เริ่มนำเข้า" })) return;
    setErr(null); setImpLog(null);
    const errs = []; let ok = 0;
    for (let i = 0; i < jobs.length; i++) {
      setImp({ i: i + 1, n: jobs.length, label: jobs[i].label });
      try { await jobs[i].run(); ok++; }
      catch (ex) { errs.push(`${jobs[i].label}: ${ex.message || ex}`); }
    }
    setImp(null); setImpLog({ ok, total: jobs.length, errs });
    onChanged?.();
  }

  function applyPhotoLocal(codes, url) {
    const cs = new Set(codes);
    setRows((cur) => cur.map((m) => (cs.has(m.code) ? { ...m, photoUrl: url || "", photo_url: url || "" } : m)));
    changedRef.current = true;
    onChanged?.();
  }

  // วางลิงก์รูปจากเว็บผู้ผลิต → เซิร์ฟเวอร์ดาวน์โหลด → เก็บเข้า storage เรา → ใส่ทุกขนาดในรุ่น
  async function pullFromLink(g) {
    const url = window.prompt(`วางลิงก์รูปสินค้า ${g.title}\n(คลิกขวารูปบนเว็บยี่ห้อ → Copy image address)`);
    if (!url?.trim()) return;
    setBusy(g.key); setErr(null);
    try {
      const file = await fetchExternalFile(url.trim());
      if (!/^image\//i.test(file.type || "") && !/\.(jpe?g|png|webp|gif)([?#]|$)/i.test(url)) throw new Error("ลิงก์นี้ไม่ใช่ไฟล์รูป");
      const up = await uploadMaterialPhoto(file, g.items[0].code);
      await setMaterialsPhoto(g.items.map((m) => m.code), up);
      applyPhotoLocal(g.items.map((m) => m.code), up);
      flash(`ตั้งรูป ${g.title} ให้ ${g.items.length} รายการแล้ว ✓`);
    } catch (ex) { setErr(`${g.title}: ${ex.message || ex}`); }
    setBusy(null);
  }
  async function uploadFile(g, e) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setBusy(g.key); setErr(null);
    try {
      const up = await uploadMaterialPhoto(file, g.items[0].code);
      await setMaterialsPhoto(g.items.map((m) => m.code), up);
      applyPhotoLocal(g.items.map((m) => m.code), up);
      flash(`ตั้งรูป ${g.title} ให้ ${g.items.length} รายการแล้ว ✓`);
    } catch (ex) { setErr(`${g.title}: ${ex.message || ex}`); }
    setBusy(null);
  }
  async function clearPhoto(g) {
    if (!await confirmDialog(`ลบรูปของ "${g.title}" ทั้ง ${g.items.length} รายการ?`)) return;
    setBusy(g.key); setErr(null);
    try { await setMaterialsPhoto(g.items.map((m) => m.code), null); applyPhotoLocal(g.items.map((m) => m.code), ""); }
    catch (ex) { setErr(`${g.title}: ${ex.message || ex}`); }
    setBusy(null);
  }
  // เปิดค้นรูปจากเว็บผู้ผลิต/Google รูปภาพ ในแท็บใหม่ — ผู้ใช้ก็อปลิงก์รูปกลับมาวาง
  function searchPhoto(g) {
    const term = g.single ? `${g.brand} ${g.items[0].th}` : `${g.brand} ${g.series} air conditioner`;
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term.trim())}`, "_blank", "noopener");
  }

  const featVal = (g) => (g.key in feat ? feat[g.key] : g.features || "");
  async function aiDraft(g) {
    setBusy(g.key); setErr(null);
    try {
      const items = g.items.map((m) => ({ btu: m.btu, ac_type: m.ac_type, seer: m.seer, refrigerant: m.refrigerant, voltage: m.voltage, energy_label: m.energy_label, warranty: m.warranty }));
      const text = await aiDraftSeriesFeatures(g.brand, g.single ? g.items[0].th : g.series, items);
      setFeat((s) => ({ ...s, [g.key]: text }));
      setFeatDirty((s) => ({ ...s, [g.key]: true }));
      flash("ได้ร่างจาก AI แล้ว — ตรวจ/แก้ก่อนกดบันทึก");
    } catch (ex) { setErr(`AI ร่างไม่สำเร็จ: ${ex.message || ex}`); }
    setBusy(null);
  }
  async function saveFeat(g) {
    const text = featVal(g);
    setBusy(g.key); setErr(null);
    try {
      if (g.single) {
        await setMaterialFeatures(g.items[0].code, text);
        setRows((cur) => cur.map((m) => (m.code === g.items[0].code ? { ...m, features: text } : m)));
      } else {
        // เก็บ brochure เดิมไว้ — saveAcSeries เขียนทับทั้งแถว
        let cur = srsMap[`${g.brand}||${g.series}`];
        if (!cur) { try { cur = await getAcSeries(g.brand, g.series); } catch { /* ไม่มีแถวเดิม */ } }
        await saveAcSeries({ brand: g.brand, name: g.series, features: text, brochure_url: cur?.brochure_url || null });
        setSrsMap((s) => ({ ...s, [`${g.brand}||${g.series}`]: { ...(cur || {}), brand: g.brand, name: g.series, features: text, brochure_url: cur?.brochure_url || null } }));
      }
      setFeatDirty((s) => ({ ...s, [g.key]: false }));
      changedRef.current = true;
      onChanged?.();
      flash(`บันทึกคุณสมบัติ ${g.title} แล้ว ✓`);
    } catch (ex) { setErr(`บันทึกไม่สำเร็จ: ${ex.message || ex}`); }
    setBusy(null);
  }

  const chip = (v, l, n) => (
    <button className={"cat-chip" + (flt === v ? " on" : "")} onClick={() => setFlt(v)}
      style={flt === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>
      {l}{n != null ? ` (${fmtNum(n)})` : ""}
    </button>
  );

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" style={{ maxWidth: 940, width: "min(96vw, 940px)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">🖼️ รูป & คุณสมบัติแอร์ <span>{fmtNum(groups.length)} รุ่น · {fmtNum(rows.length)} รายการ</span></div>
          <button className="drawer-close" onClick={close}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <div style={{ border: "1.5px solid #bae6fd", background: "#f0f9ff", borderRadius: 12, padding: "9px 12px", fontSize: 12.5, color: "#0c4a6e", lineHeight: 1.65, marginBottom: 10 }}>
            <b>กติการูปสินค้า:</b> รูปสินค้าเดี่ยว พื้นสะอาด <b>ไม่มีลายน้ำ/ข้อความ/โลโก้ร้านอื่น</b> (โลโก้ยี่ห้อบนตัวเครื่องได้) · ควรเอาจากเว็บผู้ผลิตโดยตรง เช่น carrier.co.th, daikin.co.th —
            คลิกขวารูปบนเว็บยี่ห้อ → <b>Copy image address</b> → กดปุ่ม <b>🔗 วางลิงก์รูป</b> ระบบจะดาวน์โหลดมาเก็บถาวรในระบบเรา แล้วใส่ให้<b>ทุกขนาดในรุ่น</b>ทีเดียว · การแสดงผลบนเว็บจัดกึ่งกลาง-ไม่ครอปให้อัตโนมัติ
          </div>

          {/* รูป/โบรชัวร์ทางการที่ค้นไว้ให้แล้ว — กดปุ่มเดียวนำเข้าทั้งชุด */}
          {(officialAuto.length > 0 || brochureAuto.length > 0) && (
            <div style={{ border: "1.5px solid #bbf7d0", background: "#f0fdf4", borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, color: "#14532d", lineHeight: 1.6 }}>
                <b>📥 รูป &amp; โบรชัวร์ทางการที่ค้นไว้แล้ว</b> — จากเว็บผู้ผลิตโดยตรง (ตรวจลิงก์ครบทุกตัวแล้ว)
                : รูป <b>{officialAuto.length}</b> รุ่น ({fmtNum(officialAuto.reduce((a, t) => a + t.codes.length, 0))} รายการ) · โบรชัวร์ <b>{officialAuto.filter((t) => t.m.brochure).length + brochureAuto.length}</b> รุ่น
                <br />ระบบจะดาวน์โหลดมา<b>เก็บถาวรในระบบเรา</b> (ไม่ใช่ลิงก์ไปเว็บนอก) แล้วใส่ให้ทุกขนาดในรุ่นอัตโนมัติ
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <button className="btn-primary sm" disabled={!!imp || !!busy} onClick={importOfficialAll}>
                  {imp ? `กำลังนำเข้า ${imp.i}/${imp.n}…` : `📥 นำเข้าทั้งชุด`}
                </button>
                {imp && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{imp.label}</span>}
                {officialTargets.some((t) => t.m.review) && (
                  <span style={{ fontSize: 12, color: "#b45309" }}>
                    ⚠️ {officialTargets.filter((t) => t.m.review).length} รุ่นต้องให้เจ้าของตัดสินใจเอง (ปุ่ม “ใช้รูปที่ค้นไว้” ในรายการ)
                  </span>
                )}
              </div>
              {impLog && (
                <div style={{ marginTop: 8, fontSize: 12.5 }}>
                  <b style={{ color: impLog.errs.length ? "#b45309" : "#15803d" }}>สำเร็จ {impLog.ok}/{impLog.total} รายการ</b>
                  {impLog.errs.length > 0 && <ul style={{ margin: "4px 0 0 16px", color: "var(--down)" }}>{impLog.errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                </div>
              )}
            </div>
          )}

          <div className="cat-filter" style={{ marginBottom: 8 }}>
            {chip("all", "ทั้งหมด", groups.length)}
            {chip("nophoto", "❌ ไม่มีรูป/ไม่ครบ", stats.nophoto)}
            {chip("external", "⚠️ รูปลิงก์เว็บอื่น", stats.external)}
            {chip("nofeat", "📋 ยังไม่มีคุณสมบัติ", stats.nofeat)}
            <select className="inp" style={{ width: "auto", padding: "6px 10px" }} value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="all">ทุกยี่ห้อ</option>
              {brandOpts.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <input className="inp" style={{ width: 180, padding: "6px 10px" }} placeholder="ค้นหารุ่น/รหัส" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {err && <div className="login-err" style={{ marginBottom: 8 }}>{err}</div>}
          {!shown.length && <div className="empty">ไม่พบรุ่นตามตัวกรอง</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((g) => {
              const pb = PHOTO_BADGE[g.pstat];
              const isOpen = open === g.key, working = busy === g.key;
              return (
                <div key={g.key} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", background: "#fff" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    {g.photoUrl
                      ? <img src={g.photoUrl} alt="" title="กดดูรูปใหญ่ (เช็กลายน้ำ/ความคมชัด)"
                          style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", border: "1px solid var(--line)", borderRadius: 10, flex: "none", cursor: "zoom-in" }}
                          onClick={() => { const pics = [...new Set(g.items.map((m) => m.photoUrl || m.photo_url).filter(Boolean))]; if (pics.length) setZoom(pics); }} />
                      : <div style={{ width: 64, height: 64, border: "1px dashed var(--line)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", flex: "none" }}><UIcon name="camera" size={20} /></div>}
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{g.title}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                        {g.single
                          ? <span className="code-chip">{g.items[0].code}</span>
                          : `${g.items.length} ขนาด: ${g.items.map((m) => (m.btu ? fmtNum(m.btu) : m.code)).join(" · ")}`}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        <span className={"job-badge " + pb.cls}>{pb.l}</span>
                        <span className={"job-badge " + ((g.features || "").trim() ? "b-green" : "b-grey")}>{(g.features || "").trim() ? "คุณสมบัติ ✓" : "ไม่มีคุณสมบัติ"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {officialTargets.filter((t) => t.groupKey === g.key).map((t) => (
                        <button key={t.m.img} className="btn-ghost sm" disabled={working || !!imp}
                          style={{ color: "#15803d", borderColor: "#bbf7d0", background: "#f0fdf4" }}
                          title={`ดึงรูปทางการที่ค้นไว้มาใช้${t.m.note ? "\n" + t.m.note : ""}`}
                          onClick={async () => {
                            setBusy(g.key); setErr(null);
                            try { await importOne(t); flash(`ใส่รูปทางการให้ ${t.label} แล้ว ✓`); }
                            catch (ex) { setErr(`${t.label}: ${ex.message || ex}`); }
                            setBusy(null);
                          }}>
                          📥 ใช้รูปที่ค้นไว้{t.m.review ? " ⚠️" : ""}
                        </button>
                      ))}
                      <button className="btn-ghost sm" disabled={working} onClick={() => searchPhoto(g)} title="เปิดค้นรูปในแท็บใหม่ แล้วก็อปลิงก์รูปกลับมาวาง">🔍 หารูป</button>
                      <button className="btn-ghost sm" disabled={working} onClick={() => pullFromLink(g)}>🔗 วางลิงก์รูป</button>
                      <label className="btn-ghost sm" style={{ cursor: working ? "default" : "pointer", opacity: working ? .6 : 1 }}>
                        📤 อัปโหลด
                        <input type="file" accept="image/*" style={{ display: "none" }} disabled={working} onChange={(e) => uploadFile(g, e)} />
                      </label>
                      {g.photoUrl && <button className="btn-ghost sm danger" disabled={working} onClick={() => clearPhoto(g)}>ลบรูป</button>}
                      <button className="btn-ghost sm" onClick={() => setOpen(isOpen ? null : g.key)}>{isOpen ? "ซ่อนคุณสมบัติ ▴" : "คุณสมบัติ ▾"}</button>
                      {working && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>กำลังทำงาน…</span>}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 10, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
                      <textarea className="inp" rows={5} style={{ resize: "vertical", width: "100%" }} value={featVal(g)}
                        placeholder={"• ระบบ Inverter ประหยัดไฟ\n• น้ำยา R32\n• ฟอกอากาศ PM2.5\n• รับประกันคอมเพรสเซอร์ 10 ปี"}
                        onChange={(e) => { setFeat((s) => ({ ...s, [g.key]: e.target.value })); setFeatDirty((s) => ({ ...s, [g.key]: true })); }} />
                      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <button className="btn-ghost sm" disabled={working} onClick={() => aiDraft(g)} title="AI ร่างจากสเปคที่มีในระบบ — ตรวจ/แก้ก่อนบันทึกเสมอ">✨ ให้ AI ร่าง</button>
                        <button className="btn-primary sm" disabled={working || !featDirty[g.key]} onClick={() => saveFeat(g)}>💾 บันทึกคุณสมบัติ</button>
                        {!g.single && <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>ใช้ร่วมกันทุกขนาดในรุ่นนี้ · โชว์บนเว็บ + บอทนำไปตอบได้</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={close}>ปิด</button>
        </div>
        {toast && (
          <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 400, maxWidth: "90%", textAlign: "center" }}>{toast}</div>
        )}
        {zoom && <Lightbox images={zoom} onClose={() => setZoom(null)} />}
      </div>
    </div>
  );
}
