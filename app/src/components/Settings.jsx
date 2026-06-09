import React from "react";
import { listTeams, saveTeam, deleteTeam, listProfiles, updateProfile, createUser } from "../lib/api";
import { UIcon } from "../icons";

const ROLES = [{ v: "tech", l: "ช่าง" }, { v: "admin", l: "ธุรการ" }, { v: "exec", l: "ผู้บริหาร" }];
const roleLabel = (v) => (ROLES.find((r) => r.v === v) || {}).l || v;

function TeamRow({ team, onChanged, flash }) {
  const [name, setName] = React.useState(team.name);
  const [lead, setLead] = React.useState(team.lead || "");
  const [busy, setBusy] = React.useState(false);
  async function save() {
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
      <select className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
      </select>
      <select className="inp" value={team} onChange={(e) => setTeam(e.target.value)} disabled={role !== "tech"}>
        <option value="">— ทีม —</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button className="btn-ghost sm" disabled={busy} onClick={save}><UIcon name="check" size={14} /> บันทึก</button>
    </div>
  );
}

export default function Settings() {
  const [teams, setTeams] = React.useState([]);
  const [profiles, setProfiles] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);

  // add-team form
  const [nt, setNt] = React.useState({ id: "", name: "", lead: "" });
  // add-user form
  const [nu, setNu] = React.useState({ email: "", password: "", name: "", role: "tech", team: "" });
  const [addingT, setAddingT] = React.useState(false);
  const [addingU, setAddingU] = React.useState(false);

  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 3000); }

  async function load() {
    setLoading(true);
    try { const [t, p] = await Promise.all([listTeams(), listProfiles()]); setTeams(t); setProfiles(p); }
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
              <select className="inp" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
              <select className="inp" value={nu.team} onChange={(e) => setNu({ ...nu, team: e.target.value })} disabled={nu.role !== "tech"}>
                <option value="">— ทีม —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="btn-primary" disabled={addingU} onClick={addUser}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่มผู้ใช้</button>
            </div>
            <div className="set-list">
              {profiles.map((p) => <UserRow key={p.id} p={p} teams={teams} onChanged={load} flash={flash} />)}
            </div>
          </div>
        </div>
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
