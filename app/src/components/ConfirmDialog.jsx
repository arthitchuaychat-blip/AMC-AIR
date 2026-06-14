import React from "react";

// Promise-based confirm to replace window.confirm with a styled in-app modal.
//   if (!(await confirmDialog("ลบรายการนี้?"))) return;
//   if (!(await confirmDialog({ title, message, danger:false, confirmText }))) return;
// Mount <ConfirmHost/> once at the app root. Falls back to window.confirm if the host isn't mounted.
let _open = null;
export function confirmDialog(opts) {
  const o = typeof opts === "string" ? { message: opts } : (opts || {});
  return new Promise((resolve) => {
    if (!_open) { resolve(window.confirm(o.message || o.title || "ยืนยัน?")); return; }
    _open({
      title: o.title || "ยืนยันการทำรายการ",
      message: o.message || "",
      confirmText: o.confirmText || "ยืนยัน",
      cancelText: o.cancelText || "ยกเลิก",
      danger: o.danger !== false,
      resolve,
    });
  });
}

export function ConfirmHost() {
  const [st, setSt] = React.useState(null);
  React.useEffect(() => { _open = (s) => setSt(s); return () => { _open = null; }; }, []);
  React.useEffect(() => {
    if (!st) return;
    const finish = (v) => { st.resolve(v); setSt(null); };
    const onKey = (e) => { if (e.key === "Escape") finish(false); else if (e.key === "Enter") finish(true); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [st]);
  if (!st) return null;
  const done = (v) => { st.resolve(v); setSt(null); };
  return (
    <div className="confirm-overlay" onMouseDown={() => done(false)}>
      <div className="confirm-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className={"confirm-icon" + (st.danger ? " danger" : "")}>{st.danger ? "⚠️" : "❓"}</div>
        <div className="confirm-title">{st.title}</div>
        {st.message && <div className="confirm-msg">{st.message}</div>}
        <div className="confirm-acts">
          <button className="btn-ghost" onClick={() => done(false)}>{st.cancelText}</button>
          <button className={st.danger ? "btn-danger" : "btn-primary"} onClick={() => done(true)} autoFocus>{st.confirmText}</button>
        </div>
      </div>
    </div>
  );
}
