import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listTeams, saveTeam, deleteTeam, listProfiles, updateProfile, createUser, adminSetUserEmail, adminSetUserPassword, adminDeleteUser, listCategories, saveCategory, deleteCategory, updateCategory, clearAllTransactions, deleteAllMaterials, listBrands, saveBrand, deleteBrand, listBtus, saveBtu, deleteBtu, getCompanies, saveCompany, getRolePermissions, saveRolePermissions, flowaccountTest, syncChatGroups } from "../lib/api";
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
          <thead><tr><th style={{ textAlign: "left" }}>เมนู / ฟีเจอร์</th>{PERM_ROLES.map((r) => <th key={r}>{PERM_ROLE_LABEL[r]}</th>)}</tr></thead>
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

// company letterhead used on printed documents — two variants: VAT (kind="vat") / non-VAT (kind="novat")
// auto-maintained team-chat groups: พนักงานประจำ vs ช่างซัพ (membership by team type)
function ChatGroupsCard({ flash }) {
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try { await syncChatGroups(); flash("จัดกลุ่มแชตแล้ว ✓ — มีห้อง “พนักงานประจำ” และ “ช่างซัพ” ในแชตทีม"); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e) + " (รัน 047_chat_groups.sql แล้วหรือยัง?)", true); }
    setBusy(false);
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sec-head"><div><div className="sec-title">กลุ่มแชตทีม (ประจำ / ช่างซัพ)</div>
        <div className="sec-sub">สร้าง 2 ห้องอัตโนมัติแยกพนักงานประจำกับช่างซัพ · กดอีกครั้งเมื่อมีคนเข้า/ออก เพื่ออัปเดตสมาชิก</div></div>
        <button className="btn-primary sm" disabled={busy} onClick={run}><UIcon name="chat" size={15} color="#fff" /> จัดกลุ่มแชตอัตโนมัติ</button></div>
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

const ROLES = [{ v: "tech", l: "ช่าง" }, { v: "lead_tech", l: "หัวหน้าช่าง" }, { v: "sales", l: "ฝ่ายขาย" }, { v: "stock", l: "ธุรการวัสดุ" }, { v: "admin", l: "ฝ่ายธุรการ" }, { v: "finance", l: "บัญชี/การเงิน" }, { v: "exec", l: "ผู้บริหาร" }];
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

function DangerAction({ label, desc, phrase, onRun, flash }) {
  const [armed, setArmed] = React.useState(false);
  const [val, setVal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try { await onRun(); flash(`${label} สำเร็จ`); setArmed(false); setVal(""); }
    catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="danger-row">
      <div className="danger-info"><div className="danger-label">{label}</div><div className="danger-desc">{desc}</div></div>
      {!armed ? (
        <button className="btn-danger-sm" onClick={() => setArmed(true)}>{label}</button>
      ) : (
        <div className="danger-confirm">
          <input className="inp" placeholder={`พิมพ์ "${phrase}" เพื่อยืนยัน`} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
          <button className="btn-ghost sm" onClick={() => { setArmed(false); setVal(""); }}>ยกเลิก</button>
          <button className="btn-danger-sm" disabled={val.trim() !== phrase || busy} onClick={run}>{busy ? "กำลังลบ…" : "ยืนยันลบ"}</button>
        </div>
      )}
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
      <p className="page-sub" style={{ marginTop: 8 }}>ขั้นตอน: ใส่ <b>FLOWACCOUNT_CLIENT_ID</b>, <b>FLOWACCOUNT_CLIENT_SECRET</b> (และ <b>FLOWACCOUNT_ENV=sandbox</b>) ใน Vercel → Redeploy → กดทดสอบ</p>
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

        {/* DANGER ZONE */}
        <div className="card danger-card" style={{ marginTop: 16 }}>
          <div className="sec-head"><div><div className="sec-title" style={{ color: "var(--down)" }}>เขตอันตราย · เตรียมเริ่มใช้จริง</div><div className="sec-sub">ลบข้อมูลทดลองก่อนใช้จริง · ทำแล้วย้อนไม่ได้ · ต้องพิมพ์ยืนยัน</div></div></div>
          <DangerAction flash={flash}
            label="ล้างประวัติธุรกรรม + งาน" phrase="ล้างประวัติ"
            desc="ลบเบิก/คืน/ซื้อ/ตัดเสีย และงานทั้งหมด · คงเหลือกลับเป็นค่าตั้งต้น · เก็บรายการวัสดุไว้"
            onRun={clearAllTransactions} />
          <DangerAction flash={flash}
            label="ลบรายการวัสดุทั้งหมด" phrase="ลบวัสดุ"
            desc="ลบวัสดุทุกรายการ + ประวัติธุรกรรม + งาน (เริ่มต้นใหม่หมด แล้วค่อยนำเข้าวัสดุจริง)"
            onRun={deleteAllMaterials} />
        </div>
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
