import React from "react";
import { listMaterials, listTeams, listTransactionsSince, listQuotations, listBoqs, listReceipts, dashboardActionLite, vatSummary, listAccounts } from "../lib/api";
import { downloadCsv } from "../lib/format";
import { can } from "../lib/permissions";
import { fmtBaht, fmtNum, fmtCompact, inRange } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";
import DashDrawer from "./DashDrawer";
import DashDocDrawer from "./DashDocDrawer";
import SalesReport from "./SalesReport";
import BillingSummary from "./BillingSummary";
import CrmJobsSummary from "./CrmJobsSummary";
import TrendCharts from "./TrendCharts";

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const PRESETS = [
  { id: "today", label: "วันนี้", range: () => { const t = ymd(new Date()); return { from: t, to: t }; } },
  { id: "month", label: "เดือนนี้", range: () => { const n = new Date(); return { from: `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-01`, to: "" }; } },
  { id: "year", label: "ปีนี้", range: () => { const n = new Date(); return { from: `${n.getFullYear()}-01-01`, to: "" }; } },
  { id: "7d", label: "7 วัน", range: () => { const n = new Date(); const s = new Date(n); s.setDate(n.getDate() - 6); return { from: ymd(s), to: "" }; } },
  { id: "all", label: "ทั้งหมด", range: () => ({ from: "", to: "" }) },
];

function StatCard({ icon, color, label, value, sub, accent, onClick }) {
  return (
    <div className={"stat-card" + (onClick ? " clickable" : "")} onClick={onClick}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}>
      <div className="stat-top">
        <span className="stat-ico" style={{ background: `color-mix(in srgb, ${color} 13%, white)`, color }}>
          <UIcon name={icon} size={18} strokeWidth={1.9} />
        </span>
      </div>
      <div className="stat-val" style={accent ? { color: accent } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {onClick && <div className="stat-more">ดูรายละเอียด <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>}
    </div>
  );
}

export default function Dashboard({ role, onReorder, onOpenQuote, onOpenJob, onGo, onOpenDoc }) {
  // ภาษีมูลค่าเพิ่มเดือนนี้ (ขาย/ซื้อ/นำส่ง) — เฉพาะบทบาทที่เห็นเมนูรายงานภาษี
  const [vat, setVat] = React.useState(null);
  React.useEffect(() => {
    if (!can(role, "tax")) return;
    const d = new Date(), ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    vatSummary(ym).then(setVat).catch(() => {});
  }, [role]);
  const [preset, setPreset] = React.useState("month");
  const [from, setFrom] = React.useState(PRESETS.find((p) => p.id === "month").range().from);
  const [to, setTo] = React.useState("");
  const [detail, setDetail] = React.useState(null);
  const [docList, setDocList] = React.useState(null); // การ์ดขาย/รับเงิน/กำไร → แผงรายการเอกสาร + Export
  const [mats, setMats] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [txns, setTxns] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  // แดชบอร์ดแบบแท็บ (ลดความตาลาย): ภาพรวม | ขาย&กำไร | การเงิน&เอกสาร | กราฟ | คลังวัสดุ
  const [tab, setTab] = React.useState("overview");
  const [ov, setOv] = React.useState(null);   // {qs, bs} — ยอดขาย/กำไรประมาณการ บนแท็บภาพรวม
  const [act, setAct] = React.useState(null); // ตัวเลข "สิ่งที่ต้องทำ" (ค้างรับ/รออนุมัติ/PO ค้าง)
  const [accounts, setAccounts] = React.useState(null); // เงินคงเหลือรายบัญชี (เฉพาะ role ที่เห็นการเงิน)
  // ตัวกรองระดับแดชบอร์ด: พนักงานขาย (คนสร้างใบเสนอ) + ทีมช่าง (ทีมของใบงานที่ผูกใบเสนอ) — คุมการ์ดขาย/รับเงิน/กำไร/หัก ณ ที่จ่าย
  const [byPerson, setByPerson] = React.useState("");
  const [byTeam, setByTeam] = React.useState("");
  React.useEffect(() => {
    Promise.all([listQuotations(), listBoqs(), listReceipts().catch(() => [])]).then(([qs, bs, rcs]) => setOv({ qs, bs, rcs })).catch(() => {});
    dashboardActionLite().then(setAct).catch(() => {});
    if (can(role, "cashflow")) listAccounts().then(setAccounts).catch(() => {});
  }, [role]);
  // ใบเสนอหลังผ่านตัวกรองคน/ทีม — เป็นฐานของทุกการ์ดฝั่งขาย (ใบเสร็จกรองผ่านใบเสนอที่มันผูก)
  const fq = React.useMemo(() => {
    let qs = ov?.qs || [];
    if (byPerson) qs = qs.filter((q) => (q.createdByName || "") === byPerson);
    if (byTeam) qs = qs.filter((q) => q.jobTeam === byTeam);
    return qs;
  }, [ov, byPerson, byTeam]);
  const fRcs = React.useMemo(() => {
    if (!ov?.rcs) return [];
    if (!byPerson && !byTeam) return ov.rcs;
    const ok = new Set(fq.map((q) => q.quote_no));
    return ov.rcs.filter((r) => r.quote_no && ok.has(r.quote_no));   // ใบเสร็จไม่ผูกใบเสนอ ระบุคน/ทีมไม่ได้ → ตัดออกตอนกรอง
  }, [ov, fq, byPerson, byTeam]);
  const salesNames = React.useMemo(() => [...new Set((ov?.qs || []).map((q) => q.createdByName).filter(Boolean))].sort(), [ov]);
  const ovStat = React.useMemo(() => {
    if (!ov) return { sale: 0, count: 0, est: 0, vatSale: 0, vatCount: 0, novatSale: 0, novatCount: 0 };
    const boqCost = Object.fromEntries(ov.bs.map((b) => [b.boq_no, b.total]));
    let sale = 0, count = 0, est = 0, vatSale = 0, vatCount = 0, novatSale = 0, novatCount = 0;
    fq.forEach((qo) => {
      if (qo.status !== "approved" || !inRange(qo.approved_at || qo.issue_date, from, to)) return;
      sale += qo.afterDisc || 0; count += 1;
      // แยกยอดตามบิล VAT / ไม่ VAT (ยอดก่อน VAT เสมอ — เทียบกันได้ตรง ๆ)
      if (qo.vat) { vatSale += qo.afterDisc || 0; vatCount += 1; } else { novatSale += qo.afterDisc || 0; novatCount += 1; }
      if (qo.boq_no && boqCost[qo.boq_no] != null) est += (qo.afterDisc || 0) - boqCost[qo.boq_no];
    });
    return { sale, count, est, vatSale, vatCount, novatSale, novatCount };
  }, [ov, fq, from, to]);
  // ยอดขายที่ออกใบเสร็จ + รับเงินแล้ว (ใบเสร็จสถานะ "ชำระเงินแล้ว" ตามวันที่รับเงิน) — ยอดก่อน VAT ให้เทียบกับการ์ดยอดขายอนุมัติได้ตรง ๆ
  const rcStat = React.useMemo(() => {
    const z = { sale: 0, count: 0, net: 0, wht: 0, vatSale: 0, vatCount: 0, novatSale: 0, novatCount: 0 };
    if (!ov?.rcs) return z;
    const quoteVat = Object.fromEntries((ov.qs || []).map((q) => [q.quote_no, !!q.vat]));
    const s = { ...z };
    fRcs.forEach((r) => {
      if (r.status !== "paid" || !inRange(r.issue_date, from, to)) return;
      const base = Number(r.base) || ((Number(r.total) || 0) - (Number(r.vat_amt) || 0)); // ก่อน VAT (ใบเก่าไม่มี base → total−vat)
      const isVat = r.quote_no ? !!quoteVat[r.quote_no] : (Number(r.vat_amt) || 0) > 0;
      s.sale += base; s.count += 1; s.net += Number(r.net) || ((Number(r.total) || 0) - (Number(r.wht_amt) || 0));
      s.wht += Number(r.wht_amt) || 0;   // ถูกหัก ณ ที่จ่ายสะสม (ขอคืน/เครดิตภาษีได้)
      if (isVat) { s.vatSale += base; s.vatCount += 1; } else { s.novatSale += base; s.novatCount += 1; }
    });
    return s;
  }, [ov, fRcs, from, to]);

  function applyPreset(p) { const r = PRESETS.find((x) => x.id === p).range(); setPreset(p); setFrom(r.from); setTo(r.to); }
  const setCustom = (k, v) => { setPreset("custom"); k === "from" ? setFrom(v) : setTo(v); };
  const rangeLabel = preset !== "custom" ? (PRESETS.find((p) => p.id === preset)?.label || "") : `${from || "เริ่มต้น"} – ${to || "วันนี้"}`;

  React.useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.all([listMaterials(), listTeams(), listTransactionsSince(from || null)])
      .then(([m, t, x]) => { if (alive) { setMats(m); setTeams(t); setTxns(x); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message || String(e)); setLoading(false); } });
    return () => { alive = false; };
  }, [from]);

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  const periodLabel = rangeLabel;

  // ---- aggregate transactions (filtered to the selected range) ----
  const agg = React.useMemo(() => {
    const z = () => ({ value: 0, qty: 0, count: 0 });
    const byType = { withdraw: z(), return: z(), purchase: z(), damage: z() };
    const teamWithdraw = {};
    const matWithdraw = {};
    for (const r of txns) {
      if (to && r.txn_date > to) continue;
      const b = byType[r.type]; if (!b) continue;
      b.value += Number(r.value) || 0; b.qty += Number(r.qty) || 0; b.count += 1;
      if (r.type === "withdraw") {
        if (r.team) teamWithdraw[r.team] = (teamWithdraw[r.team] || 0) + (Number(r.value) || 0);
        matWithdraw[r.material_code] = (matWithdraw[r.material_code] || 0) + (Number(r.value) || 0);
      }
    }
    return { byType, teamWithdraw, matWithdraw };
  }, [txns, to]);

  const rangeTxns = React.useMemo(() => txns.filter((r) => !to || r.txn_date <= to), [txns, to]);

  const used = agg.byType.withdraw.value - agg.byType.return.value;
  const teamMax = Math.max(1, ...teams.map((t) => agg.teamWithdraw[t.id] || 0));
  const topMats = Object.entries(agg.matWithdraw).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([code, v]) => ({ mat: matMap[code], value: v })).filter((x) => x.mat);
  const topMax = Math.max(1, ...topMats.map((m) => m.value));

  // ---- inventory on hand (point in time) ----
  const invValue = mats.reduce((a, m) => a + m.stock * m.cost, 0);
  const invUnits = mats.reduce((a, m) => a + m.stock, 0);
  const low = mats.filter((m) => m.tracked && m.stock < m.minStock)
    .map((m) => ({ ...m, need: m.minStock - m.stock, orderValue: (m.minStock - m.stock) * m.cost }))
    .sort((a, b) => a.stock / a.minStock - b.stock / b.minStock);
  const reorderTotal = low.reduce((a, m) => a + m.orderValue, 0);

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h1 className="page-title">ภาพรวมผู้บริหาร <span className="page-title-en">Executive Overview</span></h1>
          <p className="page-sub">ข้อมูลสด · ทุกรายงานในช่วง {rangeLabel}</p>
        </div>
      </div>

      <div className="dash-filter">
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.id} className={"seg-btn" + (preset === p.id ? " on" : "")} onClick={() => applyPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="tc-range">
          <span>จาก</span><input className="inp" type="date" value={from} onChange={(e) => setCustom("from", e.target.value)} />
          <span>ถึง</span><input className="inp" type="date" value={to} onChange={(e) => setCustom("to", e.target.value)} />
        </div>
      </div>

      <div className="cat-filter" style={{ marginTop: 2 }}>
        {[["overview", "🏠 ภาพรวม"], ["sales", "ขาย & กำไร"], ["fin", "การเงิน & เอกสาร"], ["trend", "กราฟแนวโน้ม"], ["inv", "คลังวัสดุ & เบิกใช้"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
            style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* กรองรายพนักงานขาย/ทีมช่าง — คุมการ์ดขาย · รับเงิน · กำไรประมาณการ · หัก ณ ที่จ่าย (การ์ดกลางร้าน เช่น ค้างรับ/สต๊อก ไม่ผูกรายคน) */}
          <div className="cat-filter" style={{ marginBottom: 10, alignItems: "center" }}>
            <select className="inp" style={{ width: "auto", flex: "none" }} value={byPerson} onChange={(e) => setByPerson(e.target.value)}>
              <option value="">พนักงานขาย: ทุกคน</option>
              {salesNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className="inp" style={{ width: "auto", flex: "none" }} value={byTeam} onChange={(e) => setByTeam(e.target.value)}>
              <option value="">ทีมช่าง: ทุกทีม</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {(byPerson || byTeam) && <button className="btn-ghost sm" onClick={() => { setByPerson(""); setByTeam(""); }}>✕ ล้างตัวกรอง</button>}
            {(byPerson || byTeam) && <span className="page-sub" style={{ margin: 0 }}>กำลังดูเฉพาะ {byPerson || ""}{byPerson && byTeam ? " · " : ""}{byTeam ? `ทีม ${teams.find((t) => t.id === byTeam)?.name || byTeam}` : ""} (ใบเสร็จที่ไม่ผูกใบเสนอถูกตัดออก)</span>}
          </div>
          <div className="kpi-grid">
            <StatCard icon="trend" color="#2563eb" label={"ยอดขายอนุมัติ · " + periodLabel} value={fmtBaht(ovStat.sale)} sub={`${fmtNum(ovStat.count)} ใบ · ยอดก่อน VAT`} onClick={() => setDocList("q_all")} />
            <StatCard icon="trend" color="#1f74e0" label="ยอดขายอนุมัติ · รับ VAT" value={fmtBaht(ovStat.vatSale)} sub={`${fmtNum(ovStat.vatCount)} ใบ · ก่อน VAT`} onClick={() => setDocList("q_vat")} />
            <StatCard icon="trend" color="#64748b" label="ยอดขายอนุมัติ · ไม่ VAT" value={fmtBaht(ovStat.novatSale)} sub={fmtNum(ovStat.novatCount) + " ใบ"} onClick={() => setDocList("q_novat")} />
            <StatCard icon="check" color="#0a6b3d" label={"รับเงินแล้ว (ใบเสร็จ) · " + periodLabel} value={fmtBaht(rcStat.sale)} sub={`${fmtNum(rcStat.count)} ใบเสร็จ · ก่อน VAT · รับสุทธิ ${fmtCompact(rcStat.net)}`} onClick={() => setDocList("rc_all")} />
            <StatCard icon="check" color="#15803d" label="รับเงินแล้ว · รับ VAT" value={fmtBaht(rcStat.vatSale)} sub={`${fmtNum(rcStat.vatCount)} ใบ · ก่อน VAT`} onClick={() => setDocList("rc_vat")} />
            <StatCard icon="check" color="#4d7c0f" label="รับเงินแล้ว · ไม่ VAT" value={fmtBaht(rcStat.novatSale)} sub={fmtNum(rcStat.novatCount) + " ใบ"} onClick={() => setDocList("rc_novat")} />
            <StatCard icon="trend" color="#16a34a" label="กำไรประมาณการ (BOQ)" value={fmtBaht(ovStat.est)} sub="กำไรจริงดูในแท็บ ขาย & กำไร" onClick={() => setDocList("est")} />
            <StatCard icon="clipboard" color="#d97706" label="เงินค้างรับ" value={fmtBaht(act?.receivable || 0)} sub={`${fmtNum(act?.unpaidCount || 0)} ใบ · เกินกำหนด ${fmtNum(act?.overdueCount || 0)} ใบ`} accent={act?.overdueCount ? "#dc2626" : undefined} onClick={() => onGo && onGo("receivables")} />
            <StatCard icon="withdraw" color="#dc2626" label="ยอดค้างจ่าย" value={fmtBaht(act?.payable || 0)} accent={act?.payable ? "#dc2626" : undefined}
              sub={`PO ${fmtCompact(act?.poPayable || 0)} · ค่าแรงซัพ ${fmtCompact((act?.payoutUnpaid || 0) + (act?.laborOwed || 0))} · เบิกรอจ่าย ${fmtCompact(act?.approvedExpenseSum || 0)}`}
              onClick={() => onGo && onGo("cashflow")} />
            <StatCard icon="box" color="#0d9488" label="มูลค่าวัสดุคงเหลือ" value={fmtBaht(invValue)} sub={`${fmtNum(mats.length)} ชนิด · ${fmtNum(low.length)} ต่ำกว่าขั้นต่ำ`} onClick={() => setTab("inv")} />
            {can(role, "tax") && vat && (
              <StatCard icon="clipboard" color="#0891b2" label={(vat.net >= 0 ? "VAT นำส่ง" : "VAT ขอคืน") + " · เดือนนี้"}
                value={fmtBaht(Math.abs(vat.net))} accent={vat.net > 0 ? "#dc2626" : "#16a34a"}
                sub={`ภาษีขาย ${fmtCompact(vat.saleVat)} − ภาษีซื้อ ${fmtCompact(vat.buyVat)}`}
                onClick={() => onGo && onGo("tax")} />
            )}
            {can(role, "tax") && (
              <StatCard icon="clipboard" color="#7c3aed" label={"ถูกหัก ณ ที่จ่าย · " + periodLabel}
                value={fmtBaht(rcStat.wht)} sub={`จากใบเสร็จที่รับเงินแล้ว ${fmtNum(rcStat.count)} ใบ · ใช้เป็นเครดิตภาษีได้`}
                onClick={() => setDocList("rc_all")} />
            )}
          </div>

          {/* เงินคงเหลือแต่ละบัญชี (เฉพาะ role การเงิน) — ตัวเลขเดียวกับเมนูเบิกจ่าย → เดินบัญชี */}
          {accounts && accounts.length > 0 && (
            <>
              <div className="sec-head" style={{ margin: "20px 0 10px" }}><div><div className="sec-title">เงินในบัญชี</div><div className="sec-sub">ยอดคงเหลือปัจจุบันรายบัญชี · กดเพื่อดูเดินบัญชี</div></div>
                <button className="btn-ghost sm" onClick={() => downloadCsv(`เงินในบัญชี-${new Date().toISOString().slice(0, 10)}`,
                  ["บัญชี", "ประเภท", "ยอดคงเหลือ"], accounts.map((a) => [a.name, a.kind === "cash" ? "เงินสด" : "ธนาคาร", Math.round((Number(a.balance) || 0) * 100) / 100]))}>⬇ Export</button></div>
              <div className="kpi-grid">
                {accounts.map((a) => (
                  <StatCard key={a.id} icon="trend" color={a.kind === "cash" ? "#d97706" : "#0d9488"} label={(a.kind === "cash" ? "💵 " : "🏦 ") + a.name}
                    value={fmtBaht(a.balance)} accent={Number(a.balance) < 0 ? "#dc2626" : undefined} onClick={() => onGo && onGo("expenses")} />
                ))}
                <StatCard icon="trend" color="#111" label="รวมทุกบัญชี" value={fmtBaht(accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0))} onClick={() => onGo && onGo("expenses")} />
              </div>
            </>
          )}

          <div className="sec-head" style={{ margin: "20px 0 10px" }}><div><div className="sec-title">สิ่งที่ต้องทำ</div><div className="sec-sub">งานค้างที่รอจัดการ · กดการ์ดเพื่อไปหน้านั้น</div></div></div>
          <div className="kpi-grid">
            <StatCard icon="alert" color="#dc2626" label="ของใกล้หมด ต้องสั่งซื้อ" value={fmtNum(low.length) + " รายการ"} sub={low.length ? "มูลค่าที่ต้องสั่ง ~" + fmtBaht(reorderTotal) : "สต๊อกเพียงพอทุกรายการ 🎉"} accent={low.length ? "#dc2626" : "#16a34a"} onClick={() => setTab("inv")} />
            <StatCard icon="withdraw" color="#7c3aed" label="เบิกจ่ายรออนุมัติ" value={fmtNum(act?.pendingExpenseCount || 0) + " คำขอ"} sub={act?.pendingExpenseSum ? "รวม " + fmtBaht(act.pendingExpenseSum) : "ไม่มีค้างอนุมัติ"} onClick={() => onGo && onGo("expenses")} />
            <StatCard icon="purchase" color="#d97706" label="ใบสั่งซื้อรอรับของ" value={fmtNum(act?.poOpenCount || 0) + " ใบ"} sub={"รออนุมัติจ่าย " + fmtNum(act?.poAwaitPayCount || 0) + " ใบ"} onClick={() => onGo && onGo("po")} />
            <StatCard icon="clipboard" color="#2563eb" label="ใบแจ้งหนี้ค้างรับ" value={fmtNum(act?.unpaidCount || 0) + " ใบ"} sub={"เกินกำหนด " + fmtNum(act?.overdueCount || 0) + " ใบ"} accent={act?.overdueCount ? "#dc2626" : undefined} onClick={() => onGo && onGo("receivables")} />
          </div>
        </>
      )}

      {tab === "sales" && <SalesReport onOpenQuote={onOpenQuote} onOpenJob={onOpenJob} from={from} to={to} />}

      {tab === "fin" && (
        <>
          <BillingSummary onGo={onGo} from={from} to={to} />
          <CrmJobsSummary onGo={onGo} />
        </>
      )}

      {tab === "trend" && <TrendCharts from={from} to={to} />}

      {tab === "inv" && (
      <>
      <div className="sec-head" style={{ margin: "8px 0 10px" }}><div><div className="sec-title">คลังวัสดุ & การเบิกใช้</div><div className="sec-sub">Inventory & usage · {periodLabel}</div></div></div>

      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}
      {loading && <div className="empty">กำลังโหลด…</div>}

      {!loading && !err && (
        <>
          <div className="kpi-grid">
            <StatCard icon="withdraw" color="#2563eb" label={"ยอดเบิก · " + periodLabel}
              value={fmtBaht(agg.byType.withdraw.value)} sub={fmtNum(agg.byType.withdraw.count) + " รายการ · " + fmtNum(agg.byType.withdraw.qty) + " หน่วย"} onClick={() => setDetail("withdraw")} />
            <StatCard icon="box" color="#0d9488" label="วัสดุที่ใช้จริง (เบิก − คืน)"
              value={fmtBaht(used)} sub={"คืนแล้ว " + fmtBaht(agg.byType.return.value)} accent="#0d9488" onClick={() => setDetail("used")} />
            <StatCard icon="purchase" color="#7c3aed" label={"ยอดซื้อ · " + periodLabel}
              value={fmtBaht(agg.byType.purchase.value)} sub={fmtNum(agg.byType.purchase.count) + " รายการ"} onClick={() => setDetail("purchase")} />
            <StatCard icon="damage" color="#dc2626" label={"วัสดุเสียหาย · " + periodLabel}
              value={fmtBaht(agg.byType.damage.value)} sub={fmtNum(agg.byType.damage.qty) + " หน่วยถูกตัดทิ้ง"} accent="#dc2626" onClick={() => setDetail("damage")} />
          </div>

          <div className="dash-grid">
            {/* inventory on hand */}
            <div className="card clickable-card" onClick={() => setDetail("inventory")}>
              <div className="sec-head"><div><div className="sec-title">มูลค่าวัสดุคงเหลือ</div><div className="sec-sub">Inventory on hand · ณ ปัจจุบัน</div></div></div>
              <div className="inv-headline">{fmtBaht(invValue)}</div>
              <div className="inv-sub">{fmtNum(invUnits)} หน่วย · {mats.length} ชนิด · <span className="inv-low-tag">{low.length} ต่ำกว่าขั้นต่ำ</span></div>
              <div className="cat-card-move" style={{ marginTop: 14 }}>ดูรายการคงเหลือ <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
            </div>

            {/* withdraw by team */}
            <div className="card span-2">
              <div className="sec-head"><div><div className="sec-title">ยอดเบิกแต่ละทีม</div><div className="sec-sub">Withdraw by team · {periodLabel}</div></div>
                <div className="big-total">{fmtBaht(agg.byType.withdraw.value)}<small>รวม</small></div></div>
              <div className="tbars">
                {teams.map((t) => {
                  const v = agg.teamWithdraw[t.id] || 0;
                  return (
                    <div className="tbar-row" key={t.id}>
                      <div className="tbar-label"><span style={{ width: 10, height: 10, borderRadius: 99, background: t.color, display: "inline-block" }} /> {t.name.replace("Team ", "")}</div>
                      <div className="tbar-track"><div className="tbar-fill" style={{ width: (v / teamMax * 100) + "%", background: t.color }} /></div>
                      <div className="tbar-val">{fmtCompact(v)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* used vs returned */}
            <div className="card">
              <div className="sec-head"><div><div className="sec-title">เบิก vs คืน</div><div className="sec-sub">Withdraw vs Return</div></div></div>
              <div className="ret-stat">
                <div className="ret-row"><span>เบิกออก</span><b>{fmtBaht(agg.byType.withdraw.value)}</b></div>
                <div className="ret-bar"><div style={{ width: "100%", background: "#2563eb" }} /></div>
                <div className="ret-row"><span>ส่งคืน</span><b style={{ color: "#16a34a" }}>{fmtBaht(agg.byType.return.value)}</b></div>
                <div className="ret-bar"><div style={{ width: (agg.byType.return.value / Math.max(1, agg.byType.withdraw.value) * 100) + "%", background: "#16a34a" }} /></div>
                <div className="ret-divider" />
                <div className="ret-row big"><span>ใช้จริง</span><b style={{ color: "#0d9488" }}>{fmtBaht(used)}</b></div>
              </div>
            </div>

            {/* top materials */}
            <div className="card span-2">
              <div className="sec-head"><div><div className="sec-title">วัสดุที่เบิกมากสุด</div><div className="sec-sub">Top materials · {periodLabel}</div></div></div>
              {topMats.length === 0 && <div className="empty sm">ยังไม่มีการเบิกในช่วงนี้</div>}
              <div className="topmat">
                {topMats.map(({ mat, value }) => (
                  <div className="topmat-row" key={mat.code}>
                    <MaterialThumb mat={mat} size={38} radius={9} />
                    <div className="topmat-info">
                      <div className="topmat-name">{mat.th}</div>
                      <div className="topmat-track"><div style={{ width: (value / topMax * 100) + "%", background: mat.color }} /></div>
                    </div>
                    <div className="topmat-val">{fmtBaht(value)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* reorder */}
            <div className="card lowstock-card">
              <div className="sec-head"><div><div className="sec-title">ต้องสั่งซื้อเพิ่ม</div><div className="sec-sub">ต่ำกว่าขั้นต่ำ · Below minimum</div></div>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {low.length > 0 && <button className="btn-ghost sm" onClick={() => downloadCsv(`ต้องสั่งซื้อ-${new Date().toISOString().slice(0, 10)}`,
                    ["รหัส", "ชื่อ", "คงเหลือ", "ขั้นต่ำ", "ต้องสั่ง", "หน่วย", "มูลค่าที่ต้องสั่ง"],
                    low.map((m) => [m.code, m.th, m.stock, m.minStock, m.need, m.unit || "", Math.round(m.orderValue * 100) / 100]))}>⬇</button>}
                  <span className="badge-warn">{low.length}</span>
                </span></div>
              <div className="lowstock">
                {low.slice(0, 5).map((m) => (
                  <div className="lowstock-row" key={m.code}>
                    <MaterialThumb mat={m} size={34} radius={9} />
                    <div className="lowstock-info">
                      <div className="lowstock-name">{m.th}</div>
                      <div className="lowstock-num">เหลือ {m.stock} · ขั้นต่ำ {m.minStock} {m.unit}</div>
                    </div>
                    <div className="lowstock-order">
                      <span className="lowstock-need">+{fmtNum(m.need)} {m.unit}</span>
                      <span className="lowstock-ordlabel">ต้องสั่ง</span>
                    </div>
                  </div>
                ))}
                {low.length === 0 && <div className="empty sm">สต๊อกเพียงพอทุกรายการ 🎉</div>}
                {low.length > 5 && <div className="lowstock-more">+ อีก {low.length - 5} รายการ</div>}
              </div>
              {low.length > 0 && (
                <button className="lowstock-cta" onClick={() => onReorder && onReorder(low.map((m) => ({ code: m.code, qty: m.need })))}>
                  <UIcon name="purchase" size={17} color="#fff" />
                  สร้างใบสั่งซื้อ · {low.length} รายการ · {fmtBaht(reorderTotal)}
                  <UIcon name="chevR" size={16} color="#fff" strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
      </>
      )}

      {detail && <DashDrawer kind={detail} periodLabel={periodLabel} txns={rangeTxns} teams={teams} mats={mats} onClose={() => setDetail(null)} />}
      {docList && <DashDocDrawer kind={docList} periodLabel={periodLabel + (byPerson ? ` · ${byPerson}` : "") + (byTeam ? ` · ทีม ${teams.find((t) => t.id === byTeam)?.name || byTeam}` : "")} from={from} to={to}
        quotes={fq} receipts={fRcs} boqs={ov?.bs || []} onClose={() => setDocList(null)} onOpenDoc={onOpenDoc} />}
    </div>
  );
}
