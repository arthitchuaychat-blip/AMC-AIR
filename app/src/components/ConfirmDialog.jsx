import React from "react";

// Promise-based confirm to replace window.confirm with a styled in-app modal.
//   if (!(await confirmDialog("ลบรายการนี้?"))) return;
//   if (!(await confirmDialog({ title, message, danger:false, confirmText }))) return;
// Optional reason capture — resolves to the entered string ("" if blank) on confirm, or false on cancel:
//   const reason = await confirmDialog({ title, message, prompt: { label, placeholder } });
//   if (reason === false) return;   // cancelled
// prompt.required: true → ปุ่มยืนยันกดไม่ได้จนกว่าจะพิมพ์เหตุผล (ใช้กับยกเลิก/ลบเอกสาร — กติกาบริษัท: ต้องระบุเหตุผลเสมอ)
// Mount <ConfirmHost/> once at the app root. Falls back to window.confirm/prompt if the host isn't mounted.
let _open = null;
export function confirmDialog(opts) {
  const o = typeof opts === "string" ? { message: opts } : (opts || {});
  return new Promise((resolve) => {
    if (!_open) {
      if (o.prompt) {
        const r = window.prompt(o.message || o.title || "", "");
        if (r === null) { resolve(false); return; }
        if (o.prompt.required && !r.trim()) { window.alert("ต้องระบุเหตุผลก่อนทำรายการ"); resolve(false); return; }
        resolve(r); return;
      }
      resolve(window.confirm(o.message || o.title || "ยืนยัน?")); return;
    }
    _open({
      title: o.title || "ยืนยันการทำรายการ",
      message: o.message || "",
      confirmText: o.confirmText || "ยืนยัน",
      cancelText: o.cancelText || "ยกเลิก",
      danger: o.danger !== false,
      prompt: o.prompt || null,
      resolve,
    });
  });
}

export function ConfirmHost() {
  const [st, setSt] = React.useState(null);
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { _open = (s) => { setReason(""); setSt(s); }; return () => { _open = null; }; }, []);
  React.useEffect(() => {
    if (!st) return;
    const finish = (v) => { st.resolve(v); setSt(null); };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
      // when capturing a reason, let Enter add newlines in the textarea instead of submitting
      else if (e.key === "Enter" && !st.prompt) finish(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [st]);
  if (!st) return null;
  const done = (v) => { st.resolve(v); setSt(null); };
  const needReason = !!(st.prompt && st.prompt.required && !reason.trim());
  const confirm = () => { if (needReason) return; done(st.prompt ? reason.trim() : true); };   // prompt mode → resolve the reason string
  return (
    <div className="confirm-overlay" onMouseDown={() => done(false)}>
      <div className="confirm-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className={"confirm-icon" + (st.danger ? " danger" : "")}>{st.danger ? "⚠️" : "❓"}</div>
        <div className="confirm-title">{st.title}</div>
        {st.message && <div className="confirm-msg">{st.message}</div>}
        {st.prompt && (
          <div className="confirm-prompt">
            {st.prompt.label && <label className="confirm-prompt-label">{st.prompt.label}{st.prompt.required ? <span style={{ color: "#dc2626" }}> *</span> : null}</label>}
            <textarea className="inp" rows={2} autoFocus value={reason}
              placeholder={st.prompt.placeholder || "ระบุเหตุผล…"}
              onChange={(e) => setReason(e.target.value)} />
            {needReason && <div style={{ fontSize: 11.5, color: "#dc2626", marginTop: 4 }}>ต้องระบุเหตุผลก่อน จึงจะกดยืนยันได้</div>}
          </div>
        )}
        <div className="confirm-acts">
          <button className="btn-ghost" onClick={() => done(false)}>{st.cancelText}</button>
          <button className={st.danger ? "btn-danger" : "btn-primary"} onClick={confirm} disabled={needReason} style={needReason ? { opacity: .45, cursor: "not-allowed" } : undefined} autoFocus={!st.prompt}>{st.confirmText}</button>
        </div>
      </div>
    </div>
  );
}
