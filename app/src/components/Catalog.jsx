import React from "react";
import { listMaterials, listCategories, saveMaterial, deactivateMaterial } from "../lib/api";
import { fmtBaht2, fmtNum } from "../lib/format";
import { MaterialThumb, UIcon } from "../icons";
import MaterialModal from "./MaterialModal";
import MaterialDrawer from "./MaterialDrawer";
import BulkImportModal from "./BulkImportModal";

export default function Catalog({ role }) {
  const canEdit = role === "admin";
  const [mats, setMats] = React.useState([]);
  const [cats, setCats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState(undefined); // undefined=closed, null=add, obj=edit
  const [openMat, setOpenMat] = React.useState(null);       // material detail drawer
  const [viewMode, setViewMode] = React.useState("grid");
  const [importing, setImporting] = React.useState(false);

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

  const EditDel = ({ m }) => canEdit && (
    <div className="cat-card-actions" onClick={(e) => e.stopPropagation()}>
      <button className="btn-ghost sm" onClick={() => setEditing(m)}><UIcon name="edit" size={14} /> แก้ไข</button>
      <button className="btn-ghost sm danger" onClick={() => remove(m)}><UIcon name="trash" size={14} /> ลบ</button>
    </div>
  );

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">คลังวัสดุ <span className="page-title-en">Material Catalog</span></h1>
          <p className="page-sub">{mats.length} รายการ · คลิกเพื่อดูการเคลื่อนไหว · {canEdit ? "เพิ่ม/แก้ไข/ลบได้" : "ดูอย่างเดียว"}</p>
        </div>
        <div className="cat-head-actions">
          <div className="cat-search">
            <UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาชื่อ / รหัส / หมวด" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
          </div>
          <div className="seg view-seg">
            <button className={"seg-btn" + (viewMode === "grid" ? " on" : "")} onClick={() => setViewMode("grid")} title="กริด"><UIcon name="dashboard" size={16} /></button>
            <button className={"seg-btn" + (viewMode === "list" ? " on" : "")} onClick={() => setViewMode("list")} title="ตาราง"><UIcon name="catalog" size={16} /></button>
          </div>
          {canEdit && (
            <button className="btn-ghost" onClick={() => setImporting(true)}>
              <UIcon name="box" size={15} /> นำเข้าหลายรายการ
            </button>
          )}
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

      {/* GRID */}
      {viewMode === "grid" && (
        <div className="cat-grid">
          {list.map((m) => {
            const low = m.stock < m.minStock;
            return (
              <div className={"cat-card clickable" + (low ? " low" : "")} key={m.code} onClick={() => setOpenMat(m)}>
                <div className="cat-card-top">
                  <MaterialThumb mat={m} size={54} radius={14} />
                  <div className="cat-card-id">
                    <span className="code-chip">{m.code}</span>
                    {low && <span className="badge-warn sm">ต่ำกว่าขั้นต่ำ</span>}
                  </div>
                </div>
                <div className="cat-card-name">{m.th}</div>
                <div className="cat-card-en">{m.en}</div>
                {m.description && <div className="cat-card-desc">{m.description}</div>}
                <div className="cat-card-stats">
                  <div><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{m.stock} {m.unit}</b></div>
                  <div><span>ต้นทุน</span><b>{fmtBaht2(m.cost)}</b></div>
                  <div><span>ราคาขาย</span><b style={{ color: "var(--up)" }}>{fmtBaht2(m.salePrice)}</b></div>
                </div>
                <div className="cat-card-move">ดูการเคลื่อนไหว <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
                <EditDel m={m} />
              </div>
            );
          })}
        </div>
      )}

      {/* LIST */}
      {viewMode === "list" && (
        <div className="cat-list">
          {list.map((m) => {
            const low = m.stock < m.minStock;
            return (
              <div className={"cat-lrow" + (low ? " low" : "")} key={m.code} onClick={() => setOpenMat(m)}>
                <MaterialThumb mat={m} size={40} radius={11} />
                <div className="cat-lrow-main">
                  <div className="cat-lrow-name">{m.th} {low && <span className="badge-warn sm">ต่ำ</span>}</div>
                  <div className="cat-lrow-sub"><span className="code-chip">{m.code}</span> {m.catName} · {m.en}</div>
                </div>
                <div className="cat-lrow-col hide-sm"><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{m.stock} {m.unit}</b></div>
                <div className="cat-lrow-col hide-sm"><span>ต้นทุน</span><b>{fmtBaht2(m.cost)}</b></div>
                <div className="cat-lrow-col"><span>ราคาขาย</span><b style={{ color: "var(--up)" }}>{fmtBaht2(m.salePrice)}</b></div>
                <EditDel m={m} />
              </div>
            );
          })}
        </div>
      )}

      {importing && (
        <BulkImportModal
          categories={cats}
          onClose={() => setImporting(false)}
          onDone={(n) => { setImporting(false); alert(`นำเข้า ${n} รายการสำเร็จ`); load(); }}
        />
      )}
      {openMat && <MaterialDrawer mat={openMat} onClose={() => setOpenMat(null)} />}
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
