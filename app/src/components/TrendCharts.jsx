import React from "react";
import { listQuotations, listBoqs, listJobOrders, listProfiles, listTeams } from "../lib/api";
import { fmtBaht, fmtCompact } from "../lib/format";

const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d, g) => g === "year" ? `${d.getFullYear()}` : g === "month" ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function buildBuckets(g, from, to) {
  const now = new Date();
  const end = to ? new Date(to) : now;
  let start;
  if (from) start = new Date(from);
  else if (g === "day") { start = new Date(end); start.setDate(end.getDate() - 13); }
  else if (g === "month") start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  else start = new Date(end.getFullYear() - 4, 0, 1);
  const arr = [];
  if (g === "day") {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    for (let i = 0; d <= e && i < 120; i++) { arr.push({ key: keyOf(d, g), label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` }); d.setDate(d.getDate() + 1); }
  } else if (g === "month") {
    let d = new Date(start.getFullYear(), start.getMonth(), 1); const e = new Date(end.getFullYear(), end.getMonth(), 1);
    for (let i = 0; d <= e && i < 48; i++) { arr.push({ key: keyOf(d, g), label: `${TH_MON[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}` }); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  } else {
    for (let y = start.getFullYear(), i = 0; y <= end.getFullYear() && i < 25; y++, i++) arr.push({ key: `${y}`, label: `${y + 543}` });
  }
  return arr;
}

// vertical grouped bar chart (sales / cost / profit per time bucket)
function GroupedBars({ buckets }) {
  const W = 660, H = 210, padB = 26, padT = 8;
  const series = [{ k: "sale", name: "ยอดขาย", c: "#1f74e0" }, { k: "cost", name: "ต้นทุน", c: "#f59e0b" }, { k: "profit", name: "กำไร", c: "#16a34a" }];
  const max = Math.max(1, ...buckets.flatMap((b) => series.map((s) => b[s.k] || 0)));
  const n = buckets.length || 1; const gW = W / n; const bW = Math.min(16, (gW - 10) / 3);
  const chartH = H - padB - padT;
  return (
    <div className="tc-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="tc-svg" preserveAspectRatio="xMidYMid meet">
        <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke="#dbe3ef" strokeWidth="1" />
        {buckets.map((b, i) => {
          const gx = i * gW + gW / 2;
          return (
            <g key={i}>
              {series.map((s, j) => {
                const v = Math.max(0, b[s.k] || 0);
                const h = (v / max) * chartH;
                const x = gx - bW * 1.5 - 2 + j * (bW + 2);
                return <rect key={j} x={x} y={H - padB - h} width={bW} height={h} rx="2" fill={s.c} />;
              })}
              <text x={gx} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#64748b">{b.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="tc-legend">{series.map((s) => <span key={s.k}><i style={{ background: s.c }} />{s.name}</span>)}</div>
    </div>
  );
}

function HBars({ rows, color }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  if (!rows.length) return <div className="empty sm">ยังไม่มีข้อมูลในช่วงนี้</div>;
  return (
    <div className="tbars">
      {rows.map((r) => (
        <div className="tbar-row" key={r.name}>
          <div className="tbar-label">{r.name}</div>
          <div className="tbar-track"><div className="tbar-fill" style={{ width: (r.v / max * 100) + "%", background: color }} /></div>
          <div className="tbar-val">{fmtCompact(r.v)}</div>
        </div>
      ))}
    </div>
  );
}

export default function TrendCharts() {
  const [g, setG] = React.useState("month");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    Promise.all([listQuotations(), listBoqs(), listJobOrders(), listProfiles(), listTeams()])
      .then(([qs, bs, jos, profs, teams]) => { if (alive) setData({ qs, bs, jos, profs, teams }); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  const computed = React.useMemo(() => {
    if (!data) return null;
    const boqCost = Object.fromEntries(data.bs.map((b) => [b.boq_no, b.total]));
    const profName = Object.fromEntries((data.profs || []).map((p) => [p.id, p.name || p.email]));
    const teamName = Object.fromEntries(data.teams.map((t) => [t.id, t.name]));
    const teamByQuote = {}; data.jos.forEach((j) => { if (j.quote_no && !teamByQuote[j.quote_no]) teamByQuote[j.quote_no] = j.assigned_team; });
    const approved = data.qs.filter((q) => q.status === "approved");
    const buckets = buildBuckets(g, from, to);
    const idx = Object.fromEntries(buckets.map((b, i) => [b.key, i]));
    buckets.forEach((b) => { b.sale = 0; b.cost = 0; b.profit = 0; });
    const bySales = {}, byTeam = {};
    approved.forEach((q) => {
      const ds = q.approved_at || q.issue_date; if (!ds) return;
      const d = new Date(ds); const k = keyOf(d, g);
      const sale = q.afterDisc || 0;
      const cost = q.boq_no && boqCost[q.boq_no] != null ? boqCost[q.boq_no] : 0;
      const profit = sale - cost;
      if (k in idx) { const b = buckets[idx[k]]; b.sale += sale; b.cost += cost; b.profit += profit;
        const sn = q.created_by ? (profName[q.created_by] || "ไม่ทราบ") : "ไม่ทราบ";
        bySales[sn] = (bySales[sn] || 0) + profit;
        const tn = teamByQuote[q.quote_no] ? (teamName[teamByQuote[q.quote_no]] || teamByQuote[q.quote_no]) : "ยังไม่มอบช่าง";
        byTeam[tn] = (byTeam[tn] || 0) + profit;
      }
    });
    const tot = buckets.reduce((a, b) => ({ sale: a.sale + b.sale, cost: a.cost + b.cost, profit: a.profit + b.profit }), { sale: 0, cost: 0, profit: 0 });
    const salesRows = Object.entries(bySales).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v);
    const teamRows = Object.entries(byTeam).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v);
    return { buckets, tot, salesRows, teamRows };
  }, [data, g, from, to]);

  if (err) return <div className="empty" style={{ color: "var(--down)" }}>โหลดกราฟไม่สำเร็จ: {err}</div>;

  return (
    <div className="sales-report" style={{ marginTop: 18 }}>
      <div className="sec-head" style={{ marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div><div className="sec-title">กราฟเปรียบเทียบ</div><div className="sec-sub">ยอดขาย · ต้นทุน · กำไร · ทีม — เลือกช่วงเวลา</div></div>
        <div className="tc-controls">
          <div className="seg">
            <button className={"seg-btn" + (g === "day" ? " on" : "")} onClick={() => setG("day")}>รายวัน</button>
            <button className={"seg-btn" + (g === "month" ? " on" : "")} onClick={() => setG("month")}>รายเดือน</button>
            <button className={"seg-btn" + (g === "year" ? " on" : "")} onClick={() => setG("year")}>รายปี</button>
          </div>
          <div className="tc-range">
            <span>จาก</span><input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>ถึง</span><input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            {(from || to) && <button className="btn-ghost sm" onClick={() => { setFrom(""); setTo(""); }}>ล้าง</button>}
          </div>
        </div>
      </div>

      {!computed && <div className="empty">กำลังโหลดกราฟ…</div>}
      {computed && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="sec-head"><div><div className="sec-title">ยอดขาย / ต้นทุน / กำไร</div><div className="sec-sub">รวมช่วงนี้: ขาย {fmtBaht(computed.tot.sale)} · ต้นทุน {fmtBaht(computed.tot.cost)} · กำไร {fmtBaht(computed.tot.profit)}</div></div></div>
            <GroupedBars buckets={computed.buckets} />
          </div>
          <div className="sr-tables">
            <div className="card"><div className="sec-head"><div><div className="sec-title">กำไร · รายพนักงานขาย</div><div className="sec-sub">ในช่วงที่เลือก</div></div></div><HBars rows={computed.salesRows} color="#1f74e0" /></div>
            <div className="card"><div className="sec-head"><div><div className="sec-title">กำไร · รายทีมช่าง</div><div className="sec-sub">ในช่วงที่เลือก</div></div></div><HBars rows={computed.teamRows} color="#0ea5a3" /></div>
          </div>
        </>
      )}
    </div>
  );
}
