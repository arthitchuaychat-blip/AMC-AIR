import React from "react";
import { listCoupons, couponStats, redeemCoupon, voidCoupon, listCampaigns, saveCampaign, generateCoupons } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";

const thDate = (s) => s ? new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const SRC = { web: ["🌐 เว็บ", "#dbeafe", "#1e40af"], line: ["💚 LINE", "#dcfce7", "#166534"], fb: ["💙 FB", "#dbeafe", "#1e40af"], manual: ["🏪 หน้าร้าน", "#f3e8ff", "#6b21a8"] };
const ST = { available: ["พร้อมใช้", "#e0f2fe", "#075985"], claimed: ["รับแล้ว", "#fef3c7", "#92400e"], redeemed: ["ใช้แล้ว ✓", "#dcfce7", "#166534"], void: ["ยกเลิก", "#f1f5f9", "#64748b"], expired: ["หมดอายุ", "#fee2e2", "#991b1b"] };
const STATUS_TABS = [["all", "ทั้งหมด"], ["available", "พร้อมใช้ (พิมพ์แจก)"], ["claimed", "ลูกค้ารับแล้ว"], ["redeemed", "ใช้แล้ว"]];

export default function Coupons() {
  const [camps, setCamps] = React.useState([]);
  const [campId, setCampId] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [stat, setStat] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState(""); const [statusF, setStatusF] = React.useState("all");
  const [rCode, setRCode] = React.useState(""); const [rName, setRName] = React.useState(""); const [rPhone, setRPhone] = React.useState(""); const [rRef, setRRef] = React.useState(""); const [rArea, setRArea] = React.useState(""); const [rAppoint, setRAppoint] = React.useState("");
  const [genN, setGenN] = React.useState(100);
  const [campModal, setCampModal] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3200); };

  const camp = camps.find((c) => c.id === campId) || stat?.campaign || null;
  const discLabel = (c, v) => (c?.discount_type === "percent" ? `${Number(v ?? c?.value) || 0}%` : fmtBaht(Number(v ?? c?.value) || 0));

  const loadCamps = React.useCallback(() => {
    listCampaigns().then((cs) => { setCamps(cs); setCampId((id) => id || cs[0]?.id || "clean750"); }).catch(() => setCampId("clean750"));
  }, []);
  React.useEffect(() => { loadCamps(); }, [loadCamps]);

  const load = React.useCallback(() => {
    if (!campId) return;
    setLoading(true);
    Promise.all([listCoupons(campId).catch(() => []), couponStats(campId).catch(() => null)])
      .then(([r, s]) => { setRows(r); setStat(s); }).finally(() => setLoading(false));
  }, [campId]);
  React.useEffect(() => { load(); }, [load]);

  async function doRedeem() {
    if (!rCode.trim()) return flash("กรอกโค้ด", true);
    setBusy(true);
    try { const row = await redeemCoupon(rCode, { name: rName, phone: rPhone, ref: rRef, area: rArea, appoint_at: rAppoint || null, source: "manual" }); flash(`ใช้โค้ดสำเร็จ · ${row.name || ""} (หัก ${discLabel(camp)})`); setRCode(""); setRName(""); setRPhone(""); setRRef(""); setRArea(""); setRAppoint(""); load(); }
    catch (e) { flash(e.message || "ไม่สำเร็จ", true); } finally { setBusy(false); }
  }
  async function doGenerate() {
    const n = Math.floor(Number(genN) || 0);
    if (n < 1) return flash("ระบุจำนวนโค้ด", true);
    if (stat?.canGenerate != null && n > stat.canGenerate) return flash(`เกินโควตา — สร้างได้อีก ${stat.canGenerate} โค้ด`, true);
    if (!(await confirmDialog({ title: `สร้าง ${n} โค้ดสำหรับพิมพ์?`, message: `โค้ดสถานะ "พร้อมใช้" ${n} โค้ด ไว้พิมพ์ลงคูปองแจก · ยังไม่มีเจ้าของจนกว่าลูกค้าจะนำมาใช้`, confirmText: "สร้างโค้ด", danger: false }))) return;
    setBusy(true);
    try { const r = await generateCoupons(campId, n); flash(`สร้าง ${r.created} โค้ดแล้ว`); load(); }
    catch (e) { flash(e.message || "ไม่สำเร็จ", true); } finally { setBusy(false); }
  }
  async function doVoid(row) {
    if (!(await confirmDialog({ title: `ยกเลิกโค้ด ${row.code}?`, message: `${row.name || "-"} · ${row.phone || "-"}`, confirmText: "ยกเลิกโค้ด", danger: true }))) return;
    try { await voidCoupon(row.code); flash("ยกเลิกแล้ว"); load(); } catch (e) { flash(e.message || "ไม่สำเร็จ", true); }
  }
  function exportCsv() {
    const head = ["วันที่", "ชื่อ", "เบอร์", "พื้นที่", "ช่องทาง", "โค้ด", "สถานะ", "ใช้เมื่อ", "วันนัด", "เลขงาน"];
    const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const body = shown.map((r) => [r.claimed_at, r.name, r.phone, r.area || "", r.source, r.code, r.status, r.redeemed_at || "", r.appoint_at || "", r.redeemed_ref || ""].map(esc).join(","));
    const csv = "﻿" + [head.map(esc).join(","), ...body].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `coupons-${campId}.csv`; a.click();
  }
  async function copyCodes() {
    const codes = rows.filter((r) => r.status === "available").map((r) => r.code);
    if (!codes.length) return flash("ไม่มีโค้ดพร้อมใช้ให้คัดลอก (กดสร้างโค้ดก่อน)", true);
    try { await navigator.clipboard.writeText(codes.join("\n")); flash(`คัดลอก ${codes.length} โค้ดแล้ว — วางในไฟล์พิมพ์คูปองได้เลย`); }
    catch { flash("คัดลอกไม่ได้ — ใช้ปุ่มพิมพ์แทน", true); }
  }
  function printCodes() {
    const codes = rows.filter((r) => r.status === "available").map((r) => r.code);
    if (!codes.length) return flash("ไม่มีโค้ดพร้อมใช้ให้พิมพ์ (กดสร้างโค้ดก่อน)", true);
    const w = window.open("", "_blank"); if (!w) return;
    const cond = camp?.note ? `<p style="color:#555">${camp.note}</p>` : "";
    w.document.write(`<html><head><meta charset="utf-8"><title>โค้ดคูปอง</title><style>body{font-family:'Sarabun',sans-serif;padding:18px}h2{margin:0 0 2px}.c{display:inline-block;border:1.5px dashed #888;border-radius:10px;padding:12px 18px;margin:7px;font-size:19px;font-weight:800;letter-spacing:1.5px}</style></head><body><h2>${camp?.name || "คูปอง"} · ส่วนลด ${discLabel(camp)}</h2>${cond}<p>${codes.length} โค้ด</p>${codes.map((c) => `<span class="c">${c}</span>`).join("")}<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  }

  const shown = rows.filter((r) => (statusF === "all" || r.status === statusF) && (!q || [r.name, r.phone, r.code].some((x) => (x || "").toLowerCase().includes(q.toLowerCase()))));

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">คูปอง / โปรโมชั่น <span className="page-title-en">Coupons</span></h1>
          <p className="page-sub">สร้างโค้ดพิมพ์แจก · ยืนยันสิทธิ์ตอนลูกค้าใช้ · เก็บ lead ลูกค้า</p>
        </div>
      </div>

      {/* เลือก/จัดการแคมเปญ */}
      <div className="cp-camprow">
        <select className="inp" style={{ maxWidth: 320 }} value={campId} onChange={(e) => setCampId(e.target.value)}>
          {camps.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (ปิด)"}</option>)}
        </select>
        {camp && <span className="cp-badge" style={{ background: "#eef2ff", color: "#3730a3" }}>ส่วนลด {discLabel(camp)}{camp.quota ? ` · ${camp.quota} สิทธิ์` : ""}</span>}
        <button className="btn-ghost sm" onClick={() => setCampModal(camp || {})} disabled={!camp}>✎ แก้ไข</button>
        <button className="btn sm" onClick={() => setCampModal({ _new: true, discount_type: "amount", active: true })}>＋ โปรโมชั่นใหม่</button>
      </div>

      {/* สรุป */}
      {stat && (
        <div className="cp-stats">
          <div className="cp-stat"><span>สร้างโค้ดแล้ว</span><b>{stat.total}{stat.quota ? ` / ${stat.quota}` : ""}</b></div>
          <div className="cp-stat"><span>พร้อมใช้ (พิมพ์แจก)</span><b style={{ color: "#075985" }}>{stat.available}</b></div>
          <div className="cp-stat"><span>ลูกค้ารับแล้ว</span><b>{stat.claimed}</b></div>
          <div className="cp-stat"><span>ใช้แล้ว</span><b className="ok">{stat.redeemed}</b></div>
          {stat.quota > 0 && <div className="cp-bar"><div className="cp-bar-fill" style={{ width: `${Math.min(100, stat.total / stat.quota * 100)}%` }} /></div>}
        </div>
      )}

      {/* actions */}
      <div className="cp-actions3">
        <div className="cp-box">
          <div className="cp-box-t">✅ ใช้โค้ด (ลูกค้าส่งคูปองมา)</div>
          <div className="cp-box-col">
            <input className="inp" placeholder="กรอกโค้ด เช่น CLEAN-XXXXXX" value={rCode} onChange={(e) => setRCode(e.target.value)} />
            <div className="cp-box-row">
              <input className="inp" placeholder="ชื่อลูกค้า" value={rName} onChange={(e) => setRName(e.target.value)} />
              <input className="inp" placeholder="เบอร์โทร" value={rPhone} onChange={(e) => setRPhone(e.target.value)} />
            </div>
            <div className="cp-box-row">
              <input className="inp" placeholder="พื้นที่/เขต" value={rArea} onChange={(e) => setRArea(e.target.value)} />
              <input className="inp" type="date" title="วันนัดหมาย" value={rAppoint} onChange={(e) => setRAppoint(e.target.value)} />
            </div>
            <div className="cp-box-row">
              <input className="inp" placeholder="เลขที่งาน/ใบเสนอ (ไม่บังคับ)" value={rRef} onChange={(e) => setRRef(e.target.value)} />
              <button className="btn" disabled={busy} onClick={doRedeem}>ใช้โค้ด</button>
            </div>
          </div>
        </div>
        <div className="cp-box">
          <div className="cp-box-t">🖨️ สร้างโค้ดสำหรับพิมพ์ลงคูปอง</div>
          <div className="cp-box-col">
            <div className="cp-box-row">
              <input className="inp" type="number" min="1" style={{ maxWidth: 110 }} value={genN} onChange={(e) => setGenN(e.target.value)} />
              <span style={{ fontSize: 13, color: "var(--ink-3)", alignSelf: "center" }}>โค้ด {stat?.canGenerate != null ? `(เหลือโควตา ${stat.canGenerate})` : ""}</span>
              <button className="btn-ghost" disabled={busy} onClick={doGenerate}>สร้างโค้ด</button>
            </div>
            <div className="cp-box-row">
              <button className="btn-ghost sm" onClick={printCodes} disabled={!(stat?.available > 0)}>🖨️ พิมพ์ ({stat?.available || 0})</button>
              <button className="btn-ghost sm" onClick={copyCodes} disabled={!(stat?.available > 0)}>📋 คัดลอกโค้ด</button>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}

      {/* filter + list */}
      <div className="cp-listbar">
        {STATUS_TABS.map(([k, lb]) => <button key={k} className={"acc-book" + (statusF === k ? " on" : "")} onClick={() => setStatusF(k)}>{lb}{k !== "all" && stat ? <span className="acc-book-c">{stat[k] || 0}</span> : null}</button>)}
      </div>
      <div className="cp-listbar">
        <div className="cat-search" style={{ maxWidth: 300 }}><input placeholder="ค้นหา ชื่อ / เบอร์ / โค้ด" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="acc-hint">{shown.length} รายการ</span>
        <button className="btn-ghost sm" style={{ marginLeft: "auto" }} onClick={exportCsv} disabled={!shown.length}>⬇ ออก Excel (CSV)</button>
      </div>

      <div className="acc-card" style={{ padding: 0 }}>
        {loading ? <div className="empty">กำลังโหลด…</div> : shown.length === 0 ? (
          <div className="empty">ยังไม่มีโค้ด — กด “สร้างโค้ดสำหรับพิมพ์” หรือรอลูกค้ารับผ่านเว็บ/แชต</div>
        ) : (
          <table className="acc-table cp-table">
            <thead><tr><th>วันที่</th><th>ชื่อ</th><th>เบอร์</th><th>ช่องทาง</th><th>โค้ด</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {shown.map((r) => { const src = SRC[r.source] || (r.source ? [r.source, "#f1f5f9", "#475569"] : ["—", "#f8fafc", "#94a3b8"]); const st = ST[r.status] || [r.status, "#f1f5f9", "#475569"]; return (
                <tr key={r.code}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{thDate(r.claimed_at)}</td>
                  <td>{r.name || "-"}</td>
                  <td className="mono">{r.phone || "-"}</td>
                  <td><span className="cp-badge" style={{ background: src[1], color: src[2] }}>{src[0]}</span></td>
                  <td className="mono" style={{ fontWeight: 700 }}>{r.code}</td>
                  <td><span className="cp-badge" style={{ background: st[1], color: st[2] }}>{st[0]}</span>{[r.redeemed_ref, r.area, r.appoint_at && ("นัด " + r.appoint_at)].filter(Boolean).map((x, i) => <span key={i} className="acc-jl-memo"> · {x}</span>)}</td>
                  <td>{r.status !== "void" && r.status !== "redeemed" && <button className="acc-je-void" title="ยกเลิกโค้ด" onClick={() => doVoid(r)}>✕</button>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
      </div>

      {campModal && <CampaignModal init={campModal} onClose={() => setCampModal(null)} onSaved={(id, note) => { setCampModal(null); loadCamps(); setCampId(id); load(); flash(note || "บันทึกโปรโมชั่นแล้ว"); }} onError={(m) => flash(m, true)} />}
    </div>
  );
}

function CampaignModal({ init, onClose, onSaved, onError }) {
  const [f, setF] = React.useState({ id: init.id, name: init.name || "", discount_type: init.discount_type || "amount", value: init.value ?? "", quota: init.quota ?? "", valid_from: init.valid_from || "", claim_until: init.claim_until || "", use_by: init.use_by || "", note: init.note || "", active: init.active !== false });
  const [genNow, setGenNow] = React.useState(!!init._new);
  const [saving, setSaving] = React.useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const qn = Math.floor(Number(f.quota) || 0);
  async function save() {
    if (!f.name.trim()) return onError("ตั้งชื่อโปรโมชั่น");
    setSaving(true);
    try {
      const id = await saveCampaign(f);
      let note = "บันทึกโปรโมชั่นแล้ว";
      if (genNow && qn > 0) { const r = await generateCoupons(id, qn); note = `บันทึก + สร้าง ${r.created} โค้ดพร้อมพิมพ์แล้ว`; }
      onSaved(id, note);
    } catch (e) { onError(e.message || "บันทึกไม่สำเร็จ"); setSaving(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{init._new ? "สร้างโปรโมชั่นใหม่" : "แก้ไขโปรโมชั่น"} <button className="modal-x" onClick={onClose}>✕</button></div>
        <div className="cp-form">
          <label>ชื่อโปรโมชั่น<input className="inp" value={f.name} onChange={set("name")} placeholder="เช่น คูปองล้างแอร์ ฿750" /></label>
          <div className="cp-box-row">
            <label style={{ flex: 1 }}>ประเภทส่วนลด
              <select className="inp" value={f.discount_type} onChange={set("discount_type")}><option value="amount">บาท (฿)</option><option value="percent">เปอร์เซ็นต์ (%)</option></select>
            </label>
            <label style={{ flex: 1 }}>มูลค่า<input className="inp" type="number" value={f.value} onChange={set("value")} placeholder={f.discount_type === "percent" ? "เช่น 10" : "เช่น 750"} /></label>
            <label style={{ flex: 1 }}>จำนวน (สิทธิ์)<input className="inp" type="number" value={f.quota} onChange={set("quota")} placeholder="เช่น 100 · 0=ไม่จำกัด" /></label>
          </div>
          <div className="cp-box-row">
            <label style={{ flex: 1 }}>เริ่ม<input className="inp" type="date" value={f.valid_from} onChange={set("valid_from")} /></label>
            <label style={{ flex: 1 }}>รับภายใน<input className="inp" type="date" value={f.claim_until} onChange={set("claim_until")} /></label>
            <label style={{ flex: 1 }}>ใช้ภายใน<input className="inp" type="date" value={f.use_by} onChange={set("use_by")} /></label>
          </div>
          <label>เงื่อนไข (แสดงบนคูปอง/เว็บ)<textarea className="inp" rows={2} value={f.note} onChange={set("note")} placeholder="เช่น 1 สิทธิ์/ท่าน · เฉพาะล้างแอร์ · จองภายในวันที่กำหนด" /></label>
          <label className="cp-check"><input type="checkbox" checked={f.active} onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))} /> เปิดใช้งาน (รับคูปองได้)</label>
          {qn > 0 && <label className="cp-check"><input type="checkbox" checked={genNow} onChange={(e) => setGenNow(e.target.checked)} /> สร้างโค้ดทันที {qn} โค้ด (ไว้พิมพ์ลงคูปอง)</label>}
        </div>
        <div className="acc-modal-foot"><button className="btn" disabled={saving} onClick={save}>{saving ? "กำลังบันทึก…" : "บันทึกโปรโมชั่น"}</button></div>
      </div>
    </div>
  );
}
