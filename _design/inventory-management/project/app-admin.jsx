/* ============================================================
   app-admin.jsx — Procurement / admin desktop views
   ============================================================ */
const ADM = window.APP;

/* group flat txns by jobNo */
function groupByJob(recs) {
  const map = {};
  recs.forEach((r) => {
    (map[r.jobNo] = map[r.jobNo] || { jobNo: r.jobNo, team: r.team, items: [] }).items.push(r);
  });
  return Object.values(map);
}

/* ---------------- PURCHASE ---------------- */
function PurchaseView() {
  const { fmt, helpers } = ADM;
  const suggestions = helpers.purchaseSuggestions();
  const [order, setOrder] = React.useState(() => Object.fromEntries(suggestions.map((s) => [s.id, s.need])));
  const [checked, setChecked] = React.useState(() => Object.fromEntries(suggestions.map((s) => [s.id, true])));
  const [done, setDone] = React.useState(false);

  const lines = suggestions.filter((s) => checked[s.id] && order[s.id] > 0);
  const total = lines.reduce((a, s) => a + order[s.id] * s.cost, 0);
  const todayBuys = helpers.todays("purchase");
  const todayTotal = helpers.sum(todayBuys, "value");

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">สั่งซื้อวัสดุ <span className="page-title-en">Purchasing</span></h1>
          <p className="page-sub">สรุปรายการที่ต่ำกว่าขั้นต่ำ ประจำ {fmt.thDate(ADM.TODAY)}</p>
        </div>
        <div className="adm-head-stat">
          <div className="mini-stat"><span>ซื้อแล้ววันนี้</span><b>{fmt.fmtBaht(todayTotal)}</b></div>
          <div className="mini-stat"><span>ต้องสั่งเพิ่ม</span><b style={{ color: "#dc2626" }}>{suggestions.length} รายการ</b></div>
        </div>
      </div>

      <div className="po-layout">
        {/* suggestion table */}
        <div className="card po-table">
          <SectionHead title="รายการแนะนำให้สั่งซื้อ" sub="Auto-suggested from minimum stock level" />
          <div className="po-rows">
            <div className="po-row po-row-h">
              <span></span><span>วัสดุ</span><span className="c">คงเหลือ</span><span className="c">ขั้นต่ำ</span><span className="c">สั่งซื้อ</span><span className="r">มูลค่า</span>
            </div>
            {suggestions.map((s) => (
              <div className={"po-row" + (checked[s.id] ? "" : " off")} key={s.id}>
                <label className="po-check">
                  <input type="checkbox" checked={!!checked[s.id]} onChange={(e) => setChecked((c) => ({ ...c, [s.id]: e.target.checked }))} />
                </label>
                <div className="po-mat">
                  <MaterialThumb mat={s} size={36} radius={9} />
                  <div><div className="po-mat-name">{s.th}</div><div className="po-mat-code">{s.code} · {s.en}</div></div>
                </div>
                <span className="c"><span className={"stock-pill " + (s.stock < s.minStock * 0.5 ? "crit" : "low")}>{s.stock}</span></span>
                <span className="c muted">{s.minStock}</span>
                <span className="c">
                  <Stepper value={order[s.id] || 0} onChange={(v) => setOrder((o) => ({ ...o, [s.id]: v }))} step={s.unit === "เมตร" ? 10 : 1} />
                </span>
                <span className="r po-val">{fmt.fmtBaht(order[s.id] * s.cost)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PO summary */}
        <div className="card po-summary">
          <SectionHead title="ใบสั่งซื้อวันนี้" sub="Purchase Order" />
          <div className="po-sum-list">
            {lines.length === 0 && <div className="empty sm">ยังไม่เลือกรายการ</div>}
            {lines.map((s) => (
              <div className="po-sum-row" key={s.id}>
                <span className="po-sum-name">{s.th}</span>
                <span className="po-sum-qty">{order[s.id]} {s.unit}</span>
                <span className="po-sum-val">{fmt.fmtBaht(order[s.id] * s.cost)}</span>
              </div>
            ))}
          </div>
          <div className="po-sum-total"><span>รวมทั้งสิ้น</span><b>{fmt.fmtBaht(total)}</b></div>
          <button className={"btn-primary big" + (done ? " ok" : "")} disabled={!lines.length} onClick={() => { setDone(true); setTimeout(() => setDone(false), 2400); }}>
            {done ? <><UIcon name="check" size={18} color="#fff" strokeWidth={2.6} /> สั่งซื้อเรียบร้อย</> : <><UIcon name="purchase" size={18} color="#fff" /> ยืนยันสั่งซื้อ {lines.length} รายการ</>}
          </button>
          <div className="po-note">ระบบจะเพิ่มสต๊อกอัตโนมัติเมื่อของเข้า</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- APPROVE WITHDRAWALS ---------------- */
function ApproveView() {
  const { fmt, helpers, teamById } = ADM;
  const jobs = groupByJob(helpers.todays("withdraw"));
  const [issued, setIssued] = React.useState({});
  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">อนุมัติ & จ่ายเบิก <span className="page-title-en">Issue Withdrawals</span></h1>
          <p className="page-sub">คำขอเบิกของช่างวันนี้ · {jobs.length} ใบงาน</p>
        </div>
      </div>
      <div className="approve-grid">
        {jobs.map((j) => {
          const team = teamById[j.team];
          const val = j.items.reduce((a, r) => a + r.value, 0);
          const on = issued[j.jobNo];
          return (
            <div className={"approve-card" + (on ? " issued" : "")} key={j.jobNo} style={{ "--team": team.color }}>
              <div className="approve-top">
                <div className="approve-team"><TeamDot team={team} size={12} /> {team.name}</div>
                <span className="approve-job">{j.jobNo}</span>
              </div>
              <div className="approve-items">
                {j.items.map((r, i) => (
                  <div className="approve-item" key={i}>
                    <MaterialThumb mat={ADM.matById[r.mat]} size={34} radius={8} />
                    <span className="approve-item-name">{ADM.matById[r.mat].th}</span>
                    <span className="approve-item-qty">{r.qty} {ADM.matById[r.mat].unit}</span>
                  </div>
                ))}
              </div>
              <div className="approve-foot">
                <span className="approve-val">{fmt.fmtBaht(val)}</span>
                <button className={"btn-issue" + (on ? " done" : "")} onClick={() => setIssued((s) => ({ ...s, [j.jobNo]: !s[j.jobNo] }))}>
                  {on ? <><UIcon name="check" size={15} color="#fff" strokeWidth={2.6} /> จ่ายแล้ว</> : "จ่ายเบิก"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- RECEIVE RETURNS ---------------- */
function ReturnsView() {
  const { fmt, helpers, teamById } = ADM;
  const jobs = groupByJob(helpers.todays("return"));
  const [recv, setRecv] = React.useState({});
  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">รับคืนวัสดุ <span className="page-title-en">Receive Returns</span></h1>
          <p className="page-sub">วัสดุที่ช่างนำมาคืนวันนี้ · {jobs.length} ใบงาน</p>
        </div>
      </div>
      <div className="approve-grid">
        {jobs.map((j) => {
          const team = teamById[j.team];
          const val = j.items.reduce((a, r) => a + r.value, 0);
          const on = recv[j.jobNo];
          return (
            <div className={"approve-card return" + (on ? " issued" : "")} key={j.jobNo} style={{ "--team": team.color }}>
              <div className="approve-top">
                <div className="approve-team"><TeamDot team={team} size={12} /> {team.name}</div>
                <span className="approve-job">{j.jobNo}</span>
              </div>
              <div className="approve-items">
                {j.items.map((r, i) => (
                  <div className="approve-item" key={i}>
                    <MaterialThumb mat={ADM.matById[r.mat]} size={34} radius={8} />
                    <span className="approve-item-name">{ADM.matById[r.mat].th}</span>
                    <span className="approve-item-qty in">+{r.qty} {ADM.matById[r.mat].unit}</span>
                  </div>
                ))}
              </div>
              <div className="approve-foot">
                <span className="approve-val" style={{ color: "#16a34a" }}>คืน {fmt.fmtBaht(val)}</span>
                <button className={"btn-issue green" + (on ? " done" : "")} onClick={() => setRecv((s) => ({ ...s, [j.jobNo]: !s[j.jobNo] }))}>
                  {on ? <><UIcon name="check" size={15} color="#fff" strokeWidth={2.6} /> รับคืนแล้ว</> : "รับเข้าคลัง"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- WRITE-OFF DAMAGE ---------------- */
function DamageView() {
  const { fmt, helpers, teams, materials, teamById } = ADM;
  const REASONS = ["ชำรุด", "หาย", "หมดอายุ", "ใช้ผิดงาน"];
  const [team, setTeam] = React.useState("ARM");
  const [job, setJob] = React.useState("");
  const [matId, setMatId] = React.useState(materials[0].id);
  const [qty, setQty] = React.useState(1);
  const [reason, setReason] = React.useState("ชำรุด");
  const [photo, setPhoto] = React.useState(false);
  const recent = helpers.todays("damage").slice().reverse();
  const [log, setLog] = React.useState([]);
  const mat = ADM.matById[matId];

  function submit() {
    setLog((l) => [{ team, job: job || "—", mat, qty, reason, value: qty * mat.cost, ts: "เมื่อสักครู่" }, ...l]);
    setJob(""); setQty(1); setPhoto(false);
  }

  const allRecent = [...log, ...recent.map((r) => ({ team: r.team, job: r.jobNo, mat: ADM.matById[r.mat], qty: r.qty, reason: r.reason, value: r.value, ts: "วันนี้" }))];

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">ตัดวัสดุเสียหาย <span className="page-title-en">Damage Write-off</span></h1>
          <p className="page-sub">บันทึกวัสดุที่เสียหาย ระบุทีม · เลขงาน · สาเหตุ · แนบรูป</p>
        </div>
      </div>
      <div className="damage-layout">
        {/* form */}
        <div className="card damage-form">
          <SectionHead title="บันทึกของเสีย" sub="New write-off" />
          <label className="fld"><span>ทีมที่ทำเสีย</span>
            <div className="team-pick-row">
              {teams.map((t) => (
                <button key={t.id} className={"team-pick" + (team === t.id ? " on" : "")} onClick={() => setTeam(t.id)}
                  style={team === t.id ? { background: t.color, borderColor: t.color, color: "#fff" } : {}}>
                  <span style={{ width: 8, height: 8, borderRadius: 9, background: team === t.id ? "#fff" : t.color }} />{t.name.replace("Team ", "")}
                </button>
              ))}
            </div>
          </label>
          <label className="fld"><span>เลขที่งาน · Job No.</span>
            <input className="inp" placeholder="เช่น JB-260609-03" value={job} onChange={(e) => setJob(e.target.value)} />
          </label>
          <label className="fld"><span>วัสดุ · Material</span>
            <select className="inp" value={matId} onChange={(e) => setMatId(e.target.value)}>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.th}</option>)}
            </select>
          </label>
          <div className="fld-row">
            <label className="fld"><span>จำนวน ({mat.unit})</span>
              <Stepper value={qty} onChange={setQty} min={1} />
            </label>
            <label className="fld"><span>สาเหตุ · Reason</span>
              <div className="reason-row">
                {REASONS.map((r) => (
                  <button key={r} className={"reason-chip" + (reason === r ? " on" : "")} onClick={() => setReason(r)}>{r}</button>
                ))}
              </div>
            </label>
          </div>
          <label className="fld"><span>รูปถ่าย · Photo</span>
            <button className={"photo-drop" + (photo ? " filled" : "")} onClick={() => setPhoto(!photo)}>
              {photo ? <><UIcon name="check" size={18} color="#16a34a" strokeWidth={2.4} /> แนบรูปแล้ว (1)</> : <><UIcon name="camera" size={20} color="var(--ink-3)" /> ถ่ายรูป / แนบไฟล์</>}
            </button>
          </label>
          <div className="damage-cost">มูลค่าที่ตัดทิ้ง <b>{fmt.fmtBaht(qty * mat.cost)}</b></div>
          <button className="btn-danger big" onClick={submit}><UIcon name="damage" size={17} color="#fff" /> ยืนยันตัดของเสีย</button>
        </div>

        {/* recent */}
        <div className="card damage-recent">
          <SectionHead title="ของเสียวันนี้" sub={allRecent.length + " รายการ"}
            right={<span className="big-total" style={{ color: "#dc2626" }}>{fmt.fmtBaht(allRecent.reduce((a, r) => a + r.value, 0))}<small>รวม</small></span>} />
          <div className="damage-log">
            {allRecent.map((r, i) => (
              <div className="damage-log-row" key={i}>
                <MaterialThumb mat={r.mat} size={36} radius={9} />
                <div className="damage-log-info">
                  <div className="damage-log-name">{r.mat.th} <span className="qty">×{r.qty}</span></div>
                  <div className="damage-log-meta">
                    <TeamDot team={teamById[r.team]} size={7} /> {teamById[r.team].name.replace("Team ", "")}
                    <span className="dot">·</span>{r.job}<span className="dot">·</span><span className="reason-tag">{r.reason}</span>
                  </div>
                </div>
                <span className="damage-log-val">−{fmt.fmtBaht(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- CATALOG / STOCK ---------------- */
function CatalogView() {
  const { fmt, categories } = ADM;
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [extra, setExtra] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [openMat, setOpenMat] = React.useState(null);
  const materials = React.useMemo(() => [...extra, ...ADM.materials], [extra]);
  const [mins, setMins] = React.useState(() => Object.fromEntries(ADM.materials.map((m) => [m.id, m.minStock])));
  const ql = q.trim().toLowerCase();
  const list = materials.filter((m) =>
    (cat === "all" || m.cat === cat) &&
    (!ql || m.th.toLowerCase().includes(ql) || (m.en || "").toLowerCase().includes(ql) || m.code.toLowerCase().includes(ql) || m.catName.includes(q.trim()))
  );
  const min = (m) => (mins[m.id] != null ? mins[m.id] : m.minStock);
  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">คลังวัสดุ <span className="page-title-en">Material Catalog</span></h1>
          <p className="page-sub">{materials.length} รายการ · ค้นหา · คลิกเพื่อดูการเคลื่อนไหว · กำหนดขั้นต่ำเพื่อสั่งซื้ออัตโนมัติ</p>
        </div>
        <div className="cat-head-actions">
          <div className="cat-search">
            <UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาชื่อ / รหัส / หมวด" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
          </div>
          <button className="btn-primary" onClick={() => setAdding(true)}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มวัสดุ</button>
        </div>
      </div>
      <div className="cat-filter">
        <button className={"cat-chip" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")}
          style={cat === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทั้งหมด</button>
        {categories.map((c) => (
          <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}
            style={cat === c.id ? { background: c.color, color: "#fff", borderColor: c.color } : { color: c.color }}>
            <MatIcon name={c.icon} size={15} color={cat === c.id ? "#fff" : c.color} /> {c.th}
          </button>
        ))}
      </div>
      {list.length === 0 && <div className="empty">ไม่พบวัสดุที่ค้นหา “{q}”</div>}
      <div className="cat-grid">
        {list.map((m) => {
          const mn = min(m);
          const low = m.stock < mn;
          return (
            <div className={"cat-card clickable" + (low ? " low" : "")} key={m.id} onClick={() => setOpenMat(m.id)}>
              <div className="cat-card-top">
                <MaterialThumb mat={m} size={54} radius={14} showPhoto />
                <div className="cat-card-id">
                  <span className="code-chip">{m.code}</span>
                  {m._new && <span className="badge-new">ใหม่</span>}
                  {low && <span className="badge-warn sm">ต่ำกว่าขั้นต่ำ</span>}
                </div>
              </div>
              <div className="cat-card-name">{m.th}</div>
              <div className="cat-card-en">{m.en}</div>
              <StockBar mat={{ ...m, minStock: mn }} />
              <div className="cat-card-stats">
                <div><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{m.stock} {m.unit}</b></div>
                <div><span>ต้นทุน</span><b>{fmt.fmtBaht2(m.cost)}</b></div>
              </div>
              <div className="cat-card-min" onClick={(e) => e.stopPropagation()}>
                <span>ขั้นต่ำ · Min</span>
                <Stepper value={mn} onChange={(v) => setMins((s) => ({ ...s, [m.id]: v }))} step={m.unit === "เมตร" ? 10 : 1} unit={m.unit} />
              </div>
              <div className="cat-card-move">ดูการเคลื่อนไหว <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
            </div>
          );
        })}
      </div>
      {openMat && <MaterialDrawer matId={openMat} onClose={() => setOpenMat(null)} />}
      {adding && <AddMaterialModal onAdd={(m) => setExtra((x) => [m, ...x])} onClose={() => setAdding(false)} />}
    </div>
  );
}

window.AdminViews = { PurchaseView, ApproveView, ReturnsView, DamageView, CatalogView };
