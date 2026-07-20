import React from "react";

// ตาข่ายกันเหนียวระดับหน้าจอ — ถ้าโค้ดวาดหน้าใดหน้าหนึ่ง throw (ข้อมูลแถวเดียวผิดรูป วันที่เพี้ยน
// ฟิลด์ที่คาดว่าไม่ null) React จะถอดทั้งต้นไม้ทิ้ง ผู้ใช้เห็นจอขาวล้วน ไม่มีข้อความ ไม่มีเมนู
// ช่างหน้างาน/พนักงานหน้าร้านจะไม่รู้ว่าต้องรีเฟรช และคนที่ติดตั้งเป็น PWA จะปิด-เปิดแล้วเจอซ้ำ
//
// ⚠️ ตั้งใจครอบเฉพาะ <main> ไม่ครอบเมนูข้าง — พังหน้าไหนก็ยังเปลี่ยนไปทำเมนูอื่นต่อได้
// ⚠️ resetKey = ชื่อหน้าปัจจุบัน · เปลี่ยนหน้าแล้วต้องล้าง error เอง ไม่งั้นค้างจอพังยาวถึงหน้าถัดไป
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }

  static getDerivedStateFromError(err) { return { err }; }

  componentDidCatch(err, info) {
    // เก็บไว้ให้เปิด console ดูได้ — ไม่ส่งออกที่ไหน (ข้อมูลลูกค้าอาจติดไปกับ stack)
    console.error("หน้าจอพัง:", err, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: null });
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
            <button className="btn-ghost" onClick={() => this.setState({ err: null })}>ลองอีกครั้ง</button>
          </div>
          <details style={{ marginTop: 18, textAlign: "left" }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--ink-3)" }}>รายละเอียดสำหรับผู้ดูแลระบบ</summary>
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8, color: "var(--ink-2)" }}>
              {String(this.state.err?.message || this.state.err)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
