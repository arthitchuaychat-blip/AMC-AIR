import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { CHAT_TAIL, listLineContacts, listLineMessages, searchLineMessages, sendLineMessage, sendLineImage, sendLineFile, sendLineSticker, uploadChatImage, uploadDocFile, linkLineContact, addLineCustomer, removeLineCustomer, markLineRead, setLineContactKind, listSuppliers, listPurchaseOrders, listFbContacts, listFbMessages, sendFbMessage, sendFbImage, sendFbFile, linkFbContact, markFbRead, listCustomers, listCustomerDocs, listJobOrders, listTeams, listMaterialsLite, getJobRateLink, getHandoverLink, listHandovers, listQuickReplies, addQuickReply, updateQuickReply, saveQuickReplyOrder, deleteQuickReply, setLineStage, setLineOwner, setLineAiOff, setLineNote, setLineTags, setFbStage, setFbOwner, setFbNote, setFbTags, setFbAiOff, searchFbMessages, sendEmail, setLinePinned, setFbPinned, setLineName, setFbName, getCompanies, markQuoteSent, listStaff, getProfile, getAcSeries, getAutoReply, saveAutoReply, scanCouponImage, findCoupon, linkCoupon } from "../lib/api";
import TeamQueuePanel from "./TeamQueuePanel";
import FbComments from "./FbComments";
import { TYPE_LABEL, DOC_FILTERS, stOf } from "../lib/docmeta";
import { supabase } from "../lib/supabase";
import { buildOrderConfirm } from "../lib/confirmText";
import { scheduleLabel, JOB_STATUSES } from "../lib/schedule";
const JOB_ST_LABEL = Object.fromEntries((JOB_STATUSES || []).map(([v, l]) => [v, l]));
import { fmtBaht, fmtNum, custCode, matchText, matchPhone, eqi, ATTACH_ACCEPT } from "../lib/format";
import { can } from "../lib/permissions";
import { QR_MY } from "../lib/i18n";
import { UIcon, MaterialThumb } from "../icons";
import CustomerFormModal from "./CustomerFormModal";
import DocCapture from "./DocCapture";
import { useDocPeek } from "./DocPeek";
import { captureDocToStage, captureDocForEmail } from "../lib/sendDoc";
import html2canvas from "html2canvas";

const initial = (s) => (s || "?").trim()[0]?.toUpperCase() || "?";
// LINE's basic bot-sendable sticker sets (only these official packages can be sent by a bot)
const _range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const STICKER_SETS = [
  { name: "บราวน์ & โคนี่", pkg: 11537, ids: _range(52002734, 52002773) },
  { name: "มูน & เจมส์", pkg: 446, ids: _range(1988, 2027) },
  { name: "บราวน์ & โคนี่ (คลาสสิก)", pkg: 789, ids: _range(10855, 10892) },
  { name: "แซลลี่", pkg: 1070, ids: _range(17839, 17878) },
];
const stickerThumb = (id) => `https://stickershop.line-scdn.net/stickershop/v1/sticker/${id}/android/sticker.png`;
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";
const _sameDay = (a, b) => a.toDateString() === b.toDateString();
// ลิสต์รายชื่อ: วันนี้ → เวลา · เมื่อวาน → "เมื่อวาน 09:05" · เก่ากว่า → "3 ก.ค. 09:05" (ข้ามปีแสดงปีด้วย)
const fmtWhen = (d) => {
  if (!d) return "";
  const x = new Date(d), now = new Date();
  const t = x.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (_sameDay(x, now)) return t;
  const yd = new Date(now); yd.setDate(now.getDate() - 1);
  if (_sameDay(x, yd)) return `เมื่อวาน ${t}`;
  if (x.getFullYear() !== now.getFullYear()) return x.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  return `${x.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${t}`;
};
// แถบคั่นวันในกระดานแชต: "วันนี้ · ศ. 4 ก.ค." / "เมื่อวาน · พฤ. 3 ก.ค." / "อ. 1 ก.ค." (ข้ามปีแสดงปี)
const fmtDay = (d) => {
  if (!d) return "";
  const x = new Date(d), now = new Date();
  const base = x.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", ...(x.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  if (_sameDay(x, now)) return `วันนี้ · ${base}`;
  const yd = new Date(now); yd.setDate(now.getDate() - 1);
  if (_sameDay(x, yd)) return `เมื่อวาน · ${base}`;
  return base;
};
// CRM stages (sales phase) for a LINE contact
const STAGES = [
  { id: "new", label: "ใหม่", color: "#64748b" },
  { id: "talking", label: "กำลังคุย", color: "#1f74e0" },
  { id: "interested", label: "สนใจ/จะซื้อ", color: "#d97706" },
  { id: "followup", label: "ต้องติดตาม", color: "#7c3aed" },
  { id: "won", label: "ปิดการขาย", color: "#16a34a" },
  { id: "closed", label: "จบแล้ว", color: "#0891b2" },
  { id: "lost", label: "ไม่สนใจ", color: "#dc2626" },
];
const stageDef = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

// distinct colors for coworkers' outgoing bubbles (mine stays the default blue)
const STAFF_COLORS = ["#0891b2", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#ca8a04", "#0d9488", "#dc2626"];
// turn URLs in plain text into clickable links
function linkify(text) {
  if (!text) return text;
  return String(text).split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer" className="chat-link">{p}</a> : p);
}
// short one-line preview of a message (for quote boxes + reply bar)
function msgSnippet(m) {
  if (!m) return "";
  if (m.type === "sticker") return "[สติกเกอร์]";
  if (m.type === "image" || m.image_url) return "[รูปภาพ]";
  if (m.type === "file" || m.file_url) return m.file_name ? `[ไฟล์] ${m.file_name}` : "[ไฟล์]";
  const t = (m.text || "").replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
}
// best-effort download (falls back to opening in a new tab if blocked by CORS)
async function dlFile(url, name) {
  try {
    const r = await fetch(url); const b = await r.blob();
    const u = URL.createObjectURL(b); const a = document.createElement("a");
    a.href = u; a.download = name || url.split("/").pop() || "download"; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(u);
  } catch { window.open(url, "_blank", "noopener"); }
}

export default function Chat({ role, onOpenDoc, onGoCustomers, onCreateBoq, onCreateSurvey, onCreateTask, focus, onFocusConsumed }) {
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ประวัติเอกสารลูกค้า → พรีวิวแผงขวาก่อน
  const canSend = can(role, "chat", "edit");
  const [allC, setAllC] = React.useState({ line: [], fb: [] });   // ผู้ติดต่อทั้ง 2 แหล่ง — ไว้โชว์ยอดค้างอ่านทุกแท็บพร้อมกัน
  const [custs, setCusts] = React.useState([]);
  const [sel, setSel] = React.useState(null);          // selected line_user_id
  const [msgs, setMsgs] = React.useState([]);
  const [moreOld, setMoreOld] = React.useState(false);   // ยังมีข้อความเก่ากว่าที่โหลดมาอีกไหม
  const [loadingOld, setLoadingOld] = React.useState(false);
  const [text, setText] = React.useState("");
  const [q, setQ] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [stickerOpen, setStickerOpen] = React.useState(false);
  const [stickerSet, setStickerSet] = React.useState(0);
  const [acPicker, setAcPicker] = React.useState(false);
  const [acItems, setAcItems] = React.useState([]);
  const [acSearch, setAcSearch] = React.useState("");
  const [acBrand, setAcBrand] = React.useState("all");
  const [acBtu, setAcBtu] = React.useState("all");
  const [acType, setAcType] = React.useState("all");
  const [acKind, setAcKind] = React.useState("ac");        // แท็บใน picker: แอร์ / บริการ / วัสดุ
  const [acSeries, setAcSeries] = React.useState("all");   // รุ่น/ซีรีส์ (แอร์ — ไล่ตามยี่ห้อ เหมือนคลังสินค้า)
  const [acCat, setAcCat] = React.useState("all");         // หมวด (บริการ/วัสดุ)
  const [chatCart, setChatCart] = React.useState([]);      // ตะกร้าย่อยในแชต: เลือกหลายรายการ (แอร์+ค่าติดตั้ง) รวมยอดส่งทีเดียว
  const [chatPay, setChatPay] = React.useState("cash");     // วิธีชำระของสรุปราคา (ค่าเริ่มต้นเงินสด)
  const [showThread, setShowThread] = React.useState(false); // mobile pane toggle
  const [toast, setToast] = React.useState(null);
  const [quickReplies, setQuickReplies] = React.useState([]);
  const [qrManage, setQrManage] = React.useState(false);
  const [newQr, setNewQr] = React.useState("");
  const [newQrTitle, setNewQrTitle] = React.useState("");
  const [newQrImgs, setNewQrImgs] = React.useState([]);   // รูปแนบของข้อความสำเร็จรูปที่กำลังเพิ่ม
  const [qrEdit, setQrEdit] = React.useState(null); // { id, title, text, images } while editing one reply
  const [qrUploading, setQrUploading] = React.useState(false);
  const [qrPendImgs, setQrPendImgs] = React.useState([]);  // รูปจากข้อความสำเร็จรูปที่กดไว้ — ส่งพร้อมข้อความตอนกดส่ง
  const [pending, setPending] = React.useState([]);        // รูป/ไฟล์ที่เลือกไว้ "พักก่อนส่ง" [{type:'image'|'file', url, name}] — กดตรวจแล้วค่อยส่ง
  const [uploading, setUploading] = React.useState(false); // กำลังอัปโหลดไฟล์เข้าที่พัก
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(() => { try { return localStorage.getItem("amc_chat_tools") !== "0"; } catch { return true; } }); // พับ/กางแถบเครื่องมือ+คำตอบสำเร็จรูป (จำค่าไว้)
  const toggleTools = () => setToolsOpen((o) => { const n = !o; try { localStorage.setItem("amc_chat_tools", n ? "1" : "0"); } catch {} if (!n) { setEmojiOpen(false); setStickerOpen(false); setQrbOpen(false); } return n; });
  const [qrButtons, setQrButtons] = React.useState([]);    // ปุ่มให้ลูกค้ากด (LINE quick-reply) [{label,text}] — แนบกับข้อความถัดไป
  const [qrbOpen, setQrbOpen] = React.useState(false);
  const [qrSearch, setQrSearch] = React.useState("");
  const [jobs, setJobs] = React.useState(null);       // cached job orders (loaded on first "ส่งคอนเฟิม")
  const [teams, setTeams] = React.useState([]);       // permanent teams for the queue panel
  const [showQueue, setShowQueue] = React.useState(false); // คิวช่าง section toggle in the info panel
  const [jobPicker, setJobPicker] = React.useState(null);
  const [ratePicker, setRatePicker] = React.useState(null);   // ⭐ ขอคะแนน (เลือกใบงาน)
  const [hoPicker, setHoPicker] = React.useState(null);       // 📄 ส่งใบส่งมอบ (เลือกใบ)
  const [sendMenuFor, setSendMenuFor] = React.useState(null); // doc entry whose "ส่งเป็น รูป/PDF" popup is open
  const [emailDoc, setEmailDoc] = React.useState(null);       // { to, subject, body, attachments, label } — คอมโพสอีเมลส่งเอกสาร
  const [copyMode, setCopyMode] = React.useState("none");     // ประทับต้นฉบับ/สำเนา: none | orig | copy | both
  const COPY_LABELS = { none: [""], orig: ["ต้นฉบับ"], copy: ["สำเนา"], both: ["ต้นฉบับ", "สำเนา"] };
  const [multiSel, setMultiSel] = React.useState(false);      // โหมดเลือกเอกสารหลายใบ
  const [selDocs, setSelDocs] = React.useState(() => new Set()); // คีย์ "type|no" ที่เลือกไว้
  const [batch, setBatch] = React.useState(null);             // { entries, mode, i, imgs, atts, texts } — คิวเตรียมเอกสารหลายใบ
  const [company, setCompany] = React.useState(null);         // หัวจดหมายบริษัท (โลโก้/ที่อยู่/ช่องทางติดต่อ) สำหรับอีเมล
  React.useEffect(() => { getCompanies().then((c) => setCompany((c.vat && Object.keys(c.vat).length) ? c.vat : c.novat)).catch(() => {}); }, []);
  const [capJob, setCapJob] = React.useState(null); // { type, no, mode, to, label } → render off-screen + capture + send
  const startSend = (e, mode) => { setSendMenuFor(null); setCapJob({ type: e.type, no: e.no, mode, to: sel, label: `${TYPE_LABEL[e.type]} ${e.no}`, email: selCust?.email || "", custName: selCust?.name || "", copies: COPY_LABELS[copyMode] || [""] }); flash(mode === "email" ? "กำลังเตรียมเอกสารสำหรับอีเมล…" : "กำลังเตรียมเอกสาร…"); };
  // ── ส่งหลายเอกสารพร้อมกัน ──
  const docKey = (e) => e.type + "|" + e.no;
  const toggleSelDoc = (e) => setSelDocs((s) => { const n = new Set(s); const k = docKey(e); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const exitMulti = () => { setMultiSel(false); setSelDocs(new Set()); };
  function batchSend(entries, mode) {
    if (!entries.length) return flash("ยังไม่ได้เลือกเอกสาร", true);
    setBatch({ entries, mode, i: 0, imgs: [], atts: [], texts: [] });
    flash(`กำลังเตรียม ${entries.length} เอกสาร…`);
  }
  async function batchOnReady(node) {
    const b = batch; if (!b) return;
    const en = b.entries[b.i];
    const label = `${TYPE_LABEL[en.type]} ${en.no}`;
    let imgs = b.imgs, atts = b.atts, texts = b.texts;
    try {
      if (b.mode === "email") { atts = [...atts, ...(await captureDocForEmail(node, "pdf", label))]; }
      else if (b.mode === "pdf") { const { text } = await captureDocToStage(node, "pdf", label); if (text) texts = [...texts, text]; }
      else { const { attachments } = await captureDocToStage(node, "image", label); imgs = [...imgs, ...attachments]; }
    } catch (e) { flash(`เตรียม ${label} ไม่สำเร็จ: ${e.message || e}`, true); }
    const next = b.i + 1;
    if (next < b.entries.length) { setBatch({ ...b, i: next, imgs, atts, texts }); return; }
    // เตรียมครบทุกใบแล้ว → รวมส่ง
    setBatch(null); exitMulti();
    const n = b.entries.length;
    if (b.mode === "email") {
      if (!atts.length) return flash("เตรียมไฟล์ไม่สำเร็จ", true);
      setEmailDoc({ to: selCust?.email || "", label: `เอกสาร ${n} ฉบับ`, attachments: atts,
        subject: `เอกสารจาก AMC AIR (${n} ฉบับ)`,
        body: `เรียน ${selCust?.name || "ลูกค้า"}\n\nบริษัท AMC AIR ขอนำส่งเอกสาร ${n} ฉบับ ตามไฟล์แนบครับ หากมีข้อสงสัยหรือต้องการข้อมูลเพิ่มเติม ติดต่อกลับได้เลยครับ\n\nขอบคุณที่ใช้บริการครับ\nAMC AIR` });
    } else if (b.mode === "pdf") {
      if (texts.length) setText((cur) => (cur ? cur + "\n" : "") + texts.join("\n"));
      flash(`แนบลิงก์ ${n} เอกสารในช่องแชตแล้ว — ตรวจแล้วกดส่ง ✓`);
    } else {
      if (imgs.length) setPending((s) => [...s, ...imgs]);
      flash(`แนบ ${n} เอกสารในช่องแชตแล้ว — ตรวจแล้วกดส่ง ✓`);
    }
    b.entries.forEach((en) => { if (en.type === "quote") markQuoteSent(en.no); });   // ใบเสนอในชุด → "ส่งแล้ว" อัตโนมัติ
  }
  const [infoDocs, setInfoDocs] = React.useState([]);
  const [loadingInfoDocs, setLoadingInfoDocs] = React.useState(false);
  const [infoDocF, setInfoDocF] = React.useState("all");
  const [infoSiteF, setInfoSiteF] = React.useState("all");
  const [showInfo, setShowInfo] = React.useState(false); // mobile info-panel toggle
  const [custForm, setCustForm] = React.useState(null);  // { initial, link } → opens the customer form modal
  const [staff, setStaff] = React.useState([]);
  const [myId, setMyId] = React.useState(null);
  const [stageF, setStageF] = React.useState("all");     // list filter by stage
  const [ownerF, setOwnerF] = React.useState("all"); // list filter: ผู้รับผิดชอบ — "all" ทั้งหมด · "me" ของฉัน · "none" ยังไม่มอบหมาย · <staffId> คนที่เลือก
  const [replyTo, setReplyTo] = React.useState(null);    // message being replied-to (quote)
  const [sups, setSups] = React.useState([]);            // ทะเบียนผู้ขาย (โหลดเมื่อใช้แท็บซัพ/ผูกผู้ขาย)
  const [poPicker, setPoPicker] = React.useState(false); // โมดัลเลือก PO ส่งเข้าแชตซัพ
  const [pos, setPos] = React.useState([]);              // ใบสั่งซื้อ (โหลดครั้งแรกที่กดส่ง PO)
  const [channel, setChannel] = React.useState("line"); // "line" | "fb" | "sup" | "cm" — unified inbox switch
  const isFb = channel === "fb";
  const isSup = channel === "sup";   // แท็บซัพพลายเออร์ = ผู้ติดต่อ LINE ที่ kind='supplier' (mig 138)
  const isCm = channel === "cm";     // แท็บคอมเมนต์ Facebook (mig 193) — แยกจากระบบแชต/contact เดิม
  // channel-aware data calls (FB returns the same shape, psid aliased to line_user_id)
  const chListContacts = () => (isFb ? listFbContacts() : listLineContacts());
  const chListMessages = (id, opt) => (isFb ? listFbMessages(id, opt) : listLineMessages(id, opt));
  const chMarkRead = (id) => (isFb ? markFbRead(id) : markLineRead(id));
  const chSendText = (id, t) => (isFb ? sendFbMessage(id, t) : sendLineMessage(id, t));
  const chSendImage = (id, url) => (isFb ? sendFbImage(id, url) : sendLineImage(id, url));
  const chLink = (id, cid) => (isFb ? linkFbContact(id, cid) : linkLineContact(id, cid));
  const selRef = React.useRef(null);
  const endRef = React.useRef(null);
  const pendingOpenRef = React.useRef(null); // line_user_id/psid to open once contacts (re)load after a channel switch
  const [botCfg, setBotCfg] = React.useState(null);   // สวิตช์บอท AI นอกเวลาทำการ (app_config.autoreply)

  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  React.useEffect(() => { getAutoReply().then((v) => setBotCfg(v || {})).catch(() => setBotCfg(null)); }, []);
  // เปิด-ปิดบอท AI จากหน้าแชตได้เลย — เปิดบอทจะเปิดสวิตช์แม่ของระบบตอบอัตโนมัติให้ด้วย (ไม่งั้นบอทไม่ทำงาน)
  async function toggleBot() {
    if (!botCfg) return;
    const on = !botCfg.ai_enabled;
    const next = { ...botCfg, ai_enabled: on, ...(on ? { enabled: true } : {}) };
    setBotCfg(next);
    try { await saveAutoReply(next); flash(on ? "เปิดบอท AI แล้ว 🤖 — ตอบลูกค้าอัตโนมัตินอกเวลาทำการ" : "ปิดบอท AI แล้ว — นอกเวลาทำการจะส่งข้อความปกติแทน"); }
    catch (e) { setBotCfg(botCfg); flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  // โหลดทั้ง LINE และ FB พร้อมกัน — แท็บที่ไม่ได้เปิดอยู่จะได้โชว์ตัวเลขค้างอ่านถูกต้อง
  async function loadContacts() {
    try {
      const [lc, fc] = await Promise.all([listLineContacts().catch(() => []), listFbContacts().catch(() => [])]);
      setAllC({ line: lc, fb: fc });
    } catch (e) { flash("โหลดแชตไม่สำเร็จ: " + (e.message || e), true); }
  }
  const contacts = isFb ? allC.fb : allC.line;
  // ยอดค้างอ่านต่อแท็บ: LINE ลูกค้า / ซัพพลายเออร์ (แหล่งเดียวกัน แยกด้วย kind) / Facebook
  const unreadOf = (list) => list.reduce((a, c) => a + (Number(c.unread) || 0), 0);
  const tabUnread = {
    line: unreadOf(allC.line.filter((c) => (c.kind || "customer") !== "supplier")),
    sup: unreadOf(allC.line.filter((c) => c.kind === "supplier")),
    fb: unreadOf(allC.fb),
  };

  async function loadQr() { try { setQuickReplies(await listQuickReplies()); } catch { /* ignore */ } }
  const [fbRefreshing, setFbRefreshing] = React.useState(false);
  const [fbMsg, setFbMsg] = React.useState(null);   // ผลรีเฟรชโปรไฟล์ (ค้างไว้ข้างปุ่มให้อ่านง่าย)
  const [fbRaw, setFbRaw] = React.useState(null);   // ผลดิบ (JSON) ค้างบนจอ ไว้วินิจฉัย
  // เติมชื่อ+รูปโปรไฟล์ผู้ติดต่อ Facebook ย้อนหลัง (เรียก /api/fb-backfill ด้วย JWT ทีมออฟฟิศ)
  async function refreshFbProfiles() {
    setFbRefreshing(true); setFbMsg(null); setFbRaw("กำลังเรียก /api/fb-backfill …");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/fb-backfill", { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
      const text = await r.text();
      let j = {}; try { j = JSON.parse(text); } catch { /* keep text */ }
      setFbRaw(`HTTP ${r.status}\n` + (text || "").slice(0, 2000));   // ผลดิบค้างบนจอ
      if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
      await loadContacts();
      if ((j.updated || 0) > 0) setFbMsg({ ok: true, t: `อัปเดต ${j.updated}/${j.scanned || 0} ราย ✓ — กดซ้ำได้ถ้ายังเหลือ` });
      else if (!j.scanned) setFbMsg({ ok: true, t: "ไม่มีรายการต้องอัปเดต (โปรไฟล์ครบ)" });
      else { const d = (j.details || [])[0] || {}; setFbMsg({ ok: false, t: `FB ไม่คืนข้อมูล · ${d.graphError || d.result || "?"}` }); }
    } catch (e) { setFbMsg({ ok: false, t: "ผิดพลาด: " + (e.message || e) }); }
    finally { setFbRefreshing(false); }
  }
  React.useEffect(() => {
    loadContacts(); loadQr();
    listCustomers().then(setCusts).catch(() => {});
    // ถ้าลิสต์พนักงานโหลดพลาด (เช่น token ยังไม่พร้อม) ลองซ้ำอีกครั้ง — ไม่งั้นชื่อผู้ตอบทุกคนจะขึ้น "ทีมงาน"
    listStaff().then(setStaff).catch(() => { setTimeout(() => listStaff().then(setStaff).catch(() => {}), 2500); });
    getProfile().then((p) => setMyId(p?.id || null)).catch(() => {});
  }, []);
  const staffMap = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  // ผู้รับผิดชอบลูกค้า = เฉพาะทีมหลังบ้านที่เข้าถึงแชตได้ (admin/exec/บัญชี/บุคคล/ขาย) — ไม่รวมช่างหน้างาน
  const ownerStaff = React.useMemo(() => staff.filter((s) => can(s.role, "chat", "view")), [staff]);
  const staffColor = React.useMemo(() => Object.fromEntries(staff.map((s, i) => [s.id, STAFF_COLORS[i % STAFF_COLORS.length]])), [staff]);
  async function changeStage(s) { try { if (isFb) await setFbStage(sel, s); else await setLineStage(sel, s); await loadContacts(); } catch (e) { flash("เปลี่ยนสถานะไม่สำเร็จ: " + (e.message || e), true); } }
  async function changeOwner(uid) { try { if (isFb) await setFbOwner(sel, uid || null); else await setLineOwner(sel, uid || null); await loadContacts(); } catch (e) { flash("มอบหมายไม่สำเร็จ: " + (e.message || e), true); } }
  async function changeNote(note) { try { if (isFb) await setFbNote(sel, note); else await setLineNote(sel, note); await loadContacts(); } catch (e) { flash("บันทึกโน้ตไม่สำเร็จ: " + (e.message || e), true); } }
  async function changeTags(tags) { try { if (isFb) await setFbTags(sel, tags); else await setLineTags(sel, tags); await loadContacts(); } catch (e) { flash("บันทึกแท็กไม่สำเร็จ: " + (e.message || e), true); } }
  // ปิดบอทเฉพาะห้องนี้ — ใช้ตอนกำลังคุยปิดการขายเอง ไม่อยากให้บอทแทรก (mig 164)
  async function toggleAiOff(off) {
    try { await (isFb ? setFbAiOff(sel, off) : setLineAiOff(sel, off)); await loadContacts(); flash(off ? "ปิดบอท AI ห้องนี้แล้ว — มีแต่คนตอบ" : "เปิดบอท AI ห้องนี้แล้ว"); }
    catch (e) { flash("เปลี่ยนไม่สำเร็จ: " + (e.message || e), true); }
  }
  // ปักหมุดแชต (ดันขึ้นบนสุด) + เปลี่ยนชื่อลูกค้าในแชต — ทุกแพลตฟอร์ม (mig 223)
  async function togglePin(c) {
    try { await (isFb ? setFbPinned(c.line_user_id, !c.pinned) : setLinePinned(c.line_user_id, !c.pinned)); await loadContacts(); flash(!c.pinned ? "ปักหมุดแชตไว้ด้านบนแล้ว 📌" : "ยกเลิกปักหมุดแล้ว"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function renameContact(c) {
    const name = window.prompt("ตั้งชื่อลูกค้าในแชต (เว้นว่าง = ใช้ชื่อโปรไฟล์เดิม):", c.custom_name || c.display_name || "");
    if (name === null) return;
    try { await (isFb ? setFbName(c.line_user_id, name) : setLineName(c.line_user_id, name)); await loadContacts(); flash("เปลี่ยนชื่อแล้ว ✓"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  React.useEffect(() => { selRef.current = sel; }, [sel]);
  React.useEffect(() => { setMultiSel(false); setSelDocs(new Set()); setBatch(null); }, [sel]);   // สลับห้อง → ล้างโหมดเลือกหลายใบ
  // teams + jobs for the คิวช่าง panel (so we can answer queue questions instantly)
  React.useEffect(() => { listTeams().then(setTeams).catch(() => {}); listJobOrders().then(setJobs).catch(() => {}); }, []);
  // เปิดห้องแชตใหม่ = กระโดดไปข้อความล่าสุด (ล่างสุด) ทันที · ข้อความใหม่ที่เข้ามาระหว่างเปิดอยู่ค่อยเลื่อนแบบนุ่ม
  const jumpBottom = React.useRef(true);
  React.useEffect(() => { jumpBottom.current = true; }, [sel]);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: jumpBottom.current ? "auto" : "smooth", block: "end" }); jumpBottom.current = false; }, [msgs]);

  // reload + reset when switching channel (LINE ↔ FB) · แท็บคอมเมนต์ไม่ใช้ระบบ contact เดิม → ข้าม
  React.useEffect(() => { if (isCm) return; setSel(null); setMsgs([]); setShowThread(false); setQrPendImgs([]); loadContacts(); }, [channel]);

  // realtime: new messages + contact changes (subscribes to the active channel's tables)
  React.useEffect(() => {
    if (isCm) return;   // คอมเมนต์มี realtime/โหลดเองใน FbComments
    const msgTable = isFb ? "fb_messages" : "line_messages";
    const contactTable = isFb ? "fb_contacts" : "line_contacts";
    // ⚠️ ห้าม loadContacts() (โหลดทั้งตาราง line_contacts + join) ทุกข้อความ — LINE OA คุยรัว = ยิงหมื่นครั้ง/CPU ตัน
    //   หน่วงรวมเป็นครั้งเดียวทุก 3 วิ (รายการอัปช้า 3 วิ ไม่มีใครสังเกต · ข้อความในห้องที่เปิดยัง append ทันที)
    let t = null;
    const reloadSoon = () => { if (t) return; t = setTimeout(() => { t = null; loadContacts(); }, 3000); };
    const ch = supabase.channel(channel + "-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: msgTable }, (p) => {
        const row = p.new; const uid = row.line_user_id || row.psid;
        reloadSoon();
        if (uid === selRef.current) { setMsgs((m) => m.some((x) => x.id === row.id) ? m : [...m, { ...row, line_user_id: uid }]); chMarkRead(uid); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: contactTable }, () => reloadSoon())
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [channel]);

  // document + job history for the linked customer (right info panel)
  const linkedCustId = (contacts.find((c) => c.line_user_id === sel) || {}).customer_id || null;
  React.useEffect(() => {
    if (!linkedCustId) { setInfoDocs([]); return; }
    setInfoDocF("all"); setLoadingInfoDocs(true);
    listCustomerDocs(linkedCustId).then(setInfoDocs).catch(() => setInfoDocs([])).finally(() => setLoadingInfoDocs(false));
  }, [linkedCustId]);

  async function openContact(c) {
    setSel(c.line_user_id); setShowThread(true); setShowInfo(false);
    setQrPendImgs([]);   // รูปแนบค้างจากแชตก่อนหน้า — อย่าหลุดไปห้องอื่น
    try {
      const rows = await chListMessages(c.line_user_id);
      setMsgs(rows);
      // ได้มาเต็มหน้าพอดี = น่าจะยังมีเก่ากว่านี้อีก → โชว์ปุ่มโหลดย้อนหลัง
      setMoreOld(rows.length >= CHAT_TAIL);
      if (c.unread) { chMarkRead(c.line_user_id); loadContacts(); }
    }
    catch (e) { flash("โหลดข้อความไม่สำเร็จ", true); }
  }
  // โหลดข้อความเก่ากว่าที่แสดงอยู่ (ทีละหน้า) — ห้องที่คุยกันยาวมากจะไม่ถูกตัดหายไปเฉย ๆ
  async function loadOlder() {
    if (!sel || loadingOld || !msgs.length) return;
    setLoadingOld(true);
    try {
      const older = await chListMessages(sel, { before: msgs[0].created_at });
      setMsgs((m) => [...older, ...m]);
      setMoreOld(older.length >= CHAT_TAIL);
    } catch (e) { flash("โหลดข้อความเก่าไม่สำเร็จ", true); }
    setLoadingOld(false);
  }

  // "แชตลูกค้า" deep-link from a document: find this customer's contact (LINE or FB), switch
  // to that channel if needed, and open the thread. Looks across both channels.
  React.useEffect(() => {
    if (focus == null) return;
    let alive = true;
    (async () => {
      const [lc, fc] = await Promise.all([listLineContacts().catch(() => []), listFbContacts().catch(() => [])]);
      if (!alive) return;
      onFocusConsumed && onFocusConsumed();
      // focus = a customer id (from a doc) OR a LINE/FB conversation id (from a notification)
      const inLine = lc.find((c) => String(c.customer_id) === String(focus) || String(c.line_user_id) === String(focus));
      const inFb = fc.find((c) => String(c.customer_id) === String(focus) || String(c.line_user_id) === String(focus));
      const target = inLine ? { ch: inLine.kind === "supplier" ? "sup" : "line", c: inLine } : inFb ? { ch: "fb", c: inFb } : null;
      if (!target) { flash("ลูกค้ารายนี้ยังไม่มีแชตที่เชื่อมไว้", true); return; }
      if (target.ch !== channel) { pendingOpenRef.current = target.c.line_user_id; setChannel(target.ch); }
      else openContact(target.c);
    })();
    return () => { alive = false; };
  }, [focus]);

  // after a channel switch the contact list reloads — open the contact we were asked to focus
  React.useEffect(() => {
    if (!pendingOpenRef.current) return;
    const c = contacts.find((x) => x.line_user_id === pendingOpenRef.current);
    if (c) { pendingOpenRef.current = null; openContact(c); }
  }, [contacts]);

  // open the full customer form (in a popup) to add a new customer from this LINE contact, then auto-link
  function addNewCustomer() {
    const c = contacts.find((x) => x.line_user_id === sel); if (!c) return;
    setCustForm({ initial: { type: "person", name: c.display_name || "", vat: false, note: "ลูกค้าจาก LINE OA", contacts: [{ name: c.display_name || "", phone: "", role: "" }], sites: [] }, link: true });
  }
  // open the full customer form to edit the already-linked customer
  function editCustomer(cust) { setCustForm({ initial: cust, link: false }); }

  // after the form saves: link (if new), then refresh customers + contacts + job history
  async function onCustSaved(id) {
    const wasLink = custForm?.link;
    setCustForm(null);
    try {
      if (wasLink && id) await chLink(sel, id);
      setCusts(await listCustomers());
      await loadContacts();
      if (linkedCustId) listCustomerDocs(linkedCustId).then(setInfoDocs).catch(() => {});
      flash(wasLink ? "เพิ่มลูกค้า + เชื่อมแล้ว ✓" : "บันทึกข้อมูลลูกค้าแล้ว ✓");
    } catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
  }

  async function send() {
    const t = text.trim(), imgs = qrPendImgs, pend = pending;
    if ((!t && !imgs.length && !pend.length) || !sel || sending) return;
    setSending(true);
    try {
      const qrb = (!isFb && qrButtons.filter((x) => x.label.trim() && x.text.trim())) || [];   // ปุ่มให้ลูกค้ากด (LINE เท่านั้น)
      if (t) {
        if (isFb) await sendFbMessage(sel, t, replyTo ? { replyToMid: replyTo.fb_message_id } : undefined);
        else await sendLineMessage(sel, t, { ...(replyTo ? { quoteToken: replyTo.quote_token, quotedMessageId: replyTo.line_message_id } : {}), ...(qrb.length ? { quickReplies: qrb } : {}) }); // LINE appends via realtime
      }
      for (const u of imgs) await chSendImage(sel, u);   // รูปแนบจากข้อความสำเร็จรูป — ตามหลังข้อความ
      for (const a of pend) {                            // ของที่ "พักไว้" ตรวจแล้ว → ส่งตามลำดับ
        if (a.type === "file") await (isFb ? sendFbFile(sel, a.url, a.name) : sendLineFile(sel, a.url, a.name));   // PDF/ไฟล์ → FB ต้องส่งเป็น type:file (ส่งเป็นรูปจะ upload ไม่สำเร็จ)
        else await chSendImage(sel, a.url);              // รูป (ทั้ง LINE/FB)
      }
      if (isFb) setMsgs(await chListMessages(sel));      // FB: เผื่อ realtime ไม่ทัน → รีเฟรช
      // คนตอบคนแรก = ผู้รับผิดชอบลูกค้าโดยอัตโนมัติ (แชตลูกค้าที่ยังไม่มีผู้รับผิดชอบ · LINE + FB)
      if (!isSup && myId && selContact && selContact.kind !== "supplier" && !selContact.assigned_to) {
        try { if (isFb) await setFbOwner(sel, myId); else await setLineOwner(sel, myId); await loadContacts(); } catch (e2) { /* ไม่ให้ล้มการส่ง */ }
      }
      setText(""); setReplyTo(null); setQrPendImgs([]); setPending([]); setQrButtons([]);
    }
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setSending(false);
  }
  async function onLink(cid) {
    try {
      if (isFb) await chLink(sel, cid);                          // FB: single customer
      else if (cid) await addLineCustomer(sel, cid);             // LINE: link + make active
      else await removeLineCustomer(sel, linkedCustId);          // LINE: unlink the active one
      await loadContacts(); flash(cid ? "เชื่อมลูกค้าแล้ว ✓" : "ยกเลิกการเชื่อมแล้ว");
    } catch (e) { flash("เชื่อมไม่สำเร็จ: " + (e.message || e), true); }
  }
  // LINE: one chat can link several customers (e.g. personal + company)
  async function addCust(cid) {
    if (!cid) return;
    try { await addLineCustomer(sel, cid); await loadContacts(); flash("เพิ่มลูกค้าแล้ว ✓"); }
    catch (e) { flash("เพิ่มไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function switchCust(cid) {
    try { await chLink(sel, cid); await loadContacts(); }
    catch (e) { flash("สลับไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function removeCust(cid) {
    if (!await confirmDialog("เอาลูกค้ารายนี้ออกจากแชตนี้?")) return;
    try { await removeLineCustomer(sel, cid); await loadContacts(); flash("เอาออกแล้ว"); }
    catch (e) { flash("เอาออกไม่สำเร็จ: " + (e.message || e), true); }
  }

  // ── ซัพพลายเออร์: ย้ายผู้ติดต่อระหว่างกระดานลูกค้า ↔ ซัพ + ผูกทะเบียนผู้ขาย (mig 138) ──
  const ensureSups = () => { if (!sups.length) listSuppliers().then(setSups).catch(() => {}); };
  React.useEffect(() => { if (isSup) ensureSups(); }, [channel]);
  async function moveToSupplier() {
    if (!await confirmDialog("ย้ายแชตนี้ไปกระดานซัพพลายเออร์?\n(จะหายจากแท็บ LINE ลูกค้า ไปอยู่แท็บ 🏭 ซัพฯ)")) return;
    try { await setLineContactKind(sel, "supplier", null); await loadContacts(); ensureSups(); flash("ย้ายไปกระดานซัพพลายเออร์แล้ว ✓ — เปิดดูที่แท็บ 🏭 ซัพฯ"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function moveToCustomer() {
    if (!await confirmDialog("ย้ายแชตนี้กลับกระดานลูกค้า?")) return;
    try { await setLineContactKind(sel, "customer", null); await loadContacts(); flash("ย้ายกลับกระดานลูกค้าแล้ว ✓"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function setSupplierLink(sid) {
    try { await setLineContactKind(sel, "supplier", sid ? Number(sid) : null); await loadContacts(); flash(sid ? "ผูกผู้ขายแล้ว ✓" : "ยกเลิกการผูกผู้ขายแล้ว"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function openPoPicker() {
    setPoPicker(true); ensureSups();
    if (!pos.length) { try { setPos(await listPurchaseOrders()); } catch (e) { flash("โหลดใบสั่งซื้อไม่สำเร็จ: " + (e.message || e), true); } }
  }

  // เลือกรูป → อัปโหลดแล้ว "พักไว้" ในช่องแชต (ยังไม่ส่ง) → ตรวจแล้วกดส่ง
  async function onImage(e) {
    const fs = Array.from(e.target.files || []); e.target.value = ""; if (!fs.length || !sel) return;
    setUploading(true);
    try { for (const f of fs) { const url = await uploadChatImage(f); setPending((p) => [...p, { type: "image", url, name: f.name }]); } }
    catch (ex) { flash("อัปโหลดรูปไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false);
  }
  // เลือกไฟล์ → อัปโหลดแล้วพักไว้ (ยังไม่ส่ง) → ตรวจแล้วกดส่ง (LINE ส่งเป็นลิงก์ให้กด)
  async function onFile(e) {
    const fs = Array.from(e.target.files || []); e.target.value = ""; if (!fs.length || !sel) return;
    setUploading(true);
    try { for (const f of fs) { const url = await uploadChatImage(f); setPending((p) => [...p, { type: "file", url, name: f.name }]); } }
    catch (ex) { flash("อัปโหลดไฟล์ไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false);
  }
  // pick a product/service from the catalog → choose the payment-method price → send to the customer
  async function openAcPicker() {
    setAcPicker(true);
    if (!acItems.length) { try { const m = await listMaterialsLite(); setAcItems(m); } catch { /* ignore */ } }
  }
  // ราคาตามวิธีชำระ (กติกาเดียวกับแคตตาล็อก/เว็บ): เงินสด = ฐาน · รูดเต็ม +4% · ผ่อน 10 เดือน +14% (ปัดขึ้นบาทเต็ม)
  const CHAT_PAY = [
    { v: "cash", l: "💵 เงินสด/โอน", rate: 0 },
    { v: "card_full", l: "💳 บัตรเครดิต รูดเต็ม", rate: 0.04 },
    { v: "card_inst10", l: "💳 ผ่อนบัตร 10 เดือน", rate: 0.14 },
  ];
  const chatAdj = (p, pm) => (pm.rate ? Math.ceil((Number(p) || 0) * (1 + pm.rate)) : Number(p) || 0);
  // จิ้มสินค้า = เพิ่มเข้ารายการ (ซ้ำ = +1) — เลือกข้ามแท็บได้ (แอร์ + ค่าติดตั้ง + วัสดุ)
  const addChatItem = (it) => {
    setChatCart((c) => {
      const i = c.findIndex((x) => x.code === it.code);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { code: it.code, name: it.th, price: Number(it.salePrice) || 0, photo: it.photoUrl || null, qty: 1,
        kind: it.kind, brand: it.brand || "", series: it.series || "", powerCost: Number(it.power_cost_year) || null }];
    });
  };
  const chatQty = (code, d) => setChatCart((c) => c.map((x) => (x.code === code ? { ...x, qty: Math.max(0, x.qty + d) } : x)).filter((x) => x.qty > 0));
  // ส่งสรุปราคาเป็น "รูปตาราง" อ่านง่าย (capture การ์ด HTML → PNG → ส่งเข้าแชต) · สร้างรูปพลาด → ส่งข้อความแทน
  async function sendChatCart() {
    if (!sel || uploading || !chatCart.length) return;
    const pm = CHAT_PAY.find((x) => x.v === chatPay) || CHAT_PAY[0];
    const total = chatCart.reduce((a, x) => a + chatAdj(x.price, pm) * x.qty, 0);
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const rows = chatCart.map((x, i) => {
      const adj = chatAdj(x.price, pm);
      return `<tr style="background:${i % 2 ? "#f4f8fc" : "#fff"}">
        <td style="padding:11px 12px;color:#64748b;font-weight:700;vertical-align:top">${i + 1}</td>
        <td style="padding:11px 6px;line-height:1.45">${esc(x.name)}${x.qty > 1 ? `<div style="font-size:13px;color:#64748b;margin-top:2px">× ${x.qty} @ ${fmtBaht(adj)}</div>` : ""}${x.kind === "ac" && x.powerCost ? `<div style="font-size:13px;color:#0a6b3d;margin-top:2px">⚡ ค่าไฟประมาณ ${fmtNum(x.powerCost)} บาท/ปี (8 ชม./วัน)</div>` : ""}</td>
        <td style="padding:11px 14px;text-align:right;font-weight:800;white-space:nowrap;vertical-align:top">${fmtBaht(adj * x.qty)}</td></tr>`;
    }).join("");
    const cardHtml = `<div style="width:640px;background:#fff;font-family:'Sarabun','IBM Plex Sans Thai',sans-serif;color:#0f1729;border:1px solid #dbe4ee;border-radius:14px;overflow:hidden">
      <div style="background:linear-gradient(90deg,#0ea5e9,#0369a1);color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:18px;font-weight:800">AMC AIR · สรุปราคา</div>
        <div style="font-size:14px;font-weight:700;background:rgba(255,255,255,.18);padding:4px 12px;border-radius:99px">${pm.l}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:2px solid #0ea5e9">
        <div style="font-size:16px;font-weight:800">รวมทั้งสิ้น</div>
        <div style="text-align:right"><div style="font-size:23px;font-weight:800;color:#0369a1">${fmtBaht(total)}</div>
        ${pm.v === "card_inst10" ? `<div style="font-size:13px;color:#64748b;font-weight:700">≈ ${fmtBaht(Math.ceil(total / 10))}/เดือน × 10 งวด</div>` : ""}</div>
      </div>
      <div style="padding:0 16px 12px;font-size:12px;color:#94a3b8">* ราคาโดยประมาณ ทีมงานยืนยันราคา ค่าติดตั้ง และนัดหมายก่อนเสมอ · โทร 099-262-9090</div>
    </div>`;
    setUploading(true);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;";
    host.innerHTML = cardHtml;
    document.body.appendChild(host);
    try {
      if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
      await new Promise((r) => setTimeout(r, 60));
      const canvas = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      // รูปสินค้าแอร์ทุกรุ่นในตะกร้า (ไม่ซ้ำ · อย่างมาก 4 รูป) → ตามด้วยตารางสรุปราคา · "พักไว้" ในช่องแชต ไม่ส่งทันที
      const photos = [...new Set(chatCart.filter((x) => x.kind === "ac" && x.photo).map((x) => x.photo))].slice(0, 4);
      const single = chatCart.length === 1 && chatCart[0].photo ? [chatCart[0].photo] : [];
      const stage = [];
      for (const p of (photos.length ? photos : single)) stage.push({ type: "image", url: p, name: "รูปสินค้า" });
      const url = await uploadDocFile(blob, "png", "image/png");
      stage.push({ type: "image", url, name: "ตารางราคา" });
      setPending((s) => [...s, ...stage]);
      // โบรชัวร์ของแต่ละรุ่นแอร์ (ระดับซีรีส์ · ไม่ซ้ำ · อย่างมาก 3 รุ่น) — ใส่เป็นลิงก์ในช่องข้อความ (ส่งพร้อมกันตอนกดส่ง)
      const seriesList = [...new Map(chatCart.filter((x) => x.kind === "ac" && x.series).map((x) => [`${x.brand}|${x.series}`, x])).values()].slice(0, 3);
      const brs = [];
      for (const s of seriesList) {
        try { const sr = await getAcSeries(s.brand, s.series); if (sr?.brochure_url) brs.push(`📄 โบรชัวร์ ${s.brand} ${s.series}\n${sr.brochure_url}`); } catch { /* ไม่มีโบรชัวร์ก็ข้าม */ }
      }
      if (brs.length) setText((cur) => (cur ? cur + "\n" : "") + brs.join("\n"));
      setChatCart([]); setAcPicker(false);
      flash("แนบรูปสินค้า + ตารางราคาไว้ในช่องแชตแล้ว — ตรวจแล้วกด “ส่ง” ✓");
    } catch (ex) {
      // สร้างรูปไม่สำเร็จ → พักเป็นข้อความสรุปในช่องแทน ลูกค้ายังได้ราคาครบตอนกดส่ง
      try {
        const lines = chatCart.map((x, i) => `${i + 1}. ${x.name}${x.qty > 1 ? ` × ${x.qty}` : ""} = ${fmtBaht(chatAdj(x.price, pm) * x.qty)}`);
        const txt = [`สรุปราคา (${pm.l.replace(/^[^ ]+ /, "")})`, ...lines, `รวมทั้งสิ้น ${fmtBaht(total)}`,
          ...(pm.v === "card_inst10" ? [`(≈ ${fmtBaht(Math.ceil(total / 10))}/เดือน × 10 งวด)`] : [])].join("\n");
        setText((cur) => (cur ? cur + "\n" : "") + txt);
        setChatCart([]); setAcPicker(false);
        flash("แนบเป็นข้อความแทน (สร้างรูปไม่สำเร็จ) — ตรวจแล้วกด “ส่ง”");
      } catch (e2) { flash("แนบไม่สำเร็จ: " + (e2.message || e2), true); }
    }
    document.body.removeChild(host);
    setUploading(false);
  }
  // send a LINE sticker (basic bot-sendable set)
  async function sendSticker(s) {
    if (!sel || sending) return;
    setStickerOpen(false); setSending(true);
    try { await sendLineSticker(sel, s.pkg, s.id); }
    catch (ex) { flash("ส่งสติกเกอร์ไม่สำเร็จ: " + (ex.message || ex), true); }
    setSending(false);
  }

  // order-confirmation: pick one of the linked customer's job orders → fill the box for review
  async function openConfirm() {
    try {
      let js = jobs;
      if (!js) { js = await listJobOrders(); setJobs(js); }
      const mine = js.filter((j) => String(j.customer_id) === String(selContact.customer_id));
      if (!mine.length) return flash("ลูกค้านี้ยังไม่มีใบงาน", true);
      // แตกใบงานเป็น "รอบเข้างาน" — 1 แถวต่อ 1 รอบ (job_visits) เพื่อให้เลือกคอนเฟิมรอบที่เพิ่มเข้ามาได้
      // ใบเก่าที่ยังไม่มีรอบ (visits ว่าง) → 1 แถวใช้ตารางนัดหลักบนใบงาน
      const entries = [];
      mine.forEach((jo) => {
        const vs = (jo.visits || []).filter((v) => (v.scheduled_at || v.visit_date) && v.status !== "cancelled");
        if (vs.length) vs.forEach((v, i) => entries.push({ jo, visit: v, round: i + 1, rounds: vs.length }));
        else entries.push({ jo, visit: null, round: 0, rounds: 0 });
      });
      // เรียงตามวันนัดของรอบ (รอบใกล้ที่สุดอยู่บน)
      // นัดหมายล่าสุด (วันที่ใหม่สุด) อยู่บนสุดเสมอ — เรียงจากมาก→น้อย
      entries.sort((a, b) => (String((b.visit?.scheduled_at) || b.jo.scheduled_at || "")).localeCompare(String((a.visit?.scheduled_at) || a.jo.scheduled_at || "")));
      setJobPicker(entries);
    } catch (e) { flash("โหลดใบงานไม่สำเร็จ: " + (e.message || e), true); }
  }
  function pickJob(entry) { const e = entry.jo ? entry : { jo: entry, visit: null }; setText(buildOrderConfirm(e.jo, e.visit)); setJobPicker(null); flash("ใส่ข้อความคอนเฟิมแล้ว — ตรวจทานแล้วกดส่ง"); }
  function emailConfirm(entry) {
    const e = entry.jo ? entry : { jo: entry, visit: null };
    setJobPicker(null);
    setEmailDoc({ to: selCust?.email || "", label: `ยืนยันนัดหมายงาน ${e.jo.job_no}`, attachments: [],
      subject: `ยืนยันนัดหมายงาน ${e.jo.job_no} — AMC AIR`, body: buildOrderConfirm(e.jo, e.visit) });
  }

  // ⭐ ขอคะแนน: เลือกใบงาน → ใส่ลิงก์ให้คะแนน (ผูก job_no) ในกล่องพิมพ์ ให้ตรวจก่อนส่ง
  async function openRate() {
    try {
      let js = jobs; if (!js) { js = await listJobOrders(); setJobs(js); }
      const mine = js.filter((j) => String(j.customer_id) === String(selContact.customer_id) && j.status !== "cancelled");
      if (!mine.length) return flash("ลูกค้านี้ยังไม่มีใบงาน", true);
      setRatePicker(mine);
    } catch (e) { flash("โหลดใบงานไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function pickRate(jo) {
    setRatePicker(null);
    try {
      const url = await getJobRateLink(jo.job_no);
      setText(`ขอบคุณที่ใช้บริการ AMC AIR ครับ 🙏\nรบกวนให้คะแนนความพอใจงาน ${jo.job_no} สักนิดนะครับ กดที่ลิงก์นี้ได้เลย:\n${url}`);
      flash("ใส่ลิงก์ขอคะแนนแล้ว — ตรวจทานแล้วกดส่ง");
    } catch (e) { flash("ขอลิงก์ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // 📄 ส่งใบส่งมอบ (B): เลือกใบส่งมอบของลูกค้า → ใส่ลิงก์เอกสารในกล่องพิมพ์
  async function openHo() {
    try {
      const all = await listHandovers();
      const mine = (all || []).filter((h) => String(h.customer_id) === String(selContact.customer_id) && h.status === "submitted");
      if (!mine.length) return flash("ลูกค้านี้ยังไม่มีใบส่งมอบงานที่ส่งแล้ว", true);
      setHoPicker(mine);
    } catch (e) { flash("โหลดใบส่งมอบไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function pickHo(h) {
    setHoPicker(null);
    try {
      const { url } = await getHandoverLink(h.id);
      setText(`📄 ใบส่งมอบงาน ${h.ho_no || h.job_no || ""}\nกดดูเอกสารส่งมอบงานได้ที่ลิงก์นี้ครับ:\n${url}`);
      flash("ใส่ลิงก์ใบส่งมอบแล้ว — ตรวจทานแล้วกดส่ง");
    } catch (e) { flash("ขอลิงก์ไม่สำเร็จ: " + (e.message || e), true); }
  }

  // กดปุ่มข้อความสำเร็จรูป: เติมข้อความลงช่องพิมพ์ + พักรูปแนบไว้ (ส่งพร้อมกันตอนกดส่ง)
  const insertQr = (qr) => {
    setText((cur) => cur ? cur + (cur.endsWith("\n") ? "" : "\n") + qr.text : qr.text);
    const imgs = Array.isArray(qr.images) ? qr.images : [];
    if (imgs.length) setQrPendImgs((s) => [...new Set([...s, ...imgs])]);
  };
  // อัปโหลดรูปแนบของข้อความสำเร็จรูป (ฟอร์มเพิ่ม / ฟอร์มแก้ไข)
  async function onQrImgs(e, mode) {
    const files = [...(e.target.files || [])]; e.target.value = "";
    if (!files.length) return;
    setQrUploading(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadChatImage(f));
      if (mode === "edit") setQrEdit((s) => (s ? { ...s, images: [...(s.images || []), ...urls] } : s));
      else setNewQrImgs((s) => [...s, ...urls]);
    } catch (ex) { flash("อัปโหลดรูปไม่สำเร็จ: " + (ex.message || ex), true); }
    setQrUploading(false);
  }
  async function addQr() { const t = newQr.trim(); if (!t) return; try { await addQuickReply(t, newQrTitle, newQrImgs); setNewQr(""); setNewQrTitle(""); setNewQrImgs([]); await loadQr(); } catch (e) { flash("เพิ่มไม่สำเร็จ: " + (e.message || e), true); } }
  async function saveQrEdit() { if (!qrEdit || !qrEdit.text.trim()) return; try { await updateQuickReply(qrEdit.id, { title: qrEdit.title, text: qrEdit.text, images: qrEdit.images || [] }); setQrEdit(null); await loadQr(); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); } }
  async function moveQr(id, dir) {
    const ids = quickReplies.map((q) => q.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setQuickReplies(ids.map((x) => quickReplies.find((q) => q.id === x))); // optimistic reorder
    try { await saveQuickReplyOrder(ids); } catch (e) { flash("จัดลำดับไม่สำเร็จ: " + (e.message || e), true); await loadQr(); }
  }
  async function delQr(id) { if (!await confirmDialog("ลบข้อความนี้?")) return; try { await deleteQuickReply(id); await loadQr(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

  const selContact = contacts.find((c) => c.line_user_id === sel);
  const selCust = custs.find((c) => String(c.id) === String(selContact?.customer_id)) || null;   // ลูกค้าที่ผูกกับแชตนี้ (ใช้อีเมล/ที่อยู่)

  // 🎟️ AI อ่านคูปองจากรูปที่ลูกค้าส่ง → ผูกคูปองกับลูกค้าคนนี้
  const [scanning, setScanning] = React.useState(false);
  async function scanCoupon(url) {
    setScanning(true);
    try {
      const codes = await scanCouponImage(url);
      if (!codes.length) { flash("ไม่พบรหัสคูปองในรูปนี้", true); return; }
      const done = [], bad = [];
      for (const code of codes) {
        const cp = await findCoupon(code);
        if (!cp) { bad.push(code + " (ไม่มีในระบบ)"); continue; }
        if (cp.status === "redeemed") { bad.push(code + " (ใช้ไปแล้ว)"); continue; }
        if (cp.status === "void") { bad.push(code + " (ยกเลิก)"); continue; }
        await linkCoupon(code, { customer_id: selContact?.customer_id || null, [isFb ? "fb_id" : "line_user_id"]: sel, name: selCust?.name || selContact?.display_name || null, phone: selCust?.phone || null, source: isFb ? "fb" : "line" });
        done.push(`${code} · ${cp.promo_campaigns?.name || "คูปอง"}`);
      }
      if (done.length) flash(`✓ ผูกคูปองกับลูกค้าแล้ว: ${done.join(" / ")}`);
      else flash(`อ่านได้: ${bad.join(", ") || codes.join(", ")}`, true);
    } catch (e) { flash(e.message || "ตรวจคูปองไม่สำเร็จ", true); } finally { setScanning(false); }
  }
  // resolve a quoted message by its LINE id (to render the referenced message inside a reply)
  // map ข้อความตาม id ของแพลตฟอร์ม (LINE line_message_id / FB fb_message_id) → ใช้ resolve + เด้งไปข้อความที่ถูกอ้างถึง
  const byLineId = React.useMemo(() => { const m = {}; msgs.forEach((x) => { if (x.line_message_id) m[x.line_message_id] = x; if (x.fb_message_id) m[x.fb_message_id] = x; }); return m; }, [msgs]);
  // กดที่กล่องอ้างอิง → เลื่อนไปข้อความต้นทาง + ไฮไลต์ · ถ้ายังไม่โหลด (เก่ากว่าที่เปิดอยู่) → โหลดเพิ่ม
  function jumpToMsg(orig) {
    if (!orig) { if (moreOld) loadOlder(); return; }
    const el = document.getElementById("cmsg-" + orig.id);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("chat-hl"); setTimeout(() => el.classList.remove("chat-hl"), 1700); }
    else if (moreOld) loadOlder();
  }

  // ค้นข้อความในประวัติแชต — จอโหลดมาแค่ข้อความท้าย ๆ ของห้องที่เปิดอยู่ จึงต้องถามเซิร์ฟเวอร์
  // หน่วง 300ms กันยิง query ทุกตัวอักษร · ทิ้งผลที่กลับมาช้ากว่าคำค้นล่าสุด (กันผลเก่าทับผลใหม่)
  const [msgHits, setMsgHits] = React.useState({});
  const [searching, setSearching] = React.useState(false);
  React.useEffect(() => {
    const term = q.trim();
    if (isCm || term.length < 2) { setMsgHits({}); setSearching(false); return; }
    let dropped = false;
    setSearching(true);
    const t = setTimeout(() => {
      (isFb ? searchFbMessages(term) : searchLineMessages(term))   // ค้นข้อความในประวัติ — ตามช่อง (LINE/FB)
        .then((hits) => { if (!dropped) setMsgHits(hits || {}); })
        .catch(() => { if (!dropped) setMsgHits({}); })
        .finally(() => { if (!dropped) setSearching(false); });
    }, 300);
    return () => { dropped = true; clearTimeout(t); };
  }, [q, channel]);
  const shown = contacts.filter((c) =>
    (stageF === "all" || (c.stage || "new") === stageF)
    && (ownerF === "all" ? true : ownerF === "me" ? c.assigned_to === myId : ownerF === "none" ? !c.assigned_to : c.assigned_to === ownerF)
    // แท็บซัพ = เฉพาะผู้ติดต่อที่ติดป้ายซัพพลายเออร์ · แท็บ LINE ลูกค้า = ที่เหลือ (FB ไม่มีป้าย)
    && (isFb ? true : isSup ? c.kind === "supplier" : (c.kind || "customer") !== "supplier")
    // ชื่อ/ลูกค้าที่ผูก/ข้อความล่าสุด/เบอร์ — หรือเจอคำนี้ในประวัติแชตของห้องนั้น (ค้นจากเซิร์ฟเวอร์)
    && (matchText(q, c.display_name, c.customerName, c.last_message) || matchPhone(q, c.phone) || !!msgHits[c.line_user_id]))
    // ปักหมุดขึ้นบนสุดก่อน · แล้วห้องที่ยังไม่อ่าน · ที่เหลือเรียงตามข้อความล่าสุด
    .sort((a, b) => {
      const ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const au = (a.unread || 0) > 0 ? 1 : 0, bu = (b.unread || 0) > 0 ? 1 : 0;
      if (au !== bu) return bu - au;
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">แชต <span className="page-title-en">LINE OA</span></h1>
          <p className="page-sub">{contacts.length} ผู้ติดต่อ · คุยกับลูกค้า · เชื่อมกับ CRM</p></div>
        {botCfg !== null && (
          <button type="button" onClick={toggleBot}
            title={botCfg.ai_enabled
              ? "บอท AI กำลังตอบลูกค้าอัตโนมัติช่วงนอกเวลาทำการ — กดเพื่อปิด"
              : "กดเพื่อเปิดบอท AI ตอบลูกค้าอัตโนมัติช่วงนอกเวลาทำการ (ตั้งค่าละเอียดที่ ตั้งค่า → ตอบอัตโนมัติ)"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999,
              fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", transition: ".15s",
              border: "1px solid " + (botCfg.ai_enabled ? "#86efac" : "var(--line)"),
              background: botCfg.ai_enabled ? "#ecfdf5" : "var(--surface)",
              color: botCfg.ai_enabled ? "#0a6b3d" : "var(--ink-3)",
            }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: botCfg.ai_enabled ? "#16a34a" : "#cbd5e1", boxShadow: botCfg.ai_enabled ? "0 0 0 3px #bbf7d0" : "none" }} />
            🤖 บอท AI {botCfg.ai_enabled ? "เปิดอยู่" : "ปิดอยู่"}
          </button>
        )}
      </div>

      <div className={"chat-wrap" + (showThread ? " show-thread" : "") + (showInfo ? " show-info" : "")} style={{ position: "relative" }}>
        {/* คอมเมนต์ Facebook — overlay เต็มพื้นที่แชต (แยกจากระบบ contact เดิม) · กด "← แชต" กลับ */}
        {isCm && (
          <div style={{ position: "absolute", inset: 0, zIndex: 6, background: "#fff", display: "flex" }}>
            <FbComments flash={flash} onBack={() => setChannel("line")} />
          </div>
        )}
        {/* conversation list */}
        <div className="chat-list">
          <div className="chat-channel-tabs">
            <button className={"chat-ch" + (channel === "line" ? " on line" : "")} onClick={() => setChannel("line")}>
              LINE{tabUnread.line > 0 && <span className="chat-ch-cnt">{tabUnread.line > 99 ? "99+" : tabUnread.line}</span>}
            </button>
            <button className={"chat-ch" + (isFb ? " on fb" : "")} title="Facebook" onClick={() => setChannel("fb")}>
              FB{tabUnread.fb > 0 && <span className="chat-ch-cnt">{tabUnread.fb > 99 ? "99+" : tabUnread.fb}</span>}
            </button>
            <button className={"chat-ch" + (isCm ? " on fb" : "")} title="คอมเมนต์ใต้โพสต์ Facebook" onClick={() => setChannel("cm")}>
              💬 คอม
            </button>
            <button className={"chat-ch" + (isSup ? " on sup" : "")} title="แชตซัพพลายเออร์ (LINE เดียวกัน แยกกระดาน)" onClick={() => setChannel("sup")}>
              🏭 ซัพ{tabUnread.sup > 0 && <span className="chat-ch-cnt">{tabUnread.sup > 99 ? "99+" : tabUnread.sup}</span>}
            </button>
          </div>
          {isFb && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 8px" }}>
              <button className="btn-ghost sm" style={{ flex: "none", display: "inline-flex", width: "fit-content", fontSize: 12, padding: "4px 10px" }} disabled={fbRefreshing} onClick={refreshFbProfiles}
                title="ดึงชื่อ+รูปโปรไฟล์ผู้ติดต่อ Facebook เก่าที่ยังไม่ขึ้น">🔄 {fbRefreshing ? "กำลังรีเฟรช…" : "รีเฟรชโปรไฟล์"}</button>
              {fbMsg && <span style={{ fontSize: 11.5, color: fbMsg.ok ? "#16a34a" : "#dc2626", flex: "1 1 100%" }}>{fbMsg.t}</span>}
            </div>
          )}
          <div className="chat-search"><UIcon name="search" size={16} color="var(--ink-3)" />
            <input placeholder="ค้นหาผู้ติดต่อ / ลูกค้า / ข้อความในแชต" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chat-listfilter">
            <Combo className="inp" value={stageF} onChange={(e) => setStageF(e.target.value)}>
              <option value="all">ทุกสถานะ</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Combo>
            <Combo className="inp" value={ownerF} onChange={(e) => setOwnerF(e.target.value)} title="กรองตามผู้รับผิดชอบแชต">
              <option value="all">👥 ทุกผู้รับผิดชอบ</option>
              <option value="me">👤 ของฉัน</option>
              <option value="none">— ยังไม่มอบหมาย —</option>
              {ownerStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Combo>
          </div>
          <div className="chat-convos">
            {searching && <div className="empty" style={{ fontSize: 13 }}>กำลังค้นข้อความในแชต…</div>}
            {!searching && shown.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ไม่พบผู้ติดต่อตามเงื่อนไข{q.trim().length === 1 ? " — พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นข้อความในแชต" : ""}</div>}
            {shown.map((c) => {
              const sd = stageDef(c.stage);
              return (
              <button key={c.line_user_id} className={"chat-convo" + (sel === c.line_user_id ? " on" : "")} onClick={() => openContact(c)}>
                <div className="chat-av">{c.picture_url ? <img src={c.picture_url} alt="" /> : initial(c.display_name)}</div>
                <div className="chat-convo-body">
                  <div className="chat-convo-top"><b>{c.pinned ? "📌 " : ""}{c.display_name || (isFb ? "ผู้ใช้ Facebook" : "LINE User")}</b><span title={c.last_message_at ? new Date(c.last_message_at).toLocaleString("th-TH") : ""}>{fmtWhen(c.last_message_at)}</span></div>
                  {/* เจอคำค้นในประวัติแชต → โชว์ข้อความที่ตรงแทนข้อความล่าสุด จะได้รู้ว่าเจอเพราะอะไร */}
                  {msgHits[c.line_user_id]
                    ? <div className="chat-convo-last chat-convo-hit" title={msgHits[c.line_user_id].text || ""}>
                        <span className="chat-hit-tag">🔎 {msgHits[c.line_user_id].direction === "out" ? "เราตอบ" : "ลูกค้า"}</span>{" "}
                        {msgHits[c.line_user_id].text || ""}
                      </div>
                    : <div className="chat-convo-last">{c.last_message || "—"}</div>}
                  <div className="chat-convo-tags">
                    <span className="conv-stage" style={{ background: sd.color }}>{sd.label}</span>
                    {c.customerName && <span className="chat-link-chip">🔗 {c.customerName}</span>}
                    {c.assigned_to && staffMap[c.assigned_to] && <span className="conv-owner">👤 {staffMap[c.assigned_to]}</span>}
                  </div>
                </div>
                {c.unread > 0 && <span className="chat-unread">{c.unread}</span>}
              </button>
              );
            })}
          </div>
        </div>

        {/* thread */}
        <div className="chat-thread">
          {!selContact ? <div className="chat-empty">เลือกผู้ติดต่อทางซ้ายเพื่อดูบทสนทนา</div> : (
            <>
              <div className="chat-thread-head">
                <button className="chat-back" onClick={() => setShowThread(false)}><UIcon name="chevR" size={18} style={{ transform: "rotate(180deg)" }} /></button>
                <div className="chat-av sm">{selContact.picture_url ? <img src={selContact.picture_url} alt="" /> : initial(selContact.display_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="chat-thread-name">{selContact.pinned ? "📌 " : ""}{selContact.display_name || (isFb ? "ผู้ใช้ Facebook" : "LINE User")}
                    {canSend && <button className="chat-name-edit" title="เปลี่ยนชื่อลูกค้าในแชต" onClick={() => renameContact(selContact)}>✏️</button>}
                  </div>
                  <div className="chat-thread-sub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px" }}>
                    <span>{selContact.customerName ? `🔗 ${selContact.customerName}` : "ยังไม่เชื่อมลูกค้า"}</span>
                    {!isSup && <span className="conv-owner">👤 {(selContact.assigned_to && staffMap[selContact.assigned_to]) || "ยังไม่มีผู้รับผิดชอบ"}</span>}
                  </div>
                </div>
                {canSend && <button className={"chat-hd-btn" + (selContact.pinned ? " on" : "")} onClick={() => togglePin(selContact)} title={selContact.pinned ? "ยกเลิกปักหมุด" : "ปักหมุดแชตนี้ไว้ด้านบน"}>📌</button>}
                {canSend && onCreateTask && <button className="chat-info-toggle" onClick={() => onCreateTask(selContact.customer_id || null, selContact.customerName || selContact.display_name)} title="สร้างงานในกระดานสั่งงาน">✅</button>}
                <button className="chat-info-toggle" onClick={() => setShowInfo((s) => !s)} title="ข้อมูลลูกค้า"><UIcon name="building" size={18} /></button>
              </div>

              <div className="chat-msgs">
                {/* ห้องที่คุยกันยาว: แสดงล่าสุดก่อนเสมอ แล้วไล่ดูย้อนหลังทีละหน้า
                    (เดิมโหลดเรียงเก่า→ใหม่ พอเกิน 1000 ข้อความ ข้อความใหม่จะหายทั้งห้อง) */}
                {moreOld && (
                  <div style={{ textAlign: "center", padding: "6px 0" }}>
                    <button className="btn-ghost sm" onClick={loadOlder} disabled={loadingOld}>
                      {loadingOld ? "กำลังโหลด…" : "↑ โหลดข้อความเก่ากว่านี้"}
                    </button>
                  </div>
                )}
                {msgs.map((m, i) => {
                  const prev = msgs[i - 1];
                  const daySep = !prev || fmtDay(prev.created_at) !== fmtDay(m.created_at);
                  const out = m.direction === "out";
                  const coworker = out && m.sent_by && m.sent_by !== myId;
                  const cwColor = coworker ? (staffColor[m.sent_by] || "#0891b2") : null;
                  const senderName = m.sent_by ? (staffMap[m.sent_by] || "ทีมงาน") : "ส่งจากแอป";
                  return (
                    <React.Fragment key={m.id}>
                      {daySep && <div className="chat-daysep">{fmtDay(m.created_at)}</div>}
                      <div id={"cmsg-" + m.id} className={"chat-bubble " + (out ? "out" : "in") + (coworker ? " coworker" : "") + (m.type === "sticker" && m.image_url ? " sticker" : "")}
                        style={coworker ? { background: cwColor, borderColor: cwColor } : undefined}>
                        {out && m.sent_by && <span className="chat-sender">↳ {senderName}</span>}
                        {!out && m.sender_name && <span className="chat-sender" style={{ color: "#0891b2" }}>{m.sender_name}</span>}
                        {m.quoted_message_id && (() => {
                          const orig = byLineId[m.quoted_message_id];
                          return (
                            <div className="chat-quote" role="button" tabIndex={0} title="กดเพื่อไปที่ข้อความที่ตอบกลับ" style={{ cursor: "pointer" }}
                              onClick={() => jumpToMsg(orig)} onKeyDown={(e) => { if (e.key === "Enter") jumpToMsg(orig); }}>
                              <span className="chat-quote-who">↩ {orig ? (orig.direction === "out" ? (orig.sent_by && staffMap[orig.sent_by]) || "ทีมงาน" : (selContact?.display_name || "ลูกค้า")) : "ข้อความที่อ้างอิง"}</span>
                              <span className="chat-quote-text">{orig ? msgSnippet(orig) : "(กดเพื่อโหลดข้อความเก่า)"}</span>
                            </div>
                          );
                        })()}
                        {canSend && (isFb ? m.fb_message_id : m.line_message_id) &&
                          <button type="button" className="chat-reply-btn" title="ตอบกลับข้อความนี้" onClick={() => setReplyTo(m)}>↩</button>}
                        {m.type === "sticker" && m.image_url ? (
                          <img className="chat-sticker" src={m.image_url} alt="สติกเกอร์" loading="lazy" />
                        ) : m.image_url ? (
                          <span className="chat-media">
                            <a href={m.image_url} target="_blank" rel="noreferrer"><img className="chat-img" src={m.image_url} alt="" /></a>
                            <span className="chat-media-acts">
                              <a href={m.image_url} target="_blank" rel="noreferrer">เปิด</a>
                              <button type="button" onClick={() => dlFile(m.image_url, "")}>ดาวน์โหลด</button>
                              {!out && !isSup && !isCm && <button type="button" disabled={scanning} onClick={() => scanCoupon(m.image_url)}>{scanning ? "กำลังอ่าน…" : "🎟️ ตรวจคูปอง"}</button>}
                            </span>
                          </span>
                        ) : m.file_url ? (
                          <span className="chat-media">
                            <a className="chat-file" href={m.file_url} target="_blank" rel="noreferrer">📎 {m.file_name || m.text || "เปิดไฟล์"}</a>
                            <span className="chat-media-acts">
                              <a href={m.file_url} target="_blank" rel="noreferrer">เปิด</a>
                              <button type="button" onClick={() => dlFile(m.file_url, m.file_name)}>ดาวน์โหลด</button>
                            </span>
                          </span>
                        ) : <span>{linkify(m.text)}</span>}
                        <span className="chat-bubble-time" title={m.created_at ? new Date(m.created_at).toLocaleString("th-TH") : ""}>{fmtTime(m.created_at)}{out ? " · " + senderName : ""}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={endRef} />
              </div>

              {canSend ? (
                <div className="chat-composer">
                  <button type="button" className={"chat-tools-toggle" + (toolsOpen ? " open" : "")} onClick={toggleTools} title={toolsOpen ? "ซ่อนแถบเครื่องมือ เพิ่มพื้นที่แชต" : "แสดงเครื่องมือ & คำตอบสำเร็จรูป"}>
                    <span>{toolsOpen ? "▾ ซ่อนเครื่องมือ" : "▸ เครื่องมือ & คำตอบสำเร็จรูป"}</span>
                  </button>
                  {toolsOpen && <div className="chat-tools">
                    {selContact.kind === "supplier" && <button className="chat-tool primary" disabled={sending} title="เลือกใบสั่งซื้อ ส่งเป็นรูป/PDF เข้าแชตซัพ" onClick={openPoPicker}>🛒 ส่ง PO</button>}
                    {selContact.customer_id && <button className="chat-tool primary" onClick={openConfirm} disabled={sending}>🧾 ส่งคอนเฟิม</button>}
                    {selContact.customer_id && <button className="chat-tool" onClick={openRate} disabled={sending} title="ส่งลิงก์ให้ลูกค้าให้คะแนนความพอใจ (อ้างเลขใบงาน)">⭐ ขอคะแนน</button>}
                    {selContact.customer_id && <button className="chat-tool" onClick={openHo} disabled={sending} title="ส่งลิงก์ใบส่งมอบงานให้ลูกค้า">📄 ส่งใบส่งมอบ</button>}
                    <label className={"chat-tool" + (sending || uploading ? " disabled" : "")}>📷 รูป
                      <input type="file" accept="image/*" multiple hidden disabled={sending || uploading} onChange={onImage} />
                    </label>
                    <label className={"chat-tool" + (sending || uploading ? " disabled" : "")}>📎 ไฟล์
                      <input type="file" accept={ATTACH_ACCEPT} multiple hidden disabled={sending || uploading} onChange={onFile} />
                    </label>
                    <button className={"chat-tool" + (emojiOpen ? " primary" : "")} disabled={sending} onClick={() => { setEmojiOpen((o) => !o); setStickerOpen(false); }}>😀 อีโมจิ</button>
                    {!isFb && <button className={"chat-tool" + (stickerOpen ? " primary" : "")} disabled={sending} onClick={() => { setStickerOpen((o) => !o); setEmojiOpen(false); }}>😊 สติกเกอร์</button>}
                    {!isFb && <button className={"chat-tool" + (qrbOpen || qrButtons.length ? " primary" : "")} disabled={sending} title="เพิ่มปุ่มให้ลูกค้ากดตอบ (LINE) — แนบกับข้อความถัดไป" onClick={() => setQrbOpen((o) => !o)}>🔘 ปุ่มลูกค้า{qrButtons.length ? ` (${qrButtons.length})` : ""}</button>}
                    {selContact.kind !== "supplier" && <button className="chat-tool" disabled={sending} onClick={openAcPicker}>❄️ ส่งแอร์</button>}
                    {quickReplies.map((qr) => {
                      const label = qr.title || qr.text;
                      const nImg = (qr.images || []).length;
                      return (
                        <button key={qr.id} className="chat-qr" title={qr.text + (nImg ? ` (+${nImg} รูป)` : "")} onClick={() => insertQr(qr)}>
                          {nImg ? "🖼 " : ""}{label.length > 22 ? label.slice(0, 22) + "…" : label}
                        </button>
                      );
                    })}
                    <button className="chat-tool ghost" onClick={() => setQrManage(true)}>✏️ จัดการคำตอบ</button>
                  </div>}
                  {stickerOpen && (
                    <div className="chat-sticker-box">
                      <div className="chat-sticker-tabs">
                        {STICKER_SETS.map((set, i) => (
                          <button key={set.pkg} className={"chat-sticker-tab" + (stickerSet === i ? " on" : "")} onClick={() => setStickerSet(i)}>{set.name}</button>
                        ))}
                      </div>
                      <div className="chat-stickers">
                        {(STICKER_SETS[stickerSet]?.ids || []).map((id) => (
                          <button key={id} className="chat-sticker-pick" disabled={sending} onClick={() => sendSticker({ pkg: STICKER_SETS[stickerSet].pkg, id })} title="ส่งสติกเกอร์">
                            <img src={stickerThumb(id)} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {emojiOpen && (
                    <div className="chat-sticker-box">
                      <div className="chat-stickers" style={{ fontSize: 22 }}>
                        {["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😅", "🙂", "😉", "😎", "🤔", "😴", "😢", "😭", "😡", "👍", "🙏", "👌", "👏", "🙌", "💪", "👋", "✅", "❤️", "🔥", "⭐", "🎉", "💯", "📞", "📍", "🚗", "🚚", "📦", "❄️", "☎️"].map((em) => (
                          <button key={em} className="chat-sticker-pick" style={{ fontSize: 22 }} onClick={() => setText((t) => t + em)} title="ใส่อีโมจิ">{em}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!isFb && qrbOpen && (
                    <div className="chat-sticker-box" style={{ padding: 10 }}>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6, fontWeight: 700 }}>🔘 ปุ่มให้ลูกค้ากด (สูงสุด 13) — กดแล้วส่งข้อความนั้นกลับมา · แนบกับข้อความที่พิมพ์</div>
                      {qrButtons.map((b, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5, alignItems: "center" }}>
                          <input className="inp" style={{ width: 130, flex: "none", fontSize: 12.5 }} maxLength={20} placeholder="ป้ายปุ่ม (≤20)" value={b.label} onChange={(e) => setQrButtons((s) => s.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                          <input className="inp" style={{ flex: 1, fontSize: 12.5 }} placeholder="ข้อความที่ลูกค้าจะส่งกลับเมื่อกด" value={b.text} onChange={(e) => setQrButtons((s) => s.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
                          <button className="chat-reply-cancel" title="ลบปุ่มนี้" onClick={() => setQrButtons((s) => s.filter((_, j) => j !== i))}>✕</button>
                        </div>
                      ))}
                      {qrButtons.length < 13 && <button className="btn-ghost sm" onClick={() => setQrButtons((s) => [...s, { label: "", text: "" }])}>+ เพิ่มปุ่ม</button>}
                    </div>
                  )}
                  {(pending.length > 0 || uploading) && (
                    <div className="chat-reply-bar" style={{ alignItems: "flex-start" }}>
                      <span className="chat-reply-icon">📎</span>
                      <div className="chat-reply-info">
                        <b>แนบไว้ {pending.length} รายการ — ตรวจแล้วกด “ส่ง”{uploading ? " · กำลังอัปโหลด…" : ""}</b>
                        <span className="qr-imgrow">
                          {pending.map((a, i) => (
                            <span className="qr-imgchip" key={a.url + i} title={a.name || ""}>
                              {a.type === "image" ? <img src={a.url} alt="" /> : <span style={{ fontSize: 11, padding: "0 7px", display: "inline-flex", alignItems: "center", height: "100%", whiteSpace: "nowrap" }}>📄 {(a.name || "ไฟล์").slice(0, 12)}</span>}
                              <button title="เอาออก" onClick={() => setPending((s) => s.filter((_, j) => j !== i))}>✕</button>
                            </span>
                          ))}
                        </span>
                      </div>
                      {pending.length > 0 && <button className="chat-reply-cancel" title="ล้างที่แนบทั้งหมด" onClick={() => setPending([])}>✕</button>}
                    </div>
                  )}
                  {replyTo && (
                    <div className="chat-reply-bar">
                      <span className="chat-reply-icon">↩</span>
                      <div className="chat-reply-info">
                        <b>ตอบกลับ {replyTo.direction === "out" ? "ข้อความของทีม" : (selContact?.display_name || "ลูกค้า")}</b>
                        <span>{msgSnippet(replyTo)}</span>
                      </div>
                      <button className="chat-reply-cancel" title="ยกเลิกการตอบกลับ" onClick={() => setReplyTo(null)}>✕</button>
                    </div>
                  )}
                  {qrPendImgs.length > 0 && (
                    <div className="chat-reply-bar">
                      <span className="chat-reply-icon">🖼</span>
                      <div className="chat-reply-info">
                        <b>รูปแนบ {qrPendImgs.length} รูป — ส่งพร้อมข้อความ</b>
                        <span className="qr-imgrow">
                          {qrPendImgs.map((u, i) => (
                            <span className="qr-imgchip" key={u}>
                              <img src={u} alt="" />
                              <button title="เอารูปนี้ออก" onClick={() => setQrPendImgs((s) => s.filter((_, j) => j !== i))}>✕</button>
                            </span>
                          ))}
                        </span>
                      </div>
                      <button className="chat-reply-cancel" title="ยกเลิกรูปแนบทั้งหมด" onClick={() => setQrPendImgs([])}>✕</button>
                    </div>
                  )}
                  <div className="chat-compose">
                    <textarea className="inp chat-input" rows={4} value={text} placeholder={sending ? "กำลังส่ง…" : (replyTo ? "พิมพ์คำตอบ…" : "พิมพ์ข้อความ… (Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่)")}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                    <button className="btn-primary" disabled={sending || uploading || (!text.trim() && !qrPendImgs.length && !pending.length)} onClick={send}>{sending ? "…" : uploading ? "…" : "ส่ง"}</button>
                  </div>
                </div>
              ) : <div className="chat-readonly">ดูได้อย่างเดียว — เฉพาะฝ่ายออฟฟิศตอบกลับได้</div>}
            </>
          )}
        </div>

        {/* right info panel: customer details + job history (from the customer card) */}
        {selContact && (() => {
          const cust = custs.find((c) => String(c.id) === String(selContact.customer_id));
          const phone = cust?.contacts?.[0]?.phone;
          const shownDocs = infoDocs.filter((e) => (infoDocF === "all" || e.type === infoDocF) && (infoSiteF === "all" || e.site_id === infoSiteF));
          const dcount = (t) => infoDocs.filter((e) => e.type === t).length;
          const sites = cust?.sites || [];
          const scountBySite = (siteId) => infoDocs.filter((e) => e.site_id === siteId).length;
          return (
            <div className={"chat-info" + (showInfo ? " open" : "")}>
              <div className="ci-head"><span>{selContact.kind === "supplier" ? "ข้อมูลซัพพลายเออร์" : "ข้อมูลลูกค้า"}</span>
                <button className="ci-close" onClick={() => setShowInfo(false)}><UIcon name="x" size={16} /></button></div>
              <div className="ci-body">
                {/* ── ซัพพลายเออร์: ผูกทะเบียนผู้ขาย / ย้ายกระดาน (เฉพาะแชต LINE) ── */}
                {!isFb && canSend && (selContact.kind === "supplier" ? (
                  <div className="ci-crm" style={{ marginBottom: 10 }}>
                    <label className="ci-field"><span>🏭 ผูกกับทะเบียนผู้ขาย</span>
                      <Combo className="inp" value={selContact.supplier_id || ""} onChange={(e) => setSupplierLink(e.target.value || null)}>
                        <option value="">— ยังไม่ผูกผู้ขาย —</option>
                        {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </Combo>
                    </label>
                    {selContact.supplier_id && (() => { const sp = sups.find((s) => String(s.id) === String(selContact.supplier_id)); return sp ? (
                      <div className="jo-dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
                        {sp.contacts?.[0]?.phone && <div>📞 {sp.contacts[0].phone}</div>}
                        {sp.address && <div>📍 {sp.address}</div>}
                      </div>
                    ) : null; })()}
                    <button className="btn-ghost sm" style={{ marginTop: 6 }} onClick={moveToCustomer}>↩ ย้ายกลับกระดานลูกค้า</button>
                  </div>
                ) : (
                  <button className="btn-ghost sm" style={{ marginBottom: 10, width: "100%", justifyContent: "center" }}
                    title="แชตนี้เป็นซัพพลายเออร์ — แยกไปกระดาน 🏭 ไม่ปนกับลูกค้า" onClick={moveToSupplier}>🏭 ย้ายไปกระดานซัพพลายเออร์</button>
                ))}
                <div className="ci-queue">
                  <button className="ci-queue-head" onClick={() => setShowQueue((v) => !v)}>
                    <span>🗓 คิวช่าง · ตารางว่าง</span>
                    <UIcon name={showQueue ? "chevD" : "chevR"} size={15} />
                  </button>
                  {showQueue && <TeamQueuePanel jobs={jobs || []} teams={teams} />}
                </div>
                <div className="ci-crm">
                  <label className="ci-field"><span>สถานะลูกค้า (เฟส)</span>
                    {canSend
                      ? <Combo className="inp" value={selContact.stage || "new"} onChange={(e) => changeStage(e.target.value)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Combo>
                      : <span className="conv-stage" style={{ background: stageDef(selContact.stage).color, alignSelf: "flex-start" }}>{stageDef(selContact.stage).label}</span>}
                  </label>
                  <label className="ci-field"><span>ผู้รับผิดชอบ</span>
                    {canSend
                      ? <Combo className="inp" value={selContact.assigned_to || ""} onChange={(e) => changeOwner(e.target.value || null)}><option value="">— ยังไม่มอบหมาย —</option>{ownerStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Combo>
                      : <span style={{ fontSize: 13 }}>{(selContact.assigned_to && staffMap[selContact.assigned_to]) || "—"}</span>}
                  </label>
                  <label className="ci-field"><span>📝 โน้ต (ภายใน · ลูกค้าไม่เห็น)</span>
                    {canSend
                      ? <textarea key={"note" + sel} className="inp" rows={2} style={{ resize: "vertical" }} defaultValue={selContact.note || ""} placeholder="โน้ตเกี่ยวกับลูกค้ารายนี้… (บันทึกเมื่อคลิกออกจากช่อง)" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (selContact.note || "")) changeNote(v); }} />
                      : (selContact.note ? <span style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{selContact.note}</span> : <span style={{ fontSize: 13, color: "var(--ink-3)" }}>—</span>)}
                  </label>
                  <div className="ci-field"><span>🏷️ แท็ก/ป้าย</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                      {(selContact.tags || []).map((tg) => (
                        <span key={tg} className="chat-tag">{tg}{canSend && <button title="เอาแท็กนี้ออก" onClick={() => changeTags((selContact.tags || []).filter((x) => x !== tg))}>✕</button>}</span>
                      ))}
                      {canSend && <input className="inp" style={{ width: 116, flex: "none", padding: "5px 9px", fontSize: 12 }} placeholder="+ เพิ่มแท็ก" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = e.target.value.trim(); if (v && !(selContact.tags || []).includes(v)) changeTags([...(selContact.tags || []), v]); e.target.value = ""; } }} />}
                    </div>
                  </div>
                  {/* บอทมีเบรกอยู่แล้ว (เงียบอัตโนมัติหลังพนักงานตอบ) แต่บางห้องอยากปิดถาวรระหว่างปิดการขาย */}
                  {canSend && (
                    <label className="ci-field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                      title="ปิดบอท AI เฉพาะห้องนี้ — ใช้ตอนกำลังคุยปิดการขายเอง ไม่อยากให้บอทแทรก">
                      <input type="checkbox" checked={!!selContact.ai_off} onChange={(e) => toggleAiOff(e.target.checked)} />
                      <span style={{ fontSize: 13 }}>🤖 ปิดบอท AI ห้องนี้</span>
                    </label>
                  )}
                </div>
                {cust ? (<>
                  {!isFb && (selContact.custIds || []).length > 0 && (
                    <div className="ci-custlinks">
                      {(selContact.custIds || []).map((id) => {
                        const c2 = custs.find((x) => String(x.id) === String(id)); if (!c2) return null;
                        const active = String(id) === String(selContact.customer_id);
                        return (
                          <span key={id} className={"ci-custchip" + (active ? " on" : "")} title={active ? "กำลังดูรายนี้" : "คลิกเพื่อสลับมาดูรายนี้"}
                            onClick={() => !active && switchCust(id)}>
                            {c2.name}
                            {canSend && <button className="ci-custchip-x" onClick={(e) => { e.stopPropagation(); removeCust(id); }} aria-label="เอาออก">×</button>}
                          </span>
                        );
                      })}
                      {canSend && (
                        <Combo className="inp ci-custadd" value="" onChange={(e) => e.target.value && addCust(e.target.value)}>
                          <option value="">+ เพิ่มลูกค้า</option>
                          {custs.filter((c) => !(selContact.custIds || []).some((id) => String(id) === String(c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Combo>
                      )}
                    </div>
                  )}
                  <div className="ci-cust-name">{cust.name}</div>
                  <div className="ci-cust-sub"><b className="cust-code">{custCode(cust.id)}</b>
                    <span className={"job-badge " + (cust.vat ? "b-blue" : "b-grey")}>{cust.vat ? "VAT" : "ไม่ VAT"}</span></div>
                  {phone && <div className="ci-row">📞 <a href={`tel:${phone}`}>{phone}</a></div>}
                  {cust.address && <div className="ci-row">📍 <span>{cust.address}</span></div>}
                  {cust.tax_id && <div className="ci-row">🧾 <span>{cust.tax_id}</span></div>}
                  {cust.email && <div className="ci-row">✉️ <a href={`mailto:${cust.email}`}>{cust.email}</a></div>}
                  {cust.sites?.length > 0 && <div className="ci-row">🏠 <span>{cust.sites.length} ไซต์งาน</span></div>}
                  {canSend && <div className="ci-actions">
                    <button className="btn-primary sm" onClick={() => editCustomer(cust)}><UIcon name="edit" size={13} color="#fff" /> แก้ไขข้อมูล</button>
                    <button className="btn-ghost sm" onClick={() => onCreateSurvey && onCreateSurvey(cust.id)}>📋 สร้างใบงาน</button>
                    <button className="btn-ghost sm" onClick={() => onCreateTask && onCreateTask(cust.id, cust.name)}>✅ สร้างงานติดตาม</button>
                    <button className="btn-ghost sm" onClick={() => onCreateBoq && onCreateBoq(cust.id)}>📋 สร้าง BOQ</button>
                    <button className="btn-ghost sm" onClick={() => onGoCustomers && onGoCustomers(cust.name)}>เปิดหน้าลูกค้า</button>
                    <button className="btn-ghost sm" onClick={() => onLink(null)}>ยกเลิกการเชื่อม</button>
                  </div>}
                  <div className="ci-sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span>ประวัติเอกสาร &amp; งาน ({infoDocs.length})</span>
                    {canSend && (multiSel
                      ? <button className="btn-ghost sm" style={{ padding: "2px 8px", fontSize: 11 }} onClick={exitMulti}>✕ ยกเลิกเลือก</button>
                      : <button className="btn-ghost sm" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setMultiSel(true)} title="เลือกส่งหลายเอกสารพร้อมกัน">☑️ เลือกหลายใบ</button>)}
                  </div>
                  <div className="cd-docfilter">
                    {DOC_FILTERS.map(([v, l]) => (
                      <button key={v} className={"cat-chip" + (infoDocF === v ? " on" : "")} onClick={() => setInfoDocF(v)}
                        style={infoDocF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}{v !== "all" && dcount(v) ? ` (${dcount(v)})` : ""}</button>
                    ))}
                  </div>
                  {sites.length > 0 && (
                    <div className="cd-docfilter">
                      <button className={"cat-chip" + (infoSiteF === "all" ? " on" : "")} onClick={() => setInfoSiteF("all")}
                        style={infoSiteF === "all" ? { background: "#0891b2", color: "#fff", borderColor: "#0891b2" } : {}}>ทุกไซต์งาน</button>
                      {sites.map((s) => {
                        const cnt = scountBySite(s.id);
                        return (
                          <button key={s.id} className={"cat-chip" + (infoSiteF === s.id ? " on" : "")} onClick={() => setInfoSiteF(s.id)}
                            style={infoSiteF === s.id ? { background: "#0891b2", color: "#fff", borderColor: "#0891b2" } : {}}>{s.site_name || "ไซต์"}{cnt > 0 ? ` (${cnt})` : ""}</button>
                        );
                      })}
                    </div>
                  )}
                  {loadingInfoDocs && <div className="cd-empty">กำลังโหลด…</div>}
                  {!loadingInfoDocs && shownDocs.length === 0 && <div className="cd-empty">— ไม่มีรายการ —</div>}
                  <div className="cd-timeline">
                    {shownDocs.map((e) => {
                      const st = stOf(e);
                      const dateTxt = e.type === "job" && e.scheduled_at ? scheduleLabel(e)
                        : (e.date ? new Date(e.date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—");
                      const sendable = ["quote", "invoice", "receipt", "creditnote", "debitnote", "billing"].includes(e.type);
                      const picked = multiSel && selDocs.has(docKey(e));
                      const selectable = multiSel && sendable && canSend;
                      return (
                        <div className={"cd-job" + (picked ? " picked" : "")} key={e.type + e.no}>
                          <span className={"cd-job-dot " + st[1]} />
                          <div className="cd-job-body" role="button" tabIndex={0} onClick={() => (selectable ? toggleSelDoc(e) : openPeek(e.type, e.no))}>
                            <div className="cd-job-top"><b>{selectable ? <span style={{ marginRight: 6 }}>{picked ? "☑️" : "⬜"}</span> : null}<span className={"doc-tag dl-" + e.type}>{TYPE_LABEL[e.type]}</span>{e.title || ""}</b><span className={"job-badge " + st[1]}>{st[0]}</span></div>
                            <div className="cd-job-meta">🗓 {dateTxt}{e.teamName ? ` · 👷 ${e.teamName}` : ""}{e.amount != null ? ` · ${fmtBaht(e.amount)}` : ""}</div>
                            <div className="cd-job-no-row">
                              <span className="cd-job-no">{e.no}{multiSel && sendable ? "" : " · ดูรายละเอียด ›"}{multiSel && !sendable ? " · (ส่งไม่ได้)" : ""}</span>
                              {sendable && canSend && !multiSel && <button className="cd-send" disabled={!!capJob} onClick={(ev) => { ev.stopPropagation(); setSendMenuFor(e); }}>📤 ส่ง</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {multiSel && (
                    <div className="cd-batchbar">
                      <div style={{ fontWeight: 700, fontSize: 13 }}>เลือกแล้ว {selDocs.size} ใบ</div>
                      {selDocs.size > 0 ? (() => {
                        const chosen = shownDocs.filter((e) => selDocs.has(docKey(e)));
                        return (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button className="btn-ghost sm" disabled={!!batch} onClick={() => batchSend(chosen, "image")}>🖼 รูปเข้าแชต</button>
                            <button className="btn-ghost sm" disabled={!!batch} onClick={() => batchSend(chosen, "pdf")}>📄 ลิงก์ PDF</button>
                            {selCust?.email && <button className="btn-primary sm" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} disabled={!!batch} onClick={() => batchSend(chosen, "email")}>📧 อีเมลรวม {selDocs.size} ใบ</button>}
                          </div>
                        );
                      })() : <span className="jo-dim" style={{ fontSize: 12 }}>แตะเอกสารที่ต้องการส่ง</span>}
                      {batch && <span className="jo-dim" style={{ fontSize: 12 }}>⏳ กำลังเตรียม {batch.i + 1}/{batch.entries.length}…</span>}
                    </div>
                  )}
                </>) : (
                  <div className="ci-unlinked">
                    <div className="ci-unlinked-msg">แชตนี้ยังไม่ได้เชื่อมกับลูกค้า</div>
                    {canSend && <>
                      <label className="ci-field"><span>เชื่อมกับลูกค้าที่มีอยู่</span>
                        <Combo className="inp" value="" onChange={(e) => e.target.value && onLink(e.target.value)}>
                          <option value="">— เลือกลูกค้า —</option>
                          {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Combo>
                      </label>
                      <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={addNewCustomer}>
                        <UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่มลูกค้าใหม่จาก LINE นี้
                      </button>
                    </>}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
      {fbRaw && (
        <div className="modal-overlay" onClick={() => setFbRaw(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw" }}>
            <div className="modal-head"><div className="modal-title">ผลรีเฟรชโปรไฟล์ FB (ส่งให้ผู้ดูแลระบบ)</div>
              <button className="modal-x" onClick={() => setFbRaw(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <pre style={{ margin: 0, padding: "10px 12px", fontSize: 12, lineHeight: 1.4, background: "#0f172a", color: "#e2e8f0", borderRadius: 8, maxHeight: "56vh", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", userSelect: "text" }}>{fbRaw}</pre>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => { try { navigator.clipboard.writeText(fbRaw); flash("คัดลอกแล้ว — วางส่งให้ผู้ดูแลได้"); } catch { /* ignore */ } }}>📋 คัดลอก</button>
              <button className="btn-primary" onClick={() => setFbRaw(null)}>ปิด</button>
            </div>
          </div>
        </div>
      )}
      {jobPicker && (
        <div className="modal-overlay" onClick={() => setJobPicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
            <div className="modal-head"><div className="modal-title">เลือกใบงานเพื่อส่งคอนเฟิม</div>
              <button className="drawer-close" onClick={() => setJobPicker(null)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <p className="page-sub" style={{ marginBottom: 10 }}>เลือกใบงานของลูกค้ารายนี้ — ระบบจะใส่ข้อความคอนเฟิมในกล่องพิมพ์ ให้ตรวจทานก่อนกดส่ง</p>
              {jobPicker.map((en, i) => {
                const jo = en.jo; const v = en.visit;
                const sched = v && v.scheduled_at ? scheduleLabel({ scheduled_at: v.scheduled_at, end_date: v.end_date, slot: v.slot }) : (jo.scheduled_at ? scheduleLabel(jo) : "ยังไม่นัด");
                const vst = v && (JOB_ST_LABEL[v.status] || null);
                return (
                  <div key={jo.job_no + "#" + i} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                    <button className="confirm-job" style={{ flex: 1 }} onClick={() => pickJob(en)}>
                      <div><b>{jo.job_no}</b>{en.rounds > 1 ? <span style={{ color: "#7c3aed", fontWeight: 700 }}> · รอบ {en.round}/{en.rounds}</span> : ""} · {jo.title || "งานติดตั้ง/บริการ"}</div>
                      <small>🗓 {sched}{vst ? ` · ${vst}` : ""} · 💰 {fmtBaht(jo.quoteGrand || 0)} · แตะเพื่อใส่ในแชต</small>
                    </button>
                    {selCust?.email && <button className="btn-ghost sm" style={{ flex: "none", color: "#7c3aed", borderColor: "#ddd6fe", background: "#f5f3ff" }} title={`ส่งคอนเฟิมทางอีเมลถึง ${selCust.email}`} onClick={() => emailConfirm(en)}>📧</button>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {ratePicker && (
        <div className="modal-overlay" onClick={() => setRatePicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
            <div className="modal-head"><div className="modal-title">เลือกใบงานเพื่อขอคะแนน</div>
              <button className="drawer-close" onClick={() => setRatePicker(null)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <p className="page-sub" style={{ marginBottom: 10 }}>เลือกใบงานที่จะขอให้ลูกค้าให้คะแนน — ระบบจะใส่ลิงก์ในกล่องพิมพ์ ให้ตรวจก่อนกดส่ง</p>
              {ratePicker.map((jo) => (
                <button key={jo.job_no} className="confirm-job" onClick={() => pickRate(jo)}>
                  <div><b>{jo.job_no}</b> · {jo.title || "งานติดตั้ง/บริการ"}{jo.cust_rating ? ` · ★ ${jo.cust_rating}` : ""}</div>
                  <small>🗓 {jo.scheduled_at ? scheduleLabel(jo) : "ยังไม่นัด"}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {hoPicker && (
        <div className="modal-overlay" onClick={() => setHoPicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
            <div className="modal-head"><div className="modal-title">เลือกใบส่งมอบงานเพื่อส่งให้ลูกค้า</div>
              <button className="drawer-close" onClick={() => setHoPicker(null)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <p className="page-sub" style={{ marginBottom: 10 }}>เลือกใบส่งมอบ — ระบบจะใส่ลิงก์เอกสารในกล่องพิมพ์ ให้ตรวจก่อนกดส่ง</p>
              {hoPicker.map((h) => (
                <button key={h.id} className="confirm-job" onClick={() => pickHo(h)}>
                  <div><b>{h.ho_no || "ใบส่งมอบ"}</b>{h.job_no ? ` · ${h.job_no}` : ""}</div>
                  <small>🗓 {h.doc_date || (h.created_at || "").slice(0, 10)}{h.cust_rating ? ` · ★ ${h.cust_rating}` : ""}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {qrManage && (
        <div className="modal-overlay" onClick={() => setQrManage(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
            <div className="modal-head"><div className="modal-title">ข้อความตอบกลับสำเร็จรูป</div>
              <button className="drawer-close" onClick={() => setQrManage(false)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <div className="qr-add">
                <input className="inp" value={newQrTitle} onChange={(e) => setNewQrTitle(e.target.value)} placeholder="ชื่อหัวข้อ (ไว้ค้นหา/แสดงบนปุ่ม) เช่น โอนเงิน กสิกร" />
                <textarea className="inp" rows={2} value={newQr} onChange={(e) => setNewQr(e.target.value)} placeholder="พิมพ์ข้อความที่ใช้บ่อย…" />
                <div className="qr-imgrow">
                  {newQrImgs.map((u, i) => (
                    <span className="qr-imgchip" key={u + i}>
                      <img src={u} alt="" />
                      <button title="เอารูปนี้ออก" onClick={() => setNewQrImgs((s) => s.filter((_, j) => j !== i))}>✕</button>
                    </span>
                  ))}
                  <label className="qr-imgadd" title="แนบรูป — ส่งพร้อมข้อความเมื่อกดใช้">
                    {qrUploading ? "กำลังอัปโหลด…" : "🖼 + รูปแนบ"}
                    <input type="file" accept="image/*" multiple hidden disabled={qrUploading} onChange={(e) => onQrImgs(e, "new")} />
                  </label>
                </div>
                <button className="btn-primary" disabled={!newQr.trim() || qrUploading} onClick={addQr}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
              </div>
              {quickReplies.length > 5 && (
                <input className="inp" style={{ marginBottom: 10 }} value={qrSearch} onChange={(e) => setQrSearch(e.target.value)} placeholder="🔍 ค้นหาหัวข้อ / ข้อความ…" />
              )}
              <div className="qr-list">
                {quickReplies.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ยังไม่มีข้อความบันทึกไว้</div>}
                {quickReplies.map((qr, i) => {
                  if (qrSearch.trim() && !matchText(qrSearch, qr.title, qr.text)) return null;
                  if (qrEdit && qrEdit.id === qr.id) return (
                    <div className="qr-item editing" key={qr.id}>
                      <div className="qr-edit-fields">
                        <input className="inp" value={qrEdit.title} onChange={(e) => setQrEdit({ ...qrEdit, title: e.target.value })} placeholder="ชื่อหัวข้อ" />
                        <textarea className="inp" rows={2} value={qrEdit.text} onChange={(e) => setQrEdit({ ...qrEdit, text: e.target.value })} placeholder="ข้อความ" />
                        <div className="qr-imgrow">
                          {(qrEdit.images || []).map((u, i) => (
                            <span className="qr-imgchip" key={u + i}>
                              <img src={u} alt="" />
                              <button title="เอารูปนี้ออก" onClick={() => setQrEdit((s) => ({ ...s, images: s.images.filter((_, j) => j !== i) }))}>✕</button>
                            </span>
                          ))}
                          <label className="qr-imgadd" title="แนบรูป — ส่งพร้อมข้อความเมื่อกดใช้">
                            {qrUploading ? "กำลังอัปโหลด…" : "🖼 + รูปแนบ"}
                            <input type="file" accept="image/*" multiple hidden disabled={qrUploading} onChange={(e) => onQrImgs(e, "edit")} />
                          </label>
                        </div>
                        <div className="qr-edit-acts">
                          <button className="btn-ghost sm" onClick={() => setQrEdit(null)}>ยกเลิก</button>
                          <button className="btn-primary sm" disabled={!qrEdit.text.trim() || qrUploading} onClick={saveQrEdit}>บันทึก</button>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <div className="qr-item" key={qr.id}>
                      <div className="qr-reorder">
                        <button className="qr-move" disabled={i === 0 || !!qrSearch.trim()} title="เลื่อนขึ้น" onClick={() => moveQr(qr.id, -1)}>▲</button>
                        <button className="qr-move" disabled={i === quickReplies.length - 1 || !!qrSearch.trim()} title="เลื่อนลง" onClick={() => moveQr(qr.id, 1)}>▼</button>
                      </div>
                      <div className="qr-body">
                        {qr.title && <div className="qr-title">{qr.title}</div>}
                        <div className="qr-text">{qr.text}</div>
                        {(qr.images || []).length > 0 && (
                          <div className="qr-imgrow">
                            {qr.images.map((u, i) => <img key={u + i} src={u} alt="" onClick={() => window.open(u, "_blank")} style={{ cursor: "pointer" }} />)}
                          </div>
                        )}
                      </div>
                      <button className="qr-del" title="แก้ไข" onClick={() => setQrEdit({ id: qr.id, title: qr.title || "", text: qr.text, images: qr.images || [] })}><UIcon name="edit" size={15} /></button>
                      <button className="qr-del" title="ลบ" onClick={() => delQr(qr.id)}><UIcon name="trash" size={15} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {poPicker && (
        <div className="modal-overlay" onClick={() => setPoPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
            <div className="modal-head"><div className="modal-title">🛒 ส่งใบสั่งซื้อเข้าแชต</div>
              <button className="drawer-close" onClick={() => setPoPicker(false)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <PoPickerBody pos={pos} sups={sups} contact={selContact}
                onPick={(p) => { setPoPicker(false); setSendMenuFor({ type: "po", no: p.po_no, title: p.supplier || "" }); }} />
            </div>
          </div>
        </div>
      )}
      {sendMenuFor && (
        <div className="modal-overlay" onClick={() => setSendMenuFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
            <div className="modal-head"><div className="modal-title">ส่งเอกสารให้ลูกค้า</div>
              <button className="drawer-close" onClick={() => setSendMenuFor(null)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <p className="page-sub" style={{ marginBottom: 12 }}><span className={"doc-tag dl-" + sendMenuFor.type}>{TYPE_LABEL[sendMenuFor.type]}</span><b>{sendMenuFor.no}</b>{sendMenuFor.title ? ` · ${sendMenuFor.title}` : ""} — ส่งเป็น?</p>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginBottom: 6 }}>ประทับเอกสาร</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {[["none", "ไม่ประทับ"], ["orig", "ต้นฉบับ"], ["copy", "สำเนา"], ["both", "ทั้งคู่"]].map(([v, l]) => (
                  <button key={v} className={"cat-chip" + (copyMode === v ? " on" : "")} style={copyMode === v ? { background: "#1f74e0", color: "#fff", borderColor: "#1f74e0" } : {}} onClick={() => setCopyMode(v)}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginBottom: 6 }}>💬 ส่งเข้าแชต ({isFb ? "Facebook" : "LINE"})</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => startSend(sendMenuFor, "image")}><UIcon name="camera" size={15} color="#fff" /> รูปภาพ</button>
                <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => startSend(sendMenuFor, "pdf")}><UIcon name="clipboard" size={15} /> ไฟล์ PDF</button>
              </div>
              <div style={{ borderTop: "1px solid var(--line)", margin: "14px 0 10px" }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginBottom: 6 }}>📧 ส่งทางอีเมล (แนบ PDF)</div>
              {selCust?.email
                ? <button className="btn-ghost" style={{ width: "100%", justifyContent: "center", color: "#7c3aed", borderColor: "#ddd6fe", background: "#f5f3ff" }} onClick={() => startSend(sendMenuFor, "email")}>📧 ส่งอีเมลถึง {selCust.email}</button>
                : <div className="jo-dim" style={{ fontSize: 12.5 }}>ลูกค้ารายนี้ยังไม่มีอีเมลในระบบ — เพิ่มอีเมลในข้อมูลลูกค้าก่อน</div>}
            </div>
          </div>
        </div>
      )}
      {acPicker && (() => {
        const nm = (s) => String(s || "").trim().toLowerCase();
        // ตัวกรองชุดเดียวกับคลังสินค้า: แอร์ = ยี่ห้อ→รุ่น→BTU→ประเภท · บริการ = หมวด+ประเภทแอร์+BTU · วัสดุ = หมวด
        const pool = acItems.filter((i) => i.kind === acKind);
        const uniqVals = (arr) => [...new Map(arr.filter(Boolean).map((v) => [nm(v), v])).values()].sort((a, b) => a.localeCompare(b, "th"));
        const brands = uniqVals(pool.map((i) => i.brand));
        const seriesOpts = uniqVals(pool.filter((i) => acBrand === "all" || eqi(i.brand, acBrand)).map((i) => i.series));
        const types = uniqVals((pool.some((i) => i.ac_type) ? pool : acItems.filter((i) => i.kind === "ac")).map((i) => i.ac_type));
        const btus = [...new Set(pool.flatMap((i) => [i.btu, i.btu_min, i.btu_max]).filter(Boolean).map(Number))].sort((a, b) => a - b);
        const cats = [...new Map(pool.filter((i) => i.cat).map((i) => [i.cat, i.catName || i.cat])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "th"));
        // BTU: บริการมีช่วง btu_min–btu_max → เลือกขนาดที่อยู่ในช่วงก็เจอ
        const btuOk = (it) => acBtu === "all" || ((it.btu_min != null || it.btu_max != null)
          ? Number(acBtu) >= Number(it.btu_min ?? it.btu_max) && Number(acBtu) <= Number(it.btu_max ?? it.btu_min)
          : String(it.btu) === String(acBtu));
        const list = acItems.filter((it) =>
          it.kind === acKind
          && matchText(acSearch, it.th, it.en, it.code, it.brand, it.ac_type, String(it.btu || ""), it.catName, it.series)
          && (acKind !== "ac" || acBrand === "all" || eqi(it.brand, acBrand))
          && (acKind !== "ac" || acSeries === "all" || eqi(it.series, acSeries))
          && (acKind === "ac" || acCat === "all" || it.cat === acCat)
          && btuOk(it)
          && (acType === "all" || eqi(it.ac_type, acType)));
        return (
        <div className="modal-overlay" onClick={() => setAcPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 600 }}>
            <div className="modal-head"><div className="modal-title">เลือกสินค้า/บริการ ส่งให้ลูกค้า</div>
              <button className="drawer-close" onClick={() => setAcPicker(false)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {[["ac", "❄️ แอร์"], ["service", "🛠️ บริการ"], ["material", "🔩 วัสดุ"]].map(([v, l]) => (
                  <button key={v} type="button" className={"cat-chip" + (acKind === v ? " on" : "")}
                    style={acKind === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}
                    onClick={() => { setAcKind(v); setAcBrand("all"); setAcSeries("all"); setAcBtu("all"); setAcType("all"); setAcCat("all"); }}>{l}</button>
                ))}
              </div>
              <input className="inp" style={{ marginBottom: 8 }} value={acSearch} onChange={(e) => setAcSearch(e.target.value)} placeholder="🔍 ค้นหา ยี่ห้อ / รุ่น / BTU" />
              <div className="ac-filters">
                {acKind === "ac" && (
                  <Combo className="inp" value={acBrand} onChange={(e) => { setAcBrand(e.target.value); setAcSeries("all"); }}>
                    <option value="all">ทุกยี่ห้อ</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Combo>
                )}
                {acKind === "ac" && (
                  <Combo className="inp" value={acSeries} onChange={(e) => setAcSeries(e.target.value)}>
                    <option value="all">ทุกรุ่น</option>{seriesOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Combo>
                )}
                {acKind !== "ac" && (
                  <Combo className="inp" value={acCat} onChange={(e) => setAcCat(e.target.value)}>
                    <option value="all">ทุกหมวด</option>{cats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </Combo>
                )}
                {acKind !== "material" && (
                  <Combo className="inp" value={acBtu} onChange={(e) => setAcBtu(e.target.value)}>
                    <option value="all">ทุกขนาด BTU</option>{btus.map((b) => <option key={b} value={b}>{fmtNum(b)} BTU</option>)}
                  </Combo>
                )}
                {acKind !== "material" && (
                  <Combo className="inp" value={acType} onChange={(e) => setAcType(e.target.value)}>
                    <option value="all">ทุกประเภทแอร์</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Combo>
                )}
              </div>
              <div className="ac-result-cnt">พบ {list.length} รายการ</div>
              <div className="ac-picklist">
                {acItems.length === 0 && <div className="empty" style={{ fontSize: 13 }}>กำลังโหลด… (หรือยังไม่มีรายการ)</div>}
                {acItems.length > 0 && list.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ไม่พบรายการตามเงื่อนไข</div>}
                {list.slice(0, 100).map((it) => (
                  <button key={it.code} className="ac-pickrow" disabled={sending} onClick={() => addChatItem(it)} title="กดเพื่อเพิ่มเข้ารายการที่จะส่ง">
                    <MaterialThumb mat={it} size={54} radius={10} />
                    <div className="ac-pickinfo">
                      <div className="ac-pickname">{it.th}</div>
                      <div className="ac-pickspec">{(it.kind === "ac"
                        ? [it.brand, it.series, it.ac_type, it.btu ? `${fmtNum(it.btu)} BTU` : null]
                        : [it.catName, it.ac_type, it.btu_min != null ? `${fmtNum(it.btu_min)}–${fmtNum(it.btu_max ?? it.btu_min)} BTU` : it.btu ? `${fmtNum(it.btu)} BTU` : null]
                      ).filter(Boolean).join(" · ") || it.code}</div>
                    </div>
                    <div className="ac-pickprice">{fmtBaht(it.salePrice)}<span>{(() => { const inCart = chatCart.find((x) => x.code === it.code); return inCart ? `✓ ใส่แล้ว ${inCart.qty}` : "+ เพิ่ม"; })()}</span></div>
                  </button>
                ))}
              </div>

              {/* รายการที่จะส่ง — รวมยอด + เลือกวิธีชำระครั้งเดียว แล้วส่งเป็นข้อความสรุปใบเดียว */}
              {chatCart.length > 0 && (() => {
                const pm = CHAT_PAY.find((x) => x.v === chatPay) || CHAT_PAY[0];
                const total = chatCart.reduce((a, x) => a + chatAdj(x.price, pm) * x.qty, 0);
                return (
                  <div style={{ borderTop: "2px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>📋 รายการที่จะส่ง ({chatCart.length})</div>
                    {chatCart.map((x) => (
                      <div key={x.code} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                        <button type="button" className="btn-ghost xs" onClick={() => chatQty(x.code, -1)}>−</button>
                        <b style={{ minWidth: 18, textAlign: "center" }}>{x.qty}</b>
                        <button type="button" className="btn-ghost xs" onClick={() => chatQty(x.code, 1)}>+</button>
                        <b style={{ width: 92, textAlign: "right" }}>{fmtBaht(chatAdj(x.price, pm) * x.qty)}</b>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                      {CHAT_PAY.map((p) => (
                        <button key={p.v} type="button" className={"cat-chip" + (chatPay === p.v ? " on" : "")}
                          style={chatPay === p.v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}
                          onClick={() => setChatPay(p.v)}>{p.l}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, fontSize: 15.5, fontWeight: 800 }}>รวม {fmtBaht(total)}
                        {chatPay === "card_inst10" && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}> · ≈{fmtBaht(Math.ceil(total / 10))}/เดือน</span>}
                      </div>
                      <button type="button" className="btn-ghost sm" onClick={() => setChatCart([])}>ล้าง</button>
                      <button type="button" className="btn-primary sm" disabled={uploading} onClick={sendChatCart}>{uploading ? "กำลังแนบ…" : "📎 แนบเข้าแชต (ตรวจก่อนส่ง)"}</button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        );
      })()}
      {custForm && <CustomerFormModal initial={custForm.initial} onClose={() => setCustForm(null)} onSaved={onCustSaved} />}
      {capJob && <DocCapture type={capJob.type} no={capJob.no}
        onError={(m) => { flash("เตรียมเอกสารไม่สำเร็จ: " + m, true); setCapJob(null); }}
        onReady={async (node) => {
          try {
            const copies = capJob.copies && capJob.copies.length ? capJob.copies : [""];   // ["" ] | ["ต้นฉบับ"] | ["ต้นฉบับ","สำเนา"]
            const suffix = (cl) => (cl ? ` (${cl})` : "");
            if (capJob.mode === "email") {
              // ส่งเอกสารทางอีเมล → แนบไฟล์ PDF จริง (ต้นฉบับ/สำเนา ตามที่เลือก) แล้วเปิดหน้าคอมโพส
              const atts = [];
              for (const cl of copies) atts.push(...(await captureDocForEmail(node, "pdf", capJob.label + suffix(cl), cl)));
              setEmailDoc({
                to: capJob.email || "", label: capJob.label, attachments: atts, quoteNo: capJob.type === "quote" ? capJob.no : null,
                subject: `${capJob.label} — AMC AIR`,
                body: `เรียน ${capJob.custName || "ลูกค้า"}\n\nบริษัท AMC AIR ขอนำส่ง${capJob.label} ตามไฟล์แนบครับ หากมีข้อสงสัยหรือต้องการข้อมูลเพิ่มเติม ติดต่อกลับได้เลยครับ\n\nขอบคุณที่ใช้บริการครับ\nAMC AIR`,
              });
              flash("เตรียมเอกสารเสร็จ — ตรวจอีเมลแล้วกดส่ง ✓");
            } else {
              const imgs = [], texts = [];
              for (const cl of copies) {
                const { attachments, text: txt } = await captureDocToStage(node, capJob.mode, capJob.label + suffix(cl), cl);
                if (attachments.length) imgs.push(...attachments);
                if (txt) texts.push(txt);
              }
              if (imgs.length) setPending((s) => [...s, ...imgs]);
              if (texts.length) setText((cur) => (cur ? cur + "\n" : "") + texts.join("\n"));
              if (capJob.type === "quote") markQuoteSent(capJob.no);   // ส่งใบเสนอเข้าแชต → ร่างเป็น "ส่งแล้ว" อัตโนมัติ
              flash("แนบเอกสารไว้ในช่องแชตแล้ว — ตรวจแล้วกด “ส่ง” ✓");
            }
          }
          catch (e) { flash("เตรียมเอกสารไม่สำเร็จ: " + (e.message || e), true); }
          setCapJob(null);
        }} />}
      {batch && batch.i < batch.entries.length && (
        <DocCapture key={"batch" + batch.i} type={batch.entries[batch.i].type} no={batch.entries[batch.i].no}
          onError={(m) => { flash("เตรียมเอกสารไม่สำเร็จ: " + m, true); setBatch(null); }}
          onReady={batchOnReady} />
      )}
      {emailDoc && <EmailDocModal draft={emailDoc} company={company} onClose={() => setEmailDoc(null)} flash={flash} />}
      {peekEl}
      {toast && <div className={"chat-toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

/* ─── หัวจดหมายอีเมล (โลโก้ + ข้อมูลบริษัท + ช่องทางติดต่อ) ─── */
function buildEmailHtml(co, bodyText) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bodyHtml = esc(bodyText).replace(/\n/g, "<br>");
  const contacts = [];
  if (co?.phone) contacts.push(`📞 โทร. ${esc(co.phone)}`);
  if (co?.line_id) contacts.push(`💬 LINE: ${esc(co.line_id)}`);
  if (co?.website) contacts.push(`🌐 ${esc(co.website)}`);
  if (co?.email) contacts.push(`✉️ ${esc(co.email)}`);
  const logo = co?.logo_url ? `<img src="${esc(co.logo_url)}" alt="" style="height:56px;max-width:200px;object-fit:contain" />` : "";
  return `<div style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:4px">
    <div style="border-bottom:3px solid #1d4ed8;padding-bottom:14px;margin-bottom:18px">
      ${logo ? `<div style="margin-bottom:8px">${logo}</div>` : ""}
      <div style="font-size:19px;font-weight:700;color:#1d4ed8">${esc(co?.name || "AMC AIR")}</div>
      ${co?.address ? `<div style="font-size:12.5px;color:#6b7280;margin-top:4px;line-height:1.5">${esc(co.address)}</div>` : ""}
      ${co?.tax_id ? `<div style="font-size:12.5px;color:#6b7280">เลขประจำตัวผู้เสียภาษี ${esc(co.tax_id)}</div>` : ""}
    </div>
    <div style="font-size:14px;line-height:1.75">${bodyHtml}</div>
    <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:14px;font-size:12.5px;color:#4b5563">
      <div style="font-weight:700;color:#111827;margin-bottom:6px">ช่องทางติดต่อ</div>
      ${contacts.map((c) => `<div style="margin:2px 0">${c}</div>`).join("")}
    </div>
  </div>`;
}

/* ─── คอมโพสอีเมลส่งเอกสารขายให้ลูกค้า (แนบ PDF) ─── */
function EmailDocModal({ draft, company, onClose, flash }) {
  const [to, setTo] = React.useState(draft.to || "");
  const [subject, setSubject] = React.useState(draft.subject || "");
  const [body, setBody] = React.useState(draft.body || "");
  const [sending, setSending] = React.useState(false);
  const atts = draft.attachments || [];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  async function send() {
    if (!validEmail) return flash("อีเมลผู้รับไม่ถูกต้อง", true);
    if (!atts.length && !body.trim()) return flash("ต้องมีข้อความหรือไฟล์แนบอย่างน้อยอย่างหนึ่ง", true);
    setSending(true);
    try {
      await sendEmail({ to: to.trim(), subject: subject.trim() || draft.label, text: body, html: buildEmailHtml(company, body), attachments: atts });
      if (draft.quoteNo) markQuoteSent(draft.quoteNo);   // อีเมลใบเสนอราคาสำเร็จ → ร่างเป็น "ส่งแล้ว" อัตโนมัติ
      flash(`ส่งอีเมล ${draft.label} ให้ลูกค้าแล้ว ✓`);
      onClose();
    } catch (e) { flash("ส่งอีเมลไม่สำเร็จ: " + (e.message || e), true); setSending(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><div className="modal-title">📧 ส่งอีเมล · {draft.label}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "72vh", overflowY: "auto" }}>
          <label className="fld"><span>ถึง (อีเมลลูกค้า)</span>
            <input className="inp" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@email.com" />
          </label>
          <label className="fld"><span>หัวข้อ</span>
            <input className="inp" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="fld"><span>ข้อความ</span>
            <textarea className="inp" rows={7} style={{ resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          {atts.length > 0 && <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
            📎 ไฟล์แนบ: {atts.map((a) => a.name).join(", ")}
          </div>}
          <div className="jo-dim" style={{ fontSize: 11.5 }}>* ส่งจากอีเมลบริษัท (info@amcair.net) · ระบบจะใส่ <b>หัวจดหมาย (โลโก้ + ข้อมูลบริษัท + ช่องทางติดต่อ)</b> ให้อัตโนมัติ · ลูกค้าเห็นอีเมลนี้จริง</div>
        </div>
        <div className="modal-foot" style={{ gap: 8 }}>
          <button className="btn-ghost" onClick={onClose} disabled={sending}>ยกเลิก</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={sending || !validEmail || (!atts.length && !body.trim())} onClick={send}>
            {sending ? "กำลังส่ง…" : "📧 ส่งอีเมล"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── เลือกใบสั่งซื้อ ส่งเข้าแชตซัพพลายเออร์ — ผูกผู้ขายไว้จะกรองให้ก่อน ─── */
function PoPickerBody({ pos, sups, contact, onPick }) {
  const linked = contact?.supplier_id ? sups.find((s) => String(s.id) === String(contact.supplier_id)) : null;
  const [q, setQ] = React.useState(linked?.name || "");
  const list = pos.filter((p) => p.status !== "cancelled" && matchText(q, p.po_no, p.supplier, p.quote_no)).slice(0, 60);
  return (
    <>
      <input className="inp" placeholder="ค้นหาเลข PO / ชื่อผู้ขาย / ใบเสนอราคา…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }}>
        {pos.length === 0 && <div className="empty sm">กำลังโหลดใบสั่งซื้อ…</div>}
        {pos.length > 0 && list.length === 0 && <div className="empty sm">ไม่พบใบสั่งซื้อ{q ? " — ลองล้างคำค้น" : ""}</div>}
        {list.map((p) => (
          <button key={p.po_no} className="confirm-job" onClick={() => onPick(p)}>
            <div><b>{p.po_no}</b> · {p.supplier || "—"}{p.vat ? " · VAT" : ""}</div>
            <small>{p.issue_date ? new Date(p.issue_date).toLocaleDateString("th-TH") : ""} · {(p.items || []).length} รายการ · รวม {fmtBaht(p.total)}</small>
          </button>
        ))}
      </div>
    </>
  );
}
