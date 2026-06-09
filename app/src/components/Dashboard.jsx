import React from "react";
import { listMaterials, listTeams, listTransactionsSince } from "../lib/api";
import { fmtBaht, fmtNum, fmtCompact } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";

const PERIODS = [
  { id: "day", label: "วันนี้" },
  { id: "month", label: "เดือนนี้" },
  { id: "year", label: "ปีนี้" },
  { id: "all", label: "ตลอดอายุ" },
];

function periodStart(p) {
  const d = new Date();
  const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (p === "day") return ymd(d);
  if (p === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  if (p === "year") return `${d.getFullYear()}-01-01`;
  return null;
}

function StatCard({ icon, color, label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-ico" style={{ background: `color-mix(in srgb, ${color} 13%, white)`, color }}>
          <UIcon name={icon} size={18} strokeWidth={1.9} />
        </span>
      </div>
      <div className="stat-val" style={accent ? { color: accent } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const [period, setPeriod] = React.useState("month");
  const [mats, setMats] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [txns, setTxns] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.all([listMaterials(), listTeams(), listTransactionsSince(periodStart(period))])
      .then(([m, t, x]) => { if (alive) { setMats(m); setTeams(t); setTxns(x); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message || String(e)); setLoading(false); } });
    return () => { alive = false; };
  }, [period]);

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  const periodLabel = PERIODS.find((p) => p.id === period).label;

  // ---- aggregate transactions ----
  const agg = React.useMemo(() => {
    const z = () => ({ value: 0, qty: 0, count: 0 });
    const byType = { withdraw: z(), return: z(), purchase: z(), damage: z() };
    const teamWithdraw = {};
    const matWithdraw = {};
    for (const r of txns) {
      const b = byType[r.type]; if (!b) continue;
      b.value += Number(r.value) || 0; b.qty += Number(r.qty) || 0; b.count += 1;
      if (r.type === "withdraw") {
        if (r.team) teamWithdraw[r.team] = (teamWithdraw[r.team] || 0) + (Number(r.value) || 0);
        matWithdraw[r.material_code] = (matWithdraw[r.material_code] || 0) + (Number(r.value) || 0);
      }
    }
    return { byType, teamWithdraw, matWithdraw };
  }, [txns]);

  const used = agg.byType.withdraw.value - agg.byType.return.value;
  const teamMax = Math.max(1, ...teams.map((t) => agg.teamWithdraw[t.id] || 0));
  const topMats = Object.entries(agg.matWithdraw).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([code, v]) => ({ mat: matMap[code], value: v })).filter((x) => x.mat);
  const topMax = Math.max(1, ...topMats.map((m) => m.value));

  // ---- inventory on hand (point in time) ----
  const invValue = mats.reduce((a, m) => a + m.stock * m.cost, 0);
  const invUnits = mats.reduce((a, m) => a + m.stock, 0);
  const low = mats.filter((m) => m.stock < m.minStock)
    .map((m) => ({ ...m, need: m.minStock - m.stock, orderValue: (m.minStock - m.stock) * m.cost }))
    .sort((a, b) => a.stock / a.minStock - b.stock / b.minStock);
  const reorderTotal = low.reduce((a, m) => a + m.orderValue, 0);

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h1 className="page-title">ภาพรวมผู้บริหาร <span className="page-title-en">Executive Overview</span></h1>
          <p className="page-sub">ข้อมูลสด · สรุป {periodLabel}</p>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.id} className={"seg-btn" + (period === p.id ? " on" : "")} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
      </div>

      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}
      {loading && <div className="empty">กำลังโหลด…</div>}

      {!loading && !err && (
        <>
          <div className="kpi-grid">
            <StatCard icon="withdraw" color="#2563eb" label={"ยอดเบิก · " + periodLabel}
              value={fmtBaht(agg.byType.withdraw.value)} sub={fmtNum(agg.byType.withdraw.count) + " รายการ · " + fmtNum(agg.byType.withdraw.qty) + " หน่วย"} />
            <StatCard icon="box" color="#0d9488" label="วัสดุที่ใช้จริง (เบิก − คืน)"
              value={fmtBaht(used)} sub={"คืนแล้ว " + fmtBaht(agg.byType.return.value)} accent="#0d9488" />
            <StatCard icon="purchase" color="#7c3aed" label={"ยอดซื้อ · " + periodLabel}
              value={fmtBaht(agg.byType.purchase.value)} sub={fmtNum(agg.byType.purchase.count) + " รายการ"} />
            <StatCard icon="damage" color="#dc2626" label={"วัสดุเสียหาย · " + periodLabel}
              value={fmtBaht(agg.byType.damage.value)} sub={fmtNum(agg.byType.damage.qty) + " หน่วยถูกตัดทิ้ง"} accent="#dc2626" />
          </div>

          <div className="dash-grid">
            {/* inventory on hand */}
            <div className="card">
              <div className="sec-head"><div><div className="sec-title">มูลค่าวัสดุคงเหลือ</div><div className="sec-sub">Inventory on hand · ณ ปัจจุบัน</div></div></div>
              <div className="inv-headline">{fmtBaht(invValue)}</div>
              <div className="inv-sub">{fmtNum(invUnits)} หน่วย · {mats.length} ชนิด · <span className="inv-low-tag">{low.length} ต่ำกว่าขั้นต่ำ</span></div>
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
              <div className="sec-head"><div><div className="sec-title">ต้องสั่งซื้อเพิ่ม</div><div className="sec-sub">ต่ำกว่าขั้นต่ำ · Below minimum</div></div><span className="badge-warn">{low.length}</span></div>
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
                <button className="lowstock-cta" onClick={() => onNavigate && onNavigate("movements")}>
                  <UIcon name="purchase" size={17} color="#fff" />
                  ไปบันทึกสั่งซื้อ · {low.length} รายการ · {fmtBaht(reorderTotal)}
                  <UIcon name="chevR" size={16} color="#fff" strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
