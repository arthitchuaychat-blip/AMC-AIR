import React from "react";
import { UIcon } from "../icons";
import { confirmDialog } from "./ConfirmDialog";
import SignaturePad from "./SignaturePad";
import { saveHandover, uploadSignatureDataUrl, uploadMaterialPhoto, listMaterialsLite } from "../lib/api";
import { PERF_ROWS, PM_ROWS, CLEAN_ROWS, REPAIR_ROWS, WORK_TYPES, AC_TYPES, AC_BRANDS, BTU_SIZES, FORM_KINDS, ADD_KINDS, blankForm, ACCEPT_GROUPS, ACCEPT_ROWS, ACCEPT_OVERALL, blankAcceptMachine,
  REFRIGERANTS, INST_WORKKINDS, INST_SECTIONS, INST_MEAS, WASH_WORKKINDS, WASH_SECTIONS, WASH_MEAS,
  FIX_SYMPTOMS, FIX_DIAG, FIX_REPAIR, FIX_MEAS, FIX_RESULTS, PMC_FREQS, PMC_ACTS, PMC_REF, blankPmcMachine } from "../lib/handover";

// หัวข้อมูลแอร์มาตรฐาน — ทุกแบบฟอร์มใช้ชุดเดียวกัน: รหัส / ประเภท (dropdown) / ยี่ห้อ (datalist) /
// รุ่น / BTU (datalist จากแคตตาล็อก) / อาคาร / ชั้น / ห้อง / Serial · ป้าย 2 ภาษา
function MachineHead({ m = {}, onSet }) {
  return (
    <div className="he-machine">
      <input className="inp sm" placeholder="รหัสประจำเครื่อง · Code" value={m.code || ""} onChange={(e) => onSet("code", e.target.value)} />
      <select className="inp sm" value={m.type || ""} onChange={(e) => onSet("type", e.target.value)}>
        <option value="">ประเภทเครื่อง · Type…</option>
        {m.type && !AC_TYPES.includes(m.type) && <option value={m.type}>{m.type}</option>}
        {AC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input className="inp sm" list="ho-brand-list" placeholder="ยี่ห้อ · Brand" value={m.brand || ""} onChange={(e) => onSet("brand", e.target.value)} />
      <input className="inp sm" placeholder="รุ่น · Model" value={m.model || ""} onChange={(e) => onSet("model", e.target.value)} />
      <input className="inp sm" list="ho-btu-list" placeholder="ขนาด BTU" value={m.btu || ""} onChange={(e) => onSet("btu", e.target.value)} />
      <input className="inp sm" placeholder="Serial No." value={m.serial || ""} onChange={(e) => onSet("serial", e.target.value)} />
      <input className="inp sm" placeholder="อาคาร · Building" value={m.building || ""} onChange={(e) => onSet("building", e.target.value)} />
      <input className="inp sm" placeholder="ชั้น · Floor" value={m.floor || ""} onChange={(e) => onSet("floor", e.target.value)} />
      <input className="inp sm" placeholder="ห้อง · Room" value={m.room || ""} onChange={(e) => onSet("room", e.target.value)} />
    </div>
  );
}

// ตรวจว่าฟอร์มยัง "ว่างเปล่า" (ยังไม่ได้ติ๊ก/กรอกอะไรที่เป็นสาระเลย) — ใช้เตือนก่อนส่ง กันส่งใบเช็คลิสต์เปล่า
function formEmpty(f) {
  const anyChk = (arr) => (arr || []).some((sec) => Array.isArray(sec) ? sec.some(Boolean) : Boolean(sec));
  const anyMeas = (arr) => (arr || []).some((v) => v && (typeof v === "string" ? v.trim() : (v.b || v.a)));
  switch (f.kind) {
    case "inst": return !anyChk(f.checks) && !anyMeas(f.meas);
    case "wash": return !anyChk(f.checks) && !anyMeas(f.meas);
    case "fix": return !anyChk([f.diag, f.rep].flat()) && !(f.symptoms || []).some(Boolean) && !anyMeas(f.meas) && !(f.symptom_detail || f.rootcause);
    case "pmc": return !(f.acts || []).some(Boolean) && !(f.machines || []).some((m) => m.out || m.amp);
    case "accept": return !(f.rows || []).some((r) => (r || []).some(Boolean)) && !(f.overall || []).some(Boolean);
    case "clean": return !(f.acts || []).some(Boolean) && !anyMeas(f.rows);
    case "repair": case "perf": return !anyMeas(f.rows) && !f.fix;
    case "pm": return !(f.rows || []).some(Boolean);
    default: return false;
  }
}

// Full-screen editor where the technician fills in a handover sheet while on the job.
// props: initial (a handover object), me (logged-in name), onClose(), onSaved(saved), flash(msg, bad)
export default function HandoverEditor({ initial, me, onClose, onSaved, flash }) {
  // เติมชื่อช่างจากผู้ที่ล็อกอินให้อัตโนมัติ (ถ้ายังว่าง) — ทำใน baseline เพื่อไม่ให้ถูกนับเป็น "แก้ค้าง" ทันที
  const base = React.useMemo(() => (initial.tech_name || !me || initial.status === "submitted") ? initial : { ...initial, tech_name: me }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [h, setH] = React.useState(base);
  const [busy, setBusy] = React.useState(false);
  // ลายเซ็นช่างล่าสุดบนเครื่องนี้ (จำไว้หลังส่งใบ) — ให้กด "ใช้ลายเซ็นเดิม" ไม่ต้องวาดใหม่ทุกครั้ง
  const [lastSig] = React.useState(() => { try { return localStorage.getItem("amc_tech_sign") || ""; } catch { return ""; } });
  const wasSubmitted = initial.status === "submitted";   // ใบที่ส่งแล้ว: บันทึกซ้ำได้ แต่ห้ามหล่นกลับเป็นฉบับร่าง (ช่างจะกลับมาแก้/ลบได้)
  // กันงานกรอกหน้างานหาย: (1) สแนปช็อตลง localStorage ทุก 1 วิ — แบตหมด/เบราว์เซอร์รีโหลดหลังเปิดกล้อง กลับมากู้ได้
  // (2) แตะฉากหลัง/กด ✕ ตอนมีของค้าง ให้ถามก่อนปิด
  const draftKey = `ho-draft-${initial.id || initial.job_no || "new"}`;
  const dirty = React.useMemo(() => JSON.stringify(h) !== JSON.stringify(base), [h, base]);
  React.useEffect(() => {
    if (!dirty) return;
    const tm = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(h)); } catch { /* เต็ม/ปิดใช้ — ข้าม */ } }, 1000);
    return () => clearTimeout(tm);
  }, [h, dirty, draftKey]);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (JSON.stringify(saved) === JSON.stringify(base)) { localStorage.removeItem(draftKey); return; }
      (async () => { if (await confirmDialog("พบข้อมูลที่กรอกค้างไว้ของใบนี้ (ยังไม่ได้บันทึก) — กู้กลับมาไหม?")) { setH(saved); setAddOpen(false); } else localStorage.removeItem(draftKey); })();
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };
  async function safeClose() {
    if (dirty && !await confirmDialog("มีข้อมูลที่ยังไม่ได้บันทึก — ปิดโดยไม่บันทึก?\n(ข้อมูลที่กรอกจะถูกเก็บไว้กู้คืนได้ตอนเปิดใบนี้ครั้งหน้า)")) return;
    onClose();
  }
  // ใบใหม่ยังไม่มีแบบฟอร์ม → เด้งตัวเลือกแบบฟอร์ม (ติดตั้ง/ล้าง/ซ่อม/PM) ให้เลือกก่อนเลย
  const [addOpen, setAddOpen] = React.useState(!(initial.forms && initial.forms.length));
  // ขนาด BTU อ้างอิงจากสินค้าแอร์จริงในแคตตาล็อก (โหลดไม่ได้ → ใช้ชุดมาตรฐาน)
  const [btuList, setBtuList] = React.useState(BTU_SIZES);
  React.useEffect(() => {
    listMaterialsLite().then((m) => {
      const s = [...new Set(m.filter((x) => x.kind === "ac" && x.btu).map((x) => String(x.btu)))].sort((a, b) => a - b);
      if (s.length) setBtuList(s);
    }).catch(() => {});
  }, []);
  const set = (k, v) => setH((s) => ({ ...s, [k]: v }));

  const toggleWork = (v) => setH((s) => ({ ...s, work_types: s.work_types.includes(v) ? s.work_types.filter((x) => x !== v) : [...s.work_types, v] }));

  // ---- forms ----
  const updateForm = (i, patch) => setH((s) => ({ ...s, forms: s.forms.map((f, j) => j === i ? { ...f, ...patch } : f) }));
  const updateMachine = (i, k, v) => setH((s) => ({ ...s, forms: s.forms.map((f, j) => j === i ? { ...f, machine: { ...f.machine, [k]: v } } : f) }));
  const updateRow = (i, ri, val) => setH((s) => ({ ...s, forms: s.forms.map((f, j) => j === i ? { ...f, rows: f.rows.map((r, k) => k === ri ? val : r) } : f) }));
  const addForm = (kind) => { setH((s) => ({ ...s, forms: [...s.forms, blankForm(kind)] })); setAddOpen(false); };
  const removeForm = async (i) => { if (!await confirmDialog("ลบแบบฟอร์มนี้?")) return; setH((s) => ({ ...s, forms: s.forms.filter((_, j) => j !== i) })); };

  async function persist(status) {
    // ก่อน "บันทึก & ส่ง" (ครั้งแรก): เตือนเมื่อยังไม่มีแบบฟอร์ม/ลายเซ็นลูกค้า — กันมือลั่นส่งใบเปล่า (ส่งได้ถ้าตั้งใจ เช่น ลูกค้าไม่สะดวกเซ็น)
    if (status === "submitted" && !wasSubmitted) {
      const miss = [];
      if (!(h.forms || []).length) miss.push("ยังไม่มีแบบฟอร์มสักแผ่น");
      // เตือนฟอร์มที่ยังไม่ได้ติ๊ก/กรอกเช็คลิสต์เลย (กันส่งใบเปล่า — ส่งต่อได้ถ้าตั้งใจ)
      const blanks = (h.forms || []).map((f, i) => formEmpty(f) ? i + 1 : 0).filter(Boolean);
      if (blanks.length) miss.push(`ฟอร์มที่ยังไม่ได้ติ๊ก/กรอกเลย: #${blanks.join(", #")}`);
      if (!h.cust_sign_url) miss.push("ยังไม่มีลายเซ็นลูกค้า");
      if (!h.tech_sign_url) miss.push("ยังไม่มีลายเซ็นช่าง");
      const msg = miss.length
        ? `⚠️ ตรวจก่อนส่ง:\n• ${miss.join("\n• ")}\n\nยืนยันส่งใบส่งมอบงานเลยหรือไม่?`
        : "ยืนยันส่งใบส่งมอบงาน? (ส่งแล้วช่างแก้ไขเองไม่ได้ — ต้องให้ออฟฟิศแก้)";
      if (!await confirmDialog(msg)) return;
    }
    setBusy(true);
    try {
      const out = { ...h, status };
      // upload freshly-drawn signatures (data URLs) → public URLs
      if (out.tech_sign_url && out.tech_sign_url.startsWith("data:")) out.tech_sign_url = await uploadSignatureDataUrl(out.tech_sign_url);
      if (out.cust_sign_url && out.cust_sign_url.startsWith("data:")) out.cust_sign_url = await uploadSignatureDataUrl(out.cust_sign_url);
      const saved = await saveHandover(out);
      // จำลายเซ็นช่างล่าสุดบนเครื่องนี้ (เป็น URL แล้ว) → ครั้งหน้ากด "ใช้ลายเซ็นเดิม" ได้เลย
      if (out.tech_sign_url && !out.tech_sign_url.startsWith("data:")) { try { localStorage.setItem("amc_tech_sign", out.tech_sign_url); } catch { /* ignore */ } }
      clearDraft();
      flash && flash(status === "submitted" ? (wasSubmitted ? "บันทึกแล้ว ✓" : "บันทึก & ส่งใบส่งมอบงานแล้ว ✓") : "บันทึกฉบับร่างแล้ว ✓");
      onSaved && onSaved(saved);
    } catch (e) { flash && flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={safeClose}>
      <div className="modal he" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "97vw" }}>
        <div className="modal-head">
          <div className="modal-title">ใบส่งมอบงาน {wasSubmitted ? <span>· ส่งแล้ว (แก้ไข)</span> : h.id && h.status === "draft" ? <span>· ฉบับร่าง (กรอกต่อ)</span> : h.job_no ? <span>· ผูกกับ {h.job_no}</span> : <span>· ไม่ผูกใบงาน</span>}</div>
          <button className="drawer-close" onClick={safeClose}><UIcon name="x" size={20} /></button>
        </div>

        <div className="modal-body he-body">
          {/* datalist กลาง — ช่องยี่ห้อ/BTU ของทุกแบบฟอร์มชี้มาที่นี่ (เลือกจากรายการ หรือพิมพ์เองได้) */}
          <datalist id="ho-brand-list">{AC_BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
          <datalist id="ho-btu-list">{btuList.map((b) => <option key={b} value={b} />)}</datalist>
          <div className="he-hint">📋 กรอกเช็คลิสต์ + ค่าที่วัด + รูป แล้วให้ลูกค้าเซ็น กด <b>บันทึก &amp; ส่ง</b> · งานล้าง/ซ่อมที่วัด “ก่อน–หลัง”: กรอกช่อง “ก่อน” แล้ว <b>บันทึกร่าง</b> ระหว่างทำ ค่อยกลับมากรอก “หลัง” ตอนเสร็จ</div>
          {/* ── ผู้รับบริการ ── */}
          <div className="he-sec-t">ผู้รับบริการ · Customer</div>
          <div className="he-grid2">
            <label className="he-f"><span>บริษัท / ชื่อ-สกุล · Company / Name</span><input className="inp" value={h.customer_name || ""} onChange={(e) => set("customer_name", e.target.value)} /></label>
            <label className="he-f"><span>ผู้ติดต่อ · Contact person</span><input className="inp" value={h.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} /></label>
            <label className="he-f"><span>เบอร์โทร · Phone</span><input className="inp" value={h.contact_phone || ""} onChange={(e) => set("contact_phone", e.target.value)} /></label>
            <label className="he-f"><span>เอกสารอ้างอิง · Reference</span><input className="inp" value={h.doc_ref || ""} onChange={(e) => set("doc_ref", e.target.value)} /></label>
            <label className="he-f he-f-wide"><span>ที่อยู่ · Address</span><input className="inp" value={h.address || ""} onChange={(e) => set("address", e.target.value)} /></label>
            <label className="he-f"><span>วันที่ · Date</span><input type="date" className="inp" value={h.doc_date || ""} onChange={(e) => set("doc_date", e.target.value)} /></label>
          </div>

          {/* ── ประเภทงาน ── */}
          <div className="he-sec-t">ประเภทงาน · Work Type</div>
          <div className="he-chips">
            {WORK_TYPES.map(([v, l]) => (
              <button key={v} type="button" className={"he-chip" + (h.work_types.includes(v) ? " on" : "")} onClick={() => toggleWork(v)}>{l}</button>
            ))}
          </div>

          <label className="he-f he-f-wide"><span>รายละเอียด / อาการเสีย / การสำรวจหน้างาน · Details / Symptoms / Survey</span>
            <textarea className="inp" rows={2} value={h.detail || ""} onChange={(e) => set("detail", e.target.value)} /></label>

          {/* ── แบบฟอร์มย่อย ── */}
          <div className="he-sec-t">แบบฟอร์ม · Forms ({h.forms.length})
            <button type="button" className="btn-primary sm" style={{ marginLeft: "auto" }} onClick={() => setAddOpen(true)}><UIcon name="plus" size={14} color="#fff" /> เพิ่มแบบฟอร์ม</button>
          </div>
          {h.forms.length === 0 && <div className="he-empty">ยังไม่มีแบบฟอร์ม — กด “เพิ่มแบบฟอร์ม” เพื่อเริ่มบันทึกเครื่องแรก</div>}
          {h.forms.map((f, i) => (
            <FormCard key={i} f={f} idx={i} onMachine={updateMachine} onRow={updateRow} onNote={(v) => updateForm(i, { note: v })} onPatch={(patch) => updateForm(i, patch)} onRemove={() => removeForm(i)} />
          ))}

          {/* ── การแก้ไข/หมายเหตุ ── */}
          <label className="he-f he-f-wide"><span>การแก้ไข / หมายเหตุอื่น ๆ · Remarks</span>
            <textarea className="inp" rows={2} value={h.fix_note || ""} onChange={(e) => set("fix_note", e.target.value)} /></label>

          {/* ── ลายเซ็น ── */}
          <div className="he-sec-t">ลายเซ็น · Signatures</div>
          <div className="he-signs">
            <div className="he-sign-col">
              <SignaturePad label="ลายเซ็นช่างผู้ให้บริการ · Technician" value={h.tech_sign_url} onChange={(d) => set("tech_sign_url", d)} />
              {lastSig && !h.tech_sign_url && <button type="button" className="btn-ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => set("tech_sign_url", lastSig)}>↩ ใช้ลายเซ็นเดิม</button>}
              <input className="inp" placeholder="ชื่อช่าง · Technician name" value={h.tech_name || ""} onChange={(e) => set("tech_name", e.target.value)} />
            </div>
            <div className="he-sign-col">
              <SignaturePad label={h.forms.some((f) => f.kind === "accept") ? "ลายเซ็นผู้ตรวจสอบ/ผู้รับมอบงาน · Inspector / Receiver" : "ลายเซ็นผู้รับบริการ (ลูกค้า) · Customer"} value={h.cust_sign_url} onChange={(d) => set("cust_sign_url", d)} />
              <input className="inp" placeholder={h.forms.some((f) => f.kind === "accept") ? "ชื่อผู้ตรวจสอบ/ผู้รับมอบงาน · Inspector name" : "ชื่อผู้รับบริการ · Customer name"} value={h.cust_name || ""} onChange={(e) => set("cust_name", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          {/* ใบที่ส่งแล้ว: เหลือปุ่ม "บันทึก" เดียว (คงสถานะส่งแล้ว) — กันกดผิดหล่นกลับเป็นร่างให้ช่างแก้/ลบได้อีก */}
          {!wasSubmitted && <button className="btn-ghost" disabled={busy} onClick={() => persist("draft")}>{busy ? "กำลังบันทึก…" : "บันทึกร่าง"}</button>}
          <button className="btn-primary" disabled={busy} onClick={() => persist("submitted")}><UIcon name="check" size={15} color="#fff" /> {wasSubmitted ? "บันทึก" : "บันทึก & ส่ง"}</button>
        </div>

        {addOpen && (
          <div className="confirm-overlay" onMouseDown={() => setAddOpen(false)}>
            <div className="confirm-box" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
              <div className="confirm-title">เพิ่มแบบฟอร์ม</div>
              <div className="he-add-list">
                {FORM_KINDS.filter((k) => ADD_KINDS.includes(k.kind)).map((k) => (
                  <button key={k.kind} className="he-add-opt" onClick={() => addForm(k.kind)}>
                    <span className="he-add-ic">{k.icon}</span>
                    <span><b>{k.label}</b><small>{k.hint}</small></span>
                  </button>
                ))}
              </div>
              <button className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setAddOpen(false)}>ยกเลิก</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ตารางเช็คลิสต์ตามเอกสาร: หมวด → [รายการ | เกณฑ์ | ผ่าน | ไม่ผ่าน] · values[si][ri] = 'pass'|'fail'|null
function ChecksTable({ sections, values, onChange, passLabel = "ผ่าน · Pass", failLabel = "ไม่ผ่าน · Fail" }) {
  const setV = (si, ri, v) => onChange(values.map((sec, i) => (i === si ? sec.map((x, j) => (j === ri ? (x === v ? null : v) : x)) : sec)));
  return sections.map(([title, rows], si) => (
    <React.Fragment key={si}>
      <div style={{ fontWeight: 700, fontSize: 12.5, margin: "8px 0 2px", color: "#1d4ed8" }}>{title}</div>
      <table className="he-tbl">
        <thead><tr><th className="n">#</th><th>รายการตรวจสอบ / ขั้นตอน · Checklist item</th><th style={{ width: 120 }}>เกณฑ์ · Standard</th><th className="pmh">{passLabel}</th><th className="pmh">{failLabel}</th></tr></thead>
        <tbody>
          {rows.map(([label, std], ri) => { const v = (values[si] || [])[ri]; return (
            <tr key={ri}>
              <td className="n">{ri + 1}</td>
              <td className="lbl">{label}</td>
              <td className="lbl" style={{ fontSize: 11, color: "var(--ink-3)" }}>{std}</td>
              <td className="pmc"><button type="button" className={"he-pm" + (v === "pass" ? " on" : "")} onClick={() => setV(si, ri, "pass")}>✓</button></td>
              <td className="pmc"><button type="button" className={"he-pm" + (v === "fail" ? " no" : "")} onClick={() => setV(si, ri, "fail")}>✕</button></td>
            </tr>
          ); })}
        </tbody>
      </table>
    </React.Fragment>
  ));
}

// ── ตารางค่าที่วัด: [ค่าที่วัด | หน่วย | ค่ามาตรฐาน | ค่าที่วัดได้ (เดี่ยว หรือ ก่อน/หลัง)]
function MeasTable({ title, rows, values, onChange, beforeAfter, lb = "ก่อน · Before", la = "หลัง · After" }) {
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 12.5, margin: "8px 0 2px", color: "#1d4ed8" }}>{title}</div>
      <table className="he-tbl">
        <thead><tr><th>ค่าที่วัด · Measurement</th><th style={{ width: 46 }}>หน่วย · Unit</th><th style={{ width: 130 }}>ค่ามาตรฐาน · Standard</th>
          {beforeAfter ? <><th style={{ width: 80 }}>{lb}</th><th style={{ width: 80 }}>{la}</th></> : <th style={{ width: 110 }}>ค่าที่วัดได้ · Measured</th>}</tr></thead>
        <tbody>
          {rows.map(([label, unit, std], ri) => { const v = values[ri]; return (
            <tr key={ri}>
              <td className="lbl">{label}</td>
              <td className="lbl" style={{ textAlign: "center" }}>{unit}</td>
              <td className="lbl" style={{ fontSize: 11, color: "var(--ink-3)" }}>{std}</td>
              {beforeAfter ? <>
                <td><input className="inp sm" value={(v || {}).b || ""} onChange={(e) => onChange(values.map((x, j) => j === ri ? { ...x, b: e.target.value } : x))} /></td>
                <td><input className="inp sm" value={(v || {}).a || ""} onChange={(e) => onChange(values.map((x, j) => j === ri ? { ...x, a: e.target.value } : x))} /></td>
              </> : <td><input className="inp sm" value={v || ""} onChange={(e) => onChange(values.map((x, j) => j === ri ? e.target.value : x))} /></td>}
            </tr>
          ); })}
        </tbody>
      </table>
    </>
  );
}

// ── ชิปเลือกค่าเดียว (ประเภทงานย่อย / น้ำยา / ผลการซ่อม ฯลฯ)
function PickChips({ label, options, value, onChange }) {
  return (
    <div style={{ margin: "6px 0" }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {options.map((o) => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return (
          <button key={v} type="button" className={"he-chip" + (value === v ? " on" : "")} onClick={() => onChange(value === v ? "" : v)}>{l}</button>
        ); })}
      </div>
    </div>
  );
}

// one sub-form card (perf / pm / accept) with its machine fields + rows + note
function FormCard({ f, idx, onMachine, onRow, onNote, onPatch, onRemove }) {
  const meta = FORM_KINDS.find((k) => k.kind === f.kind) || FORM_KINDS[0];
  if (f.kind === "accept") return <AcceptCard f={f} idx={idx} meta={meta} onPatch={onPatch} onNote={onNote} onRemove={onRemove} />;
  if (f.kind === "inst") return <InstCard f={f} idx={idx} meta={meta} onMachine={onMachine} onPatch={onPatch} onNote={onNote} onRemove={onRemove} />;
  if (f.kind === "wash") return <WashCard f={f} idx={idx} meta={meta} onMachine={onMachine} onPatch={onPatch} onNote={onNote} onRemove={onRemove} />;
  if (f.kind === "fix") return <FixCard f={f} idx={idx} meta={meta} onMachine={onMachine} onPatch={onPatch} onNote={onNote} onRemove={onRemove} />;
  if (f.kind === "pmc") return <PmcCard f={f} idx={idx} meta={meta} onPatch={onPatch} onNote={onNote} onRemove={onRemove} />;
  const m = f.machine || {};
  return (
    <div className="he-form">
      <div className="he-form-h">
        <span className="he-form-badge">{meta.icon} {meta.label}</span>
        <span className="he-form-no">#{idx + 1}</span>
        <button type="button" className="he-form-x" onClick={onRemove}><UIcon name="trash" size={14} /></button>
      </div>

      {/* machine identity — หัวข้อมูลแอร์มาตรฐาน ชุดเดียวกันทุกแบบฟอร์ม */}
      <MachineHead m={m} onSet={(k, v) => onMachine(idx, k, v)} />

      {/* งานล้าง: ตาราง "สิ่งที่ดำเนินการ" (15 ข้อ) ก่อนตารางวัดก่อน/หลัง */}
      {f.kind === "clean" && (
        <>
          <div style={{ fontWeight: 700, fontSize: 12.5, margin: "6px 0 2px" }}>สิ่งที่ดำเนินการ (ล้าง / PM) · Work performed</div>
          <table className="he-tbl">
            <thead><tr><th className="n">#</th><th>รายการ · Item</th><th className="pmh">ได้ทำ · Done</th><th className="pmh">ไม่ได้ทำ · Not</th></tr></thead>
            <tbody>
              {PM_ROWS.map((label, ri) => { const v = (f.acts || [])[ri]; return (
                <tr key={ri}>
                  <td className="n">{ri + 1}</td>
                  <td className="lbl">{label}</td>
                  <td className="pmc"><button type="button" className={"he-pm" + (v === "done" ? " on" : "")} onClick={() => onPatch({ acts: (f.acts || PM_ROWS.map(() => null)).map((x, i) => i === ri ? (v === "done" ? null : "done") : x) })}>✓</button></td>
                  <td className="pmc"><button type="button" className={"he-pm" + (v === "not" ? " no" : "")} onClick={() => onPatch({ acts: (f.acts || PM_ROWS.map(() => null)).map((x, i) => i === ri ? (v === "not" ? null : "not") : x) })}>✕</button></td>
                </tr>
              ); })}
            </tbody>
          </table>
          <div style={{ fontWeight: 700, fontSize: 12.5, margin: "8px 0 2px" }}>วัดผล ก่อนล้าง / หลังล้าง · Measurements before / after cleaning</div>
        </>
      )}

      {f.kind === "pm" ? (
        <table className="he-tbl">
          <thead><tr><th className="n">#</th><th>รายการ · Item</th><th className="pmh">ได้ทำ · Done</th><th className="pmh">ไม่ได้ทำ · Not</th></tr></thead>
          <tbody>
            {PM_ROWS.map((label, ri) => {
              const v = f.rows[ri];
              return (
                <tr key={ri}>
                  <td className="n">{ri + 1}</td>
                  <td className="lbl">{label}</td>
                  <td className="pmc"><button type="button" className={"he-pm" + (v === "done" ? " on" : "")} onClick={() => onRow(idx, ri, v === "done" ? null : "done")}>✓</button></td>
                  <td className="pmc"><button type="button" className={"he-pm" + (v === "not" ? " no" : "")} onClick={() => onRow(idx, ri, v === "not" ? null : "not")}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        (() => {
          // ตารางวัด ก่อน/หลัง — ใช้ร่วม 3 ชนิด: perf (เดิม) / clean (ล้าง) / repair (ซ่อม)
          const BA = f.kind === "clean" ? CLEAN_ROWS : f.kind === "repair" ? REPAIR_ROWS : PERF_ROWS;
          const [lb, la] = f.kind === "clean" ? ["ก่อนล้าง · Before", "หลังล้าง · After"] : f.kind === "repair" ? ["ก่อนซ่อม · Before", "หลังซ่อม · After"] : ["ก่อน · Before", "หลัง · After"];
          return (
            <table className="he-tbl">
              <thead><tr><th className="n">#</th><th>รายการ · Item</th><th>{lb}</th><th>{la}</th></tr></thead>
              <tbody>
                {BA.map(([label, kind], ri) => {
                  const v = f.rows[ri] || { b: "", a: "" };
                  return (
                    <tr key={ri}>
                      <td className="n">{ri + 1}</td>
                      <td className="lbl">{label}</td>
                      {["b", "a"].map((side) => (
                        <td key={side}>
                          {kind === "ck"
                            ? <span className="he-ck">
                                <button type="button" className={"he-ck-b" + (v[side] === "ok" ? " ok" : "")} title="ปกติ · Normal" onClick={() => onRow(idx, ri, { ...v, [side]: v[side] === "ok" ? "" : "ok" })}>ปกติ</button>
                                <button type="button" className={"he-ck-b" + (v[side] === "bad" ? " bad" : "")} title="ไม่ปกติ · Abnormal" onClick={() => onRow(idx, ri, { ...v, [side]: v[side] === "bad" ? "" : "bad" })}>ไม่ปกติ</button>
                              </span>
                            : <span className="he-unit"><input className="inp sm" value={v[side] || ""} onChange={(e) => onRow(idx, ri, { ...v, [side]: e.target.value })} /><small>{kind}</small></span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()
      )}

      {f.kind === "repair" && (
        <label className="he-f he-f-wide" style={{ marginTop: 6 }}><span>สิ่งที่ตรวจพบ / สิ่งที่ซ่อม / อะไหล่ที่เปลี่ยน · Findings / repairs / parts replaced</span>
          <textarea className="inp" rows={2} value={f.fix || ""} onChange={(e) => onPatch({ fix: e.target.value })} /></label>
      )}

      {(f.kind === "clean" || f.kind === "repair") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <PhotoPicker label={`รูปก่อน${f.kind === "clean" ? "ล้าง" : "ซ่อม"} · Before (สูงสุด 4)`} urls={f.photosBefore || []} max={4} onChange={(urls) => onPatch({ photosBefore: urls })} />
          <PhotoPicker label={`รูปหลัง${f.kind === "clean" ? "ล้าง" : "ซ่อม"} · After (สูงสุด 4)`} urls={f.photosAfter || []} max={4} onChange={(urls) => onPatch({ photosAfter: urls })} />
        </div>
      )}

      <input className="inp sm" placeholder="หมายเหตุของแบบฟอร์มนี้ · Note" value={f.note || ""} onChange={(e) => onNote(e.target.value)} style={{ marginTop: 6 }} />
    </div>
  );
}

// ตรวจรับงานรวม (หลายเครื่อง) — ตารางเครื่อง + เมทริกซ์ติ๊ก ✓/✕ รายเครื่องต่อข้อ + ความเรียบร้อยรวม
function AcceptCard({ f, idx, meta, onPatch, onNote, onRemove }) {
  const machines = f.machines || [];
  const n = machines.length;
  const setMachine = (mi, k, v) => onPatch({ machines: machines.map((m, j) => (j === mi ? { ...m, [k]: v } : m)) });
  const addMachine = () => onPatch({ machines: [...machines, blankAcceptMachine()], rows: f.rows.map((r) => [...r, null]) });
  const rmMachine = (mi) => { if (n <= 1) return; onPatch({ machines: machines.filter((_, j) => j !== mi), rows: f.rows.map((r) => r.filter((_, j) => j !== mi)) }); };
  // กดวน: ว่าง → ✓ ผ่าน → ✕ ไม่ผ่าน → ว่าง
  const cycle = (ri, mi) => { const cur = f.rows[ri]?.[mi]; const nxt = !cur ? "pass" : cur === "pass" ? "fail" : null; onPatch({ rows: f.rows.map((r, i) => (i === ri ? r.map((v, j) => (j === mi ? nxt : v)) : r)) }); };
  const allPass = (mi) => onPatch({ rows: f.rows.map((r) => r.map((v, j) => (j === mi ? "pass" : v))) });
  const setItemNote = (ri, v) => onPatch({ itemNotes: (f.itemNotes || ACCEPT_ROWS.map(() => "")).map((x, i) => (i === ri ? v : x)) });
  const toggleOverall = (oi) => onPatch({ overall: (f.overall || ACCEPT_OVERALL.map(() => false)).map((v, j) => (j === oi ? !v : v)) });
  // สรุป: เครื่องที่ติ๊กผ่านครบทุกข้อ / เครื่องที่มีข้อไม่ผ่าน
  const passCnt = machines.filter((_, mi) => f.rows.every((r) => r[mi] === "pass")).length;
  const failCnt = machines.filter((_, mi) => f.rows.some((r) => r[mi] === "fail")).length;
  let gi = 0; // running item index across groups

  return (
    <div className="he-form">
      <div className="he-form-h">
        <span className="he-form-badge">{meta.icon} {meta.label}</span>
        <span className="he-form-no">#{idx + 1}</span>
        <button type="button" className="he-form-x" onClick={onRemove}><UIcon name="trash" size={14} /></button>
      </div>

      <div style={{ fontWeight: 700, fontSize: 12.5, margin: "6px 0 4px" }}>รายการเครื่องที่ติดตั้ง · Installed units ({n})
        <button type="button" className="btn-ghost sm" style={{ marginLeft: 8 }} onClick={addMachine}>＋ เพิ่มเครื่อง · Add unit</button>
      </div>
      {machines.map((m, mi) => (
        <div key={mi} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ width: 22, textAlign: "center", fontWeight: 700, color: "var(--ink-3)", flex: "none" }}>{mi + 1}</span>
          <input className="inp sm" style={{ flex: "1 1 120px" }} placeholder="จุดติดตั้ง · Location" value={m.point || ""} onChange={(e) => setMachine(mi, "point", e.target.value)} />
          <input className="inp sm" style={{ flex: "0 1 95px" }} placeholder="รหัส · Code" value={m.code || ""} onChange={(e) => setMachine(mi, "code", e.target.value)} />
          <select className="inp sm" style={{ flex: "1 1 120px" }} value={m.type || ""} onChange={(e) => setMachine(mi, "type", e.target.value)}>
            <option value="">ประเภท · Type…</option>
            {m.type && !AC_TYPES.includes(m.type) && <option value={m.type}>{m.type}</option>}
            {AC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="inp sm" list="ho-brand-list" style={{ flex: "1 1 90px" }} placeholder="ยี่ห้อ · Brand" value={m.brand || ""} onChange={(e) => setMachine(mi, "brand", e.target.value)} />
          <input className="inp sm" style={{ flex: "1 1 100px" }} placeholder="รุ่น · Model" value={m.model || ""} onChange={(e) => setMachine(mi, "model", e.target.value)} />
          <input className="inp sm" list="ho-btu-list" style={{ flex: "0 1 80px" }} placeholder="BTU" value={m.btu || ""} onChange={(e) => setMachine(mi, "btu", e.target.value)} />
          <input className="inp sm" style={{ flex: "1 1 95px" }} placeholder="Serial" value={m.serial || ""} onChange={(e) => setMachine(mi, "serial", e.target.value)} />
          {n > 1 && <button type="button" className="he-form-x" onClick={() => rmMachine(mi)}><UIcon name="x" size={13} /></button>}
        </div>
      ))}

      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table className="he-tbl" style={{ minWidth: n > 3 ? 480 + n * 52 : undefined }}>
          <thead>
            <tr><th>รายการตรวจ · Inspection item — กดช่องเพื่อติ๊ก ✓ ผ่าน Pass / ✕ ไม่ผ่าน Fail</th>
              {machines.map((_, mi) => <th key={mi} style={{ width: 52, textAlign: "center" }}>{mi + 1}<br />
                <button type="button" className="btn-ghost sm" style={{ padding: "1px 6px", fontSize: 10.5 }} title={`ติ๊กผ่านทุกข้อ เครื่อง ${mi + 1}`} onClick={() => allPass(mi)}>✓ทั้งคอลัมน์</button></th>)}
            </tr>
          </thead>
          <tbody>
            {ACCEPT_GROUPS.map(([gname, rows]) => (
              <React.Fragment key={gname}>
                <tr><td colSpan={n + 1} style={{ background: "#eff6ff", color: "#1d4ed8", fontWeight: 700, fontSize: 11.5, padding: "4px 8px" }}>{gname}</td></tr>
                {rows.map((label) => { const ri = gi++; const hasFail = (f.rows[ri] || []).some((v) => v === "fail"); return (
                  <React.Fragment key={ri}>
                    <tr>
                      <td className="lbl">{label}</td>
                      {machines.map((_, mi) => { const v = f.rows[ri]?.[mi]; return (
                        <td key={mi} style={{ textAlign: "center", padding: 2 }}>
                          <button type="button" className={"he-pm" + (v === "pass" ? " on" : v === "fail" ? " no" : "")} onClick={() => cycle(ri, mi)}>{v === "pass" ? "✓" : v === "fail" ? "✕" : "–"}</button>
                        </td>
                      ); })}
                    </tr>
                    {hasFail && <tr><td colSpan={n + 1} style={{ padding: "2px 8px 6px" }}>
                      <input className="inp sm" style={{ borderColor: "#fca5a5" }} placeholder="หมายเหตุข้อนี้ (เครื่องไหนไม่ผ่าน เพราะอะไร / นัดแก้ไขเมื่อไหร่)" value={(f.itemNotes || [])[ri] || ""} onChange={(e) => setItemNote(ri, e.target.value)} />
                    </td></tr>}
                  </React.Fragment>
                ); })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 700, fontSize: 12.5, margin: "10px 0 4px" }}>ความเรียบร้อยรวมทั้งงาน · Overall completion</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {ACCEPT_OVERALL.map((label, oi) => { const on = (f.overall || [])[oi]; return (
          <button key={oi} type="button" onClick={() => toggleOverall(oi)}
            style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "6px 10px", borderRadius: 8, border: "1px solid " + (on ? "#86efac" : "var(--line-2)"), background: on ? "#f0fdf4" : "#fff", color: on ? "#0a6b3d" : "var(--ink-2)", fontSize: 12.5, cursor: "pointer" }}>
            <span style={{ fontWeight: 800 }}>{on ? "✓" : "○"}</span>{label}
          </button>
        ); })}
      </div>

      <div style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: failCnt ? "#fef2f2" : "#f0fdf4", color: failCnt ? "#b91c1c" : "#0a6b3d" }}>
        สรุป: ผ่านครบ {passCnt}/{n} เครื่อง{failCnt ? ` · มีข้อไม่ผ่าน ${failCnt} เครื่อง (ดูหมายเหตุ)` : ""}
      </div>

      <div style={{ marginTop: 8 }}>
        <PhotoPicker label="รูปส่งมอบงาน · Handover photos (ไม่จำกัดจำนวน)" urls={f.photos || []} onChange={(urls) => onPatch({ photos: urls })} />
      </div>

      <input className="inp sm" placeholder="หมายเหตุของแบบฟอร์มนี้ · Note" value={f.note || ""} onChange={(e) => onNote(e.target.value)} style={{ marginTop: 6 }} />
    </div>
  );
}

// เปลือกการ์ดฟอร์มใหม่ — หัว badge + ปุ่มลบ + หมายเหตุท้ายฟอร์ม ใช้ร่วม 4 ชนิด
function NewFormShell({ meta, idx, onRemove, onNote, note, children }) {
  return (
    <div className="he-form">
      <div className="he-form-h">
        <span className="he-form-badge">{meta.icon} {meta.label}</span>
        <span className="he-form-no">#{idx + 1}</span>
        <button type="button" className="he-form-x" onClick={onRemove}><UIcon name="trash" size={14} /></button>
      </div>
      {children}
      <input className="inp sm" placeholder="หมายเหตุของแบบฟอร์มนี้ · Note" value={note || ""} onChange={(e) => onNote(e.target.value)} style={{ marginTop: 6 }} />
    </div>
  );
}

// ── เช็คลิสต์ติดตั้ง (AMC-IN) ──
function InstCard({ f, idx, meta, onMachine, onPatch, onNote, onRemove }) {
  return (
    <NewFormShell meta={meta} idx={idx} onRemove={onRemove} onNote={onNote} note={f.note}>
      <MachineHead m={f.machine || {}} onSet={(k, v) => onMachine(idx, k, v)} />
      <div className="he-machine">
        <input className="inp sm" placeholder="S/N คอยล์ร้อน · Outdoor S/N" value={f.serial_out || ""} onChange={(e) => onPatch({ serial_out: e.target.value })} />
        <input className="inp sm" placeholder="ขนาดท่อ (หุน) เล็ก/ใหญ่ · Pipe size" value={f.pipe_size || ""} onChange={(e) => onPatch({ pipe_size: e.target.value })} />
        <input className="inp sm" placeholder="ความยาวท่อที่เดิน (ม.) · Pipe length (m)" value={f.pipe_len || ""} onChange={(e) => onPatch({ pipe_len: e.target.value })} />
      </div>
      <PickChips label="ประเภทงาน · Job type" options={INST_WORKKINDS} value={f.work_kind || ""} onChange={(v) => onPatch({ work_kind: v })} />
      <PickChips label="น้ำยา · Refrigerant" options={REFRIGERANTS} value={f.refrigerant || ""} onChange={(v) => onPatch({ refrigerant: v })} />
      <ChecksTable sections={INST_SECTIONS} values={f.checks || []} onChange={(v) => onPatch({ checks: v })} />
      <MeasTable title="ค่าที่ต้องวัดและบันทึก (รับประกันคุณภาพติดตั้ง) · Measurements" rows={INST_MEAS} values={f.meas || []} onChange={(v) => onPatch({ meas: v })} />
      <div className="he-grid2" style={{ marginTop: 6 }}>
        <label className="he-f"><span>รับประกันงานติดตั้ง · Installation warranty</span><input className="inp sm" value={f.warranty_install || ""} onChange={(e) => onPatch({ warranty_install: e.target.value })} placeholder="เช่น 1 ปี · e.g. 1 year" /></label>
        <label className="he-f"><span>รับประกันคอมเพรสเซอร์ · Compressor warranty</span><input className="inp sm" value={f.warranty_comp || ""} onChange={(e) => onPatch({ warranty_comp: e.target.value })} placeholder="เช่น 5 ปี · e.g. 5 years" /></label>
      </div>
      <div style={{ marginTop: 8 }}>
        <PhotoPicker label="รูปงานติดตั้ง/ส่งมอบ · Installation photos (ไม่จำกัด)" urls={f.photos || []} onChange={(urls) => onPatch({ photos: urls })} />
      </div>
    </NewFormShell>
  );
}

// ── เช็คลิสต์ล้าง (AMC-CL) ──
function WashCard({ f, idx, meta, onMachine, onPatch, onNote, onRemove }) {
  return (
    <NewFormShell meta={meta} idx={idx} onRemove={onRemove} onNote={onNote} note={f.note}>
      <MachineHead m={f.machine || {}} onSet={(k, v) => onMachine(idx, k, v)} />
      <div className="he-machine">
        <input className="inp sm" placeholder="อายุการใช้งานโดยประมาณ · Approx. age" value={f.age || ""} onChange={(e) => onPatch({ age: e.target.value })} />
      </div>
      <PickChips label="ประเภทงาน · Job type" options={WASH_WORKKINDS} value={f.work_kind || ""} onChange={(v) => onPatch({ work_kind: v })} />
      <PickChips label="น้ำยา · Refrigerant" options={REFRIGERANTS} value={f.refrigerant || ""} onChange={(v) => onPatch({ refrigerant: v })} />
      <ChecksTable sections={WASH_SECTIONS} values={f.checks || []} onChange={(v) => onPatch({ checks: v })} />
      <MeasTable title="ค่าที่วัด ก่อน–หลังล้าง (พิสูจน์ผลงาน) · Measurements before–after" rows={WASH_MEAS} values={f.meas || []} onChange={(v) => onPatch({ meas: v })} beforeAfter lb="ก่อนล้าง · Before" la="หลังล้าง · After" />
      <label className="he-f" style={{ marginTop: 6 }}><span>นัดล้างครั้งถัดไป (แนะนำทุก 4–6 เดือน) · Next cleaning date</span>
        <input type="date" className="inp sm" style={{ maxWidth: 180 }} value={f.next_date || ""} onChange={(e) => onPatch({ next_date: e.target.value })} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        <PhotoPicker label="รูปก่อนล้าง · Before (สูงสุด 4)" urls={f.photosBefore || []} max={4} onChange={(urls) => onPatch({ photosBefore: urls })} />
        <PhotoPicker label="รูปหลังล้าง · After (สูงสุด 4)" urls={f.photosAfter || []} max={4} onChange={(urls) => onPatch({ photosAfter: urls })} />
      </div>
    </NewFormShell>
  );
}

// ── รายงานซ่อม (AMC-RP) ──
function FixCard({ f, idx, meta, onMachine, onPatch, onNote, onRemove }) {
  const parts = f.parts || [];
  const setPart = (pi, k, v) => onPatch({ parts: parts.map((p, j) => (j === pi ? { ...p, [k]: v } : p)) });
  const partTotal = parts.reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.price) || 0), 0);
  const toggleSym = (si) => onPatch({ symptoms: (f.symptoms || FIX_SYMPTOMS.map(() => false)).map((v, j) => (j === si ? !v : v)) });
  return (
    <NewFormShell meta={meta} idx={idx} onRemove={onRemove} onNote={onNote} note={f.note}>
      <MachineHead m={f.machine || {}} onSet={(k, v) => onMachine(idx, k, v)} />
      <PickChips label="น้ำยา · Refrigerant" options={REFRIGERANTS} value={f.refrigerant || ""} onChange={(v) => onPatch({ refrigerant: v })} />
      <PickChips label="งานในประกัน · Under warranty" options={[["yes", "ใช่ · Yes"], ["no", "ไม่ใช่ · No"]]} value={f.in_warranty || ""} onChange={(v) => onPatch({ in_warranty: v })} />
      <div style={{ fontWeight: 700, fontSize: 12, margin: "6px 0 3px" }}>อาการที่ลูกค้าแจ้ง / ที่ตรวจพบ · Reported symptoms</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {FIX_SYMPTOMS.map((s, si) => (
          <button key={si} type="button" className={"he-chip" + ((f.symptoms || [])[si] ? " on" : "")} onClick={() => toggleSym(si)}>{s}</button>
        ))}
      </div>
      <div className="he-grid2" style={{ marginTop: 6 }}>
        <label className="he-f"><span>อื่น ๆ · Other</span><input className="inp sm" value={f.symptom_other || ""} onChange={(e) => onPatch({ symptom_other: e.target.value })} /></label>
      </div>
      <label className="he-f he-f-wide"><span>รายละเอียดอาการ / สิ่งที่ตรวจพบ · Symptom details / findings</span>
        <textarea className="inp" rows={2} value={f.symptom_detail || ""} onChange={(e) => onPatch({ symptom_detail: e.target.value })} /></label>
      <ChecksTable sections={[["การวิเคราะห์และตรวจวินิจฉัย (Diagnosis)", FIX_DIAG]]} values={[f.diag || []]} onChange={(v) => onPatch({ diag: v[0] })} />
      <label className="he-f he-f-wide"><span>สาเหตุของปัญหา (Root cause)</span>
        <textarea className="inp" rows={2} value={f.rootcause || ""} onChange={(e) => onPatch({ rootcause: e.target.value })} /></label>
      <ChecksTable sections={[["การซ่อม · Repair work", FIX_REPAIR]]} values={[f.rep || []]} onChange={(v) => onPatch({ rep: v[0] })} />
      <div style={{ fontWeight: 700, fontSize: 12.5, margin: "8px 0 2px", color: "#1d4ed8" }}>รายการอะไหล่ / วัสดุที่ใช้ · Parts / materials used
        <button type="button" className="btn-ghost sm" style={{ marginLeft: 8 }} onClick={() => onPatch({ parts: [...parts, { name: "", qty: "", price: "" }] })}>＋ เพิ่มแถว · Add</button>
      </div>
      {parts.map((p, pi) => (
        <div key={pi} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
          <span style={{ width: 18, textAlign: "center", fontWeight: 700, color: "var(--ink-3)", flex: "none" }}>{pi + 1}</span>
          <input className="inp sm" style={{ flex: "1 1 200px" }} placeholder="รายการอะไหล่/วัสดุ · Part / material" value={p.name || ""} onChange={(e) => setPart(pi, "name", e.target.value)} />
          <input className="inp sm" style={{ flex: "0 1 70px" }} placeholder="จำนวน · Qty" value={p.qty || ""} onChange={(e) => setPart(pi, "qty", e.target.value)} />
          <input className="inp sm" style={{ flex: "0 1 100px" }} placeholder="ราคา/หน่วย · Price" value={p.price || ""} onChange={(e) => setPart(pi, "price", e.target.value)} />
          <span style={{ flex: "0 0 80px", fontSize: 12, fontWeight: 700, textAlign: "right" }}>{((Number(p.qty) || 0) * (Number(p.price) || 0)).toLocaleString("en-US")}</span>
          {parts.length > 1 && <button type="button" className="he-form-x" onClick={() => onPatch({ parts: parts.filter((_, j) => j !== pi) })}><UIcon name="x" size={13} /></button>}
        </div>
      ))}
      {partTotal > 0 && <div style={{ textAlign: "right", fontWeight: 800, fontSize: 12.5 }}>รวมค่าอะไหล่/วัสดุ · Parts total: ฿{partTotal.toLocaleString("en-US")}</div>}
      {parts.some((p) => p.name) && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, margin: "3px 0 2px", color: "var(--ink-2)" }}>
          <input type="checkbox" checked={!!f.show_price} onChange={(e) => onPatch({ show_price: e.target.checked })} />
          แสดงราคาอะไหล่บนใบที่พิมพ์ให้ลูกค้า · Show prices on printed copy <span className="jo-dim">(ค่าเริ่มต้น: ซ่อน — ราคาจริงคิดที่ใบแจ้งหนี้)</span>
        </label>
      )}
      <MeasTable title="ค่าที่วัดหลังซ่อม (ยืนยันเครื่องกลับมาปกติ) · Post-repair measurements" rows={FIX_MEAS} values={f.meas || []} onChange={(v) => onPatch({ meas: v })} />
      <PickChips label="ผลการซ่อม · Repair result" options={FIX_RESULTS} value={f.result || ""} onChange={(v) => onPatch({ result: v })} />
      <div className="he-grid2">
        <label className="he-f"><span>รับประกันงานซ่อม/อะไหล่ · Repair/parts warranty</span><input className="inp sm" value={f.warranty || ""} onChange={(e) => onPatch({ warranty: e.target.value })} /></label>
        <label className="he-f"><span>นัดติดตามผล · Follow-up</span><input className="inp sm" value={f.follow || ""} onChange={(e) => onPatch({ follow: e.target.value })} /></label>
      </div>
      <label className="he-f he-f-wide"><span>คำแนะนำเพิ่มเติมสำหรับลูกค้า · Advice for customer</span>
        <textarea className="inp" rows={2} value={f.advice || ""} onChange={(e) => onPatch({ advice: e.target.value })} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        <PhotoPicker label="รูปก่อนซ่อม · Before (สูงสุด 4)" urls={f.photosBefore || []} max={4} onChange={(urls) => onPatch({ photosBefore: urls })} />
        <PhotoPicker label="รูปหลังซ่อม · After (สูงสุด 4)" urls={f.photosAfter || []} max={4} onChange={(urls) => onPatch({ photosAfter: urls })} />
      </div>
    </NewFormShell>
  );
}

// ── บันทึก PM ตามสัญญา (AMC-PM) — หลายเครื่องใน 1 ฟอร์ม ──
function PmcCard({ f, idx, meta, onPatch, onNote, onRemove }) {
  const machines = f.machines || [];
  const setM = (mi, k, v) => onPatch({ machines: machines.map((m, j) => (j === mi ? { ...m, [k]: v } : m)) });
  return (
    <NewFormShell meta={meta} idx={idx} onRemove={onRemove} onNote={onNote} note={f.note}>
      <div className="he-machine">
        <input className="inp sm" placeholder="เลขที่สัญญา · Contract no." value={f.contract_no || ""} onChange={(e) => onPatch({ contract_no: e.target.value })} />
        <input className="inp sm" placeholder="รอบครั้งที่ · Visit no." value={f.round || ""} onChange={(e) => onPatch({ round: e.target.value })} />
        <input className="inp sm" placeholder="จากทั้งหมด (ครั้ง) · Of total" value={f.round_of || ""} onChange={(e) => onPatch({ round_of: e.target.value })} />
        <input className="inp sm" placeholder="เวลาเข้า–ออก · Time in–out" value={f.time_in_out || ""} onChange={(e) => onPatch({ time_in_out: e.target.value })} />
      </div>
      <PickChips label="ความถี่ตามสัญญา · Contract frequency" options={PMC_FREQS} value={f.freq || ""} onChange={(v) => onPatch({ freq: v })} />
      <div style={{ fontWeight: 700, fontSize: 12.5, margin: "8px 0 2px", color: "#1d4ed8" }}>ทะเบียนเครื่องและค่าที่วัด (บันทึกทุกเครื่อง) · Unit registry & readings
        <button type="button" className="btn-ghost sm" style={{ marginLeft: 8 }} onClick={() => onPatch({ machines: [...machines, blankPmcMachine()] })}>＋ เพิ่มเครื่อง · Add unit</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="he-tbl" style={{ minWidth: 620 }}>
          <thead><tr><th className="n">#</th><th>จุดติดตั้ง · Location</th><th>รหัส · Code</th><th>ยี่ห้อ · Brand</th><th>BTU</th><th>ลมออก · Supply (°C)</th><th>ΔT (°C)</th><th>Amp (A)</th><th>สภาพ/หมายเหตุ · Condition</th><th /></tr></thead>
          <tbody>
            {machines.map((m, mi) => (
              <tr key={mi}>
                <td className="n">{mi + 1}</td>
                <td><input className="inp sm" value={m.point || ""} onChange={(e) => setM(mi, "point", e.target.value)} /></td>
                <td><input className="inp sm" style={{ width: 70 }} value={m.code || ""} onChange={(e) => setM(mi, "code", e.target.value)} /></td>
                <td><input className="inp sm" list="ho-brand-list" style={{ width: 90 }} value={m.brand || ""} onChange={(e) => setM(mi, "brand", e.target.value)} /></td>
                <td><input className="inp sm" list="ho-btu-list" style={{ width: 70 }} value={m.btu || ""} onChange={(e) => setM(mi, "btu", e.target.value)} /></td>
                <td><input className="inp sm" style={{ width: 55 }} value={m.out || ""} onChange={(e) => setM(mi, "out", e.target.value)} /></td>
                <td><input className="inp sm" style={{ width: 55 }} value={m.dt || ""} onChange={(e) => setM(mi, "dt", e.target.value)} /></td>
                <td><input className="inp sm" style={{ width: 55 }} value={m.amp || ""} onChange={(e) => setM(mi, "amp", e.target.value)} /></td>
                <td><input className="inp sm" value={m.note || ""} onChange={(e) => setM(mi, "note", e.target.value)} /></td>
                <td style={{ padding: 2 }}>{machines.length > 1 && <button type="button" className="he-form-x" onClick={() => onPatch({ machines: machines.filter((_, j) => j !== mi) })}><UIcon name="x" size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="jo-dim" style={{ fontSize: 11, marginTop: 2 }}>{PMC_REF}</div>
      <ChecksTable sections={[["รายการบำรุงรักษาที่ดำเนินการ (ทุกเครื่อง) · Maintenance performed", PMC_ACTS]]} values={[f.acts || []]} onChange={(v) => onPatch({ acts: v[0] })} failLabel="แก้ไข · Fixed" />
      <label className="he-f he-f-wide" style={{ marginTop: 6 }}><span>ปัญหาที่พบ · งานที่ต้องแก้ไข · ข้อเสนอ (แจ้งลูกค้า) · Issues found / follow-up needed</span>
        <textarea className="inp" rows={2} value={f.issues || ""} onChange={(e) => onPatch({ issues: e.target.value })} /></label>
      <PickChips label="สรุปผลรอบนี้ · Round summary" options={[["ok", "ทุกเครื่องปกติ · All units normal"], ["fix", "มีเครื่องต้องแก้ไข · Some units need repair"]]} value={f.summary || ""} onChange={(v) => onPatch({ summary: v })} />
      <div className="he-grid2">
        <label className="he-f"><span>นัดเข้าบริการรอบถัดไป · Next PM visit</span>
          <input type="date" className="inp sm" value={f.next_date || ""} onChange={(e) => onPatch({ next_date: e.target.value })} /></label>
        <div><PickChips label="เสนอราคางานเพิ่มเติม · Extra-work quote" options={[["yes", "มี · Yes"], ["no", "ไม่มี · No"]]} value={f.extra_quote || ""} onChange={(v) => onPatch({ extra_quote: v })} /></div>
      </div>
      <div style={{ marginTop: 6 }}>
        <PhotoPicker label="รูปประกอบ · Photos (ไม่จำกัด)" urls={f.photos || []} onChange={(urls) => onPatch({ photos: urls })} />
      </div>
    </NewFormShell>
  );
}

// ช่องรูปภาพของแบบฟอร์ม — อัปโหลดทันทีที่เลือก (ย่อรูปอัตโนมัติ) · ถ่ายจากกล้องมือถือได้ · max = จำกัดจำนวน (ไม่ใส่ = ไม่จำกัด)
function PhotoPicker({ label, urls = [], max, onChange }) {
  const [up, setUp] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const room = max ? Math.max(0, max - urls.length) : Infinity;
  const onSel = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length || room <= 0) return;
    setUp(true); setErr(null);
    try {
      const out = [...urls];
      for (const file of files.slice(0, room)) out.push(await uploadMaterialPhoto(file, "handover"));
      onChange(out);
    } catch (ex) { setErr("อัปโหลดไม่สำเร็จ: " + (ex.message || ex)); }
    setUp(false);
  };
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{label} <span className="jo-dim" style={{ fontWeight: 400 }}>({urls.length}{max ? `/${max}` : ""})</span></div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {urls.map((u, i) => (
          <span key={i} style={{ position: "relative", display: "inline-block" }}>
            <img src={u} alt="" style={{ width: 62, height: 62, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)", cursor: "zoom-in" }} onClick={() => window.open(u, "_blank")} />
            <button type="button" onClick={() => onChange(urls.filter((_, j) => j !== i))}
              style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 99, border: 0, background: "#dc2626", color: "#fff", fontSize: 11, lineHeight: "18px", padding: 0, cursor: "pointer" }}>✕</button>
          </span>
        ))}
        {room > 0 && (
          <label className="btn-ghost sm" style={{ cursor: "pointer", height: 62, width: 62, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2, borderStyle: "dashed" }}>
            <span style={{ fontSize: 18 }}>{up ? "…" : "📷"}</span><span style={{ fontSize: 10.5 }}>{up ? "กำลังอัป" : "เพิ่มรูป"}</span>
            <input type="file" accept="image/*" multiple onChange={onSel} style={{ display: "none" }} disabled={up} />
          </label>
        )}
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: 11.5, marginTop: 3 }}>{err}</div>}
    </div>
  );
}
