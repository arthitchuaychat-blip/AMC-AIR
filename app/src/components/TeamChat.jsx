import React from "react";
import { supabase } from "../lib/supabase";
import { confirmDialog } from "./ConfirmDialog";
import { listChatRooms, listChatMessages, CHAT_PAGE, sendChatMessage, sendChatImage, sendChatFile, createDmRoom, createChatRoom, deleteChatRoom, renameChatRoom, markChatRead, listStaff, getProfile, uploadChatImage, listJobOrders, listRoomMembers, addChatMember, removeChatMember, uploadAvatar, setMyAvatar, setRoomAvatar, listChatNotes, saveChatNote, deleteChatNote, listAllChatNotes, translateText, toggleReaction, deleteChatMessage } from "../lib/api";
import { useLang } from "../lib/i18n";
import { matchText, ATTACH_ACCEPT } from "../lib/format";
import { pushSupported, notifyPermission, enablePush } from "../lib/push";
import { UIcon } from "../icons";
import { JOB_STATUSES } from "../lib/schedule";

// gradient per room kind
const ROOM_BG = {
  company: "linear-gradient(135deg,#667eea,#764ba2)",
  dm:      "linear-gradient(135deg,#0ea5e9,#0284c7)",
  group:   "linear-gradient(135deg,#10b981,#059669)",
  project: "linear-gradient(135deg,#f59e0b,#d97706)",
};
const KIND_ICON  = { company: "🏢", dm: "👤", group: "👥", project: "🧰" };
const KIND_LABEL = { company: "บริษัท", dm: "ส่วนตัว", group: "กลุ่ม", project: "งาน" };
const OFFICE     = ["admin", "exec", "finance", "sales", "field_sales"];

// deterministic avatar color per user-id
const AV_COLORS = ["#0ea5e9","#10b981","#f59e0b","#8b5cf6","#ef4444","#ec4899","#14b8a6","#f97316"];
function avColor(id) {
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = (h * 31 + (id || "").charCodeAt(i)) & 0x7fffffff;
  return AV_COLORS[h % AV_COLORS.length];
}

// avatar: photo if set, else a coloured initial. cls picks the base style (tc-av / tc-msg-av / tc-room-ic)
// (export ให้ ChatDock แผงลอยใช้ชุดเดียวกัน — หน้าตาห้อง/คนเหมือนหน้าแชตเต็ม)
export function Avatar({ url, name, id, size, cls = "tc-av" }) {
  if (url) return (
    <span className={cls + " tc-av-img"} style={size ? { width: size, height: size } : undefined}>
      <img src={url} alt="" />
    </span>
  );
  return (
    <span className={cls} style={{ ...(size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : {}), background: avColor(id) }}>
      {(name || "?")[0]?.toUpperCase()}
    </span>
  );
}
// room icon:
//  · มีรูปตั้งเอง → รูปนั้น (DM = รูปของคู่สนทนา — listChatRooms ใส่มาให้แล้ว)
//  · DM ไม่มีรูป → วงกลมตัวอักษรขึ้นต้นชื่อคู่สนทนา (เหมือน avatar ในข้อความ)
//  · กลุ่มไม่มีรูป → รูปสมาชิก 2 คนแรกซ้อนกัน + ป้าย 👥 ให้เห็นชัดว่าเป็นกลุ่ม
//  · อื่น ๆ (บริษัท/ห้องงาน) → อีโมจิบนพื้นไล่เฉดตามเดิม
export function RoomIcon({ room, size = 44, staffById = {} }) {
  if (room.avatar_url) return (
    <span className="tc-room-ic tc-av-img" style={{ width: size, height: size }}><img src={room.avatar_url} alt="" /></span>
  );
  if (room.kind === "dm") return <Avatar name={room.title} id={room.dmPartner || room.title} size={size} cls="tc-av" />;
  if (room.kind === "group" && (room.memberIds || []).length >= 2) {
    const [aId, bId] = room.memberIds;
    const A = staffById[aId] || {}, B = staffById[bId] || {};
    const s = Math.round(size * 0.66);
    return (
      <span className="tc-room-collage" style={{ width: size, height: size }}>
        <Avatar url={A.avatar_url} name={A.name || room.title} id={aId} size={s} cls="tc-av tc-col-a" />
        <Avatar url={B.avatar_url} name={B.name || room.title} id={bId} size={s} cls="tc-av tc-col-b" />
        <span className="tc-col-badge">👥</span>
      </span>
    );
  }
  return (
    <span className="tc-room-ic" style={{ background: ROOM_BG[room.kind] || ROOM_BG.group, width: size, height: size, fontSize: Math.round(size * 0.48) }}>
      {KIND_ICON[room.kind] || "💬"}
    </span>
  );
}

function jobStatusLabel(v) { return JOB_STATUSES.find(([s]) => s === v)?.[1] || v; }
function jobStatusColor(v) { return JOB_STATUSES.find(([s]) => s === v)?.[3] || "#888"; }

// extract nickname: "สมชาย ใจดี (ชาย)" → "ชาย",  "ADMIN งานขาย" → "ADMIN"
function nickOf(name) {
  const m = (name || "").match(/\(([^)]+)\)/);
  if (m) return m[1];
  return (name || "").split(/\s+/)[0] || name || "";
}
// highlight @nick patterns in a message
function renderMentions(text) {
  if (!text || !text.includes("@")) return text;
  const parts = text.split(/(@\S+)/);
  return parts.map((p, i) => p.startsWith("@") && p.length > 1 ? <span key={i} className="chat-mention">{p}</span> : p);
}
// ลิงก์เว็บ/หมุดแผนที่ในข้อความกดเปิดได้ + ยังไฮไลต์ @แท็กในส่วนที่เหลือ (regex เดียวกับโน้ตช่าง)
const URL_RE = /((?:https?:\/\/|www\.|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)[^\s<>"']+)/gi;
function renderRich(text) {
  if (!text) return text;
  return String(text).split(URL_RE).map((p, i) =>
    /^(https?:\/\/|www\.|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(p)
      ? <a key={i} href={/^https?:\/\//i.test(p) ? p : `https://${p}`} target="_blank" rel="noopener noreferrer"
          style={{ color: "inherit", fontWeight: 700, textDecoration: "underline", wordBreak: "break-all" }}
          onClick={(e) => e.stopPropagation()}>{/^(maps\.|goo\.gl|https?:\/\/(maps\.|www\.google\.[^/]+\/maps))/i.test(p) ? "📍 " : ""}{p}</a>
      : <React.Fragment key={i}>{renderMentions(p)}</React.Fragment>);
}

// [JOBCARD|job_no|customer|status|title]
function parseJobCard(text) {
  const m = text?.match(/^\[JOBCARD\|([^|]+)\|([^|]*)\|([^|]*)\|([^\]]*)\]$/);
  if (!m) return null;
  return { job_no: m[1], customer: m[2], status: m[3], title: m[4] };
}

function NotifyButton() {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [perm, setPerm] = React.useState(notifyPermission());
  const [busy, setBusy] = React.useState(false);
  if (!pushSupported()) return null;
  if (perm === "denied") return <span className="tc-notify off" title={L("เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์", "ဘရောက်ဆာ ဆက်တင်တွင် ခွင့်ပြုပါ")}>🔕 {L("ปิดแจ้งเตือน", "အသိပေးချက် ပိတ်")}</span>;
  if (perm === "granted") return <span className="tc-notify on">🔔 {L("เปิดอยู่", "ဖွင့်ထား")}</span>;
  return (
    <button className="btn-primary sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await enablePush(); setPerm(notifyPermission()); }
      catch (e) { alert(e.message || L("เปิดแจ้งเตือนไม่สำเร็จ", "အသိပေးချက် ဖွင့်၍မရ")); }
      setBusy(false);
    }}>🔔 {L("เปิดแจ้งเตือน", "အသိပေးချက် ဖွင့်")}</button>
  );
}

const TYPE_TABS = [
  { k: "all",     th: "ทุกห้อง",     my: "အခန်းအားလုံး" },
  { k: "company", th: "🏢 บริษัท",   my: "🏢 ကုမ္ပဏီ" },
  { k: "dm",      th: "👤 ส่วนตัว",  my: "👤 ကိုယ်ရေး" },
  { k: "group",   th: "👥 กลุ่ม",    my: "👥 အုပ်စု" },
  { k: "project", th: "🧰 งาน",      my: "🧰 အလုပ်" },
];

export default function TeamChat({ focus, onFocusConsumed, onJobClick }) {
  const [me, setMe]         = React.useState(null);
  const [rooms, setRooms]   = React.useState([]);
  const [staff, setStaff]   = React.useState([]);
  const [sel, setSel]       = React.useState(null);
  const [msgs, setMsgs]     = React.useState([]);
  const [text, setText]     = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [q, setQ]           = React.useState("");
  const [kindF, setKindF]   = React.useState("all");
  const [modal, setModal]   = React.useState(null); // "dm"|"group"|"members"|"joblink"
  const [jobs, setJobs]     = React.useState([]);
  const [toast, setToast]   = React.useState(null);
  const [mentionQ, setMentionQ]         = React.useState(null); // null = closed
  const [mentionAnchor, setMentionAnchor] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);   // ห้องนี้ยังมีข้อความเก่ากว่าที่โหลดมา
  const [rename, setRename] = React.useState(null);      // string = กำลังแก้ชื่อกลุ่ม · null = ปกติ
  const [noteIdx, setNoteIdx] = React.useState(null);     // room_id → [ข้อความโน้ต] — โหลดครั้งแรกที่เริ่มค้นหา
  const [trMap, setTrMap] = React.useState({});           // msg id → คำแปล ("…" = กำลังแปล)
  const [trBusy, setTrBusy] = React.useState(false);      // กำลังแปลข้อความในช่องพิมพ์
  const lang = useLang();                                 // ภาษา UI ของฉัน (th/my) — กำหนดทิศทางการแปล
  const L = (th, my) => (lang === "my" ? my : th);        // Thai default, Burmese when toggled
  const endRef  = React.useRef(null);
  const selRef  = React.useRef(null);
  const taRef   = React.useRef(null);
  const msgsRef = React.useRef(null);          // กล่องข้อความ (ไว้คุมตำแหน่ง scroll)
  const keepScrollRef = React.useRef(null);    // จำ scroll ก่อนเติมข้อความเก่าด้านบน
  const boardRef = React.useRef(null);         // กระดานแชต — วัดความสูงให้พอดีจอ (ช่องพิมพ์ไม่หลุดขอบล่าง)

  // ── ยืดกระดานให้เต็มพื้นที่ที่เหลือพอดี (แถบงานค้าง/ปุ่มย้อนกลับมี-ไม่มีสลับกัน ค่าคงที่จึงเดาไม่แม่น) ──
  React.useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const fit = () => {
      if (window.innerWidth <= 760) { el.style.height = ""; return; } // จอเล็ก = ต่อกันแนวตั้ง (ปล่อยตาม CSS)
      const top = el.getBoundingClientRect().top;
      el.style.height = Math.max(360, window.innerHeight - top - 16) + "px"; // เว้นขอบล่าง 16px
    };
    fit();
    // แถบงานค้าง/ฟอนต์โหลดทีหลัง ทำให้ตำแหน่งขยับ → วัดซ้ำอีกสองสามจังหวะ
    const timers = [80, 300, 700].map((ms) => setTimeout(fit, ms));
    window.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); timers.forEach(clearTimeout); };
  }, [me]);
  const roomsTimer = React.useRef(null);       // debounce โหลดรายชื่อห้องตอนข้อความ realtime รัว ๆ
  selRef.current = sel;

  const flash     = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const staffName = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const staffById = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  async function reloadMe() { try { const [p, s] = await Promise.all([getProfile(), listStaff()]); setMe(p); setStaff(s); } catch { /* ignore */ } }
  async function onMyAvatar(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    try { const url = await uploadAvatar(f); await setMyAvatar(url); await reloadMe(); loadRooms(); flash(L("เปลี่ยนรูปโปรไฟล์แล้ว ✓", "ပရိုဖိုင်ဓာတ်ပုံ ပြောင်းပြီး ✓")); }
    catch (err) { flash(L("เปลี่ยนรูปไม่สำเร็จ: ", "ဓာတ်ပုံ ပြောင်း၍မရ: ") + (err?.message || err)); }
  }
  async function onRoomAvatar(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel) return;
    try { const url = await uploadAvatar(f); await setRoomAvatar(sel, url); await loadRooms(); flash(L("เปลี่ยนรูปกลุ่มแล้ว ✓", "အုပ်စုဓာတ်ပုံ ပြောင်းပြီး ✓")); }
    catch (err) { flash(L("เปลี่ยนรูปกลุ่มไม่สำเร็จ: ", "အုပ်စုဓာတ်ပုံ ပြောင်း၍မရ: ") + (err?.message || err)); }
  }

  // members eligible for @mention in current room
  const mentionMembers = React.useMemo(() => {
    if (mentionQ === null || !sel) return [];
    const room = rooms.find((r) => r.id === sel);
    const roomIds = new Set(room?.memberIds || []);
    const q = mentionQ.toLowerCase();
    return staff
      .filter((s) => s.id !== me?.id && (room?.kind === "company" || roomIds.has(s.id)))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || nickOf(s.name).toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [mentionQ, sel, rooms, staff, me]);

  function pickMention(member) {
    const nick = nickOf(member.name);
    const before = text.slice(0, mentionAnchor);
    const after  = text.slice(mentionAnchor + 1 + (mentionQ || "").length);
    const newText = before + "@" + nick + " " + after;
    setText(newText);
    setMentionQ(null);
    setTimeout(() => {
      if (taRef.current) {
        const pos = before.length + nick.length + 2;
        taRef.current.focus();
        taRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function extractMentionIds(txt) {
    const matches = (txt.match(/@(\S+)/g) || []).map((m) => m.slice(1).toLowerCase());
    return staff
      .filter((s) => matches.includes(nickOf(s.name).toLowerCase()) || matches.includes(s.name.toLowerCase()))
      .map((s) => s.id);
  }

  async function loadRooms() { try { setRooms(await listChatRooms()); } catch { } }
  // ช่วงคุยรัว ๆ realtime ยิงเข้ามาถี่ — รวบโหลดรายชื่อห้องเป็นครั้งเดียวทุก ~0.8 วิ
  function queueLoadRooms() { clearTimeout(roomsTimer.current); roomsTimer.current = setTimeout(loadRooms, 800); }
  async function loadMsgs(roomId) {
    try { const rows = await listChatMessages(roomId); setMsgs(rows); setHasMore(rows.length >= CHAT_PAGE); }
    catch { setMsgs([]); setHasMore(false); }
  }
  // ปุ่ม "ดูข้อความเก่า" — ดึงหน้าถัดไปย้อนหลังแล้วเติมด้านบน โดยตรึงตำแหน่งที่อ่านอยู่
  async function loadOlder() {
    if (!sel || !msgs.length) return;
    const el = msgsRef.current;
    keepScrollRef.current = el ? { h: el.scrollHeight, top: el.scrollTop } : null;
    try {
      const older = await listChatMessages(sel, { before: msgs[0].created_at });
      setMsgs((cur) => [...older, ...cur]);
      setHasMore(older.length >= CHAT_PAGE);
    } catch { keepScrollRef.current = null; flash(L("โหลดข้อความเก่าไม่สำเร็จ", "စာဟောင်း ဖွင့်၍မရ")); }
  }
  async function ensureJobs() { if (!jobs.length) { try { setJobs(await listJobOrders()); } catch { } } }
  // ดัชนีโน้ตไว้ให้ช่องค้นหาห้องหาเนื้อโน้ตเจอ — โหลดเมื่อเริ่มพิมพ์ค้นหาครั้งแรก (force = รีเฟรชหลังโน้ตเปลี่ยน)
  async function ensureNoteIdx(force) {
    if (noteIdx !== null && !force) return;
    try {
      const rows = await listAllChatNotes();
      const m = {};
      rows.forEach((n) => { if (n.text) (m[n.room_id] = m[n.room_id] || []).push(n.text); });
      setNoteIdx(m);
    } catch { if (noteIdx === null) setNoteIdx({}); }
  }

  React.useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([getProfile(), listStaff()]);
      setMe(p); setStaff(s);
    })();
    loadRooms();
    const ch = supabase.channel("team-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new;
        if (m.room_id === selRef.current) {
          setMsgs((cur) => cur.some((x) => x.id === m.id) ? cur : [...cur, m]);
          markChatRead(m.room_id).catch(() => {});
        }
        queueLoadRooms();
      })
      // รีแอกชันของคนอื่น (mig 190) → โหลดข้อความห้องที่เปิดอยู่ใหม่เพื่ออัปเดตตัวเลข
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => { if (selRef.current) loadMsgs(selRef.current); })
      .subscribe();
    return () => { supabase.removeChannel(ch); clearTimeout(roomsTimer.current); };
  }, []);

  React.useEffect(() => { if (focus == null) return; setSel(Number(focus)); onFocusConsumed && onFocusConsumed(); }, [focus]);
  React.useEffect(() => {
    if (!sel) return;
    setRename(null);   // สลับห้อง — ปิดโหมดแก้ชื่อค้าง
    loadMsgs(sel);
    markChatRead(sel).then(loadRooms).catch(() => {});
  }, [sel]);
  React.useEffect(() => {
    const el = msgsRef.current;
    if (keepScrollRef.current && el) {
      // เพิ่งเติมข้อความเก่าด้านบน → คงตำแหน่งเดิมที่ผู้ใช้อ่านอยู่ (ไม่กระโดดลงล่าง)
      el.scrollTop = el.scrollHeight - keepScrollRef.current.h + keepScrollRef.current.top;
      keepScrollRef.current = null;
    } else {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [msgs]);

  const [replyTo, setReplyTo] = React.useState(null);   // ข้อความที่กำลังตอบกลับ (mig 190)
  const [rxFor, setRxFor] = React.useState(null);        // ข้อความที่เปิดตัวเลือกรีแอกชันอยู่
  async function send() {
    const t = text.trim(); if (!t || !sel || sending) return;
    const ids = extractMentionIds(t);
    const rt = replyTo?.id || null;
    setText(""); setMentionQ(null); setReplyTo(null); setSending(true);
    try { await sendChatMessage(sel, t, ids, rt); await loadMsgs(sel); } catch { flash(L("ส่งไม่สำเร็จ", "ပို့၍မရ")); setText(t); }
    setSending(false);
  }
  // รีแอกชัน + ลบข้อความตัวเอง (mig 190)
  async function react(m, emoji) { const on = !(m.reactions?.[emoji]?.mine); setRxFor(null); try { await toggleReaction(m.id, emoji, on); await loadMsgs(sel); } catch (e) { flash(e.message || String(e)); } }
  async function delMsg(m) { if (!await confirmDialog(L("ลบข้อความนี้? (ลบให้ทุกคนในห้อง)", "ဒီစာ ဖျက်မလား?"))) return; try { await deleteChatMessage(m.id); await loadMsgs(sel); } catch (e) { flash(e.message || String(e)); } }
  const RX_SET = ["👍", "❤️", "😂", "🙏", "✅", "🔥"];   // อีโมจิรีแอกชัน (Emoji รุ่นเก่า รองรับทุกเครื่อง)
  const msgById = React.useMemo(() => Object.fromEntries((msgs || []).map((m) => [m.id, m])), [msgs]);
  const msgSnippet = (m) => m ? (m.deleted_at ? L("ข้อความถูกลบ", "ဖျက်ပြီး") : m.image_url ? "[รูปภาพ]" : m.file_url ? `📎 ${m.file_name || "ไฟล์"}` : (parseJobCard(m.text) ? "📋 ลิงก์ใบงาน" : String(m.text || "").slice(0, 60))) : L("ข้อความ", "စာ");
  const isImg = (f) => (f.type || "").startsWith("image/") || /\.(heic|heif)$/i.test(f.name || "");
  // ส่งรูปได้ทีละหลายรูป (เลือกหลายไฟล์ / วางจากคลิปบอร์ด) — อัปโหลดย่อ+แปลง HEIC ให้อัตโนมัติ
  async function sendImages(files) {
    if (!files.length || !sel || sending) return;
    setSending(true);
    try { for (const f of files) { const url = await uploadChatImage(f); await sendChatImage(sel, url); } await loadMsgs(sel); }
    catch { flash(L("ส่งรูปไม่สำเร็จ", "ဓာတ်ပုံ ပို့၍မရ")); }
    setSending(false);
  }
  function onImage(e) { const fs = Array.from(e.target.files || []); e.target.value = ""; sendImages(fs); }
  function onPaste(e) {
    const fs = Array.from(e.clipboardData?.files || []).filter(isImg);
    if (fs.length) { e.preventDefault(); sendImages(fs); }
  }
  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel) return;
    if (isImg(f)) return sendImages([f]);   // รูป (รวม HEIC จากไอโฟน) → ส่งเป็นรูปดูในแชตได้เลย ไม่ใช่ลิงก์ไฟล์
    setSending(true);
    try { const url = await uploadChatImage(f); await sendChatFile(sel, url, f.name); await loadMsgs(sel); } catch (err) { flash(L("ส่งไฟล์ไม่สำเร็จ: ", "ဖိုင် ပို့၍မရ: ") + (err?.message || err)); }
    setSending(false);
  }
  async function sendJobCard(j) {
    if (!sel) return;
    const safe = (s) => (s || "").replace(/[|[\]]/g, "");
    const msg = `[JOBCARD|${safe(j.job_no)}|${safe(j.customerName)}|${safe(j.status)}|${safe(j.title)}]`;
    setModal(null); setSending(true);
    try { await sendChatMessage(sel, msg); await loadMsgs(sel); } catch { flash(L("ส่งลิงก์งานไม่สำเร็จ", "အလုပ်လင့်ခ် ပို့၍မရ")); }
    setSending(false);
  }
  async function openDm(otherId) {
    try { const id = await createDmRoom(otherId); setModal(null); await loadRooms(); setSel(id); }
    catch (e) { flash(L("เปิดแชตไม่สำเร็จ: ", "စကားပြော ဖွင့်၍မရ: ") + (e?.message || e)); }
  }
  // ── แปลภาษา ไทย↔พม่า (ทิศทางตามภาษา UI ของฉัน) ──
  // แปลข้อความที่ได้รับ → เป็นภาษาของฉัน (ไทยเห็นไทย · พม่าเห็นพม่า)
  const trDoneRef = React.useRef(new Set());   // กันแปลซ้ำ/ยิงถี่ระหว่าง state ยังไม่อัปเดต
  async function translateMsg(m, quiet) {
    if (!m.text || trDoneRef.current.has(m.id)) return;
    trDoneRef.current.add(m.id);
    setTrMap((s) => ({ ...s, [m.id]: "…" }));
    try { const out = await translateText(m.text, lang === "my" ? "my" : "th"); setTrMap((s) => ({ ...s, [m.id]: out })); }
    catch (e) {
      trDoneRef.current.delete(m.id);
      setTrMap((s) => { const n = { ...s }; delete n[m.id]; return n; });
      if (!quiet) flash(L("แปลไม่สำเร็จ: ", "ဘာသာပြန်၍မရ: ") + (e?.message || e));
    }
  }
  // แปลอัตโนมัติ: ข้อความที่เป็นภาษาอีกฝั่งล้วน ๆ (พม่าเข้ามา → ไทยเห็นคำแปลทันที และกลับกัน)
  // เฉพาะ 20 ข้อความล่าสุด กันยิง API ถล่มตอนเปิดประวัติยาว ๆ · ข้อความที่มีสองภาษาอยู่แล้วไม่แปลซ้ำ
  const MY_RE = /[က-႟]/, TH_RE = /[฀-๿]/;   // อักษรพม่า / อักษรไทย
  const needsAutoTr = (m) => {
    if (!m.text || parseJobCard(m.text)) return false;
    const hasMy = MY_RE.test(m.text), hasTh = TH_RE.test(m.text);
    if (hasMy && hasTh) return false;
    return lang === "my" ? hasTh : hasMy;
  };
  React.useEffect(() => {
    const targets = msgs.filter((m) => needsAutoTr(m) && !trDoneRef.current.has(m.id)).slice(-20);
    if (!targets.length) return;
    (async () => { for (const m of targets) await translateMsg(m, true); })();   // ทีละข้อความ กันโดนจำกัด
  }, [msgs]);
  // แปลข้อความที่พิมพ์ → เป็นภาษาอีกฝั่ง แล้วต่อท้ายให้ตรวจก่อนส่ง (ส่งทั้งสองภาษาในข้อความเดียว)
  async function translateCompose() {
    const t = text.trim(); if (!t || trBusy) return;
    setTrBusy(true);
    try {
      const out = await translateText(t, lang === "my" ? "th" : "my");
      if (out && out.trim() && out.trim() !== t) setText(t + "\n" + out.trim());
    } catch (e) { flash(L("แปลไม่สำเร็จ: ", "ဘာသာပြန်၍မရ: ") + (e?.message || e)); }
    setTrBusy(false);
  }

  // แก้ชื่อห้องกลุ่ม/ห้องงาน (ทีมหลังบ้าน)
  async function saveRename() {
    const nm = (rename || "").trim(); if (!nm || !selRoom) return;
    try { await renameChatRoom(selRoom.id, nm); setRename(null); await loadRooms(); flash(L("แก้ชื่อกลุ่มแล้ว ✓", "အုပ်စုအမည် ပြင်ပြီး ✓")); }
    catch (e) { flash(L("แก้ชื่อไม่สำเร็จ: ", "အမည်ပြင်၍မရ: ") + (e?.message || e)); }
  }
  // ธุรการ/ผู้บริหาร ลบห้องกลุ่ม/ห้องงานถาวร (ข้อความ+สมาชิกหายทั้งชุด)
  async function delRoom() {
    if (!selRoom) return;
    if (!await confirmDialog(L(`ลบห้อง "${selRoom.title}" ถาวร?\nข้อความ รูป และไฟล์ในห้องจะถูกลบทั้งหมด สมาชิกทุกคนจะไม่เห็นห้องนี้อีก`, `"${selRoom.title}" အခန်းကို အပြီးဖျက်မလား?\nအခန်းထဲက စာ၊ ဓာတ်ပုံနှင့် ဖိုင်များ အားလုံး ဖျက်ခံရမည်။ အဖွဲ့ဝင်အားလုံး ဤအခန်းကို မမြင်တော့ပါ`))) return;
    try { await deleteChatRoom(selRoom.id); setSel(null); await loadRooms(); flash(L("ลบห้องแล้ว ✓", "အခန်း ဖျက်ပြီး ✓")); }
    catch (e) { flash(L("ลบไม่สำเร็จ: ", "ဖျက်၍မရ: ") + (e?.message || e)); }
  }

  const selRoom = rooms.find((r) => r.id === sel);
  const kindCounts = React.useMemo(() => {
    const c = {};
    rooms.forEach((r) => { c[r.kind] = (c[r.kind] || 0) + 1; });
    return c;
  }, [rooms]);
  // ค้นหาห้อง: ชื่อห้อง / ข้อความล่าสุด / เนื้อโน้ตในห้อง — เจอจากโน้ตจะโชว์บรรทัดโน้ตนั้นแทนข้อความล่าสุด
  const noteHitOf = (r) => (q && noteIdx ? (noteIdx[r.id] || []).find((t) => matchText(q, t)) : null);
  const shown = rooms.filter((r) =>
    (matchText(q, r.title, r.lastText) || !!noteHitOf(r)) && (kindF === "all" || r.kind === kindF)
  );

  const accentColor = selRoom
    ? { company: "#764ba2", dm: "#0284c7", group: "#059669", project: "#d97706" }[selRoom.kind] || "#059669"
    : "#059669";

  return (
    <div className="adm tc-wrap">
      <div className="adm-head">
        <div>
          <h1 className="page-title">{L("แชตทีม", "အဖွဲ့ စကားပြော")} <span className="page-title-en">Team Chat</span></h1>
          <p className="page-sub">{L("คุยกันภายในองค์กร · ห้องรวม · ทักตัวต่อตัว · กลุ่ม · ห้องงาน", "အဖွဲ့အတွင်း စကားပြော · ဘုံအခန်း · တစ်ဦးချင်း · အုပ်စု · အလုပ်အခန်း")}</p>
        </div>
        <div className="cat-head-actions">
          <label className="tc-myav" title={L("เปลี่ยนรูปโปรไฟล์ของฉัน", "ကျွန်ုပ်၏ ပရိုဖိုင်ဓာတ်ပုံ ပြောင်း")}>
            <Avatar url={me?.avatar_url} name={me?.name} id={me?.id} size={46} />
            <span className="tc-myav-cam" style={{ width: 19, height: 19, fontSize: 11 }}>📷</span>
            <input type="file" accept="image/*" hidden onChange={onMyAvatar} />
          </label>
          <NotifyButton />
        </div>
      </div>

      <div className="tc-board" ref={boardRef}>
        {/* ── sidebar ── */}
        <div className="tc-rooms">
          <div className="tc-rooms-top">
            <div className="cat-search" style={{ flex: 1 }}>
              <UIcon name="search" size={16} color="var(--ink-3)" />
              <input placeholder={L("ค้นหาห้อง / โน้ต", "အခန်း / မှတ်စု ရှာဖွေ")} value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value) ensureNoteIdx(); }} />
            </div>
          </div>

          {/* type filter tabs */}
          <div className="tc-type-tabs">
            {TYPE_TABS.filter((t) => t.k === "all" || kindCounts[t.k]).map((t) => (
              <button key={t.k} className={"tc-type-tab" + (kindF === t.k ? " on" : "")} onClick={() => setKindF(t.k)}>
                {L(t.th, t.my)}
                {t.k !== "all" && kindCounts[t.k]
                  ? <span className="tc-type-cnt">{kindCounts[t.k]}</span> : null}
              </button>
            ))}
          </div>

          <div className="tc-rooms-acts">
            <button className="btn-ghost sm" onClick={() => setModal("dm")}>
              <UIcon name="plus" size={13} /> {L("ทักตัวต่อตัว", "တစ်ဦးချင်း စကားပြော")}
            </button>
            <button className="btn-ghost sm" onClick={() => { setModal("group"); ensureJobs(); }}>
              <UIcon name="plus" size={13} /> {L("สร้างกลุ่ม", "အုပ်စု ဖန်တီး")}
            </button>
          </div>

          <div className="tc-room-list">
            {shown.length === 0 && <div className="empty" style={{ fontSize: 13 }}>{L("ยังไม่มีห้องแชต", "စကားပြောခန်း မရှိသေး")}</div>}
            {shown.map((r) => {
              const nh = noteHitOf(r);
              return (
                <button key={r.id} className={"tc-room" + (sel === r.id ? " on" : "")} onClick={() => setSel(r.id)}>
                  <RoomIcon room={r} size={40} staffById={staffById} />
                  <span className="tc-room-mid">
                    <span className="tc-room-title">
                      {r.title}
                      {r.kind !== "dm" && r.memberCount
                        ? <span className="tc-room-cnt"> · {r.memberCount} {L("คน", "ဦး")}</span> : null}
                    </span>
                    <span className="tc-room-last">{nh ? `📝 ${nh.slice(0, 70)}` : (r.lastText || "—")}</span>
                  </span>
                  {r.unread > 0 && <span className="chat-unread">{r.unread}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── main chat area ── */}
        <div className="tc-main">
          {!selRoom ? (
            <div className="tc-empty">
              <div style={{ fontSize: 52, lineHeight: 1 }}>💬</div>
              <p style={{ fontWeight: 800, fontSize: 16 }}>{L("เลือกห้องแชตเพื่อเริ่มคุย", "စကားပြောရန် အခန်းရွေးပါ")}</p>
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", textAlign: "center", lineHeight: 1.7 }}>
                {L("ทักตัวต่อตัว · สร้างกลุ่มทีมช่าง", "တစ်ဦးချင်း · ကျွမ်းကျင်သမားအဖွဲ့ ဖန်တီး")}<br />{L("หรือเลือกห้องบริษัทด้านซ้าย", "သို့မဟုတ် ဘယ်ဘက်ရှိ ကုမ္ပဏီအခန်း ရွေးပါ")}
              </p>
            </div>
          ) : (
            <>
              <div className="tc-main-head" style={{ borderTop: `3px solid ${accentColor}` }}>
                {OFFICE.includes(me?.role) && (selRoom.kind === "group" || selRoom.kind === "project") ? (
                  <label className="tc-roomav-edit" title={L("เปลี่ยนรูปกลุ่ม", "အုပ်စုဓာတ်ပုံ ပြောင်း")}>
                    <RoomIcon room={selRoom} size={42} staffById={staffById} />
                    <span className="tc-myav-cam">📷</span>
                    <input type="file" accept="image/*" hidden onChange={onRoomAvatar} />
                  </label>
                ) : <RoomIcon room={selRoom} size={42} staffById={staffById} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {rename !== null ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input className="inp sm" autoFocus value={rename} placeholder={L("ชื่อกลุ่ม", "အုပ်စုအမည်")}
                        style={{ maxWidth: 240 }} onChange={(e) => setRename(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRename(null); }} />
                      <button className="btn-primary sm" disabled={!(rename || "").trim()} onClick={saveRename}>{L("บันทึก", "သိမ်း")}</button>
                      <button className="btn-ghost sm" onClick={() => setRename(null)}>{L("ยกเลิก", "မလုပ်တော့")}</button>
                    </div>
                  ) : (
                    <div className="tc-main-title">
                      {selRoom.title}
                      {OFFICE.includes(me?.role) && (selRoom.kind === "group" || selRoom.kind === "project") && (
                        <button className="btn-ghost sm" title={L("แก้ชื่อกลุ่ม", "အုပ်စုအမည် ပြင်")} style={{ marginLeft: 6, padding: "1px 6px", verticalAlign: "middle" }}
                          onClick={() => setRename(selRoom.name || selRoom.title || "")}>
                          <UIcon name="edit" size={13} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="tc-main-sub">
                    {selRoom.kind === "company" ? L("ทุกคนในองค์กร", "အဖွဲ့အတွင်း အားလုံး")
                      : selRoom.kind === "dm" ? L("แชตส่วนตัว", "ကိုယ်ရေး စကားပြော")
                      : (selRoom.memberNames || []).concat(me?.name ? [me.name] : []).join(", ")}
                    {selRoom.ref_no ? ` · ${L("งาน", "အလုပ်")} ${selRoom.ref_no}` : ""}
                  </div>
                </div>
                <button className="btn-ghost sm" title={L("โน้ตประจำห้อง — ปักข้อมูลสำคัญ แนบรูปได้ไม่จำกัด", "အခန်းမှတ်စု — အရေးကြီးအချက် ပင်ထား၊ ဓာတ်ပုံ အကန့်အသတ်မဲ့ တွဲနိုင်")} onClick={() => setModal("notes")}>📝 {L("โน้ต", "မှတ်စု")}</button>
                {OFFICE.includes(me?.role) && (selRoom.kind === "group" || selRoom.kind === "project") &&
                  <button className="btn-ghost sm" onClick={() => setModal("members")}>
                    <UIcon name="user" size={14} /> {L("สมาชิก", "အဖွဲ့ဝင်")}
                  </button>}
                {["admin", "exec"].includes(me?.role) && (selRoom.kind === "group" || selRoom.kind === "project") &&
                  <button className="btn-ghost sm danger" title={L("ลบห้องนี้ถาวร (ธุรการ/ผู้บริหาร)", "ဤအခန်း အပြီးဖျက် (ရုံး/စီမံ)")} onClick={delRoom}>
                    <UIcon name="trash" size={14} /> {L("ลบกลุ่ม", "အုပ်စုဖျက်")}
                  </button>}
              </div>

              <div className="tc-msgs" ref={msgsRef}>
                {hasMore && (
                  <button className="btn-ghost sm" style={{ alignSelf: "center", margin: "2px auto 10px", display: "block" }} onClick={loadOlder}>
                    ⌃ {L("ดูข้อความเก่าก่อนหน้า", "အရင်စာဟောင်းများ ကြည့်")}
                  </button>
                )}
                {msgs.map((m) => {
                  const out = m.sender === me?.id;
                  const jc  = parseJobCard(m.text);
                  return (
                    <div className={"tc-msg-row" + (out ? " out" : "")} key={m.id}>
                      {!out && (
                        <Avatar url={staffById[m.sender]?.avatar_url} name={staffName[m.sender] || "T"} id={m.sender} cls="tc-msg-av" />
                      )}
                      <div className={"chat-bubble " + (out ? "out" : "in")} style={jc ? { maxWidth: 280, padding: 0, background: "none", boxShadow: "none" } : {}}>
                        {!out && !jc && !m.deleted_at && (
                          <span className="chat-sender" style={{ color: avColor(m.sender) }}>
                            {staffName[m.sender] || L("ทีมงาน", "အဖွဲ့သား")}
                          </span>
                        )}
                        {m.reply_to && !m.deleted_at && (
                          <div className="tc-reply-quote" title={msgSnippet(msgById[m.reply_to])}>
                            ↩ {msgById[m.reply_to] ? (staffName[msgById[m.reply_to].sender] || "ทีม") + ": " : ""}{msgSnippet(msgById[m.reply_to])}
                          </div>
                        )}
                        {m.deleted_at ? (
                          <span style={{ fontStyle: "italic", color: "var(--ink-3)" }}>🚫 {L("ข้อความถูกลบแล้ว", "ဖျက်ပြီးသော စာ")}</span>
                        ) : jc ? (
                          <div className={"tc-job-card" + (out ? " out" : "")}>
                            <div className="tc-job-card-tag">📋 {L("ลิงก์ใบงาน", "အလုပ်လင့်ခ်")}</div>
                            <div className="tc-job-card-no">{jc.job_no}</div>
                            <div className="tc-job-card-cust">{jc.customer || "—"}</div>
                            {jc.title && <div className="tc-job-card-title">{jc.title}</div>}
                            <div className="tc-job-card-foot">
                              <span style={{ background: jobStatusColor(jc.status), color: "#fff", fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: "2px 8px" }}>
                                {jobStatusLabel(jc.status)}
                              </span>
                              {onJobClick && (
                                <button className="tc-job-card-btn" onClick={() => onJobClick(jc.job_no)}>
                                  {L("เปิดดูงาน", "အလုပ်ဖွင့်ကြည့်")} →
                                </button>
                              )}
                            </div>
                            <span className="chat-bubble-time" style={{ padding: "0 0 2px" }}>
                              {new Date(m.created_at).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ) : m.image_url ? (
                          <a href={m.image_url} target="_blank" rel="noreferrer">
                            <img className="chat-img" src={m.image_url} alt="" />
                          </a>
                        ) : m.file_url ? (
                          <a className="chat-file" href={m.file_url} target="_blank" rel="noreferrer">📎 {m.file_name || L("เปิดไฟล์", "ဖိုင်ဖွင့်")}</a>
                        ) : (
                          <>
                            <span>{renderRich(m.text)}</span>
                            {trMap[m.id]
                              ? <span className="tc-tr">🌐 {trMap[m.id]}</span>
                              : <button type="button" className="tc-tr-btn" title={L("แปลเป็นภาษาของฉัน · ဘာသာပြန်", "ကျွန်ုပ်ဘာသာသို့ ပြန်ဆို")} onClick={() => translateMsg(m)}>🌐 แปล · ဘာသာပြန်</button>}
                          </>
                        )}
                        {!jc && (
                          <span className="chat-bubble-time">
                            {new Date(m.created_at).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {!m.deleted_at && m.reactions && Object.keys(m.reactions).length > 0 && (
                          <div className="tc-rx-row">
                            {Object.entries(m.reactions).map(([em, r]) => (
                              <button key={em} className={"tc-rx" + (r.mine ? " mine" : "")} onClick={() => react(m, em)} title={L("กด/เอาออก", "နှိပ်/ဖြုတ်")}>{em} {r.count}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {!m.deleted_at && (
                        <div className="tc-msg-acts">
                          <button title={L("ตอบกลับ", "ပြန်ဖြေ")} onClick={() => setReplyTo(m)}>↩</button>
                          <button title={L("รีแอกชัน", "react")} onClick={() => setRxFor(rxFor === m.id ? null : m.id)}>😊</button>
                          {out && <button title={L("ลบข้อความ", "ဖျက်")} onClick={() => delMsg(m)}>🗑</button>}
                          {rxFor === m.id && <div className="tc-rx-pick">{RX_SET.map((em) => <button key={em} onClick={() => react(m, em)}>{em}</button>)}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {mentionQ !== null && mentionMembers.length > 0 && (
                <div className="mention-drop">
                  {mentionMembers.map((s) => (
                    <button key={s.id} className="mention-item" onMouseDown={(e) => { e.preventDefault(); pickMention(s); }}>
                      <Avatar url={s.avatar_url} name={s.name} id={s.id} size={24} />
                      <span className="mention-name">{s.name}</span>
                      <span className="mention-nick">@{nickOf(s.name)}</span>
                    </button>
                  ))}
                </div>
              )}
              {replyTo && (
                <div className="tc-reply-bar">
                  <span className="tc-reply-icon">↩</span>
                  <div className="tc-reply-info"><b>{L("ตอบกลับ", "ပြန်ဖြေ")} {staffName[replyTo.sender] || L("ทีม", "အဖွဲ့")}</b><span>{msgSnippet(replyTo)}</span></div>
                  <button className="tc-reply-x" title={L("ยกเลิก", "ဖျက်")} onClick={() => setReplyTo(null)}>✕</button>
                </div>
              )}
              <div className="chat-compose">
                <label className={"chat-tool" + (sending ? " disabled" : "")} title={L("ส่งรูป (เลือกได้หลายรูป)", "ဓာတ်ပုံ ပို့ (အများကြီး ရွေးနိုင်)")}>
                  📷<input type="file" accept="image/*" multiple hidden disabled={sending} onChange={onImage} />
                </label>
                <label className={"chat-tool" + (sending ? " disabled" : "")} title={L("ส่งไฟล์", "ဖိုင် ပို့")}>
                  📎<input type="file" accept={ATTACH_ACCEPT} hidden disabled={sending} onChange={onFile} />
                </label>
                <button className={"chat-tool" + (!sel || sending ? " disabled" : "")} title={L("ส่งลิงก์ใบงาน", "အလုပ်လင့်ခ် ပို့")}
                  onClick={() => { if (sel && !sending) { ensureJobs(); setModal("joblink"); } }}>
                  🔗
                </button>
                <button className={"chat-tool" + (!text.trim() || trBusy ? " disabled" : "")}
                  title={lang === "my" ? "ထိုင်းဘာသာသို့ ပြန်ဆိုပြီး နောက်ဆက်တွဲ" : "แปลเป็นพม่า แนบท้ายข้อความ (ตรวจก่อนส่งได้)"}
                  onClick={translateCompose}>
                  {trBusy ? "…" : "🌐"}
                </button>
                <textarea ref={taRef} className="inp" rows={3} value={text} onPaste={onPaste}
                  placeholder={sending ? L("กำลังส่ง…", "ပို့နေသည်…") : L("พิมพ์ข้อความ… (Enter ส่ง · @ แท็กสมาชิก · วางรูปได้)", "စာ ရိုက်ရန်… (Enter ပို့ · @ အဖွဲ့ဝင် တက်ဂ် · ဓာတ်ပုံ ကူးထည့်နိုင်)")}
                  onChange={(e) => {
                    const val = e.target.value; setText(val);
                    const pos = e.target.selectionStart;
                    const before = val.slice(0, pos);
                    const m = before.match(/@(\S*)$/);
                    if (m) { setMentionQ(m[1]); setMentionAnchor(pos - m[0].length); }
                    else setMentionQ(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setMentionQ(null); return; }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (mentionQ !== null && mentionMembers.length) { pickMention(mentionMembers[0]); } else { send(); } }
                  }} />
                <button className="btn-primary" disabled={!text.trim() || sending} onClick={send}>{L("ส่ง", "ပို့")}</button>
              </div>
            </>
          )}
        </div>
      </div>

      {modal === "dm"      && <DmModal staff={staff.filter((s) => s.id !== me?.id)} onPick={openDm} onClose={() => setModal(null)} />}
      {modal === "group"   && <GroupModal staff={staff.filter((s) => s.id !== me?.id)} jobs={jobs}
        onCreate={async (payload) => {
          try { const id = await createChatRoom(payload); setModal(null); await loadRooms(); setSel(id); }
          catch (e) { flash(L("สร้างกลุ่มไม่สำเร็จ: ", "အုပ်စု ဖန်တီး၍မရ: ") + (e?.message || e)); }
        }} onClose={() => setModal(null)} />}
      {modal === "members" && selRoom && <MembersModal room={selRoom} staff={staff} onClose={() => setModal(null)} onChanged={loadRooms} flash={flash} />}
      {modal === "notes" && selRoom && <NotesModal room={selRoom} me={me} staffById={staffById} flash={flash} onClose={() => setModal(null)} onPosted={() => loadMsgs(sel)} onChanged={() => { if (noteIdx !== null) ensureNoteIdx(true); }} />}
      {modal === "joblink" && <JobPickerModal jobs={jobs} onPick={sendJobCard} onClose={() => setModal(null)} />}
      {toast && <div className="tc-toast">{toast}</div>}
    </div>
  );
}

/* ─── DM Modal ─── */
function DmModal({ staff, onPick, onClose }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [q, setQ] = React.useState("");
  const list = staff.filter((s) => matchText(q, s.name, s.email));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-head">
          <div className="modal-title">👤 {L("ทักตัวต่อตัว", "တစ်ဦးချင်း စကားပြော")}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <input className="inp" placeholder={L("ค้นหาชื่อพนักงาน", "ဝန်ထမ်းအမည် ရှာဖွေ")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="tc-picklist">
            {list.map((s) => (
              <button key={s.id} className="tc-pickrow" onClick={() => onPick(s.id)}>
                <Avatar url={s.avatar_url} name={s.name} id={s.id} />
                <span style={{ flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Group/Tech-team Modal ─── */
function GroupModal({ staff, jobs, onCreate, onClose }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [name, setName]   = React.useState("");
  const [sel, setSel]     = React.useState({});
  const [jobNo, setJobNo] = React.useState("");
  const [q, setQ]         = React.useState("");
  const [techOnly, setTechOnly] = React.useState(false);

  const techRoles = ["lead_tech", "tech", "assistant"];
  const listBase  = techOnly ? staff.filter((s) => techRoles.includes(s.role)) : staff;
  const list      = listBase.filter((s) => matchText(q, s.name, s.email));
  const ids       = Object.keys(sel).filter((k) => sel[k]);
  const job       = jobs.find((j) => j.job_no === jobNo);

  function applyTechPreset() {
    setTechOnly(true);
    const preset = {};
    staff.filter((s) => techRoles.includes(s.role)).forEach((s) => { preset[s.id] = true; });
    setSel(preset);
    if (!name) setName("ทีมช่าง");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-head">
          <div className="modal-title">👥 {L("สร้างกลุ่ม / ห้องงาน", "အုပ်စု / အလုပ်အခန်း ဖန်တီး")}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          {/* quick preset */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button className="btn-ghost sm" onClick={applyPreset("group")}
              style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none" }}>
              👥 {L("กลุ่มทั่วไป", "ရိုးရိုးအုပ်စု")}
            </button>
            <button className="btn-ghost sm" onClick={applyTechPreset}
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", border: "none" }}>
              🔧 {L("ทีมช่างทั้งหมด", "ကျွမ်းကျင်သမား အားလုံး")}
            </button>
          </div>

          <label className="fld">
            <span>{L("ชื่อกลุ่ม", "အုပ်စုအမည်")}</span>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={L("เช่น ทีมหน้างาน A หรือ ทีมช่าง B", "ဥပမာ လက်တွေ့အဖွဲ့ A သို့ ကျွမ်းကျင်သမားအဖွဲ့ B")} />
          </label>

          <label className="fld" style={{ marginTop: 8 }}>
            <span>{L("ผูกกับใบงาน (ไม่บังคับ → กลายเป็นห้องงาน 🧰)", "အလုပ်လင့်ခ်နှင့် ချိတ် (မဖြစ်မနေ မဟုတ် → အလုပ်အခန်း ဖြစ်သွား 🧰)")}</span>
            <select className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)}>
              <option value="">{L("— ไม่ผูก —", "— မချိတ် —")}</option>
              {jobs.slice(0, 200).map((j) => (
                <option key={j.job_no} value={j.job_no}>
                  {j.job_no} · {j.customerName || "-"}{j.title ? ` · ${j.title}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="fld" style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span>{L("สมาชิก", "အဖွဲ့ဝင်")} ({ids.length} {L("คน", "ဦး")})</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink-3)", marginLeft: "auto", cursor: "pointer" }}>
                <input type="checkbox" checked={techOnly} onChange={(e) => setTechOnly(e.target.checked)} />
                {L("แสดงเฉพาะช่าง", "ကျွမ်းကျင်သမား သာပြ")}
              </label>
            </div>
            <input className="inp" placeholder={L("ค้นหาพนักงาน", "ဝန်ထမ်း ရှာဖွေ")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
            <div className="tc-picklist">
              {list.map((s) => (
                <label key={s.id} className="tc-checkrow">
                  <input type="checkbox" checked={!!sel[s.id]} onChange={(e) => setSel((c) => ({ ...c, [s.id]: e.target.checked }))} />
                  <Avatar url={s.avatar_url} name={s.name} id={s.id} />
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.role}</span>
                </label>
              ))}
            </div>
          </div>

          <button className="btn-primary" style={{ width: "100%", marginTop: 12 }}
            disabled={!name.trim() && !job}
            onClick={() => onCreate({ name: name || (job ? `งาน ${job.job_no}` : "กลุ่ม"), memberIds: ids, refType: job ? "job" : null, refNo: job ? job.job_no : null })}>
            <UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> {L("สร้างห้อง", "အခန်း ဖန်တီး")}
          </button>
        </div>
      </div>
    </div>
  );

  function applyPreset(kind) {
    return () => { setTechOnly(false); setSel({}); if (kind === "group" && !name) setName(""); };
  }
}

/* ─── Members Modal ─── */
function MembersModal({ room, staff, onClose, onChanged, flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [memberIds, setMemberIds] = React.useState(null);
  const [q, setQ]     = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const nameById = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  async function load() { try { setMemberIds(await listRoomMembers(room.id)); } catch (e) { flash(L("โหลดสมาชิกไม่สำเร็จ", "အဖွဲ့ဝင် ဖွင့်၍မရ")); setMemberIds([]); } }
  React.useEffect(() => { load(); }, [room.id]);
  const set = new Set(memberIds || []);
  const add    = async (uid) => { setBusy(true); try { await addChatMember(room.id, uid); await load(); onChanged && onChanged(); } catch (e) { flash(L("เพิ่มไม่สำเร็จ: ", "ထည့်၍မရ: ") + (e?.message || e)); } setBusy(false); };
  const remove = async (uid) => { setBusy(true); try { await removeChatMember(room.id, uid); await load(); onChanged && onChanged(); } catch (e) { flash(L("ลบไม่สำเร็จ: ", "ဖျက်၍မရ: ") + (e?.message || e)); } setBusy(false); };
  const others = staff.filter((s) => !set.has(s.id) && matchText(q, s.name, s.email));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head">
          <div className="modal-title">👤 {L("สมาชิก", "အဖွဲ့ဝင်")} · {room.title}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          {memberIds === null ? <div className="empty">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div> : (
            <>
              <div className="fld">
                <span>{L("ในห้องนี้", "ဤအခန်းတွင်")} ({memberIds.length} {L("คน", "ဦး")})</span>
                <div className="tc-picklist" style={{ marginTop: 6 }}>
                  {memberIds.length === 0 && <div className="empty sm">{L("ยังไม่มีสมาชิก", "အဖွဲ့ဝင် မရှိသေး")}</div>}
                  {memberIds.map((uid) => (
                    <div key={uid} className="tc-checkrow">
                      <Avatar url={nameById[uid]?.avatar_url} name={nameById[uid]?.name} id={uid} />
                      <span style={{ flex: 1 }}>{nameById[uid]?.name || uid}</span>
                      <button className="btn-ghost sm danger" disabled={busy} onClick={() => remove(uid)}>{L("นำออก", "ဖယ်ထုတ်")}</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="fld" style={{ marginTop: 10 }}>
                <span>{L("เพิ่มสมาชิก", "အဖွဲ့ဝင် ထည့်")}</span>
                <input className="inp" placeholder={L("ค้นหาชื่อ", "အမည် ရှာဖွေ")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6, marginTop: 4 }} />
                <div className="tc-picklist">
                  {others.length === 0 && <div className="empty sm">{L("ไม่พบ", "မတွေ့")}</div>}
                  {others.map((s) => (
                    <div key={s.id} className="tc-checkrow">
                      <Avatar url={s.avatar_url} name={s.name} id={s.id} />
                      <span style={{ flex: 1 }}>{s.name}</span>
                      <button className="btn-ghost sm" disabled={busy} onClick={() => add(s.id)}>＋ {L("เพิ่ม", "ထည့်")}</button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Notes Modal — โน้ตประจำห้อง (แบบ Note ของ LINE): ข้อความ + รูปแนบไม่จำกัด ─── */
function NotesModal({ room, me, staffById, flash, onClose, onPosted, onChanged }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const OFFICE_ROLES = ["admin", "exec", "finance", "sales", "field_sales"];
  const [notes, setNotes] = React.useState(null);
  const [ed, setEd] = React.useState(null);          // { id|null, text, images[] } — กำลังสร้าง/แก้
  const [nq, setNq] = React.useState("");            // ค้นหาโน้ตในห้องนี้
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  async function load() {
    try { setNotes(await listChatNotes(room.id)); }
    catch (e) { flash(L("โหลดโน้ตไม่สำเร็จ: ", "မှတ်စု ဖွင့်၍မရ: ") + (e?.message || e)); setNotes([]); }
  }
  React.useEffect(() => { load(); }, [room.id]);

  const canEdit = (n) => n.author === me?.id || OFFICE_ROLES.includes(me?.role);
  const fmtWhen = (s) => new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  async function onPics(e) {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadChatImage(f));   // ย่อรูป + แปลง HEIC ให้อัตโนมัติ · ไม่จำกัดจำนวน
      setEd((s) => (s ? { ...s, images: [...s.images, ...urls] } : s));
    } catch (ex) { flash(L("อัปโหลดรูปไม่สำเร็จ: ", "ဓာတ်ပုံ တင်၍မရ: ") + (ex?.message || ex)); }
    setUploading(false);
  }
  async function save() {
    if (!ed || (!ed.text.trim() && !ed.images.length)) return flash(L("พิมพ์ข้อความหรือแนบรูปก่อน", "စာ ရိုက်ရန် သို့ ဓာတ်ပုံ တွဲပါ"));
    setBusy(true);
    try {
      const isNew = !ed.id;
      await saveChatNote({ id: ed.id, room_id: room.id, text: ed.text, images: ed.images });
      if (isNew) {   // แจ้งในห้องให้สมาชิกเห็นว่ามีโน้ตใหม่ (ขึ้นแชต + push ตามระบบเดิม)
        try { await sendChatMessage(room.id, `📝 โน้ตใหม่: ${ed.text.trim().slice(0, 80) || "(รูปภาพ)"}${ed.images.length ? ` · ${ed.images.length} รูป` : ""}`); onPosted && onPosted(); } catch (_) {}
      }
      setEd(null); await load(); onChanged && onChanged(); flash(isNew ? L("สร้างโน้ตแล้ว ✓", "မှတ်စု ဖန်တီးပြီး ✓") : L("บันทึกโน้ตแล้ว ✓", "မှတ်စု သိမ်းပြီး ✓"));
    } catch (e) { flash(L("บันทึกไม่สำเร็จ: ", "သိမ်း၍မရ: ") + (e?.message || e)); }
    setBusy(false);
  }
  async function remove(n) {
    if (!await confirmDialog(L("ลบโน้ตนี้?", "ဤမှတ်စု ဖျက်မလား?"))) return;
    try { await deleteChatNote(n.id); await load(); onChanged && onChanged(); flash(L("ลบโน้ตแล้ว", "မှတ်စု ဖျက်ပြီး")); }
    catch (e) { flash(L("ลบไม่สำเร็จ: ", "ဖျက်၍မရ: ") + (e?.message || e)); }
  }
  const shownNotes = (notes || []).filter((n) => matchText(nq, n.text, (staffById[n.author] || {}).name));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "95vw" }}>
        <div className="modal-head">
          <div className="modal-title">📝 {L("โน้ต", "မှတ်စု")} · {room.title}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: "72vh", overflowY: "auto" }}>
          {/* ── ค้นหาโน้ต ── */}
          {(notes || []).length > 0 && (
            <div className="cat-search" style={{ marginBottom: 10 }}>
              <UIcon name="search" size={15} color="var(--ink-3)" />
              <input placeholder={L("ค้นหาโน้ต / ชื่อคนเขียน…", "မှတ်စု / ရေးသူအမည် ရှာဖွေ…")} value={nq} onChange={(e) => setNq(e.target.value)} />
              {nq && <button className="cat-search-x" onClick={() => setNq("")}><UIcon name="x" size={14} /></button>}
            </div>
          )}
          {/* ── ฟอร์มสร้าง/แก้โน้ต ── */}
          {ed ? (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <textarea className="inp" rows={4} autoFocus value={ed.text} placeholder={L("พิมพ์โน้ต… (นัดหมาย กติกา ข้อมูลสำคัญของห้อง)", "မှတ်စု ရိုက်ရန်… (ချိန်းဆို၊ စည်းကမ်း၊ အခန်းအရေးကြီးအချက်)")}
                onChange={(e) => setEd((s) => ({ ...s, text: e.target.value }))} style={{ resize: "vertical" }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                {ed.images.map((u, i) => (
                  <span key={u + i} style={{ position: "relative", display: "inline-block" }}>
                    <img src={u} alt="" style={{ width: 62, height: 62, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)", cursor: "zoom-in" }} onClick={() => window.open(u, "_blank")} />
                    <button type="button" onClick={() => setEd((s) => ({ ...s, images: s.images.filter((_, j) => j !== i) }))}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 99, border: 0, background: "#dc2626", color: "#fff", fontSize: 11, lineHeight: "18px", padding: 0, cursor: "pointer" }}>✕</button>
                  </span>
                ))}
                <label className="btn-ghost sm" style={{ cursor: "pointer", height: 62, width: 62, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2, borderStyle: "dashed" }}>
                  <span style={{ fontSize: 18 }}>{uploading ? "…" : "📷"}</span><span style={{ fontSize: 10.5 }}>{uploading ? L("กำลังอัป", "တင်နေ") : L("เพิ่มรูป", "ဓာတ်ပုံ ထည့်")}</span>
                  <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={onPics} />
                </label>
                <span className="jo-dim" style={{ fontSize: 11 }}>{L("แนบได้ไม่จำกัด", "အကန့်အသတ်မဲ့ တွဲနိုင်")} ({ed.images.length} {L("รูป", "ပုံ")})</span>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                <button className="btn-ghost sm" disabled={busy} onClick={() => setEd(null)}>{L("ยกเลิก", "မလုပ်တော့")}</button>
                <button className="btn-primary sm" disabled={busy || uploading} onClick={save}>{busy ? L("กำลังบันทึก…", "သိမ်းနေသည်…") : ed.id ? L("บันทึกการแก้ไข", "ပြင်ဆင်ချက် သိမ်း") : L("สร้างโน้ต", "မှတ်စု ဖန်တီး")}</button>
              </div>
            </div>
          ) : (
            <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginBottom: 12 }} onClick={() => setEd({ id: null, text: "", images: [] })}>
              <UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> {L("สร้างโน้ตใหม่", "မှတ်စုအသစ် ဖန်တီး")}
            </button>
          )}

          {/* ── รายการโน้ต (ใหม่สุดอยู่บน) ── */}
          {notes === null && <div className="empty sm">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div>}
          {notes && notes.length === 0 && <div className="empty" style={{ padding: 26 }}>{L("ยังไม่มีโน้ตในห้องนี้ — ปักนัดหมาย กติกา หรือข้อมูลสำคัญไว้ให้ทุกคนเห็น", "ဤအခန်းတွင် မှတ်စု မရှိသေး — ချိန်းဆို၊ စည်းကမ်း သို့ အရေးကြီးအချက်များ ပင်ထားပါ")}</div>}
          {notes && notes.length > 0 && shownNotes.length === 0 && <div className="empty sm">{L("ไม่พบโน้ตตามที่ค้นหา", "ရှာဖွေမှုအရ မှတ်စု မတွေ့")}</div>}
          {shownNotes.map((n) => {
            const a = staffById[n.author] || {};
            return (
              <div key={n.id} className="card" style={{ padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar url={a.avatar_url} name={a.name || L("ทีมงาน", "အဖွဲ့သား")} id={n.author} size={26} />
                  <b style={{ fontSize: 12.5 }}>{a.name || L("ทีมงาน", "အဖွဲ့သား")}</b>
                  <span className="jo-dim" style={{ fontSize: 11 }}>{fmtWhen(n.created_at)}{n.updated_at && n.updated_at !== n.created_at ? ` · ${L("แก้ไขแล้ว", "ပြင်ဆင်ပြီး")}` : ""}</span>
                  {canEdit(n) && (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button className="btn-ghost sm" style={{ padding: "1px 7px" }} title={L("แก้ไข", "ပြင်")} onClick={() => setEd({ id: n.id, text: n.text || "", images: Array.isArray(n.images) ? n.images : [] })}><UIcon name="edit" size={13} /></button>
                      <button className="btn-ghost sm danger" style={{ padding: "1px 7px" }} title={L("ลบ", "ဖျက်")} onClick={() => remove(n)}><UIcon name="trash" size={13} /></button>
                    </span>
                  )}
                </div>
                {n.text && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 6, lineHeight: 1.65 }}>{renderRich(n.text)}</div>}
                {Array.isArray(n.images) && n.images.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {n.images.map((u, i) => (
                      <img key={u + i} src={u} alt="" loading="lazy" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 9, border: "1px solid var(--line-2)", cursor: "zoom-in" }} onClick={() => window.open(u, "_blank")} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Job Picker Modal (send job link) ─── */
function JobPickerModal({ jobs, onPick, onClose }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [q, setQ] = React.useState("");
  const list = jobs.filter((j) => matchText(q, j.job_no, j.customerName, j.title)).slice(0, 60);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 500 }}>
        <div className="modal-head">
          <div className="modal-title">🔗 {L("ส่งลิงก์ใบงาน", "အလုပ်လင့်ခ် ပို့")}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <input className="inp" placeholder={L("ค้นหาเลขใบงาน หรือชื่อลูกค้า…", "အလုပ်နံပါတ် သို့ ဖောက်သည်အမည် ရှာဖွေ…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="tc-picklist">
            {list.length === 0 && <div className="empty sm">{L("ไม่พบใบงาน", "အလုပ် မတွေ့")}</div>}
            {list.map((j) => (
              <button key={j.job_no} className="tc-pickrow" onClick={() => onPick(j)}>
                <span style={{
                  background: "linear-gradient(135deg,#f59e0b,#d97706)",
                  borderRadius: 7, padding: "3px 9px", color: "#fff",
                  fontSize: 11.5, fontWeight: 700, flex: "none",
                }}>
                  {j.job_no}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700 }}>{j.customerName || "—"}</span>
                  {j.title ? <span style={{ color: "var(--ink-3)", fontSize: 12 }}> · {j.title}</span> : null}
                </span>
                <span style={{
                  background: jobStatusColor(j.status), color: "#fff",
                  fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: "2px 8px", flex: "none",
                }}>
                  {jobStatusLabel(j.status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
