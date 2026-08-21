import React from "react";
import { supabase, hasConfig } from "./lib/supabase";
import { getProfile, signOut, countUnreadChats, countUnreadTeamChats, getRolePermissions, listTeams, unreadByModule, markModuleRead, poReceivedQty, getQuoteItems, countEmailUnread, syncEmails } from "./lib/api";
import { navForRole, setPerms, mergePerms, can } from "./lib/permissions";
import { NAV_MY, LangContext } from "./lib/i18n";
import { registerSW, autoResubscribe } from "./lib/push";
import { hasUnsaved } from "./lib/formDraft";
import InstallBanner from "./components/InstallBanner";
import { UIcon, Logo } from "./icons";
import Login from "./components/Login";
import PublicHandover from "./components/PublicHandover";
import PublicRating from "./components/PublicRating";
import { ConfirmHost, confirmDialog } from "./components/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
// เปลือกแอปที่ติดตามทุกเมนู (โหลดทันที ไม่ต้องแยกก้อน)
import TaskReminder from "./components/TaskReminder";
import ChatDock from "./components/ChatDock";
import NotificationBell from "./components/NotificationBell";

// หน้าแต่ละเมนู = แยกก้อน (code-split) โหลดตอนกดเข้าเมนูนั้นครั้งแรก
// → เปิดแอปครั้งแรกโหลดบันเดิลเล็กลงมาก (เดิมรวมทุกหน้าไว้ก้อนเดียว ~2.3MB)
const Attendance = React.lazy(() => import("./components/Attendance"));
const HR = React.lazy(() => import("./components/HR"));
const Subcontractor = React.lazy(() => import("./components/Subcontractor"));
const Catalog = React.lazy(() => import("./components/Catalog"));
const Movements = React.lazy(() => import("./components/Movements"));
const StockCount = React.lazy(() => import("./components/StockCount"));
const Dashboard = React.lazy(() => import("./components/Dashboard"));
const Settings = React.lazy(() => import("./components/Settings"));
const Jobs = React.lazy(() => import("./components/Jobs"));
const PurchaseOrders = React.lazy(() => import("./components/PurchaseOrders"));
const Customers = React.lazy(() => import("./components/Customers"));
const Suppliers = React.lazy(() => import("./components/Suppliers"));
const BOQ = React.lazy(() => import("./components/BOQ"));
const Quotation = React.lazy(() => import("./components/Quotation"));
const Profit = React.lazy(() => import("./components/Profit"));
const CashFlow = React.lazy(() => import("./components/CashFlow"));
const Expenses = React.lazy(() => import("./components/Expenses"));
const BillingNotes = React.lazy(() => import("./components/BillingNotes"));
const JobOrders = React.lazy(() => import("./components/JobOrders"));
const Handover = React.lazy(() => import("./components/Handover"));
const WebManage = React.lazy(() => import("./components/WebManage"));
const Schedule = React.lazy(() => import("./components/Schedule"));
const Chat = React.lazy(() => import("./components/Chat"));
const Email = React.lazy(() => import("./components/Email"));
const TeamChat = React.lazy(() => import("./components/TeamChat"));
const TaskBoard = React.lazy(() => import("./components/TaskBoard"));
const MyJobs = React.lazy(() => import("./components/MyJobs"));
const Invoices = React.lazy(() => import("./components/Invoices"));
const Receipts = React.lazy(() => import("./components/Receipts"));
const AdjustmentNotes = React.lazy(() => import("./components/AdjustmentNotes"));
const Receivables = React.lazy(() => import("./components/Receivables"));
const Payables = React.lazy(() => import("./components/Payables"));
const MaterialPrep = React.lazy(() => import("./components/MaterialPrep"));
const Tools = React.lazy(() => import("./components/Tools"));
const TaxReport = React.lazy(() => import("./components/TaxReport"));
const CustomerFollowup = React.lazy(() => import("./components/CustomerFollowup"));
const WebOrders = React.lazy(() => import("./components/WebOrders"));
const Handbook = React.lazy(() => import("./components/Handbook"));
const KpiScorecard = React.lazy(() => import("./components/KpiScorecard"));
const Pipeline = React.lazy(() => import("./components/Pipeline"));
const Reviews = React.lazy(() => import("./components/Reviews"));

const NAV = {
  myjobs: { th: "งานของฉัน", en: "My Jobs", icon: "clipboard" },
  dashboard: { th: "แดชบอร์ด", en: "Dashboard", icon: "dashboard" },
  kpi: { th: "สกอร์การ์ดผลงาน", en: "KPI Scorecard", icon: "trend" },
  customers: { th: "ลูกค้า", en: "Customers", icon: "building" },
  pipeline: { th: "ท่อขาย", en: "Sales Pipeline", icon: "trend" },
  followup: { th: "ติดตามลูกค้า", en: "Follow-up", icon: "user" },
  reviews: { th: "รีวิวลูกค้า", en: "Reviews", icon: "trend" },
  weborders: { th: "คำสั่งซื้อจากเว็บ", en: "Web Orders", icon: "purchase" },
  website: { th: "จัดการเว็บไซต์", en: "Website", icon: "catalog" },
  chat: { th: "แชตลูกค้า", en: "Customer Chat", icon: "chat" },
  email: { th: "อีเมล", en: "Email", icon: "chat" },
  teamchat: { th: "แชตทีม", en: "Team Chat", icon: "chat" },
  tasks: { th: "กระดานสั่งงาน", en: "Task Board", icon: "clipboard" },
  attendance: { th: "เข้างาน/ลา", en: "Attendance", icon: "calendar" },
  handbook: { th: "คู่มือตำแหน่งงาน", en: "Job Handbook", icon: "clipboard" },
  hr: { th: "บุคคล (HR)", en: "HR", icon: "user" },
  subcontract: { th: "ช่างซัพ", en: "Subcontractors", icon: "purchase" },
  catalog: { th: "คลังสินค้า", en: "Catalog", icon: "catalog" },
  boq: { th: "BOQ", en: "Bill of Quantities", icon: "clipboard" },
  quote: { th: "ใบเสนอราคา", en: "Quotations", icon: "clipboard" },
  invoice: { th: "ใบส่งของ/ใบแจ้งหนี้", en: "Delivery / Invoice", icon: "clipboard" },
  receipt: { th: "ใบเสร็จ/ใบกำกับ", en: "Receipts", icon: "clipboard" },
  adjnote: { th: "ใบเพิ่ม/ลดหนี้", en: "Credit / Debit Note", icon: "clipboard" },
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
// ไอคอน emoji ของแต่ละเมนู (สีสดในตัว · แทนไอคอนเส้นเดิม) — v545 เลือกชุดนี้
// ⚠️ v546: ใช้เฉพาะ emoji รุ่นเก่า (Emoji 1.0 ปี 2015) ที่รองรับทุกเครื่อง/มือถือ —
//    เลี่ยง Emoji 11+ (🧱🧰🧮🧾🧼) และแบบ ZWJ (🧑‍🔧🧑‍💼) ที่ font เก่าขึ้นเป็นกล่องว่าง
const NAV_EMOJI = {
  myjobs: "👷", dashboard: "📊", kpi: "🏆", customers: "👥", followup: "📞", weborders: "🛒", website: "🌐",
  pipeline: "🎯", reviews: "🌟", chat: "💚", email: "✉️", teamchat: "💬", tasks: "📋", attendance: "⏰", handbook: "📖", hr: "💼",
  subcontract: "🚧", catalog: "📦", boq: "📐", quote: "📝", invoice: "📄", receipt: "💵", adjnote: "📃", billing: "📑",
  receivables: "💰", payables: "💸", tax: "🏦", profit: "📈", cashflow: "💹", expenses: "💳",
  joborders: "🔧", handover: "📤", schedule: "📅", movements: "🔄", stockcount: "🔢", jobs: "🔩",
  suppliers: "🏭", prep: "📥", po: "🛍️", tools: "🔨", settings: "⚙️",
};

// sidebar sections — group the (long) menu into collapsible categories so it's not overwhelming.
// any module not listed here falls into a trailing "อื่นๆ" group so nothing ever disappears.
const NAV_GROUPS = [
  { key: "team", label: "ทีม & บุคคล", ids: ["teamchat", "tasks", "attendance", "handbook", "hr"] },
  { key: "crm", label: "ลูกค้า & ขาย", ids: ["chat", "email", "customers", "pipeline", "followup", "reviews", "weborders", "website"] },
  { key: "salesdocs", label: "เอกสารขาย", ids: ["boq", "quote", "invoice", "billing", "receipt", "adjnote"] },
  { key: "finance", label: "การเงิน", ids: ["receivables", "payables", "tax", "profit", "cashflow", "expenses"] },
  { key: "field", label: "งานช่าง / หน้างาน", ids: ["myjobs", "joborders", "handover", "schedule", "subcontract"] },
  { key: "inventory", label: "คลังสินค้า & จัดซื้อ", ids: ["catalog", "movements", "stockcount", "jobs", "suppliers", "prep", "po", "tools"] },
  { key: "overview", label: "ภาพรวม", ids: ["dashboard", "kpi"] },
  { key: "system", label: "ระบบ", ids: ["settings"] },
];

const ROLE_LABEL = { exec: "ผู้บริหาร", admin: "ฝ่ายธุรการ", finance: "บัญชี/การเงิน", sales: "ฝ่ายขาย", stock: "ธุรการวัสดุ", lead_tech: "หัวหน้าช่าง", tech: "ช่าง" };
// chat & teamchat have their own dedicated badges — skip the notification-based one for them
const NAV_BADGE_SKIP = { chat: 1, email: 1, teamchat: 1 };
// bump this each deploy — shown in the sidebar so we can confirm the browser loaded the latest build
const BUILD = "2026-08-18·รีเฟรชโปรไฟล์ FB: โชว์ผล/สาเหตุค้างข้างปุ่ม v639";

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

// เช็กว่ามี deploy ใหม่หรือยัง — เทียบชื่อไฟล์บันเดิลหลักที่รันอยู่ กับที่ index.html ล่าสุดอ้างถึง
// พอเจอเวอร์ชันใหม่ → คืน true (App เอาไปโชว์แถบ "โหลดใหม่") กันไปเจอหน้า error stale chunk ตั้งแต่ต้นทาง
function useNewVersion() {
  const [stale, setStale] = React.useState(false);
  React.useEffect(() => {
    const cur = String(window.__APP_ASSET__ || "").split("/").pop() || "";   // index-XXXX.js ที่รันอยู่
    if (!cur || !/^index-.+\.js$/.test(cur)) return;   // dev/ไม่มี hash → ข้าม
    let stop = false;
    const check = async () => {
      try {
        const html = await fetch("/?_v=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""));
        const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
        if (!stop && m && m[1] && m[1] !== cur) setStale(true);
      } catch { /* ออฟไลน์/เน็ตสะดุด → ไม่เตือน */ }
    };
    const iv = setInterval(check, 3 * 60 * 1000);   // ทุก 3 นาที
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    check();
    return () => { stop = true; clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, []);
  return stale;
}

export default function App() {
  const [ready, setReady] = React.useState(false);
  const newVersion = useNewVersion();   // มี deploy ใหม่ → โชว์แถบให้กดโหลด
  // ลิงก์ public ใบส่งมอบงานสำหรับลูกค้า (?ho=<id>&t=<token>) — เปิดดูได้โดยไม่ต้องล็อกอิน
  const publicHo = React.useMemo(() => { try { const p = new URLSearchParams(window.location.search); const id = p.get("ho"), t = p.get("t"); return id && t ? { id, t } : null; } catch { return null; } }, []);
  // ลิงก์ให้คะแนนความพอใจ (แยกจากเอกสาร) — ?rate=<id>&t=<token>
  const publicRate = React.useMemo(() => { try { const p = new URLSearchParams(window.location.search); const id = p.get("rate"), t = p.get("t"); return id && t ? { id, t } : null; } catch { return null; } }, []);
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [teams, setTeams] = React.useState([]); // to tell if the logged-in user is on a subcontractor team
  const [permsV, setPermsV] = React.useState(0); // bumps when role permissions (re)load → re-render nav
  const [view, setView] = React.useState(() => { try { return (window.location.hash || "").replace(/^#/, "").split("/")[0] || null; } catch { return null; } });
  const [navHist, setNavHist] = React.useState([]); // stack of previous views → ปุ่มย้อนกลับ
  const [menuOpen, setMenuOpen] = React.useState(false);
  // เปิด/สลับเมนู = เลื่อนเนื้อหากลับไปบนสุด (รายการเรียงใหม่สุดอยู่บน = เห็นรายการล่าสุดทันที) ไม่ค้างตำแหน่งเดิมของเมนูก่อนหน้า
  // ⚠️ ต้องอยู่เหนือ early return ทุกจุด (login/loading) มิฉะนั้นผิด Rules of Hooks → จอขาว
  const mainRef = React.useRef(null);
  React.useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [view]);
  const [lang, setLang] = React.useState(() => { try { return localStorage.getItem("amc_lang") || "th"; } catch { return "th"; } });
  const [purchasePrefill, setPurchasePrefill] = React.useState(null);
  const [poPrefill, setPoPrefill] = React.useState(null);
  const [prepPrefill, setPrepPrefill] = React.useState(null);   // เปิดใบเตรียมวัสดุจากใบเสนอราคา
  const [poFocus, setPoFocus] = React.useState(null);   // เปิดหน้าใบสั่งซื้อพร้อมค้นหาใบที่ลิงก์มา
  const [expenseFocus, setExpenseFocus] = React.useState(null);   // เปิดหน้าเบิกจ่ายพร้อมค้นหาใบที่ลิงก์มา (จากชิปในใบ PO)
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
  const [boqDraft, setBoqDraft] = React.useState(null);     // เปิด BOQ ใหม่พร้อมรายการที่มาจากคำสั่งซื้อหน้าเว็บ
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
  const [emailUnread, setEmailUnread] = React.useState(0); // อีเมลค้างอ่าน → badge เมนูอีเมล
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

  const [profileFailed, setProfileFailed] = React.useState(false);   // โหลดโปรไฟล์ล้มครบรอบ → โชว์ปุ่มลองใหม่/ออก แทนค้าง
  React.useEffect(() => {
    if (!hasConfig) { setReady(true); return; }
    // .finally → ready=true เสมอแม้ getSession ล้ม (ไม่ค้างหน้า "กำลังโหลด" · ไม่มี session ก็เด้ง Login)
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => {}).finally(() => setReady(true));
    // อัปเดต session เฉพาะเมื่อ "ผู้ใช้เปลี่ยน" (เข้า/ออกระบบ) — ไม่ใช่ทุกครั้งที่ token refresh
    //   ทุก ~1 ชม. Supabase ยิง TOKEN_REFRESHED · sync ข้ามแท็บ · focus → ถ้า setSession ทุกครั้ง = re-render ทั้งแอปรัว ๆ
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession((prev) => (prev?.user?.id === (s?.user?.id || null) ? prev : s)));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ⚠️ key ข้อมูลผู้ใช้ (profile/perms/teams) ด้วย "user id" ไม่ใช่ทั้ง session object —
  //   Supabase ยิง onAuthStateChange ทุกครั้งที่รีเฟรช token (ทุก ~1 ชม.) + sync ข้ามแท็บ + focus
  //   ถ้า key ด้วย session ตรง ๆ จะรีเฟรชทุกอย่างใหม่ทุกครั้ง = แอปรวน/ค้าง โดยที่ user เดิม
  const uid = session?.user?.id || null;

  React.useEffect(() => {
    if (!uid) { setProfile(null); return; }
    let alive = true;
    // ⚠️ getProfile() เรียก supabase.auth.getUser() (ตรวจ token กับเซิร์ฟเวอร์) — ช่วง token refresh/เน็ตสะดุด
    //   อาจได้ user=null → คืน null · ห้าม setProfile(null) เด็ดขาด ไม่งั้น role ตกเป็น "tech" (ธุรการเห็นสิทธิช่าง)
    //   ⇒ ได้โปรไฟล์จริงเท่านั้นถึง set · null/พลาด = เก็บของเดิมไว้แล้ว retry (สูงสุด ~4 ครั้ง)
    const load = (tries) => getProfile()
      .then((p) => { if (!alive) return; if (p) { setProfile(p); setProfileFailed(false); } else if (tries < 4) setTimeout(() => load(tries + 1), 900); else setProfileFailed(true); })
      .catch(() => { if (!alive) return; if (tries < 4) setTimeout(() => load(tries + 1), 900); else setProfileFailed(true); });
    setProfileFailed(false); load(0);
    return () => { alive = false; };
  }, [uid]);

  // load the editable role→module permission overrides (falls back to the shipped defaults)
  React.useEffect(() => {
    if (!uid) return;
    getRolePermissions()
      .then((o) => { setPerms(mergePerms(o)); setPermsV((v) => v + 1); })
      // ⚠️ ดึงพลาด (เน็ตสะดุด/token refresh) → "เก็บสิทธิเดิมไว้" ห้าม setPerms(default)
      //   ไม่งั้นสิทธิที่ตั้งเองถูกเขียนทับด้วยค่าเริ่มต้นชั่วขณะ = สิทธิดีดไปกลับ (ค่าเริ่มต้นอยู่ที่ _perms แล้วตอนโหลดครั้งแรก)
      .catch(() => {});
  }, [uid]);

  React.useEffect(() => { if (uid) listTeams().then(setTeams).catch(() => {}); }, [uid]);
  // subcontractor-team members don't belong in HR/attendance — hide those menus for them
  const mySub = !!(profile && teams.some((t) => t.id === profile.team && t.type === "sub"));
  const navIds = (r) => {
    let ids = navForRole(r);
    if (mySub) {
      ids = ids.filter((id) => id !== "attendance" && id !== "hr");   // ช่างซัพไม่เข้าเมนู HR/เข้างานของบริษัท
      if (!ids.includes("subcontract")) ids = [...ids, "subcontract"]; // แต่เปิด "งานค้างจ่าย" (มุมมองอ่านอย่างเดียวของทีมตัวเอง)
    }
    return ids;
  };

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
    const iv = setInterval(refreshNavNotif, 60000);
    // หน่วง realtime: เหตุการณ์รัว ๆ (แจ้งเตือนหลายอันพร้อมกัน) → นับครั้งเดียวใน 4 วิ · ลดยิง query
    let t = null; const soon = () => { if (t) return; t = setTimeout(() => { t = null; refreshNavNotif(); }, 4000); };
    const ch = supabase.channel("nav-notif")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, soon)
      .subscribe();
    return () => { clearInterval(iv); if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [profile, refreshNavNotif]);

  // sidebar badge: count of chats with unread messages — live via realtime, with a polling fallback
  React.useEffect(() => {
    if (!profile || !can(profile.role, "chat")) { setChatUnread(0); return; }
    let alive = true;
    const refresh = () => countUnreadChats().then((n) => { if (alive) setChatUnread(n); }).catch(() => {});
    refresh();
    const iv = setInterval(refresh, 60000);
    let t = null; const soon = () => { if (t) return; t = setTimeout(() => { t = null; refresh(); }, 4000); };
    const ch = supabase.channel("nav-chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "line_contacts" }, soon)
      .subscribe();
    return () => { alive = false; clearInterval(iv); if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [profile, permsV]);

  // sidebar badge: อีเมลค้างอ่าน — ดึงเมลใหม่ทุก 3 นาที (dedup เร็ว) + นับค้างอ่าน + realtime
  React.useEffect(() => {
    if (!profile || !can(profile.role, "email", "view")) { setEmailUnread(0); return; }
    let alive = true;
    const count = () => countEmailUnread().then((n) => { if (alive) setEmailUnread(n); }).catch(() => {});
    const syncCount = () => syncEmails().catch(() => {}).then(count);
    syncCount();
    const iv = setInterval(syncCount, 180000);
    const ch = supabase.channel("nav-email-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads" }, count)
      .subscribe();
    return () => { alive = false; clearInterval(iv); supabase.removeChannel(ch); };
  }, [profile, permsV]);

  // sidebar badge: unread team-chat messages — live via realtime, polling fallback
  React.useEffect(() => {
    if (!profile || !can(profile.role, "teamchat")) { setTeamUnread(0); return; }
    let alive = true;
    const refresh = () => countUnreadTeamChats().then((n) => { if (alive) setTeamUnread(n); }).catch(() => {});
    refresh();
    const iv = setInterval(refresh, 60000);
    let t = null; const soon = () => { if (t) return; t = setTimeout(() => { t = null; refresh(); }, 4000); };
    const ch = supabase.channel("nav-team-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, soon)
      .subscribe();
    return () => { alive = false; clearInterval(iv); if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [profile, permsV, view]);

  React.useEffect(() => { try { localStorage.setItem("amc_lang", lang); } catch (_) {} }, [lang]);

  // register the service worker + (re)subscribe to push if already permitted
  React.useEffect(() => { registerSW().catch(() => {}); }, []);
  React.useEffect(() => { if (uid) autoResubscribe(); }, [uid]);
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
    const onPop = () => {
      // เติมบัฟเฟอร์คืน "ทันทีเสมอ" แม้ประวัติในแอปว่าง — ไม่งั้นกด Back ซ้ำระหว่างกล่องถามเปิดอยู่
      // จะหลุดออกจากแอปพร้อมฟอร์มที่คีย์ค้าง (popstate เป็น sync จึงต้อง push ก่อน await)
      window.history.pushState(null, "");
      (async () => {
        if (hasUnsaved() && !await confirmDialog({
          title: "มีเอกสารที่กรอกค้างไว้",
          message: "ยังไม่ได้บันทึก — ออกจากหน้านี้เลยไหม?\n\nข้อมูลที่กรอกถูกเก็บไว้ กู้คืนได้ตอนเปิดใบนี้ครั้งหน้า",
          confirmText: "ออกเลย", cancelText: "อยู่ต่อ",
        })) return;
        setNavHist((h) => {
          if (!h.length) return h;
          setView(h[h.length - 1]); setMenuOpen(false);
          return h.slice(0, -1);
        });
      })();
    };
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
    else if (v === "handover") setHoFocusJob(focus);
  }, []);
  // keep the URL hash in sync with the current view (replaceState → doesn't disturb the Back scheme above),
  // so refreshing or "open link in new tab" lands on the same menu
  React.useEffect(() => { if (view) { try { window.history.replaceState(null, "", "#" + view); } catch (_) {} } }, [view]);

  if (publicRate) return <PublicRating id={publicRate.id} token={publicRate.t} />;   // ลิงก์ให้คะแนน (แยก)
  if (publicHo) return <PublicHandover id={publicHo.id} token={publicHo.t} />;   // ลูกค้าเปิดจากลิงก์ LINE — ไม่ต้องล็อกอิน
  if (!hasConfig) return <SetupNotice />;
  if (!ready) return <div className="login-stage"><div className="page-sub">กำลังโหลด…</div></div>;
  if (!session) return <Login />;
  // ล็อกอินแล้วแต่โปรไฟล์ยังโหลดไม่เสร็จ → โชว์ "กำลังโหลด" · ห้าม render แอปด้วย role fallback "tech"
  //   (ไม่งั้นธุรการเห็นสิทธิช่างแว้บ ๆ ระหว่างโหลด) — profile จะมาชัวร์เพราะ effect ด้านบน retry ให้
  if (!profile) {
    // โหลดโปรไฟล์ล้มครบรอบ (token หมดอายุ/เน็ตสะดุด) → ห้ามค้าง · ให้ทางออก (ลองใหม่/ออกจากระบบ)
    if (profileFailed) return (
      <div className="login-stage"><div style={{ textAlign: "center" }}>
        <div className="page-sub" style={{ marginBottom: 12 }}>โหลดข้อมูลผู้ใช้ไม่สำเร็จ — เน็ตอาจสะดุดหรือหมดเวลาเข้าสู่ระบบ</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn-primary" onClick={() => window.location.reload()}>ลองใหม่</button>
          <button className="btn-ghost" onClick={() => { signOut().finally(() => window.location.reload()); }}>ออกจากระบบ</button>
        </div>
      </div></div>
    );
    return <div className="login-stage"><div className="page-sub">กำลังโหลดสิทธิ์การใช้งาน…</div></div>;
  }

  // พนักงานพ้นสภาพ (mig 196) — เข้าระบบไม่ได้ · ชื่อยังอยู่บนเอกสารเก่า
  if (profile.active === false) return (
    <div className="login-stage"><div style={{ textAlign: "center", maxWidth: 340 }}>
      <div style={{ fontSize: 44, marginBottom: 8 }}>🔒</div>
      <div className="page-sub" style={{ marginBottom: 14, lineHeight: 1.7 }}>บัญชีนี้ถูกปิดการใช้งาน<br />กรุณาติดต่อฝ่ายบุคคล/ธุรการ</div>
      <button className="btn-primary" onClick={() => signOut().finally(() => window.location.reload())}>ออกจากระบบ</button>
    </div></div>
  );

  const role = profile.role || "tech";
  // ทีมช่าง (ช่าง/ผู้ช่วยช่าง/หัวหน้าช่าง) + แม่บ้าน เลือกภาษาพม่าได้ (แรงงานพม่า) · ฝั่งหลังบ้าน/ออฟฟิศเป็นไทยเสมอ
  const canBurmese = role === "tech" || role === "assistant" || role === "lead_tech" || role === "maid";
  const effLang = canBurmese ? lang : "th";
  async function go(id) {
    // สลับเมนูขณะฟอร์มค้าง = ฟอร์มถูก unmount ทิ้งเหมือนกัน ต้องถามก่อน
    if (hasUnsaved() && !await confirmDialog({
      title: "มีเอกสารที่กรอกค้างไว้",
      message: "ยังไม่ได้บันทึก — เปลี่ยนเมนูเลยไหม?\n\nข้อมูลที่กรอกถูกเก็บไว้ กู้คืนได้ตอนเปิดใบนี้ครั้งหน้า",
      confirmText: "เปลี่ยนเมนู", cancelText: "อยู่ต่อ",
    })) return;
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
    const v = { boq: "boq", quote: "quote", job: "joborders", invoice: "invoice", receipt: "receipt", po: "po", handover: "handover", creditnote: "adjnote", debitnote: "adjnote" }[type];
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
      {newVersion && (
        <button className="ver-banner" onClick={() => window.location.reload()} title="โหลดเวอร์ชันล่าสุด">
          ✨ มีอัปเดตใหม่ — แตะเพื่อโหลดเวอร์ชันล่าสุด
        </button>
      )}
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
            const badgeFor = (id) => id === "chat" ? chatUnread : id === "email" ? emailUnread : id === "teamchat" ? teamUnread : (NAV_BADGE_SKIP[id] ? 0 : (notifCounts[id] || 0));
            const renderItem = (id) => {
              const n = NAV[id];
              const primary = effLang === "my" ? (NAV_MY[id] || n.th) : n.th;
              const secondary = effLang === "my" ? n.th : n.en;
              return (
                // real link → can Ctrl/กลางคลิก/คลิกขวา "เปิดในแท็บใหม่" ได้ · คลิกปกติยังเป็น SPA แท็บเดิม
                <a key={id} href={"#" + id} style={{ textDecoration: "none" }} className={"nav-item" + (view === id ? " on" : "")}
                  onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); go(id); }}>
                  <span className="nav-emoji" aria-hidden="true">{NAV_EMOJI[id] || "•"}</span>
                  <span className="nav-th">{primary}</span>
                  <span className="nav-en">{secondary}</span>
                  {id === "chat" && chatUnread > 0 && <span className="nav-badge" title={`${chatUnread} แชตค้างตอบ`}>{chatUnread > 99 ? "99+" : chatUnread}</span>}
                  {id === "email" && emailUnread > 0 && <span className="nav-badge" title={`${emailUnread} อีเมลค้างอ่าน`}>{emailUnread > 99 ? "99+" : emailUnread}</span>}
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

      <main className="main" ref={mainRef}>
        {navHist.length > 0 && <button className="page-back" onClick={goBack}><UIcon name="chevR" size={15} style={{ transform: "rotate(180deg)" }} /> ย้อนกลับ</button>}
        {/* แถบเตือนงานค้างจากกระดานสั่งงาน — ตามไปทุกเมนู */}
        {profile?.id && <TaskReminder myId={profile.id} view={view} onOpen={(id) => { setTaskFocus(id); go("tasks"); }} onOpenBoard={() => go("tasks")} />}
        {/* ครอบเฉพาะเนื้อหา ไม่ครอบเมนู/ปุ่มย้อนกลับ — หน้าไหนพังก็ยังเปลี่ยนไปทำเมนูอื่นต่อได้
            resetKey={view} = เปลี่ยนหน้าแล้วล้าง error เอง ไม่งั้นค้างจอพังยาวถึงหน้าถัดไป */}
        <ErrorBoundary resetKey={view}>
        {/* แผงแชตทีมลอยขวามือ — ตามไปทุกเมนู (ซ่อนเมื่ออยู่หน้าแชตทีมเอง · ซ่อนบนจอเล็ก) */}
        {profile?.id && can(role, "teamchat") && <ChatDock me={profile} hidden={view === "teamchat"} onOpenFull={() => go("teamchat")} />}
        <InstallBanner />
        <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
        {view === "dashboard" && <Dashboard role={role} onReorder={(items) => { setPoPrefill(items); go("po"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onGo={(v) => go(v)} onOpenDoc={openDoc} />}
        {view === "kpi" && <KpiScorecard />}
        {view === "pipeline" && <Pipeline role={role} me={profile?.id} onOpenCustomer={(id) => { setCustFocus(String(id)); go("customers"); }} />}
        {view === "reviews" && <Reviews role={role} />}
        {view === "customers" && <Customers role={role} focus={custFocus} onFocusConsumed={() => setCustFocus(null)} onOpenDoc={openDoc} />}
        {view === "suppliers" && <Suppliers role={role} />}
        {view === "followup" && <CustomerFollowup role={role}
          onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }}
          onOpenCustomer={(cid) => { setCustFocus(String(cid)); go("customers"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }}
          onCreateJob={(cid) => { setJobSurveyCust(String(cid)); go("joborders"); }} />}
        {view === "chat" && <Chat role={role} onOpenDoc={openDoc} onGoCustomers={(name) => { setCustFocus(name); go("customers"); }}
          focus={chatFocus} onFocusConsumed={() => setChatFocus(null)}
          onCreateBoq={(cid) => { setBoqNewCust(String(cid)); go("boq"); }}
          onCreateSurvey={(cid) => { setJobSurveyCust(String(cid)); go("joborders"); }}
          onCreateTask={(cid, name) => { setTaskPrefill({ customerId: cid ? String(cid) : null, name: name || null }); go("tasks"); }} />}
        {view === "email" && <Email role={role} me={profile} />}
        {view === "teamchat" && <TeamChat focus={teamFocus} onFocusConsumed={() => setTeamFocus(null)} onJobClick={(jn) => openInNewTab("joborders", jn)} />}
        {view === "tasks" && <TaskBoard role={role} me={profile} prefill={taskPrefill} onPrefillConsumed={() => setTaskPrefill(null)} focus={taskFocus} onFocusConsumed={() => setTaskFocus(null)} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "boq" && <BOQ role={role} focus={boqFocus} onFocusConsumed={() => setBoqFocus(null)} onCreateQuote={(boqNo) => { setQuoteFromBoq(boqNo); go("quote"); }}
          newForCustomer={boqNewCust} onNewConsumed={() => setBoqNewCust(null)}
          draft={boqDraft} onDraftConsumed={() => setBoqDraft(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "quote" && <Quotation role={role} focus={quoteFocus} onFocusConsumed={() => setQuoteFocus(null)}
          fromBoq={quoteFromBoq} onFromBoqConsumed={() => setQuoteFromBoq(null)}
          onCreateInvoice={(quoteNo) => { setInvoiceFromQuote(quoteNo); go("invoice"); }}
          onCreateJob={(q) => { setJoPrefill(q); go("joborders"); }}
          onCreatePo={(q) => { setPoPrefill({ quoteNo: q.quote_no, poType: "ac", items: (q.items || []).filter((it) => it.item_code && it.kind === "ac").map((it) => ({ code: it.item_code, qty: Number(it.qty) || 1 })) }); go("po"); }}
          onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "invoice" && <Invoices role={role} focus={invoiceFocus} onFocusConsumed={() => setInvoiceFocus(null)} fromQuote={invoiceFromQuote} onFromQuoteConsumed={() => setInvoiceFromQuote(null)}
          onCreateReceipt={(invNo) => { setReceiptFromInvoice(invNo); go("receipt"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "receipt" && <Receipts role={role} focus={receiptFocus} onFocusConsumed={() => setReceiptFocus(null)} fromInvoice={receiptFromInvoice} onFromInvoiceConsumed={() => setReceiptFromInvoice(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "adjnote" && <AdjustmentNotes role={role} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "billing" && <BillingNotes role={role} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }}
          onCreateReceipt={(invNo) => { setReceiptFromInvoice(invNo); go("receipt"); }} />}
        {view === "receivables" && <Receivables role={role} onOpenInvoice={(no) => { setInvoiceFocus(no); go("invoice"); }} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "payables" && <Payables role={role} onOpenPo={(no) => { setPoFocus(no); go("po"); }} onGoExpenses={(ref) => { setExpenseFocus(ref || null); go("expenses"); }} onGoSub={() => go("subcontract")} />}
        {view === "tax" && <TaxReport role={role} />}
        {view === "weborders" && <WebOrders role={role}
          onOpenCustomer={(cid) => { setCustFocus(String(cid)); go("customers"); }}
          onCreateBoq={(d) => { setBoqDraft(d); go("boq"); }} />}
        {view === "website" && <WebManage role={role} />}
        {view === "profit" && <Profit onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} />}
        {view === "cashflow" && <CashFlow />}
        {view === "expenses" && <Expenses role={role} me={profile} onOpenDoc={(t, no) => {
          if (t === "po") { setPoFocus(no); go("po"); }
          else if (t === "job") { setJobFocus(no); go("joborders"); }
          else if (t === "quote") { setQuoteFocus(no); go("quote"); }
        }} focus={expenseFocus} onFocusConsumed={() => setExpenseFocus(null)} />}
        {view === "joborders" && <JobOrders role={role} me={profile?.name || profile?.email} myTeam={profile?.team} focus={jobFocus} onFocusConsumed={() => setJobFocus(null)} prefill={joPrefill} onPrefillConsumed={() => setJoPrefill(null)} schedule={joSchedule} onScheduleConsumed={() => setJoSchedule(null)}
          surveyFor={jobSurveyCust} onSurveyConsumed={() => setJobSurveyCust(null)} onHandover={(jo) => { setHoStartJob(jo); go("handover"); }}
          onCreatePrep={(jo) => { setPrepPrefill({ quoteNo: jo.quote_no || "", jobNo: jo.job_no || "", title: `งาน ${jo.job_no}${jo.title ? " · " + jo.title : ""}` }); go("prep"); }}
          onMovement={(jo, type) => { setWithdrawCtx({ type, jobNo: jo.job_no, team: jo.assigned_team }); go("movements"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenBoq={(bn) => { setBoqFocus(bn); go("boq"); }} onOpenDoc={openDoc} onGoChat={(cid) => { setChatFocus(String(cid)); go("chat"); }} />}
        {view === "handover" && <Handover role={role} me={profile?.name || profile?.email} startJob={hoStartJob} onStartConsumed={() => setHoStartJob(null)} focusJob={hoFocusJob} onFocusConsumed={() => setHoFocusJob(null)} onOpenDoc={openDoc} />}
        {view === "schedule" && <Schedule role={role} team={profile?.team} me={profile?.name || profile?.email} onOpenJob={(jn) => { if (can(role, "joborders")) { setJobFocus(jn); go("joborders"); } else { go("myjobs"); } }} onNewJob={(s) => { setJoSchedule(s); go("joborders"); }} />}
        {view === "myjobs" && <MyJobs role={role} team={profile?.team} me={profile?.name || profile?.email} onWithdraw={(jo) => { setWithdrawCtx({ jobNo: jo.job_no, team: jo.assigned_team || jo.visits?.find((v) => v.assigned_team)?.assigned_team || profile?.team }); go("movements"); }} onHandover={(jo) => { setHoStartJob(jo); go("handover"); }} />}
        {view === "movements" && <Movements role={role} myTeam={profile?.team} prefill={purchasePrefill} onPrefillConsumed={() => setPurchasePrefill(null)} withdrawCtx={withdrawCtx} onWithdrawCtxConsumed={() => setWithdrawCtx(null)} />}
        {view === "stockcount" && <StockCount role={role} />}
        {view === "prep" && <MaterialPrep role={role} prefill={prepPrefill} onPrefillConsumed={() => setPrepPrefill(null)}
          onCreatePo={(items, quoteNo, prepNo) => { setPoPrefill({ quoteNo: quoteNo || null, prepNo: prepNo || null, items }); go("po"); }}
          onWithdraw={(items, jobNo, team, prepNo) => { setWithdrawCtx({ jobNo: jobNo || null, team: team || null, prepNo: prepNo || null, items }); go("movements"); }}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }} />}
        {view === "po" && <PurchaseOrders role={role} prefill={poPrefill} onPrefillConsumed={() => setPoPrefill(null)}
          focus={poFocus} onFocusConsumed={() => setPoFocus(null)}
          onOpenQuote={(qn) => { setQuoteFocus(qn); go("quote"); }} onOpenJob={(jn) => { setJobFocus(jn); go("joborders"); }}
          onGoExpenses={(poNo) => { setExpenseFocus(poNo || null); go("expenses"); }}
          onReceive={async (po) => {
            // ⚠️ ห้ามหักยอดที่รับแล้วตรงนี้ — it.qty เป็นหน่วยของบรรทัด (สินค้า 2 หน่วย = ม้วน)
            //    ส่วน got มาจาก transactions ซึ่งเป็นหน่วยหลักเสมอ (เมตร) ลบกันตรง ๆ = 3 − 100 → 0
            //    บรรทัดนั้นหายจากตะกร้า และถ้าหายหมดจะเด้งไปเติมเต็มใบ = รับซ้ำทั้งใบ
            //    หน้ารับของมีตารางสินค้า จึงหักที่นั่นหลังแปลงหน่วยแล้ว (ส่ง receivedQty ไปให้ด้านล่าง)
            const got = await poReceivedQty(po.po_no).catch(() => ({}));
            const items = po.items.map((it) => ({ code: it.material_code, qty: Number(it.qty) || 0, price: it.price, unit: it.unit || null }));
            // รายการตามใบเสนอราคา — หน้ารับของใช้เตือนเมื่อซื้อเผื่อเกินจำนวนที่งานต้องใช้
            // (ส่งเป็นหน่วยที่ขายลูกค้า หน้ารับของจะแปลงเป็นหน่วยหลักเอง — App.jsx ไม่มีตารางสินค้า)
            const qi = po.quote_no ? await getQuoteItems(po.quote_no).catch(() => []) : [];
            setPurchasePrefill({ poNo: po.po_no, quoteNo: po.quote_no || null,
              quoteItems: (qi || []).filter((x) => x.item_code).map((x) => ({ code: x.item_code, qty: Number(x.qty) || 0, unit: x.unit || null })),
              receivedQty: got, items });
            go("movements");
          }} />}
        {view === "tools" && <Tools role={role} me={profile} />}
        {view === "jobs" && <Jobs role={role} />}
        {view === "catalog" && <Catalog role={role} />}
        {view === "attendance" && <Attendance me={profile} />}
        {view === "handbook" && <Handbook role={role} me={profile} />}
        {view === "hr" && <HR role={role} />}
        {view === "subcontract" && <Subcontractor role={role} onOpenDoc={openDoc} mySub={mySub} />}
        {view === "settings" && <Settings role={role} />}
        </React.Suspense>
        </ErrorBoundary>
      </main>
      <ConfirmHost />
    </div>
    </LangContext.Provider>
  );
}
