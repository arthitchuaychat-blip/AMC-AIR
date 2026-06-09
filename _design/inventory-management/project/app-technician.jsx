/* ============================================================
   app-technician.jsx — Mobile flows for field teams (เบิก / คืน)
   ============================================================ */
const TECH = window.APP;

/* seed: a couple of open withdrawals so the Return flow has content */
function seedOpenWithdrawals(teamId) {
  const ymd = TECH.TODAY_STR.replace(/-/g, "").slice(2);
  const mk = (jobNo, items) => ({
    jobNo, team: teamId, time: items.time,
    items: items.list.map(([id, q]) => ({ mat: TECH.matById[id], withdrawn: q, returned: 0 })),
  });
  return [
    mk("JB-" + ymd + "-01", { time: "08:12", list: [["COPP3", 30], ["INS12", 24], ["C9012", 8], ["THW25", 40]] }),
    mk("JB-" + ymd + "-04", { time: "09:40", list: [["COPP2", 20], ["R32", 1], ["TAPE", 4], ["SILVER", 6]] }),
  ];
}

function MatRow({ mat, qty, onQty, accent }) {
  const { fmt } = TECH;
  return (
    <div className="mrow">
      <MaterialThumb mat={mat} size={52} radius={13} showPhoto />
      <div className="mrow-info">
        <div className="mrow-th">{mat.th}</div>
        <div className="mrow-en">{mat.en}</div>
        <div className="mrow-meta">
          <span className="code-chip">{mat.code}</span>
          <span className="mrow-cost">{fmt.fmtBaht2(mat.cost)}/{mat.unit}</span>
        </div>
      </div>
      <div className="mrow-action">
        {qty > 0 ? (
          <Stepper value={qty} onChange={onQty} unit={mat.unit} />
        ) : (
          <button className="add-btn" style={{ background: accent }} onClick={() => onQty(mat.unit === "เมตร" ? 5 : 1)}>
            <UIcon name="plus" size={18} color="#fff" strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}

function TechApp({ teamId, setTeamId }) {
  const { fmt, materials, categories, teamById } = TECH;
  const team = teamById[teamId];
  const [tab, setTab] = React.useState("withdraw");
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [cart, setCart] = React.useState({});
  const [job, setJob] = React.useState("JB-" + TECH.TODAY_STR.replace(/-/g, "").slice(2) + "-07");
  const [open, setOpen] = React.useState(() => seedOpenWithdrawals(teamId));
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => { setOpen(seedOpenWithdrawals(teamId)); setCart({}); }, [teamId]);

  function flash(msg, color) { setToast({ msg, color }); setTimeout(() => setToast(null), 2200); }

  const filtered = materials.filter((m) =>
    (cat === "all" || m.cat === cat) &&
    (!q || m.th.includes(q) || m.en.toLowerCase().includes(q.toLowerCase()) || m.code.toLowerCase().includes(q.toLowerCase()))
  );
  const cartItems = Object.entries(cart).filter(([, v]) => v > 0);
  const cartCount = cartItems.length;
  const cartValue = cartItems.reduce((a, [id, v]) => a + v * TECH.matById[id].cost, 0);

  function submitWithdraw() {
    if (!cartCount) return;
    const items = cartItems.map(([id, v]) => ({ mat: TECH.matById[id], withdrawn: v, returned: 0 }));
    setOpen((o) => [{ jobNo: job, team: teamId, time: "now", items }, ...o]);
    setCart({});
    setTab("return");
    flash("เบิกสำเร็จ · " + cartCount + " รายการ ส่งให้ธุรการแล้ว", "#16a34a");
  }

  function setReturn(jobNo, matId, val) {
    setOpen((o) => o.map((w) => w.jobNo !== jobNo ? w : {
      ...w, items: w.items.map((it) => it.mat.id !== matId ? it : { ...it, returned: Math.min(it.withdrawn, Math.max(0, val)) }),
    }));
  }
  function submitReturn(jobNo) {
    setOpen((o) => o.filter((w) => w.jobNo !== jobNo));
    flash("รับคืนงาน " + jobNo + " เรียบร้อย", "#2563eb");
  }

  return (
    <IOSDevice width={400} height={860}>
      <div className="tech" style={{ "--team": team.color }}>
        {/* HEADER */}
        <div className="tech-head" style={{ background: `linear-gradient(135deg, ${team.color}, color-mix(in srgb, ${team.color} 65%, #111))` }}>
          <div className="tech-head-top">
            <div>
              <div className="tech-hi">สวัสดี, {team.lead}</div>
              <div className="tech-date">{TECH.TODAY.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })} · งานวันนี้</div>
            </div>
            <select className="tech-team-pick" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {TECH.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {tab === "withdraw" && (
            <div className="job-field">
              <div className="job-label">เลขที่งาน · Job No.</div>
              <input className="job-input" value={job} onChange={(e) => setJob(e.target.value)} />
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="tech-body">
          {tab === "withdraw" && (
            <>
              <div className="tech-search">
                <UIcon name="search" size={18} color="var(--ink-3)" />
                <input placeholder="ค้นหาวัสดุ / รหัส" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="cat-scroll">
                <button className={"cat-chip" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")}
                  style={cat === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทั้งหมด</button>
                {categories.map((c) => (
                  <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}
                    style={cat === c.id ? { background: c.color, color: "#fff", borderColor: c.color } : { color: c.color }}>
                    <MatIcon name={c.icon} size={15} color={cat === c.id ? "#fff" : c.color} /> {c.th}
                  </button>
                ))}
              </div>
              <div className="mlist">
                {filtered.map((m) => (
                  <MatRow key={m.id} mat={m} qty={cart[m.id] || 0}
                    onQty={(v) => setCart((c) => ({ ...c, [m.id]: v }))} accent={team.color} />
                ))}
              </div>
            </>
          )}

          {tab === "return" && (
            <div className="ret-list">
              <div className="ret-intro">งานที่เบิกแล้ว · นำวัสดุที่เหลือมาคืน<br /><b>เบิก − คืน = ใช้จริง</b></div>
              {open.length === 0 && <div className="empty">ไม่มีงานค้างคืน 🎉</div>}
              {open.map((w) => {
                const used = w.items.reduce((a, it) => a + (it.withdrawn - it.returned) * it.mat.cost, 0);
                return (
                  <div className="retjob" key={w.jobNo}>
                    <div className="retjob-head">
                      <div><span className="retjob-no">{w.jobNo}</span><span className="retjob-time">{w.time === "now" ? "เพิ่งเบิก" : w.time}</span></div>
                      <span className="retjob-used">ใช้จริง {fmt.fmtBaht(used)}</span>
                    </div>
                    {w.items.map((it) => (
                      <div className="retitem" key={it.mat.id}>
                        <MaterialThumb mat={it.mat} size={38} radius={9} />
                        <div className="retitem-info">
                          <div className="retitem-name">{it.mat.th}</div>
                          <div className="retitem-sub">เบิก {it.withdrawn} {it.mat.unit} · ใช้จริง <b>{it.withdrawn - it.returned}</b></div>
                        </div>
                        <div className="retitem-step">
                          <div className="retitem-step-label">คืน</div>
                          <Stepper value={it.returned} onChange={(v) => setReturn(w.jobNo, it.mat.id, v)} max={it.withdrawn} />
                        </div>
                      </div>
                    ))}
                    <button className="retjob-submit" onClick={() => submitReturn(w.jobNo)}>
                      <UIcon name="check" size={17} color="#fff" strokeWidth={2.4} /> ยืนยันส่งคืนงานนี้
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CART BAR */}
        {tab === "withdraw" && cartCount > 0 && (
          <div className="cart-bar" style={{ borderColor: team.color }}>
            <div className="cart-info">
              <div className="cart-count">{cartCount} รายการ</div>
              <div className="cart-value">{fmt.fmtBaht(cartValue)}</div>
            </div>
            <button className="cart-submit" style={{ background: team.color }} onClick={submitWithdraw}>
              ส่งเบิก <UIcon name="chevR" size={18} color="#fff" strokeWidth={2.4} />
            </button>
          </div>
        )}

        {/* BOTTOM TABS */}
        <div className="tech-tabs">
          <button className={"tab-btn" + (tab === "withdraw" ? " on" : "")} onClick={() => setTab("withdraw")} style={tab === "withdraw" ? { color: team.color } : {}}>
            <UIcon name="withdraw" size={22} strokeWidth={tab === "withdraw" ? 2.3 : 1.9} /> <span>เบิก</span>
          </button>
          <button className={"tab-btn" + (tab === "return" ? " on" : "")} onClick={() => setTab("return")} style={tab === "return" ? { color: team.color } : {}}>
            <UIcon name="ret" size={22} strokeWidth={tab === "return" ? 2.3 : 1.9} /> <span>ส่งคืน</span>
            {open.length > 0 && <span className="tab-badge" style={{ background: team.color }}>{open.length}</span>}
          </button>
        </div>

        {toast && <div className="toast" style={{ background: toast.color }}>{toast.msg}</div>}
      </div>
    </IOSDevice>
  );
}

window.TechApp = TechApp;
