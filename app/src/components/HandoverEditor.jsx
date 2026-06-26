import React from "react";
import { UIcon } from "../icons";
import { confirmDialog } from "./ConfirmDialog";
import SignaturePad from "./SignaturePad";
import { saveHandover, uploadSignatureDataUrl } from "../lib/api";
import { PERF_ROWS, PM_ROWS, WORK_TYPES, AC_TYPES, FORM_KINDS, blankForm } from "../lib/handover";

// Full-screen editor where the technician fills in a handover sheet while on the job.
// props: initial (a handover object), onClose(), onSaved(saved), flash(msg, bad)
export default function HandoverEditor({ initial, onClose, onSaved, flash }) {
  const [h, setH] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const set = (k, v) => setH((s) => ({ ...s, [k]: v }));

  const toggleWork = (v) => setH((s) => ({ ...s, work_types: s.work_types.includes(v) ? s.work_types.filter((x) => x !== v) : [...s.work_types, v] }));

  // ---- forms ----
  const updateForm = (i, patch) => setH((s) => ({ ...s, forms: s.forms.map((f, j) => j === i ? { ...f, ...patch } : f) }));
  const updateMachine = (i, k, v) => setH((s) => ({ ...s, forms: s.forms.map((f, j) => j === i ? { ...f, machine: { ...f.machine, [k]: v } } : f) }));
  const updateRow = (i, ri, val) => setH((s) => ({ ...s, forms: s.forms.map((f, j) => j === i ? { ...f, rows: f.rows.map((r, k) => k === ri ? val : r) } : f) }));
  const addForm = (kind) => { setH((s) => ({ ...s, forms: [...s.forms, blankForm(kind)] })); setAddOpen(false); };
  const removeForm = async (i) => { if (!await confirmDialog("ลบแบบฟอร์มนี้?")) return; setH((s) => ({ ...s, forms: s.forms.filter((_, j) => j !== i) })); };

  async function persist(status) {
    setBusy(true);
    try {
      const out = { ...h, status };
      // upload freshly-drawn signatures (data URLs) → public URLs
      if (out.tech_sign_url && out.tech_sign_url.startsWith("data:")) out.tech_sign_url = await uploadSignatureDataUrl(out.tech_sign_url);
      if (out.cust_sign_url && out.cust_sign_url.startsWith("data:")) out.cust_sign_url = await uploadSignatureDataUrl(out.cust_sign_url);
      const saved = await saveHandover(out);
      flash && flash(status === "submitted" ? "บันทึก & ส่งใบส่งมอบงานแล้ว ✓" : "บันทึกฉบับร่างแล้ว ✓");
      onSaved && onSaved(saved);
    } catch (e) { flash && flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal he" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "97vw" }}>
        <div className="modal-head">
          <div className="modal-title">ใบส่งมอบงาน {h.id && h.status === "draft" ? <span>· ฉบับร่าง (กรอกต่อ)</span> : h.job_no ? <span>· ผูกกับ {h.job_no}</span> : <span>· ไม่ผูกใบงาน</span>}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>

        <div className="modal-body he-body">
          <div className="he-hint">📋 <b>ก่อนเริ่มงาน:</b> กรอกค่าช่อง “ก่อน” แล้วกด <b>บันทึกร่าง</b> · <b>ทำเสร็จแล้ว:</b> กลับเข้ามากรอกช่อง “หลัง” + เช็คลิสต์ แล้วกด <b>บันทึก &amp; ส่ง</b></div>
          {/* ── ผู้รับบริการ ── */}
          <div className="he-sec-t">ผู้รับบริการ</div>
          <div className="he-grid2">
            <label className="he-f"><span>บริษัท / ชื่อ-สกุล</span><input className="inp" value={h.customer_name || ""} onChange={(e) => set("customer_name", e.target.value)} /></label>
            <label className="he-f"><span>ผู้ติดต่อ</span><input className="inp" value={h.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} /></label>
            <label className="he-f"><span>เบอร์โทร</span><input className="inp" value={h.contact_phone || ""} onChange={(e) => set("contact_phone", e.target.value)} /></label>
            <label className="he-f"><span>เอกสารอ้างอิง</span><input className="inp" value={h.doc_ref || ""} onChange={(e) => set("doc_ref", e.target.value)} /></label>
            <label className="he-f he-f-wide"><span>ที่อยู่</span><input className="inp" value={h.address || ""} onChange={(e) => set("address", e.target.value)} /></label>
            <label className="he-f"><span>วันที่</span><input type="date" className="inp" value={h.doc_date || ""} onChange={(e) => set("doc_date", e.target.value)} /></label>
          </div>

          {/* ── ประเภทงาน ── */}
          <div className="he-sec-t">ประเภทงาน</div>
          <div className="he-chips">
            {WORK_TYPES.map(([v, l]) => (
              <button key={v} type="button" className={"he-chip" + (h.work_types.includes(v) ? " on" : "")} onClick={() => toggleWork(v)}>{l}</button>
            ))}
          </div>

          <label className="he-f he-f-wide"><span>รายละเอียด / อาการเสีย / การสำรวจหน้างาน</span>
            <textarea className="inp" rows={2} value={h.detail || ""} onChange={(e) => set("detail", e.target.value)} /></label>

          {/* ── แบบฟอร์มย่อย ── */}
          <div className="he-sec-t">แบบฟอร์ม ({h.forms.length})
            <button type="button" className="btn-primary sm" style={{ marginLeft: "auto" }} onClick={() => setAddOpen(true)}><UIcon name="plus" size={14} color="#fff" /> เพิ่มแบบฟอร์ม</button>
          </div>
          {h.forms.length === 0 && <div className="he-empty">ยังไม่มีแบบฟอร์ม — กด “เพิ่มแบบฟอร์ม” เพื่อเริ่มบันทึกเครื่องแรก</div>}
          {h.forms.map((f, i) => (
            <FormCard key={i} f={f} idx={i} onMachine={updateMachine} onRow={updateRow} onNote={(v) => updateForm(i, { note: v })} onRemove={() => removeForm(i)} />
          ))}

          {/* ── การแก้ไข/หมายเหตุ ── */}
          <label className="he-f he-f-wide"><span>การแก้ไข / หมายเหตุอื่น ๆ</span>
            <textarea className="inp" rows={2} value={h.fix_note || ""} onChange={(e) => set("fix_note", e.target.value)} /></label>

          {/* ── ลายเซ็น ── */}
          <div className="he-sec-t">ลายเซ็น</div>
          <div className="he-signs">
            <div className="he-sign-col">
              <SignaturePad label="ลายเซ็นช่างผู้ให้บริการ" value={h.tech_sign_url} onChange={(d) => set("tech_sign_url", d)} />
              <input className="inp" placeholder="ชื่อช่าง" value={h.tech_name || ""} onChange={(e) => set("tech_name", e.target.value)} />
            </div>
            <div className="he-sign-col">
              <SignaturePad label="ลายเซ็นผู้รับบริการ (ลูกค้า)" value={h.cust_sign_url} onChange={(d) => set("cust_sign_url", d)} />
              <input className="inp" placeholder="ชื่อผู้รับบริการ" value={h.cust_name || ""} onChange={(e) => set("cust_name", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn-ghost" disabled={busy} onClick={() => persist("draft")}>{busy ? "กำลังบันทึก…" : "บันทึกร่าง"}</button>
          <button className="btn-primary" disabled={busy} onClick={() => persist("submitted")}><UIcon name="check" size={15} color="#fff" /> บันทึก & ส่ง</button>
        </div>

        {addOpen && (
          <div className="confirm-overlay" onMouseDown={() => setAddOpen(false)}>
            <div className="confirm-box" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
              <div className="confirm-title">เพิ่มแบบฟอร์ม</div>
              <div className="he-add-list">
                {FORM_KINDS.map((k) => (
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

// one sub-form card (perf or pm) with its machine fields + rows + note
function FormCard({ f, idx, onMachine, onRow, onNote, onRemove }) {
  const meta = FORM_KINDS.find((k) => k.kind === f.kind) || FORM_KINDS[0];
  const m = f.machine || {};
  return (
    <div className="he-form">
      <div className="he-form-h">
        <span className="he-form-badge">{meta.icon} {meta.label}</span>
        <span className="he-form-no">#{idx + 1}</span>
        <button type="button" className="he-form-x" onClick={onRemove}><UIcon name="trash" size={14} /></button>
      </div>

      {/* machine identity */}
      <div className="he-machine">
        <input className="inp sm" placeholder="รหัสประจำเครื่อง" value={m.code || ""} onChange={(e) => onMachine(idx, "code", e.target.value)} />
        <select className="inp sm" value={m.type || ""} onChange={(e) => onMachine(idx, "type", e.target.value)}>
          <option value="">ประเภทเครื่อง…</option>
          {AC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="inp sm" placeholder="ยี่ห้อ" value={m.brand || ""} onChange={(e) => onMachine(idx, "brand", e.target.value)} />
        <input className="inp sm" placeholder="รุ่น" value={m.model || ""} onChange={(e) => onMachine(idx, "model", e.target.value)} />
        <input className="inp sm" placeholder="ขนาด BTU" value={m.btu || ""} onChange={(e) => onMachine(idx, "btu", e.target.value)} />
        <input className="inp sm" placeholder="อาคาร" value={m.building || ""} onChange={(e) => onMachine(idx, "building", e.target.value)} />
        <input className="inp sm" placeholder="ชั้น" value={m.floor || ""} onChange={(e) => onMachine(idx, "floor", e.target.value)} />
        <input className="inp sm" placeholder="ห้อง" value={m.room || ""} onChange={(e) => onMachine(idx, "room", e.target.value)} />
      </div>

      {f.kind === "perf" ? (
        <table className="he-tbl">
          <thead><tr><th className="n">#</th><th>รายการ</th><th>ก่อน</th><th>หลัง</th></tr></thead>
          <tbody>
            {PERF_ROWS.map(([label, kind], ri) => {
              const v = f.rows[ri] || { b: "", a: "" };
              return (
                <tr key={ri}>
                  <td className="n">{ri + 1}</td>
                  <td className="lbl">{label}</td>
                  {["b", "a"].map((side) => (
                    <td key={side}>
                      {kind === "ck"
                        ? <span className="he-ck">
                            <button type="button" className={"he-ck-b" + (v[side] === "ok" ? " ok" : "")} onClick={() => onRow(idx, ri, { ...v, [side]: v[side] === "ok" ? "" : "ok" })}>ปกติ</button>
                            <button type="button" className={"he-ck-b" + (v[side] === "bad" ? " bad" : "")} onClick={() => onRow(idx, ri, { ...v, [side]: v[side] === "bad" ? "" : "bad" })}>ไม่ปกติ</button>
                          </span>
                        : <span className="he-unit"><input className="inp sm" value={v[side] || ""} onChange={(e) => onRow(idx, ri, { ...v, [side]: e.target.value })} /><small>{kind}</small></span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="he-tbl">
          <thead><tr><th className="n">#</th><th>รายการ</th><th className="pmh">ได้ทำ</th><th className="pmh">ไม่ได้ทำ</th></tr></thead>
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
      )}

      <input className="inp sm" placeholder="หมายเหตุของแบบฟอร์มนี้" value={f.note || ""} onChange={(e) => onNote(e.target.value)} style={{ marginTop: 6 }} />
    </div>
  );
}
