/* ============================================================
   app-detail.jsx — KPI drill-down slide-over drawer
   ============================================================ */
const DET = window.APP;

const METRICS = {
  withdraw: { th: "ยอดเบิก", en: "Withdrawals", color: "#2563eb", icon: "withdraw", type: "withdraw", team: true },
  used: { th: "วัสดุที่ใช้จริง", en: "Net Used · เบิก − คืน", color: "#0d9488", icon: "box", net: true, team: true },
  purchase: { th: "ยอดซื้อ", en: "Purchasing", color: "#7c3aed", icon: "purchase", type: "purchase", team: false },
  damage: { th: "วัสดุเสียหาย", en: "Damaged write-off", color: "#dc2626", icon: "damage", type: "damage", team: true, reason: true },
};
const PERIOD_LABEL = { day: "วันนี้", month: "เดือนนี้", year: "ปีนี้", all: "ตลอดอายุ" };

function aggBy(type, period) {
  const out = {};
  DET.helpers.filter({ type, period, ref: DET.TODAY }).forEach((r) => {
    (out[r.mat] = out[r.mat] || { value: 0, qty: 0 }).value += r.value;
    out[r.mat].qty += r.qty;
  });
  return out;
}

function DetailDrawer({ metric, period, onClose }) {
  const M = METRICS[metric];
  const { fmt, helpers, matById, teamById, teams } = DET;
  const ref = DET.TODAY;

  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  // ---- per-team breakdown ----
  let teamData;
  if (M.net) {
    const w = helpers.byTeam("withdraw", period, ref);
    const rt = helpers.byTeam("return", period, ref);
    teamData = { _total: { value: w._total.value - rt._total.value, qty: w._total.qty - rt._total.qty, count: w._total.count } };
    teams.forEach((t) => (teamData[t.id] = { value: w[t.id].value - rt[t.id].value, qty: w[t.id].qty - rt[t.id].qty, count: w[t.id].count }));
  } else {
    teamData = helpers.byTeam(M.type, period, ref);
  }

  // ---- totals (from real records so team-less metrics like purchase are correct) ----
  let totalValue, totalQty, totalCount;
  if (M.net) {
    totalValue = teamData._total.value; totalQty = teamData._total.qty; totalCount = teamData._total.count;
  } else {
    const recs = helpers.filter({ type: M.type, period, ref });
    totalValue = helpers.sum(recs, "value");
    totalQty = helpers.sum(recs, "qty");
    totalCount = recs.length;
  }

  // ---- per-material breakdown ----
  let matList;
  if (M.net) {
    const w = aggBy("withdraw", period), rt = aggBy("return", period);
    matList = DET.materials.map((m) => ({ mat: m, value: (w[m.id]?.value || 0) - (rt[m.id]?.value || 0), qty: (w[m.id]?.qty || 0) - (rt[m.id]?.qty || 0) }));
  } else {
    const a = aggBy(M.type, period);
    matList = Object.entries(a).map(([id, v]) => ({ mat: matById[id], value: v.value, qty: v.qty }));
  }
  matList = matList.filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const matMax = Math.max(1, ...matList.map((m) => m.value));
  const teamMax = Math.max(1, ...teams.map((t) => teamData[t.id].value));

  // ---- transaction list ----
  let txList;
  if (M.net) {
    txList = helpers.filter({ type: "withdraw", period, ref }).map((r) => ({ ...r, sign: "out" }))
      .concat(helpers.filter({ type: "return", period, ref }).map((r) => ({ ...r, sign: "in" })));
  } else {
    txList = helpers.filter({ type: M.type, period, ref }).slice();
  }
  txList.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const shown = txList.slice(0, 80);

  function fmtDate(ds) {
    return new Date(ds + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} style={{ "--mc": M.color }}>
        {/* HEAD */}
        <div className="drawer-head">
          <div className="drawer-head-row">
            <span className="drawer-ico" style={{ background: `color-mix(in srgb, ${M.color} 14%, white)`, color: M.color }}>
              <UIcon name={M.icon} size={22} strokeWidth={1.9} />
            </span>
            <div>
              <div className="drawer-title">{M.th}</div>
              <div className="drawer-en">{M.en} · {PERIOD_LABEL[period]}</div>
            </div>
            <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <div className="drawer-big" style={{ color: M.color }}>{fmt.fmtBaht(totalValue)}</div>
          <div className="drawer-mini">
            <span><b>{fmt.fmtNum(totalCount)}</b> รายการ</span>
            <span className="sep">·</span>
            <span><b>{fmt.fmtNum(totalQty)}</b> หน่วย</span>
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
                  const v = teamData[t.id];
                  return (
                    <div className="tbar-row drawer-tbar" key={t.id}>
                      <div className="tbar-label"><TeamDot team={t} /> {t.name.replace("Team ", "")}</div>
                      <div className="tbar-track"><div className="tbar-fill" style={{ width: (v.value / teamMax * 100) + "%", background: t.color }} /></div>
                      <div className="tbar-val">{fmt.fmtBaht(v.value)}</div>
                      <div className="tbar-pct">{Math.round(v.value / Math.max(1, totalValue) * 100)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* BY MATERIAL */}
          <div className="drawer-sec">
            <div className="drawer-sec-title">แยกตามวัสดุ <span>By material · {matList.length} ชนิด</span></div>
            <div className="matbars">
              {matList.map(({ mat, value, qty }) => (
                <div className="matbar-row" key={mat.id}>
                  <MaterialThumb mat={mat} size={34} radius={9} />
                  <div className="matbar-info">
                    <div className="matbar-name">{mat.th}</div>
                    <div className="matbar-track"><div style={{ width: (value / matMax * 100) + "%", background: mat.color }} /></div>
                  </div>
                  <div className="matbar-amt">
                    <div className="matbar-val">{fmt.fmtBaht(value)}</div>
                    <div className="matbar-qty">{fmt.fmtNum(qty)} {mat.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TRANSACTIONS */}
          <div className="drawer-sec">
            <div className="drawer-sec-title">รายการธุรกรรม <span>{shown.length < txList.length ? `แสดง ${shown.length} จาก ${fmt.fmtNum(txList.length)}` : `${txList.length} รายการ`}</span></div>
            <div className="tx-list">
              {shown.map((r, i) => {
                const mat = matById[r.mat];
                const team = r.team ? teamById[r.team] : null;
                return (
                  <div className="tx-row" key={i}>
                    <MaterialThumb mat={mat} size={32} radius={8} />
                    <div className="tx-info">
                      <div className="tx-name">{mat.th}</div>
                      <div className="tx-meta">
                        {team ? <><TeamDot team={team} size={7} /> {team.name.replace("Team ", "")}<span className="dot">·</span></> : null}
                        <span className="tx-job">{r.jobNo}</span>
                        <span className="dot">·</span>{fmtDate(r.date)}
                        {M.reason && r.reason ? <span className="reason-tag sm">{r.reason}</span> : null}
                        {r.sign === "in" ? <span className="tx-tag-in">คืน</span> : null}
                      </div>
                    </div>
                    <div className="tx-amt">
                      <div className="tx-qty">{r.sign === "in" ? "+" : ""}{r.qty} {mat.unit}</div>
                      <div className="tx-val" style={r.sign === "in" ? { color: "var(--up)" } : {}}>{r.sign === "in" ? "+" : ""}{fmt.fmtBaht(r.value)}</div>
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

window.DetailDrawer = DetailDrawer;

/* ============================================================
   MaterialDrawer — per-item movement ledger (รายการเคลื่อนไหว)
   ============================================================ */
const MOVE = {
  purchase: { th: "ซื้อเข้า", en: "Purchase", color: "#7c3aed", dir: 1, icon: "purchase" },
  withdraw: { th: "เบิกออก", en: "Withdraw", color: "#2563eb", dir: -1, icon: "withdraw" },
  return: { th: "รับคืน", en: "Return", color: "#16a34a", dir: 1, icon: "ret" },
  damage: { th: "ตัดเสีย", en: "Damage", color: "#dc2626", dir: -1, icon: "damage" },
};

function MaterialDrawer({ matId, onClose }) {
  const { fmt, matById, teamById, txns } = DET;
  const mat = matById[matId];
  const [filter, setFilter] = React.useState("all");

  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const recs = txns.filter((t) => t.mat === matId);
  const agg = (type) => {
    const f = recs.filter((r) => r.type === type);
    return { value: f.reduce((a, r) => a + r.value, 0), qty: f.reduce((a, r) => a + r.qty, 0), count: f.length };
  };
  const w = agg("withdraw"), rt = agg("return"), pu = agg("purchase"), dm = agg("damage");
  const low = mat.stock < mat.minStock;

  let ledger = recs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (filter !== "all") ledger = ledger.filter((r) => r.type === filter);
  const shown = ledger.slice(0, 150);

  const fmtDate = (ds) => new Date(ds + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

  const StatTile = ({ type, data }) => (
    <button className={"mstat" + (filter === type ? " on" : "")} onClick={() => setFilter(filter === type ? "all" : type)} style={{ "--mc": MOVE[type].color }}>
      <div className="mstat-top"><span className="mstat-dot" style={{ background: MOVE[type].color }} />{MOVE[type].th}</div>
      <div className="mstat-val">{fmt.fmtBaht(data.value)}</div>
      <div className="mstat-qty">{fmt.fmtNum(data.qty)} {mat.unit} · {data.count} ครั้ง</div>
    </button>
  );

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} style={{ "--mc": mat.color }}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <MaterialThumb mat={mat} size={46} radius={13} showPhoto />
            <div style={{ minWidth: 0 }}>
              <div className="drawer-title">{mat.th}</div>
              <div className="drawer-en"><span className="code-chip">{mat.code}</span> {mat.en}</div>
            </div>
            <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <div className="mat-onhand">
            <div className="mat-onhand-main">
              <span className="mat-onhand-label">คงเหลือปัจจุบัน</span>
              <span className="mat-onhand-val" style={low ? { color: "var(--down)" } : {}}>{fmt.fmtNum(mat.stock)} <small>{mat.unit}</small></span>
              {low && <span className="inv-low-pill">ต่ำกว่าขั้นต่ำ</span>}
            </div>
            <div className="mat-onhand-side">
              <div><span>มูลค่าคงเหลือ</span><b>{fmt.fmtBaht(mat.stock * mat.cost)}</b></div>
              <div><span>ขั้นต่ำ</span><b>{mat.minStock} {mat.unit}</b></div>
              <div><span>ต้นทุน/หน่วย</span><b>{fmt.fmtBaht2(mat.cost)}</b></div>
            </div>
          </div>
        </div>

        <div className="drawer-body">
          <div className="drawer-sec">
            <div className="drawer-sec-title">สรุปการเคลื่อนไหว <span>ตลอดอายุ · แตะเพื่อกรอง</span></div>
            <div className="mstat-grid">
              <StatTile type="purchase" data={pu} />
              <StatTile type="withdraw" data={w} />
              <StatTile type="return" data={rt} />
              <StatTile type="damage" data={dm} />
            </div>
          </div>

          <div className="drawer-sec">
            <div className="drawer-sec-title">รายการเคลื่อนไหว <span>{filter === "all" ? "ทั้งหมด" : MOVE[filter].th} · {shown.length < ledger.length ? `แสดง ${shown.length} จาก ${fmt.fmtNum(ledger.length)}` : `${ledger.length} รายการ`}</span></div>
            <div className="ledger">
              {shown.map((r, i) => {
                const mv = MOVE[r.type];
                const team = r.team ? teamById[r.team] : null;
                return (
                  <div className="ledger-row" key={i}>
                    <span className="ledger-badge" style={{ background: `color-mix(in srgb, ${mv.color} 13%, white)`, color: mv.color }}>
                      <UIcon name={mv.icon} size={14} strokeWidth={2} color={mv.color} />
                    </span>
                    <div className="ledger-info">
                      <div className="ledger-type" style={{ color: mv.color }}>{mv.th}</div>
                      <div className="ledger-meta">
                        {team ? <><TeamDot team={team} size={7} /> {team.name.replace("Team ", "")}<span className="dot">·</span></> : null}
                        <span className="tx-job">{r.jobNo}</span>
                        {r.reason ? <><span className="dot">·</span><span className="reason-tag sm">{r.reason}</span></> : null}
                      </div>
                    </div>
                    <div className="ledger-amt">
                      <div className="ledger-qty" style={{ color: mv.color }}>{mv.dir > 0 ? "+" : "−"}{fmt.fmtNum(r.qty)} {mat.unit}</div>
                      <div className="ledger-date">{fmtDate(r.date)}</div>
                    </div>
                  </div>
                );
              })}
              {shown.length === 0 && <div className="empty sm">ไม่มีรายการ</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   AddMaterialModal — quick add new catalog item
   ============================================================ */
function AddMaterialModal({ onAdd, onClose }) {
  const { categories } = DET;
  const [f, setF] = React.useState({ th: "", en: "", code: "", cat: "pipe", unit: "เมตร", cost: "", minStock: "", stock: "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = f.th && f.code && f.cost;

  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  function submit() {
    if (!valid) return;
    const cat = DET.catById[f.cat];
    onAdd({
      id: f.code, code: f.code, th: f.th, en: f.en || f.th, cat: f.cat, catName: cat.th,
      color: cat.color, unit: f.unit, cost: +f.cost || 0, minStock: +f.minStock || 0, stock: +f.stock || 0,
      icon: cat.icon, idx: 999, _new: true,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">เพิ่มวัสดุใหม่ <span>Add material</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>รหัส · Code *</span><input className="inp" value={f.code} onChange={set("code")} placeholder="เช่น COPP8" /></label>
            <label className="fld"><span>หมวด · Category</span>
              <select className="inp" value={f.cat} onChange={set("cat")}>{categories.map((c) => <option key={c.id} value={c.id}>{c.th}</option>)}</select>
            </label>
          </div>
          <label className="fld"><span>ชื่อวัสดุ (ไทย) *</span><input className="inp" value={f.th} onChange={set("th")} placeholder="เช่น ท่อทองแดงแบบม้วน 1 นิ้ว" /></label>
          <label className="fld"><span>ชื่อวัสดุ (English)</span><input className="inp" value={f.en} onChange={set("en")} placeholder={'Copper Coil 1"'} /></label>
          <div className="fld-row3">
            <label className="fld"><span>หน่วย</span>
              <select className="inp" value={f.unit} onChange={set("unit")}>{["เมตร", "ชิ้น", "ตัว", "ชุด", "ถัง", "ม้วน", "เส้น", "กระป๋อง"].map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
            <label className="fld"><span>ต้นทุน/หน่วย *</span><input className="inp" type="number" value={f.cost} onChange={set("cost")} placeholder="0.00" /></label>
            <label className="fld"><span>ขั้นต่ำ</span><input className="inp" type="number" value={f.minStock} onChange={set("minStock")} placeholder="0" /></label>
          </div>
          <label className="fld"><span>จำนวนคงเหลือเริ่มต้น</span><input className="inp" type="number" value={f.stock} onChange={set("stock")} placeholder="0" /></label>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={!valid} onClick={submit}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มวัสดุ</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MaterialDrawer, AddMaterialModal });
