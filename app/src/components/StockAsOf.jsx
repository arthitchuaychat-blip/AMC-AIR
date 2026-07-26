import React from "react";
import { stockAsOf, listCategories } from "../lib/api";
import { fmtBaht, fmtNum, downloadCsv } from "../lib/format";

// สต๊อกคงเหลือย้อนหลัง ณ วันที่เลือก — จำนวน + มูลค่า (ต้นทุนปัจจุบัน) แยกหมวด แอร์/วัสดุ/อะไหล่/อื่นๆ
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const GROUPS = [
  ["all", "ทั้งหมด"],
  ["ac", "เครื่องปรับอากาศ"],
  ["material", "วัสดุ"],
  ["part", "อุปกรณ์เสริม/อะไหล่"],
  ["other", "อื่น ๆ"],
];

export default function StockAsOf() {
  const [date, setDate] = React.useState(() => ymd(new Date()));
  const [rows, setRows] = React.useState(null);
  const [catGroup, setCatGroup] = React.useState({});
  const [err, setErr] = React.useState(null);
  const [g, setG] = React.useState("all");
  const [hideZero, setHideZero] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setRows(null); setErr(null);
    (async () => {
      try {
        const [data, cats] = await Promise.all([stockAsOf(date || null), listCategories().catch(() => [])]);
        if (!alive) return;
        setCatGroup(Object.fromEntries(cats.map((c) => [c.id, c.mat_group])));
        setRows(data);
      } catch (e) { if (alive) setErr(e.message || String(e)); }
    })();
    return () => { alive = false; };
  }, [date]);

  const groupOf = React.useCallback((m) => {
    if (m.kind === "ac") return "ac";
    if (m.kind === "material") return catGroup[m.cat] === "part" ? "part" : "material";
    return "other";
  }, [catGroup]);

  const counts = React.useMemo(() => {
    const c = { all: 0, ac: 0, material: 0, part: 0, other: 0 };
    (rows || []).forEach((m) => { if (hideZero && m.onHand === 0) return; c.all++; c[groupOf(m)]++; });
    return c;
  }, [rows, groupOf, hideZero]);

  const view = React.useMemo(() => {
    let list = (rows || []).filter((m) => !(hideZero && m.onHand === 0));
    if (g !== "all") list = list.filter((m) => groupOf(m) === g);
    return list.sort((a, b) => b.value - a.value || String(a.code).localeCompare(b.code));
  }, [rows, g, groupOf, hideZero]);

  const totalUnits = view.reduce((a, m) => a + m.onHand, 0);
  const totalValue = view.reduce((a, m) => a + m.value, 0);
  const GLABEL = { ac: "แอร์", material: "วัสดุ", part: "อะไหล่", other: "อื่นๆ" };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <div><div className="sec-title">สต๊อกคงเหลือย้อนหลัง</div>
          <div className="sec-sub">จำนวน + มูลค่าคงเหลือ ณ สิ้นวันที่เลือก · มูลค่าคิดด้วยต้นทุนปัจจุบัน (ประมาณ)</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>ณ สิ้นวันที่</span>
          <input className="inp" type="date" value={date} max={ymd(new Date())} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
          <button className="btn-ghost sm" disabled={!view.length} onClick={() => downloadCsv(`สต๊อกคงเหลือ-${date}`,
            ["รหัส", "ชื่อ", "หมวด", "คงเหลือ", "หน่วย", "ต้นทุน/หน่วย", "มูลค่า"],
            view.map((m) => [m.code, m.th, GLABEL[groupOf(m)], m.onHand, m.unit || "", m.cost, Math.round(m.value * 100) / 100]))}>⬇ Export</button>
        </div>
      </div>

      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}
      {!rows && !err && <div className="empty">กำลังคำนวณคงเหลือ…</div>}

      {rows && !err && (
        <>
          <div className="cat-filter" style={{ marginTop: 4 }}>
            {GROUPS.map(([v, l]) => (
              <button key={v} className={"cat-chip" + (g === v ? " on" : "")} onClick={() => setG(v)}
                style={g === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l} <b style={{ opacity: 0.6 }}>{counts[v]}</b></button>
            ))}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)", marginLeft: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> ซ่อนที่เหลือ 0
            </label>
          </div>

          <div style={{ display: "flex", gap: 18, margin: "6px 2px 12px", fontSize: 14, flexWrap: "wrap" }}>
            <span><b>{fmtNum(view.length)}</b> ชนิด</span>
            <span><b>{fmtNum(totalUnits)}</b> หน่วยรวม</span>
            <span>มูลค่ารวม <b style={{ color: "#0d9488" }}>{fmtBaht(totalValue)}</b></span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-3)", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ padding: "6px 8px" }}>รหัส</th>
                  <th style={{ padding: "6px 8px" }}>ชื่อ</th>
                  <th style={{ padding: "6px 8px" }}>หมวด</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>คงเหลือ</th>
                  <th style={{ padding: "6px 8px" }}>หน่วย</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {view.map((m) => (
                  <tr key={m.code} style={{ borderBottom: "1px solid var(--line-soft, #f1f5f9)" }}>
                    <td style={{ padding: "6px 8px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{m.code}</td>
                    <td style={{ padding: "6px 8px" }}>{m.th}{m.tracked === false && <span style={{ fontSize: 11, color: "var(--ink-3)" }}> · ไม่นับสต๊อก</span>}</td>
                    <td style={{ padding: "6px 8px", color: "var(--ink-3)" }}>{m.catName || GLABEL[groupOf(m)]}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: m.onHand < 0 ? "#dc2626" : undefined }}>{fmtNum(m.onHand)}</td>
                    <td style={{ padding: "6px 8px", color: "var(--ink-3)" }}>{m.unit || ""}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(m.value)}</td>
                  </tr>
                ))}
                {!view.length && <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "var(--ink-3)" }}>ไม่มีรายการคงเหลือในหมวดนี้ ณ วันที่เลือก</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
