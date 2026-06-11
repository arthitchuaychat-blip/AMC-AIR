import React from "react";
import { supabase, hasConfig } from "./lib/supabase";
import { getProfile, signOut } from "./lib/api";
import { UIcon, Logo } from "./icons";
import Login from "./components/Login";
import Catalog from "./components/Catalog";
import Movements from "./components/Movements";
import Dashboard from "./components/Dashboard";
import Settings from "./components/Settings";
import Jobs from "./components/Jobs";
import PurchaseOrders from "./components/PurchaseOrders";
import Customers from "./components/Customers";
import BOQ from "./components/BOQ";
import Quotation from "./components/Quotation";
import Profit from "./components/Profit";
import JobOrders from "./components/JobOrders";
import MyJobs from "./components/MyJobs";

const NAV = {
  myjobs: { th: "งานของฉัน", en: "My Jobs", icon: "clipboard" },
  dashboard: { th: "แดชบอร์ด", en: "Dashboard", icon: "dashboard" },
  customers: { th: "ลูกค้า", en: "Customers", icon: "building" },
  catalog: { th: "คลังสินค้า", en: "Catalog", icon: "catalog" },
  boq: { th: "BOQ", en: "Bill of Quantities", icon: "clipboard" },
  quote: { th: "ใบเสนอราคา", en: "Quotations", icon: "clipboard" },
  profit: { th: "กำไร", en: "Profit", icon: "trend" },
  joborders: { th: "ใบงาน", en: "Job Orders", icon: "clipboard" },
  movements: { th: "บันทึกธุรกรรม", en: "Movements", icon: "withdraw" },
  jobs: { th: "งาน", en: "Jobs & Cost", icon: "box" },
  po: { th: "ใบสั่งซื้อ", en: "Purchase Orders", icon: "purchase" },
  settings: { th: "ตั้งค่า", en: "Settings", icon: "user" },
};
const NAV_BY_ROLE = {
  admin: ["dashboard", "customers", "catalog", "boq", "quote", "profit", "joborders", "movements", "jobs", "po", "settings"],
  sales: ["dashboard", "customers", "catalog", "boq", "quote", "profit", "joborders"],
  exec: ["dashboard", "customers", "catalog", "boq", "quote", "profit", "joborders", "movements", "jobs", "po", "settings"],
  tech: ["myjobs", "movements"],
};

const ROLE_LABEL = { exec: "ผู้บริหาร", admin: "ฝ่ายธุรการ", sales: "ฝ่ายขาย", tech: "ช่าง" };

function SetupNotice() {
  return (
    <div className="login-stage">
      <div className="login-card card">
        <h1 className="page-title" style={{ marginBottom: 10 }}>ตั้งค่า Supabase ก่อน</h1>
        <p className="page-sub" style={{ lineHeight: 1.7 }}>
          ยังไม่ได้ใส่คีย์ Supabase — คัดลอกไฟล์ <b>app/.env.example</b> เป็น <b>app/.env</b><br />
          แล้วใส่ค่า <b>VITE_SUPABASE_URL</b> และ <b>VITE_SUPABASE_ANON_KEY</b> จาก<br />
          Supabase → Project Settings → API จากนั้นรัน <b>npm run dev</b> ใหม่
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = React.useState(false);
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [view, setView] = React.useState(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [purchasePrefill, setPurchasePrefill] = React.useState(null);
  const [poPrefill, setPoPrefill] = React.useState(null);
  const [joPrefill, setJoPrefill] = React.useState(null);
  const [withdrawCtx, setWithdrawCtx] = React.useState(null);

  React.useEffect(() => {
    if (!hasConfig) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (session) getProfile().then(setProfile);
    else setProfile(null);
  }, [session]);

  React.useEffect(() => {
    if (!profile) return;
    const allowed = NAV_BY_ROLE[profile.role] || ["movements"];
    setView((v) => (v && allowed.includes(v) ? v : allowed[0]));
  }, [profile]);

  if (!hasConfig) return <SetupNotice />;
  if (!ready) return <div className="login-stage"><div className="page-sub">กำลังโหลด…</div></div>;
  if (!session) return <Login />;

  const role = profile?.role || "tech";

  function go(id) { setView(id); setMenuOpen(false); }

  return (
    <div className="app">
      {/* mobile top bar */}
      <div className="topbar">
        <button className="topbar-burger" onClick={() => setMenuOpen(true)} aria-label="เมนู"><UIcon name="menu" size={22} /></button>
        <Logo size={30} radius={8} />
        <div className="brand-name" style={{ fontSize: 17 }}>AMC <span>Stock</span></div>
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brand">
          <Logo size={40} radius={11} />
          <div className="brand-text">
            <div className="brand-name">AMC <span>Stock</span></div>
            <div className="brand-sub">Stock & Materials</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">เมนู</div>
          {(NAV_BY_ROLE[role] || ["movements"]).map((id) => {
            const n = NAV[id];
            return (
              <button key={id} className={"nav-item" + (view === id ? " on" : "")} onClick={() => go(id)}>
                <UIcon name={n.icon} size={18} strokeWidth={1.9} />
                <span className="nav-th">{n.th}</span>
                <span className="nav-en">{n.en}</span>
              </button>
            );
          })}
        </nav>

        <div className="side-foot">
          <div className="user-chip">
            <div className="user-av" style={{ background: "var(--primary)" }}>
              {(profile?.name || profile?.email || "?")[0]?.toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{profile?.name || profile?.email}</div>
              <div className="user-role">{ROLE_LABEL[role] || role}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={() => signOut()}>
            <UIcon name="logout" size={16} /> ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && <Dashboard onReorder={(items) => { setPoPrefill(items); go("po"); }} />}
        {view === "customers" && <Customers role={role} />}
        {view === "boq" && <BOQ role={role} />}
        {view === "quote" && <Quotation role={role} onCreateJob={(q) => { setJoPrefill(q); go("joborders"); }} />}
        {view === "profit" && <Profit />}
        {view === "joborders" && <JobOrders role={role} me={profile?.name || profile?.email} prefill={joPrefill} onPrefillConsumed={() => setJoPrefill(null)} />}
        {view === "myjobs" && <MyJobs team={profile?.team} me={profile?.name || profile?.email} onWithdraw={(jo) => { setWithdrawCtx({ jobNo: jo.job_no, team: profile?.team }); go("movements"); }} />}
        {view === "movements" && <Movements role={role} myTeam={profile?.team} prefill={purchasePrefill} onPrefillConsumed={() => setPurchasePrefill(null)} withdrawCtx={withdrawCtx} onWithdrawCtxConsumed={() => setWithdrawCtx(null)} />}
        {view === "po" && <PurchaseOrders role={role} prefill={poPrefill} onPrefillConsumed={() => setPoPrefill(null)}
          onReceive={(po) => { setPurchasePrefill({ poNo: po.po_no, items: po.items.map((it) => ({ code: it.material_code, qty: it.qty, price: it.price })) }); go("movements"); }} />}
        {view === "jobs" && <Jobs role={role} />}
        {view === "catalog" && <Catalog role={role} />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}
