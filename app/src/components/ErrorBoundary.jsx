import React from "react";

// ตาข่ายกันเหนียวระดับหน้าจอ — ถ้าโค้ดวาดหน้าใดหน้าหนึ่ง throw (ข้อมูลแถวเดียวผิดรูป วันที่เพี้ยน
// ฟิลด์ที่คาดว่าไม่ null) React จะถอดทั้งต้นไม้ทิ้ง ผู้ใช้เห็นจอขาวล้วน ไม่มีข้อความ ไม่มีเมนู
// ช่างหน้างาน/พนักงานหน้าร้านจะไม่รู้ว่าต้องรีเฟรช และคนที่ติดตั้งเป็น PWA จะปิด-เปิดแล้วเจอซ้ำ
//
// ⚠️ ตั้งใจครอบเฉพาะ <main> ไม่ครอบเมนูข้าง — พังหน้าไหนก็ยังเปลี่ยนไปทำเมนูอื่นต่อได้
// ⚠️ resetKey = ชื่อหน้าปัจจุบัน · เปลี่ยนหน้าแล้วต้องล้าง error เอง ไม่งั้นค้างจอพังยาวถึงหน้าถัดไป
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, stack: "", copied: false }; }

  static getDerivedStateFromError(err) { return { err }; }

  componentDidCatch(err, info) {
    // เก็บไว้ให้เปิด console ดูได้ — ไม่ส่งออกที่ไหน (ข้อมูลลูกค้าอาจติดไปกับ stack)
    console.error("หน้าจอพัง:", err, info?.componentStack);
    // เก็บ componentStack ไว้โชว์ในกล่องด้วย — ลำพัง "reading 'color'" ไม่พอจะรู้ว่าพังที่ไหน
    // (บันเดิล production ชื่อฟังก์ชันถูกย่อ แต่ชื่อ component ยังพอเดาได้ และบอกลำดับการซ้อนได้)
    this.setState({ stack: info?.componentStack || "" });
  }

  componentDidUpdate(prev) {
    if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: null, stack: "", copied: false });
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="adm">
        <div className="card" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h2 className="page-title" style={{ marginBottom: 6 }}>หน้านี้มีปัญหา</h2>
          <p className="page-sub" style={{ lineHeight: 1.7 }}>
            เปิดหน้านี้ไม่สำเร็จ — ข้อมูลของคุณไม่ได้หายไปไหน<br />
            ลองโหลดใหม่ หรือเปลี่ยนไปทำเมนูอื่นก่อนได้เลย
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={() => window.location.reload()}>โหลดใหม่</button>
            <button className="btn-ghost" onClick={() => this.setState({ err: null, stack: "", copied: false })}>ลองอีกครั้ง</button>
          </div>
          <details style={{ marginTop: 18, textAlign: "left" }} open>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--ink-3)" }}>รายละเอียดสำหรับผู้ดูแลระบบ</summary>
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8, color: "var(--ink-2)" }}>
              {String(this.state.err?.message || this.state.err)}
              {this.state.err?.stack ? "\n\n" + String(this.state.err.stack).split("\n").slice(0, 6).join("\n") : ""}
              {this.state.stack ? "\n— ลำดับหน้าจอ —" + String(this.state.stack).split("\n").slice(0, 8).join("\n") : ""}
            </pre>
            <button className="btn-ghost sm" onClick={() => {
              const t = [String(this.state.err?.message || this.state.err), this.state.err?.stack, this.state.stack].filter(Boolean).join("\n\n");
              navigator.clipboard?.writeText(t).then(() => this.setState({ copied: true }), () => {});
            }}>{this.state.copied ? "คัดลอกแล้ว ✓" : "คัดลอกรายละเอียด"}</button>
          </details>
        </div>
      </div>
    );
  }
}
