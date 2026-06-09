/* ============================================================
   app-main.build.jsx — shell + role routing
   (standalone build: design-tool "tweaks" panel removed; theme is fixed)
   ============================================================ */
const { Dashboard, AdminViews, TechApp } = window;

const THEME = {
  primary: "#4f46e5",
  radius: 16,
  density: "regular",
  font: "plex",
};

const ROLES = [
  { id: "exec", th: "ผู้บริหาร", en: "Executive", icon: "trend" },
  { id: "admin", th: "ธุรการจัดซื้อ", en: "Procurement", icon: "box" },
  { id: "tech", th: "ช่าง", en: "Field Team", icon: "user" },
];

const ADMIN_NAV = [
  { id: "purchase", th: "สั่งซื้อ", en: "Purchasing", icon: "purchase" },
  { id: "approve", th: "อนุมัติ & จ่ายเบิก", en: "Issue", icon: "withdraw" },
  { id: "returns", th: "รับคืน", en: "Returns", icon: "ret" },
  { id: "damage", th: "ตัดของเสีย", en: "Write-off", icon: "damage" },
  { id: "catalog", th: "คลังวัสดุ", en: "Catalog", icon: "catalog" },
  { id: "dashboard", th: "แดชบอร์ด", en: "Dashboard", icon: "dashboard" },
];

const FONTS = {
  plex: "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif",
  noto: "'Noto Sans Thai', 'Noto Sans', sans-serif",
  anuphan: "'Anuphan', 'Inter', sans-serif",
};
const DENSITY = { compact: 0.84, regular: 1, comfy: 1.16 };

function App() {
  const t = THEME;
  const [role, setRole] = React.useState("exec");
  const [adminView, setAdminView] = React.useState("purchase");
  const [team, setTeam] = React.useState("ARM");
  const goPurchasing = React.useCallback(() => { setRole("admin"); setAdminView("purchase"); }, []);

  const rootStyle = {
    "--primary": t.primary,
    "--radius": t.radius + "px",
    "--dunit": DENSITY[t.density],
    "--appfont": FONTS[t.font],
  };

  function renderMain() {
    if (role === "exec") return <Dashboard goPurchasing={goPurchasing} />;
    if (role === "tech") return (
      <div className="tech-stage">
        <TechApp teamId={team} setTeamId={setTeam} />
      </div>
    );
    // admin
    const V = AdminViews;
    if (adminView === "purchase") return <V.PurchaseView />;
    if (adminView === "approve") return <V.ApproveView />;
    if (adminView === "returns") return <V.ReturnsView />;
    if (adminView === "damage") return <V.DamageView />;
    if (adminView === "catalog") return <V.CatalogView />;
    if (adminView === "dashboard") return <Dashboard goPurchasing={goPurchasing} />;
  }

  const nav = role === "admin" ? ADMIN_NAV : null;

  return (
    <div className="app" style={rootStyle}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><UIcon name="box" size={22} color="#fff" strokeWidth={2} /></div>
          <div className="brand-text"><div className="brand-name">วัสดุ<span>OS</span></div><div className="brand-sub">Stock & Materials</div></div>
        </div>

        <div className="role-switch">
          {ROLES.map((r) => (
            <button key={r.id} className={"role-btn" + (role === r.id ? " on" : "")} onClick={() => setRole(r.id)}>
              <UIcon name={r.icon} size={17} strokeWidth={1.9} />
              <span className="role-th">{r.th}</span>
            </button>
          ))}
        </div>

        {role === "admin" && (
          <nav className="nav">
            <div className="nav-label">เมนูธุรการ</div>
            {nav.map((n) => (
              <button key={n.id} className={"nav-item" + (adminView === n.id ? " on" : "")} onClick={() => setAdminView(n.id)}>
                <UIcon name={n.icon} size={18} strokeWidth={1.9} />
                <span className="nav-th">{n.th}</span>
                <span className="nav-en">{n.en}</span>
              </button>
            ))}
          </nav>
        )}

        {role === "exec" && (
          <nav className="nav">
            <div className="nav-label">รายงาน</div>
            <button className="nav-item on"><UIcon name="dashboard" size={18} strokeWidth={1.9} /><span className="nav-th">ภาพรวมทั้งหมด</span><span className="nav-en">Overview</span></button>
            <div className="nav-note">ยอดเบิก · ยอดซื้อ · ของเสีย<br />รายทีม &amp; รวม · วัน/เดือน/ปี/ตลอดอายุ</div>
          </nav>
        )}

        {role === "tech" && (
          <nav className="nav">
            <div className="nav-label">เลือกทีมช่าง</div>
            {window.APP.teams.map((tm) => (
              <button key={tm.id} className={"nav-item team" + (team === tm.id ? " on" : "")} onClick={() => setTeam(tm.id)}>
                <span className="nav-team-dot" style={{ background: tm.color }} />
                <span className="nav-th">{tm.name}</span>
                <span className="nav-en">{tm.lead} · {tm.van}</span>
              </button>
            ))}
            <div className="nav-note">มุมมองช่างใช้งานบนมือถือ<br />เน้นไอคอน + รูป ให้ใช้ง่ายทุกภาษา</div>
          </nav>
        )}

        <div className="side-foot">
          <div className="user-chip">
            <div className="user-av" style={{ background: "var(--primary)" }}>{role === "tech" ? window.APP.teamById[team].lead[0] : role === "exec" ? "ผ" : "ธ"}</div>
            <div className="user-info">
              <div className="user-name">{role === "tech" ? window.APP.teamById[team].name : role === "exec" ? "ผู้บริหาร" : "ฝ่ายธุรการ"}</div>
              <div className="user-role">{ROLES.find((r) => r.id === role).en}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">{renderMain()}</main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
