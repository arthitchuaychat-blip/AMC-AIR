import React from "react";
import { supabase } from "../lib/supabase";
import { listChatRooms, listChatMessages, sendChatMessage, sendChatImage, sendChatFile, unsendChatMessage, createDmRoom, createChatRoom, markChatRead, listStaff, getProfile, uploadChatImage, listJobOrders, listRoomMembers, addChatMember, removeChatMember } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { matchText, ATTACH_ACCEPT } from "../lib/format";

const UNSEND_MS = 10 * 60 * 1000; // ยกเลิกข้อความได้ภายใน 10 นาที
import { pushSupported, notifyPermission, enablePush } from "../lib/push";
import { UIcon } from "../icons";

// header button to turn on LINE-style push notifications for this device
function NotifyButton() {
  const [perm, setPerm] = React.useState(notifyPermission());
  const [busy, setBusy] = React.useState(false);
  if (!pushSupported()) return null;
  if (perm === "denied") return <span className="tc-notify off" title="เปิดสิทธิ์แจ้งเตือนได้ในตั้งค่าเบราว์เซอร์">🔕 แจ้งเตือนถูกปิด</span>;
  if (perm === "granted") return <span className="tc-notify on">🔔 แจ้งเตือนเปิดอยู่</span>;
  return (
    <button className="btn-primary sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await enablePush(); setPerm(notifyPermission()); }
      catch (e) { alert(e.message || "เปิดแจ้งเตือนไม่สำเร็จ"); }
      setBusy(false);
    }}>🔔 เปิดแจ้งเตือน</button>
  );
}

const KIND_ICON = { company: "🏢", dm: "👤", group: "👥", project: "🧰" };
const OFFICE = ["admin", "exec", "finance", "sales"]; // back-office: may manage group members

export default function TeamChat() {
  const [me, setMe] = React.useState(null);
  const [rooms, setRooms] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [msgs, setMsgs] = React.useState([]);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [modal, setModal] = React.useState(null); // "dm" | "group"
  const [jobs, setJobs] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const endRef = React.useRef(null);
  const selRef = React.useRef(null);
  selRef.current = sel;

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const staffName = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);

  async function loadRooms() { try { setRooms(await listChatRooms()); } catch (e) { /* ignore */ } }
  async function loadMsgs(roomId) { try { setMsgs(await listChatMessages(roomId)); } catch { setMsgs([]); } }

  React.useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([getProfile(), listStaff()]);
      setMe(p); setStaff(s);
    })();
    loadRooms();
    // realtime: any new message → refresh room list; if it's the open room, append + mark read
    const ch = supabase.channel("team-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new;
        if (m.room_id === selRef.current) {
          setMsgs((cur) => cur.some((x) => x.id === m.id) ? cur : [...cur, m]);
          markChatRead(m.room_id).catch(() => {});
        }
        loadRooms();
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  React.useEffect(() => {
    if (!sel) return;
    loadMsgs(sel);
    markChatRead(sel).then(loadRooms).catch(() => {});
  }, [sel]);

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function send() {
    const t = text.trim(); if (!t || !sel || sending) return;
    setText(""); setSending(true);
    try { await sendChatMessage(sel, t); await loadMsgs(sel); } catch (e) { flash("ส่งไม่สำเร็จ"); setText(t); }
    setSending(false);
  }
  async function onImage(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel) return;
    setSending(true);
    try { const url = await uploadChatImage(f); await sendChatImage(sel, url); await loadMsgs(sel); } catch { flash("ส่งรูปไม่สำเร็จ"); }
    setSending(false);
  }
  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel) return;
    setSending(true);
    try { const url = await uploadChatImage(f); await sendChatFile(sel, url, f.name); await loadMsgs(sel); } catch (err) { flash("ส่งไฟล์ไม่สำเร็จ: " + (err?.message || err)); }
    setSending(false);
  }
  async function openDm(otherId) {
    try { const id = await createDmRoom(otherId); setModal(null); await loadRooms(); setSel(id); } catch (e) { flash("เปิดแชตไม่สำเร็จ: " + (e?.message || e)); }
  }

  const selRoom = rooms.find((r) => r.id === sel);
  const shown = rooms.filter((r) => matchText(q, r.title, r.lastText));

  return (
    <div className="adm tc-wrap">
      <div className="adm-head">
        <div><h1 className="page-title">แชตทีม <span className="page-title-en">Team Chat</span></h1>
          <p className="page-sub">คุยกันภายในองค์กร · ห้องรวม · ทักตัวต่อตัว · กลุ่ม · ห้องงาน</p></div>
        <div className="cat-head-actions"><NotifyButton /></div>
      </div>

      <div className="tc-board">
        {/* rooms */}
        <div className="tc-rooms">
          <div className="tc-rooms-top">
            <div className="cat-search" style={{ flex: 1 }}><UIcon name="search" size={16} color="var(--ink-3)" />
              <input placeholder="ค้นหาห้อง" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="tc-rooms-acts">
            <button className="btn-ghost sm" onClick={() => setModal("dm")}><UIcon name="plus" size={13} /> ทักตัวต่อตัว</button>
            <button className="btn-ghost sm" onClick={() => { setModal("group"); if (!jobs.length) listJobOrders().then(setJobs).catch(() => {}); }}><UIcon name="plus" size={13} /> สร้างกลุ่ม</button>
          </div>
          <div className="tc-room-list">
            {shown.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ยังไม่มีห้องแชต</div>}
            {shown.map((r) => (
              <button key={r.id} className={"tc-room" + (sel === r.id ? " on" : "")} onClick={() => setSel(r.id)}>
                <span className="tc-room-ic">{KIND_ICON[r.kind] || "💬"}</span>
                <span className="tc-room-mid">
                  <span className="tc-room-title">{r.title}{r.kind !== "dm" && r.memberCount ? <span className="tc-room-cnt"> · {r.memberCount}</span> : null}</span>
                  <span className="tc-room-last">{r.lastText || "—"}</span>
                </span>
                {r.unread > 0 && <span className="chat-unread">{r.unread}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* messages */}
        <div className="tc-main">
          {!selRoom ? (
            <div className="tc-empty"><UIcon name="chat" size={40} color="var(--ink-3)" /><p>เลือกห้องแชตเพื่อเริ่มคุย</p></div>
          ) : (
            <>
              <div className="tc-main-head">
                <span className="tc-room-ic">{KIND_ICON[selRoom.kind]}</span>
                <div style={{ flex: 1 }}><div className="tc-main-title">{selRoom.title}</div>
                  <div className="tc-main-sub">{selRoom.kind === "company" ? "ทุกคนในองค์กร" : selRoom.kind === "dm" ? "แชตส่วนตัว" : (selRoom.memberNames || []).concat(me?.name ? [me.name] : []).join(", ")}{selRoom.ref_no ? ` · งาน ${selRoom.ref_no}` : ""}</div></div>
                {OFFICE.includes(me?.role) && (selRoom.kind === "group" || selRoom.kind === "project") &&
                  <button className="btn-ghost sm" onClick={() => setModal("members")}><UIcon name="user" size={14} /> จัดการสมาชิก</button>}
              </div>
              <div className="tc-msgs">
                {msgs.map((m) => {
                  const out = m.sender === me?.id;
                  const canUnsend = out && !m.deleted && (Date.now() - new Date(m.created_at).getTime() < UNSEND_MS);
                  async function unsend() {
                    if (!await confirmDialog("ยกเลิกข้อความนี้? (ลบให้ทุกคนในห้องเห็น)")) return;
                    try { await unsendChatMessage(m.id); await loadMsgs(sel); } catch (e) { flash("ยกเลิกไม่สำเร็จ: " + (e?.message || e)); }
                  }
                  return (
                    <div className={"chat-bubble " + (out ? "out" : "in")} key={m.id}>
                      {!out && <span className="chat-sender">{staffName[m.sender] || "ทีมงาน"}</span>}
                      {m.deleted
                        ? <span className="chat-unsent">🚫 ยกเลิกข้อความแล้ว</span>
                        : m.image_url ? <a href={m.image_url} target="_blank" rel="noreferrer"><img className="chat-img" src={m.image_url} alt="" /></a>
                        : m.file_url ? <a className="chat-file" href={m.file_url} target="_blank" rel="noreferrer">📎 {m.file_name || "เปิดไฟล์"}</a>
                        : <span>{m.text}</span>}
                      <span className="chat-bubble-time">{new Date(m.created_at).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {canUnsend && <button className="chat-unsend-btn" onClick={unsend} title="ยกเลิกข้อความ (ภายใน 10 นาที)">ยกเลิก</button>}</span>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="chat-compose">
                <label className={"chat-tool" + (sending ? " disabled" : "")}>📷<input type="file" accept="image/*" hidden disabled={sending} onChange={onImage} /></label>
                <label className={"chat-tool" + (sending ? " disabled" : "")}>📎<input type="file" accept={ATTACH_ACCEPT} hidden disabled={sending} onChange={onFile} /></label>
                <textarea className="inp" rows={3} value={text} placeholder={sending ? "กำลังส่ง…" : "พิมพ์ข้อความ… (Enter ส่ง · Shift+Enter ขึ้นบรรทัด)"}
                  onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button className="btn-primary" disabled={!text.trim() || sending} onClick={send}>ส่ง</button>
              </div>
            </>
          )}
        </div>
      </div>

      {modal === "dm" && <DmModal staff={staff.filter((s) => s.id !== me?.id)} onPick={openDm} onClose={() => setModal(null)} />}
      {modal === "group" && <GroupModal staff={staff.filter((s) => s.id !== me?.id)} jobs={jobs}
        onCreate={async (payload) => { try { const id = await createChatRoom(payload); setModal(null); await loadRooms(); setSel(id); } catch (e) { flash("สร้างกลุ่มไม่สำเร็จ: " + (e?.message || e)); } }}
        onClose={() => setModal(null)} />}
      {modal === "members" && selRoom && <MembersModal room={selRoom} staff={staff} onClose={() => setModal(null)} onChanged={loadRooms} flash={flash} />}
      {toast && <div className="tc-toast">{toast}</div>}
    </div>
  );
}

function DmModal({ staff, onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const list = staff.filter((s) => matchText(q, s.name, s.email));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-head"><div className="modal-title">ทักตัวต่อตัว</div><button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button></div>
        <div className="modal-body">
          <input className="inp" placeholder="ค้นหาชื่อพนักงาน" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="tc-picklist">
            {list.map((s) => (
              <button key={s.id} className="tc-pickrow" onClick={() => onPick(s.id)}>
                <span className="tc-av">{(s.name || "?")[0]}</span><span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupModal({ staff, jobs, onCreate, onClose }) {
  const [name, setName] = React.useState("");
  const [sel, setSel] = React.useState({});
  const [jobNo, setJobNo] = React.useState("");
  const [q, setQ] = React.useState("");
  const list = staff.filter((s) => matchText(q, s.name, s.email));
  const ids = Object.keys(sel).filter((k) => sel[k]);
  const job = jobs.find((j) => j.job_no === jobNo);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">สร้างกลุ่ม / ห้องงาน</div><button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>ชื่อกลุ่ม</span><input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ทีมหน้างาน ABC" /></label>
          <label className="fld" style={{ marginTop: 8 }}><span>ผูกกับใบงาน (ไม่บังคับ → กลายเป็นห้องงาน)</span>
            <select className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)}>
              <option value="">— ไม่ผูก —</option>
              {jobs.slice(0, 200).map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.customerName || "-"}{j.title ? ` · ${j.title}` : ""}</option>)}
            </select>
          </label>
          <div className="fld" style={{ marginTop: 8 }}><span>สมาชิก ({ids.length})</span>
            <input className="inp" placeholder="ค้นหาพนักงาน" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
            <div className="tc-picklist">
              {list.map((s) => (
                <label key={s.id} className="tc-checkrow">
                  <input type="checkbox" checked={!!sel[s.id]} onChange={(e) => setSel((c) => ({ ...c, [s.id]: e.target.checked }))} />
                  <span className="tc-av">{(s.name || "?")[0]}</span><span>{s.name}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" style={{ width: "100%", marginTop: 10 }} disabled={!name.trim() && !job}
            onClick={() => onCreate({ name: name || (job ? `งาน ${job.job_no}` : "กลุ่ม"), memberIds: ids, refType: job ? "job" : null, refNo: job ? job.job_no : null })}>
            <UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> สร้างห้อง
          </button>
        </div>
      </div>
    </div>
  );
}

// back-office: add/remove members of a group or project room
function MembersModal({ room, staff, onClose, onChanged, flash }) {
  const [memberIds, setMemberIds] = React.useState(null); // null = loading
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const nameById = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  async function load() { try { setMemberIds(await listRoomMembers(room.id)); } catch (e) { flash("โหลดสมาชิกไม่สำเร็จ: " + (e?.message || e)); setMemberIds([]); } }
  React.useEffect(() => { load(); }, [room.id]);
  const set = new Set(memberIds || []);
  const add = async (uid) => { setBusy(true); try { await addChatMember(room.id, uid); await load(); onChanged && onChanged(); } catch (e) { flash("เพิ่มไม่สำเร็จ: " + (e?.message || e)); } setBusy(false); };
  const remove = async (uid) => { setBusy(true); try { await removeChatMember(room.id, uid); await load(); onChanged && onChanged(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e?.message || e)); } setBusy(false); };
  const others = staff.filter((s) => !set.has(s.id) && matchText(q, s.name, s.email));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">จัดการสมาชิก · {room.title}</div><button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button></div>
        <div className="modal-body">
          {memberIds === null ? <div className="empty">กำลังโหลด…</div> : <>
            <div className="fld"><span>สมาชิกในห้อง ({memberIds.length})</span>
              <div className="tc-picklist">
                {memberIds.length === 0 && <div className="empty sm">ยังไม่มีสมาชิก</div>}
                {memberIds.map((uid) => (
                  <div key={uid} className="tc-checkrow">
                    <span className="tc-av">{(nameById[uid]?.name || "?")[0]}</span>
                    <span style={{ flex: 1 }}>{nameById[uid]?.name || uid}</span>
                    <button className="btn-ghost sm danger" disabled={busy} onClick={() => remove(uid)}>นำออก</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="fld" style={{ marginTop: 10 }}><span>เพิ่มสมาชิก (พนักงาน/ช่าง)</span>
              <input className="inp" placeholder="ค้นหาชื่อ" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
              <div className="tc-picklist">
                {others.length === 0 && <div className="empty sm">ไม่พบ</div>}
                {others.map((s) => (
                  <div key={s.id} className="tc-checkrow">
                    <span className="tc-av">{(s.name || "?")[0]}</span>
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <button className="btn-ghost sm" disabled={busy} onClick={() => add(s.id)}>＋ เพิ่ม</button>
                  </div>
                ))}
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
