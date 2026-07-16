import React from "react";
import Combo from "./Combo";
import ItemPicker from "./ItemPicker";
import { confirmDialog } from "./ConfirmDialog";
import { UIcon } from "../icons";
import { listDocTermPresets, addDocTermPreset, updateDocTermPreset, deleteDocTermPreset, listAcWarranties } from "../lib/api";

// the 3 end-of-document term sections, shared by BOQ / quotation / invoice / receipt editors.
// each has a "pick a standard template" dropdown (inserts text, still editable) + manage presets.
const CATS = [
  { key: "terms_payment", cat: "payment", label: "เงื่อนไขการชำระเงิน" },
  { key: "terms_freebies", cat: "freebies", label: "รายการชุดวัสดุแถมมาตรฐาน" },
  { key: "terms_warranty", cat: "warranty", label: "การรับประกัน" },
];

export default function DocTerms({ payment, freebies, warranty, onChange, docItems }) {
  const vals = { terms_payment: payment || "", terms_freebies: freebies || "", terms_warranty: warranty || "" };
  const [presets, setPresets] = React.useState([]);
  const [manageCat, setManageCat] = React.useState(null);
  // รุ่นแอร์ + ข้อความรับประกันจากการ์ดสินค้า (mig 140) — เลือกได้หลายรุ่น ต่อท้ายช่องการรับประกัน แก้ข้อความต่อได้
  const [acList, setAcList] = React.useState([]);

  async function load() { try { setPresets(await listDocTermPresets()); } catch { /* ignore */ } }
  React.useEffect(() => { load(); listAcWarranties().then(setAcList).catch(() => {}); }, []);

  const byCat = (c) => presets.filter((p) => p.category === c);
  function pick(key, presetId) {
    const p = presets.find((x) => String(x.id) === String(presetId));
    if (!p) return;
    const cur = vals[key];
    onChange(key, cur ? cur.replace(/\s+$/, "") + "\n" + p.body : p.body); // append (keep what's already typed)
  }

  // ต่อท้ายบรรทัดรับประกันของรุ่นที่เลือก (ข้ามรุ่นที่มีอยู่ในข้อความแล้ว — กันซ้ำ)
  function addWarranty(ms) {
    const cur = (vals.terms_warranty || "").replace(/\s+$/, "");
    const lines = [];
    ms.forEach((m) => {
      if (!m || (cur + lines.join("\n")).includes(m.th)) return;
      lines.push(`• ${m.th}${m.btu && !String(m.th).includes(String(m.btu)) ? ` (${Number(m.btu).toLocaleString("en-US")} BTU)` : ""} — ${(m.warranty || "").trim() || "สอบถามเงื่อนไขรับประกันกับทางร้าน"}`);
    });
    if (lines.length) onChange("terms_warranty", [cur, ...lines].filter(Boolean).join("\n"));
  }
  // รุ่นแอร์ที่อยู่ในรายการของเอกสารนี้ (ดึงรวดเดียวได้)
  const acByCode = React.useMemo(() => Object.fromEntries(acList.map((m) => [m.code, m])), [acList]);
  const docAc = React.useMemo(() => {
    const codes = [...new Set((docItems || []).map((x) => x.code || x.item_code).filter(Boolean))];
    return codes.map((c) => acByCode[c]).filter(Boolean);
  }, [docItems, acByCode]);

  return (
    <div className="docterms">
      <div className="docterms-head">เงื่อนไขท้ายเอกสาร <span className="jo-dim">· เลือกแบบมาตรฐานมาใส่แล้วแก้เพิ่มได้</span></div>
      {CATS.map((c) => (
        <div className="docterms-sec" key={c.key}>
          <div className="docterms-sec-top">
            <span className="docterms-label">{c.label}</span>
            <div className="docterms-actions">
              <Combo className="inp docterms-pick" value="" onChange={(e) => pick(c.key, e.target.value)}>
                <option value="">+ เลือกแบบมาตรฐาน…</option>
                {byCat(c.cat).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Combo>
              <button type="button" className="btn-ghost sm" onClick={() => setManageCat(c.cat)} title="จัดการแบบมาตรฐาน"><UIcon name="edit" size={14} /></button>
            </div>
          </div>
          {c.key === "terms_warranty" && acList.length > 0 && (
            <div className="line-add" style={{ marginBottom: 6 }}>
              <ItemPicker items={acList} placeholder="🛡️ เลือกรุ่นแอร์ → ดึงข้อมูลรับประกันมาต่อท้าย (เลือกได้หลายรุ่น)" onPick={(m) => addWarranty([m])} />
              {docAc.length > 0 && <button type="button" className="btn-ghost sm" style={{ flex: "none" }} title="ดึงข้อมูลรับประกันของแอร์ทุกรุ่นที่อยู่ในรายการเอกสารนี้" onClick={() => addWarranty(docAc)}>ดึงทุกรุ่นในเอกสาร ({docAc.length})</button>}
            </div>
          )}
          <textarea className="inp" rows={3} value={vals[c.key]} placeholder={`พิมพ์${c.label}… หรือเลือกแบบมาตรฐานด้านบน`}
            onChange={(e) => onChange(c.key, e.target.value)} />
        </div>
      ))}

      {manageCat && <ManagePresets category={manageCat} label={CATS.find((c) => c.cat === manageCat)?.label} presets={byCat(manageCat)} onClose={() => setManageCat(null)} onChanged={load} />}
    </div>
  );
}

function ManagePresets({ category, label, presets, onClose, onChanged }) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [edit, setEdit] = React.useState(null); // { id, title, body }
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try { await addDocTermPreset(category, title, body); setTitle(""); setBody(""); await onChanged(); } catch (e) { alert("เพิ่มไม่สำเร็จ: " + (e.message || e)); }
    setBusy(false);
  }
  async function saveEdit() {
    if (!edit.title.trim() || !edit.body.trim()) return;
    setBusy(true);
    try { await updateDocTermPreset(edit.id, { title: edit.title, body: edit.body }); setEdit(null); await onChanged(); } catch (e) { alert("บันทึกไม่สำเร็จ: " + (e.message || e)); }
    setBusy(false);
  }
  async function del(id) {
    if (!await confirmDialog("ลบแบบมาตรฐานนี้?")) return;
    try { await deleteDocTermPreset(id); await onChanged(); } catch (e) { alert("ลบไม่สำเร็จ: " + (e.message || e)); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 540 }}>
        <div className="modal-head"><div className="modal-title">แบบมาตรฐาน · {label}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button></div>
        <div className="modal-body">
          <div className="qr-add">
            <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อหัวข้อ (เช่น มัดจำ 50%)" />
            <textarea className="inp" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="ข้อความเต็มที่จะนำไปใส่ในเอกสาร" />
            <button className="btn-primary" disabled={busy || !title.trim() || !body.trim()} onClick={add}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่มแบบมาตรฐาน</button>
          </div>
          <div className="qr-list">
            {presets.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ยังไม่มีแบบมาตรฐานในหัวข้อนี้</div>}
            {presets.map((p) => edit && edit.id === p.id ? (
              <div className="qr-item editing" key={p.id}>
                <div className="qr-edit-fields">
                  <input className="inp" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="ชื่อหัวข้อ" />
                  <textarea className="inp" rows={3} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder="ข้อความ" />
                  <div className="qr-edit-acts">
                    <button className="btn-ghost sm" onClick={() => setEdit(null)}>ยกเลิก</button>
                    <button className="btn-primary sm" disabled={busy} onClick={saveEdit}>บันทึก</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="qr-item" key={p.id}>
                <div className="qr-body"><div className="qr-title">{p.title}</div><div className="qr-text">{p.body}</div></div>
                <button className="qr-del" title="แก้ไข" onClick={() => setEdit({ id: p.id, title: p.title, body: p.body })}><UIcon name="edit" size={15} /></button>
                <button className="qr-del" title="ลบ" onClick={() => del(p.id)}><UIcon name="trash" size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
