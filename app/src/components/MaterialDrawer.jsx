import React from "react";
import { listMaterialMovements } from "../lib/api";
import { fmtBaht, fmtBaht2, fmtNum } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";

const MOVE = {
  purchase:   { th: "ซื้อเข้า", color: "#7c3aed", dir: 1, icon: "purchase" },
  withdraw:   { th: "เบิกออก", color: "#2563eb", dir: -1, icon: "withdraw" },
  return:     { th: "รับคืน", color: "#16a34a", dir: 1, icon: "ret" },
  damage:     { th: "ตัดเสีย", color: "#dc2626", dir: -1, icon: "damage" },
  adjust_in:  { th: "ปรับยอด (นับสต๊อก +)", color: "#0891b2", dir: 1, icon: "purchase" },
  adjust_out: { th: "ปรับยอด (นับสต๊อก −)", color: "#ea580c", dir: -1, icon: "damage" },
};
// ชนิดที่ไม่รู้จัก (เผื่อเพิ่มในอนาคต) — ต้องไม่ทำให้ drawer พังทั้งจอ
const MOVE_FALLBACK = { th: "อื่น ๆ", color: "#64748b", dir: 1, icon: "box" };

export default function MaterialDrawer({ mat, onClose, onEdit }) {
  const [recs, setRecs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const low = mat.stock < mat.minStock;

  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    listMaterialMovements(mat.code).then((r) => { setRecs(r); setLoading(false); }).catch(() => setLoading(false));
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const agg = (type) => {
    const f = recs.filter((r) => r.type === type);
    return { value: f.reduce((a, r) => a + Number(r.value || 0), 0), qty: f.reduce((a, r) => a + Number(r.qty || 0), 0), count: f.length };
  };
  const ledger = filter === "all" ? recs : recs.filter((r) => r.type === filter);
  const fmtDate = (ds) => new Date(ds + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

  const Tile = ({ type }) => {
    const d = agg(type);
    return (
      <button className={"mstat" + (filter === type ? " on" : "")} style={{ "--mc": MOVE[type].color }}
        onClick={() => setFilter(filter === type ? "all" : type)}>
        <div className="mstat-top"><span className="mstat-dot" style={{ background: MOVE[type].color }} />{MOVE[type].th}</div>
        <div className="mstat-val">{fmtBaht(d.value)}</div>
        <div className="mstat-qty">{fmtNum(d.qty)} {mat.unit} · {d.count} ครั้ง</div>
      </button>
    );
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} style={{ "--mc": mat.color }}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <MaterialThumb mat={mat} size={46} radius={13} />
            <div style={{ minWidth: 0 }}>
              <div className="drawer-title">{mat.th}</div>
              <div className="drawer-en"><span className="code-chip">{mat.code}</span> {mat.en}</div>
            </div>
            {onEdit && <button className="btn-ghost sm" style={{ marginLeft: "auto", flex: "none" }} onClick={onEdit}><UIcon name="edit" size={14} /> แก้ไข</button>}
            <button className="drawer-close" onClick={onClose} style={onEdit ? { marginLeft: 8 } : {}}><UIcon name="x" size={20} /></button>
          </div>
          <div className="mat-onhand">
            <div className="mat-onhand-main">
              <span className="mat-onhand-label">คงเหลือปัจจุบัน</span>
              <span className="mat-onhand-val" style={low ? { color: "var(--down)" } : {}}>{fmtNum(mat.stock)} <small>{mat.unit}</small></span>
              {low && <span className="inv-low-pill">ต่ำกว่าขั้นต่ำ</span>}
            </div>
            <div className="mat-onhand-side">
              <div><span>มูลค่าคงเหลือ</span><b>{fmtBaht(mat.stock * mat.cost)}</b></div>
              <div><span>ต้นทุน/หน่วย</span><b>{fmtBaht2(mat.cost)}</b></div>
              <div><span>ราคาขาย/หน่วย</span><b style={{ color: "var(--up)" }}>{fmtBaht2(mat.salePrice || 0)}</b></div>
            </div>
          </div>
          {mat.description && <div className="mat-desc">{mat.description}</div>}
        </div>

        <div className="drawer-body">
          {(() => {
            // รายละเอียดสินค้าครบทุกช่องจากการ์ด (เฉพาะที่มีค่า) — ราคาทุน/สต๊อกแสดงอยู่ส่วนหัวแล้ว
            const KIND_TH = { ac: "เครื่องปรับอากาศ", service: "บริการ", material: "วัสดุ" };
            const isAc = mat.kind === "ac";
            const specs = [
              ["ประเภท", KIND_TH[mat.kind] || mat.kind],
              isAc && ["ยี่ห้อ", mat.brand],
              isAc && ["รุ่น/ซีรีส์", mat.series],
              isAc ? ["ประเภทแอร์", mat.ac_type] : ["หมวด", mat.catName],
              isAc && ["ขนาด", mat.btu ? `${fmtNum(mat.btu)} BTU` : null],
              mat.kind === "service" && ["สำหรับแอร์", (mat.btu_min || mat.btu_max) ? `${fmtNum(mat.btu_min || 0)}–${fmtNum(mat.btu_max || mat.btu_min || 0)} BTU` : null],
              isAc && ["ค่า SEER", mat.seer],
              isAc && ["ฉลากประหยัดไฟ", mat.energy_label],
              isAc && ["ชนิดน้ำยา", mat.refrigerant],
              isAc && ["ระบบไฟ", mat.voltage],
              isAc && ["ขนาดท่อน้ำยา", mat.pipe_size],
              isAc && ["⚡ ค่าไฟโดยประมาณ", Number(mat.power_cost_year) > 0 ? `~${fmtBaht(mat.power_cost_year)}/ปี` : null],
              ["หน่วย", mat.unit],
              mat.purchaseUnit && ["หน่วยซื้อ", `${mat.purchaseUnit} (1 ${mat.purchaseUnit} = ${fmtNum(mat.purchaseQty || 0)} ${mat.unit})`],
              ["แสดงบนเว็บไซต์", mat.webPublished ? "✅ แสดง" : "ไม่แสดง"],
            ].filter((s) => s && s[1] != null && s[1] !== "");
            return (
              <div className="drawer-sec">
                <div className="drawer-sec-title">รายละเอียดสินค้า</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "6px 8px" }}>
                  {specs.map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5, padding: "7px 10px", background: "var(--surface-2)", borderRadius: 9 }}>
                      <span style={{ color: "var(--ink-3)", flex: "none" }}>{k}</span>
                      <b style={{ textAlign: "right", overflowWrap: "anywhere" }}>{v}</b>
                    </div>
                  ))}
                </div>
                {isAc && mat.warranty && (
                  <div style={{ marginTop: 8, padding: "9px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--up) 9%, white)", border: "1.5px solid color-mix(in srgb, var(--up) 30%, white)", fontSize: 13 }}>
                    🛡️ <b>การรับประกัน:</b> {mat.warranty}
                  </div>
                )}
                {mat.features && (
                  <div style={{ marginTop: 8, padding: "9px 12px", borderRadius: 10, background: "var(--surface-2)", fontSize: 12.5, whiteSpace: "pre-wrap" }}>
                    <b>📋 คุณสมบัติสินค้า</b>{"\n"}{mat.features}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="drawer-sec">
            <div className="drawer-sec-title">สรุปการเคลื่อนไหว <span>ตลอดอายุ · แตะเพื่อกรอง</span></div>
            <div className="mstat-grid">
              <Tile type="purchase" /><Tile type="withdraw" /><Tile type="return" /><Tile type="damage" />
            </div>
          </div>

          <div className="drawer-sec">
            <div className="drawer-sec-title">รายการเคลื่อนไหว <span>{filter === "all" ? "ทั้งหมด" : (MOVE[filter] || MOVE_FALLBACK).th} · {ledger.length} รายการ</span></div>
            <div className="ledger">
              {loading && <div className="empty sm">กำลังโหลด…</div>}
              {!loading && ledger.length === 0 && <div className="empty sm">ยังไม่มีรายการเคลื่อนไหว</div>}
              {ledger.map((r) => {
                const mv = MOVE[r.type] || MOVE_FALLBACK;
                return (
                  <div className="ledger-row" key={r.id}>
                    <span className="ledger-badge" style={{ background: `color-mix(in srgb, ${mv.color} 13%, white)`, color: mv.color }}>
                      <UIcon name={mv.icon} size={14} strokeWidth={2} color={mv.color} />
                    </span>
                    <div className="ledger-info">
                      <div className="ledger-type" style={{ color: mv.color }}>{mv.th}</div>
                      <div className="ledger-meta">
                        {r.team ? <>{r.team}<span className="dot">·</span></> : null}
                        {r.job_no ? <><span className="tx-job">{r.job_no}</span></> : null}
                        {r.reason ? <><span className="dot">·</span><span className="reason-tag sm">{r.reason}</span></> : null}
                      </div>
                    </div>
                    <div className="ledger-amt">
                      <div className="ledger-qty" style={{ color: mv.color }}>{mv.dir > 0 ? "+" : "−"}{fmtNum(r.qty)} {mat.unit}</div>
                      <div className="ledger-date">{fmtDate(r.txn_date)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
