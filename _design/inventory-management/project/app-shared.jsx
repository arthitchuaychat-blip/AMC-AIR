/* ============================================================
   app-shared.jsx — shared UI components + charts
   ============================================================ */
const { fmt, helpers } = window.APP;

/* ---- material thumbnail tile (icon on tinted bg; doubles as photo slot) ---- */
function MaterialThumb({ mat, size = 48, radius = 12, showPhoto = false }) {
  const c = mat.color;
  return (
    <div className="mat-thumb" style={{
      width: size, height: size, borderRadius: radius,
      background: `color-mix(in srgb, ${c} 14%, white)`,
      border: `1px solid color-mix(in srgb, ${c} 28%, white)`,
      color: c, position: "relative", flex: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <MatIcon name={mat.icon} size={size * 0.56} color={c} strokeWidth={1.6} />
      {showPhoto && (
        <span style={{
          position: "absolute", right: -5, bottom: -5, width: 20, height: 20, borderRadius: 7,
          background: "white", border: "1px solid var(--line)", color: "var(--ink-3)",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,.1)",
        }}>
          <UIcon name="camera" size={12} strokeWidth={1.8} />
        </span>
      )}
    </div>
  );
}

/* ---- team dot + chip ---- */
function TeamDot({ team, size = 10 }) {
  return <span style={{ width: size, height: size, borderRadius: 99, background: team.color, flex: "none", display: "inline-block" }} />;
}
function TeamChip({ team, active, onClick, count }) {
  return (
    <button className={"team-chip" + (active ? " on" : "")} onClick={onClick}
      style={active ? { background: team.color, borderColor: team.color, color: "#fff" } : {}}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: active ? "#fff" : team.color }} />
      {team.name.replace("Team ", "")}
      {count != null && <span className="team-chip-n">{count}</span>}
    </button>
  );
}

/* ---- segmented control (period switcher etc.) ---- */
function Segmented({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.id} className={"seg-btn" + (value === o.id ? " on" : "")} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---- stat card ---- */
function StatCard({ icon, iconColor, label, value, sub, trend, accent, onClick }) {
  return (
    <div className={"stat-card" + (onClick ? " clickable" : "")} onClick={onClick}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}>
      <div className="stat-top">
        <span className="stat-ico" style={{ background: `color-mix(in srgb, ${iconColor} 13%, white)`, color: iconColor }}>
          <UIcon name={icon} size={18} strokeWidth={1.9} />
        </span>
        {trend != null && (
          <span className="stat-trend" style={{ color: trend >= 0 ? "var(--up)" : "var(--down)" }}>
            <UIcon name="trend" size={13} strokeWidth={2} color="currentColor" />
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <div className="stat-val" style={accent ? { color: accent } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {onClick && <div className="stat-more">ดูรายละเอียด <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>}
    </div>
  );
}

/* ---- horizontal bars: compare teams ---- */
function TeamBars({ data, unit = "baht" }) {
  const { teams } = window.APP;
  const max = Math.max(1, ...teams.map((t) => data[t.id].value));
  return (
    <div className="tbars">
      {teams.map((t) => {
        const v = data[t.id].value;
        const pct = (v / max) * 100;
        return (
          <div className="tbar-row" key={t.id}>
            <div className="tbar-label"><TeamDot team={t} /> {t.name.replace("Team ", "")}</div>
            <div className="tbar-track">
              <div className="tbar-fill" style={{ width: pct + "%", background: t.color }} />
            </div>
            <div className="tbar-val">{unit === "baht" ? fmt.fmtCompact(v) : fmt.fmtNum(data[t.id].qty)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- vertical bar chart for a time series ---- */
function BarChart({ data, color = "#2563eb", height = 150, valueKey = "value", money = true }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const [hover, setHover] = React.useState(null);
  return (
    <div className="barchart" style={{ height }}>
      {data.map((d, i) => {
        const h = (d[valueKey] / max) * 100;
        const on = hover === i;
        return (
          <div className="bar-col" key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="bar-wrap">
              {on && (
                <div className="bar-tip">{money ? fmt.fmtCompact(d[valueKey]) : fmt.fmtNum(d[valueKey])}</div>
              )}
              <div className="bar" style={{
                height: Math.max(2, h) + "%",
                background: on ? color : `color-mix(in srgb, ${color} 78%, white)`,
              }} />
            </div>
            <div className="bar-x">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- stacked team bar chart (per bucket, segments by team) ---- */
function StackedBars({ buckets, height = 170, money = true }) {
  const { teams } = window.APP;
  const totals = buckets.map((b) => teams.reduce((a, t) => a + b[t.id], 0));
  const max = Math.max(1, ...totals);
  const [hover, setHover] = React.useState(null);
  return (
    <div className="barchart" style={{ height }}>
      {buckets.map((b, i) => {
        const on = hover === i;
        return (
          <div className="bar-col" key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="bar-wrap">
              {on && <div className="bar-tip">{money ? fmt.fmtCompact(totals[i]) : fmt.fmtNum(totals[i])}</div>}
              <div className="bar-stack" style={{ height: Math.max(2, (totals[i] / max) * 100) + "%" }}>
                {teams.map((t) => {
                  const seg = totals[i] ? (b[t.id] / totals[i]) * 100 : 0;
                  return <div key={t.id} style={{ height: seg + "%", background: t.color, opacity: on ? 1 : 0.82 }} />;
                })}
              </div>
            </div>
            <div className="bar-x">{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- stock level bar vs minimum ---- */
function StockBar({ mat }) {
  const ratio = mat.stock / mat.minStock;
  const low = mat.stock < mat.minStock;
  const color = ratio < 0.5 ? "var(--down)" : low ? "#f59e0b" : "var(--up)";
  const pct = Math.min(100, (mat.stock / (mat.minStock * 1.6)) * 100);
  return (
    <div className="stockbar">
      <div className="stockbar-track">
        <div className="stockbar-min" style={{ left: (1 / 1.6) * 100 + "%" }} title="ขั้นต่ำ" />
        <div className="stockbar-fill" style={{ width: pct + "%", background: color }} />
      </div>
    </div>
  );
}

/* ---- generic section header ---- */
function SectionHead({ title, sub, right }) {
  return (
    <div className="sec-head">
      <div>
        <div className="sec-title">{title}</div>
        {sub && <div className="sec-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ---- qty stepper ---- */
function Stepper({ value, onChange, min = 0, max = 9999, step = 1, unit }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}><UIcon name="minus" size={16} /></button>
      <span className="stepper-val">{value}{unit ? <small> {unit}</small> : null}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}><UIcon name="plus" size={16} /></button>
    </div>
  );
}

Object.assign(window, {
  MaterialThumb, TeamDot, TeamChip, Segmented, StatCard, TeamBars,
  BarChart, StackedBars, StockBar, SectionHead, Stepper,
});
