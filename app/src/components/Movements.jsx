import React from "react";
import { listMaterials, listTeams, recordTransactions, listRecentTransactions, deleteTransaction } from "../lib/api";
import { fmtBaht, fmtNum } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";

const TYPES = [
  { id: "withdraw", th: "เบิกออก", icon: "withdraw", color: "#2563eb", dir: -1 },
  { id: "return",   th: "รับคืน",  icon: "ret",      color: "#16a34a", dir: +1 },
  { id: "purchase", th: "ซื้อเข้า", icon: "purchase", color: "#7c3aed", dir: +1 },
  { id: "damage",   th: "ตัดเสีย", icon: "damage",   color: "#dc2626", dir: -1 },
];
const TYPE_BY = Object.fromEntries(TYPES.map((t) => [t.id, t]));
const REASONS = ["ชำรุด", "หาย", "หมดอายุ", "ใช้ผิดงาน"];

export default function Movements({ role }) {
  const isAdmin = role === "admin";
  const [mats, setMats] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [recent, setRecent] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const [type, setType] = React.useState("withdraw");
  const [team, setTeam] = React.useState("");
  const [jobNo, setJobNo] = React.useState("");
  const [reason, setReason] = React.useState(REASONS[0]);
  const [lines, setLines] = React.useState([]);            // [{code, qty}]
  const [pickCode, setPickCode] = React.useState("");
  const [pickQty, setPickQty] = React.useState(1);
  const [printData, setPrintData] = React.useState(null);

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  const T = TYPE_BY[type];

  async function load() {
    setLoading(true);
    const [m, tm, r] = await Promise.all([listMaterials(), listTeams(), listRecentTransactions(60)]);
    setMats(m); setTeams(tm); setRecent(r);
    if (!pickCode && m.length) setPickCode(m[0].code);
    if (!team && tm.length) setTeam(tm[0].id);
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  // fire the browser print dialog once the slip is in the DOM
  React.useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => { window.print(); setPrintData(null); }, 80);
    return () => clearTimeout(t);
  }, [printData]);

  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 2800); }

  const linesView = lines.map((l) => { const m = matMap[l.code]; return { ...l, m, value: (m?.cost || 0) * l.qty }; });
  const totalValue = linesView.reduce((a, x) => a + x.value, 0);
  const totalQty = lines.reduce((a, l) => a + l.qty, 0);
  const valid = lines.length > 0 && (type === "purchase" || team);

  function addLine() {
    if (!pickCode || pickQty < 1) return;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.code === pickCode);
      if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qty: c[i].qty + Number(pickQty) }; return c; }
      return [...ls, { code: pickCode, qty: Number(pickQty) }];
    });
    setPickQty(1);
  }
  const removeLine = (code) => setLines((ls) => ls.filter((l) => l.code !== code));

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await recordTransactions(lines.map((l) => ({
        type, job_no: jobNo, team, material_code: l.code, qty: l.qty, unit_cost: matMap[l.code].cost, reason,
      })));
      flash(`${T.th} ${lines.length} รายการ สำเร็จ`);
      setLines([]); setJobNo("");
      await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  async function cancel(r) {
    if (!confirm(`ยกเลิกรายการนี้? (${TYPE_BY[r.type].th} ${matMap[r.material_code]?.th || r.material_code} ${r.qty}) — สต๊อกจะคืนค่าให้`)) return;
    try { await deleteTransaction(r.id); flash("ยกเลิกรายการแล้ว"); await load(); }
    catch (e) { flash("ยกเลิกไม่สำเร็จ: " + (e.message || e), true); }
  }

  function printSlip(row) {
    const group = row.job_no ? recent.filter((x) => x.job_no === row.job_no && x.type === row.type) : [row];
    setPrintData({
      typeTh: TYPE_BY[row.type].th,
      job_no: row.job_no, team: row.team, date: row.txn_date,
      lines: group.map((g) => { const m = matMap[g.material_code]; return { th: m?.th || g.material_code, code: g.material_code, qty: g.qty, unit: m?.unit || "", value: Number(g.value || 0), reason: g.reason }; }),
      total: group.reduce((a, g) => a + Number(g.value || 0), 0),
    });
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">บันทึกธุรกรรม <span className="page-title-en">Stock Movements</span></h1>
          <p className="page-sub">เบิก · คืน · ซื้อเข้า · ตัดของเสีย — ใบเดียวเพิ่มได้หลายรายการ</p>
        </div>
      </div>

      <div className="damage-layout">
        {/* FORM */}
        <div className="card">
          <div className="seg" style={{ marginBottom: 16, display: "flex" }}>
            {TYPES.map((t) => (
              <button key={t.id} className={"seg-btn" + (type === t.id ? " on" : "")} onClick={() => setType(t.id)}
                style={type === t.id ? { background: t.color, boxShadow: "none" } : {}}>{t.th}</button>
            ))}
          </div>

          {type !== "purchase" && (
            <label className="fld"><span>ทีม · Team</span>
              <div className="team-pick-row">
                {teams.map((t) => (
                  <button key={t.id} className={"team-pick" + (team === t.id ? " on" : "")} onClick={() => setTeam(t.id)}
                    style={team === t.id ? { background: t.color, borderColor: t.color, color: "#fff" } : {}}>
                    <span style={{ width: 8, height: 8, borderRadius: 9, background: team === t.id ? "#fff" : t.color }} />
                    {t.name.replace("Team ", "")}
                  </button>
                ))}
              </div>
            </label>
          )}

          <div className="fld-row">
            <label className="fld"><span>{type === "purchase" ? "เลขใบสั่งซื้อ (PO)" : "เลขที่งาน · Job No."}</span>
              <input className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)}
                placeholder={type === "purchase" ? "เช่น PO-260610-01" : "เช่น JB-260610-03"} />
            </label>
            {type === "damage" && (
              <label className="fld"><span>สาเหตุ · Reason</span>
                <select className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
          </div>

          {/* line adder */}
          <div className="fld"><span>เพิ่มรายการวัสดุ</span>
            <div className="line-add">
              <select className="inp" value={pickCode} onChange={(e) => setPickCode(e.target.value)}>
                {mats.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.th} (เหลือ {m.stock} {m.unit})</option>)}
              </select>
              <input className="inp line-qty" type="number" min="1" value={pickQty}
                onChange={(e) => setPickQty(Math.max(1, Number(e.target.value) || 1))} />
              <button className="btn-ghost sm" onClick={addLine}><UIcon name="plus" size={14} /> เพิ่ม</button>
            </div>
          </div>

          {/* lines list */}
          {linesView.length > 0 && (
            <div className="line-list">
              {linesView.map((l) => (
                <div className="line-row" key={l.code}>
                  <MaterialThumb mat={l.m} size={32} radius={8} />
                  <div className="line-info"><div className="line-name">{l.m?.th}</div><div className="line-sub">{l.qty} {l.m?.unit} · {fmtBaht(l.value)}</div></div>
                  <span className="line-dir" style={{ color: T.color }}>{T.dir > 0 ? "+" : "−"}{l.qty}</span>
                  <button className="line-x" onClick={() => removeLine(l.code)}><UIcon name="x" size={14} /></button>
                </div>
              ))}
              <div className="line-total"><span>รวม {lines.length} รายการ · {fmtNum(totalQty)} หน่วย</span><b>{fmtBaht(totalValue)}</b></div>
            </div>
          )}

          <button className="btn-primary big" disabled={!valid || busy} onClick={submit}
            style={valid ? { background: T.color, boxShadow: "none" } : {}}>
            <UIcon name={T.icon} size={17} color="#fff" /> {busy ? "กำลังบันทึก…" : `ยืนยัน${T.th} ${lines.length || ""} รายการ`}
          </button>
          {lines.length === 0 && <p className="page-sub" style={{ marginTop: 8 }}>เพิ่มวัสดุอย่างน้อย 1 รายการก่อนยืนยัน</p>}
        </div>

        {/* RECENT */}
        <div className="card">
          <div className="sec-head"><div className="sec-title">รายการล่าสุด <span className="sec-sub">{recent.length} รายการ · กดพิมพ์/ยกเลิกได้</span></div></div>
          {loading && <div className="empty sm">กำลังโหลด…</div>}
          {!loading && recent.length === 0 && <div className="empty sm">ยังไม่มีธุรกรรม</div>}
          <div className="ledger">
            {recent.map((r) => {
              const m = matMap[r.material_code];
              const mv = TYPE_BY[r.type];
              return (
                <div className="ledger-row" key={r.id}>
                  <span className="ledger-badge" style={{ background: `color-mix(in srgb, ${mv.color} 13%, white)`, color: mv.color }}>
                    <UIcon name={mv.icon} size={14} strokeWidth={2} color={mv.color} />
                  </span>
                  <div className="ledger-info">
                    <div className="ledger-type" style={{ color: mv.color }}>{mv.th} · {m ? m.th : r.material_code}</div>
                    <div className="ledger-meta">
                      {r.team ? <>{r.team}<span className="dot">·</span></> : null}
                      {r.job_no ? <><span className="tx-job">{r.job_no}</span><span className="dot">·</span></> : null}
                      {r.reason ? <><span className="reason-tag sm">{r.reason}</span><span className="dot">·</span></> : null}
                      {r.txn_date}
                    </div>
                  </div>
                  <div className="ledger-amt">
                    <div className="ledger-qty" style={{ color: mv.color }}>{mv.dir > 0 ? "+" : "−"}{fmtNum(r.qty)} {m?.unit || ""}</div>
                    <div className="ledger-date">{fmtBaht(r.value)}</div>
                  </div>
                  <div className="led-actions">
                    <button className="led-btn" title="พิมพ์" onClick={() => printSlip(r)}><UIcon name="catalog" size={14} /></button>
                    {isAdmin && <button className="led-btn danger" title="ยกเลิก" onClick={() => cancel(r)}><UIcon name="trash" size={14} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* print slip (hidden on screen) */}
      <div className="print-area">
        {printData && (
          <div className="slip">
            <div className="slip-head">
              <div className="slip-brand">วัสดุOS</div>
              <div className="slip-title">ใบ{printData.typeTh}</div>
            </div>
            <div className="slip-meta">
              <div>ประเภท: <b>{printData.typeTh}</b></div>
              <div>เลขที่งาน/PO: <b>{printData.job_no || "-"}</b></div>
              <div>ทีม: <b>{printData.team || "-"}</b></div>
              <div>วันที่: <b>{printData.date}</b></div>
            </div>
            <table className="slip-table">
              <thead><tr><th>#</th><th>วัสดุ</th><th>รหัส</th><th className="r">จำนวน</th><th className="r">มูลค่า</th></tr></thead>
              <tbody>
                {printData.lines.map((l, i) => (
                  <tr key={i}><td>{i + 1}</td><td>{l.th}{l.reason ? ` (${l.reason})` : ""}</td><td>{l.code}</td><td className="r">{fmtNum(l.qty)} {l.unit}</td><td className="r">{fmtBaht(l.value)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="4" className="r">รวมทั้งสิ้น</td><td className="r"><b>{fmtBaht(printData.total)}</b></td></tr></tfoot>
            </table>
            <div className="slip-sign"><div>ผู้เบิก/ผู้รับ ......................</div><div>ผู้อนุมัติ ......................</div></div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600,
          padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center",
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
