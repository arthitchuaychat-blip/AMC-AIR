import React from "react";
import { fmtBaht, fmtNum } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";

const META = {
  withdraw:  { th: "ยอดเบิก", en: "Withdrawals", color: "#2563eb", icon: "withdraw", net: false, types: ["withdraw"], team: true },
  used:      { th: "วัสดุที่ใช้จริง", en: "Net used · เบิก − คืน", color: "#0d9488", icon: "box", net: true, team: true },
  purchase:  { th: "ยอดซื้อ", en: "Purchasing", color: "#7c3aed", icon: "purchase", net: false, types: ["purchase"], team: false },
  damage:    { th: "วัสดุเสียหาย", en: "Damaged", color: "#dc2626", icon: "damage", net: false, types: ["damage"], team: true },
  inventory: { th: "มูลค่าวัสดุคงเหลือ", en: "Inventory on hand · ณ ปัจจุบัน", color: "#4f46e5", icon: "box", inventory: true },
};

export default function DashDrawer({ kind, periodLabel, txns, teams, mats, onClose }) {
  const M = META[kind];
  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  let total = 0, totalQty = 0, teamData = {}, matList = [];

  if (M.inventory) {
    matList = mats.filter((m) => m.stock > 0).map((m) => ({ mat: m, value: m.stock * m.cost, qty: m.stock }))
      .sort((a, b) => b.value - a.value);
    total = matList.reduce((a, x) => a + x.value, 0);
    totalQty = matList.reduce((a, x) => a + x.qty, 0);
  } else {
    const consider = M.net ? ["withdraw", "return"] : M.types;
    const matAgg = {};
    for (const r of txns) {
      if (!consider.includes(r.type)) continue;
      const s = M.net ? (r.type === "withdraw" ? 1 : -1) : 1;
      const v = (Number(r.value) || 0) * s, q = (Number(r.qty) || 0) * s;
      total += v; totalQty += q;
      const tk = r.team || "ส่วนกลาง";
      teamData[tk] = (teamData[tk] || 0) + v;
      matAgg[r.material_code] = matAgg[r.material_code] || { value: 0, qty: 0 };
      matAgg[r.material_code].value += v; matAgg[r.material_code].qty += q;
    }
    matList = Object.entries(matAgg).map(([code, a]) => ({ mat: matMap[code] || { code, th: code, color: "#888", unit: "" }, value: a.value, qty: a.qty }))
      .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  }

  const teamMax = Math.max(1, ...teams.map((t) => teamData[t.id] || 0));
  const matMax = Math.max(1, ...matList.map((m) => m.value));

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} style={{ "--mc": M.color }}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <span className="drawer-ico" style={{ background: `color-mix(in srgb, ${M.color} 14%, white)`, color: M.color }}>
              <UIcon name={M.icon} size={22} strokeWidth={1.9} />
            </span>
            <div>
              <div className="drawer-title">{M.th}</div>
              <div className="drawer-en">{M.en}{!M.inventory ? ` · ${periodLabel}` : ""}</div>
            </div>
            <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <div className="drawer-big" style={{ color: M.color }}>{fmtBaht(total)}</div>
          <div className="drawer-mini">
            <span><b>{fmtNum(totalQty)}</b> หน่วย</span>
            <span className="sep">·</span>
            <span><b>{matList.length}</b> ชนิดวัสดุ</span>
          </div>
        </div>

        <div className="drawer-body">
          {/* BY TEAM */}
          {M.team && (
            <div className="drawer-sec">
              <div className="drawer-sec-title">แยกตามทีม <span>By team</span></div>
              <div className="tbars">
                {teams.map((t) => {
                  const v = teamData[t.id] || 0;
                  return (
                    <div className="tbar-row" key={t.id}>
                      <div className="tbar-label"><span style={{ width: 10, height: 10, borderRadius: 99, background: t.color, display: "inline-block" }} /> {t.name.replace("Team ", "")}</div>
                      <div className="tbar-track"><div className="tbar-fill" style={{ width: Math.max(0, v) / teamMax * 100 + "%", background: t.color }} /></div>
                      <div className="tbar-val">{fmtBaht(v)}</div>
                    </div>
                  );
                })}
                {teamData["ส่วนกลาง"] != null && (
                  <div className="tbar-row">
                    <div className="tbar-label"><span style={{ width: 10, height: 10, borderRadius: 99, background: "#9aa3b2", display: "inline-block" }} /> ส่วนกลาง</div>
                    <div className="tbar-track"><div className="tbar-fill" style={{ width: Math.max(0, teamData["ส่วนกลาง"]) / teamMax * 100 + "%", background: "#9aa3b2" }} /></div>
                    <div className="tbar-val">{fmtBaht(teamData["ส่วนกลาง"])}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BY MATERIAL / INVENTORY ITEMS */}
          <div className="drawer-sec">
            <div className="drawer-sec-title">{M.inventory ? "รายการคงเหลือ" : "แยกตามวัสดุ"} <span>{M.inventory ? "เฉพาะที่มีของ" : "By material"} · {matList.length} ชนิด</span></div>
            <div className="matbars">
              {matList.length === 0 && <div className="empty sm">ไม่มีข้อมูล</div>}
              {matList.map(({ mat, value, qty }) => (
                <div className="matbar-row" key={mat.code}>
                  <MaterialThumb mat={mat} size={34} radius={9} />
                  <div className="matbar-info">
                    <div className="matbar-name">{mat.th}</div>
                    <div className="matbar-track"><div style={{ width: value / matMax * 100 + "%", background: mat.color }} /></div>
                  </div>
                  <div className="matbar-amt">
                    <div className="matbar-val">{fmtBaht(value)}</div>
                    <div className="matbar-qty">{fmtNum(qty)} {mat.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
