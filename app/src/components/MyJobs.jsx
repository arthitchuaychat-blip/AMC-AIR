import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import { listJobOrders, updateJobStatus, updateVisitStatus, addJobLog } from "../lib/api";
import { UIcon } from "../icons";
import { slotDef, jobDays, parseYmd, thDayMon, scheduleLabel, JOB_STATUSES, ymd } from "../lib/schedule";
import JobTimeline, { Linkify } from "./JobTimeline";
import AttachThumb from "./AttachThumb";
import { buildJobBriefMy, useLang, JOB_STATUS_MY, MYJOB_TAB_MY } from "../lib/i18n";

const STATUS = Object.fromEntries(JOB_STATUSES.map(([v, l, cls]) => [v, { th: l, cls }]));
// ช่างเห็นทุกสถานะ (รวม "นัดหมายเพิ่ม") แต่ดูได้อย่างเดียวในสถานะ read-only ด้านล่าง
const TABS = [["todo", "ต้องทำ (วันนี้)"], ["upcoming", "งานที่กำลังจะมาถึง"], ["doing", "กำลังทำงาน"], ["awaiting", "รออนุมัติ"], ["reschedule", "นัดหมายเพิ่ม"], ["done", "เสร็จแล้ว"], ["cancelled", "ยกเลิกแล้ว"]];
// สถานะที่ช่างดูได้อย่างเดียว — แก้ไข/โพสต์/เบิกวัสดุไม่ได้
const TECH_READONLY = ["reschedule", "done", "cancelled"];

export default function MyJobs({ role, team, me, onWithdraw, onHandover }) {
  const lang = useLang(); // "my" เฉพาะช่างที่เลือกภาษาพม่า (ฝั่งหลังบ้าน = "th" เสมอ)
  const t = (th, my) => (lang === "my" ? my : th);
  const stLbl = (s) => (lang === "my" ? (JOB_STATUS_MY[s] || STATUS[s]?.th) : STATUS[s]?.th); // สถานะงาน (แปลตามภาษา)
  const allTeams = role === "lead_tech"; // หัวหน้าช่างเห็นงานทุกทีม
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [tab, setTab] = React.useState("todo"); // todo | doing | done
  const [expanded, setExpanded] = React.useState({}); // job_no → show full details/brief/timeline
  const [busy, setBusy] = React.useState(null); // job_no/visit id ที่กำลังอัปเดต — กันกดรัวตอนเน็ตช้า (log ซ้ำ)
  const toggle = (no) => setExpanded((e) => ({ ...e, [no]: !e[no] }));

  async function load() {
    if (!allTeams && !team) { setLoading(false); return; }
    setLoading(true);
    try {
      const all = await listJobOrders();
      // a job is "mine" if my team is on ANY of its visits (fallback: legacy assigned_team)
      const mine = allTeams ? all : all.filter((j) =>
        (j.visits && j.visits.length) ? j.visits.some((v) => v.assigned_team === team) : j.assigned_team === team);
      setList(mine);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [team, allTeams]);
  // ช่างเปิดแอปค้างทั้งวัน — กลับมาที่แอป (สลับจากไลน์/กล้อง) ให้โหลดงานใหม่เอง จะได้เห็นงานใหม่/เลื่อนนัด/ผลอนุมัติ
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [team, allTeams]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); }

  async function setStatus(jo, status) {
    const label = STATUS[status]?.th || status;
    if (!await confirmDialog(`ยืนยันเปลี่ยนสถานะงาน ${jo.job_no} เป็น "${label}" ?`)) return;
    setBusy(jo.job_no);
    try { await updateJobStatus(jo.job_no, status, me); flash("อัปเดตสถานะแล้ว"); await load(); }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(null);
  }
  async function setVStatus(jobNo, v, status) {
    const label = STATUS[status]?.th || status;
    // ขอนัดหมายเพิ่ม: ต้องบอกเหตุผลเสมอ (ของขาด/ลูกค้าไม่อยู่ ฯลฯ) — ออฟฟิศจะได้นัดใหม่ถูก · ลงไทม์ไลน์ให้อัตโนมัติ
    let reason = null;
    if (status === "reschedule") {
      reason = await confirmDialog({ title: t("ขอนัดหมายเพิ่มรอบนี้?", "ချိန်းဆိုမှု ထပ်တောင်းမလား?"), confirmText: t("ขอนัดเพิ่ม", "တောင်းဆို"),
        prompt: { label: t("เหตุผล (ออฟฟิศจะได้นัดใหม่ถูก)", "အကြောင်းပြချက်"), placeholder: t("เช่น ของไม่ครบ · ลูกค้าไม่อยู่ · งานเกินเวลา", "ဥပမာ ပစ္စည်းမပြည့်"), required: true } });
      if (reason === false) return;
    } else if (!await confirmDialog(`ยืนยันเปลี่ยนสถานะรอบนี้เป็น "${label}" ?`)) return;
    setBusy(v.id);
    try {
      await updateVisitStatus(v.id, jobNo, status, me);
      if (reason) await addJobLog(jobNo, { note: `📅 เหตุผลขอนัดหมายเพิ่ม: ${reason}`, photos: [], author: me }).catch(() => {});
      flash("อัปเดตรอบงานแล้ว"); await load();
    }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(null);
  }

  // the job's relevant scheduled datetime for THIS tech: earliest still-to-do visit (for my team), else any visit, else the job
  const jobAt = (jo) => {
    const vis = (jo.visits && jo.visits.length) ? (allTeams ? jo.visits : jo.visits.filter((v) => v.assigned_team === team)) : [];
    const active = vis.filter((v) => v.status === "pending" || v.status === "scheduled");
    const pool = (active.length ? active : vis).filter((v) => v.scheduled_at).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return pool[0]?.scheduled_at || jo.scheduled_at || null;
  };
  const todayY = ymd(new Date());
  const dayOf = (at) => (at ? ymd(new Date(at)) : null);
  const sortAsc = (a, b) => (jobAt(a) || "9999").localeCompare(jobAt(b) || "9999"); // nearest time first
  const todoAll = list.filter((j) => j.status === "pending" || j.status === "scheduled");
  const byStatus = {
    // ต้องทำ = วันนี้ หรือเลยกำหนดแล้ว (หรือยังไม่ระบุวัน) — งานวันถัดไปไปอยู่ "กำลังจะมาถึง"
    todo: todoAll.filter((j) => { const d = dayOf(jobAt(j)); return !d || d <= todayY; }).sort(sortAsc),
    upcoming: todoAll.filter((j) => { const d = dayOf(jobAt(j)); return d && d > todayY; }).sort(sortAsc),
    doing: list.filter((j) => j.status === "in_progress").sort(sortAsc),
    awaiting: list.filter((j) => j.status === "awaiting_approval").sort(sortAsc),
    reschedule: list.filter((j) => j.status === "reschedule").sort(sortAsc),
    // quote_pending (งานเสร็จ รอออฟฟิศทำใบเสนอ) — ฝั่งช่างถือว่าจบงานแล้ว โชว์ในถังเสร็จ (เดิมงานหายจากทุกถัง)
    done: list.filter((j) => j.status === "done" || j.status === "quote_pending"),
    cancelled: list.filter((j) => j.status === "cancelled"),
  };
  const shown = byStatus[tab] || byStatus.todo;

  if (!allTeams && !team) {
    return <div className="adm"><div className="adm-head"><div><h1 className="page-title">{t("งานของฉัน", "ကျွန်ုပ်၏ အလုပ်များ")}</h1></div></div>
      <div className="empty">บัญชีนี้ยังไม่ได้สังกัดทีมช่าง — ติดต่อฝ่ายธุรการให้กำหนดทีมให้ครับ</div></div>;
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">{allTeams ? t("งานทุกทีม", "အဖွဲ့အားလုံး၏ အလုပ်") : t("งานของฉัน", "ကျွန်ုပ်၏ အလုပ်များ")} <span className="page-title-en">{allTeams ? "All Jobs · หัวหน้าช่าง" : `My Jobs · ${team}`}</span></h1>
          <p className="page-sub">{byStatus.todo.length} ต้องทำวันนี้ · {byStatus.upcoming.length} กำลังจะมาถึง · {byStatus.doing.length} กำลังทำ · {byStatus.awaiting.length} รออนุมัติ</p></div>
        <div className="cat-filter" style={{ margin: 0 }}>
          {TABS.map(([v, l]) => (
            <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
              style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{lang === "my" ? (MYJOB_TAB_MY[v] || l) : l} ({byStatus[v].length})</button>
          ))}
          <button className="cat-chip" onClick={load} disabled={loading} title={t("โหลดงานล่าสุด", "အသစ်ဖွင့်")}>🔄 {t("รีเฟรช", "ပြန်ဖွင့်")}</button>
        </div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{tab === "todo" ? t("ไม่มีงานต้องทำวันนี้ 🎉", "ဒီနေ့ လုပ်စရာ မရှိပါ 🎉") : tab === "upcoming" ? t("ยังไม่มีงานที่กำลังจะมาถึง", "လာမည့် အလုပ် မရှိသေးပါ") : t("ไม่มีงานในสถานะนี้", "ဒီအခြေအနေတွင် အလုပ်မရှိပါ")}</div>}

      <div className="job-cards">
        {shown.map((jo) => {
          const st = STATUS[jo.status] || STATUS.pending;
          // show the visit(s) relevant to this team (lead sees all visits)
          const myVisits = (jo.visits && jo.visits.length)
            ? (allTeams ? jo.visits : jo.visits.filter((v) => v.assigned_team === team))
            : [];
          const sv = myVisits.slice().sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""))[0] || jo;
          const dt = sv.scheduled_at ? new Date(sv.scheduled_at) : null;
          const days = dt ? jobDays({ scheduled_at: sv.scheduled_at, end_date: sv.end_date, slot: sv.slot }) : [];
          const slot = slotDef(sv.slot);
          const slotTxt = dt ? ((!sv.slot || sv.slot === "custom") ? dt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น." : slot.th) : "";
          const visitTeam = sv.teamName || jo.teamName;
          return (
            <div className={"card myjob" + (jo.status === "done" ? " closed" : "")} key={jo.job_no}>
              <div className="myjob-head">
                <div>
                  <div className="myjob-no">{jo.job_no} <span className={"job-badge " + st.cls}>{stLbl(jo.status)}</span>{visitTeam ? <span className="myjob-team">{t("ทีม", "အဖွဲ့")} {visitTeam}</span> : null}{myVisits.length > 1 ? <span className="myjob-team">🔁 {myVisits.length} {t("รอบ", "အကြိမ်")}</span> : null}</div>
                  {jo.customerName && <div className="myjob-cust">🏢 {jo.customerName}</div>}
                  {jo.customerAddr && jo.customerAddr !== jo.address && <div className="myjob-custaddr">{jo.customerAddr}</div>}
                  <div className="myjob-title">{jo.title || t("งานติดตั้ง/บริการ", "တပ်ဆင်/ဝန်ဆောင်မှု အလုပ်")}</div>
                </div>
                {dt && <div className="myjob-when">
                  {days.length > 1 ? `${thDayMon(dt)} – ${thDayMon(parseYmd(days[days.length - 1]))}` : dt.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}
                  <br /><b>{slotTxt}</b>{days.length > 1 && <span className="myjob-when-multi">{days.length} {t("วัน", "ရက်")}</span>}
                </div>}
              </div>

              {jo.contact_name && <div className="myjob-row"><UIcon name="user" size={15} color="var(--ink-3)" /> {jo.contact_name}
                {jo.contact_phone && <a href={`tel:${jo.contact_phone}`} className="myjob-call">📞 {jo.contact_phone}</a>}</div>}
              {!jo.contact_name && jo.contact_phone && <div className="myjob-row"><span>📞</span> <a href={`tel:${jo.contact_phone}`} className="myjob-call">{jo.contact_phone}</a></div>}
              {jo.address && <div className="myjob-row"><span>📍</span> <span style={{ flex: 1 }}>{jo.address}</span>
                {jo.map_url && <a href={jo.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm">{t("แผนที่", "မြေပုံ")}</a>}</div>}
              {jo.details && <div className={"myjob-details" + (expanded[jo.job_no] ? "" : " clamp")}>{jo.details}</div>}

              {expanded[jo.job_no] && (jo.sales_note || (jo.sales_photos && jo.sales_photos.length > 0)) && (
                <div className="myjob-brief">
                  <div className="myjob-brief-title">📋 {t("บรีฟจากฝ่ายขาย", "အရောင်းအဖွဲ့မှ အကြောင်းကြားချက်")}</div>
                  {jo.sales_note && <div className="myjob-brief-note"><Linkify text={jo.sales_note} /></div>}
                  {jo.sales_photos && jo.sales_photos.length > 0 && (
                    <div className="tl-photos">{jo.sales_photos.map((u, i) => <AttachThumb key={i} url={u} />)}</div>
                  )}
                </div>
              )}

              {/* รายการเครื่อง/บริการจากใบเสนอราคา (ไม่มีราคา) — ช่างเห็นชัดว่าต้องติดรุ่นไหนกี่ตัว ไม่ต้องเดาจากบรีฟ */}
              {expanded[jo.job_no] && jo.confirmItems && jo.confirmItems.length > 0 && (
                <div className="myjob-brief">
                  <div className="myjob-brief-title">❄️ {t("รายการเครื่อง/บริการของงานนี้", "ဒီအလုပ်၏ စက်/ဝန်ဆောင်မှု စာရင်း")}</div>
                  {jo.confirmItems.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "3px 0", borderBottom: i < jo.confirmItems.length - 1 ? "1px dashed var(--line-2)" : "none" }}>
                      <span>{it.name}</span><b style={{ whiteSpace: "nowrap" }}>{it.qty} {it.unit || t("ชุด", "စုံ")}</b>
                    </div>
                  ))}
                </div>
              )}

              {expanded[jo.job_no] && lang === "my" && (
                <div className="myjob-brief">
                  <div className="myjob-brief-title">🇲🇲 ใบงาน (ภาษาพม่า)
                    <button className="btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => { navigator.clipboard?.writeText(buildJobBriefMy(jo, scheduleLabel({ scheduled_at: sv.scheduled_at, end_date: sv.end_date, slot: sv.slot }))).then(() => flash("ကူးယူပြီးပါပြီ (คัดลอกแล้ว)")).catch(() => {}); }}><UIcon name="clipboard" size={13} /> ကူးယူ</button>
                  </div>
                  <div className="myjob-brief-my">{buildJobBriefMy(jo, scheduleLabel({ scheduled_at: sv.scheduled_at, end_date: sv.end_date, slot: sv.slot }))}</div>
                </div>
              )}

              {/* per-visit controls: each team marks its own รอบ done */}
              {myVisits.length > 0 ? (
                <div className="myjob-visits">
                  {myVisits.map((v) => {
                    const vst = STATUS[v.status] || STATUS.scheduled;
                    return (
                      <div className="myjob-visit" key={v.id}>
                        <div className="myjob-visit-info">🗓 {scheduleLabel({ scheduled_at: v.scheduled_at, end_date: v.end_date, slot: v.slot })}{allTeams && v.teamName ? ` · ${t("ทีม", "အဖွဲ့")} ${v.teamName}` : ""} <span className={"job-badge " + vst.cls}>{stLbl(v.status)}</span></div>
                        <div className="myjob-visit-acts">
                          {/* read-only when the whole job is เสร็จ/ยกเลิก — show status text only */}
                          {!TECH_READONLY.includes(jo.status) && (v.status === "pending" || v.status === "scheduled") && <button className="btn-primary sm" disabled={busy === v.id} onClick={() => setVStatus(jo.job_no, v, "in_progress")}>{t("เริ่มทำรอบนี้", "ဒီအကြိမ် စတင်")}</button>}
                          {!TECH_READONLY.includes(jo.status) && v.status === "in_progress" && <>
                            <button className="btn-primary sm ok" disabled={busy === v.id} onClick={() => setVStatus(jo.job_no, v, "awaiting_approval")}>{t("ส่งอนุมัติ ✓", "အတည်ပြုရန် ပို့ ✓")}</button>
                            <button className="btn-ghost sm" disabled={busy === v.id} onClick={() => setVStatus(jo.job_no, v, "reschedule")}>{t("ขอนัดหมายเพิ่ม", "ချိန်းဆိုမှု ထပ်တောင်း")}</button>
                          </>}
                          {!TECH_READONLY.includes(jo.status) && v.status === "awaiting_approval" && <>
                            <span className="myjob-await">⏳ {t("รอออฟฟิศอนุมัติ", "ရုံးခန်း အတည်ပြုရန် စောင့်")}</span>
                            <button className="btn-ghost sm" disabled={busy === v.id} onClick={() => setVStatus(jo.job_no, v, "in_progress")}>{t("แก้ไข/ทำต่อ", "ပြင်ဆင်/ဆက်လုပ်")}</button>
                          </>}
                          {(TECH_READONLY.includes(jo.status) && v.status === "awaiting_approval") && <span className="myjob-await">⏳ {t("รอออฟฟิศอนุมัติ", "ရုံးခန်း အတည်ပြုရန် စောင့်")}</span>}
                          {v.status === "reschedule" && <>
                            <span className="myjob-await">📅 {t("รอออฟฟิศนัดหมายเพิ่ม", "ရုံးခန်း ချိန်းဆိုပေးရန် စောင့်")}</span>
                            {/* กดพลาด/สถานการณ์เปลี่ยน — ถอยกลับมาทำต่อเองได้ ไม่ต้องรอออฟฟิศช่วย (เดิมค้างจนออฟฟิศแก้) */}
                            {!["done", "cancelled"].includes(jo.status) && <button className="btn-ghost sm" disabled={busy === v.id} onClick={() => setVStatus(jo.job_no, v, "in_progress")}>{t("กลับไปทำต่อ", "ပြန်ဆက်လုပ်")}</button>}
                          </>}
                          {v.status === "done" && <span className="myjob-await">🔒 {t("อนุมัติแล้ว · ปิดงาน", "အတည်ပြုပြီး · အလုပ်ပိတ်")}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {!TECH_READONLY.includes(jo.status) && <button className="btn-ghost" onClick={() => onWithdraw && onWithdraw(jo)}><UIcon name="withdraw" size={15} /> {t("เบิกวัสดุงานนี้", "ဒီအလုပ်အတွက် ပစ္စည်းထုတ်")}</button>}
                  {/* ใบส่งมอบใช้ได้ตั้งแต่ก่อนเริ่ม (กรอกค่า "ก่อน") จนถึงหลังส่งอนุมัติ (เก็บลายเซ็นลูกค้า) — เดิมโผล่เฉพาะตอนกำลังทำ */}
                  {!TECH_READONLY.includes(jo.status) && onHandover && <button className="btn-ghost" onClick={() => onHandover(jo)}><UIcon name="catalog" size={15} /> 📝 {t("ใบส่งมอบงาน", "အလုပ်လွှဲပြောင်း စာရွက်")}</button>}
                </div>
              ) : (
                <div className="myjob-actions">
                  {(jo.status === "pending" || jo.status === "scheduled") && <button className="btn-primary" disabled={busy === jo.job_no} onClick={() => setStatus(jo, "in_progress")}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> {t("รับงาน / เริ่มทำ", "အလုပ်လက်ခံ / စတင်")}</button>}
                  {jo.status === "in_progress" && <>
                    <button className="btn-primary ok" disabled={busy === jo.job_no} onClick={() => setStatus(jo, "awaiting_approval")}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> {t("ส่งอนุมัติ", "အတည်ပြုရန် ပို့")}</button>
                    <button className="btn-ghost" disabled={busy === jo.job_no} onClick={() => setStatus(jo, "reschedule")}>{t("ขอนัดหมายเพิ่ม", "ချိန်းဆိုမှု ထပ်တောင်း")}</button>
                  </>}
                  {jo.status === "awaiting_approval" && <><span className="myjob-await">⏳ {t("รอออฟฟิศอนุมัติ", "ရုံးခန်း အတည်ပြုရန် စောင့်")}</span><button className="btn-ghost" disabled={busy === jo.job_no} onClick={() => setStatus(jo, "in_progress")}>{t("แก้ไข/ทำต่อ", "ပြင်ဆင်/ဆက်လုပ်")}</button></>}
                  {jo.status === "reschedule" && <><span className="myjob-await">📅 {t("รอออฟฟิศนัดหมายเพิ่ม", "ရုံးခန်း ချိန်းဆိုပေးရန် စောင့်")}</span>
                    <button className="btn-ghost" disabled={busy === jo.job_no} onClick={() => setStatus(jo, "in_progress")}>{t("กลับไปทำต่อ", "ပြန်ဆက်လုပ်")}</button></>}
                  {jo.status === "done" && <span className="myjob-await">🔒 {t("อนุมัติแล้ว · ปิดงาน", "အတည်ပြုပြီး · အလုပ်ပိတ်")}</span>}
                  {!TECH_READONLY.includes(jo.status) && <button className="btn-ghost" onClick={() => onWithdraw && onWithdraw(jo)}><UIcon name="withdraw" size={15} /> {t("เบิกวัสดุงานนี้", "ဒီအလုပ်အတွက် ပစ္စည်းထုတ်")}</button>}
                  {!TECH_READONLY.includes(jo.status) && onHandover && <button className="btn-ghost" onClick={() => onHandover(jo)}><UIcon name="catalog" size={15} /> 📝 {t("ใบส่งมอบงาน", "အလုပ်လွှဲပြောင်း စာရွက်")}</button>}
                </div>
              )}
              {jo.status === "in_progress" && expanded[jo.job_no] && <div className="myjob-hint">{t("เข้าหน้างานได้หลายครั้ง · เบิกวัสดุเพิ่มได้ไม่จำกัด · แนบรูป/คอมเมนต์ลงไทม์ไลน์ด้านล่าง", "လုပ်ငန်းခွင်သို့ အကြိမ်များစွာ ဝင်နိုင် · ပစ္စည်း ထပ်ထုတ်နိုင် · ဓာတ်ပုံ/မှတ်ချက် တင်ပါ")}</div>}

              <button className="myjob-expand" onClick={() => toggle(jo.job_no)}>
                {expanded[jo.job_no] ? t("▴ ย่อ", "▴ ချုံ့") : t("▾ ดูรายละเอียด & ความเคลื่อนไหว", "▾ အသေးစိတ် & လှုပ်ရှားမှု")}
              </button>
              {expanded[jo.job_no] && jo.status !== "cancelled" && <JobTimeline jobNo={jo.job_no} groupNo={jo.group_no || jo.job_no} linked={!!jo.group_no} canPost={!TECH_READONLY.includes(jo.status)} author={me} flash={flash} />}
            </div>
          );
        })}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200 }}>{toast.m}</div>}
    </div>
  );
}
