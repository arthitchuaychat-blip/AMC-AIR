import React from "react";
import { listFbComments, fbCommentAction } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { UIcon } from "../icons";

// คอมเมนต์ใต้โพสต์ Facebook (mig 193) — รับผ่าน webhook (field 'feed') · ตอบ/ซ่อน/ปิด ผ่าน /api/fb-comment
// ต้องมีสิทธิ์ Meta: pages_read_engagement (อ่าน) + pages_manage_engagement (ตอบ/ซ่อน) · ก่อนสิทธิ์ผ่าน = ยังไม่มีคอมเมนต์เข้า
const TABS = [["open", "รอจัดการ"], ["done", "จัดการแล้ว"], ["hidden", "ซ่อนไว้"], ["all", "ทั้งหมด"]];
const fmtWhen = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };

export default function FbComments({ flash, onBack }) {
  const [status, setStatus] = React.useState("open");
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [replyFor, setReplyFor] = React.useState(null);   // comment_id ที่กำลังพิมพ์ตอบ
  const [replyText, setReplyText] = React.useState("");
  const [priv, setPriv] = React.useState(false);          // ตอบเป็นข้อความส่วนตัว (DM) แทนตอบใต้คอมเมนต์
  const [busy, setBusy] = React.useState(null);

  const load = React.useCallback(() => {
    setLoading(true);
    listFbComments(status).then((r) => setList(r || [])).catch((e) => flash && flash("โหลดคอมเมนต์ไม่สำเร็จ: " + (e.message || e), true)).finally(() => setLoading(false));
  }, [status, flash]);
  React.useEffect(() => { load(); }, [load]);

  async function act(action, c, text) {
    setBusy(c.comment_id + action);
    try {
      await fbCommentAction(action, c.comment_id, text);
      flash && flash({ reply: "ตอบคอมเมนต์แล้ว ✓", private: "ส่งข้อความส่วนตัวแล้ว ✓", hide: "ซ่อนคอมเมนต์แล้ว", unhide: "เลิกซ่อนแล้ว", done: "ปิดงานแล้ว ✓" }[action] || "สำเร็จ");
      setReplyFor(null); setReplyText("");
      load();
    } catch (e) { flash && flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(null);
  }
  async function doReply(c) {
    if (!replyText.trim()) return;
    await act(priv ? "private" : "reply", c, replyText.trim());
  }

  return (
    <div className="fbc-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div className="fbc-head" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        {onBack && <button className="btn-ghost sm" onClick={onBack}><UIcon name="back" size={14} /> แชต</button>}
        <b style={{ fontSize: 15 }}>💬 คอมเมนต์ Facebook</b>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {TABS.map(([v, l]) => (
            <button key={v} className={"cat-chip" + (status === v ? " on" : "")} onClick={() => setStatus(v)}
              style={status === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
          ))}
          <button className="btn-ghost sm" onClick={load} title="รีเฟรช">🔄</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {loading && <div className="empty">กำลังโหลด…</div>}
        {!loading && list.length === 0 && (
          <div className="empty" style={{ lineHeight: 1.7 }}>
            ยังไม่มีคอมเมนต์{status !== "all" ? "ในสถานะนี้" : ""}<br />
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>คอมเมนต์ใต้โพสต์จะเข้ามาที่นี่เมื่อสิทธิ์ Meta <b>pages_read_engagement</b> ผ่านรีวิว + สมัคร webhook <b>feed</b> แล้ว</span>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
          {list.map((c) => {
            const wait = busy && busy.startsWith(c.comment_id);
            return (
              <div key={c.comment_id} className="card" style={{ padding: "10px 12px", borderLeft: c.status === "open" ? "3px solid #38bdf8" : c.is_hidden ? "3px solid #cbd5e1" : "3px solid #86efac" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <b>{c.from_name || "ผู้ใช้ Facebook"}</b>
                  {c.parent_id && <span className="jo-dim" style={{ fontSize: 11 }}>↳ ตอบใต้คอมเมนต์</span>}
                  <span className="jo-dim" style={{ fontSize: 11, marginLeft: "auto" }}>{fmtWhen(c.commented_at)}</span>
                </div>
                <div style={{ margin: "4px 0 8px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.message || <span className="jo-dim">[ไม่มีข้อความ]</span>}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {c.replied && <span className="job-badge b-green">ตอบแล้ว</span>}
                  {c.is_hidden && <span className="job-badge b-grey">ซ่อนอยู่</span>}
                  {c.permalink && <a className="btn-ghost sm" href={c.permalink} target="_blank" rel="noopener noreferrer">🔗 เปิดใน FB</a>}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn-primary sm" disabled={wait} onClick={() => { setReplyFor(replyFor === c.comment_id ? null : c.comment_id); setReplyText(""); setPriv(false); }}>↩ ตอบ</button>
                    {!c.is_hidden
                      ? <button className="btn-ghost sm" disabled={wait} onClick={() => act("hide", c)}>🙈 ซ่อน</button>
                      : <button className="btn-ghost sm" disabled={wait} onClick={() => act("unhide", c)}>เลิกซ่อน</button>}
                    {c.status !== "done" && <button className="btn-ghost sm" disabled={wait} onClick={() => act("done", c)}>✓ ปิดงาน</button>}
                  </div>
                </div>
                {replyFor === c.comment_id && (
                  <div style={{ marginTop: 8, borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                    <textarea className="inp" rows={2} placeholder={priv ? "ข้อความส่วนตัว (DM) ถึงผู้คอมเมนต์…" : "ตอบใต้คอมเมนต์นี้…"} value={replyText} onChange={(e) => setReplyText(e.target.value)} style={{ width: "100%", resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ink-2)" }}>
                        <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> ตอบเป็นข้อความส่วนตัว (DM) แทนใต้คอมเมนต์
                      </label>
                      <button className="btn-primary sm" style={{ marginLeft: "auto" }} disabled={wait || !replyText.trim()} onClick={() => doReply(c)}>{wait ? "กำลังส่ง…" : "ส่ง"}</button>
                      <button className="btn-ghost sm" disabled={wait} onClick={() => { setReplyFor(null); setReplyText(""); }}>ยกเลิก</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
