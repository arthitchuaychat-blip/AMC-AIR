import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listMaterials, listMaterialsLite, listTeams, recordTransactions, listRecentTransactions, deleteTransaction, listOpenJobs, listJobOrders, updateMaterialCost, markPoReceived } from "../lib/api";
import { fmtBaht, fmtNum } from "../lib/format";
import { can } from "../lib/permissions";
import { scheduleLabel } from "../lib/schedule";
import { MaterialThumb, UIcon } from "../icons";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";

const TYPES = [
  { id: "withdraw", th: "เบิกออก", icon: "withdraw", color: "#2563eb", dir: -1 },
  { id: "return",   th: "รับคืน",  icon: "ret",      color: "#16a34a", dir: +1 },
  { id: "purchase", th: "ซื้อเข้า", icon: "purchase", color: "#7c3aed", dir: +1 },
  { id: "damage",   th: "ตัดเสีย", icon: "damage",   color: "#dc2626", dir: -1 },
];
const TYPE_BY = Object.fromEntries(TYPES.map((t) => [t.id, t]));
const REASONS = ["ชำรุด", "หาย", "หมดอายุ", "ใช้ผิดงาน"];

export default function Movements({ role, myTeam, prefill, onPrefillConsumed, withdrawCtx, onWithdrawCtxConsumed }) {
  // ซื้อเข้า/ตัดเสีย/ยกเลิก = สิทธิ์ระดับสโตร์ (ต้องมีสิทธิ์แก้ไข movements และไม่ใช่ช่างภาคสนาม)
  const isAdmin = can(role, "movements", "edit") && role !== "tech" && role !== "lead_tech";
  const isTech = role === "tech";
  const isLead = role === "lead_tech"; // หัวหน้าช่าง: เบิก/คืนได้ทุกทีม (แต่ไม่ซื้อ/ตัดเสีย)
  // ช่าง + หัวหน้าช่าง ทำได้เฉพาะ เบิกออก/รับคืน — no ซื้อ/ตัดเสีย
  const allowedTypes = (isTech || isLead) ? TYPES.filter((t) => t.id === "withdraw" || t.id === "return") : TYPES;
  const [mats, setMats] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [recent, setRecent] = React.useState([]);
  const [jobs, setJobs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [printData, setPrintData] = React.useState(null);

  const [type, setType] = React.useState("withdraw");
  const [team, setTeam] = React.useState("");
  const [jobNo, setJobNo] = React.useState("");
  const [jobOrders, setJobOrders] = React.useState([]);
  const [reason, setReason] = React.useState(REASONS[0]);
  const [damageMode, setDamageMode] = React.useState("job"); // job | central

  // cart flow (withdraw / purchase / central-damage)
  const [lines, setLines] = React.useState([]);
  const [pickCode, setPickCode] = React.useState("");
  const [pickQty, setPickQty] = React.useState(1);
  const [pickPrice, setPickPrice] = React.useState("");
  const [receivePo, setReceivePo] = React.useState(null);
  // picker filters (เหมือนหน้า BOQ): ชนิด + หมวดวัสดุ
  const [mvKind, setMvKind] = React.useState("all"); // all | ac | material
  const [mvCat, setMvCat] = React.useState("all");

  // job flow (return / damage-from-job)
  const [selJob, setSelJob] = React.useState("");
  const [qtyByCode, setQtyByCode] = React.useState({});

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  // job orders assigned to the picked team (active) — for the เบิก job picker, nearest date first
  const teamJobs = React.useMemo(() => jobOrders
    .filter((j) => j.assigned_team === team && j.status !== "cancelled")
    .sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || "")), [jobOrders, team]);
  // only stock-tracked items can move; then narrow by the picker filters
  const matCats = React.useMemo(() => {
    const seen = {}; mats.forEach((m) => { if (m.tracked && m.kind === "material" && m.cat) seen[m.cat] = m.catName || m.cat; });
    return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [mats]);
  const pickList = React.useMemo(() => mats.filter((m) =>
    m.tracked &&
    (mvKind === "all" || m.kind === mvKind) &&
    (mvKind !== "material" || mvCat === "all" || m.cat === mvCat)
  ), [mats, mvKind, mvCat]);
  const T = TYPE_BY[type];
  // which UI flow is active
  const flow = type === "return" ? "job" : type === "damage" ? (damageMode === "job" ? "job" : "cart") : "cart";

  async function load() {
    setLoading(true);
    // lite list (materials table) is the authoritative item set — matches the catalog/BOQ picker;
    // the material_stock view only supplies current stock numbers, merged in by code.
    const [lite, full, tm, r, j, jord] = await Promise.all([listMaterialsLite(), listMaterials(), listTeams(), listRecentTransactions(60), listOpenJobs(), listJobOrders()]);
    setJobOrders(jord || []);
    const stockByCode = {}; full.forEach((x) => { if (x.code != null) stockByCode[x.code] = x.stock; });
    const m = lite.map((x) => (x.code in stockByCode ? { ...x, stock: stockByCode[x.code] } : x));
    setMats(m); setTeams(tm); setRecent(r); setJobs(j);
    const firstTracked = m.find((x) => x.tracked);
    if (!pickCode && firstTracked) setPickCode(firstTracked.code);
    if (!team && tm.length) setTeam(isTech && myTeam ? myTeam : tm[0].id);
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // technicians are locked to their own team
  React.useEffect(() => { if (isTech && myTeam) setTeam(myTeam); }, [isTech, myTeam]);
  React.useEffect(() => { const m = matMap[pickCode]; if (m) setPickPrice(String(m.cost)); }, [pickCode, mats]);
  // when the picker filter narrows the list, keep the selected item valid
  React.useEffect(() => { if (pickList.length && !pickList.some((m) => m.code === pickCode)) setPickCode(pickList[0].code); }, [pickList]);
  // technician "withdraw for this job" → preset type=withdraw, team, job no
  React.useEffect(() => {
    if (!withdrawCtx) return;
    setType("withdraw");
    if (withdrawCtx.team) setTeam(withdrawCtx.team);
    if (withdrawCtx.jobNo) setJobNo(withdrawCtx.jobNo);
    onWithdrawCtxConsumed && onWithdrawCtxConsumed();
  }, [withdrawCtx]);
  // prefill the purchase cart when receiving a PO ({ poNo, items:[{code,qty,price}] })
  React.useEffect(() => {
    if (!prefill || !prefill.items?.length || !mats.length) return;
    setType("purchase");
    setJobNo(prefill.poNo || "");
    setReceivePo(prefill.poNo || null);
    setLines(prefill.items.map((p) => ({ code: p.code, qty: Number(p.qty) || 1, price: p.price ?? matMap[p.code]?.cost ?? 0 })));
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, mats]);
  const printWin = React.useRef(null);
  React.useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintData(null); }, 120);
    return () => clearTimeout(t);
  }, [printData]);

  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 2800); }
  function changeType(t) { setType(t); setLines([]); setSelJob(""); setQtyByCode({}); setJobNo(""); setReceivePo(null); }

  // ----- cart helpers -----
  const linesView = lines.map((l) => {
    const m = matMap[l.code];
    const unit = type === "purchase" ? (l.price ?? m?.cost ?? 0) : (m?.cost || 0);
    return { ...l, m, unit, value: unit * l.qty };
  });
  const cartTotal = linesView.reduce((a, x) => a + x.value, 0);
  function addLine() {
    if (!pickCode || pickQty < 1) return;
    const price = type === "purchase" ? (Number(pickPrice) || 0) : undefined;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.code === pickCode);
      if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qty: c[i].qty + Number(pickQty), price }; return c; }
      return [...ls, { code: pickCode, qty: Number(pickQty), price }];
    });
    setPickQty(1);
  }
  const removeLine = (code) => setLines((ls) => ls.filter((l) => l.code !== code));
  const cartValid = lines.length > 0 && (type === "purchase" || type === "damage" || team);

  async function submitCart() {
    if (!cartValid || busy) return;
    setBusy(true);
    try {
      await recordTransactions(lines.map((l) => ({
        type, job_no: jobNo, team: type === "damage" ? null : team,
        material_code: l.code, qty: l.qty,
        unit_cost: type === "purchase" ? (Number(l.price) || 0) : matMap[l.code].cost, reason,
      })));
      // weighted moving average: recompute each purchased material's unit cost
      if (type === "purchase") {
        for (const l of lines) {
          const m = matMap[l.code]; if (!m) continue;
          const onQty = m.stock, onVal = m.stock * m.cost, pq = l.qty, pp = Number(l.price) || 0;
          const denom = onQty + pq;
          if (denom > 0) await updateMaterialCost(l.code, Math.round(((onVal + pq * pp) / denom) * 100) / 100);
        }
        if (receivePo) { await markPoReceived(receivePo); setReceivePo(null); }
      }
      flash(`${T.th} ${lines.length} รายการ สำเร็จ${receivePo ? " · ปิดใบสั่งซื้อแล้ว" : ""}`);
      setLines([]); setJobNo("");
      await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  // ----- job helpers -----
  const job = jobs.find((j) => j.job_no === selJob);
  const jobValid = job && job.lines.some((l) => Number(qtyByCode[l.code] || 0) > 0);
  async function submitJob() {
    if (!jobValid || busy) return;
    const rows = job.lines
      .map((l) => ({ code: l.code, qty: Number(qtyByCode[l.code] || 0), unitCost: l.unitCost, outstanding: l.outstanding }))
      .filter((l) => l.qty > 0);
    for (const r of rows) if (r.qty > r.outstanding) { flash("จำนวนเกินยอดคงค้าง", true); return; }
    setBusy(true);
    try {
      await recordTransactions(rows.map((r) => ({
        type, job_no: job.job_no, team: job.team, material_code: r.code, qty: r.qty, unit_cost: r.unitCost, reason,
      })));
      flash(`${T.th} งาน ${job.job_no} สำเร็จ`);
      setSelJob(""); setQtyByCode({});
      await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  async function cancel(r) {
    if (!await confirmDialog(`ยกเลิกรายการนี้? (${TYPE_BY[r.type].th} ${matMap[r.material_code]?.th || r.material_code} ${r.qty}) — สต๊อกจะคืนค่าให้`)) return;
    try { await deleteTransaction(r.id); flash("ยกเลิกรายการแล้ว"); await load(); }
    catch (e) { flash("ยกเลิกไม่สำเร็จ: " + (e.message || e), true); }
  }
  function printSlip(row) {
    printWin.current = openPrintWindow();
    const group = row.job_no ? recent.filter((x) => x.job_no === row.job_no && x.type === row.type) : [row];
    setPrintData({
      typeTh: TYPE_BY[row.type].th, job_no: row.job_no, team: row.team, date: row.txn_date,
      lines: group.map((g) => { const m = matMap[g.material_code]; return { th: m?.th || g.material_code, code: g.material_code, qty: g.qty, unit: m?.unit || "", value: Number(g.value || 0), reason: g.reason }; }),
      total: group.reduce((a, g) => a + Number(g.value || 0), 0),
    });
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">บันทึกธุรกรรม <span className="page-title-en">Stock Movements</span></h1>
          <p className="page-sub">รับคืน/ตัดเสีย อ้างอิงงานที่เบิก → ต้นทุนงานแม่นยำ</p>
        </div>
      </div>

      <div className="damage-layout">
        {/* FORM */}
        <div className="card">
          <div className="seg" style={{ marginBottom: 16, display: "flex" }}>
            {allowedTypes.map((t) => (
              <button key={t.id} className={"seg-btn" + (type === t.id ? " on" : "")} onClick={() => changeType(t.id)}
                style={type === t.id ? { background: t.color, boxShadow: "none" } : {}}>{t.th}</button>
            ))}
          </div>

          {/* damage sub-mode */}
          {type === "damage" && (
            <div className="sub-toggle">
              <button className={damageMode === "job" ? "on" : ""} onClick={() => setDamageMode("job")}>เสียจากงานที่เบิก</button>
              <button className={damageMode === "central" ? "on" : ""} onClick={() => setDamageMode("central")}>เสียในคลัง (ส่วนกลาง)</button>
            </div>
          )}

          {/* ============ JOB FLOW (return / damage-from-job) ============ */}
          {flow === "job" && (
            <>
              <label className="fld"><span>เลือกงานที่เบิกค้าง · Open job</span>
                <Combo className="inp" value={selJob} onChange={(e) => { setSelJob(e.target.value); setQtyByCode({}); }}>
                  <option value="">— เลือกงาน —</option>
                  {jobs.filter((j) => !isTech || j.team === myTeam).map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.team || "-"} · ค้าง {j.lines.length} รายการ</option>)}
                </Combo>
              </label>
              {jobs.filter((j) => !isTech || j.team === myTeam).length === 0 && <div className="empty sm">ไม่มีงานที่เบิกค้างอยู่</div>}

              {type === "damage" && job && (
                <label className="fld"><span>สาเหตุ · Reason</span>
                  <Combo className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Combo>
                </label>
              )}

              {job && (
                <div className="line-list">
                  {job.lines.map((l) => {
                    const m = matMap[l.code];
                    return (
                      <div className="job-line" key={l.code}>
                        <MaterialThumb mat={m || { color: "#888" }} size={32} radius={8} />
                        <div className="line-info">
                          <div className="line-name">{m?.th || l.code}</div>
                          <div className="line-sub">เบิก {fmtNum(l.withdrawn)} · คงค้าง <b>{fmtNum(l.outstanding)}</b> {m?.unit}</div>
                        </div>
                        <input className="inp job-qty" type="number" min="0" max={l.outstanding}
                          value={qtyByCode[l.code] || ""} placeholder="0"
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(l.outstanding, Number(e.target.value) || 0));
                            setQtyByCode((s) => ({ ...s, [l.code]: v }));
                          }} />
                      </div>
                    );
                  })}
                </div>
              )}

              <button className="btn-primary big" disabled={!jobValid || busy} onClick={submitJob}
                style={jobValid ? { background: T.color, boxShadow: "none" } : {}}>
                <UIcon name={T.icon} size={17} color="#fff" /> {busy ? "กำลังบันทึก…" : `ยืนยัน${T.th}`}
              </button>
            </>
          )}

          {/* ============ CART FLOW (withdraw / purchase / central-damage) ============ */}
          {flow === "cart" && (
            <>
              {type !== "purchase" && type !== "damage" && (
                <label className="fld"><span>ทีม · Team</span>
                  <div className="team-pick-row">
                    {(isTech ? teams.filter((t) => t.id === myTeam) : teams).map((t) => (
                      <button key={t.id} className={"team-pick" + (team === t.id ? " on" : "")} onClick={() => { if (!isTech) { setTeam(t.id); setJobNo(""); } }}
                        style={team === t.id ? { background: t.color, borderColor: t.color, color: "#fff", cursor: isTech ? "default" : "pointer" } : {}}>
                        <span style={{ width: 8, height: 8, borderRadius: 9, background: team === t.id ? "#fff" : t.color }} />
                        {t.name.replace("Team ", "")}
                      </button>
                    ))}
                  </div>
                </label>
              )}

              <div className="fld-row">
                {type === "purchase" && (
                  <label className="fld"><span>เลขใบสั่งซื้อ (PO)</span>
                    <input className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)} placeholder="เช่น PO-260610-01" />
                  </label>
                )}
                {type !== "purchase" && type !== "damage" && (
                  <label className="fld"><span>ใบงานที่เบิกให้ · Job</span>
                    {!team ? <div className="inp" style={{ color: "var(--ink-3)" }}>เลือกทีมก่อน</div>
                      : teamJobs.length ? (
                        <Combo className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)}>
                          <option value="">— เลือกใบงานของทีมนี้ —</option>
                          {teamJobs.map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.title || j.customerName || "งาน"}{j.scheduled_at ? ` · ${scheduleLabel(j)}` : ""}</option>)}
                        </Combo>
                      ) : (
                        <input className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)} placeholder="ทีมนี้ยังไม่มีใบงาน — พิมพ์เลขงานเองได้" />
                      )}
                  </label>
                )}
                {type === "damage" && (
                  <label className="fld"><span>สาเหตุ · Reason</span>
                    <Combo className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
                      {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Combo>
                  </label>
                )}
              </div>

              <div className="fld"><span>เพิ่มรายการวัสดุ</span>
                <div className="line-add" style={{ marginBottom: 6 }}>
                  <Combo className="inp" style={{ maxWidth: 150 }} value={mvKind} onChange={(e) => { setMvKind(e.target.value); setMvCat("all"); }}>
                    <option value="all">ทุกชนิด</option><option value="material">วัสดุ</option><option value="ac">เครื่องปรับอากาศ</option>
                  </Combo>
                  {mvKind === "material" && (
                    <Combo className="inp" value={mvCat} onChange={(e) => setMvCat(e.target.value)}>
                      <option value="all">ทุกหมวด</option>{matCats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </Combo>
                  )}
                </div>
                <div className="line-add">
                  <Combo className="inp" value={pickCode} onChange={(e) => setPickCode(e.target.value)}>
                    {pickList.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.th} (เหลือ {m.stock} {m.unit})</option>)}
                  </Combo>
                  {type === "purchase" && (
                    <div className="inp inp-unit line-price" title="ราคา/หน่วยที่ซื้อ">
                      <span className="unit-pre">฿</span>
                      <input type="number" min="0" step="0.01" value={pickPrice} onChange={(e) => setPickPrice(e.target.value)} />
                      <span className="unit-suf">/{matMap[pickCode]?.unit || "หน่วย"}</span>
                    </div>
                  )}
                  <div className="inp inp-unit line-qty" title="จำนวน">
                    <input type="number" min="1" value={pickQty} onChange={(e) => setPickQty(Math.max(1, Number(e.target.value) || 1))} />
                    <span className="unit-suf">{matMap[pickCode]?.unit || "หน่วย"}</span>
                  </div>
                  <button className="btn-ghost sm" onClick={addLine}><UIcon name="plus" size={14} /> เพิ่ม</button>
                </div>
                {type === "purchase" && <p className="page-sub" style={{ marginTop: 6 }}>ใส่ราคาที่ซื้อจริงครั้งนี้ · ระบบจะคำนวณต้นทุนเฉลี่ยใหม่ให้อัตโนมัติ</p>}
              </div>

              {linesView.length > 0 && (
                <div className="line-list">
                  {linesView.map((l) => (
                    <div className="line-row" key={l.code}>
                      <MaterialThumb mat={l.m} size={32} radius={8} />
                      <div className="line-info"><div className="line-name">{l.m?.th}</div><div className="line-sub">{l.qty} {l.m?.unit}{type === "purchase" ? ` × ${fmtBaht(l.unit)}` : ""} · {fmtBaht(l.value)}</div></div>
                      <span className="line-dir" style={{ color: T.color }}>{T.dir > 0 ? "+" : "−"}{l.qty}</span>
                      <button className="line-x" onClick={() => removeLine(l.code)}><UIcon name="x" size={14} /></button>
                    </div>
                  ))}
                  <div className="line-total"><span>รวม {lines.length} รายการ</span><b>{fmtBaht(cartTotal)}</b></div>
                </div>
              )}

              <button className="btn-primary big" disabled={!cartValid || busy} onClick={submitCart}
                style={cartValid ? { background: T.color, boxShadow: "none" } : {}}>
                <UIcon name={T.icon} size={17} color="#fff" /> {busy ? "กำลังบันทึก…" : `ยืนยัน${T.th} ${lines.length || ""} รายการ`}
              </button>
              {lines.length === 0 && <p className="page-sub" style={{ marginTop: 8 }}>เพิ่มวัสดุอย่างน้อย 1 รายการก่อนยืนยัน</p>}
            </>
          )}
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
              <div className="slip-brand">
                <img src="/logo.png" alt="" className="slip-logo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                AMC Management
              </div>
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
