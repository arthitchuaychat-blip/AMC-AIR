import React from "react";
import Combo from "./Combo";
import { listTeams, saveTeam, deleteTeam, listProfiles, updateProfile, createUser, listCategories, saveCategory, deleteCategory, updateCategory, clearAllTransactions, deleteAllMaterials, listBrands, saveBrand, deleteBrand, listBtus, saveBtu, deleteBtu, getCompanies, saveCompany } from "../lib/api";
import { UIcon } from "../icons";

// company letterhead used on printed documents — two variants: VAT (kind="vat") / non-VAT (kind="novat")
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
      <label className="fld"><span>เงื่อนไขมาตรฐาน (ขึ้นท้ายเอกสารเมื่อไม่ได้กรอกหมายเหตุ)</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={c.default_terms || ""} onChange={(e) => set("default_terms", e.target.value)} placeholder={"ยืนราคา 30 วัน · เครดิต 60 วัน · มัดจำ 50%"} /></label>
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
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!window.confirm(`ยืนยันบันทึกการแก้ไขทีม ${team.id} ?`)) return;
    setBusy(true);
    try { await saveTeam({ id: team.id, name, lead }); flash(`บันทึกทีม ${team.id} แล้ว`); onChanged(); }
    catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
    setBusy(false);
  }
  async function del() {
    if (!confirm(`ลบทีม ${team.id}? (ถ้ามีธุรกรรม/ช่างผูกอยู่จะลบไม่ได้)`)) return;
    try { await deleteTeam(team.id); flash(`ลบทีม ${team.id} แล้ว`); onChanged(); }
    catch (e) { flash("ลบไม่ได้ — มีข้อมูลผูกอยู่", true); }
  }
  return (
    <div className="set-row set-row-team">
      <span className="code-chip" style={{ background: team.color, color: "#fff", borderColor: team.color }}>{team.id}</span>
      <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อทีม" />
      <input className="inp" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="หัวหน้า" />
      <button className="btn-ghost sm" disabled={busy} onClick={save}><UIcon name="check" size={14} /> บันทึก</button>
      <button className="btn-ghost sm danger" onClick={del}><UIcon name="trash" size={14} /></button>
    </div>
  );
}

function UserRow({ p, teams, onChanged, flash }) {
  const [name, setName] = React.useState(p.name || "");
  const [role, setRole] = React.useState(p.role || "tech");
  const [team, setTeam] = React.useState(p.team || "");
  const [busy, setBusy] = React.useState(false);
  async function save() {
    setBusy(true);
    try { await updateProfile(p.id, { name, role, team }); flash(`บันทึก ${p.email} แล้ว`); onChanged(); }
    catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="set-row set-row-user">
      <div className="set-email">{p.email}</div>
      <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ" />
      <Combo className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
      </Combo>
      <Combo className="inp" value={team} onChange={(e) => setTeam(e.target.value)} disabled={role !== "tech"}>
        <option value="">— ทีม —</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Combo>
      <button className="btn-ghost sm" disabled={busy} onClick={save}><UIcon name="check" size={14} /> บันทึก</button>
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
    if (!window.confirm(`ยืนยันบันทึกการแก้ไขหมวด ${c.id} ?`)) return;
    setBusy(true);
    try {
      await updateCategory(c.id, { id, name_th: nameTh, name_en: nameEn });
      flash(id.trim() !== c.id ? `เปลี่ยนรหัส ${c.id} → ${id.trim()} แล้ว` : `บันทึกหมวด ${id.trim()} แล้ว`);
      onChanged();
    } catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
    setBusy(false);
  }
  async function del() {
    if (!confirm(`ลบหมวด ${c.id}? (ถ้ามีวัสดุใช้หมวดนี้อยู่จะลบไม่ได้)`)) return;
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

export default function Settings() {
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
  async function delBrand(b) { if (!window.confirm(`ลบยี่ห้อ "${b}" ?`)) return; try { await deleteBrand(b); load(); } catch (e) { flash("ลบไม่ได้: " + (e.message || e), true); } }
  async function addBtu() {
    if (!nBtu || Number(nBtu) <= 0) return;
    try { await saveBtu(nBtu); setNBtu(""); flash(`เพิ่ม ${nBtu} BTU แล้ว`); load(); }
    catch (e) { flash("ผิดพลาด: " + (e.message || e), true); }
  }
  async function delBtu(b) { if (!window.confirm(`ลบขนาด ${Number(b).toLocaleString()} BTU ?`)) return; try { await deleteBtu(b); load(); } catch (e) { flash("ลบไม่ได้: " + (e.message || e), true); } }

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
