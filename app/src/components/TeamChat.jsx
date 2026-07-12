import React from "react";
import { supabase } from "../lib/supabase";
import { listChatRooms, listChatMessages, CHAT_PAGE, sendChatMessage, sendChatImage, sendChatFile, createDmRoom, createChatRoom, markChatRead, listStaff, getProfile, uploadChatImage, listJobOrders, listRoomMembers, addChatMember, removeChatMember, uploadAvatar, setMyAvatar, setRoomAvatar } from "../lib/api";
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
const OFFICE     = ["admin", "exec", "finance", "sales"];

// deterministic avatar color per user-id
const AV_COLORS = ["#0ea5e9","#10b981","#f59e0b","#8b5cf6","#ef4444","#ec4899","#14b8a6","#f97316"];
function avColor(id) {
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = (h * 31 + (id || "").charCodeAt(i)) & 0x7fffffff;
  return AV_COLORS[h % AV_COLORS.length];
}

// avatar: photo if set, else a coloured initial. cls picks the base style (tc-av / tc-msg-av / tc-room-ic)
function Avatar({ url, name, id, size, cls = "tc-av" }) {
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
// room icon: room photo if set, else the kind emoji on its gradient
function RoomIcon({ room, size = 44 }) {
  if (room.avatar_url) return (
    <span className="tc-room-ic tc-av-img" style={{ width: size, height: size }}><img src={room.avatar_url} alt="" /></span>
  );
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
  const [perm, setPerm] = React.useState(notifyPermission());
  const [busy, setBusy] = React.useState(false);
  if (!pushSupported()) return null;
  if (perm === "denied") return <span className="tc-notify off" title="เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์">🔕 ปิดแจ้งเตือน</span>;
  if (perm === "granted") return <span className="tc-notify on">🔔 เปิดอยู่</span>;
  return (
    <button className="btn-primary sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await enablePush(); setPerm(notifyPermission()); }
      catch (e) { alert(e.message || "เปิดแจ้งเตือนไม่สำเร็จ"); }
      setBusy(false);
    }}>🔔 เปิดแจ้งเตือน</button>
  );
}

const TYPE_TABS = [
  { k: "all",     label: "ทุกห้อง" },
  { k: "company", label: "🏢 บริษัท" },
  { k: "dm",      label: "👤 ส่วนตัว" },
  { k: "group",   label: "👥 กลุ่ม" },
  { k: "project", label: "🧰 งาน" },
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
  const endRef  = React.useRef(null);
  const selRef  = React.useRef(null);
  const taRef   = React.useRef(null);
  const msgsRef = React.useRef(null);          // กล่องข้อความ (ไว้คุมตำแหน่ง scroll)
  const keepScrollRef = React.useRef(null);    // จำ scroll ก่อนเติมข้อความเก่าด้านบน
  const roomsTimer = React.useRef(null);       // debounce โหลดรายชื่อห้องตอนข้อความ realtime รัว ๆ
  selRef.current = sel;

  const flash     = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const staffName = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const staffById = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  async function reloadMe() { try { const [p, s] = await Promise.all([getProfile(), listStaff()]); setMe(p); setStaff(s); } catch { /* ignore */ } }
  async function onMyAvatar(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    try { const url = await uploadAvatar(f); await setMyAvatar(url); await reloadMe(); loadRooms(); flash("เปลี่ยนรูปโปรไฟล์แล้ว ✓"); }
    catch (err) { flash("เปลี่ยนรูปไม่สำเร็จ: " + (err?.message || err)); }
  }
  async function onRoomAvatar(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel) return;
    try { const url = await uploadAvatar(f); await setRoomAvatar(sel, url); await loadRooms(); flash("เปลี่ยนรูปกลุ่มแล้ว ✓"); }
    catch (err) { flash("เปลี่ยนรูปกลุ่มไม่สำเร็จ: " + (err?.message || err)); }
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
    } catch { keepScrollRef.current = null; flash("โหลดข้อความเก่าไม่สำเร็จ"); }
  }
  async function ensureJobs() { if (!jobs.length) { try { setJobs(await listJobOrders()); } catch { } } }

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
      }).subscribe();
    return () => { supabase.removeChannel(ch); clearTimeout(roomsTimer.current); };
  }, []);

  React.useEffect(() => { if (focus == null) return; setSel(Number(focus)); onFocusConsumed && onFocusConsumed(); }, [focus]);
  React.useEffect(() => {
    if (!sel) return;
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

  async function send() {
    const t = text.trim(); if (!t || !sel || sending) return;
    const ids = extractMentionIds(t);
    setText(""); setMentionQ(null); setSending(true);
    try { await sendChatMessage(sel, t, ids); await loadMsgs(sel); } catch { flash("ส่งไม่สำเร็จ"); setText(t); }
    setSending(false);
  }
  const isImg = (f) => (f.type || "").startsWith("image/") || /\.(heic|heif)$/i.test(f.name || "");
  // ส่งรูปได้ทีละหลายรูป (เลือกหลายไฟล์ / วางจากคลิปบอร์ด) — อัปโหลดย่อ+แปลง HEIC ให้อัตโนมัติ
  async function sendImages(files) {
    if (!files.length || !sel || sending) return;
    setSending(true);
    try { for (const f of files) { const url = await uploadChatImage(f); await sendChatImage(sel, url); } await loadMsgs(sel); }
    catch { flash("ส่งรูปไม่สำเร็จ"); }
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
    try { const url = await uploadChatImage(f); await sendChatFile(sel, url, f.name); await loadMsgs(sel); } catch (err) { flash("ส่งไฟล์ไม่สำเร็จ: " + (err?.message || err)); }
    setSending(false);
  }
  async function sendJobCard(j) {
    if (!sel) return;
    const safe = (s) => (s || "").replace(/[|[\]]/g, "");
    const msg = `[JOBCARD|${safe(j.job_no)}|${safe(j.customerName)}|${safe(j.status)}|${safe(j.title)}]`;
    setModal(null); setSending(true);
    try { await sendChatMessage(sel, msg); await loadMsgs(sel); } catch { flash("ส่งลิงก์งานไม่สำเร็จ"); }
    setSending(false);
  }
  async function openDm(otherId) {
    try { const id = await createDmRoom(otherId); setModal(null); await loadRooms(); setSel(id); }
    catch (e) { flash("เปิดแชตไม่สำเร็จ: " + (e?.message || e)); }
  }

  const selRoom = rooms.find((r) => r.id === sel);
  const kindCounts = React.useMemo(() => {
    const c = {};
    rooms.forEach((r) => { c[r.kind] = (c[r.kind] || 0) + 1; });
    return c;
  }, [rooms]);
  const shown = rooms.filter((r) =>
    matchText(q, r.title, r.lastText) && (kindF === "all" || r.kind === kindF)
  );

  const accentColor = selRoom
    ? { company: "#764ba2", dm: "#0284c7", group: "#059669", project: "#d97706" }[selRoom.kind] || "#059669"
    : "#059669";

  return (
    <div className="adm tc-wrap">
      <div className="adm-head">
        <div>
          <h1 className="page-title">แชตทีม <span className="page-title-en">Team Chat</span></h1>
          <p className="page-sub">คุยกันภายในองค์กร · ห้องรวม · ทักตัวต่อตัว · กลุ่ม · ห้องงาน</p>
        </div>
        <div className="cat-head-actions">
          <label className="tc-myav" title="เปลี่ยนรูปโปรไฟล์ของฉัน">
            <Avatar url={me?.avatar_url} name={me?.name} id={me?.id} size={36} />
            <span className="tc-myav-cam">📷</span>
            <input type="file" accept="image/*" hidden onChange={onMyAvatar} />
          </label>
          <NotifyButton />
        </div>
      </div>

      <div className="tc-board">
        {/* ── sidebar ── */}
        <div className="tc-rooms">
          <div className="tc-rooms-top">
            <div className="cat-search" style={{ flex: 1 }}>
              <UIcon name="search" size={16} color="var(--ink-3)" />
              <input placeholder="ค้นหาห้อง" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {/* type filter tabs */}
          <div className="tc-type-tabs">
            {TYPE_TABS.filter((t) => t.k === "all" || kindCounts[t.k]).map((t) => (
              <button key={t.k} className={"tc-type-tab" + (kindF === t.k ? " on" : "")} onClick={() => setKindF(t.k)}>
                {t.label}
                {t.k !== "all" && kindCounts[t.k]
                  ? <span className="tc-type-cnt">{kindCounts[t.k]}</span> : null}
              </button>
            ))}
          </div>

          <div className="tc-rooms-acts">
            <button className="btn-ghost sm" onClick={() => setModal("dm")}>
              <UIcon name="plus" size={13} /> ทักตัวต่อตัว
            </button>
            <button className="btn-ghost sm" onClick={() => { setModal("group"); ensureJobs(); }}>
              <UIcon name="plus" size={13} /> สร้างกลุ่ม
            </button>
          </div>

          <div className="tc-room-list">
            {shown.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ยังไม่มีห้องแชต</div>}
            {shown.map((r) => (
              <button key={r.id} className={"tc-room" + (sel === r.id ? " on" : "")} onClick={() => setSel(r.id)}>
                <RoomIcon room={r} size={40} />
                <span className="tc-room-mid">
                  <span className="tc-room-title">
                    {r.title}
                    {r.kind !== "dm" && r.memberCount
                      ? <span className="tc-room-cnt"> · {r.memberCount} คน</span> : null}
                  </span>
                  <span className="tc-room-last">{r.lastText || "—"}</span>
                </span>
                {r.unread > 0 && <span className="chat-unread">{r.unread}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── main chat area ── */}
        <div className="tc-main">
          {!selRoom ? (
            <div className="tc-empty">
              <div style={{ fontSize: 52, lineHeight: 1 }}>💬</div>
              <p style={{ fontWeight: 800, fontSize: 16 }}>เลือกห้องแชตเพื่อเริ่มคุย</p>
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", textAlign: "center", lineHeight: 1.7 }}>
                ทักตัวต่อตัว · สร้างกลุ่มทีมช่าง<br />หรือเลือกห้องบริษัทด้านซ้าย
              </p>
            </div>
          ) : (
            <>
              <div className="tc-main-head" style={{ borderTop: `3px solid ${accentColor}` }}>
                {OFFICE.includes(me?.role) && (selRoom.kind === "group" || selRoom.kind === "project") ? (
                  <label className="tc-roomav-edit" title="เปลี่ยนรูปกลุ่ม">
                    <RoomIcon room={selRoom} size={42} />
                    <span className="tc-myav-cam">📷</span>
                    <input type="file" accept="image/*" hidden onChange={onRoomAvatar} />
                  </label>
                ) : <RoomIcon room={selRoom} size={42} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tc-main-title">{selRoom.title}</div>
                  <div className="tc-main-sub">
                    {selRoom.kind === "company" ? "ทุกคนในองค์กร"
                      : selRoom.kind === "dm" ? "แชตส่วนตัว"
                      : (selRoom.memberNames || []).concat(me?.name ? [me.name] : []).join(", ")}
                    {selRoom.ref_no ? ` · งาน ${selRoom.ref_no}` : ""}
                  </div>
                </div>
                {OFFICE.includes(me?.role) && (selRoom.kind === "group" || selRoom.kind === "project") &&
                  <button className="btn-ghost sm" onClick={() => setModal("members")}>
                    <UIcon name="user" size={14} /> สมาชิก
                  </button>}
              </div>

              <div className="tc-msgs" ref={msgsRef}>
                {hasMore && (
                  <button className="btn-ghost sm" style={{ alignSelf: "center", margin: "2px auto 10px", display: "block" }} onClick={loadOlder}>
                    ⌃ ดูข้อความเก่าก่อนหน้า
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
                        {!out && !jc && (
                          <span className="chat-sender" style={{ color: avColor(m.sender) }}>
                            {staffName[m.sender] || "ทีมงาน"}
                          </span>
                        )}
                        {jc ? (
                          <div className={"tc-job-card" + (out ? " out" : "")}>
                            <div className="tc-job-card-tag">📋 ลิงก์ใบงาน</div>
                            <div className="tc-job-card-no">{jc.job_no}</div>
                            <div className="tc-job-card-cust">{jc.customer || "—"}</div>
                            {jc.title && <div className="tc-job-card-title">{jc.title}</div>}
                            <div className="tc-job-card-foot">
                              <span style={{ background: jobStatusColor(jc.status), color: "#fff", fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: "2px 8px" }}>
                                {jobStatusLabel(jc.status)}
                              </span>
                              {onJobClick && (
                                <button className="tc-job-card-btn" onClick={() => onJobClick(jc.job_no)}>
                                  เปิดดูงาน →
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
                          <a className="chat-file" href={m.file_url} target="_blank" rel="noreferrer">📎 {m.file_name || "เปิดไฟล์"}</a>
                        ) : (
                          <span>{renderRich(m.text)}</span>
                        )}
                        {!jc && (
                          <span className="chat-bubble-time">
                            {new Date(m.created_at).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
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
              <div className="chat-compose">
                <label className={"chat-tool" + (sending ? " disabled" : "")} title="ส่งรูป (เลือกได้หลายรูป)">
                  📷<input type="file" accept="image/*" multiple hidden disabled={sending} onChange={onImage} />
                </label>
                <label className={"chat-tool" + (sending ? " disabled" : "")} title="ส่งไฟล์">
                  📎<input type="file" accept={ATTACH_ACCEPT} hidden disabled={sending} onChange={onFile} />
                </label>
                <button className={"chat-tool" + (!sel || sending ? " disabled" : "")} title="ส่งลิงก์ใบงาน"
                  onClick={() => { if (sel && !sending) { ensureJobs(); setModal("joblink"); } }}>
                  🔗
                </button>
                <textarea ref={taRef} className="inp" rows={3} value={text} onPaste={onPaste}
                  placeholder={sending ? "กำลังส่ง…" : "พิมพ์ข้อความ… (Enter ส่ง · @ แท็กสมาชิก · วางรูปได้)"}
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
                <button className="btn-primary" disabled={!text.trim() || sending} onClick={send}>ส่ง</button>
              </div>
            </>
          )}
        </div>
      </div>

      {modal === "dm"      && <DmModal staff={staff.filter((s) => s.id !== me?.id)} onPick={openDm} onClose={() => setModal(null)} />}
      {modal === "group"   && <GroupModal staff={staff.filter((s) => s.id !== me?.id)} jobs={jobs}
        onCreate={async (payload) => {
          try { const id = await createChatRoom(payload); setModal(null); await loadRooms(); setSel(id); }
          catch (e) { flash("สร้างกลุ่มไม่สำเร็จ: " + (e?.message || e)); }
        }} onClose={() => setModal(null)} />}
      {modal === "members" && selRoom && <MembersModal room={selRoom} staff={staff} onClose={() => setModal(null)} onChanged={loadRooms} flash={flash} />}
      {modal === "joblink" && <JobPickerModal jobs={jobs} onPick={sendJobCard} onClose={() => setModal(null)} />}
      {toast && <div className="tc-toast">{toast}</div>}
    </div>
  );
}

/* ─── DM Modal ─── */
function DmModal({ staff, onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const list = staff.filter((s) => matchText(q, s.name, s.email));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-head">
          <div className="modal-title">👤 ทักตัวต่อตัว</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <input className="inp" placeholder="ค้นหาชื่อพนักงาน" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
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
  const [name, setName]   = React.useState("");
  const [sel, setSel]     = React.useState({});
  const [jobNo, setJobNo] = React.useState("");
  const [q, setQ]         = React.useState("");
  const [techOnly, setTechOnly] = React.useState(false);

  const techRoles = ["lead_tech", "tech"];
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
          <div className="modal-title">👥 สร้างกลุ่ม / ห้องงาน</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          {/* quick preset */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button className="btn-ghost sm" onClick={applyPreset("group")}
              style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none" }}>
              👥 กลุ่มทั่วไป
            </button>
            <button className="btn-ghost sm" onClick={applyTechPreset}
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", border: "none" }}>
              🔧 ทีมช่างทั้งหมด
            </button>
          </div>

          <label className="fld">
            <span>ชื่อกลุ่ม</span>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ทีมหน้างาน A หรือ ทีมช่าง B" />
          </label>

          <label className="fld" style={{ marginTop: 8 }}>
            <span>ผูกกับใบงาน (ไม่บังคับ → กลายเป็นห้องงาน 🧰)</span>
            <select className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)}>
              <option value="">— ไม่ผูก —</option>
              {jobs.slice(0, 200).map((j) => (
                <option key={j.job_no} value={j.job_no}>
                  {j.job_no} · {j.customerName || "-"}{j.title ? ` · ${j.title}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="fld" style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span>สมาชิก ({ids.length} คน)</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink-3)", marginLeft: "auto", cursor: "pointer" }}>
                <input type="checkbox" checked={techOnly} onChange={(e) => setTechOnly(e.target.checked)} />
                แสดงเฉพาะช่าง
              </label>
            </div>
            <input className="inp" placeholder="ค้นหาพนักงาน" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
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
            <UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> สร้างห้อง
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
  const [memberIds, setMemberIds] = React.useState(null);
  const [q, setQ]     = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const nameById = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  async function load() { try { setMemberIds(await listRoomMembers(room.id)); } catch (e) { flash("โหลดสมาชิกไม่สำเร็จ"); setMemberIds([]); } }
  React.useEffect(() => { load(); }, [room.id]);
  const set = new Set(memberIds || []);
  const add    = async (uid) => { setBusy(true); try { await addChatMember(room.id, uid); await load(); onChanged && onChanged(); } catch (e) { flash("เพิ่มไม่สำเร็จ: " + (e?.message || e)); } setBusy(false); };
  const remove = async (uid) => { setBusy(true); try { await removeChatMember(room.id, uid); await load(); onChanged && onChanged(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e?.message || e)); } setBusy(false); };
  const others = staff.filter((s) => !set.has(s.id) && matchText(q, s.name, s.email));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head">
          <div className="modal-title">👤 สมาชิก · {room.title}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          {memberIds === null ? <div className="empty">กำลังโหลด…</div> : (
            <>
              <div className="fld">
                <span>ในห้องนี้ ({memberIds.length} คน)</span>
                <div className="tc-picklist" style={{ marginTop: 6 }}>
                  {memberIds.length === 0 && <div className="empty sm">ยังไม่มีสมาชิก</div>}
                  {memberIds.map((uid) => (
                    <div key={uid} className="tc-checkrow">
                      <Avatar url={nameById[uid]?.avatar_url} name={nameById[uid]?.name} id={uid} />
                      <span style={{ flex: 1 }}>{nameById[uid]?.name || uid}</span>
                      <button className="btn-ghost sm danger" disabled={busy} onClick={() => remove(uid)}>นำออก</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="fld" style={{ marginTop: 10 }}>
                <span>เพิ่มสมาชิก</span>
                <input className="inp" placeholder="ค้นหาชื่อ" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6, marginTop: 4 }} />
                <div className="tc-picklist">
                  {others.length === 0 && <div className="empty sm">ไม่พบ</div>}
                  {others.map((s) => (
                    <div key={s.id} className="tc-checkrow">
                      <Avatar url={s.avatar_url} name={s.name} id={s.id} />
                      <span style={{ flex: 1 }}>{s.name}</span>
                      <button className="btn-ghost sm" disabled={busy} onClick={() => add(s.id)}>＋ เพิ่ม</button>
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

/* ─── Job Picker Modal (send job link) ─── */
function JobPickerModal({ jobs, onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const list = jobs.filter((j) => matchText(q, j.job_no, j.customerName, j.title)).slice(0, 60);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 500 }}>
        <div className="modal-head">
          <div className="modal-title">🔗 ส่งลิงก์ใบงาน</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <input className="inp" placeholder="ค้นหาเลขใบงาน หรือชื่อลูกค้า…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="tc-picklist">
            {list.length === 0 && <div className="empty sm">ไม่พบใบงาน</div>}
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
