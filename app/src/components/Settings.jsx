import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listTeams, saveTeam, deleteTeam, listProfiles, updateProfile, createUser, adminSetUserEmail, adminSetUserPassword, adminDeleteUser, listCategories, saveCategory, deleteCategory, updateCategory, listBrands, saveBrand, deleteBrand, listBtus, saveBtu, deleteBtu, getCompanies, saveCompany, getRolePermissions, saveRolePermissions, flowaccountTest, syncChatGroups, getNotifySettings, saveNotifySettings, NOTIFY_CATS, listAuditLogs, getAutoReply, saveAutoReply } from "../lib/api";
import { fmtBaht } from "../lib/format";
import { MODULES as PERM_MODULES, ROLES as PERM_ROLES, ROLE_LABEL as PERM_ROLE_LABEL, DEFAULT_PERMS, mergePerms, setPerms, can } from "../lib/permissions";
import { UIcon } from "../icons";

// editable role → module permission matrix. ธุรการ/ผู้บริหาร can adjust who sees/edits each menu.
function PermissionsCard({ flash }) {
  const [perms, setP] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { getRolePermissions().then((o) => setP(mergePerms(o))).catch(() => setP(mergePerms(null))); }, []);
  const NEXT = { none: "view", view: "edit", edit: "none" };          // editable modules cycle 3 states
  const NEXT2 = { none: "view", view: "none" };                       // view-only modules cycle 2 states
  const CELL = { none: { t: "—", c: "#9aa3b2", bg: "var(--surface-2)" }, view: { t: "ดู", c: "#1d4ed8", bg: "#e6efff" }, edit: { t: "แก้ไข", c: "#0a6b3d", bg: "#dcf5e8" } };
  const cycle = (role, mod, editable) => setP((p) => {
    const cur = p[role][mod] || "none";
    const nxt = (editable ? NEXT : NEXT2)[cur] ?? "none";
    return { ...p, [role]: { ...p[role], [mod]: nxt } };
  });
  // reset just ONE role's column to its shipped default (doesn't touch other roles' customizations)
  async function resetRole(role) {
    if (!await confirmDialog(`รีเซ็ตสิทธิ์ของ "${PERM_ROLE_LABEL[role]}" กลับเป็นค่าเริ่มต้นของระบบ?\n(ตำแหน่งอื่นไม่เปลี่ยน · อย่าลืมกด "บันทึก")`)) return;
    setP((p) => ({ ...p, [role]: { ...DEFAULT_PERMS[role] } }));
  }
  async function save() {
    setSaving(true);
    try { await saveRolePermissions(perms); setPerms(mergePerms(perms)); flash("บันทึกสิทธิ์แล้ว ✓ — รีเฟรชหน้าเพื่อให้เมนูอัปเดตครบทุกคน"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e) + " (รัน 039_role_permissions.sql แล้วหรือยัง?)", true); }
    setSaving(false);
  }
  if (!perms) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head">
        <div><div className="sec-title">สิทธิ์การใช้งานตามตำแหน่ง</div><div className="sec-sub">กดที่ช่องเพื่อสลับ — แก้ไข / ดู / ไม่เห็น · ธุรการมีสิทธิ์สูงสุด</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost sm" onClick={() => setP(mergePerms(DEFAULT_PERMS))}>คืนค่าเริ่มต้น</button>
          <button className="btn-primary sm" disabled={saving} onClick={save}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> บันทึก</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="perm-table">
          <thead><tr><th style={{ textAlign: "left" }}>เมนู / ฟีเจอร์</th>{PERM_ROLES.map((r) => (
            <th key={r}><div>{PERM_ROLE_LABEL[r]}</div>
              <button type="button" title={`รีเซ็ต ${PERM_ROLE_LABEL[r]} เป็นค่าเริ่มต้น`} onClick={() => resetRole(r)}
                style={{ marginTop: 3, fontSize: 10.5, fontWeight: 600, color: "var(--ink-3)", background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "1px 6px", cursor: "pointer" }}>↺ รีเซ็ต</button></th>
          ))}</tr></thead>
          <tbody>
            {PERM_MODULES.map((m) => (
              <tr key={m.id}>
                <td style={{ textAlign: "left" }}>{m.label}</td>
                {PERM_ROLES.map((r) => { const lv = perms[r][m.id] || "none"; const s = CELL[lv]; return (
                  <td key={r}><button type="button" className="perm-cell" style={{ color: s.c, background: s.bg }} onClick={() => cycle(r, m.id, m.editable)}>{s.t}</button></td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// per-role notification on/off matrix (role × category). Default = all on.
function NotifyCard({ flash }) {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { getNotifySettings().then((o) => setCfg(o || {})).catch(() => setCfg({})); }, []);
  const isOn = (role, cat) => { const s = cfg?.[role]; return !s || s[cat] !== false; };
  const toggle = (role, cat) => setCfg((c) => ({ ...c, [role]: { ...(c[role] || {}), [cat]: !isOn(role, cat) } }));
  async function save() {
    setSaving(true);
    try { await saveNotifySettings(cfg); flash("บันทึกการแจ้งเตือนแล้ว ✓"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e) + " (รัน 058_notifications.sql แล้วหรือยัง?)", true); }
    setSaving(false);
  }
  if (!cfg) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head">
        <div><div className="sec-title">การแจ้งเตือน — เปิด/ปิดตามตำแหน่ง</div><div className="sec-sub">กดที่ช่องเพื่อเปิด/ปิดการแจ้งเตือนแต่ละกลุ่มกิจกรรม สำหรับแต่ละตำแหน่ง</div></div>
        <button className="btn-primary sm" disabled={saving} onClick={save}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> บันทึก</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="perm-table">
          <thead><tr><th style={{ textAlign: "left" }}>กลุ่มกิจกรรม</th>{PERM_ROLES.map((r) => <th key={r}>{PERM_ROLE_LABEL[r]}</th>)}</tr></thead>
          <tbody>
            {NOTIFY_CATS.map((c) => (
              <tr key={c.id}>
                <td style={{ textAlign: "left" }}>{c.label}</td>
                {PERM_ROLES.map((r) => { const on = isOn(r, c.id); return (
                  <td key={r}><button type="button" className="perm-cell" style={on ? { color: "#0a6b3d", background: "#dcf5e8" } : { color: "#9aa3b2", background: "var(--surface-2)" }} onClick={() => toggle(r, c.id)}>{on ? "เปิด" : "ปิด"}</button></td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// company letterhead used on printed documents — two variants: VAT (kind="vat") / non-VAT (kind="novat")
// auto-maintained team-chat groups: พนักงานประจำ vs ช่างซัพ (membership by team type)
function ChatGroupsCard({ flash }) {
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try { await syncChatGroups(); flash("เพิ่มพนักงานประจำเข้ากลุ่ม “พนักงานประจำ” แล้ว ✓ — จัดสมาชิกเพิ่มได้ที่แชตทีม"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e) + " (รัน 047/048 chat_groups แล้วหรือยัง?)", true); }
    setBusy(false);
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head"><div><div className="sec-title">กลุ่มแชต “พนักงานประจำ”</div>
        <div className="sec-sub">เพิ่มพนักงานประจำทั้งหมดเข้าห้อง “พนักงานประจำ” (เพิ่มอย่างเดียว ไม่ลบใคร) · จากนั้นจัดกลุ่ม/สมาชิกเองได้ที่แชตทีม → “จัดการสมาชิก”</div></div>
        <button className="btn-primary sm" disabled={busy} onClick={run}><UIcon name="chat" size={15} color="#fff" /> เพิ่มพนักงานประจำเข้ากลุ่ม</button></div>
    </div>
  );
}

function CompanyCard({ kind, title, sub, flash }) {
  const [c, setC] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [warn, setWarn] = React.useState(null);
  React.useEffect(() => {
    getCompanies().then((d) => setC((kind === "novat" ? d.novat : d.vat) || {}))
      .catch((e) => setWarn("ยังโหลดข้อมูลบริษัทไม่ได้ — อาจยังไม่ได้รัน migration 015 (" + (e.message || e) + ")"));
  }, []);
  const set = (k, v) => setC((s) => ({ ...s, [k]: v }));
  async function save() {
    setBusy(true);
    try { await saveCompany(c, kind); setWarn(null); flash(`บันทึกหัวกระดาษ (${title}) แล้ว ✓`); }
    catch (e) { flash("บันทึกไม่สำเร็จ — รัน SQL 015_two_letterheads.sql ก่อน (" + (e.message || e) + ")", true); }
    setBusy(false);
  }
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">{title}</div><div className="sec-sub">{sub}</div></div></div>
      {warn && <div className="login-err" style={{ marginBottom: 10 }}>{warn}</div>}
      <div className="fld-row">
        <label className="fld"><span>ชื่อบริษัท</span><input className="inp" value={c.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="เช่น บริษัท เอเอ็มซี แอร์ จำกัด" /></label>
        <label className="fld"><span>สาขา</span><input className="inp" value={c.branch || ""} onChange={(e) => set("branch", e.target.value)} placeholder="สำนักงานใหญ่" /></label>
      </div>
      <label className="fld"><span>ที่อยู่</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={c.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="123/43 ... กรุงเทพฯ 10700" /></label>
      <div className="fld-row">
        <label className="fld"><span>เลขประจำตัวผู้เสียภาษี</span><input className="inp" value={c.tax_id || ""} onChange={(e) => set("tax_id", e.target.value)} placeholder="0135565015501" /></label>
        <label className="fld"><span>โทรศัพท์</span><input className="inp" value={c.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="099-262-9090, 066-067-7955" /></label>
      </div>
      <div className="fld-row">
        <label className="fld"><span>อีเมล</span><input className="inp" value={c.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="sales@amc-air.com" /></label>
        <label className="fld"><span>เว็บไซต์</span><input className="inp" value={c.website || ""} onChange={(e) => set("website", e.target.value)} placeholder="www.amc-air.com" /></label>
      </div>
      <label className="fld"><span>บัญชีธนาคาร (สำหรับชำระเงิน)</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={c.bank_info || ""} onChange={(e) => set("bank_info", e.target.value)} placeholder={"ธ.กสิกรไทย 130-3-86355-5\nธ.ไทยพาณิชย์ 046-0-70228-9"} /></label>
      <div style={{ marginTop: 6 }}>
        <button className="btn-primary" disabled={busy} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {busy ? "กำลังบันทึก…" : "บันทึกข้อมูลบริษัท"}</button>
      </div>
    </div>
  );
}

// single source of truth = lib/permissions.js (new roles show up here automatically)
const ROLES = PERM_ROLES.map((v) => ({ v, l: PERM_ROLE_LABEL[v] || v }));
const roleLabel = (v) => (ROLES.find((r) => r.v === v) || {}).l || v;

function TeamRow({ team, onChanged, flash }) {
  const [name, setName] = React.useState(team.name);
  const [lead, setLead] = React.useState(team.lead || "");
  const [type, setType] = React.useState(team.type || "permanent");
  const [phone, setPhone] = React.useState(team.phone || "");
  const [taxId, setTaxId] = React.useState(team.tax_id || "");
  const [bank, setBank] = React.useState(team.bank_info || "");
  const [rate, setRate] = React.useState(team.payout_rate ?? 80);
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!await confirmDialog(`ยืนยันบันทึกการแก้ไขทีม ${team.id} ?`)) return;
    setBusy(true);
    try { await saveTeam({ id: team.id, name, lead, type, phone, tax_id: taxId, bank_info: bank, payout_rate: rate }); flash(`บันทึกทีม ${team.id} แล้ว`); onChanged(); }
    catch (e) { flash("ผิดพลาด: " + (e.message || e) + " (รัน 042_subcontractor.sql แล้วหรือยัง?)", true); }
    setBusy(false);
  }
  async function del() {
    if (!await confirmDialog(`ลบทีม ${team.id}? (ถ้ามีธุรกรรม/ช่างผูกอยู่จะลบไม่ได้)`)) return;
    try { await deleteTeam(team.id); flash(`ลบทีม ${team.id} แล้ว`); onChanged(); }
    catch (e) { flash("ลบไม่ได้ — มีข้อมูลผูกอยู่", true); }
  }
  return (
    <div className="set-team-card">
      <div className="set-row set-row-team">
        <span className="code-chip" style={{ background: team.color, color: "#fff", borderColor: team.color }}>{team.id}</span>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อทีม" />
        <select className="inp" style={{ width: 120, flex: "none" }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="permanent">ทีมประจำ</option><option value="sub">ช่างซัพ</option>
        </select>
        <input className="inp" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="หัวหน้า" />
        <button className="btn-ghost sm" disabled={busy} onClick={save}><UIcon name="check" size={14} /> บันทึก</button>
        <button className="btn-ghost sm danger" onClick={del}><UIcon name="trash" size={14} /></button>
      </div>
      {type === "sub" && (
        <div className="set-row set-sub-detail">
          <input className="inp" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="เบอร์โทร" />
          <input className="inp" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="เลขผู้เสียภาษี" />
          <input className="inp" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="บัญชีธนาคาร" />
          <span className="inp inp-unit" style={{ width: 130, flex: "none" }} title="อัตราค่าแรงดีฟอลต์ = % ของราคาขาย">
            <input type="number" min="0" max="100" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} /><span className="unit-suf">% ขาย</span>
          </span>
        </div>
      )}
    </div>
  );
}

function UserRow({ p, teams, onChanged, flash }) {
  const [name, setName] = React.useState(p.name || "");
  const [email, setEmail] = React.useState(p.email || "");
  const [role, setRole] = React.useState(p.role || "tech");
  const [team, setTeam] = React.useState(p.team || "");
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function save() {
    setBusy(true);
    try {
      await updateProfile(p.id, { name, role, team });
      if (email.trim() && email.trim() !== p.email) await adminSetUserEmail(p.id, email.trim());
      if (pw.trim()) { await adminSetUserPassword(p.id, pw.trim()); setPw(""); }
      flash(`บันทึก ${email.trim() || p.email} แล้ว`); onChanged();
    } catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
    setBusy(false);
  }
  async function del() {
    if (!await confirmDialog(`ลบผู้ใช้ ${p.email}?\nบัญชีนี้จะเข้าระบบไม่ได้อีก (ลบถาวร)`)) return;
    setBusy(true);
    try { await adminDeleteUser(p.id); flash(`ลบ ${p.email} แล้ว`); onChanged(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="set-row set-row-user">
      <input className="inp" style={{ flex: "1.4", minWidth: 150 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" />
      <input className="inp" style={{ flex: "1", minWidth: 90 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ" />
      <Combo className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
      </Combo>
      <Combo className="inp" value={team} onChange={(e) => setTeam(e.target.value)} disabled={role !== "tech"}>
        <option value="">— ทีม —</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Combo>
      <input className="inp" style={{ flex: "1", minWidth: 110 }} type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="ตั้งรหัสใหม่ (เว้นว่าง=ไม่เปลี่ยน)" />
      <button className="btn-ghost sm" disabled={busy} onClick={save}><UIcon name="check" size={14} /> บันทึก</button>
      <button className="btn-ghost sm danger" disabled={busy} onClick={del} title="ลบผู้ใช้"><UIcon name="trash" size={14} /></button>
    </div>
  );
}

function CategoryRow({ c, onChanged, flash }) {
  const [id, setId] = React.useState(c.id);
  const [nameTh, setNameTh] = React.useState(c.name_th);
  const [nameEn, setNameEn] = React.useState(c.name_en || "");
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!id.trim()) return flash("รหัสหมวดห้ามว่าง", true);
    if (!await confirmDialog(`ยืนยันบันทึกการแก้ไขหมวด ${c.id} ?`)) return;
    setBusy(true);
    try {
      await updateCategory(c.id, { id, name_th: nameTh, name_en: nameEn });
      flash(id.trim() !== c.id ? `เปลี่ยนรหัส ${c.id} → ${id.trim()} แล้ว` : `บันทึกหมวด ${id.trim()} แล้ว`);
      onChanged();
    } catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
    setBusy(false);
  }
  async function del() {
    if (!await confirmDialog(`ลบหมวด ${c.id}? (ถ้ามีวัสดุใช้หมวดนี้อยู่จะลบไม่ได้)`)) return;
    try { await deleteCategory(c.id); flash(`ลบหมวด ${c.id} แล้ว`); onChanged(); }
    catch (e) { flash("ลบไม่ได้ — มีวัสดุใช้หมวดนี้อยู่", true); }
  }
  return (
    <div className="set-row set-row-cat">
      <span className="set-cat-dot" style={{ background: c.color }} />
      <input className="inp set-id-inp" value={id} onChange={(e) => setId(e.target.value)} placeholder="รหัส" />
      <input className="inp" value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder="ชื่อหมวด (ไทย)" />
      <input className="inp" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="English" />
      <button className="btn-ghost sm" disabled={busy} onClick={save}><UIcon name="check" size={14} /> บันทึก</button>
      <button className="btn-ghost sm danger" onClick={del}><UIcon name="trash" size={14} /></button>
    </div>
  );
}

// FlowAccount OpenAPI — sandbox connection test
function FlowAccountCard() {
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  async function test() {
    setBusy(true); setRes(null);
    try { setRes(await flowaccountTest()); }
    catch (e) { setRes({ ok: false, msg: e.message || String(e) }); }
    setBusy(false);
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head">
        <div><div className="sec-title">FlowAccount (ทดสอบ Sandbox)</div>
          <div className="sec-sub">เชื่อมต่อแบบ 1 client → 1 บริษัท (client_id + client_secret) · ใส่คีย์ที่ Vercel ก่อน</div></div>
        <button className="btn-primary sm" disabled={busy} onClick={test}>{busy ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}</button>
      </div>
      {res && (
        <div className="fa-result" style={{ background: res.ok ? "#dcf5e8" : "#ffedd5", borderColor: res.ok ? "#b7e6cb" : "#fed7aa", color: res.ok ? "#0a6b3d" : "#9a3412" }}>
          {res.ok
            ? `✅ เชื่อมต่อสำเร็จ (env: ${res.env}) · ได้ access token แล้ว (อายุ ${res.expiresIn || "-"} วินาที)`
            : `❌ ยังไม่สำเร็จ — ${res.reason || ""} ${res.status ? "(HTTP " + res.status + ")" : ""}\n${res.msg || ""}`}
        </div>
      )}
      <p className="page-sub" style={{ marginTop: 8 }}>ขั้นตอน: ใส่ <b>FLOWACCOUNT_CLIENT_ID</b>, <b>FLOWACCOUNT_CLIENT_SECRET</b> และ <b>FLOWACCOUNT_ENV=test</b> (สำหรับ sandbox) ใน Vercel → Redeploy → กดทดสอบ</p>
    </div>
  );
}

// ประวัติการลบ/ยกเลิก/อนุมัติเอกสารการเงิน (audit trail — มิ migration 067)
const AUDIT_TYPES = { all: "ทุกประเภท", invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จ", quotation: "ใบเสนอราคา", boq: "BOQ", billing_note: "ใบวางบิล", job_order: "ใบงาน", transaction: "เคลื่อนไหวสต๊อก", cash_entry: "กระแสเงินสด" };
const AUDIT_ACTIONS = { all: "ทุกการกระทำ", delete: "ลบ", cancel: "ยกเลิก", approve: "อนุมัติ", status: "เปลี่ยนสถานะ", update: "แก้ไข" };
const AUDIT_ACTION_BADGE = { delete: { t: "ลบ", c: "#fff", bg: "#dc2626" }, cancel: { t: "ยกเลิก", c: "#9a3412", bg: "#ffedd5" }, approve: { t: "อนุมัติ", c: "#0a6b3d", bg: "#dcf5e8" }, status: { t: "สถานะ", c: "#1d4ed8", bg: "#e6efff" }, update: { t: "แก้ไข", c: "#1d4ed8", bg: "#e6efff" } };

function AuditCard({ flash }) {
  const [rows, setRows] = React.useState(null);
  const [type, setType] = React.useState("all");
  const [action, setAction] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [open, setOpen] = React.useState(null);   // id whose snapshot is expanded
  const [busy, setBusy] = React.useState(false);

  async function load() {
    setBusy(true);
    try { setRows(await listAuditLogs({ type, action, from, to, q })); }
    catch (e) { flash("โหลดประวัติไม่สำเร็จ: " + (e.message || e) + " (รัน 067_audit_log.sql แล้วหรือยัง?)", true); setRows([]); }
    setBusy(false);
  }
  React.useEffect(() => { load(); }, [type, action, from, to]);

  const fmtTs = (ts) => { try { return new Date(ts).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ts; } };
  const money = (v) => (typeof v === "number" ? fmtBaht(v) : v);
  // a few human-friendly fields to surface from a snapshot, per type
  function snapSummary(r) {
    const s = r.snapshot; if (!s) return null;
    const pick = [];
    if (s.customer_id != null) pick.push(["ลูกค้า (id)", s.customer_id]);
    if (s.total != null) pick.push(["ยอดรวม", money(Number(s.total))]);
    if (s.net != null) pick.push(["สุทธิ", money(Number(s.net))]);
    if (s.status) pick.push(["สถานะ", s.status]);
    if (s.issue_date) pick.push(["วันที่", s.issue_date]);
    if (Array.isArray(s.items)) pick.push(["จำนวนรายการ", s.items.length]);
    return pick;
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head">
        <div><div className="sec-title">ประวัติการลบ / ยกเลิก เอกสาร <span style={{ fontWeight: 500, color: "var(--ink-3)" }}>(Audit Trail)</span></div>
          <div className="sec-sub">ใครลบ/ยกเลิกเอกสารอะไร เมื่อไหร่ ทำไม · เก็บข้อมูลเต็มของใบที่ถูกลบไว้กู้คืนได้</div></div>
        <button className="btn-ghost sm" disabled={busy} onClick={load}>🔄 รีเฟรช</button>
      </div>

      <div className="audit-filters">
        <Combo className="inp" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(AUDIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Combo>
        <Combo className="inp" value={action} onChange={(e) => setAction(e.target.value)}>
          {Object.entries(AUDIT_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Combo>
        <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="ตั้งแต่วันที่" />
        <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="ถึงวันที่" />
        <input className="inp" placeholder="ค้นหา เลขที่ / ชื่อผู้ทำ / เหตุผล" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
      </div>

      {rows === null ? <div className="empty">กำลังโหลด…</div>
        : rows.length === 0 ? <div className="empty sm">ยังไม่มีประวัติ (หรือยังไม่ได้รัน migration 067)</div>
        : (
          <div className="audit-list">
            {rows.map((r) => {
              const b = AUDIT_ACTION_BADGE[r.action] || { t: r.action, c: "#475569", bg: "var(--surface-2)" };
              const sum = open === r.id ? snapSummary(r) : null;
              return (
                <div key={r.id} className="audit-row">
                  <div className="audit-main">
                    <span className="audit-badge" style={{ color: b.c, background: b.bg }}>{b.t}</span>
                    <span className="audit-type">{AUDIT_TYPES[r.target_type] || r.target_type}</span>
                    <b className="audit-no">{r.target_no || "—"}</b>
                    <span className="audit-by">โดย {r.actor_name || "—"}</span>
                    <span className="audit-ts">{fmtTs(r.ts)}</span>
                    {r.snapshot && <button className="btn-ghost xs" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "ซ่อน" : "ดูข้อมูล"}</button>}
                  </div>
                  {r.reason && <div className="audit-reason">เหตุผล: {r.reason}</div>}
                  {sum && (
                    <div className="audit-snap">
                      {sum.map(([k, v], i) => <span key={i} className="audit-snap-item"><i>{k}:</i> {String(v)}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// LINE auto-reply: welcome new contacts + after-hours message (rule-based, no AI)
const AR_DEFAULT = {
  enabled: false,
  welcome_enabled: true,
  welcome_text: "สวัสดีครับ 🙏 ขอบคุณที่ติดต่อ AMC AIR\nสนใจบริการ ติดตั้ง / ล้าง / ซ่อมแอร์ แจ้งรายละเอียดหรือฝากเบอร์ไว้ได้เลย เดี๋ยวทีมงานติดต่อกลับโดยเร็วครับ",
  afterhours_enabled: true,
  afterhours_text: "ขณะนี้อยู่นอกเวลาทำการครับ 🙏 ทีมงานจะตอบกลับในเวลาทำการ (จ–ส 8:00–18:00)\nหากเร่งด่วนโทร 099-262-9090 ได้เลยครับ",
  open_days: [1, 2, 3, 4, 5, 6],
  open_time: "08:00",
  close_time: "18:00",
  cooldown_min: 120,
};
const DOW = [["อา", 0], ["จ", 1], ["อ", 2], ["พ", 3], ["พฤ", 4], ["ศ", 5], ["ส", 6]];

function AutoReplyCard({ flash }) {
  const [c, setC] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { getAutoReply().then((v) => setC({ ...AR_DEFAULT, ...(v || {}) })).catch(() => setC({ ...AR_DEFAULT })); }, []);
  const set = (k, v) => setC((s) => ({ ...s, [k]: v }));
  const toggleDay = (d) => setC((s) => { const days = s.open_days.includes(d) ? s.open_days.filter((x) => x !== d) : [...s.open_days, d].sort(); return { ...s, open_days: days }; });
  async function save() {
    setSaving(true);
    try { await saveAutoReply(c); flash("บันทึกการตอบอัตโนมัติแล้ว ✓"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e) + " (รัน 073_line_autoreply.sql แล้วหรือยัง?)", true); }
    setSaving(false);
  }
  if (!c) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head">
        <div><div className="sec-title">ตอบแชต LINE อัตโนมัติ</div>
          <div className="sec-sub">ทักทายลูกค้าที่ทักครั้งแรก + ตอบนอกเวลาทำการ (ไม่ใช้ AI · ไม่มีค่าใช้จ่าย)</div></div>
        <label className="ar-switch"><input type="checkbox" checked={!!c.enabled} onChange={(e) => set("enabled", e.target.checked)} /> เปิดใช้งาน</label>
      </div>
      <div style={{ opacity: c.enabled ? 1 : 0.5, pointerEvents: c.enabled ? "auto" : "none" }}>
        <div className="fld" style={{ marginBottom: 12 }}>
          <label className="ar-row"><input type="checkbox" checked={!!c.welcome_enabled} onChange={(e) => set("welcome_enabled", e.target.checked)} /> <b>ข้อความทักทาย</b> (เมื่อลูกค้าทักครั้งแรก)</label>
          <textarea className="inp" rows={3} value={c.welcome_text} onChange={(e) => set("welcome_text", e.target.value)} />
        </div>
        <div className="fld">
          <label className="ar-row"><input type="checkbox" checked={!!c.afterhours_enabled} onChange={(e) => set("afterhours_enabled", e.target.checked)} /> <b>ข้อความนอกเวลาทำการ</b></label>
          <textarea className="inp" rows={3} value={c.afterhours_text} onChange={(e) => set("afterhours_text", e.target.value)} />
        </div>
        <div className="ar-hours">
          <span>วันทำการ:</span>
          {DOW.map(([l, d]) => <button key={d} type="button" className={"ar-day" + (c.open_days.includes(d) ? " on" : "")} onClick={() => toggleDay(d)}>{l}</button>)}
        </div>
        <div className="ar-hours">
          <span>เวลา:</span>
          <input className="inp" type="time" value={c.open_time} onChange={(e) => set("open_time", e.target.value)} style={{ width: "auto" }} />
          <span>ถึง</span>
          <input className="inp" type="time" value={c.close_time} onChange={(e) => set("close_time", e.target.value)} style={{ width: "auto" }} />
          <span style={{ marginLeft: 12 }}>ตอบนอกเวลาซ้ำได้ทุก</span>
          <input className="inp" type="number" min="0" value={c.cooldown_min} onChange={(e) => set("cooldown_min", Number(e.target.value) || 0)} style={{ width: 70 }} />
          <span>นาที</span>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn-primary sm" disabled={saving} onClick={save}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> บันทึก</button>
      </div>
    </div>
  );
}

export default function Settings({ role }) {
  const [teams, setTeams] = React.useState([]);
  const [profiles, setProfiles] = React.useState([]);
  const [cats, setCats] = React.useState([]);
  const [brands, setBrands] = React.useState([]);
  const [btus, setBtus] = React.useState([]);
  const [nBrand, setNBrand] = React.useState("");
  const [nBtu, setNBtu] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);

  // add-team form
  const [nt, setNt] = React.useState({ id: "", name: "", lead: "" });
  // add-user form
  const [nu, setNu] = React.useState({ email: "", password: "", name: "", role: "tech", team: "" });
  // add-category form
  const [nc, setNc] = React.useState({ id: "", name_th: "", name_en: "" });
  const [addingT, setAddingT] = React.useState(false);
  const [addingU, setAddingU] = React.useState(false);
  const [addingC, setAddingC] = React.useState(false);

  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 3000); }

  async function load() {
    setLoading(true);
    try { const [t, p, c, b, bt] = await Promise.all([listTeams(), listProfiles(), listCategories(), listBrands(), listBtus()]); setTeams(t); setProfiles(p); setCats(c); setBrands(b); setBtus(bt); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  async function addTeam() {
    if (!nt.id.trim() || !nt.name.trim()) return flash("ใส่รหัสและชื่อทีม", true);
    setAddingT(true);
    try { await saveTeam(nt); setNt({ id: "", name: "", lead: "" }); flash(`เพิ่มทีม ${nt.id.toUpperCase()} แล้ว`); load(); }
    catch (e) { flash("เพิ่มทีมไม่สำเร็จ: " + (e.message || e), true); }
    setAddingT(false);
  }

  async function addUser() {
    if (!nu.email.trim() || nu.password.length < 6) return flash("ใส่อีเมล และรหัสผ่านอย่างน้อย 6 ตัว", true);
    setAddingU(true);
    try {
      await createUser(nu);
      setNu({ email: "", password: "", name: "", role: "tech", team: "" });
      flash(`เพิ่มผู้ใช้ ${nu.email} แล้ว`);
      load();
    } catch (e) { flash("เพิ่มผู้ใช้ไม่สำเร็จ: " + (e.message || e), true); }
    setAddingU(false);
  }

  async function addBrand() {
    if (!nBrand.trim()) return;
    try { await saveBrand(nBrand); setNBrand(""); flash(`เพิ่มยี่ห้อ ${nBrand} แล้ว`); load(); }
    catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
  }
  async function delBrand(b) { if (!await confirmDialog(`ลบยี่ห้อ "${b}" ?`)) return; try { await deleteBrand(b); load(); } catch (e) { flash("ลบไม่ได้: " + (e.message || e), true); } }
  async function addBtu() {
    if (!nBtu || Number(nBtu) <= 0) return;
    try { await saveBtu(nBtu); setNBtu(""); flash(`เพิ่ม ${nBtu} BTU แล้ว`); load(); }
    catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
  }
  async function delBtu(b) { if (!await confirmDialog(`ลบขนาด ${Number(b).toLocaleString()} BTU ?`)) return; try { await deleteBtu(b); load(); } catch (e) { flash("ลบไม่ได้: " + (e.message || e), true); } }

  async function addCat() {
    if (!nc.id.trim() || !nc.name_th.trim()) return flash("ใส่รหัสและชื่อหมวด", true);
    setAddingC(true);
    try { await saveCategory(nc); setNc({ id: "", name_th: "", name_en: "" }); flash(`เพิ่มหมวด ${nc.id} แล้ว`); load(); }
    catch (e) { flash("เพิ่มหมวดไม่สำเร็จ: " + (e.message || e), true); }
    setAddingC(false);
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">ตั้งค่า <span className="page-title-en">Settings</span></h1>
          <p className="page-sub">จัดการทีม และผู้ใช้งาน (เฉพาะธุรการ)</p>
        </div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}

      {!loading && (
        <>
        {can(role, "settings", "edit") && <PermissionsCard flash={flash} />}
        {can(role, "settings", "edit") && <AuditCard flash={flash} />}
        {can(role, "settings", "edit") && <NotifyCard flash={flash} />}
        {can(role, "settings", "edit") && <AutoReplyCard flash={flash} />}
        {can(role, "settings", "edit") && <ChatGroupsCard flash={flash} />}
        {can(role, "settings", "edit") && <FlowAccountCard />}
        <div className="damage-layout" style={{ marginBottom: 16 }}>
          <CompanyCard kind="vat" title="หัวกระดาษ — แบบมี VAT" sub="ใช้กับใบที่คิด VAT · บัญชีธนาคารชุด VAT" flash={flash} />
          <CompanyCard kind="novat" title="หัวกระดาษ — แบบไม่มี VAT" sub="ใช้กับใบที่ไม่คิด VAT · บัญชีธนาคารชุดไม่มี VAT" flash={flash} />
        </div>
        <div className="damage-layout">
          {/* TEAMS */}
          <div className="card">
            <div className="sec-head"><div><div className="sec-title">ทีมช่าง</div><div className="sec-sub">{teams.length} ทีม</div></div></div>
            <div className="set-add">
              <input className="inp" value={nt.id} onChange={(e) => setNt({ ...nt, id: e.target.value })} placeholder="รหัส (เช่น MIKE)" />
              <input className="inp" value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} placeholder="ชื่อทีม (เช่น Team MIKE)" />
              <input className="inp" value={nt.lead} onChange={(e) => setNt({ ...nt, lead: e.target.value })} placeholder="หัวหน้า" />
              <button className="btn-primary" disabled={addingT} onClick={addTeam}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
            </div>
            <div className="set-list">
              {teams.map((t) => <TeamRow key={t.id} team={t} onChanged={load} flash={flash} />)}
            </div>
          </div>

          {/* USERS */}
          <div className="card">
            <div className="sec-head"><div><div className="sec-title">ผู้ใช้งาน</div><div className="sec-sub">{profiles.length} คน</div></div></div>
            <div className="set-add set-add-user">
              <input className="inp" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="อีเมล" />
              <input className="inp" type="text" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="รหัสผ่าน (≥6)" />
              <input className="inp" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="ชื่อ" />
              <Combo className="inp" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </Combo>
              <Combo className="inp" value={nu.team} onChange={(e) => setNu({ ...nu, team: e.target.value })} disabled={nu.role !== "tech"}>
                <option value="">— ทีม —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Combo>
              <button className="btn-primary" disabled={addingU} onClick={addUser}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่มผู้ใช้</button>
            </div>
            <div className="set-list">
              {profiles.map((p) => <UserRow key={p.id} p={p} teams={teams} onChanged={load} flash={flash} />)}
            </div>
          </div>
        </div>

        {/* หมวดวัสดุ · ยี่ห้อแอร์ · BTU — สร้างอัตโนมัติเมื่ออัปโหลดสินค้า (ไม่ต้องจัดการเอง) */}
        {/* เขตอันตราย (ล้างข้อมูลทดลอง) ถูกถอดออกแล้ว — ระบบใช้งานจริง ห้ามมีปุ่มล้างทั้งฐานค้างไว้ */}
        </>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600,
          padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center",
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
