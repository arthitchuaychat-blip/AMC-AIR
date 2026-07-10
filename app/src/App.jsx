import React from "react";
import { supabase, hasConfig } from "./lib/supabase";
import { getProfile, signOut, countUnreadChats, countUnreadTeamChats, getRolePermissions, listTeams, unreadByModule, markModuleRead } from "./lib/api";
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
import StockCount from "./components/StockCount";
import Dashboard from "./components/Dashboard";
import Settings from "./components/Settings";
import Jobs from "./components/Jobs";
import PurchaseOrders from "./components/PurchaseOrders";
import Customers from "./components/Customers";
import Suppliers from "./components/Suppliers";
import BOQ from "./components/BOQ";
import Quotation from "./components/Quotation";
import Profit from "./components/Profit";
import CashFlow from "./components/CashFlow";
import Expenses from "./components/Expenses";
import BillingNotes from "./components/BillingNotes";
import JobOrders from "./components/JobOrders";
import Handover from "./components/Handover";
import WebManage from "./components/WebManage";
import Schedule from "./components/Schedule";
import Chat from "./components/Chat";
import TeamChat from "./components/TeamChat";
import TaskBoard from "./components/TaskBoard";
import TaskReminder from "./components/TaskReminder";
import NotificationBell from "./components/NotificationBell";
import MyJobs from "./components/MyJobs";
import Invoices from "./components/Invoices";
import Receipts from "./components/Receipts";
import Receivables from "./components/Receivables";
import Payables from "./components/Payables";
import MaterialPrep from "./components/MaterialPrep";
import Tools from "./components/Tools";
import TaxReport from "./components/TaxReport";
import CustomerFollowup from "./components/CustomerFollowup";
import WebOrders from "./components/WebOrders";

const NAV = {
  myjobs: { th: "งานของฉัน", en: "My Jobs", icon: "clipboard" },
  dashboard: { th: "แดชบอร์ด", en: "Dashboard", icon: "dashboard" },
  customers: { th: "ลูกค้า", en: "Customers", icon: "building" },
  followup: { th: "ติดตามลูกค้า", en: "Follow-up", icon: "user" },
  weborders: { th: "คำสั่งซื้อจากเว็บ", en: "Web Orders", icon: "purchase" },
  website: { th: "จัดการเว็บไซต์", en: "Website", icon: "catalog" },
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
  receivables: { th: "เงินค้างรับ", en: "Receivables", icon: "trend" },
  payables: { th: "ค้างจ่าย", en: "Payables", icon: "trend" },
  tax: { th: "รายงานภาษี", en: "Tax Report", icon: "clipboard" },
  profit: { th: "กำไร/งาน", en: "Profit", icon: "trend" },
  cashflow: { th: "กระแสเงินสด", en: "Cash Flow", icon: "trend" },
  expenses: { th: "เบิกจ่าย", en: "Expenses", icon: "withdraw" },
  joborders: { th: "ใบงาน", en: "Job Orders", icon: "clipboard" },
  handover: { th: "ใบส่งมอบงาน", en: "Handover", icon: "catalog" },
  schedule: { th: "ปฏิทินงาน", en: "Schedule", icon: "calendar" },
  movements: { th: "เคลื่อนไหวสินค้า", en: "Movements", icon: "withdraw" },
  stockcount: { th: "นับสต๊อก", en: "Stock Count", icon: "catalog" },
  jobs: { th: "วัสดุที่ใช้ในงาน", en: "Jobs & Cost", icon: "box" },
  suppliers: { th: "ผู้ขาย", en: "Suppliers", icon: "building" },
  prep: { th: "เตรียมวัสดุ", en: "Material Prep", icon: "box" },
  po: { th: "ใบสั่งซื้อ", en: "Purchase Orders", icon: "purchase" },
  tools: { th: "เครื่องมือช่าง", en: "Tools", icon: "box" },
  settings: { th: "ตั้งค่า", en: "Settings", icon: "user" },
};

// sidebar sections — group the (long) menu into collapsible categories so it's not overwhelming.
// any module not listed here falls into a trailing "อื่นๆ" group so nothing ever disappears.
const NAV_GROUPS = [
  { key: "team", label: "ทีม & บุคคล", ids: ["teamchat", "tasks", "attendance", "hr"] },
  { key: "crm", label: "ลูกค้า & ขาย", ids: ["chat", "customers", "followup", "weborders", "website"] },
  { key: "salesdocs", label: "เอกสารขาย", ids: ["boq", "quote", "invoice", "billing", "receipt"] },
  { key: "finance", label: "การเงิน", ids: ["receivables", "payables", "tax", "profit", "cashflow", "expenses"] },
  { key: "field", label: "งานช่าง / หน้างาน", ids: ["myjobs", "joborders", "handover", "schedule", "subcontract"] },
  { key: "inventory", label: "คลังสินค้า & จัดซื้อ", ids: ["catalog", "movements", "stockcount", "jobs", "suppliers", "prep", "po", "tools"] },
  { key: "overview", label: "ภาพรวม", ids: ["dashboard"] },
  { key: "system", label: "ระบบ", ids: ["settings"] },
];

const ROLE_LABEL = { exec: "ผู้บริหาร", admin: "ฝ่ายธุรการ", finance: "บัญชี/การเงิน", sales: "ฝ่ายขาย", stock: "ธุรการวัสดุ", lead_tech: "หัวหน้าช่าง", tech: "ช่าง" };
// chat & teamchat have their own dedicated badges — skip the notification-based one for them
const NAV_BADGE_SKIP = { chat: 1, teamchat: 1 };
// bump this each deploy — shown in the sidebar so we can confirm the browser loaded the latest build
const BUILD = "2026-07-10·ภาษีซื้อ-ภาษีขาย: รายงานภาษีมีภาษีซื้อ + VAT นำส่งสุทธิ · การ์ด VAT เดือนนี้บนแดชบอร์ด v357";

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
  const [view, setView] = React.useState(() => { try { return (window.location.hash || "").replace(/^#/, "").split("/")[0] || null; } catch { return null; } });
  const [navHist, setNavHist] = React.useState([]); // stack of previous views → ปุ่มย้อนกลับ
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [lang, setLang] = React.useState(() => { try { return localStorage.getItem("amc_lang") || "th"; } catch { return "th"; } });
  const [purchasePrefill, setPurchasePrefill] = React.useState(null);
  const [poPrefill, setPoPrefill] = React.useState(null);
  const [prepPrefill, setPrepPrefill] = React.useState(null);   // เปิดใบเตรียมวัสดุจากใบเสนอราคา
  const [poFocus, setPoFocus] = React.useState(null);   // เปิดหน้าใบสั่งซื้อพร้อมค้นหาใบที่ลิงก์มา
  const [joPrefill, setJoPrefill] = React.useState(null);
  const [joSchedule, setJoSchedule] = React.useState(null);
  const [withdrawCtx, setWithdrawCtx] = React.useState(null);
  const [quoteFocus, setQuoteFocus] = React.useState(null);
  const [jobFocus, setJobFocus] = React.useState(null);
  const [hoStartJob, setHoStartJob] = React.useState(null);   // open a NEW handover for this job
  const [hoFocusJob, setHoFocusJob] = React.useState(null);   // filter the handover list to this job_no
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
  const [taskFocus, setTaskFocus] = React.useState(null); // open this task's detail (from a notification)
  const [teamFocus, setTeamFocus] = React.useState(null); // open this team-chat room (from a notification)
  const [taskPrefill, setTaskPrefill] = React.useState(null); // {customerId,name} → open Task Board create-form (จากแชต)
  const [chatUnread, setChatUnread] = React.useState(0); // LINE chats waiting to be answered → sidebar badge
  const [teamUnread, setTeamUnread] = React.useState(0); // unread team-chat messages → sidebar badge
  const [notifCounts, setNotifCounts] = React.useState({}); // unread notifications per category → per-menu badges
  const [navCollapsed, setNavCollapsed] = React.useState(() => { // collapsed sidebar groups (remembered)
    try { return new Set(JSON.parse(localStorage.getItem("amc_nav_collapsed") || "[]")); } catch { return new Set(); }
  });
  const toggleNavGroup = (key) => setNavCollapsed((s) => {
    const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key);
    try { localStorage.setItem("amc_nav_collapsed", JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

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

  // sidebar badges: unread notifications grouped by category → number on each menu (like the LINE chat badge)
  const refreshNavNotif = React.useCallback(() => { unreadByModule().then(setNotifCounts).catch(() => {}); }, []);
  React.useEffect(() => {
    if (!profile) { setNotifCounts({}); return; }
    refreshNavNotif();
    const iv = setInterval(refreshNavNotif, 20000);
    const ch = supabase.channel("nav-notif")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refreshNavNotif)
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [profile, refreshNavNotif]);

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

  // deep-link: read the view + optional focus (#view/record) from the URL hash on first load,
  // so a menu opened in a NEW TAB lands on the right screen (and focuses the linked record)
  React.useEffect(() => {
    const h = (window.location.hash || "").replace(/^#/, "");
    if (!h.includes("/")) return;
    const [v, ...rest] = h.split("/");
    const focus = decodeURIComponent(rest.join("/"));
    if (!focus) return;
    if (v === "joborders") setJobFocus(focus);
    else if (v === "quote") setQuoteFocus(focus);
    else if (v === "boq") setBoqFocus(focus);
    else if (v === "invoice") setInvoiceFocus(focus);
    else if (v === "receipt") setReceiptFocus(focus);
    else if (v === "chat") setChatFocus(focus);
    else if (v === "po") setPoFocus(focus);
  }, []);
  // keep the URL hash in sync with the current view (replaceState → doesn't disturb the Back scheme above),
  // so refreshing or "open link in new tab" lands on the same menu
  React.useEffect(() => { if (view) { try { window.history.replaceState(null, "", "#" + view); } catch (_) {} } }, [view]);

  if (!hasConfig) return <SetupNotice />;
  if (!ready) return <div className="login-stage"><div className="page-sub">กำลังโหลด…</div></div>;
  if (!session) return <Login />;

  const role = profile?.role || "tech";
  // เฉพาะทีมช่าง (ช่าง/หัวหน้าช่าง) เท่านั้นที่เลือกภาษาพม่าได้ · ฝั่งหลังบ้านเป็นไทยเสมอ
  const canBurmese = role === "tech" || role === "lead_tech";
  const effLang = canBurmese ? lang : "th";

  function go(id) {
    if (view && view !== id) { setNavHist((h) => [...h, view]); window.history.pushState(null, ""); }
    setView(id); setMenuOpen(false);
    // opening a menu clears its "unread activity" badge
    if (!NAV_BADGE_SKIP[id] && (notifCounts[id] || 0) > 0) {
      setNotifCounts((m) => ({ ...m, [id]: 0 }));
      markModuleRead(id).then(refreshNavNotif).catch(() => {});
    }
  }
  function goBack() {
    setNavHist((h) => { if (!h.length) return h; setView(h[h.length - 1]); setMenuOpen(false); return h.slice(0, -1); });
  }
  // open a menu (optionally focused on a record) in a NEW browser tab — for working on 2 menus at once
  function openInNewTab(v, focus) {
    try { window.open("#" + v + (focus ? "/" + encodeURIComponent(focus) : ""), "_blank"); } catch (_) {}
  }
  // unified cross-document navigation (เชื่อมโยง chips + doc history in chat) → open in a NEW TAB
  // so you don't lose the page you're on; the new tab reads #view/no and focuses that record
  function openDoc(type, no) {
    const v = { boq: "boq", quote: "quote", job: "joborders", invoice: "invoice", receipt: "receipt", po: "po" }[type];
    if (v) openInNewTab(v, no);
  }

  // click a notification → jump straight to the exact record it refers to
  function openNotif(n) {
    const t = n.ref_type, no = n.ref_no;
    if (t === "job" && no) { setJobFocus(no); go("joborders"); }
    else if (t === "task" && no) { setTaskFocus(no); go("tasks"); }
    else if ((n.category === "customer_chat" || t === "line") && no) { setChatFocus(String(no)); go("chat"); }
    else if (t === "room" && no) { setTeamFocus(no); go("teamchat"); }
    else if (n.url) { go(n.url); }   // fall back to the relevant menu
  }

  return (
    <LangContext.Provider value={effLang}>
    <div className="app">
      {/* mobile top bar */}
      <div className="topbar">
        <button className="topbar-burger" onClick={() => setMenuOpen(true)} aria-label="เมนู"><UIcon name="menu" size={22} /></button>
        <Logo size={30} radius={8} />
        <div className="brand-name" style={{ fontSize: 17 }}>AMC <span>Management</span></div>
        <div style={{ marginLeft: "auto" }}><NotificationBell onOpen={(n) => { openNotif(n); setMenuOpen(false); }} /></div>
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brand">
          <Logo size={40} radius={11} />
          <div className="brand-text">
            <div className="brand-name">AMC <span>Management</span></div>
            <div className="brand-sub">Management System</div>
          </div>
          <div className="brand-bell"><NotificationBell onOpen={(n) => { openNotif(n); setMenuOpen(false); }} /></div>
        </div>

        <nav className="nav">
          <div className="nav-label">{effLang === "my" ? "မီနူး" : "เมนู"}
            {canBurmese && (
              <span className="lang-toggle">
                <button className={lang === "th" ? "on" : ""} onClick={() => setLang("th")}>ไทย</button>
                <button className={lang === "my" ? "on" : ""} onClick={() => setLang("my")}>မြန်မာ</button>
              </span>
            )}
          </div>
          {(() => {
            const badgeFor = (id) => id === "chat" ? chatUnread : id === "teamchat" ? teamUnread : (NAV_BADGE_SKIP[id] ? 0 : (notifCounts[id] || 0));
            const renderItem = (id) => {
              const n = NAV[id];
              const primary = effLang === "my" ? (NAV_MY[id] || n.th) : n.th;
              const secondary = effLang === "my" ? n.th : n.en;
              return (
                // real link → can Ctrl/กลางคลิก/คลิกขวา "เปิดในแท็บใหม่" ได้ · คลิกปกติยังเป็น SPA แท็บเดิม
                <a key={id} href={"#" + id} style={{ textDecoration: "none" }} className={"nav-item" + (view === id ? " on" : "")}
                  onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); go(id); }}>
                  <UIcon name={n.icon} size={18} strokeWidth={1.9} />
                  <span className="nav-th">{primary}</span>
                  <span className="nav-en">{secondary}</span>
                  {id === "chat" && chatUnread > 0 && <span className="nav-badge" title={`${chatUnread} แชตค้างตอบ`}>{chatUnread > 99 ? "99+" : chatUnread}</span>}
                  {id === "teamchat" && teamUnread > 0 && <span className="nav-badge" title={`${teamUnread} ข้อความใหม่`}>{teamUnread > 99 ? "99+" : teamUnread}</span>}
                  {!NAV_BADGE_SKIP[id] && (notifCounts[id] || 0) > 0 && <span className="nav-badge" title="กิจกรรมใหม่ที่ยังไม่ได้อ่าน">{notifCounts[id] > 99 ? "99+" : notifCounts[id]}</span>}
                </a>
              );
            };
            const allowed = navIds(role);
            const allowedSet = new Set(allowed);
            const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.ids.filter((id) => allowedSet.has(id)) }));
            const used = new Set(groups.flatMap((g) => g.items));
            const leftover = allowed.filter((id) => !used.has(id));
            if (leftover.length) groups.push({ key: "other", label: "อื่นๆ", items: leftover });
            return groups.filter((g) => g.items.length).map((g) => {
              const activeHere = g.items.includes(view);
              const isCollapsed = navCollapsed.has(g.key) && !activeHere; // the active group always stays open
              const groupBadge = g.items.reduce((a, id) => a + badgeFor(id), 0);
              return (
                <div className="nav-group" key={g.key}>
                  <button className="nav-grouphead" onClick={() => toggleNavGroup(g.key)}>
                    <span>{g.label}</span>
                    <span className="nav-grouphead-sp" />
                    {isCollapsed && groupBadge > 0 && <span className="nav-badge sm">{groupBadge > 99 ? "99+" : groupBadge}</span>}
                    <UIcon name="chevR" size={12} style={{ transform: isCollapsed ? "none" : "rotate(90deg)", opacity: 0.5 }} />
                  </button>
                  {!isCollapsed && g.items.map(renderItem)}
                </div>
              );
            });
          })()}
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
        {/* แถบเตือนงานค้างจากกระดานสั่งงาน — ตามไปทุกเมนู */}
        {profile?.id && <TaskReminder myId={profile.id} view={view} onOpen={(id) => { setTaskFocus(id); go("tasks"); }} onOpenBoard={() => go("tasks")} />}
        <InstallBanner />
        {view === "dashboard" && <Dashboard role={role} onReorder={(items) => { setPoPrefill(items); go("po"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onGo={(v) => go(v)} />}
        {view === "customers" && <Customers role={role} focus={custFocus} onFocusConsumed={() => setCustFocus(null)} onOpenDoc={openDoc} />}
        {view === "suppliers" && <Suppliers role={role} />}
        {view === "followup" && <CustomerFollowup role={role}
          onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }}
          onOpenCustomer={(cid) => { setCustFocus(String(cid)); go("customers"); }}
          onCreateJob={(cid) => { setJobSurveyCust(String(cid)); go("joborders"); }} />}
        {view === "chat" && <Chat role={role} onOpenDoc={openDoc} onGoCustomers={(name) => { setCustFocus(name); go("customers"); }}
          focus={chatFocus} onFocusConsumed={() => setChatFocus(null)}
          onCreateBoq={(cid) => { setBoqNewCust(String(cid)); go("boq"); }}
          onCreateSurvey={(cid) => { setJobSurveyCust(String(cid)); go("joborders"); }}
          onCreateTask={(cid, name) => { setTaskPrefill({ customerId: cid ? String(cid) : null, name: name || null }); go("tasks"); }} />}
        {view === "teamchat" && <TeamChat focus={teamFocus} onFocusConsumed={() => setTeamFocus(null)} onJobClick={(jn) => openInNewTab("joborders", jn)} />}
        {view === "tasks" && <TaskBoard role={role} me={profile} prefill={taskPrefill} onPrefillConsumed={() => setTaskPrefill(null)} focus={taskFocus} onFocusConsumed={() => setTaskFocus(null)} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "boq" && <BOQ role={role} focus={boqFocus} onFocusConsumed={() => setBoqFocus(null)} onCreateQuote={(boqNo) => { setQuoteFromBoq(boqNo); go("quote"); }}
          newForCustomer={boqNewCust} onNewConsumed={() => setBoqNewCust(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "quote" && <Quotation role={role} focus={quoteFocus} onFocusConsumed={() => setQuoteFocus(null)}
          fromBoq={quoteFromBoq} onFromBoqConsumed={() => setQuoteFromBoq(null)}
          onCreateInvoice={(quoteNo) => { setInvoiceFromQuote(quoteNo); go("invoice"); }}
          onCreateJob={(q) => { setJoPrefill(q); go("joborders"); }}
          onCreatePo={(q) => { setPoPrefill({ quoteNo: q.quote_no, items: (q.items || []).filter((it) => it.item_code && it.kind !== "service").map((it) => ({ code: it.item_code, qty: Number(it.qty) || 1 })) }); go("po"); }}
          onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "invoice" && <Invoices role={role} focus={invoiceFocus} onFocusConsumed={() => setInvoiceFocus(null)} fromQuote={invoiceFromQuote} onFromQuoteConsumed={() => setInvoiceFromQuote(null)}
          onCreateReceipt={(invNo) => { setReceiptFromInvoice(invNo); go("receipt"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "receipt" && <Receipts role={role} focus={receiptFocus} onFocusConsumed={() => setReceiptFocus(null)} fromInvoice={receiptFromInvoice} onFromInvoiceConsumed={() => setReceiptFromInvoice(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "billing" && <BillingNotes role={role} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }}
          onCreateReceipt={(invNo) => { setReceiptFromInvoice(invNo); go("receipt"); }} />}
        {view === "receivables" && <Receivables role={role} onOpenInvoice={(no) => { setInvoiceFocus(no); go("invoice"); }} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "payables" && <Payables role={role} onOpenPo={(no) => { setPoFocus(no); go("po"); }} onGoExpenses={() => go("expenses")} onGoSub={() => go("subcontract")} />}
        {view === "tax" && <TaxReport role={role} />}
        {view === "weborders" && <WebOrders role={role} />}
        {view === "website" && <WebManage role={role} />}
        {view === "profit" && <Profit />}
        {view === "cashflow" && <CashFlow />}
        {view === "expenses" && <Expenses role={role} me={profile} onOpenDoc={(t, no) => {
          if (t === "po") { setPoFocus(no); go("po"); }
          else if (t === "job") { setJobFocus(no); go("joborders"); }
          else if (t === "quote") { setQuoteFocus(no); go("quote"); }
        }} />}
        {view === "joborders" && <JobOrders role={role} me={profile?.name || profile?.email} myTeam={profile?.team} focus={jobFocus} onFocusConsumed={() => setJobFocus(null)} prefill={joPrefill} onPrefillConsumed={() => setJoPrefill(null)} schedule={joSchedule} onScheduleConsumed={() => setJoSchedule(null)}
          surveyFor={jobSurveyCust} onSurveyConsumed={() => setJobSurveyCust(null)} onHandover={(jo) => { setHoStartJob(jo); go("handover"); }}
          onCreatePrep={(jo) => { setPrepPrefill({ quoteNo: jo.quote_no || "", jobNo: jo.job_no || "", title: `งาน ${jo.job_no}${jo.title ? " · " + jo.title : ""}` }); go("prep"); }}
          onMovement={(jo, type) => { setWithdrawCtx({ type, jobNo: jo.job_no, team: jo.assigned_team }); go("movements"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "handover" && <Handover role={role} me={profile?.name || profile?.email} startJob={hoStartJob} onStartConsumed={() => setHoStartJob(null)} focusJob={hoFocusJob} onFocusConsumed={() => setHoFocusJob(null)} />}
        {view === "schedule" && <Schedule role={role} team={profile?.team} me={profile?.name || profile?.email} onOpenJob={(jn) => { if (can(role, "joborders")) { setJobFocus(jn); go("joborders"); } else { go("myjobs"); } }} onNewJob={(s) => { setJoSchedule(s); go("joborders"); }} />}
        {view === "myjobs" && <MyJobs role={role} team={profile?.team} me={profile?.name || profile?.email} onWithdraw={(jo) => { setWithdrawCtx({ jobNo: jo.job_no, team: jo.assigned_team || profile?.team }); go("movements"); }} onHandover={(jo) => { setHoStartJob(jo); go("handover"); }} />}
        {view === "movements" && <Movements role={role} myTeam={profile?.team} prefill={purchasePrefill} onPrefillConsumed={() => setPurchasePrefill(null)} withdrawCtx={withdrawCtx} onWithdrawCtxConsumed={() => setWithdrawCtx(null)} />}
        {view === "stockcount" && <StockCount role={role} />}
        {view === "prep" && <MaterialPrep role={role} prefill={prepPrefill} onPrefillConsumed={() => setPrepPrefill(null)}
          onCreatePo={(items, quoteNo, prepNo) => { setPoPrefill({ quoteNo: quoteNo || null, prepNo: prepNo || null, items }); go("po"); }}
          onWithdraw={(items, jobNo, team, prepNo) => { setWithdrawCtx({ jobNo: jobNo || null, team: team || null, prepNo: prepNo || null, items }); go("movements"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} />}
        {view === "po" && <PurchaseOrders role={role} prefill={poPrefill} onPrefillConsumed={() => setPoPrefill(null)}
          focus={poFocus} onFocusConsumed={() => setPoFocus(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }}
          onReceive={(po) => { setPurchasePrefill({ poNo: po.po_no, quoteNo: po.quote_no || null, items: po.items.map((it) => ({ code: it.material_code, qty: it.qty, price: it.price, unit: it.unit || null })) }); go("movements"); }} />}
        {view === "tools" && <Tools role={role} me={profile} />}
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
