import React from "react";
import { listMaterialMovements } from "../lib/api";
import { fmtBaht, fmtBaht2, fmtNum } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";

const MOVE = {
  purchase: { th: "ซื้อเข้า", color: "#7c3aed", dir: 1, icon: "purchase" },
  withdraw: { th: "เบิกออก", color: "#2563eb", dir: -1, icon: "withdraw" },
  return:   { th: "รับคืน", color: "#16a34a", dir: 1, icon: "ret" },
  damage:   { th: "ตัดเสีย", color: "#dc2626", dir: -1, icon: "damage" },
};

export default function MaterialDrawer({ mat, onClose }) {
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
            <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <div className="mat-onhand">
            <div className="mat-onhand-main">
              <span className="mat-onhand-label">คงเหลือปัจจุบัน</span>
              <span className="mat-onhand-val" style={low ? { color: "var(--down)" } : {}}>{fmtNum(mat.stock)} <small>{mat.unit}</small></span>
              {low && <span className="inv-low-pill">ต่ำกว่าขั้นต่ำ</span>}
            </div>
            <div className="mat-onhand-side">
              <div><span>มูลค่าคงเหลือ</span><b>{fmtBaht(mat.stock * mat.cost)}</b></div>
              <div><span>ขั้นต่ำ</span><b>{mat.minStock} {mat.unit}</b></div>
              <div><span>ต้นทุน/หน่วย</span><b>{fmtBaht2(mat.cost)}</b></div>
            </div>
          </div>
        </div>

        <div className="drawer-body">
          <div className="drawer-sec">
            <div className="drawer-sec-title">สรุปการเคลื่อนไหว <span>ตลอดอายุ · แตะเพื่อกรอง</span></div>
            <div className="mstat-grid">
              <Tile type="purchase" /><Tile type="withdraw" /><Tile type="return" /><Tile type="damage" />
            </div>
          </div>

          <div className="drawer-sec">
            <div className="drawer-sec-title">รายการเคลื่อนไหว <span>{filter === "all" ? "ทั้งหมด" : MOVE[filter].th} · {ledger.length} รายการ</span></div>
            <div className="ledger">
              {loading && <div className="empty sm">กำลังโหลด…</div>}
              {!loading && ledger.length === 0 && <div className="empty sm">ยังไม่มีรายการเคลื่อนไหว</div>}
              {ledger.map((r) => {
                const mv = MOVE[r.type];
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
