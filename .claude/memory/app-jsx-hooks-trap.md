---
name: app-jsx-hooks-trap
description: "กับดัก App.jsx — มี early return หลายจุด (~393–411) ต้องเพิ่ม hook เหนือ return เสมอ ไม่งั้นจอขาว"
metadata:
  type: project
---

**App.jsx มี early return หลายจุดกลางไฟล์ → hook ใหม่ต้องอยู่เหนือมันเสมอ (ไม่งั้นจอขาว).**

ใน`app/src/App.jsx` component หลักมี early return เรียงกันประมาณบรรทัด 393–411:
`if (publicRate) return …` · `if (publicHo) return …` · `if (!hasConfig) return <SetupNotice/>` · `if (!ready) return …โหลด…` · `if (!session) return <Login/>` · `if (!profile) return …โหลดสิทธิ์…`

**ห้ามวาง `useState/useRef/useEffect/useMemo` ไว้ "หลัง" บรรทัดพวกนี้** — เพราะ render หน้า login/loading จะเรียก hook น้อยกว่า render ปกติ → ผิด Rules of Hooks → React crash จอขาวเปิดแอปไม่ได้ (build ผ่าน จับไม่ได้ · test-undefined-vars ก็จับไม่ได้).

เพิ่ม hook ใหม่ให้ไว้ช่วง **บนสุดของ component** (ถัดจาก state `view`/`navHist`/`menuOpen` ราวบรรทัด 184–190) เสมอ. เจอจริงตอน v601 (scroll-to-top hook วางที่บรรทัด 429) → owner เปิดแอปเจอจอขาว → hotfix v602 ย้ายขึ้นบน.

บทเรียนตรวจงาน: **`npm run build` + undefined-vars ไม่จับ Rules-of-Hooks** — งานที่แตะ App.jsq ระดับ hook ควรคิดเรื่องลำดับ hook/early return ด้วยตาเอง.
