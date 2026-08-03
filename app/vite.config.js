import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  // เก็บชื่อฟังก์ชัน/คอมโพเนนต์ไว้ในบันเดิล production — เวลา error ใน stack trace จะอ่านออก
  // (ชื่อจริงแทน aa/Fu/Dj) ช่วยไล่บั๊กหน้าจอพังจากรายงานของผู้ใช้ได้ · ขนาดโตขึ้นเล็กน้อย
  esbuild: { keepNames: true },
});
