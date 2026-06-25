import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listLineContacts, listLineMessages, sendLineMessage, sendLineImage, sendLineFile, sendLineSticker, uploadChatImage, linkLineContact, markLineRead, listFbContacts, listFbMessages, sendFbMessage, sendFbImage, linkFbContact, markFbRead, listCustomers, listCustomerDocs, listJobOrders, listTeams, listMaterialsLite, listQuickReplies, addQuickReply, updateQuickReply, saveQuickReplyOrder, deleteQuickReply, setLineStage, setLineOwner, listStaff, getProfile } from "../lib/api";
import TeamQueuePanel from "./TeamQueuePanel";
import { TYPE_LABEL, DOC_FILTERS, stOf } from "../lib/docmeta";
import { supabase } from "../lib/supabase";
import { buildOrderConfirm } from "../lib/confirmText";
import { scheduleLabel } from "../lib/schedule";
import { fmtBaht, fmtNum, custCode, matchText, matchPhone, eqi, ATTACH_ACCEPT } from "../lib/format";
import { can } from "../lib/permissions";
import { QR_MY } from "../lib/i18n";
import { UIcon, MaterialThumb } from "../icons";
import CustomerFormModal from "./CustomerFormModal";
import DocCapture from "./DocCapture";
import { sendDocFromNode } from "../lib/sendDoc";

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
const fmtDay = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "";
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
  const canSend = can(role, "chat", "edit");
  const [contacts, setContacts] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [sel, setSel] = React.useState(null);          // selected line_user_id
  const [msgs, setMsgs] = React.useState([]);
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
  const [showThread, setShowThread] = React.useState(false); // mobile pane toggle
  const [toast, setToast] = React.useState(null);
  const [quickReplies, setQuickReplies] = React.useState([]);
  const [qrManage, setQrManage] = React.useState(false);
  const [newQr, setNewQr] = React.useState("");
  const [newQrTitle, setNewQrTitle] = React.useState("");
  const [qrEdit, setQrEdit] = React.useState(null); // { id, title, text } while editing one reply
  const [qrSearch, setQrSearch] = React.useState("");
  const [jobs, setJobs] = React.useState(null);       // cached job orders (loaded on first "ส่งคอนเฟิม")
  const [teams, setTeams] = React.useState([]);       // permanent teams for the queue panel
  const [showQueue, setShowQueue] = React.useState(false); // คิวช่าง section toggle in the info panel
  const [jobPicker, setJobPicker] = React.useState(null);
  const [sendMenuFor, setSendMenuFor] = React.useState(null); // doc entry whose "ส่งเป็น รูป/PDF" popup is open
  const [capJob, setCapJob] = React.useState(null); // { type, no, mode, to, label } → render off-screen + capture + send
  const startSend = (e, mode) => { setSendMenuFor(null); setCapJob({ type: e.type, no: e.no, mode, to: sel, label: `${TYPE_LABEL[e.type]} ${e.no}` }); flash("กำลังเตรียมเอกสาร…"); };
  const [infoDocs, setInfoDocs] = React.useState([]);
  const [loadingInfoDocs, setLoadingInfoDocs] = React.useState(false);
  const [infoDocF, setInfoDocF] = React.useState("all");
  const [infoSiteF, setInfoSiteF] = React.useState("all");
  const [showInfo, setShowInfo] = React.useState(false); // mobile info-panel toggle
  const [custForm, setCustForm] = React.useState(null);  // { initial, link } → opens the customer form modal
  const [staff, setStaff] = React.useState([]);
  const [myId, setMyId] = React.useState(null);
  const [stageF, setStageF] = React.useState("all");     // list filter by stage
  const [mineOnly, setMineOnly] = React.useState(false); // list filter: assigned to me
  const [myQr, setMyQr] = React.useState(false);         // show Burmese quick-reply chips
  const [replyTo, setReplyTo] = React.useState(null);    // message being replied-to (quote)
  const [channel, setChannel] = React.useState("line"); // "line" | "fb" — unified inbox switch
  const isFb = channel === "fb";
  // channel-aware data calls (FB returns the same shape, psid aliased to line_user_id)
  const chListContacts = () => (isFb ? listFbContacts() : listLineContacts());
  const chListMessages = (id) => (isFb ? listFbMessages(id) : listLineMessages(id));
  const chMarkRead = (id) => (isFb ? markFbRead(id) : markLineRead(id));
  const chSendText = (id, t) => (isFb ? sendFbMessage(id, t) : sendLineMessage(id, t));
  const chSendImage = (id, url) => (isFb ? sendFbImage(id, url) : sendLineImage(id, url));
  const chLink = (id, cid) => (isFb ? linkFbContact(id, cid) : linkLineContact(id, cid));
  const selRef = React.useRef(null);
  const endRef = React.useRef(null);
  const pendingOpenRef = React.useRef(null); // line_user_id/psid to open once contacts (re)load after a channel switch

  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  async function loadContacts() { try { setContacts(await chListContacts()); } catch (e) { flash("โหลดแชตไม่สำเร็จ: " + (e.message || e), true); } }

  async function loadQr() { try { setQuickReplies(await listQuickReplies()); } catch { /* ignore */ } }
  React.useEffect(() => {
    loadContacts(); loadQr();
    listCustomers().then(setCusts).catch(() => {});
    listStaff().then(setStaff).catch(() => {});
    getProfile().then((p) => setMyId(p?.id || null)).catch(() => {});
  }, []);
  const staffMap = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const staffColor = React.useMemo(() => Object.fromEntries(staff.map((s, i) => [s.id, STAFF_COLORS[i % STAFF_COLORS.length]])), [staff]);
  async function changeStage(s) { if (isFb) return; try { await setLineStage(sel, s); await loadContacts(); } catch (e) { flash("เปลี่ยนสถานะไม่สำเร็จ: " + (e.message || e), true); } }
  async function changeOwner(uid) { if (isFb) return; try { await setLineOwner(sel, uid || null); await loadContacts(); } catch (e) { flash("มอบหมายไม่สำเร็จ: " + (e.message || e), true); } }
  React.useEffect(() => { selRef.current = sel; }, [sel]);
  // teams + jobs for the คิวช่าง panel (so we can answer queue questions instantly)
  React.useEffect(() => { listTeams().then(setTeams).catch(() => {}); listJobOrders().then(setJobs).catch(() => {}); }, []);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  // reload + reset when switching channel (LINE ↔ FB)
  React.useEffect(() => { setSel(null); setMsgs([]); setShowThread(false); loadContacts(); }, [channel]);

  // realtime: new messages + contact changes (subscribes to the active channel's tables)
  React.useEffect(() => {
    const msgTable = isFb ? "fb_messages" : "line_messages";
    const contactTable = isFb ? "fb_contacts" : "line_contacts";
    const ch = supabase.channel(channel + "-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: msgTable }, (p) => {
        const row = p.new; const uid = row.line_user_id || row.psid;
        loadContacts();
        if (uid === selRef.current) { setMsgs((m) => m.some((x) => x.id === row.id) ? m : [...m, { ...row, line_user_id: uid }]); chMarkRead(uid); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: contactTable }, () => loadContacts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
    try { setMsgs(await chListMessages(c.line_user_id)); if (c.unread) { chMarkRead(c.line_user_id); loadContacts(); } }
    catch (e) { flash("โหลดข้อความไม่สำเร็จ", true); }
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
      const target = inLine ? { ch: "line", c: inLine } : inFb ? { ch: "fb", c: inFb } : null;
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
    const t = text.trim(); if (!t || !sel || sending) return;
    setSending(true);
    try {
      if (isFb) { await sendFbMessage(sel, t); setMsgs(await chListMessages(sel)); }            // FB: no quote-reply; refresh
      else { await sendLineMessage(sel, t, replyTo ? { quoteToken: replyTo.quote_token, quotedMessageId: replyTo.line_message_id } : undefined); } // LINE appends via realtime
      setText(""); setReplyTo(null);
    }
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setSending(false);
  }
  async function onLink(cid) {
    try { await chLink(sel, cid); await loadContacts(); flash(cid ? "เชื่อมลูกค้าแล้ว ✓" : "ยกเลิกการเชื่อมแล้ว"); }
    catch (e) { flash("เชื่อมไม่สำเร็จ: " + (e.message || e), true); }
  }

  // send an image: upload to storage → push the public URL to LINE
  async function onImage(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel || sending) return;
    setSending(true);
    try { const url = await uploadChatImage(f); await chSendImage(sel, url); if (isFb) setMsgs(await chListMessages(sel)); }
    catch (ex) { flash("ส่งรูปไม่สำเร็จ: " + (ex.message || ex), true); }
    setSending(false);
  }
  // send a document/file: upload → push a clickable link to the customer on LINE
  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel || sending) return;
    setSending(true);
    try { const url = await uploadChatImage(f); await sendLineFile(sel, url, f.name); }
    catch (ex) { flash("ส่งไฟล์ไม่สำเร็จ: " + (ex.message || ex), true); }
    setSending(false);
  }
  // pick an AC from the catalog → send its details + price (and photo if any) to the customer
  async function openAcPicker() {
    setAcPicker(true);
    if (!acItems.length) { try { const m = await listMaterialsLite(); setAcItems(m.filter((x) => x.kind === "ac")); } catch { /* ignore */ } }
  }
  async function sendProduct(it) {
    if (!sel || sending) return;
    setAcPicker(false); setSending(true);
    try {
      const spec = [it.brand, it.ac_type, it.btu ? `${fmtNum(it.btu)} BTU` : null].filter(Boolean).join(" · ");
      const txt = `❄️ ${it.th}${spec ? `\n${spec}` : ""}${it.description ? `\n${it.description}` : ""}\n💰 ราคา ${fmtBaht(it.salePrice)}`;
      if (it.photoUrl) await chSendImage(sel, it.photoUrl);
      await chSendText(sel, txt);
      if (isFb) setMsgs(await chListMessages(sel));
    } catch (ex) { flash("ส่งรายการแอร์ไม่สำเร็จ: " + (ex.message || ex), true); }
    setSending(false);
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
      setJobPicker(mine);
    } catch (e) { flash("โหลดใบงานไม่สำเร็จ: " + (e.message || e), true); }
  }
  function pickJob(jo) { setText(buildOrderConfirm(jo)); setJobPicker(null); flash("ใส่ข้อความคอนเฟิมแล้ว — ตรวจทานแล้วกดส่ง"); }

  const insertQr = (t) => setText((cur) => cur ? cur + (cur.endsWith("\n") ? "" : "\n") + t : t);
  async function addQr() { const t = newQr.trim(); if (!t) return; try { await addQuickReply(t, newQrTitle); setNewQr(""); setNewQrTitle(""); await loadQr(); } catch (e) { flash("เพิ่มไม่สำเร็จ: " + (e.message || e), true); } }
  async function saveQrEdit() { if (!qrEdit || !qrEdit.text.trim()) return; try { await updateQuickReply(qrEdit.id, { title: qrEdit.title, text: qrEdit.text }); setQrEdit(null); await loadQr(); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); } }
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
  // resolve a quoted message by its LINE id (to render the referenced message inside a reply)
  const byLineId = React.useMemo(() => { const m = {}; msgs.forEach((x) => { if (x.line_message_id) m[x.line_message_id] = x; }); return m; }, [msgs]);
  const shown = contacts.filter((c) =>
    (stageF === "all" || (c.stage || "new") === stageF)
    && (!mineOnly || c.assigned_to === myId)
    && (matchText(q, c.display_name, c.customerName, c.last_message) || matchPhone(q, c.phone)));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">แชต <span className="page-title-en">LINE OA</span></h1>
          <p className="page-sub">{contacts.length} ผู้ติดต่อ · คุยกับลูกค้า · เชื่อมกับ CRM</p></div>
      </div>

      <div className={"chat-wrap" + (showThread ? " show-thread" : "") + (showInfo ? " show-info" : "")}>
        {/* conversation list */}
        <div className="chat-list">
          <div className="chat-channel-tabs">
            <button className={"chat-ch" + (!isFb ? " on line" : "")} onClick={() => setChannel("line")}>LINE</button>
            <button className={"chat-ch" + (isFb ? " on fb" : "")} onClick={() => setChannel("fb")}>Facebook</button>
          </div>
          <div className="chat-search"><UIcon name="search" size={16} color="var(--ink-3)" />
            <input placeholder="ค้นหาผู้ติดต่อ / ลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chat-listfilter">
            <Combo className="inp" value={stageF} onChange={(e) => setStageF(e.target.value)}>
              <option value="all">ทุกสถานะ</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Combo>
            <button className={"chat-mine" + (mineOnly ? " on" : "")} onClick={() => setMineOnly((v) => !v)} title="เฉพาะที่ฉันรับผิดชอบ">👤 ของฉัน</button>
          </div>
          <div className="chat-convos">
            {shown.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ไม่พบผู้ติดต่อตามเงื่อนไข</div>}
            {shown.map((c) => {
              const sd = stageDef(c.stage);
              return (
              <button key={c.line_user_id} className={"chat-convo" + (sel === c.line_user_id ? " on" : "")} onClick={() => openContact(c)}>
                <div className="chat-av">{c.picture_url ? <img src={c.picture_url} alt="" /> : initial(c.display_name)}</div>
                <div className="chat-convo-body">
                  <div className="chat-convo-top"><b>{c.display_name || (isFb ? "ผู้ใช้ Facebook" : "LINE User")}</b><span>{fmtTime(c.last_message_at)}</span></div>
                  <div className="chat-convo-last">{c.last_message || "—"}</div>
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
                  <div className="chat-thread-name">{selContact.display_name || (isFb ? "ผู้ใช้ Facebook" : "LINE User")}</div>
                  <div className="chat-thread-sub">{selContact.customerName ? `🔗 ${selContact.customerName}` : "ยังไม่เชื่อมลูกค้า"}</div>
                </div>
                {canSend && onCreateTask && <button className="chat-info-toggle" onClick={() => onCreateTask(selContact.customer_id || null, selContact.customerName || selContact.display_name)} title="สร้างงานในกระดานสั่งงาน">✅</button>}
                <button className="chat-info-toggle" onClick={() => setShowInfo((s) => !s)} title="ข้อมูลลูกค้า"><UIcon name="building" size={18} /></button>
              </div>

              <div className="chat-msgs">
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
                      <div className={"chat-bubble " + (out ? "out" : "in") + (coworker ? " coworker" : "") + (m.type === "sticker" && m.image_url ? " sticker" : "")}
                        style={coworker ? { background: cwColor, borderColor: cwColor } : undefined}>
                        {coworker && <span className="chat-sender">{senderName}</span>}
                        {m.quoted_message_id && (() => {
                          const orig = byLineId[m.quoted_message_id];
                          return (
                            <div className="chat-quote">
                              <span className="chat-quote-who">{orig ? (orig.direction === "out" ? "ทีมงาน" : (selContact?.display_name || "ลูกค้า")) : "ข้อความที่อ้างอิง"}</span>
                              <span className="chat-quote-text">{orig ? msgSnippet(orig) : "(ข้อความเก่า)"}</span>
                            </div>
                          );
                        })()}
                        {canSend && !isFb && m.line_message_id &&
                          <button type="button" className="chat-reply-btn" title="ตอบกลับข้อความนี้" onClick={() => setReplyTo(m)}>↩</button>}
                        {m.type === "sticker" && m.image_url ? (
                          <img className="chat-sticker" src={m.image_url} alt="สติกเกอร์" loading="lazy" />
                        ) : m.image_url ? (
                          <span className="chat-media">
                            <a href={m.image_url} target="_blank" rel="noreferrer"><img className="chat-img" src={m.image_url} alt="" /></a>
                            <span className="chat-media-acts">
                              <a href={m.image_url} target="_blank" rel="noreferrer">เปิด</a>
                              <button type="button" onClick={() => dlFile(m.image_url, "")}>ดาวน์โหลด</button>
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
                        <span className="chat-bubble-time">{fmtTime(m.created_at)}{out ? " · " + senderName : ""}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={endRef} />
              </div>

              {canSend ? (
                <div className="chat-composer">
                  <div className="chat-tools">
                    {selContact.customer_id && <button className="chat-tool primary" onClick={openConfirm} disabled={sending}>🧾 ส่งคอนเฟิม</button>}
                    <label className={"chat-tool" + (sending ? " disabled" : "")}>📷 รูป
                      <input type="file" accept="image/*" hidden disabled={sending} onChange={onImage} />
                    </label>
                    {!isFb && <label className={"chat-tool" + (sending ? " disabled" : "")}>📎 ไฟล์
                      <input type="file" accept={ATTACH_ACCEPT} hidden disabled={sending} onChange={onFile} />
                    </label>}
                    {!isFb && <button className={"chat-tool" + (stickerOpen ? " primary" : "")} disabled={sending} onClick={() => setStickerOpen((o) => !o)}>😊 สติกเกอร์</button>}
                    <button className="chat-tool" disabled={sending} onClick={openAcPicker}>❄️ ส่งแอร์</button>
                    {quickReplies.map((qr) => {
                      const label = qr.title || qr.text;
                      return (
                        <button key={qr.id} className="chat-qr" title={qr.text} onClick={() => insertQr(qr.text)}>
                          {label.length > 22 ? label.slice(0, 22) + "…" : label}
                        </button>
                      );
                    })}
                    <button className={"chat-tool" + (myQr ? " primary" : "")} onClick={() => setMyQr((o) => !o)}>🇲🇲 พม่า</button>
                    <button className="chat-tool ghost" onClick={() => setQrManage(true)}>✏️ จัดการคำตอบ</button>
                  </div>
                  {myQr && (
                    <div className="chat-qr-my">
                      {QR_MY.map((qr, i) => (
                        <button key={i} className="chat-qr" title={qr.text} onClick={() => insertQr(qr.text)}>
                          <span className="chat-qr-th">{qr.title}</span> {qr.text.length > 20 ? qr.text.slice(0, 20) + "…" : qr.text}
                        </button>
                      ))}
                    </div>
                  )}
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
                  <div className="chat-compose">
                    <textarea className="inp chat-input" rows={4} value={text} placeholder={sending ? "กำลังส่ง…" : (replyTo ? "พิมพ์คำตอบ…" : "พิมพ์ข้อความ… (Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่)")}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                    <button className="btn-primary" disabled={sending || !text.trim()} onClick={send}>{sending ? "…" : "ส่ง"}</button>
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
              <div className="ci-head"><span>ข้อมูลลูกค้า</span>
                <button className="ci-close" onClick={() => setShowInfo(false)}><UIcon name="x" size={16} /></button></div>
              <div className="ci-body">
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
                      ? <Combo className="inp" value={selContact.assigned_to || ""} onChange={(e) => changeOwner(e.target.value || null)}><option value="">— ยังไม่มอบหมาย —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Combo>
                      : <span style={{ fontSize: 13 }}>{(selContact.assigned_to && staffMap[selContact.assigned_to]) || "—"}</span>}
                  </label>
                </div>
                {cust ? (<>
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
                  <div className="ci-sec">ประวัติเอกสาร &amp; งาน ({infoDocs.length})</div>
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
                      const sendable = ["quote", "invoice", "receipt"].includes(e.type);
                      return (
                        <div className="cd-job" key={e.type + e.no}>
                          <span className={"cd-job-dot " + st[1]} />
                          <div className="cd-job-body" role="button" tabIndex={0} onClick={() => onOpenDoc && onOpenDoc(e.type, e.no)}>
                            <div className="cd-job-top"><b><span className={"doc-tag dl-" + e.type}>{TYPE_LABEL[e.type]}</span>{e.title || ""}</b><span className={"job-badge " + st[1]}>{st[0]}</span></div>
                            <div className="cd-job-meta">🗓 {dateTxt}{e.teamName ? ` · 👷 ${e.teamName}` : ""}{e.amount != null ? ` · ${fmtBaht(e.amount)}` : ""}</div>
                            <div className="cd-job-no-row">
                              <span className="cd-job-no">{e.no} · ดูรายละเอียด ›</span>
                              {sendable && canSend && !isFb && <button className="cd-send" disabled={!!capJob} onClick={(ev) => { ev.stopPropagation(); setSendMenuFor(e); }}>📤 ส่ง</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
      {jobPicker && (
        <div className="modal-overlay" onClick={() => setJobPicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
            <div className="modal-head"><div className="modal-title">เลือกใบงานเพื่อส่งคอนเฟิม</div>
              <button className="drawer-close" onClick={() => setJobPicker(null)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <p className="page-sub" style={{ marginBottom: 10 }}>เลือกใบงานของลูกค้ารายนี้ — ระบบจะใส่ข้อความคอนเฟิมในกล่องพิมพ์ ให้ตรวจทานก่อนกดส่ง</p>
              {jobPicker.map((jo) => (
                <button key={jo.job_no} className="confirm-job" onClick={() => pickJob(jo)}>
                  <div><b>{jo.job_no}</b> · {jo.title || "งานติดตั้ง/บริการ"}</div>
                  <small>🗓 {jo.scheduled_at ? scheduleLabel(jo) : "ยังไม่นัด"} · 💰 {fmtBaht(jo.quoteGrand || 0)}</small>
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
                <button className="btn-primary" disabled={!newQr.trim()} onClick={addQr}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
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
                        <div className="qr-edit-acts">
                          <button className="btn-ghost sm" onClick={() => setQrEdit(null)}>ยกเลิก</button>
                          <button className="btn-primary sm" disabled={!qrEdit.text.trim()} onClick={saveQrEdit}>บันทึก</button>
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
                      </div>
                      <button className="qr-del" title="แก้ไข" onClick={() => setQrEdit({ id: qr.id, title: qr.title || "", text: qr.text })}><UIcon name="edit" size={15} /></button>
                      <button className="qr-del" title="ลบ" onClick={() => delQr(qr.id)}><UIcon name="trash" size={15} /></button>
                    </div>
                  );
                })}
              </div>
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
              <p className="page-sub" style={{ marginBottom: 14 }}><span className={"doc-tag dl-" + sendMenuFor.type}>{TYPE_LABEL[sendMenuFor.type]}</span><b>{sendMenuFor.no}</b>{sendMenuFor.title ? ` · ${sendMenuFor.title}` : ""} — ส่งเป็น?</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => startSend(sendMenuFor, "image")}><UIcon name="camera" size={15} color="#fff" /> รูปภาพ</button>
                <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => startSend(sendMenuFor, "pdf")}><UIcon name="clipboard" size={15} /> ไฟล์ PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {acPicker && (() => {
        const nm = (s) => String(s || "").trim().toLowerCase();
        const brands = [...new Map(acItems.filter((i) => i.brand).map((i) => [nm(i.brand), i.brand])).values()].sort((a, b) => a.localeCompare(b, "th"));
        const types = [...new Map(acItems.filter((i) => i.ac_type).map((i) => [nm(i.ac_type), i.ac_type])).values()].sort((a, b) => a.localeCompare(b, "th"));
        const btus = [...new Set(acItems.map((i) => i.btu).filter(Boolean).map(Number))].sort((a, b) => a - b);
        const list = acItems.filter((it) =>
          matchText(acSearch, it.th, it.en, it.code, it.brand, it.ac_type, String(it.btu || ""))
          && (acBrand === "all" || eqi(it.brand, acBrand))
          && (acBtu === "all" || String(it.btu) === String(acBtu))
          && (acType === "all" || eqi(it.ac_type, acType)));
        return (
        <div className="modal-overlay" onClick={() => setAcPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 600 }}>
            <div className="modal-head"><div className="modal-title">เลือกแอร์ส่งให้ลูกค้า</div>
              <button className="drawer-close" onClick={() => setAcPicker(false)}><UIcon name="x" size={20} /></button></div>
            <div className="modal-body">
              <input className="inp" style={{ marginBottom: 8 }} value={acSearch} onChange={(e) => setAcSearch(e.target.value)} placeholder="🔍 ค้นหา ยี่ห้อ / รุ่น / BTU" />
              <div className="ac-filters">
                <Combo className="inp" value={acBrand} onChange={(e) => setAcBrand(e.target.value)}>
                  <option value="all">ทุกยี่ห้อ</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </Combo>
                <Combo className="inp" value={acBtu} onChange={(e) => setAcBtu(e.target.value)}>
                  <option value="all">ทุกขนาด BTU</option>{btus.map((b) => <option key={b} value={b}>{fmtNum(b)} BTU</option>)}
                </Combo>
                <Combo className="inp" value={acType} onChange={(e) => setAcType(e.target.value)}>
                  <option value="all">ทุกประเภทแอร์</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}
                </Combo>
              </div>
              <div className="ac-result-cnt">พบ {list.length} รายการ</div>
              <div className="ac-picklist">
                {acItems.length === 0 && <div className="empty" style={{ fontSize: 13 }}>กำลังโหลด… (หรือยังไม่มีรายการแอร์)</div>}
                {acItems.length > 0 && list.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ไม่พบแอร์ตามเงื่อนไข</div>}
                {list.slice(0, 100).map((it) => (
                  <button key={it.code} className="ac-pickrow" disabled={sending} onClick={() => sendProduct(it)} title="ส่งให้ลูกค้า">
                    <MaterialThumb mat={it} size={54} radius={10} />
                    <div className="ac-pickinfo">
                      <div className="ac-pickname">{it.th}</div>
                      <div className="ac-pickspec">{[it.brand, it.ac_type, it.btu ? `${fmtNum(it.btu)} BTU` : null].filter(Boolean).join(" · ") || it.code}</div>
                    </div>
                    <div className="ac-pickprice">{fmtBaht(it.salePrice)}<span>ส่ง ›</span></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        );
      })()}
      {custForm && <CustomerFormModal initial={custForm.initial} onClose={() => setCustForm(null)} onSaved={onCustSaved} />}
      {capJob && <DocCapture type={capJob.type} no={capJob.no}
        onError={(m) => { flash("เตรียมเอกสารไม่สำเร็จ: " + m, true); setCapJob(null); }}
        onReady={async (node) => {
          try { await sendDocFromNode(node, capJob.to, capJob.mode, capJob.label); flash(capJob.mode === "image" ? "ส่งรูปเอกสารให้ลูกค้าแล้ว ✓" : "ส่งลิงก์ PDF ให้ลูกค้าแล้ว ✓"); }
          catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
          setCapJob(null);
        }} />}
      {toast && <div className={"chat-toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
