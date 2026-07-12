import React from "react";
import { supabase } from "../lib/supabase";
import { listChatRooms, listChatMessages, sendChatMessage, sendChatImage, uploadChatImage, markChatRead, listStaff } from "../lib/api";
import { Avatar, RoomIcon } from "./TeamChat";   // ไอคอนห้อง/คนชุดเดียวกับหน้าแชตเต็ม
import { UIcon } from "../icons";

// แผงแชตทีมย่อ ลอยขวามือ ตามไปทุกเมนู — ทีมหลังบ้านเห็นความเคลื่อนไหว/ตอบแชตได้โดยไม่ต้องสลับหน้า
// ปุ่ม 💬 ลอย (มีตัวเลขยังไม่อ่านรวม) → เปิดแผง: รายชื่อห้อง ↔ ห้องสนทนา + ช่องพิมพ์/ส่งรูป
// ซ่อนบนจอเล็ก (มือถือใช้เมนูแชตทีมเต็มสะดวกกว่า) และซ่อนเมื่ออยู่หน้าแชตทีมอยู่แล้ว
export default function ChatDock({ me, hidden, onOpenFull }) {
  const [open, setOpen] = React.useState(() => localStorage.getItem("amc_cdock") === "1");
  const [rooms, setRooms] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [msgs, setMsgs] = React.useState([]);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const selRef = React.useRef(null); selRef.current = sel;
  const endRef = React.useRef(null);
  const timer = React.useRef(null);

  const totalUnread = rooms.reduce((a, r) => a + (r.unread || 0), 0);
  const staffName = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const staffById = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  async function loadRooms() { try { setRooms(await listChatRooms()); } catch { } }
  const queueLoadRooms = () => { clearTimeout(timer.current); timer.current = setTimeout(loadRooms, 800); };
  async function openRoom(id) {
    setSel(id);
    try { setMsgs(await listChatMessages(id, { limit: 60 })); markChatRead(id).then(loadRooms).catch(() => {}); }
    catch { setMsgs([]); }
  }

  React.useEffect(() => {
    loadRooms();
    listStaff().then(setStaff).catch(() => {});
    const ch = supabase.channel("chat-dock")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => {
        const m = p.new;
        if (m.room_id === selRef.current) {
          setMsgs((cur) => cur.some((x) => x.id === m.id) ? cur : [...cur, m]);
          markChatRead(m.room_id).catch(() => {});
        }
        queueLoadRooms();
      }).subscribe();
    return () => { supabase.removeChannel(ch); clearTimeout(timer.current); };
  }, []);
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);
  React.useEffect(() => { localStorage.setItem("amc_cdock", open ? "1" : "0"); }, [open]);

  async function send() {
    const t = text.trim(); if (!t || !sel || sending) return;
    setText(""); setSending(true);
    try { await sendChatMessage(sel, t); setMsgs(await listChatMessages(sel, { limit: 60 })); }
    catch { setText(t); }
    setSending(false);
  }
  async function onImage(e) {
    const fs = Array.from(e.target.files || []); e.target.value = "";
    if (!fs.length || !sel || sending) return;
    setSending(true);
    try { for (const f of fs) { const url = await uploadChatImage(f); await sendChatImage(sel, url); } setMsgs(await listChatMessages(sel, { limit: 60 })); }
    catch { }
    setSending(false);
  }

  if (hidden) return null;
  if (!open) return (
    <button className="cdock-fab" title="แชตทีม" onClick={() => setOpen(true)}>
      💬{totalUnread > 0 && <span className="cdock-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>}
    </button>
  );

  const selRoom = rooms.find((r) => r.id === sel);
  return (
    <div className="cdock">
      <div className="cdock-head">
        {selRoom ? (<>
          <button className="cdock-ic" title="กลับรายชื่อห้อง" onClick={() => { setSel(null); loadRooms(); }}>‹</button>
          <RoomIcon room={selRoom} size={28} staffById={staffById} />
          <b className="cdock-title">{selRoom.title}</b>
        </>) : <b className="cdock-title">💬 แชตทีม{totalUnread > 0 ? ` · ยังไม่อ่าน ${totalUnread}` : ""}</b>}
        <button className="cdock-ic" title="เปิดหน้าแชตทีมเต็ม" onClick={onOpenFull}><UIcon name="chevR" size={14} /></button>
        <button className="cdock-ic" title="ย่อ" onClick={() => setOpen(false)}><UIcon name="x" size={15} /></button>
      </div>

      {!selRoom ? (
        <div className="cdock-rooms">
          {rooms.length === 0 && <div className="empty sm">กำลังโหลด…</div>}
          {rooms.map((r) => (
            <button key={r.id} className="cdock-room" onClick={() => openRoom(r.id)}>
              <RoomIcon room={r} size={36} staffById={staffById} />
              <span className="cdock-room-mid">
                <span className="cdock-room-t">{r.title}{r.kind !== "dm" && r.memberCount ? <span className="cdock-room-cnt"> · {r.memberCount} คน</span> : null}</span>
                <span className="cdock-room-l">{r.lastText || "—"}</span>
              </span>
              {r.unread > 0 && <span className="chat-unread">{r.unread}</span>}
            </button>
          ))}
        </div>
      ) : (<>
        <div className="cdock-msgs">
          {msgs.map((m) => {
            const out = m.sender === me?.id;
            return (
              <div key={m.id} className={"tc-msg-row" + (out ? " out" : "")}>
                {!out && <Avatar url={staffById[m.sender]?.avatar_url} name={staffName[m.sender] || "T"} id={m.sender} cls="tc-msg-av" />}
                <div className={"chat-bubble " + (out ? "out" : "in")}>
                  {!out && <span className="chat-sender">{staffName[m.sender] || "ทีมงาน"}</span>}
                  {m.image_url ? (
                    <a href={m.image_url} target="_blank" rel="noreferrer"><img className="chat-img" style={{ maxWidth: 190, maxHeight: 210 }} src={m.image_url} alt="" /></a>
                  ) : m.file_url ? (
                    <a className="chat-file" href={m.file_url} target="_blank" rel="noreferrer">📎 {m.file_name || "เปิดไฟล์"}</a>
                  ) : <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</span>}
                  <span className="chat-bubble-time">{new Date(m.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="cdock-compose">
          <label className={"chat-tool" + (sending ? " disabled" : "")} title="ส่งรูป">
            📷<input type="file" accept="image/*" multiple hidden disabled={sending} onChange={onImage} />
          </label>
          <textarea className="inp" rows={1} value={text} placeholder={sending ? "กำลังส่ง…" : "พิมพ์ข้อความ…"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn-primary sm" disabled={sending || !text.trim()} onClick={send}>ส่ง</button>
        </div>
      </>)}
    </div>
  );
}
