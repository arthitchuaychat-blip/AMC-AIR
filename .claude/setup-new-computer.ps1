# setup-new-computer.ps1 - ตั้งค่าคอมเครื่องใหม่ให้พร้อมทำงาน AMC AIR
#   ดูขั้นตอนเต็มใน docs/NEW-COMPUTER-SETUP.md
# ใช้ (รันจากโฟลเดอร์โปรเจกต์):
#   powershell -ExecutionPolicy Bypass -File .claude\setup-new-computer.ps1
#   powershell -ExecutionPolicy Bypass -File .claude\setup-new-computer.ps1 -GoogleDrivePath "G:\My Drive\claude-memory\Inventory-Management"
#
# หมายเหตุ: ไฟล์นี้ต้องเซฟเป็น UTF-8 พร้อม BOM ไม่งั้น PowerShell 5.1 พัง (ดู memory: ps1-thai-bom)

param([string]$GoogleDrivePath)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$localMem = Join-Path $env:USERPROFILE '.claude\projects\C--Users-User-OneDrive-Desktop-Inventory-Management\memory'

Write-Host "== ตั้งค่าคอมเครื่องใหม่ AMC AIR =="

# 1) โฟลเดอร์ความจำ local ที่ Claude Code อ่าน
if (Test-Path $localMem) {
  Write-Host "[ok] มีโฟลเดอร์ความจำอยู่แล้ว: $localMem"
} elseif ($GoogleDrivePath) {
  if (-not (Test-Path $GoogleDrivePath)) {
    New-Item -ItemType Directory -Force $GoogleDrivePath | Out-Null
    Write-Host "     สร้างโฟลเดอร์ปลายทางบน Drive: $GoogleDrivePath"
  }
  New-Item -ItemType Directory -Force (Split-Path $localMem -Parent) | Out-Null
  New-Item -ItemType Junction -Path $localMem -Target $GoogleDrivePath | Out-Null
  Write-Host "[ok] ทำ junction: $localMem -> $GoogleDrivePath"
} else {
  New-Item -ItemType Directory -Force $localMem | Out-Null
  Write-Host "[ok] สร้างโฟลเดอร์ความจำ (แบบธรรมดา ไม่ผูก Google Drive): $localMem"
}

# 2) ดึงความจำจาก repo ลงเครื่อง
& (Join-Path $PSScriptRoot 'sync-memory.ps1') -Pull

# 3) ก็อป app\.env จากตัวอย่าง (ถ้ายังไม่มี) - ต้องไปเติมคีย์จริงเอง
$envFile = Join-Path $repoRoot 'app\.env'
$envEx   = Join-Path $repoRoot 'app\.env.example'
if (Test-Path $envFile) {
  Write-Host "[ok] มี app\.env อยู่แล้ว"
} elseif (Test-Path $envEx) {
  Copy-Item $envEx $envFile
  Write-Host "[ok] สร้าง app\.env จากตัวอย่าง -- ** ต้องไปเติมคีย์ Supabase จริง (ดูข้อ 4 ในคู่มือ) **"
} else {
  Write-Host "[!] ไม่พบ app\.env.example"
}

Write-Host ""
Write-Host "เสร็จ! ขั้นต่อไป:"
Write-Host "  1) เติมคีย์ใน app\.env"
Write-Host "  2) cd app ; npm install ; npm run build ; npm test"
Write-Host "  รายละเอียด: docs\NEW-COMPUTER-SETUP.md"
