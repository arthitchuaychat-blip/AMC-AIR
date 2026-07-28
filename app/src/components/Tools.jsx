import React from "react";
import { listTools, saveTool, deleteTool, listToolMoves, requestToolMove, deleteToolMove, decideToolMove, listTeams, listStaff, uploadMaterialPhoto, listToolTypes, saveToolType, deleteToolType, addToolsBatch } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { matchText } from "../lib/format";
import { can, ROLE_LABEL } from "../lib/permissions";
import { UIcon } from "../icons";

// เครื่องมือช่าง — เมนูหลักชนิดเครื่องมือ + ชุดมาตรฐาน (ต่อคน/ต่อทีม) + ทะเบียน 3 ที่อยู่ + เบิก/คืน/แจ้งชำรุด
const LOC = { stock: { th: "📦 สต๊อก", c: "b-grey" }, vehicle: { th: "🚚 ประจำรถ", c: "b-blue" }, person: { th: "👤 ประจำตัว", c: "b-purple" } };
const TST = { normal: { th: "ปกติ", c: "b-green" }, broken: { th: "ชำรุด", c: "b-red" }, repair: { th: "ส่งซ่อม", c: "b-amber" }, lost: { th: "สูญหาย", c: "b-red" } };
const MVT = { withdraw: "เบิกเครื่องมือ", return: "คืนเข้าสต๊อก", report: "แจ้งชำรุด/หาย", transfer: "ย้ายเครื่องมือ" };
const HELD = new Set(["normal", "broken", "repair"]);   // ยังอยู่ในมือ (lost = ถือว่าขาด)

export default function Tools({ role, me }) {
  const myId = me?.id, myTeam = me?.team || null;
  const canManage = can(role, "tools", "edit");   // จัดการทะเบียน/เมนูหลัก + อนุมัติ = admin/exec/stock
  // เครื่องมือในสต๊อก เห็นได้เฉพาะ หัวหน้าช่าง / ธุรการวัสดุ ขึ้นไป
  const canSeeStock = canManage || ["lead_tech", "stock", "admin", "exec"].includes(role);
  const [tab, setTab] = React.useState("mine");
  const [tools, setTools] = React.useState(null);
  const [moves, setMoves] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [types, setTypes] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [openKey, setOpenKey] = React.useState(null);   // person/team ที่กางอยู่ ("p:<id>" / "t:<id>")
  const [ed, setEd] = React.useState(null);             // แก้ไข/เพิ่มเครื่องมือ (ทะเบียน)
  const [edType, setEdType] = React.useState(null);     // แก้ไข/เพิ่มชนิด (เมนูหลัก)
  const [newType, setNewType] = React.useState(false);  // toggle input ชนิดใหม่ ใน modal เครื่องมือ
  const [newTypeName, setNewTypeName] = React.useState("");
  const [reqTool, setReqTool] = React.useState(null);   // modal ขอเบิก
  const [repTool, setRepTool] = React.useState(null);   // modal แจ้งชำรุด
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  async function load() {
    try {
      const [t, mv, tm, st, ty] = await Promise.all([listTools(), listToolMoves(), listTeams(), listStaff(), listToolTypes()]);
      setTools(t); setMoves(mv); setTeams(tm); setStaff(st); setTypes(ty);
    } catch (e) { setTools([]); flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
  }
  React.useEffect(() => { load(); }, []);

  const pendingByTool = React.useMemo(() => { const m = {}; moves.filter((x) => x.status === "pending").forEach((x) => { m[x.tool_id] = x; }); return m; }, [moves]);
  // ของฉัน = ประจำตัวฉัน + (หัวหน้าทีม → ประจำรถทีมฉันด้วย)
  const isMine = (t) => t.holder === myId || (role === "lead_tech" && t.location === "vehicle" && myTeam && t.team === myTeam);
  const mine = (tools || []).filter(isMine);
  const stock = (tools || []).filter((t) => t.location === "stock");
  const pending = moves.filter((x) => x.status === "pending");
  const shownAll = (tools || []).filter((t) => matchText(q, t.name, t.brand, t.code, t.detail, t.teamName, t.holderName, t.typeName));

  // ---------- ชุดมาตรฐาน / มี-ขาด ----------
  const personalTypes = types.filter((t) => (t.std_personal || 0) > 0);
  const vehicleTypes = types.filter((t) => (t.std_vehicle || 0) > 0);
  const cntPerson = (pid, tyId) => (tools || []).filter((t) => t.holder === pid && t.type_id === tyId && HELD.has(t.status)).length;
  const cntTeam = (tid, tyId) => (tools || []).filter((t) => t.location === "vehicle" && t.team === tid && t.type_id === tyId && HELD.has(t.status)).length;
  function gapPersonal(pid) { let have = 0, need = 0; const miss = []; personalTypes.forEach((ty) => { const q2 = ty.std_personal || 0; const c = cntPerson(pid, ty.id); need += q2; have += Math.min(q2, c); if (c < q2) miss.push({ ty, n: q2 - c }); }); return { have, need, miss }; }
  function gapVehicle(tid) { let have = 0, need = 0; const miss = []; vehicleTypes.forEach((ty) => { const q2 = ty.std_vehicle || 0; const c = cntTeam(tid, ty.id); need += q2; have += Math.min(q2, c); if (c < q2) miss.push({ ty, n: q2 - c }); }); return { have, need, miss }; }
  const toolsOfPerson = (pid) => (tools || []).filter((t) => t.location === "person" && t.holder === pid);
  const toolsOfTeam = (tid) => (tools || []).filter((t) => t.location === "vehicle" && t.team === tid);

  const holderHasTool = React.useMemo(() => { const s = new Set(); (tools || []).forEach((t) => { if (t.location === "person" && t.holder) s.add(t.holder); }); return s; }, [tools]);
  const people = (staff || []).filter((s) => ["tech", "lead_tech"].includes(s.role) || holderHasTool.has(s.id));

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
    if (!ed.name?.trim()) return flash("ใส่ชื่อเครื่องมือ (หรือเลือกชนิด) ก่อน", true);
    setBusy(true);
    try { await saveTool(ed); setEd(null); setNewType(false); setNewTypeName(""); flash("บันทึกแล้ว ✓"); await load(); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function onPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try { const url = await uploadMaterialPhoto(file, "tool-" + (ed.code || ed.name || "x")); setEd((s) => ({ ...s, photo_url: url })); }
    catch (ex) { flash("อัปโหลดรูปไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false); e.target.value = "";
  }
  async function delTool(t) {
    if (!await confirmDialog(`ลบเครื่องมือ "${t.name}" ออกจากทะเบียน? (ประวัติเบิก/คืนของมันจะหายด้วย)`)) return;
    try { await deleteTool(t.id); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  // เติมชุดมาตรฐานที่ขาด ให้คน/ทีม
  async function applyKit(scope, id) {
    const g = scope === "person" ? gapPersonal(id) : gapVehicle(id);
    const total = g.miss.reduce((a, m) => a + m.n, 0);
    if (!total) return;
    if (!await confirmDialog(`เติมชุดมาตรฐานที่ขาด ${total} ชิ้น เข้า${scope === "person" ? "ตัวช่างคนนี้" : "รถทีมนี้"}?`)) return;
    setBusy(true);
    try {
      const rows = [];
      g.miss.forEach((m) => { for (let i = 0; i < m.n; i++) rows.push({ name: m.ty.name, type_id: m.ty.id, location: scope === "person" ? "person" : "vehicle", holder: scope === "person" ? id : null, team: scope === "person" ? null : id, status: "normal", note: "ชุดมาตรฐาน" }); });
      await addToolsBatch(rows); flash(`เติมชุดมาตรฐาน ${total} ชิ้นแล้ว ✓`); await load();
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function saveType() {
    if (!edType.name?.trim()) return flash("ใส่ชื่อชนิดก่อน", true);
    setBusy(true);
    try { await saveToolType(edType); setEdType(null); flash("บันทึกแล้ว ✓"); await load(); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function delType(ty) {
    if (!await confirmDialog(`ลบชนิด "${ty.name}" ออกจากเมนูหลัก? (เครื่องมือที่ผูกไว้ยังอยู่ แต่จะไม่มีชนิด)`)) return;
    try { await deleteToolType(ty.id); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function addTypeInline() {
    const nm = newTypeName.trim(); if (!nm) return;
    try { const id = await saveToolType({ name: nm }); const ty = await listToolTypes(); setTypes(ty); setEd((s) => ({ ...s, type_id: id, name: s.name?.trim() ? s.name : nm })); setNewType(false); setNewTypeName(""); }
    catch (e) { flash("เพิ่มชนิดไม่สำเร็จ: " + (e.message || e), true); }
  }

  const locChip = (t) => {
    const L = LOC[t.location] || LOC.stock;
    const extra = t.location === "vehicle" ? ` ${t.teamName || "-"}` : t.location === "person" ? ` ${t.holderName || "-"}` : "";
    return <span className={"job-badge " + L.c}>{L.th}{extra}</span>;
  };
  const stChip = (t) => { const S = TST[t.status] || TST.normal; return t.status === "normal" ? null : <span className={"job-badge " + S.c}>{S.th}</span>; };

  const ToolRow = ({ t, actions }) => (
    <div className="set-row" style={{ alignItems: "center", gap: 10 }}>
      {t.photo_url
        ? <img src={t.photo_url} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", border: "1px solid var(--line-2)", flex: "none", cursor: "zoom-in" }} onClick={() => window.open(t.photo_url, "_blank")} />
        : <div style={{ width: 46, height: 46, borderRadius: 10, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 20 }}>{t.typeEmoji || "🛠️"}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{t.name}{t.brand ? <span style={{ fontWeight: 600, color: "#0369a1" }}> · {t.brand}</span> : null}{t.code ? <span className="jo-dim" style={{ fontWeight: 400 }}> · {t.code}</span> : null}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
          {locChip(t)}{stChip(t)}
          {t.typeName && <span className="job-badge b-grey">{t.typeName}</span>}
          {pendingByTool[t.id] && <span className="job-badge b-amber">รออนุมัติ: {MVT[pendingByTool[t.id].move_type]}</span>}
          {t.detail && <span className="jo-dim" style={{ fontSize: 12 }}>{t.detail}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{actions}</div>
    </div>
  );

  // การ์ดรายคน/รายทีม (กางดูเครื่องมือ + สรุป มี/ขาด)
  const KitCard = ({ id, keyPrefix, title, subtitle, gap, list, scope }) => {
    const open = openKey === (keyPrefix + ":" + id);
    return (
      <div className="card" style={{ padding: 0, marginBottom: 8, border: "1px solid var(--line)" }}>
        <div className="set-row" style={{ alignItems: "center", cursor: "pointer" }} onClick={() => setOpenKey(open ? null : keyPrefix + ":" + id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{title}{subtitle ? <span className="jo-dim" style={{ fontWeight: 400 }}> · {subtitle}</span> : null}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
              <span className={"job-badge " + (gap.need === 0 ? "b-grey" : gap.miss.length ? "b-amber" : "b-green")}>{gap.need ? `ครบ ${gap.have}/${gap.need}` : "ยังไม่ตั้งชุดมาตรฐาน"}</span>
              <span className="jo-dim" style={{ fontSize: 12 }}>· มี {list.length} ชิ้น</span>
              {gap.miss.length > 0 && <span className="jo-dim" style={{ fontSize: 12, color: "#b45309" }}>ขาด: {gap.miss.map((m) => m.ty.name + (m.n > 1 ? ` ×${m.n}` : "")).join(", ")}</span>}
            </div>
          </div>
          <span className="jo-dim">{open ? "▲" : "▼"}</span>
        </div>
        {open && (
          <div style={{ padding: "2px 12px 12px" }}>
            {canManage && (
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <button className="btn-ghost sm" onClick={() => setEd(scope === "person"
                  ? { name: "", type_id: "", brand: "", code: "", detail: "", location: "person", holder: id, team: "", status: "normal", note: "" }
                  : { name: "", type_id: "", brand: "", code: "", detail: "", location: "vehicle", team: id, holder: "", status: "normal", note: "" })}>
                  <UIcon name="plus" size={14} /> เพิ่มเครื่องมือ</button>
                {gap.miss.length > 0 && <button className="btn-primary sm" disabled={busy} onClick={() => applyKit(scope, id)}>✨ เติมชุดมาตรฐาน ({gap.miss.reduce((a, m) => a + m.n, 0)})</button>}
              </div>
            )}
            {list.length === 0 && <div className="empty sm">ยังไม่มีเครื่องมือ</div>}
            {list.map((t) => <ToolRow key={t.id} t={t} actions={canManage ? <>
              <button className="btn-ghost sm" onClick={() => setEd({ ...t, team: t.team || "", holder: t.holder || "", type_id: t.type_id || "" })}><UIcon name="edit" size={14} /></button>
              <button className="btn-ghost sm danger" onClick={() => delTool(t)}><UIcon name="trash" size={14} /></button>
            </> : null} />)}
          </div>
        )}
      </div>
    );
  };

  // คำขอ: ผู้จัดการเห็นทั้งหมด · คนอื่นเห็นเฉพาะคำขอของตัวเอง
  const myMoves = canManage ? moves : moves.filter((x) => x.requested_by === myId);
  const myPending = canManage ? pending : pending.filter((x) => x.requested_by === myId);
  const TABS = [
    ["mine", `ของฉัน (${mine.length})`],
    ["people", "ประจำตัว (รายคน)"],
    ["teams", "ประจำรถ (รายทีม)"],
    ...(canSeeStock ? [["stock", `สต๊อก · เบิกได้ (${stock.length})`]] : []),
    ["req", `คำขอ${myPending.length ? ` (${myPending.length})` : ""}`],
    ...(canManage ? [["types", "ชนิดเครื่องมือ"], ["all", "ทะเบียน"]] : []),
  ];

  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">เครื่องมือช่าง <span className="page-title-en">Tools</span></h1>
        <p className="page-sub">เมนูหลักชนิดเครื่องมือ + ชุดมาตรฐานประจำตัว/ประจำรถ · ทุกคนดูของทุกคน/ทุกทีมได้ · แก้ไขเฉพาะธุรการ/ธุรการวัสดุ/ผู้บริหาร</p></div>
        {canManage && <button className="btn-primary" onClick={() => setEd({ name: "", type_id: "", brand: "", code: "", detail: "", location: "stock", team: "", holder: "", status: "normal", note: "" })}><UIcon name="plus" size={16} color="#fff" /> เพิ่มเครื่องมือ</button>}
      </div>
      <div className="cat-filter">
        {TABS.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => { setTab(v); setOpenKey(null); }}
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

          {tab === "people" && (<div className="set-list">
            <div className="sec-sub" style={{ padding: "4px 0 10px" }}>เครื่องมือประจำตัวของช่างแต่ละคน · กดชื่อเพื่อ{canManage ? "ดู/แก้ไข" : "ดู"}{personalTypes.length ? "" : " (ยังไม่ได้ตั้งชุดมาตรฐานประจำตัว — ไปแท็บ \"ชนิดเครื่องมือ\")"}</div>
            {people.length === 0 && <div className="empty sm">ยังไม่มีช่าง/พนักงาน</div>}
            {people.map((p) => <KitCard key={p.id} id={p.id} keyPrefix="p" scope="person" title={p.name} subtitle={ROLE_LABEL[p.role] || p.role} gap={gapPersonal(p.id)} list={toolsOfPerson(p.id)} />)}
          </div>)}

          {tab === "teams" && (<div className="set-list">
            <div className="sec-sub" style={{ padding: "4px 0 10px" }}>เครื่องมือประจำรถของแต่ละทีม · กดชื่อทีมเพื่อ{canManage ? "ดู/แก้ไข" : "ดู"}{vehicleTypes.length ? "" : " (ยังไม่ได้ตั้งชุดมาตรฐานประจำรถ — ไปแท็บ \"ชนิดเครื่องมือ\")"}</div>
            {teams.length === 0 && <div className="empty sm">ยังไม่มีทีม</div>}
            {teams.map((tm) => <KitCard key={tm.id} id={tm.id} keyPrefix="t" scope="team" title={tm.name} subtitle="ประจำรถทีม" gap={gapVehicle(tm.id)} list={toolsOfTeam(tm.id)} />)}
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

          {tab === "types" && canManage && (<div className="set-list">
            <div className="sec-head" style={{ padding: "2px 0 8px" }}>
              <div className="sec-sub" style={{ padding: 0 }}>เมนูหลักชนิดเครื่องมือ + ชุดมาตรฐาน — เลข = จำนวนที่ควรมีต่อช่าง 1 คน / ต่อทีม 1 ทีม (0 = ไม่อยู่ในชุด)</div>
              <button className="btn-primary sm" onClick={() => setEdType({ name: "", emoji: "", std_personal: 0, std_vehicle: 0 })}><UIcon name="plus" size={14} color="#fff" /> เพิ่มชนิด</button>
            </div>
            {types.length === 0 && <div className="empty sm">ยังไม่มีชนิดในเมนูหลัก — ถ้ายังไม่ได้รัน migration 179/180 ให้รันก่อน</div>}
            {types.map((ty) => (
              <div className="set-row" key={ty.id} style={{ alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{ty.emoji ? ty.emoji + " " : ""}{ty.name}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {(ty.std_personal || 0) > 0 && <span className="job-badge b-purple">👤 ประจำตัว ×{ty.std_personal}</span>}
                  {(ty.std_vehicle || 0) > 0 && <span className="job-badge b-blue">🚚 ประจำรถ ×{ty.std_vehicle}</span>}
                  {!(ty.std_personal || 0) && !(ty.std_vehicle || 0) && <span className="jo-dim" style={{ fontSize: 12 }}>ไม่อยู่ในชุดมาตรฐาน</span>}
                  <button className="btn-ghost sm" onClick={() => setEdType({ ...ty })}><UIcon name="edit" size={14} /></button>
                  <button className="btn-ghost sm danger" onClick={() => delType(ty)}><UIcon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>)}

          {tab === "all" && canManage && (<>
            <div className="cat-search" style={{ marginBottom: 10 }}><UIcon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / ชนิด / ทีม / ผู้ถือ…" /></div>
            <div className="set-list">
              {shownAll.map((t) => <ToolRow key={t.id} t={t} actions={<>
                <button className="btn-ghost sm" onClick={() => setEd({ ...t, team: t.team || "", holder: t.holder || "", type_id: t.type_id || "" })}><UIcon name="edit" size={14} /> แก้ไข/ย้าย</button>
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

      {/* modal เพิ่ม/แก้ไขชนิด (เมนูหลัก) */}
      {edType && (
        <div className="modal-overlay" onClick={() => setEdType(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <div className="modal-head"><div className="modal-title">{edType.id ? "แก้ไขชนิดเครื่องมือ" : "เพิ่มชนิดเครื่องมือ"}</div>
              <button className="modal-x" onClick={() => setEdType(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <div className="fld-row">
                <label className="fld"><span>ชื่อชนิด *</span><input className="inp" value={edType.name} onChange={(e) => setEdType({ ...edType, name: e.target.value })} placeholder="เช่น สว่านโรตารี่" /></label>
                <label className="fld" style={{ maxWidth: 90 }}><span>ไอคอน</span><input className="inp" value={edType.emoji || ""} onChange={(e) => setEdType({ ...edType, emoji: e.target.value })} placeholder="🛠️" /></label>
              </div>
              <div className="fld-row">
                <label className="fld"><span>มาตรฐาน / ช่าง 1 คน</span><input className="inp" type="number" min="0" value={edType.std_personal} onChange={(e) => setEdType({ ...edType, std_personal: e.target.value })} /></label>
                <label className="fld"><span>มาตรฐาน / ทีม 1 ทีม</span><input className="inp" type="number" min="0" value={edType.std_vehicle} onChange={(e) => setEdType({ ...edType, std_vehicle: e.target.value })} /></label>
              </div>
              <div className="sec-sub" style={{ fontSize: 12, padding: "2px 0 0" }}>ใส่ 0 = ไม่อยู่ในชุดมาตรฐานนั้น</div>
              <button className="btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={saveType}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* modal เพิ่ม/แก้ไข (ทะเบียน) */}
      {ed && (
        <div className="modal-overlay" onClick={() => { setEd(null); setNewType(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
            <div className="modal-head"><div className="modal-title">{ed.id ? "แก้ไข/ย้ายเครื่องมือ" : "เพิ่มเครื่องมือ"}</div>
              <button className="modal-x" onClick={() => { setEd(null); setNewType(false); }}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <label className="fld"><span>ชนิด (จากเมนูหลัก)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="inp" value={ed.type_id || ""} onChange={(e) => { const id = e.target.value; const ty = types.find((x) => x.id === id); setEd((s) => ({ ...s, type_id: id, name: s.name?.trim() ? s.name : (ty?.name || s.name) })); }}>
                    <option value="">— ไม่ระบุชนิด —</option>
                    {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.emoji ? ty.emoji + " " : ""}{ty.name}</option>)}
                  </select>
                  <button type="button" className="btn-ghost sm" onClick={() => setNewType((v) => !v)} style={{ whiteSpace: "nowrap" }}>＋ ชนิดใหม่</button>
                </div>
              </label>
              {newType && (
                <div className="fld" style={{ marginTop: 6 }}><span>ชื่อชนิดใหม่</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="inp" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="เช่น เครื่องเป่าลม" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTypeInline(); } }} />
                    <button type="button" className="btn-primary sm" disabled={!newTypeName.trim()} onClick={addTypeInline}>เพิ่ม</button>
                  </div>
                </div>
              )}
              <div className="fld-row">
                <label className="fld"><span>ชื่อเครื่องมือ *</span><input className="inp" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} placeholder="เช่น สว่านโรตารี่" /></label>
                <label className="fld" style={{ maxWidth: 150 }}><span>รหัส (ถ้ามี)</span><input className="inp" value={ed.code || ""} onChange={(e) => setEd({ ...ed, code: e.target.value })} placeholder="Serial" /></label>
              </div>
              <div className="fld-row">
                <label className="fld"><span>ยี่ห้อ</span><input className="inp" value={ed.brand || ""} onChange={(e) => setEd({ ...ed, brand: e.target.value })} placeholder="เช่น Makita · Bosch" /></label>
                <label className="fld"><span>รายละเอียด (สเปค/รุ่น)</span><input className="inp" value={ed.detail || ""} onChange={(e) => setEd({ ...ed, detail: e.target.value })} placeholder="เช่น 18V · หัว SDS-Plus" /></label>
              </div>
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
              <label className="fld"><span>รูปเครื่องมือ (ถ่ายรูปของจริงที่มี/เบิกไป)</span>
                <div className="photo-field">
                  {ed.photo_url ? <img src={ed.photo_url} className="photo-thumb" alt="" /> : <div className="photo-thumb empty"><UIcon name="camera" size={22} color="var(--ink-3)" /></div>}
                  <div className="photo-actions">
                    <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
                      <UIcon name="camera" size={14} /> {uploading ? "กำลังอัปโหลด…" : (ed.photo_url ? "เปลี่ยนรูป" : "อัปโหลด/ถ่ายรูป")}
                      <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} disabled={uploading} />
                    </label>
                    {ed.photo_url && <button type="button" className="btn-ghost sm danger" onClick={() => setEd((s) => ({ ...s, photo_url: "" }))}>ลบรูป</button>}
                  </div>
                </div>
              </label>
              <button className="btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={busy || uploading} onClick={saveEd}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
