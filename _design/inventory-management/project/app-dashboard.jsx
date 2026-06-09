/* ============================================================
   app-dashboard.jsx — Executive dashboard
   ============================================================ */
const DASH = window.APP;

const PERIODS = [
  { id: "day", label: "วันนี้" },
  { id: "month", label: "เดือนนี้" },
  { id: "year", label: "ปีนี้" },
  { id: "all", label: "ตลอดอายุ" },
];

// build per-team time buckets for a txn type
function buildBuckets(type, gran, n) {
  const { txns, teams, TODAY } = DASH;
  const dayMs = 86400000;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    let from, to, label;
    if (gran === "day") {
      const d = new Date(TODAY.getTime() - i * dayMs);
      from = to = DASH.helpers.dstr(d);
      label = d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
    } else if (gran === "month") {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
      const e = new Date(TODAY.getFullYear(), TODAY.getMonth() - i + 1, 0);
      from = DASH.helpers.dstr(d); to = DASH.helpers.dstr(e);
      label = d.toLocaleDateString("th-TH", { month: "short" });
    } else {
      const y = TODAY.getFullYear() - i;
      from = y + "-01-01"; to = y + "-12-31";
      label = String(y + 543).slice(2);
    }
    const bucket = { label }; teams.forEach((t) => (bucket[t.id] = 0));
    txns.forEach((x) => {
      if (x.type === type && x.team && x.date >= from && x.date <= to) bucket[x.team] += x.value;
    });
    out.push(bucket);
  }
  return out;
}

function periodGran(period) {
  if (period === "day") return ["day", 14];
  if (period === "month") return ["day", 30];
  if (period === "year") return ["month", 12];
  return ["month", 18];
}

function Legend() {
  return (
    <div className="legend">
      {DASH.teams.map((t) => (
        <span key={t.id} className="legend-item"><TeamDot team={t} /> {t.name.replace("Team ", "")}</span>
      ))}
    </div>
  );
}

function Dashboard({ goPurchasing }) {
  const [period, setPeriod] = React.useState("month");
  const [detail, setDetail] = React.useState(null);
  const { fmt, helpers } = DASH;
  const ref = DASH.TODAY;

  const wTeam = helpers.byTeam("withdraw", period, ref);
  const rTeam = helpers.byTeam("return", period, ref);
  const dTeam = helpers.byTeam("damage", period, ref);
  const purchases = helpers.filter({ type: "purchase", period, ref });
  const purchaseTotal = helpers.sum(purchases, "value");
  const usedValue = wTeam._total.value - rTeam._total.value;

  const [gran, n] = periodGran(period);
  const wBuckets = buildBuckets("withdraw", gran, n);
  const dBuckets = buildBuckets("damage", gran, n);

  // purchase series (total, not per team)
  const purSeries = helpers.series("purchase", gran, n);

  const periodLabel = PERIODS.find((p) => p.id === period).label;

  // top withdrawn materials this period
  const matAgg = {};
  helpers.filter({ type: "withdraw", period, ref }).forEach((r) => {
    matAgg[r.mat] = (matAgg[r.mat] || 0) + r.value;
  });
  const topMats = Object.entries(matAgg).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, v]) => ({ mat: DASH.matById[id], value: v }));
  const topMax = Math.max(1, ...topMats.map((m) => m.value));

  const lowStock = helpers.purchaseSuggestions();

  // ---- inventory on hand (point-in-time, period-independent) ----
  const invItems = DASH.materials.map((m) => ({ mat: m, value: m.stock * m.cost, low: m.stock < m.minStock }))
    .sort((a, b) => b.value - a.value);
  const invValue = invItems.reduce((a, x) => a + x.value, 0);
  const invUnits = DASH.materials.reduce((a, m) => a + m.stock, 0);
  const invLow = DASH.materials.filter((m) => m.stock < m.minStock).length;
  const invMax = Math.max(1, ...invItems.map((i) => i.value));
  const catAgg = DASH.categories.map((c) => ({
    cat: c, value: DASH.materials.filter((m) => m.cat === c.id).reduce((a, m) => a + m.stock * m.cost, 0),
  })).sort((a, b) => b.value - a.value);
  const catMax = Math.max(1, ...catAgg.map((c) => c.value));

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h1 className="page-title">ภาพรวมผู้บริหาร <span className="page-title-en">Executive Overview</span></h1>
          <p className="page-sub">{fmt.thDate(DASH.TODAY)} · ข้อมูลสรุป {periodLabel}</p>
        </div>
        <Segmented value={period} onChange={setPeriod} options={PERIODS} />
      </div>

      {/* KPI ROW */}
      <div className="kpi-grid">
        <StatCard icon="withdraw" iconColor="#2563eb" label={"ยอดเบิก (Withdraw) · " + periodLabel}
          value={fmt.fmtBaht(wTeam._total.value)} sub={fmt.fmtNum(wTeam._total.count) + " รายการ · " + fmt.fmtNum(wTeam._total.qty) + " หน่วย"} trend={+8} onClick={() => setDetail("withdraw")} />
        <StatCard icon="box" iconColor="#0d9488" label="วัสดุที่ใช้จริง (เบิก − คืน)"
          value={fmt.fmtBaht(usedValue)} sub={"คืนแล้ว " + fmt.fmtBaht(rTeam._total.value)} accent="#0d9488" onClick={() => setDetail("used")} />
        <StatCard icon="purchase" iconColor="#7c3aed" label={"ยอดซื้อ (Purchase) · " + periodLabel}
          value={fmt.fmtBaht(purchaseTotal)} sub={fmt.fmtNum(purchases.length) + " ใบสั่งซื้อ"} trend={+3} onClick={() => setDetail("purchase")} />
        <StatCard icon="damage" iconColor="#dc2626" label={"วัสดุเสียหาย (Damaged) · " + periodLabel}
          value={fmt.fmtBaht(dTeam._total.value)} sub={fmt.fmtNum(dTeam._total.qty) + " หน่วยถูกตัดทิ้ง"} accent="#dc2626" onClick={() => setDetail("damage")} />
      </div>

      {/* MAIN GRID */}
      <div className="dash-grid">
        {/* inventory value summary */}
        <div className="card inv-card">
          <SectionHead title="มูลค่าวัสดุคงเหลือ" sub="Inventory on hand · ณ ปัจจุบัน" />
          <div className="inv-headline">{fmt.fmtBaht(invValue)}</div>
          <div className="inv-sub">{fmt.fmtNum(invUnits)} หน่วย · {DASH.materials.length} ชนิด · <span className="inv-low-tag">{invLow} ต่ำกว่าขั้นต่ำ</span></div>
          <div className="inv-cats">
            {catAgg.map(({ cat, value }) => (
              <div className="inv-cat-row" key={cat.id}>
                <div className="inv-cat-label"><span className="inv-cat-dot" style={{ background: cat.color }} /> {cat.th}</div>
                <div className="inv-cat-track"><div style={{ width: (value / catMax * 100) + "%", background: cat.color }} /></div>
                <div className="inv-cat-val">{fmt.fmtCompact(value)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* remaining stock list */}
        <div className="card span-2">
          <SectionHead title="รายการวัสดุคงเหลือ" sub="Stock on hand by item"
            right={<div className="big-total">{fmt.fmtNum(DASH.materials.length)}<small>รายการ</small></div>} />
          <div className="inv-list">
            <div className="inv-row inv-row-h">
              <span></span><span>วัสดุ</span><span className="c">คงเหลือ</span><span className="r">มูลค่า</span>
            </div>
            {invItems.map(({ mat, value, low }) => (
              <div className={"inv-row" + (low ? " low" : "")} key={mat.id}>
                <MaterialThumb mat={mat} size={34} radius={9} />
                <div className="inv-info">
                  <div className="inv-name">{mat.th} {low && <span className="inv-low-pill">ต่ำ</span>}</div>
                  <div className="inv-meta"><span className="code-chip">{mat.code}</span> {fmt.fmtBaht2(mat.cost)}/{mat.unit}</div>
                </div>
                <div className="c inv-qtycol">
                  <div className="inv-qty" style={low ? { color: "var(--down)" } : {}}>{fmt.fmtNum(mat.stock)} <small>{mat.unit}</small></div>
                  <StockBar mat={mat} />
                </div>
                <div className="r inv-val">{fmt.fmtBaht(value)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* withdraw per team */}
        <div className="card span-2">
          <SectionHead title="ยอดเบิกแต่ละทีม" sub={"Withdraw by team · " + periodLabel}
            right={<div className="big-total">{fmt.fmtBaht(wTeam._total.value)}<small>รวม</small></div>} />
          <TeamBars data={wTeam} />
        </div>

        {/* used vs returned mini */}
        <div className="card">
          <SectionHead title="เบิก vs คืน" sub="Withdraw vs Return" />
          <div className="ret-stat">
            <div className="ret-row"><span>เบิกออก</span><b>{fmt.fmtBaht(wTeam._total.value)}</b></div>
            <div className="ret-bar"><div style={{ width: "100%", background: "#2563eb" }} /></div>
            <div className="ret-row"><span>ส่งคืน</span><b style={{ color: "#16a34a" }}>{fmt.fmtBaht(rTeam._total.value)}</b></div>
            <div className="ret-bar"><div style={{ width: (rTeam._total.value / Math.max(1, wTeam._total.value) * 100) + "%", background: "#16a34a" }} /></div>
            <div className="ret-divider" />
            <div className="ret-row big"><span>ใช้จริง</span><b style={{ color: "#0d9488" }}>{fmt.fmtBaht(usedValue)}</b></div>
            <div className="ret-pct">{Math.round(usedValue / Math.max(1, wTeam._total.value) * 100)}% ของยอดเบิกถูกใช้จริง</div>
          </div>
        </div>

        {/* withdraw trend stacked */}
        <div className="card span-2">
          <SectionHead title="แนวโน้มยอดเบิก" sub={gran === "day" ? "รายวัน" : gran === "month" ? "รายเดือน" : "รายปี"} right={<Legend />} />
          <StackedBars buckets={wBuckets} />
        </div>

        {/* purchase trend */}
        <div className="card">
          <SectionHead title="ยอดซื้อ" sub="Purchasing trend" />
          <BarChart data={purSeries} color="#7c3aed" height={170} />
        </div>

        {/* damage per team */}
        <div className="card span-2">
          <SectionHead title="วัสดุเสียหายแต่ละทีม" sub={"Damaged write-off by team · " + periodLabel}
            right={<div className="big-total" style={{ color: "#dc2626" }}>{fmt.fmtBaht(dTeam._total.value)}<small>รวม</small></div>} />
          <TeamBars data={dTeam} />
        </div>

        {/* damage trend */}
        <div className="card">
          <SectionHead title="แนวโน้มของเสีย" sub={gran === "day" ? "รายวัน" : "รายเดือน"} />
          <StackedBars buckets={dBuckets} height={170} />
        </div>

        {/* top materials */}
        <div className="card span-2">
          <SectionHead title="วัสดุที่เบิกมากสุด" sub={"Top materials · " + periodLabel} />
          <div className="topmat">
            {topMats.map(({ mat, value }) => (
              <div className="topmat-row" key={mat.id}>
                <MaterialThumb mat={mat} size={38} radius={9} />
                <div className="topmat-info">
                  <div className="topmat-name">{mat.th}</div>
                  <div className="topmat-track"><div style={{ width: (value / topMax * 100) + "%", background: mat.color }} /></div>
                </div>
                <div className="topmat-val">{fmt.fmtBaht(value)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* low stock -> reorder */}
        <div className="card lowstock-card">
          <SectionHead title="ต้องสั่งซื้อเพิ่ม" sub="ต่ำกว่าขั้นต่ำ · Below minimum" right={<span className="badge-warn">{lowStock.length}</span>} />
          <div className="lowstock">
            {lowStock.slice(0, 5).map((m) => (
              <div className="lowstock-row" key={m.id}>
                <MaterialThumb mat={m} size={34} radius={9} />
                <div className="lowstock-info">
                  <div className="lowstock-name">{m.th}</div>
                  <div className="lowstock-num">เหลือ {m.stock} · ขั้นต่ำ {m.minStock} {m.unit}</div>
                </div>
                <div className="lowstock-order">
                  <span className="lowstock-need">+{fmt.fmtNum(m.need)} {m.unit}</span>
                  <span className="lowstock-ordlabel">ต้องสั่ง</span>
                </div>
              </div>
            ))}
            {lowStock.length > 5 && <div className="lowstock-more">+ อีก {lowStock.length - 5} รายการ</div>}
          </div>
          <button className="lowstock-cta" onClick={goPurchasing}>
            <UIcon name="purchase" size={17} color="#fff" />
            สั่งซื้อเติมสต๊อก {lowStock.length} รายการ · {fmt.fmtBaht(lowStock.reduce((a, m) => a + m.orderValue, 0))}
            <UIcon name="chevR" size={16} color="#fff" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {detail && <DetailDrawer metric={detail} period={period} onClose={() => setDetail(null)} />}
    </div>
  );
}

window.Dashboard = Dashboard;
