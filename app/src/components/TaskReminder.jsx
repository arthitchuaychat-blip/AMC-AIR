import React from "react";
import { listTasks } from "../lib/api";

const ST = { todo: { th: "รอเริ่ม", c: "#7c899c" }, doing: { th: "กำลังทำ", c: "#2563eb" } };
const today = () => new Date().toISOString().slice(0, 10);

// แถบเตือนงานค้างจากกระดานสั่งงาน — ติดหัวจอตามไปทุกเมนู
// โชว์งานที่ "ฉันได้รับมอบหมาย" สถานะ รอเริ่ม/กำลังทำ · กดชิปเปิดงานนั้นในกระดาน · ย่อได้แต่ไม่หาย (ยังเห็นจำนวน)
export default function TaskReminder({ myId, view, onOpen }) {
  const [tasks, setTasks] = React.useState([]);
  const [min, setMinState] = React.useState(() => { try { return localStorage.getItem("amc_task_bar") === "min"; } catch { return false; } });
  const lastView = React.useRef(view);

  const load = React.useCallback(async () => {
    try { const all = await listTasks(); setTasks(all.filter((t) => t.assignee === myId && (t.status === "todo" || t.status === "doing"))); }
    catch { /* เงียบไว้ — แถบเตือนต้องไม่ขวางการใช้งาน */ }
  }, [myId]);
  React.useEffect(() => { if (!myId) return; load(); const iv = setInterval(load, 180000); return () => clearInterval(iv); }, [myId, load]);
  // ออกจากกระดานสั่งงาน → โหลดใหม่ทันที (เพิ่งกดเปลี่ยนสถานะ/ปิดงานมา)
  React.useEffect(() => { if (lastView.current === "tasks" && view !== "tasks") load(); lastView.current = view; }, [view, load]);

  if (!tasks.length) return null;
  const t0 = today();
  const sorted = [...tasks].sort((a, b) => (a.status === b.status
    ? String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"))
    : a.status === "doing" ? -1 : 1));
  const setMin = (v) => { setMinState(v); try { localStorage.setItem("amc_task_bar", v ? "min" : ""); } catch { /* ignore */ } };

  if (min) return (
    <button onClick={() => setMin(false)} title="แสดงรายการงานค้าง"
      style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 10px", padding: "5px 12px", borderRadius: 99, border: "1.5px solid #fbbf24", background: "#fffbeb", color: "#92400e", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
      ⏰ งานค้าง {tasks.length} รายการ ▸
    </button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", padding: "8px 10px 8px 14px", borderRadius: 12, border: "1.5px solid #fbbf24", background: "linear-gradient(90deg,#fffbeb,#fef3c7)" }}>
      <span style={{ fontWeight: 800, fontSize: 13, color: "#92400e", whiteSpace: "nowrap" }}>⏰ งานค้างของคุณ ({tasks.length})</span>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, paddingBottom: 2 }}>
        {sorted.map((t) => { const late = t.due_date && t.due_date < t0; const st = ST[t.status] || ST.todo; return (
          <button key={t.id} onClick={() => onOpen(t.id)} title={`${st.th}${t.due_date ? ` · กำหนด ${t.due_date}` : ""} · กดเพื่อเปิดในกระดานสั่งงาน`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", padding: "4px 10px", borderRadius: 99, border: "1px solid " + (late ? "#fca5a5" : "#e7d8ae"), background: late ? "#fef2f2" : "#fff", color: late ? "#b91c1c" : "#334155", fontSize: 12.5, cursor: "pointer" }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: st.c, flex: "none" }} />
            {t.title}{late ? " ⚠ เลยกำหนด" : ""}
          </button>
        ); })}
      </div>
      <button onClick={() => setMin(true)} title="ย่อแถบ (ยังเห็นจำนวนงานค้าง)" style={{ border: 0, background: "transparent", color: "#92400e", cursor: "pointer", fontWeight: 800, fontSize: 15 }}>▾</button>
    </div>
  );
}
