import React from "react";
import { fmtBaht, fmtCompact } from "../lib/format";
import { signedDomain } from "../lib/reportMetrics";

// Responsive, signed chart. A scrollable plot keeps dense day-by-day series readable.
export default function ReportChart({ buckets, series, label = "แนวโน้ม", unit = "บาท" }) {
  const host = React.useRef(null);
  const [width, setWidth] = React.useState(600);
  React.useEffect(() => {
    if (!host.current) return;
    const update = () => setWidth(Math.max(220, host.current.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update); observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const W = Math.max(width, buckets.length * (series.length > 1 ? 46 : 34) + 88);
  const H = 254, left = 68, right = 16, top = 26, bottom = 44;
  const domain = signedDomain(buckets.flatMap((b) => series.map((s) => b[s.k])));
  const y = (v) => top + (domain.max - v) / (domain.max - domain.min) * (H - top - bottom);
  const zero = y(0), group = (W - left - right) / Math.max(1, buckets.length);
  const bw = Math.min(24, (group - 12) / Math.max(1, series.length));
  const ticks = [...new Set([domain.min, 0, domain.max])];
  return <div className="report-chart" ref={host}>
    {!buckets.length ? <div className="empty sm">ไม่มีข้อมูลในช่วงที่เลือก</div> : <>
      <div className="report-chart-scroll">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          <title>{label}</title><desc>ค่าลบแสดงใต้เส้นศูนย์ เปิดตารางด้านล่างเพื่ออ่านทุกค่า</desc>
          <text x={8} y={16} fontSize={12} fill="var(--ink-2)">{unit}</text>
          {ticks.map((t) => <g key={t}><line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--ink-3)" : "var(--line)"} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-2)">{fmtCompact(t).replace(/^฿/, "")}</text></g>)}
          {buckets.map((b, i) => <g key={b.key || i}>
            {series.map((s, j) => {
              const v = b[s.k]; if (v == null) return null;
              const x = left + group * (i + .5) + (j - series.length / 2) * bw;
              return <rect key={s.k} x={x} y={Math.min(zero, y(v))} width={Math.max(1, bw - 2)} height={Math.abs(y(v) - zero)} rx={2} fill={v < 0 ? "var(--down)" : s.c}><title>{`${b.label} · ${s.name}: ${fmtBaht(v)}`}</title></rect>;
            })}
            {(buckets.length <= 12 || i % Math.ceil(buckets.length / 12) === 0 || i === buckets.length - 1) && <text x={left + group * (i + .5)} y={H - 20} fontSize={12} textAnchor="middle" fill="var(--ink-2)">{b.label}</text>}
          </g>)}
        </svg>
      </div>
      <div className="tc-legend">{series.map((s) => <span key={s.k}><i style={{ background: s.c }} />{s.name}</span>)}<span>ค่าติดลบอยู่ใต้เส้นศูนย์</span></div>
      <details className="report-details"><summary>ดูตัวเลขเป็นตาราง</summary><div className="report-chart-scroll"><table className="hr-table"><thead><tr><th>ช่วงเวลา</th>{series.map((s) => <th key={s.k}>{s.name}</th>)}</tr></thead><tbody>{buckets.map((b, i) => <tr key={b.key || i}><td>{b.label}</td>{series.map((s) => <td key={s.k}>{b[s.k] == null ? "ต้นทุนไม่ครบ" : fmtBaht(b[s.k])}</td>)}</tr>)}</tbody></table></div></details>
    </>}
  </div>;
}
