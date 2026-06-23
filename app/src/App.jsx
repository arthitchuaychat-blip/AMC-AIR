import React from "react";
import { supabase, hasConfig } from "./lib/supabase";
import { getProfile, signOut, countUnreadChats, countUnreadTeamChats, getRolePermissions, listTeams } from "./lib/api";
import { navForRole, setPerms, mergePerms, can } from "./lib/permissions";
import { NAV_MY, LangContext } from "./lib/i18n";
import { registerSW, autoResubscribe } from "./lib/push";
import InstallBanner from "./components/InstallBanner";
import Attendance from "./components/Attendance";
import HR from "./components/HR";
import Subcontractor from "./components/Subcontractor";
import { UIcon, Logo } from "./icons";
import Login from "./components/Login";
import { ConfirmHost } from "./components/ConfirmDialog";
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
import CashFlow from "./components/CashFlow";
import BillingNotes from "./components/BillingNotes";
import JobOrders from "./components/JobOrders";
import Schedule from "./components/Schedule";
import Chat from "./components/Chat";
import TeamChat from "./components/TeamChat";
import TaskBoard from "./components/TaskBoard";
import NotificationBell from "./components/NotificationBell";
import MyJobs from "./components/MyJobs";
import Invoices from "./components/Invoices";
import Receipts from "./components/Receipts";

const NAV = {
  myjobs: { th: "งานของฉัน", en: "My Jobs", icon: "clipboard" },
  dashboard: { th: "แดชบอร์ด", en: "Dashboard", icon: "dashboard" },
  customers: { th: "ลูกค้า", en: "Customers", icon: "building" },
  chat: { th: "แชต LINE", en: "Chat", icon: "chat" },
  teamchat: { th: "แชตทีม", en: "Team Chat", icon: "chat" },
  tasks: { th: "กระดานสั่งงาน", en: "Task Board", icon: "clipboard" },
  attendance: { th: "เข้างาน/ลา", en: "Attendance", icon: "calendar" },
  hr: { th: "บุคคล (HR)", en: "HR", icon: "user" },
  subcontract: { th: "ช่างซัพ", en: "Subcontractors", icon: "purchase" },
  catalog: { th: "คลังสินค้า", en: "Catalog", icon: "catalog" },
  boq: { th: "BOQ", en: "Bill of Quantities", icon: "clipboard" },
  quote: { th: "ใบเสนอราคา", en: "Quotations", icon: "clipboard" },
  invoice: { th: "ใบแจ้งหนี้", en: "Invoices", icon: "clipboard" },
  receipt: { th: "ใบเสร็จ/ใบกำกับ", en: "Receipts", icon: "clipboard" },
  billing: { th: "ใบวางบิล", en: "Billing Notes", icon: "clipboard" },
  profit: { th: "กำไร/งาน", en: "Profit", icon: "trend" },
  cashflow: { th: "กระแสเงินสด", en: "Cash Flow", icon: "trend" },
  joborders: { th: "ใบงาน", en: "Job Orders", icon: "clipboard" },
  schedule: { th: "ปฏิทินงาน", en: "Schedule", icon: "calendar" },
  movements: { th: "เคลื่อนไหวสินค้า", en: "Movements", icon: "withdraw" },
  jobs: { th: "วัสดุที่ใช้ในงาน", en: "Jobs & Cost", icon: "box" },
  po: { th: "ใบสั่งซื้อ", en: "Purchase Orders", icon: "purchase" },
  settings: { th: "ตั้งค่า", en: "Settings", icon: "user" },
};

const ROLE_LABEL = { exec: "ผู้บริหาร", admin: "ฝ่ายธุรการ", finance: "บัญชี/การเงิน", sales: "ฝ่ายขาย", stock: "ธุรการวัสดุ", lead_tech: "หัวหน้าช่าง", tech: "ช่าง" };
// bump this each deploy — shown in the sidebar so we can confirm the browser loaded the latest build
const BUILD = "2026-06-23·แชต: เปลี่ยนชื่อปุ่มเป็น สร้างใบงาน-v159";

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
  const [teams, setTeams] = React.useState([]); // to tell if the logged-in user is on a subcontractor team
  const [permsV, setPermsV] = React.useState(0); // bumps when role permissions (re)load → re-render nav
  const [view, setView] = React.useState(null);
  const [navHist, setNavHist] = React.useState([]); // stack of previous views → ปุ่มย้อนกลับ
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [lang, setLang] = React.useState(() => { try { return localStorage.getItem("amc_lang") || "th"; } catch { return "th"; } });
  const [purchasePrefill, setPurchasePrefill] = React.useState(null);
  const [poPrefill, setPoPrefill] = React.useState(null);
  const [joPrefill, setJoPrefill] = React.useState(null);
  const [joSchedule, setJoSchedule] = React.useState(null);
  const [withdrawCtx, setWithdrawCtx] = React.useState(null);
  const [quoteFocus, setQuoteFocus] = React.useState(null);
  const [jobFocus, setJobFocus] = React.useState(null);
  const [jobSurveyCust, setJobSurveyCust] = React.useState(null); // open a new survey job for this customer id
  const [custFocus, setCustFocus] = React.useState(null);
  const [boqFocus, setBoqFocus] = React.useState(null);
  const [boqNewCust, setBoqNewCust] = React.useState(null); // open a new BOQ pre-filled with this customer id
  const [invoiceFocus, setInvoiceFocus] = React.useState(null);
  const [receiptFocus, setReceiptFocus] = React.useState(null);
  const [quoteFromBoq, setQuoteFromBoq] = React.useState(null);
  const [invoiceFromQuote, setInvoiceFromQuote] = React.useState(null);
  const [receiptFromInvoice, setReceiptFromInvoice] = React.useState(null);
  const [chatFocus, setChatFocus] = React.useState(null); // open the chat thread of this customer id (from a doc's "แชตลูกค้า")
  const [chatUnread, setChatUnread] = React.useState(0); // LINE chats waiting to be answered → sidebar badge
  const [teamUnread, setTeamUnread] = React.useState(0); // unread team-chat messages → sidebar badge

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

  // load the editable role→module permission overrides (falls back to the shipped defaults)
  React.useEffect(() => {
    if (!session) return;
    getRolePermissions()
      .then((o) => { setPerms(mergePerms(o)); setPermsV((v) => v + 1); })
      .catch(() => { setPerms(mergePerms(null)); setPermsV((v) => v + 1); });
  }, [session]);

  React.useEffect(() => { if (session) listTeams().then(setTeams).catch(() => {}); }, [session]);
  // subcontractor-team members don't belong in HR/attendance — hide those menus for them
  const mySub = !!(profile && teams.some((t) => t.id === profile.team && t.type === "sub"));
  const navIds = (r) => navForRole(r).filter((id) => !(mySub && (id === "attendance" || id === "hr")));

  React.useEffect(() => {
    if (!profile) return;
    const allowed = navIds(profile.role);
    const safe = allowed.length ? allowed : ["teamchat"];
    setView((v) => (v && safe.includes(v) ? v : safe[0]));
  }, [profile, permsV, mySub]);

  // sidebar badge: count of chats with unread messages — live via realtime, with a polling fallback
  React.useEffect(() => {
    if (!profile || !can(profile.role, "chat")) { setChatUnread(0); return; }
    let alive = true;
    const refresh = () => countUnreadChats().then((n) => { if (alive) setChatUnread(n); }).catch(() => {});
    refresh();
    const iv = setInterval(refresh, 20000);
    const ch = supabase.channel("nav-chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "line_contacts" }, refresh)
      .subscribe();
    return () => { alive = false; clearInterval(iv); supabase.removeChannel(ch); };
  }, [profile, permsV]);

  // sidebar badge: unread team-chat messages — live via realtime, polling fallback
  React.useEffect(() => {
    if (!profile || !can(profile.role, "teamchat")) { setTeamUnread(0); return; }
    let alive = true;
    const refresh = () => countUnreadTeamChats().then((n) => { if (alive) setTeamUnread(n); }).catch(() => {});
    refresh();
    const iv = setInterval(refresh, 20000);
    const ch = supabase.channel("nav-team-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refresh)
      .subscribe();
    return () => { alive = false; clearInterval(iv); supabase.removeChannel(ch); };
  }, [profile, permsV, view]);

  React.useEffect(() => { try { localStorage.setItem("amc_lang", lang); } catch (_) {} }, [lang]);

  // register the service worker + (re)subscribe to push if already permitted
  React.useEffect(() => { registerSW().catch(() => {}); }, []);
  React.useEffect(() => { if (session) autoResubscribe(); }, [session]);
  // keep the signature (for printed docs) in localStorage so DocSlip can pick it up on any print
  React.useEffect(() => {
    if (!profile) return;
    try {
      if (profile.signature_url) localStorage.setItem("amc_sign_url", profile.signature_url); else localStorage.removeItem("amc_sign_url");
      localStorage.setItem("amc_sign_name", profile.name || profile.email || "");
    } catch (_) {}
  }, [profile]);

  // app-icon badge (installed PWA): total unread across LINE + team chat
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.setAppBadge) return;
    const total = (teamUnread || 0) + (chatUnread || 0);
    try { total > 0 ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } catch (_) {}
  }, [teamUnread, chatUnread]);

  // hardware/browser Back → go back through the in-app view history (instead of leaving the app)
  React.useEffect(() => {
    const onPop = () => setNavHist((h) => {
      if (!h.length) return h;
      setView(h[h.length - 1]); setMenuOpen(false);
      window.history.pushState(null, ""); // keep a buffer so the next Back is handled too
      return h.slice(0, -1);
    });
    window.history.pushState(null, "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!hasConfig) return <SetupNotice />;
  if (!ready) return <div className="login-stage"><div className="page-sub">กำลังโหลด…</div></div>;
  if (!session) return <Login />;

  const role = profile?.role || "tech";

  function go(id) {
    if (view && view !== id) { setNavHist((h) => [...h, view]); window.history.pushState(null, ""); }
    setView(id); setMenuOpen(false);
  }
  function goBack() {
    setNavHist((h) => { if (!h.length) return h; setView(h[h.length - 1]); setMenuOpen(false); return h.slice(0, -1); });
  }
  // unified cross-document navigation (used by the "เชื่อมโยง" chips on every doc)
  function openDoc(type, no) {
    if (type === "boq") { setBoqFocus(no); go("boq"); }
    else if (type === "quote") { setQuoteFocus(no); go("quote"); }
    else if (type === "job") { setJobFocus(no); go("joborders"); }
    else if (type === "invoice") { setInvoiceFocus(no); go("invoice"); }
    else if (type === "receipt") { setReceiptFocus(no); go("receipt"); }
  }

  return (
    <LangContext.Provider value={lang}>
    <div className="app">
      {/* mobile top bar */}
      <div className="topbar">
        <button className="topbar-burger" onClick={() => setMenuOpen(true)} aria-label="เมนู"><UIcon name="menu" size={22} /></button>
        <Logo size={30} radius={8} />
        <div className="brand-name" style={{ fontSize: 17 }}>AMC <span>Management</span></div>
        <div style={{ marginLeft: "auto" }}><NotificationBell onOpen={(v) => { go(v); setMenuOpen(false); }} /></div>
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brand">
          <Logo size={40} radius={11} />
          <div className="brand-text">
            <div className="brand-name">AMC <span>Management</span></div>
            <div className="brand-sub">Management System</div>
          </div>
          <div className="brand-bell"><NotificationBell onOpen={(v) => { go(v); setMenuOpen(false); }} /></div>
        </div>

        <nav className="nav">
          <div className="nav-label">เมนู
            <span className="lang-toggle">
              <button className={lang === "th" ? "on" : ""} onClick={() => setLang("th")}>ไทย</button>
              <button className={lang === "my" ? "on" : ""} onClick={() => setLang("my")}>မြန်မာ</button>
            </span>
          </div>
          {navIds(role).map((id) => {
            const n = NAV[id];
            const primary = lang === "my" ? (NAV_MY[id] || n.th) : n.th;
            const secondary = lang === "my" ? n.th : n.en;
            return (
              <button key={id} className={"nav-item" + (view === id ? " on" : "")} onClick={() => go(id)}>
                <UIcon name={n.icon} size={18} strokeWidth={1.9} />
                <span className="nav-th">{primary}</span>
                <span className="nav-en">{secondary}</span>
                {id === "chat" && chatUnread > 0 && <span className="nav-badge" title={`${chatUnread} แชตค้างตอบ`}>{chatUnread > 99 ? "99+" : chatUnread}</span>}
                {id === "teamchat" && teamUnread > 0 && <span className="nav-badge" title={`${teamUnread} ข้อความใหม่`}>{teamUnread > 99 ? "99+" : teamUnread}</span>}
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
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", textAlign: "center", marginTop: 8, opacity: 0.7 }}>เวอร์ชัน {BUILD}</div>
        </div>
      </aside>

      <main className="main">
        {navHist.length > 0 && <button className="page-back" onClick={goBack}><UIcon name="chevR" size={15} style={{ transform: "rotate(180deg)" }} /> ย้อนกลับ</button>}
        <InstallBanner />
        {view === "dashboard" && <Dashboard onReorder={(items) => { setPoPrefill(items); go("po"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onGo={(v) => go(v)} />}
        {view === "customers" && <Customers role={role} focus={custFocus} onFocusConsumed={() => setCustFocus(null)} onOpenDoc={openDoc} />}
        {view === "chat" && <Chat role={role} onOpenDoc={openDoc} onGoCustomers={(name) => { setCustFocus(name); go("customers"); }}
          focus={chatFocus} onFocusConsumed={() => setChatFocus(null)}
          onCreateBoq={(cid) => { setBoqNewCust(String(cid)); go("boq"); }}
          onCreateSurvey={(cid) => { setJobSurveyCust(String(cid)); go("joborders"); }} />}
        {view === "teamchat" && <TeamChat />}
        {view === "tasks" && <TaskBoard role={role} me={profile} />}
        {view === "boq" && <BOQ role={role} focus={boqFocus} onFocusConsumed={() => setBoqFocus(null)} onCreateQuote={(boqNo) => { setQuoteFromBoq(boqNo); go("quote"); }}
          newForCustomer={boqNewCust} onNewConsumed={() => setBoqNewCust(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "quote" && <Quotation role={role} focus={quoteFocus} onFocusConsumed={() => setQuoteFocus(null)}
          fromBoq={quoteFromBoq} onFromBoqConsumed={() => setQuoteFromBoq(null)}
          onCreateInvoice={(quoteNo) => { setInvoiceFromQuote(quoteNo); go("invoice"); }}
          onCreateJob={(q) => { setJoPrefill(q); go("joborders"); }}
          onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "invoice" && <Invoices role={role} focus={invoiceFocus} onFocusConsumed={() => setInvoiceFocus(null)} fromQuote={invoiceFromQuote} onFromQuoteConsumed={() => setInvoiceFromQuote(null)}
          onCreateReceipt={(invNo) => { setReceiptFromInvoice(invNo); go("receipt"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "receipt" && <Receipts role={role} focus={receiptFocus} onFocusConsumed={() => setReceiptFocus(null)} fromInvoice={receiptFromInvoice} onFromInvoiceConsumed={() => setReceiptFromInvoice(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "billing" && <BillingNotes role={role} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }}
          onCreateReceipt={(invNo) => { setReceiptFromInvoice(invNo); go("receipt"); }} />}
        {view === "profit" && <Profit />}
        {view === "cashflow" && <CashFlow />}
        {view === "joborders" && <JobOrders role={role} me={profile?.name || profile?.email} focus={jobFocus} onFocusConsumed={() => setJobFocus(null)} prefill={joPrefill} onPrefillConsumed={() => setJoPrefill(null)} schedule={joSchedule} onScheduleConsumed={() => setJoSchedule(null)}
          surveyFor={jobSurveyCust} onSurveyConsumed={() => setJobSurveyCust(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "schedule" && <Schedule role={role} team={profile?.team} me={profile?.name || profile?.email} onOpenJob={(jn) => { if (can(role, "joborders")) { setJobFocus(jn); go("joborders"); } else { go("myjobs"); } }} onNewJob={(s) => { setJoSchedule(s); go("joborders"); }} />}
        {view === "myjobs" && <MyJobs role={role} team={profile?.team} me={profile?.name || profile?.email} onWithdraw={(jo) => { setWithdrawCtx({ jobNo: jo.job_no, team: jo.assigned_team || profile?.team }); go("movements"); }} />}
        {view === "movements" && <Movements role={role} myTeam={profile?.team} prefill={purchasePrefill} onPrefillConsumed={() => setPurchasePrefill(null)} withdrawCtx={withdrawCtx} onWithdrawCtxConsumed={() => setWithdrawCtx(null)} />}
        {view === "po" && <PurchaseOrders role={role} prefill={poPrefill} onPrefillConsumed={() => setPoPrefill(null)}
          onReceive={(po) => { setPurchasePrefill({ poNo: po.po_no, items: po.items.map((it) => ({ code: it.material_code, qty: it.qty, price: it.price })) }); go("movements"); }} />}
        {view === "jobs" && <Jobs role={role} />}
        {view === "catalog" && <Catalog role={role} />}
        {view === "attendance" && <Attendance me={profile} />}
        {view === "hr" && <HR role={role} />}
        {view === "subcontract" && <Subcontractor role={role} onOpenDoc={openDoc} />}
        {view === "settings" && <Settings role={role} />}
      </main>
      <ConfirmHost />
    </div>
    </LangContext.Provider>
  );
}
