import React from "react";
import { listTools, saveTool, deleteTool, listToolMoves, requestToolMove, deleteToolMove, decideToolMove, listTeams, listStaff } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { matchText } from "../lib/format";
import { UIcon } from "../icons";

// เครื่องมือช่าง — ทะเบียน 3 ที่อยู่ (สต๊อก/ประจำรถ/ประจำตัว) + เบิก/คืน/แจ้งชำรุด
const LOC = { stock: { th: "📦 สต๊อก", c: "b-grey" }, vehicle: { th: "🚚 ประจำรถ", c: "b-blue" }, person: { th: "👤 ประจำตัว", c: "b-purple" } };
const TST = { normal: { th: "ปกติ", c: "b-green" }, broken: { th: "ชำรุด", c: "b-red" }, repair: { th: "ส่งซ่อม", c: "b-amber" }, lost: { th: "สูญหาย", c: "b-red" } };
const MVT = { withdraw: "เบิกเครื่องมือ", return: "คืนเข้าสต๊อก", report: "แจ้งชำรุด/หาย", transfer: "ย้ายเครื่องมือ" };

export default function Tools({ role, me }) {
  const myId = me?.id, myTeam = me?.team || null;
  const canManage = ["admin", "exec", "stock"].includes(role);   // จัดการทะเบียน + อนุมัติ
  // เครื่องมือในสต๊อก เห็นได้เฉพาะ หัวหน้าช่าง / ธุรการวัสดุ ขึ้นไป — ช่างเห็นแค่ของตัวเอง
  const canSeeStock = ["lead_tech", "stock", "admin", "exec"].includes(role);
  const [tab, setTab] = React.useState("mine");
  const [tools, setTools] = React.useState(null);
  const [moves, setMoves] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [ed, setEd] = React.useState(null);        // แก้ไข/เพิ่มเครื่องมือ (ทะเบียน)
  const [reqTool, setReqTool] = React.useState(null); // modal ขอเบิก
  const [repTool, setRepTool] = React.useState(null); // modal แจ้งชำรุด
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  async function load() {
    try { const [t, mv, tm, st] = await Promise.all([listTools(), listToolMoves(), listTeams(), listStaff()]); setTools(t); setMoves(mv); setTeams(tm); setStaff(st); }
    catch (e) { setTools([]); flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
  }
  React.useEffect(() => { load(); }, []);

  const pendingByTool = React.useMemo(() => { const m = {}; moves.filter((x) => x.status === "pending").forEach((x) => { m[x.tool_id] = x; }); return m; }, [moves]);
  // ของฉัน = ประจำตัวฉัน + (หัวหน้าทีม → ประจำรถทีมฉันด้วย)
  const isMine = (t) => t.holder === myId || (role === "lead_tech" && t.location === "vehicle" && myTeam && t.team === myTeam);
  const mine = (tools || []).filter(isMine);
  const stock = (tools || []).filter((t) => t.location === "stock");
  const pending = moves.filter((x) => x.status === "pending");
  const shownAll = (tools || []).filter((t) => matchText(q, t.name, t.code, t.detail, t.teamName, t.holderName));

  async function submitRequest(m, doneMsg) {
    setBusy(true);
    try { await requestToolMove(m); setReqTool(null); setRepTool(null); flash(doneMsg); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function decide(mv, ok) {
    if (!await confirmDialog(`${ok ? "อนุมัติ" : "ปฏิเสธ"} "${MVT[mv.move_type]}" · ${mv.toolName} ?`)) return;
    setBusy(true);
    try { await decideToolMove(mv, ok); flash(ok ? "อนุมัติแล้ว ✓" : "ปฏิเสธแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function cancelReq(mv) {
    if (!await confirmDialog(`ยกเลิกคำขอ "${MVT[mv.move_type]}" · ${mv.toolName} ?`)) return;
    try { await deleteToolMove(mv.id); flash("ยกเลิกคำขอแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function saveEd() {
    if (!ed.name?.trim()) return flash("ใส่ชื่อเครื่องมือก่อน", true);
    setBusy(true);
    try { await saveTool(ed); setEd(null); flash("บันทึกแล้ว ✓"); await load(); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function delTool(t) {
    if (!await confirmDialog(`ลบเครื่องมือ "${t.name}" ออกจากทะเบียน? (ประวัติเบิก/คืนของมันจะหายด้วย)`)) return;
    try { await deleteTool(t.id); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }

  const locChip = (t) => {
    const L = LOC[t.location] || LOC.stock;
    const extra = t.location === "vehicle" ? ` ${t.teamName || "-"}` : t.location === "person" ? ` ${t.holderName || "-"}` : "";
    return <span className={"job-badge " + L.c}>{L.th}{extra}</span>;
  };
  const stChip = (t) => { const S = TST[t.status] || TST.normal; return t.status === "normal" ? null : <span className={"job-badge " + S.c}>{S.th}</span>; };

  const ToolRow = ({ t, actions }) => (
    <div className="set-row" style={{ alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{t.name}{t.code ? <span className="jo-dim" style={{ fontWeight: 400 }}> · {t.code}</span> : null}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
          {locChip(t)}{stChip(t)}
          {pendingByTool[t.id] && <span className="job-badge b-amber">รออนุมัติ: {MVT[pendingByTool[t.id].move_type]}</span>}
          {t.detail && <span className="jo-dim" style={{ fontSize: 12 }}>{t.detail}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{actions}</div>
    </div>
  );

  // คำขอ: ผู้จัดการเห็นทั้งหมด · คนอื่นเห็นเฉพาะคำขอของตัวเอง
  const myMoves = canManage ? moves : moves.filter((x) => x.requested_by === myId);
  const myPending = canManage ? pending : pending.filter((x) => x.requested_by === myId);
  const TABS = [["mine", `ของฉัน (${mine.length})`],
    ...(canSeeStock ? [["stock", `สต๊อก · เบิกได้ (${stock.length})`]] : []),
    ["req", `คำขอ${myPending.length ? ` (${myPending.length})` : ""}`],
    ...(canManage ? [["all", "ทะเบียนเครื่องมือ"]] : [])];

  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">เครื่องมือช่าง <span className="page-title-en">Tools</span></h1>
        <p className="page-sub">ช่างเห็นเครื่องมือประจำตัวของตัวเอง · หัวหน้าช่างเห็นประจำรถทีม + สต๊อก · ธุรการวัสดุขึ้นไปจัดการทะเบียน/อนุมัติ</p></div>
        {canManage && <button className="btn-primary" onClick={() => setEd({ name: "", code: "", detail: "", location: "stock", team: "", holder: "", status: "normal", note: "" })}><UIcon name="plus" size={16} color="#fff" /> เพิ่มเครื่องมือ</button>}
      </div>
      <div className="cat-filter">
        {TABS.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
          style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>)}
      </div>

      {tools === null ? <div className="empty">กำลังโหลด…</div> : (
        <div className="card">
          {tab === "mine" && (<div className="set-list">
            <div className="sec-sub" style={{ padding: "4px 0 10px" }}>เครื่องมือที่คุณต้องรับผิดชอบ{role === "lead_tech" ? " (ประจำตัว + ประจำรถทีมคุณ)" : ""}</div>
            {mine.length === 0 && <div className="empty sm">ยังไม่มีเครื่องมือในความรับผิดชอบของคุณ</div>}
            {mine.map((t) => <ToolRow key={t.id} t={t} actions={<>
              {!pendingByTool[t.id] && <button className="btn-ghost sm" onClick={() => submitRequest({ tool_id: t.id, move_type: "return" }, "ส่งคำขอคืนเข้าสต๊อกแล้ว ✓ รอธุรการวัสดุรับของ")}>↩ คืนเข้าสต๊อก</button>}
              {!pendingByTool[t.id] && <button className="btn-ghost sm danger" onClick={() => setRepTool({ tool: t, to_status: "broken", note: "" })}>⚠ แจ้งชำรุด/หาย</button>}
            </>} />)}
          </div>)}

          {tab === "stock" && canSeeStock && (<div className="set-list">
            <div className="sec-sub" style={{ padding: "4px 0 10px" }}>เครื่องมือสำรอง/เฉพาะงานในสต๊อก — กด "ขอเบิก" แล้วรอธุรการวัสดุอนุมัติ</div>
            {stock.length === 0 && <div className="empty sm">ไม่มีเครื่องมือในสต๊อก</div>}
            {stock.map((t) => <ToolRow key={t.id} t={t} actions={<>
              {t.status === "normal" && !pendingByTool[t.id] && <button className="btn-primary sm" onClick={() => setReqTool({ tool: t, to_loc: "person", to_team: myTeam || "", job_no: "", note: "" })}>📥 ขอเบิก</button>}
            </>} />)}
          </div>)}

          {tab === "req" && (<div className="set-list">
            {myMoves.length === 0 && <div className="empty sm">ยังไม่มีคำขอ</div>}
            {myMoves.slice(0, 60).map((mv) => (
              <div className="set-row" key={mv.id} style={{ alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{MVT[mv.move_type]} · {mv.toolName}{mv.toolCode ? <span className="jo-dim" style={{ fontWeight: 400 }}> ({mv.toolCode})</span> : null}</div>
                  <div className="jo-dim" style={{ fontSize: 12.5, marginTop: 3 }}>
                    ขอโดย {mv.requesterName} · {(mv.created_at || "").slice(0, 10)}
                    {mv.move_type === "withdraw" ? (mv.to_loc === "vehicle" ? ` · เข้า 🚚 รถทีม ${mv.toTeamName || "-"}` : ` · เข้า 👤 ${mv.toHolderName || "-"}`) : ""}
                    {mv.move_type === "report" && mv.to_status ? ` · สถานะ → ${TST[mv.to_status]?.th || mv.to_status}` : ""}
                    {mv.job_no ? ` · งาน ${mv.job_no}` : ""}{mv.note ? ` · ${mv.note}` : ""}
                  </div>
                </div>
                {mv.status === "pending" ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    {canManage && <button className="btn-primary sm" disabled={busy} onClick={() => decide(mv, true)}>✓ อนุมัติ</button>}
                    {canManage && <button className="btn-ghost sm danger" disabled={busy} onClick={() => decide(mv, false)}>ปฏิเสธ</button>}
                    {mv.requested_by === myId && <button className="btn-ghost sm" onClick={() => cancelReq(mv)}>ยกเลิก</button>}
                    {!canManage && mv.requested_by !== myId && <span className="job-badge b-amber">รออนุมัติ</span>}
                  </div>
                ) : <span className={"job-badge " + (mv.status === "approved" ? "b-green" : "b-red")}>{mv.status === "approved" ? `อนุมัติแล้ว${mv.deciderName ? ` · ${mv.deciderName}` : ""}` : "ปฏิเสธ"}</span>}
              </div>
            ))}
          </div>)}

          {tab === "all" && canManage && (<>
            <div className="cat-search" style={{ marginBottom: 10 }}><UIcon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / ทีม / ผู้ถือ…" /></div>
            <div className="set-list">
              {shownAll.map((t) => <ToolRow key={t.id} t={t} actions={<>
                <button className="btn-ghost sm" onClick={() => setEd({ ...t, team: t.team || "", holder: t.holder || "" })}><UIcon name="edit" size={14} /> แก้ไข/ย้าย</button>
                <button className="btn-ghost sm danger" onClick={() => delTool(t)}><UIcon name="trash" size={14} /></button>
              </>} />)}
            </div>
          </>)}
        </div>
      )}

      {/* modal ขอเบิก */}
      {reqTool && (
        <div className="modal-overlay" onClick={() => setReqTool(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
            <div className="modal-head"><div className="modal-title">📥 ขอเบิก · {reqTool.tool.name}</div>
              <button className="modal-x" onClick={() => setReqTool(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <div className="fld"><span>เบิกเข้า</span>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className={"cat-chip" + (reqTool.to_loc === "person" ? " on" : "")} onClick={() => setReqTool({ ...reqTool, to_loc: "person" })} style={reqTool.to_loc === "person" ? { background: "#111", color: "#fff" } : {}}>👤 ประจำตัวฉัน</button>
                  <button className={"cat-chip" + (reqTool.to_loc === "vehicle" ? " on" : "")} onClick={() => setReqTool({ ...reqTool, to_loc: "vehicle" })} style={reqTool.to_loc === "vehicle" ? { background: "#111", color: "#fff" } : {}}>🚚 ประจำรถทีม</button>
                </div>
              </div>
              {reqTool.to_loc === "vehicle" && (
                <label className="fld" style={{ marginTop: 8 }}><span>ทีม</span>
                  <select className="inp" value={reqTool.to_team} onChange={(e) => setReqTool({ ...reqTool, to_team: e.target.value })}>
                    <option value="">— เลือกทีม —</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              <label className="fld" style={{ marginTop: 8 }}><span>ใช้กับงาน (ไม่บังคับ)</span>
                <input className="inp" value={reqTool.job_no} onChange={(e) => setReqTool({ ...reqTool, job_no: e.target.value })} placeholder="เช่น JOB-260707-1126" /></label>
              <label className="fld" style={{ marginTop: 8 }}><span>หมายเหตุ (ไม่บังคับ)</span>
                <input className="inp" value={reqTool.note} onChange={(e) => setReqTool({ ...reqTool, note: e.target.value })} /></label>
              <button className="btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={busy || (reqTool.to_loc === "vehicle" && !reqTool.to_team)}
                onClick={() => submitRequest({ tool_id: reqTool.tool.id, move_type: "withdraw", to_loc: reqTool.to_loc, to_team: reqTool.to_loc === "vehicle" ? reqTool.to_team : null, to_holder: reqTool.to_loc === "person" ? myId : null, job_no: reqTool.job_no, note: reqTool.note }, "ส่งคำขอเบิกแล้ว ✓ รอธุรการวัสดุอนุมัติ")}>
                ส่งคำขอเบิก</button>
            </div>
          </div>
        </div>
      )}

      {/* modal แจ้งชำรุด/หาย */}
      {repTool && (
        <div className="modal-overlay" onClick={() => setRepTool(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <div className="modal-head"><div className="modal-title">⚠ แจ้งปัญหา · {repTool.tool.name}</div>
              <button className="modal-x" onClick={() => setRepTool(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <div className="fld"><span>อาการ</span>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {[["broken", "ชำรุด"], ["repair", "ต้องส่งซ่อม"], ["lost", "สูญหาย"]].map(([v, l]) => (
                    <button key={v} className={"cat-chip" + (repTool.to_status === v ? " on" : "")} onClick={() => setRepTool({ ...repTool, to_status: v })}
                      style={repTool.to_status === v ? { background: "#dc2626", color: "#fff", borderColor: "#dc2626" } : {}}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="fld" style={{ marginTop: 8 }}><span>รายละเอียด</span>
                <input className="inp" value={repTool.note} onChange={(e) => setRepTool({ ...repTool, note: e.target.value })} placeholder="เช่น ใบเลื่อยหัก · หายที่หน้างาน" /></label>
              <button className="btn-primary" style={{ width: "100%", marginTop: 14, background: "#dc2626" }} disabled={busy}
                onClick={() => submitRequest({ tool_id: repTool.tool.id, move_type: "report", to_status: repTool.to_status, note: repTool.note }, "แจ้งปัญหาแล้ว ✓ รอธุรการวัสดุรับเรื่อง")}>
                ส่งแจ้งปัญหา</button>
            </div>
          </div>
        </div>
      )}

      {/* modal เพิ่ม/แก้ไข (ทะเบียน) */}
      {ed && (
        <div className="modal-overlay" onClick={() => setEd(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
            <div className="modal-head"><div className="modal-title">{ed.id ? "แก้ไข/ย้ายเครื่องมือ" : "เพิ่มเครื่องมือ"}</div>
              <button className="modal-x" onClick={() => setEd(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <div className="fld-row">
                <label className="fld"><span>ชื่อเครื่องมือ *</span><input className="inp" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} placeholder="เช่น สว่านโรตารี่ Makita" /></label>
                <label className="fld" style={{ maxWidth: 150 }}><span>รหัส/Serial</span><input className="inp" value={ed.code || ""} onChange={(e) => setEd({ ...ed, code: e.target.value })} /></label>
              </div>
              <label className="fld"><span>รายละเอียด (ยี่ห้อ/สเปค)</span><input className="inp" value={ed.detail || ""} onChange={(e) => setEd({ ...ed, detail: e.target.value })} /></label>
              <div className="fld-row">
                <label className="fld"><span>ที่อยู่เครื่องมือ</span>
                  <select className="inp" value={ed.location} onChange={(e) => setEd({ ...ed, location: e.target.value })}>
                    <option value="stock">📦 สต๊อก (สำรอง/เฉพาะงาน)</option>
                    <option value="vehicle">🚚 ประจำรถทีม</option>
                    <option value="person">👤 ประจำตัวช่าง</option>
                  </select>
                </label>
                <label className="fld"><span>สถานะ</span>
                  <select className="inp" value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}>
                    {Object.entries(TST).map(([v, s]) => <option key={v} value={v}>{s.th}</option>)}
                  </select>
                </label>
              </div>
              {ed.location === "vehicle" && (
                <label className="fld"><span>ทีม (หัวหน้าทีมรับผิดชอบ)</span>
                  <select className="inp" value={ed.team} onChange={(e) => setEd({ ...ed, team: e.target.value })}>
                    <option value="">— เลือกทีม —</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              {ed.location === "person" && (
                <label className="fld"><span>ผู้ถือ (รับผิดชอบ)</span>
                  <select className="inp" value={ed.holder} onChange={(e) => setEd({ ...ed, holder: e.target.value })}>
                    <option value="">— เลือกช่าง/พนักงาน —</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
                  </select>
                </label>
              )}
              <label className="fld"><span>หมายเหตุ</span><input className="inp" value={ed.note || ""} onChange={(e) => setEd({ ...ed, note: e.target.value })} /></label>
              <button className="btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={saveEd}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
