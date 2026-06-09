import React from "react";
import { listMaterials, listCategories, saveMaterial, deactivateMaterial } from "../lib/api";
import { fmtBaht2 } from "../lib/format";
import { MaterialThumb, MatIcon, UIcon } from "../icons";
import MaterialModal from "./MaterialModal";

export default function Catalog({ role }) {
  const canEdit = role === "admin";
  const [mats, setMats] = React.useState([]);
  const [cats, setCats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState(undefined); // undefined=closed, null=add, obj=edit

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [m, c] = await Promise.all([listMaterials(), listCategories()]);
      setMats(m); setCats(c);
    } catch (e) { setErr(e.message || String(e)); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const ql = q.trim().toLowerCase();
  const list = mats.filter((m) =>
    (cat === "all" || m.cat === cat) &&
    (!ql || (m.th || "").toLowerCase().includes(ql) || (m.en || "").toLowerCase().includes(ql) ||
      (m.code || "").toLowerCase().includes(ql) || (m.catName || "").includes(q.trim()))
  );

  async function remove(m) {
    if (!confirm(`ลบวัสดุ "${m.th}" ออกจากคลัง? (ประวัติยังเก็บไว้)`)) return;
    try { await deactivateMaterial(m.code); load(); }
    catch (e) { alert("ลบไม่สำเร็จ: " + (e.message || e)); }
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">คลังวัสดุ <span className="page-title-en">Material Catalog</span></h1>
          <p className="page-sub">{mats.length} รายการ · ค้นหา · {canEdit ? "เพิ่ม/แก้ไข/ลบได้" : "ดูอย่างเดียว"}</p>
        </div>
        <div className="cat-head-actions">
          <div className="cat-search">
            <UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาชื่อ / รหัส / หมวด" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && (
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มวัสดุ
            </button>
          )}
        </div>
      </div>

      <div className="cat-filter">
        <button className={"cat-chip" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")}
          style={cat === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทั้งหมด</button>
        {cats.map((c) => (
          <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}
            style={cat === c.id ? { background: c.color, color: "#fff", borderColor: c.color } : { color: c.color }}>
            {c.name_th}
          </button>
        ))}
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดข้อมูลไม่สำเร็จ: {err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">ไม่พบวัสดุ{q && ` ที่ค้นหา “${q}”`}</div>}

      <div className="cat-grid">
        {list.map((m) => {
          const low = m.stock < m.minStock;
          return (
            <div className={"cat-card" + (low ? " low" : "")} key={m.code}>
              <div className="cat-card-top">
                <MaterialThumb mat={m} size={54} radius={14} />
                <div className="cat-card-id">
                  <span className="code-chip">{m.code}</span>
                  {low && <span className="badge-warn sm">ต่ำกว่าขั้นต่ำ</span>}
                </div>
              </div>
              <div className="cat-card-name">{m.th}</div>
              <div className="cat-card-en">{m.en}</div>
              <div className="cat-card-stats">
                <div><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{m.stock} {m.unit}</b></div>
                <div><span>ขั้นต่ำ</span><b>{m.minStock}</b></div>
                <div><span>ต้นทุน</span><b>{fmtBaht2(m.cost)}</b></div>
              </div>
              {canEdit && (
                <div className="cat-card-actions">
                  <button className="btn-ghost sm" onClick={() => setEditing(m)}>
                    <UIcon name="edit" size={14} /> แก้ไข
                  </button>
                  <button className="btn-ghost sm danger" onClick={() => remove(m)}>
                    <UIcon name="trash" size={14} /> ลบ
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing !== undefined && (
        <MaterialModal
          initial={editing}
          categories={cats}
          onSave={saveMaterial}
          onSaved={() => { setEditing(undefined); load(); }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
