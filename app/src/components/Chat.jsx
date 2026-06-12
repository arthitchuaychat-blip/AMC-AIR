import React from "react";
import { listLineContacts, listLineMessages, sendLineMessage, linkLineContact, markLineRead, listCustomers } from "../lib/api";
import { supabase } from "../lib/supabase";
import { UIcon } from "../icons";

const initial = (s) => (s || "?").trim()[0]?.toUpperCase() || "?";
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDay = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "";

export default function Chat({ role }) {
  const canSend = ["admin", "sales", "exec", "finance"].includes(role);
  const [contacts, setContacts] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [sel, setSel] = React.useState(null);          // selected line_user_id
  const [msgs, setMsgs] = React.useState([]);
  const [text, setText] = React.useState("");
  const [q, setQ] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [showThread, setShowThread] = React.useState(false); // mobile pane toggle
  const [toast, setToast] = React.useState(null);
  const selRef = React.useRef(null);
  const endRef = React.useRef(null);

  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  async function loadContacts() { try { setContacts(await listLineContacts()); } catch (e) { flash("โหลดแชตไม่สำเร็จ: " + (e.message || e), true); } }

  React.useEffect(() => { loadContacts(); listCustomers().then(setCusts).catch(() => {}); }, []);
  React.useEffect(() => { selRef.current = sel; }, [sel]);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  // realtime: new messages + contact changes
  React.useEffect(() => {
    const ch = supabase.channel("line-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "line_messages" }, (p) => {
        const row = p.new;
        loadContacts();
        if (row.line_user_id === selRef.current) { setMsgs((m) => m.some((x) => x.id === row.id) ? m : [...m, row]); markLineRead(row.line_user_id); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "line_contacts" }, () => loadContacts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function openContact(c) {
    setSel(c.line_user_id); setShowThread(true);
    try { setMsgs(await listLineMessages(c.line_user_id)); if (c.unread) { markLineRead(c.line_user_id); loadContacts(); } }
    catch (e) { flash("โหลดข้อความไม่สำเร็จ", true); }
  }

  async function send() {
    const t = text.trim(); if (!t || !sel || sending) return;
    setSending(true);
    try { await sendLineMessage(sel, t); setText(""); }     // realtime INSERT appends the 'out' row
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setSending(false);
  }
  async function onLink(cid) {
    try { await linkLineContact(sel, cid); await loadContacts(); flash(cid ? "เชื่อมลูกค้าแล้ว ✓" : "ยกเลิกการเชื่อมแล้ว"); }
    catch (e) { flash("เชื่อมไม่สำเร็จ: " + (e.message || e), true); }
  }

  const selContact = contacts.find((c) => c.line_user_id === sel);
  const ql = q.trim().toLowerCase();
  const shown = contacts.filter((c) => !ql || (c.display_name || "").toLowerCase().includes(ql) || (c.customerName || "").toLowerCase().includes(ql) || (c.last_message || "").toLowerCase().includes(ql));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">แชต <span className="page-title-en">LINE OA</span></h1>
          <p className="page-sub">{contacts.length} ผู้ติดต่อ · คุยกับลูกค้า · เชื่อมกับ CRM</p></div>
      </div>

      <div className={"chat-wrap" + (showThread ? " show-thread" : "")}>
        {/* conversation list */}
        <div className="chat-list">
          <div className="chat-search"><UIcon name="search" size={16} color="var(--ink-3)" />
            <input placeholder="ค้นหาผู้ติดต่อ / ลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chat-convos">
            {shown.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ยังไม่มีผู้ติดต่อ — เมื่อลูกค้าทักเข้า LINE OA จะปรากฏที่นี่</div>}
            {shown.map((c) => (
              <button key={c.line_user_id} className={"chat-convo" + (sel === c.line_user_id ? " on" : "")} onClick={() => openContact(c)}>
                <div className="chat-av">{c.picture_url ? <img src={c.picture_url} alt="" /> : initial(c.display_name)}</div>
                <div className="chat-convo-body">
                  <div className="chat-convo-top"><b>{c.display_name || "LINE User"}</b><span>{fmtTime(c.last_message_at)}</span></div>
                  <div className="chat-convo-last">{c.last_message || "—"}</div>
                  {c.customerName && <span className="chat-link-chip">🔗 {c.customerName}</span>}
                </div>
                {c.unread > 0 && <span className="chat-unread">{c.unread}</span>}
              </button>
            ))}
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
                  <div className="chat-thread-name">{selContact.display_name || "LINE User"}</div>
                  <div className="chat-thread-sub">
                    {canSend ? (
                      <select className="chat-linksel" value={selContact.customer_id || ""} onChange={(e) => onLink(e.target.value || null)}>
                        <option value="">— ยังไม่เชื่อมลูกค้า —</option>
                        {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (selContact.customerName ? `🔗 ${selContact.customerName}` : "ยังไม่เชื่อมลูกค้า")}
                  </div>
                </div>
              </div>

              <div className="chat-msgs">
                {msgs.map((m, i) => {
                  const prev = msgs[i - 1];
                  const daySep = !prev || fmtDay(prev.created_at) !== fmtDay(m.created_at);
                  return (
                    <React.Fragment key={m.id}>
                      {daySep && <div className="chat-daysep">{fmtDay(m.created_at)}</div>}
                      <div className={"chat-bubble " + (m.direction === "out" ? "out" : "in")}>
                        {m.image_url ? <a href={m.image_url} target="_blank" rel="noreferrer"><img className="chat-img" src={m.image_url} alt="" /></a> : <span>{m.text}</span>}
                        <span className="chat-bubble-time">{fmtTime(m.created_at)}{m.direction === "out" ? " · ส่งจากแอป" : ""}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={endRef} />
              </div>

              {canSend ? (
                <div className="chat-compose">
                  <textarea className="inp" rows={1} value={text} placeholder="พิมพ์ข้อความ…"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button className="btn-primary" disabled={sending || !text.trim()} onClick={send}>{sending ? "…" : "ส่ง"}</button>
                </div>
              ) : <div className="chat-readonly">ดูได้อย่างเดียว — เฉพาะฝ่ายออฟฟิศตอบกลับได้</div>}
            </>
          )}
        </div>
      </div>
      {toast && <div className={"chat-toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
