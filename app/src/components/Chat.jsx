import React from "react";
import Combo from "./Combo";
import { listLineContacts, listLineMessages, sendLineMessage, sendLineImage, uploadChatImage, linkLineContact, markLineRead, listCustomers, listCustomerDocs, listJobOrders, listQuickReplies, addQuickReply, deleteQuickReply, setLineStage, setLineOwner, listStaff, getProfile } from "../lib/api";
import { TYPE_LABEL, DOC_FILTERS, stOf } from "../lib/docmeta";
import { supabase } from "../lib/supabase";
import { buildOrderConfirm } from "../lib/confirmText";
import { scheduleLabel } from "../lib/schedule";
import { fmtBaht, custCode } from "../lib/format";
import { UIcon } from "../icons";
import CustomerFormModal from "./CustomerFormModal";
import DocCapture from "./DocCapture";
import { sendDocFromNode } from "../lib/sendDoc";

const initial = (s) => (s || "?").trim()[0]?.toUpperCase() || "?";
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

export default function Chat({ role, onOpenDoc, onGoCustomers, onCreateBoq, onCreateSurvey }) {
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
  const [quickReplies, setQuickReplies] = React.useState([]);
  const [qrManage, setQrManage] = React.useState(false);
  const [newQr, setNewQr] = React.useState("");
  const [jobs, setJobs] = React.useState(null);       // cached job orders (loaded on first "ส่งคอนเฟิม")
  const [jobPicker, setJobPicker] = React.useState(null);
  const [sendMenuFor, setSendMenuFor] = React.useState(null); // doc entry whose "ส่งเป็น รูป/PDF" popup is open
  const [capJob, setCapJob] = React.useState(null); // { type, no, mode, to, label } → render off-screen + capture + send
  const startSend = (e, mode) => { setSendMenuFor(null); setCapJob({ type: e.type, no: e.no, mode, to: sel, label: `${TYPE_LABEL[e.type]} ${e.no}` }); flash("กำลังเตรียมเอกสาร…"); };
  const [infoDocs, setInfoDocs] = React.useState([]);
  const [loadingInfoDocs, setLoadingInfoDocs] = React.useState(false);
  const [infoDocF, setInfoDocF] = React.useState("all");
  const [showInfo, setShowInfo] = React.useState(false); // mobile info-panel toggle
  const [custForm, setCustForm] = React.useState(null);  // { initial, link } → opens the customer form modal
  const [staff, setStaff] = React.useState([]);
  const [myId, setMyId] = React.useState(null);
  const [stageF, setStageF] = React.useState("all");     // list filter by stage
  const [mineOnly, setMineOnly] = React.useState(false); // list filter: assigned to me
  const selRef = React.useRef(null);
  const endRef = React.useRef(null);

  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  async function loadContacts() { try { setContacts(await listLineContacts()); } catch (e) { flash("โหลดแชตไม่สำเร็จ: " + (e.message || e), true); } }

  async function loadQr() { try { setQuickReplies(await listQuickReplies()); } catch { /* ignore */ } }
  React.useEffect(() => {
    loadContacts(); loadQr();
    listCustomers().then(setCusts).catch(() => {});
    listStaff().then(setStaff).catch(() => {});
    getProfile().then((p) => setMyId(p?.id || null)).catch(() => {});
  }, []);
  const staffMap = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);
  async function changeStage(s) { try { await setLineStage(sel, s); await loadContacts(); } catch (e) { flash("เปลี่ยนสถานะไม่สำเร็จ: " + (e.message || e), true); } }
  async function changeOwner(uid) { try { await setLineOwner(sel, uid || null); await loadContacts(); } catch (e) { flash("มอบหมายไม่สำเร็จ: " + (e.message || e), true); } }
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

  // document + job history for the linked customer (right info panel)
  const linkedCustId = (contacts.find((c) => c.line_user_id === sel) || {}).customer_id || null;
  React.useEffect(() => {
    if (!linkedCustId) { setInfoDocs([]); return; }
    setInfoDocF("all"); setLoadingInfoDocs(true);
    listCustomerDocs(linkedCustId).then(setInfoDocs).catch(() => setInfoDocs([])).finally(() => setLoadingInfoDocs(false));
  }, [linkedCustId]);

  async function openContact(c) {
    setSel(c.line_user_id); setShowThread(true); setShowInfo(false);
    try { setMsgs(await listLineMessages(c.line_user_id)); if (c.unread) { markLineRead(c.line_user_id); loadContacts(); } }
    catch (e) { flash("โหลดข้อความไม่สำเร็จ", true); }
  }

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
      if (wasLink && id) await linkLineContact(sel, id);
      setCusts(await listCustomers());
      await loadContacts();
      if (linkedCustId) listCustomerDocs(linkedCustId).then(setInfoDocs).catch(() => {});
      flash(wasLink ? "เพิ่มลูกค้า + เชื่อมแล้ว ✓" : "บันทึกข้อมูลลูกค้าแล้ว ✓");
    } catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
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

  // send an image: upload to storage → push the public URL to LINE
  async function onImage(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !sel || sending) return;
    setSending(true);
    try { const url = await uploadChatImage(f); await sendLineImage(sel, url); }
    catch (ex) { flash("ส่งรูปไม่สำเร็จ: " + (ex.message || ex), true); }
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
  async function addQr() { const t = newQr.trim(); if (!t) return; try { await addQuickReply(t); setNewQr(""); await loadQr(); } catch (e) { flash("เพิ่มไม่สำเร็จ: " + (e.message || e), true); } }
  async function delQr(id) { if (!window.confirm("ลบข้อความนี้?")) return; try { await deleteQuickReply(id); await loadQr(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

  const selContact = contacts.find((c) => c.line_user_id === sel);
  const ql = q.trim().toLowerCase();
  const shown = contacts.filter((c) =>
    (stageF === "all" || (c.stage || "new") === stageF)
    && (!mineOnly || c.assigned_to === myId)
    && (!ql || (c.display_name || "").toLowerCase().includes(ql) || (c.customerName || "").toLowerCase().includes(ql) || (c.last_message || "").toLowerCase().includes(ql)));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">แชต <span className="page-title-en">LINE OA</span></h1>
          <p className="page-sub">{contacts.length} ผู้ติดต่อ · คุยกับลูกค้า · เชื่อมกับ CRM</p></div>
      </div>

      <div className={"chat-wrap" + (showThread ? " show-thread" : "") + (showInfo ? " show-info" : "")}>
        {/* conversation list */}
        <div className="chat-list">
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
                  <div className="chat-convo-top"><b>{c.display_name || "LINE User"}</b><span>{fmtTime(c.last_message_at)}</span></div>
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
                  <div className="chat-thread-name">{selContact.display_name || "LINE User"}</div>
                  <div className="chat-thread-sub">{selContact.customerName ? `🔗 ${selContact.customerName}` : "ยังไม่เชื่อมลูกค้า"}</div>
                </div>
                <button className="chat-info-toggle" onClick={() => setShowInfo((s) => !s)} title="ข้อมูลลูกค้า"><UIcon name="building" size={18} /></button>
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
                        <span className="chat-bubble-time">{fmtTime(m.created_at)}{m.direction === "out" ? " · " + ((m.sent_by && staffMap[m.sent_by]) || "ส่งจากแอป") : ""}</span>
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
                    {quickReplies.map((qr) => (
                      <button key={qr.id} className="chat-qr" title={qr.text} onClick={() => insertQr(qr.text)}>
                        {qr.text.length > 22 ? qr.text.slice(0, 22) + "…" : qr.text}
                      </button>
                    ))}
                    <button className="chat-tool ghost" onClick={() => setQrManage(true)}>✏️ จัดการคำตอบ</button>
                  </div>
                  <div className="chat-compose">
                    <textarea className="inp" rows={1} value={text} placeholder={sending ? "กำลังส่ง…" : "พิมพ์ข้อความ…"}
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
          const shownDocs = infoDocs.filter((e) => infoDocF === "all" || e.type === infoDocF);
          const dcount = (t) => infoDocs.filter((e) => e.type === t).length;
          return (
            <div className={"chat-info" + (showInfo ? " open" : "")}>
              <div className="ci-head"><span>ข้อมูลลูกค้า</span>
                <button className="ci-close" onClick={() => setShowInfo(false)}><UIcon name="x" size={16} /></button></div>
              <div className="ci-body">
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
                  {cust.sites?.length > 0 && <div className="ci-row">🏠 <span>{cust.sites.length} ไซต์งาน</span></div>}
                  {canSend && <div className="ci-actions">
                    <button className="btn-primary sm" onClick={() => editCustomer(cust)}><UIcon name="edit" size={13} color="#fff" /> แก้ไขข้อมูล</button>
                    <button className="btn-ghost sm" onClick={() => onCreateSurvey && onCreateSurvey(cust.id)}>🔍 ใบงานสำรวจหน้างาน</button>
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
                              {sendable && canSend && <button className="cd-send" disabled={!!capJob} onClick={(ev) => { ev.stopPropagation(); setSendMenuFor(e); }}>📤 ส่ง</button>}
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
                <textarea className="inp" rows={2} value={newQr} onChange={(e) => setNewQr(e.target.value)} placeholder="พิมพ์ข้อความที่ใช้บ่อย…" />
                <button className="btn-primary" disabled={!newQr.trim()} onClick={addQr}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
              </div>
              <div className="qr-list">
                {quickReplies.length === 0 && <div className="empty" style={{ fontSize: 13 }}>ยังไม่มีข้อความบันทึกไว้</div>}
                {quickReplies.map((qr) => (
                  <div className="qr-item" key={qr.id}><span>{qr.text}</span>
                    <button className="qr-del" onClick={() => delQr(qr.id)}><UIcon name="trash" size={15} /></button></div>
                ))}
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
