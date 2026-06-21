import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listMaterials, listMaterialsLite, listTeams, recordTransactions, listRecentTransactions, deleteTransaction, updateTransaction, listOpenJobs, listJobOrders, updateMaterialCost, markPoReceived } from "../lib/api";
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
  const [expanded, setExpanded] = React.useState(() => new Set()); // group keys that are open
  const [editId, setEditId] = React.useState(null);   // transaction id being edited
  const [editQty, setEditQty] = React.useState("");

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
  const [pickSearch, setPickSearch] = React.useState("");
  const [qtyModal, setQtyModal] = React.useState(null); // material being added (food-menu style)
  const [modalQty, setModalQty] = React.useState(1);
  const [modalPrice, setModalPrice] = React.useState("");
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
  const pickList = React.useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return mats.filter((m) =>
      m.tracked &&
      (mvKind === "all" || m.kind === mvKind) &&
      (mvKind !== "material" || mvCat === "all" || m.cat === mvCat) &&
      (!q || `${m.code} ${m.th || ""} ${m.name || ""}`.toLowerCase().includes(q))
    );
  }, [mats, mvKind, mvCat, pickSearch]);
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
  // add/merge a line directly (used by the visual picker modal)
  function addItem(code, qty, price) {
    const q = Number(qty) || 0;
    if (!code || q < 1) return;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.code === code);
      if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qty: c[i].qty + q, price }; return c; }
      return [...ls, { code, qty: q, price }];
    });
  }
  function openQty(m) { setQtyModal(m); setModalQty(1); setModalPrice(String(m.cost ?? 0)); }
  function addFromModal() {
    if (!qtyModal) return;
    addItem(qtyModal.code, modalQty, type === "purchase" ? (Number(modalPrice) || 0) : undefined);
    setQtyModal(null);
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
  // group the recent ledger by recording batch (ref_no) → one record action = one line,
  // even for the same job. Fallback key for legacy rows without a ref: created-at second.
  const groups = React.useMemo(() => {
    const map = new Map();
    for (const r of recent) {
      const key = r.ref_no || (r.created_at ? `t${String(r.created_at).slice(0, 19)}` : `id${r.id}`);
      let g = map.get(key);
      if (!g) { g = { key, ref_no: r.ref_no, type: r.type, job_no: r.job_no, team: r.team, date: r.txn_date, rows: [] }; map.set(key, g); }
      g.rows.push(r);
    }
    return [...map.values()];
  }, [recent]);
  const toggle = (key) => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  function printGroup(g) {
    printWin.current = openPrintWindow();
    setPrintData({
      typeTh: TYPE_BY[g.type].th, ref_no: g.ref_no, job_no: g.job_no, team: g.team, date: g.date,
      lines: g.rows.map((x) => { const m = matMap[x.material_code]; return { th: m?.th || x.material_code, code: x.material_code, qty: x.qty, unit: m?.unit || "", value: Number(x.value || 0), reason: x.reason }; }),
      total: g.rows.reduce((a, x) => a + Number(x.value || 0), 0),
    });
  }
  async function saveEdit(r) {
    const q = Number(editQty) || 0;
    if (q < 1) { flash("จำนวนต้องมากกว่า 0", true); return; }
    if (q === Number(r.qty)) { setEditId(null); return; }
    try { await updateTransaction(r.id, q); setEditId(null); flash("แก้ไขจำนวนแล้ว ✓"); await load(); }
    catch (e) { flash("แก้ไขไม่สำเร็จ: " + (e.message || e), true); }
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
                <div className="cat-search mv-search" style={{ marginBottom: 8 }}>
                  <UIcon name="search" size={16} color="var(--ink-3)" />
                  <input placeholder="พิมพ์ค้นหา รหัส / ชื่อวัสดุ" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} />
                  {pickSearch && <button className="cat-search-x" onClick={() => setPickSearch("")}><UIcon name="x" size={14} /></button>}
                </div>
                <div className="mv-grid">
                  {pickList.length === 0 && <div className="empty sm" style={{ gridColumn: "1/-1" }}>ไม่พบวัสดุตามตัวกรอง</div>}
                  {pickList.map((m) => (
                    <button type="button" className="mv-card" key={m.code} onClick={() => openQty(m)} title="กดเพื่อเพิ่มเข้ารายการ">
                      <MaterialThumb mat={m} size={44} radius={10} />
                      <div className="mv-card-info">
                        <div className="mv-card-name">{m.th || m.name}</div>
                        <div className="mv-card-sub">{m.code} · เหลือ <b>{fmtNum(m.stock)}</b> {m.unit}</div>
                      </div>
                      <span className="mv-card-add"><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /></span>
                    </button>
                  ))}
                </div>
                {type === "purchase" && <p className="page-sub" style={{ marginTop: 6 }}>กดวัสดุ → ใส่ราคาที่ซื้อจริง + จำนวน · ระบบคำนวณต้นทุนเฉลี่ยใหม่ให้อัตโนมัติ</p>}
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
            {groups.map((g) => {
              const mv = TYPE_BY[g.type];
              const open = expanded.has(g.key);
              const single = g.rows.length === 1;
              const firstM = matMap[g.rows[0].material_code];
              const total = g.rows.reduce((a, x) => a + Number(x.value || 0), 0);
              return (
                <div className={"ledger-group" + (open ? " open" : "")} key={g.key}>
                  <div className="ledger-row" role="button" tabIndex={0} onClick={() => toggle(g.key)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(g.key)}>
                    <span className="ledger-badge" style={{ background: `color-mix(in srgb, ${mv.color} 13%, white)`, color: mv.color }}>
                      <UIcon name={mv.icon} size={14} strokeWidth={2} color={mv.color} />
                    </span>
                    <div className="ledger-info">
                      <div className="ledger-type" style={{ color: mv.color }}>{mv.th} · {single ? (firstM ? firstM.th : g.rows[0].material_code) : `${g.rows.length} รายการ`}</div>
                      <div className="ledger-meta">
                        {g.ref_no ? <><span className="tx-ref">{g.ref_no}</span><span className="dot">·</span></> : null}
                        {g.team ? <>{g.team}<span className="dot">·</span></> : null}
                        {g.job_no ? <><span className="tx-job">{g.job_no}</span><span className="dot">·</span></> : null}
                        {g.date}
                      </div>
                    </div>
                    <div className="ledger-amt">
                      <div className="ledger-qty" style={{ color: mv.color }}>{single ? `${mv.dir > 0 ? "+" : "−"}${fmtNum(g.rows[0].qty)} ${firstM?.unit || ""}` : `${g.rows.length} ชนิด`}</div>
                      <div className="ledger-date">{fmtBaht(total)}</div>
                    </div>
                    <div className="led-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="led-btn" title="พิมพ์" onClick={() => printGroup(g)}><UIcon name="catalog" size={14} /></button>
                      <button className="led-btn" title={open ? "ย่อ" : "ดูรายการ"} onClick={() => toggle(g.key)}><UIcon name={open ? "chevD" : "chevR"} size={14} /></button>
                    </div>
                  </div>
                  {open && (
                    <div className="ledger-items">
                      {g.rows.map((r) => { const m = matMap[r.material_code]; const editing = editId === r.id; return (
                        <div className="ledger-item" key={r.id}>
                          <div className="li-name">{m ? m.th : r.material_code} <span className="li-code">{r.material_code}</span>{r.reason ? <span className="reason-tag sm">{r.reason}</span> : null}</div>
                          {editing
                            ? <span className="inp inp-unit li-edit"><input type="number" min="1" value={editQty} autoFocus onChange={(e) => setEditQty(e.target.value)} /><span className="unit-suf">{m?.unit || ""}</span></span>
                            : <span className="li-qty" style={{ color: mv.color }}>{mv.dir > 0 ? "+" : "−"}{fmtNum(r.qty)} {m?.unit || ""}</span>}
                          <span className="li-val">{fmtBaht(r.value)}</span>
                          <div className="led-actions">
                            {isAdmin && (editing
                              ? <><button className="led-btn" title="บันทึก" onClick={() => saveEdit(r)}><UIcon name="check" size={14} /></button>
                                   <button className="led-btn" title="ยกเลิกแก้ไข" onClick={() => setEditId(null)}><UIcon name="x" size={14} /></button></>
                              : <>
                                  <button className="led-btn" title="แก้ไขจำนวน" onClick={() => { setEditId(r.id); setEditQty(String(r.qty)); }}><UIcon name="edit" size={14} /></button>
                                  <button className="led-btn danger" title="ยกเลิก" onClick={() => cancel(r)}><UIcon name="trash" size={14} /></button>
                                </>)}
                          </div>
                        </div>
                      ); })}
                      {!single && <div className="ledger-item li-total"><div className="li-name">รวม {g.rows.length} รายการ</div><span className="li-val"><b>{fmtBaht(total)}</b></span><div /></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* qty picker modal (food-menu style) */}
      {qtyModal && (
        <div className="modal-overlay" onClick={() => setQtyModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <div className="modal-head"><div className="modal-title">เพิ่มรายการ · {T.th}</div>
              <button className="modal-x" onClick={() => setQtyModal(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <div className="mv-pick-head">
                <MaterialThumb mat={qtyModal} size={64} radius={12} />
                <div><div className="mv-pick-name">{qtyModal.th || qtyModal.name}</div>
                  <div className="mv-pick-sub">{qtyModal.code} · เหลือ <b>{fmtNum(qtyModal.stock)}</b> {qtyModal.unit}</div></div>
              </div>
              {type === "purchase" && (
                <label className="fld"><span>ราคา/หน่วยที่ซื้อ</span>
                  <div className="inp inp-unit"><span className="unit-pre">฿</span>
                    <input type="number" min="0" step="0.01" value={modalPrice} autoFocus onChange={(e) => setModalPrice(e.target.value)} />
                    <span className="unit-suf">/{qtyModal.unit || "หน่วย"}</span></div>
                </label>
              )}
              <label className="fld"><span>จำนวน</span>
                <div className="mv-qty-step">
                  <button type="button" onClick={() => setModalQty((q) => Math.max(1, (Number(q) || 1) - 1))}><UIcon name="minus" size={18} /></button>
                  <input type="number" min="1" value={modalQty} onChange={(e) => setModalQty(Math.max(1, Number(e.target.value) || 1))} />
                  <span className="mv-qty-unit">{qtyModal.unit || "หน่วย"}</span>
                  <button type="button" onClick={() => setModalQty((q) => (Number(q) || 1) + 1)}><UIcon name="plus" size={18} /></button>
                </div>
              </label>
            </div>
            <div className="modal-foot"><button className="btn-ghost" onClick={() => setQtyModal(null)}>ยกเลิก</button>
              <button className="btn-primary" style={{ background: T.color }} onClick={addFromModal}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่มเข้ารายการ</button></div>
          </div>
        </div>
      )}

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
              <div>เลขที่อ้างอิง: <b>{printData.ref_no || "-"}</b></div>
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
