import React from "react";
import { listCoupons, couponStats, redeemCoupon, voidCoupon, issueCoupon } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";

const CAMPAIGN = "clean750";
const thDate = (s) => s ? new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const SRC = { web: ["🌐 เว็บ", "#dbeafe", "#1e40af"], line: ["💚 LINE", "#dcfce7", "#166534"], fb: ["💙 FB", "#dbeafe", "#1e40af"], manual: ["🏪 หน้าร้าน", "#f3e8ff", "#6b21a8"] };
const ST = { claimed: ["รับแล้ว", "#fef3c7", "#92400e"], redeemed: ["ใช้แล้ว ✓", "#dcfce7", "#166534"], void: ["ยกเลิก", "#f1f5f9", "#64748b"], expired: ["หมดอายุ", "#fee2e2", "#991b1b"] };

export default function Coupons() {
  const [rows, setRows] = React.useState([]);
  const [stat, setStat] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [rCode, setRCode] = React.useState(""); const [rRef, setRRef] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3000); };

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([listCoupons(CAMPAIGN).catch(() => []), couponStats(CAMPAIGN).catch(() => null)])
      .then(([r, s]) => { setRows(r); setStat(s); }).finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const [issueName, setIssueName] = React.useState(""); const [issuePhone, setIssuePhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function doRedeem() {
    if (!rCode.trim()) return flash("กรอกโค้ด", true);
    setBusy(true);
    try { const row = await redeemCoupon(rCode, rRef); flash(`ใช้โค้ดสำเร็จ · ${row.name || ""} (หัก ${fmtBaht(stat?.campaign?.value || 0)})`); setRCode(""); setRRef(""); load(); }
    catch (e) { flash(e.message || "ไม่สำเร็จ", true); } finally { setBusy(false); }
  }
  async function doIssue() {
    if (!issueName.trim() || !issuePhone.trim()) return flash("กรอกชื่อ + เบอร์", true);
    setBusy(true);
    try {
      const j = await issueCoupon({ name: issueName, phone: issuePhone, source: "manual" });
      if (j.full) flash(j.message || "คูปองแจกครบแล้ว", true);
      else flash(`${j.already ? "มีโค้ดอยู่แล้ว" : "ออกโค้ดสำเร็จ"}: ${j.code}`);
      setIssueName(""); setIssuePhone(""); load();
    } catch (e) { flash(e.message || "ไม่สำเร็จ", true); } finally { setBusy(false); }
  }
  async function doVoid(row) {
    if (!(await confirmDialog({ title: `ยกเลิกโค้ด ${row.code}?`, message: `ของ ${row.name || "-"} · ${row.phone || "-"}`, confirmText: "ยกเลิกโค้ด", danger: true }))) return;
    try { await voidCoupon(row.code); flash("ยกเลิกแล้ว"); load(); } catch (e) { flash(e.message || "ไม่สำเร็จ", true); }
  }
  function exportCsv() {
    const head = ["วันที่รับ", "ชื่อ", "เบอร์", "ช่องทาง", "โค้ด", "สถานะ", "ใช้เมื่อ", "ผูกงาน"];
    const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const body = rows.map((r) => [r.claimed_at, r.name, r.phone, r.source, r.code, r.status, r.redeemed_at || "", r.redeemed_ref || ""].map(esc).join(","));
    const csv = "﻿" + [head.map(esc).join(","), ...body].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `coupons-${CAMPAIGN}.csv`; a.click();
  }

  const shown = rows.filter((r) => !q || [r.name, r.phone, r.code].some((x) => (x || "").toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">คูปอง / โปรโมชั่น <span className="page-title-en">Coupons</span></h1>
          <p className="page-sub">{stat?.campaign?.name || "คูปองล้างแอร์"} · เก็บ lead ลูกค้าเพื่อขายซ้ำ</p>
        </div>
      </div>

      {/* สรุปแคมเปญ */}
      {stat && (
        <div className="cp-stats">
          <div className="cp-stat"><span>รับไปแล้ว</span><b>{stat.claimed}{stat.quota ? ` / ${stat.quota}` : ""}</b></div>
          <div className="cp-stat"><span>ใช้โค้ดแล้ว</span><b className="ok">{stat.redeemed}</b></div>
          <div className="cp-stat"><span>เหลือแจก</span><b>{stat.remaining != null ? stat.remaining : "ไม่จำกัด"}</b></div>
          <div className="cp-stat"><span>มูลค่า/ใบ</span><b>{fmtBaht(stat.campaign?.value || 0)}</b></div>
          {stat.quota > 0 && <div className="cp-bar"><div className="cp-bar-fill" style={{ width: `${Math.min(100, stat.claimed / stat.quota * 100)}%` }} /></div>}
        </div>
      )}

      {/* ใช้โค้ด + ออกโค้ดเอง */}
      <div className="cp-actions">
        <div className="cp-box">
          <div className="cp-box-t">✅ ใช้โค้ด (ตอนลูกค้าจอง)</div>
          <div className="cp-box-row">
            <input className="inp" placeholder="กรอกโค้ด เช่น CLN750-XXXXX" value={rCode} onChange={(e) => setRCode(e.target.value)} />
            <input className="inp" placeholder="ผูกใบเสนอ/ใบงาน (ไม่บังคับ)" value={rRef} onChange={(e) => setRRef(e.target.value)} />
            <button className="btn" disabled={busy} onClick={doRedeem}>ใช้โค้ด</button>
          </div>
        </div>
        <div className="cp-box">
          <div className="cp-box-t">🎟️ ออกโค้ดให้ลูกค้า (หน้าร้าน)</div>
          <div className="cp-box-row">
            <input className="inp" placeholder="ชื่อลูกค้า" value={issueName} onChange={(e) => setIssueName(e.target.value)} />
            <input className="inp" placeholder="เบอร์โทร" value={issuePhone} onChange={(e) => setIssuePhone(e.target.value)} />
            <button className="btn-ghost" disabled={busy} onClick={doIssue}>ออกโค้ด</button>
          </div>
        </div>
      </div>

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}

      {/* รายชื่อ lead */}
      <div className="cp-listbar">
        <div className="cat-search" style={{ maxWidth: 320 }}>
          <input placeholder="ค้นหา ชื่อ / เบอร์ / โค้ด" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="acc-hint">{shown.length} ราย</span>
        <button className="btn-ghost sm" style={{ marginLeft: "auto" }} onClick={exportCsv} disabled={!rows.length}>⬇ ออก Excel (CSV)</button>
      </div>

      <div className="acc-card" style={{ padding: 0 }}>
        {loading ? <div className="empty">กำลังโหลด…</div> : shown.length === 0 ? (
          <div className="empty">ยังไม่มีลูกค้ารับคูปอง — ออกโค้ดเอง หรือรอลูกค้ารับผ่านเว็บ/แชต</div>
        ) : (
          <table className="acc-table cp-table">
            <thead><tr><th>วันที่</th><th>ชื่อ</th><th>เบอร์</th><th>ช่องทาง</th><th>โค้ด</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {shown.map((r) => { const src = SRC[r.source] || [r.source, "#f1f5f9", "#475569"]; const st = ST[r.status] || [r.status, "#f1f5f9", "#475569"]; return (
                <tr key={r.code}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{thDate(r.claimed_at)}</td>
                  <td>{r.name || "-"}</td>
                  <td className="mono">{r.phone || "-"}</td>
                  <td><span className="cp-badge" style={{ background: src[1], color: src[2] }}>{src[0]}</span></td>
                  <td className="mono">{r.code}</td>
                  <td><span className="cp-badge" style={{ background: st[1], color: st[2] }}>{st[0]}</span>{r.redeemed_ref ? <span className="acc-jl-memo"> · {r.redeemed_ref}</span> : null}</td>
                  <td>{r.status !== "void" && r.status !== "redeemed" && <button className="acc-je-void" title="ยกเลิกโค้ด" onClick={() => doVoid(r)}>✕</button>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
