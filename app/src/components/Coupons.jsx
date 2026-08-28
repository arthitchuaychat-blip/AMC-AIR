import React from "react";
import { listCoupons, couponStats, redeemCoupon, voidCoupon, listCampaigns, saveCampaign, getAutoReply, saveAutoReply, claimByCode, clearCoupons } from "../lib/api";
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
  const [campModal, setCampModal] = React.useState(null);
  const [kwOn, setKwOn] = React.useState(true); const [kwCfg, setKwCfg] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3200); };

  const camp = camps.find((c) => c.id === campId) || stat?.campaign || null;
  const discLabel = (c, v) => (c?.discount_type === "percent" ? `${Number(v ?? c?.value) || 0}%` : fmtBaht(Number(v ?? c?.value) || 0));

  const loadCamps = React.useCallback(() => {
    listCampaigns().then((cs) => { setCamps(cs); setCampId((id) => id || cs[0]?.id || "clean750"); }).catch(() => setCampId("clean750"));
  }, []);
  React.useEffect(() => { loadCamps(); }, [loadCamps]);
  React.useEffect(() => { getAutoReply().then((c) => { setKwCfg(c || {}); setKwOn((c?.coupon_kw) !== false); }).catch(() => {}); }, []);
  async function toggleKw() {
    const next = !kwOn; setKwOn(next);
    try { const cfg = { ...(kwCfg || {}), coupon_kw: next }; await saveAutoReply(cfg); setKwCfg(cfg); flash(next ? "เปิดบอทแจกคูปองในแชตแล้ว" : "ปิดบอทแจกคูปองในแชตแล้ว"); }
    catch (e) { setKwOn(!next); flash(e.message || "บันทึกไม่สำเร็จ", true); }
  }

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
    try {
      let code = rCode.trim();
      // ถ้าเป็น "โค้ดโปร" (public code) → เจนรหัสส่วนลดรายคนก่อน แล้วค่อยใช้
      const r = await claimByCode(code, { name: rName, phone: rPhone, source: "manual" });
      if (r.code) code = r.code;
      else if (r.full) throw new Error("โปรนี้เต็มโควตาแล้ว");
      else if (r.closed) throw new Error("โปรนี้หมดเวลารับแล้ว");
      // r.notfound = ไม่ใช่โค้ดโปร → ถือว่าเป็นรหัสรายคน ลอง redeem ตรง ๆ
      const row = await redeemCoupon(code, { name: rName, phone: rPhone, ref: rRef, area: rArea, appoint_at: rAppoint || null, source: "manual" });
      flash(`ใช้โค้ดสำเร็จ · ${row.name || rName || ""} (หัก ${discLabel(camp)})`); setRCode(""); setRName(""); setRPhone(""); setRRef(""); setRArea(""); setRAppoint(""); load();
    }
    catch (e) { flash(e.message || "ไม่สำเร็จ", true); } finally { setBusy(false); }
  }
  async function doClear() {
    if (!(await confirmDialog({ title: "ล้างรหัสส่วนลดทั้งหมด?", message: `ลบรหัสส่วนลดที่ออกไปแล้วทั้งหมดของโปร "${camp?.name || campId}" (${rows.length} รหัส) เพื่อเริ่มทดสอบใหม่\n\nโปรโมชั่น + โค้ดโปร ไม่ถูกลบ`, confirmText: "ล้างรหัสทั้งหมด", danger: true, prompt: { label: "พิมพ์ ล้าง เพื่อยืนยัน", placeholder: "ล้าง", required: true } }))) return;
    setBusy(true);
    try { await clearCoupons(campId); flash("ล้างรหัสส่วนลดแล้ว — เริ่มทดสอบใหม่ได้เลย"); load(); }
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
  async function copyPub() {
    if (!camp?.public_code) return flash("ยังไม่ได้ตั้งโค้ด", true);
    try { await navigator.clipboard.writeText(camp.public_code); flash(`คัดลอกโค้ด ${camp.public_code} แล้ว`); }
    catch { flash("คัดลอกไม่ได้", true); }
  }
  function printCoupon() {
    if (!camp?.public_code) return flash("ยังไม่ได้ตั้งโค้ด", true);
    const w = window.open("", "_blank"); if (!w) return;
    const cond = camp?.note ? `<p style="color:#475569;font-size:14px">${camp.note}</p>` : "";
    w.document.write(`<html><head><meta charset="utf-8"><title>คูปอง ${camp.public_code}</title><style>body{font-family:'Sarabun',system-ui,sans-serif;padding:24px;text-align:center}.cp{max-width:420px;margin:0 auto;border:2.5px dashed #1466c4;border-radius:20px;padding:26px}.cp h1{margin:0 0 4px;color:#0d4f9e}.v{font-size:40px;font-weight:800;color:#0ea5a5;margin:6px 0}.code{font-size:30px;font-weight:800;letter-spacing:3px;background:#0f2540;color:#fff;border-radius:12px;padding:12px;margin:12px 0}.hint{font-size:13px;color:#475569}</style></head><body><div class="cp"><h1>${camp.name}</h1><div class="v">ลด ${discLabel(camp)}</div>${cond}<div class="hint">พิมพ์โค้ดนี้ในไลน์/เฟซบุ๊ก AMC AIR หรือส่งรูปคูปอง</div><div class="code">${camp.public_code}</div><div class="hint">AMC AIR · 099-262-9090 · www.amcair.net</div></div><script>window.onload=function(){window.print()}</script></body></html>`);
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
        <button className={"cp-kw" + (kwOn ? " on" : "")} onClick={toggleKw} title='ลูกค้าพิมพ์ "คูปอง" ในแชต LINE/FB แล้วบอทออกโค้ดให้อัตโนมัติ'>
          <span className="cp-kw-dot" /> บอทแจกคูปองในแชต: {kwOn ? "เปิด" : "ปิด"}
        </button>
      </div>

      {/* สรุป */}
      {stat && (
        <div className="cp-stats">
          <div className="cp-stat"><span>รับส่วนลดแล้ว</span><b>{stat.total}{stat.quota ? ` / ${stat.quota}` : ""}</b></div>
          <div className="cp-stat"><span>ยังไม่ใช้</span><b>{stat.claimed + stat.available}</b></div>
          <div className="cp-stat"><span>ใช้แล้ว</span><b className="ok">{stat.redeemed}</b></div>
          <div className="cp-stat"><span>เหลือโควตา</span><b>{stat.canGenerate != null ? stat.canGenerate : "ไม่จำกัด"}</b></div>
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
          <div className="cp-box-t">🎟️ โค้ดโปรโมชั่นของโปรนี้ (พิมพ์ลงคูปองแจก)</div>
          <div className="cp-box-col">
            {camp?.public_code
              ? <><div className="cp-pubcode">{camp.public_code}</div>
                <div className="cp-box-row">
                  <button className="btn-ghost sm" onClick={copyPub}>📋 คัดลอกโค้ด</button>
                  <button className="btn-ghost sm" onClick={printCoupon}>🖨️ พิมพ์คูปอง</button>
                </div>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>ลูกค้าพิมพ์โค้ดนี้ในไลน์/FB หรือส่งรูปคูปอง → ระบบออกรหัสส่วนลดเฉพาะเขาให้เอง</span></>
              : <span style={{ fontSize: 13, color: "var(--ink-3)" }}>ยังไม่ได้ตั้งโค้ด — กด “✎ แก้ไข” เพื่อกำหนดโค้ดโปรโมชั่น</span>}
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
        <button className="btn-ghost sm" style={{ color: "#b91c1c" }} onClick={doClear} disabled={busy || !rows.length}>🗑️ ล้างรหัสทดสอบ</button>
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
  const [f, setF] = React.useState({ id: init.id, name: init.name || "", public_code: init.public_code || "", discount_type: init.discount_type || "amount", value: init.value ?? "", quota: init.quota ?? "", valid_from: init.valid_from || "", claim_until: init.claim_until || "", use_by: init.use_by || "", note: init.note || "", active: init.active !== false });
  const [saving, setSaving] = React.useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save() {
    if (!f.name.trim()) return onError("ตั้งชื่อโปรโมชั่น");
    if (!f.public_code.trim()) return onError("กำหนดโค้ดโปรโมชั่น (เช่น CLEAN750)");
    setSaving(true);
    try { const id = await saveCampaign(f); onSaved(id, "บันทึกโปรโมชั่นแล้ว"); } catch (e) { onError(e.message || "บันทึกไม่สำเร็จ"); setSaving(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{init._new ? "สร้างโปรโมชั่นใหม่" : "แก้ไขโปรโมชั่น"} <button className="modal-x" onClick={onClose}>✕</button></div>
        <div className="cp-form">
          <label>ชื่อโปรโมชั่น<input className="inp" value={f.name} onChange={set("name")} placeholder="เช่น คูปองล้างแอร์ ฿750" /></label>
          <label>โค้ดโปรโมชั่น (โค้ดเดียว · พิมพ์บนคูปอง/ให้ลูกค้าพิมพ์)<input className="inp" value={f.public_code} onChange={(e) => setF((s) => ({ ...s, public_code: e.target.value.toUpperCase() }))} placeholder="เช่น CLEAN750" style={{ fontWeight: 700, letterSpacing: 1 }} /></label>
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
          <label className="cp-check"><input type="checkbox" checked={f.active} onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))} /> เปิดใช้งาน (รับส่วนลดได้)</label>
        </div>
        <div className="acc-modal-foot"><button className="btn" disabled={saving} onClick={save}>{saving ? "กำลังบันทึก…" : "บันทึกโปรโมชั่น"}</button></div>
      </div>
    </div>
  );
}
