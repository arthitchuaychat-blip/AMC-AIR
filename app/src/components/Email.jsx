import React from "react";
import { listEmailThreads, listEmailMessages, syncEmails, sendEmail, markEmailRead, setEmailOwner, listStaff } from "../lib/api";
import { can } from "../lib/permissions";

const fmtWhen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};
const fmtFull = (iso) => (iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const initials = (s) => (String(s || "?").trim()[0] || "?").toUpperCase();

export default function Email({ role, me }) {
  const [threads, setThreads] = React.useState(null);
  const [staff, setStaff] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [msgs, setMsgs] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [ownerF, setOwnerF] = React.useState("all");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const endRef = React.useRef(null);
  const myId = me?.id;
  const flash = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), 3200); };

  const staffMap = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  const ownerStaff = React.useMemo(() => staff.filter((s) => can(s.role, "email", "view")), [staff]);

  async function load() { try { setThreads(await listEmailThreads()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setThreads([]); } }
  async function refresh() {
    setSyncing(true);
    try { const r = await syncEmails(); await load(); if (r?.new) flash(`ดึงอีเมลใหม่ ${r.new} ฉบับ`); }
    catch (e) { flash("ดึงอีเมลไม่สำเร็จ: " + (e.message || e), true); }
    setSyncing(false);
  }
  React.useEffect(() => { listStaff().then(setStaff).catch(() => {}); load(); refresh(); /* eslint-disable-next-line */ }, []);

  async function open(t) {
    setSel(t); setMsgs(null); setText("");
    try { setMsgs(await listEmailMessages(t.thread_id)); } catch { setMsgs([]); }
    if (t.unread) { markEmailRead(t.thread_id).catch(() => {}); setThreads((ts) => (ts || []).map((x) => x.thread_id === t.thread_id ? { ...x, unread: false } : x)); }
  }
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function changeOwner(uid) {
    if (!sel) return;
    try {
      await setEmailOwner(sel.thread_id, uid || null);
      setThreads((ts) => (ts || []).map((x) => x.thread_id === sel.thread_id ? { ...x, assigned_to: uid || null } : x));
      setSel((s) => ({ ...s, assigned_to: uid || null }));
    } catch { flash("มอบหมายไม่สำเร็จ", true); }
  }

  async function send() {
    if (!sel || !text.trim()) return;
    setSending(true);
    try {
      const subj = /^re:/i.test(sel.subject || "") ? sel.subject : "Re: " + (sel.subject || "");
      await sendEmail({ threadId: sel.thread_id, to: sel.from_email, subject: subj, text });
      setText(""); setMsgs(await listEmailMessages(sel.thread_id));
      setThreads((ts) => (ts || []).map((x) => x.thread_id === sel.thread_id ? { ...x, snippet: text.slice(0, 120), last_message_at: new Date().toISOString() } : x));
      flash("ส่งอีเมลแล้ว ✓");
    } catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setSending(false);
  }

  const shown = (threads || []).filter((t) =>
    (ownerF === "all" ? true : ownerF === "me" ? t.assigned_to === myId : ownerF === "none" ? !t.assigned_to : t.assigned_to === ownerF)
    && (!unreadOnly || t.unread)
    && (!q.trim() || [t.subject, t.from_name, t.from_email, t.snippet].some((v) => String(v || "").toLowerCase().includes(q.toLowerCase()))));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">อีเมล <span className="page-title-en">Email</span></h1>
          <p className="page-sub">{(threads || []).length} บทสนทนา · info@amcair.net</p></div>
        <button className="btn-ghost" onClick={refresh} disabled={syncing}>{syncing ? "⏳ กำลังดึง…" : "🔄 รีเฟรช"}</button>
      </div>

      <div className={"chat-wrap" + (sel ? " show-thread" : "")} style={{ position: "relative" }}>
        {/* รายการอีเมล */}
        <div className="chat-list">
          <div className="chat-search"><input placeholder="ค้นหา หัวข้อ / ผู้ส่ง / ข้อความ" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="chat-listfilter">
            <select className="inp" value={ownerF} onChange={(e) => setOwnerF(e.target.value)} title="กรองผู้รับผิดชอบ">
              <option value="all">👥 ทุกผู้รับผิดชอบ</option>
              <option value="me">👤 ของฉัน</option>
              <option value="none">— ยังไม่มอบหมาย —</option>
              {ownerStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className={"chat-mine" + (unreadOnly ? " on" : "")} onClick={() => setUnreadOnly((v) => !v)} title="เฉพาะที่ยังไม่อ่าน">● ยังไม่อ่าน</button>
          </div>
          <div className="chat-convos">
            {threads === null && <div className="empty" style={{ fontSize: 13 }}>กำลังโหลด…</div>}
            {threads && shown.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ไม่พบอีเมล{unreadOnly ? "ที่ยังไม่อ่าน" : ""}</div>}
            {shown.map((t) => (
              <button key={t.thread_id} className={"chat-convo" + (sel?.thread_id === t.thread_id ? " on" : "")} onClick={() => open(t)}>
                <div className="chat-av">{initials(t.from_name || t.from_email)}</div>
                <div className="chat-convo-body">
                  <div className="chat-convo-top"><b>{t.from_name || t.from_email || "—"}</b><span>{fmtWhen(t.last_message_at)}</span></div>
                  <div className="chat-convo-last"><b style={{ color: "var(--ink)" }}>{t.subject || "(ไม่มีหัวข้อ)"}</b>{t.snippet ? " — " + t.snippet : ""}</div>
                  <div className="chat-convo-tags">
                    {t.assigned_to && staffMap[t.assigned_to] && <span className="conv-owner">👤 {staffMap[t.assigned_to]}</span>}
                  </div>
                </div>
                {t.unread && <span className="chat-unread">●</span>}
              </button>
            ))}
          </div>
        </div>

        {/* บทสนทนา */}
        <div className="chat-thread">
          {!sel ? <div className="chat-empty">เลือกอีเมลทางซ้ายเพื่อดู/ตอบ</div> : (
            <>
              <div className="chat-thread-head">
                <button className="chat-back" onClick={() => setSel(null)}>‹</button>
                <div className="chat-av sm">{initials(sel.from_name || sel.from_email)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="chat-thread-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel.subject || "(ไม่มีหัวข้อ)"}</div>
                  <div className="chat-thread-sub">✉️ {sel.from_name ? `${sel.from_name} · ` : ""}{sel.from_email}</div>
                </div>
                <select className="inp" style={{ maxWidth: 170 }} value={sel.assigned_to || ""} onChange={(e) => changeOwner(e.target.value || null)} title="ผู้รับผิดชอบ">
                  <option value="">— มอบหมาย —</option>
                  {ownerStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="chat-msgs">
                {msgs === null && <div className="empty" style={{ fontSize: 13 }}>กำลังโหลด…</div>}
                {(msgs || []).map((m) => {
                  const out = m.direction === "out";
                  return (
                    <div key={m.id} className={"chat-bubble " + (out ? "out" : "in")} style={{ maxWidth: "82%" }}>
                      <span className="chat-sender">{out ? (m.sent_by && staffMap[m.sent_by] ? staffMap[m.sent_by] : "AMC AIR") : (m.from_name || m.from_email)}</span>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13.5, lineHeight: 1.6 }}>{m.body_text || "(ไม่มีเนื้อหา)"}</div>
                      <time style={{ fontSize: 10.5, opacity: 0.7 }}>{fmtFull(m.created_at)}</time>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="chat-compose">
                <textarea className="inp chat-input" rows={4} value={text} placeholder={sending ? "กำลังส่ง…" : `ตอบกลับ ${sel.from_email}… (ส่งในนาม AMC AIR <info@amcair.net>)`}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
                <button className="btn-primary" disabled={sending || !text.trim()} onClick={send}>{sending ? "…" : "ส่ง"}</button>
              </div>
            </>
          )}
        </div>
      </div>
      {toast && <div className={"toast" + (toast.err ? " err" : "")} style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 50 }}>{toast.m}</div>}
    </div>
  );
}
