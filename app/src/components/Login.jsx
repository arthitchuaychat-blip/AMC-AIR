import React from "react";
import { signIn } from "../lib/api";
import { UIcon, Logo } from "../icons";

export default function Login() {
  const [email, setEmail] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const { error } = await signIn(email.trim(), pw);
    setBusy(false);
    if (error) setErr(error.message);
    // on success, the auth listener in App swaps the screen
  }

  return (
    <div className="login-stage">
      <form className="login-card card" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: "center", marginBottom: 6 }}>
          <Logo size={44} radius={12} />
          <div className="brand-name">AMC <span>Stock</span></div>
        </div>
        <p className="page-sub" style={{ textAlign: "center", marginBottom: 18 }}>เข้าสู่ระบบเพื่อใช้งาน</p>
        <label className="fld"><span>อีเมล · Email</span>
          <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="fld"><span>รหัสผ่าน · Password</span>
          <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </label>
        {err && <div className="login-err">{err}</div>}
        <button className="btn-primary big" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
      </form>
    </div>
  );
}
