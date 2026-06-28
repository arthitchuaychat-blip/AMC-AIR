import React from "react";
import { listWebOrders, setWebOrderStatus, listWebClients, saveWebClient, deleteWebClient, uploadWebLogo, listWebBanners, saveWebBanner, deleteWebBanner, uploadWebBanner } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";
import { UIcon } from "../icons";

const STATUS = [
  ["new", "ใหม่", "#dc2626", "#fee2e2"],
  ["contacted", "ติดต่อแล้ว", "#d97706", "#fef3c7"],
  ["quoted", "เสนอราคาแล้ว", "#1d4ed8", "#dbeafe"],
  ["done", "ปิดการขาย", "#059669", "#dcf5e8"],
  ["cancelled", "ยกเลิก", "#64748b", "#f1f5f9"],
];
const ST = Object.fromEntries(STATUS.map((s) => [s[0], s]));
const thDateTime = (s) => { try { return new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };

export default function WebOrders({ role }) {
  const [tab, setTab] = React.useState("orders"); // "orders" | "clients"
  const [rows, setRows] = React.useState(null);
  const [statusF, setStatusF] = React.useState("all");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };

  async function load() {
    try { setRows(await listWebOrders()); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน 071_website.sql แล้วหรือยัง?)", true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);

  async function changeStatus(o, status) {
    try { await setWebOrderStatus(o.id, status); setRows((rs) => rs.map((x) => x.id === o.id ? { ...x, status } : x)); }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
  }

  const counts = React.useMemo(() => {
    const c = {}; (rows || []).forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; }); return c;
  }, [rows]);
  const shown = (rows || []).filter((o) => statusF === "all" || o.status === statusF);

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ร้านค้าออนไลน์ <span className="page-title-en">Web Shop</span></h1>
          <p className="page-sub">คำสั่งซื้อจากเว็บ + จัดการโลโก้ลูกค้าที่โชว์บนเว็บไซต์</p></div>
        <div className="cat-head-actions" style={{ gap: 8 }}>
          <div className="seg">
            <button className={"seg-btn" + (tab === "orders" ? " on" : "")} onClick={() => setTab("orders")}>📥 คำสั่งซื้อ</button>
            <button className={"seg-btn" + (tab === "banners" ? " on" : "")} onClick={() => setTab("banners")}>🖼️ แบนเนอร์/ปก</button>
            <button className={"seg-btn" + (tab === "clients" ? " on" : "")} onClick={() => setTab("clients")}>🏢 โลโก้ลูกค้า</button>
          </div>
          {tab === "orders" && <button className="btn-ghost sm" onClick={load}>🔄 รีเฟรช</button>}
        </div>
      </div>

      {tab === "banners" ? <BannersManager flash={flash} /> : tab === "clients" ? <ClientsManager flash={flash} /> : <>

      <div className="cat-filter" style={{ marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className={"cat-chip" + (statusF === "all" ? " on" : "")} onClick={() => setStatusF("all")}>ทั้งหมด ({rows?.length || 0})</button>
        {STATUS.map(([v, l, c]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: c, color: "#fff", borderColor: c } : {}}>{l}{counts[v] ? ` (${counts[v]})` : ""}</button>
        ))}
      </div>

      {rows === null ? <div className="empty">กำลังโหลด…</div>
        : shown.length === 0 ? <div className="empty" style={{ padding: 40 }}>{statusF === "all" ? "ยังไม่มีคำสั่งซื้อจากเว็บ" : "ไม่มีรายการในสถานะนี้"}</div>
        : (
          <div className="wo-list">
            {shown.map((o) => { const st = ST[o.status] || ST.new; const items = Array.isArray(o.items) ? o.items : []; return (
              <div key={o.id} className="wo-card card">
                <div className="wo-head">
                  <span className="wo-badge" style={{ color: st[2], background: st[3] }}>{st[1]}</span>
                  <b className="wo-name">{o.name}</b>
                  <a className="wo-phone" href={`tel:${o.phone}`}>📞 {o.phone}</a>
                  <span className="wo-time">{thDateTime(o.created_at)}</span>
                </div>
                {(o.address || o.note) && (
                  <div className="wo-meta">
                    {o.address && <div>📍 {o.address}</div>}
                    {o.email && <div>✉️ {o.email}</div>}
                    {o.note && <div>📝 {o.note}</div>}
                  </div>
                )}
                {items.length > 0 && (
                  <div className="wo-items">
                    {items.map((it, i) => (
                      <div className="wo-item" key={i}>
                        <span>{it.name}</span>
                        <span className="wo-item-qty">× {it.qty}</span>
                        <span className="wo-item-pr">{it.price ? fmtBaht(it.price * it.qty) : "สอบถาม"}</span>
                      </div>
                    ))}
                    <div className="wo-total"><span>รวมโดยประมาณ</span><b>{fmtBaht(o.total)}</b></div>
                  </div>
                )}
                <div className="wo-acts">
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>เปลี่ยนสถานะ:</span>
                  {STATUS.map(([v, l, c]) => (
                    <button key={v} className={"wo-st-btn" + (o.status === v ? " on" : "")}
                      style={o.status === v ? { background: c, color: "#fff", borderColor: c } : {}}
                      onClick={() => changeStatus(o, v)}>{l}</button>
                  ))}
                </div>
              </div>
            ); })}
          </div>
        )}
      </>}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// ---------- จัดการภาพปก/แบนเนอร์ Hero บนเว็บ (สไลด์โชว์) ----------
function BannersManager({ flash }) {
  const [list, setList] = React.useState(null);
  const [img, setImg] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function load() {
    try { setList(await listWebBanners()); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน 078_web_banners.sql แล้วหรือยัง?)", true); setList([]); }
  }
  React.useEffect(() => { load(); }, []);

  async function onImg(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setUploading(true);
    try { setImg(await uploadWebBanner(f)); } catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
    setUploading(false);
  }
  async function add() {
    if (!img) return flash("อัปโหลดภาพปกก่อน", true);
    setBusy(true);
    try { await saveWebBanner({ image_url: img, caption, sort: (list?.length || 0) + 1 }); setImg(""); setCaption(""); await load(); flash("เพิ่มภาพปกแล้ว ✓"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function remove(b) {
    if (!await confirmDialog("ลบภาพปกนี้ออกจากเว็บ?")) return;
    try { await deleteWebBanner(b.id); await load(); flash("ลบแล้ว"); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function toggleActive(b) {
    try { await saveWebBanner({ ...b, active: !b.active }); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function move(b, dir) {
    if (!list) return;
    const i = list.findIndex((x) => x.id === b.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i], c = list[j];
    try { await saveWebBanner({ ...a, sort: c.sort }); await saveWebBanner({ ...c, sort: a.sort }); await load(); }
    catch (e) { flash("ย้ายลำดับไม่สำเร็จ: " + (e.message || e), true); }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">เพิ่มภาพปก (Hero Banner)</div>
          <div className="sec-sub">อัปโหลดภาพแนวนอน (แนะนำ 1920×720px, JPG/PNG) → โชว์เป็นสไลด์โชว์ด้านบนสุดของเว็บ สลับทุก 2 วินาที · ลากลำดับด้วยปุ่ม ◀▶</div></div></div>
        <div className="wc-add">
          <label className="wc-drop" style={{ width: 130, aspectRatio: "16/9" }}>
            {img ? <img src={img} alt="" style={{ objectFit: "cover" }} /> : <span>{uploading ? "กำลังอัปโหลด…" : "+ ภาพปก"}</span>}
            <input type="file" accept="image/*" hidden disabled={uploading} onChange={onImg} />
          </label>
          <input className="inp" placeholder="ข้อความบนภาพ (ไม่ใส่ก็ได้)" value={caption} onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <button className="btn-primary" disabled={busy || uploading} onClick={add}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
        </div>
      </div>

      {list === null ? <div className="empty">กำลังโหลด…</div>
        : list.length === 0 ? <div className="empty" style={{ padding: 40 }}>ยังไม่มีภาพปก — อัปโหลดด้านบน · ระหว่างนี้เว็บจะใช้หน้าปกดีไซน์เดิมไปก่อน</div>
        : (
          <div className="wb-list">
            {list.map((b, i) => (
              <div key={b.id} className={"wb-row" + (b.active ? "" : " off")}>
                <span className="wb-no">{i + 1}</span>
                <div className="wb-thumb">{b.image_url ? <img src={b.image_url} alt="" /> : null}</div>
                <div className="wb-cap">{b.caption || <span className="jo-dim">(ไม่มีข้อความ)</span>}</div>
                <div className="wb-acts">
                  <button className="btn-ghost xs" onClick={() => move(b, -1)} disabled={i === 0} title="เลื่อนขึ้น">◀</button>
                  <button className="btn-ghost xs" onClick={() => move(b, 1)} disabled={i === list.length - 1} title="เลื่อนลง">▶</button>
                  <button className="btn-ghost xs" onClick={() => toggleActive(b)}>{b.active ? "ซ่อน" : "แสดง"}</button>
                  <button className="btn-ghost xs danger" onClick={() => remove(b)}>ลบ</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ---------- จัดการโลโก้ลูกค้าบนเว็บ ----------
function ClientsManager({ flash }) {
  const [list, setList] = React.useState(null);
  const [name, setName] = React.useState("");
  const [logo, setLogo] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function load() {
    try { setList(await listWebClients()); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน 072_web_clients.sql แล้วหรือยัง?)", true); setList([]); }
  }
  React.useEffect(() => { load(); }, []);

  async function onLogo(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setUploading(true);
    try { setLogo(await uploadWebLogo(f)); } catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
    setUploading(false);
  }
  async function add() {
    if (!name.trim()) return flash("ใส่ชื่อลูกค้าก่อน", true);
    setBusy(true);
    try { await saveWebClient({ name: name.trim(), logo_url: logo, sort: (list?.length || 0) + 1 }); setName(""); setLogo(""); await load(); flash("เพิ่มลูกค้าแล้ว ✓"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function remove(c) {
    if (!await confirmDialog(`ลบ "${c.name}" ออกจากเว็บ?`)) return;
    try { await deleteWebClient(c.id); await load(); flash("ลบแล้ว"); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function toggleActive(c) {
    try { await saveWebClient({ ...c, active: !c.active }); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">เพิ่มลูกค้า</div>
          <div className="sec-sub">อัปโหลดโลโก้ (PNG พื้นโปร่งใสสวยสุด) + ชื่อ → โชว์ในหมวด “ลูกค้าของเรา” บนเว็บ</div></div></div>
        <div className="wc-add">
          <label className="wc-drop">
            {logo ? <img src={logo} alt="" /> : <span>{uploading ? "กำลังอัปโหลด…" : "+ โลโก้"}</span>}
            <input type="file" accept="image/*" hidden disabled={uploading} onChange={onLogo} />
          </label>
          <input className="inp" placeholder="ชื่อลูกค้า/องค์กร" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <button className="btn-primary" disabled={busy || uploading} onClick={add}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
        </div>
      </div>

      {list === null ? <div className="empty">กำลังโหลด…</div>
        : list.length === 0 ? <div className="empty" style={{ padding: 40 }}>ยังไม่มีโลโก้ลูกค้า — เพิ่มด้านบน · ระหว่างนี้เว็บจะโชว์รูปรวมเดิมไปก่อน</div>
        : (
          <div className="wc-grid">
            {list.map((c) => (
              <div key={c.id} className={"wc-cell" + (c.active ? "" : " off")}>
                <div className="wc-logo">{c.logo_url ? <img src={c.logo_url} alt={c.name} /> : <span>{c.name}</span>}</div>
                <div className="wc-name">{c.name}</div>
                <div className="wc-acts">
                  <button className="btn-ghost xs" onClick={() => toggleActive(c)}>{c.active ? "ซ่อน" : "แสดง"}</button>
                  <button className="btn-ghost xs danger" onClick={() => remove(c)}>ลบ</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
