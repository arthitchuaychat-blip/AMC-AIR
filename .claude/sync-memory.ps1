# sync-memory.ps1 — ซิงก์ "ความจำของ Claude" ระหว่าง repo (.claude/memory) กับความจำเครื่องนี้
#   ความจำเครื่องนี้: %USERPROFILE%\.claude\projects\<project-id>\memory
#   (<project-id> = พาธเต็มของโปรเจกต์ แทน : และ \ ด้วย - — สคริปต์คำนวณให้อัตโนมัติตามเครื่องที่รัน)
#   (บนคอมเจ้าของทั้งสองเครื่องตั้งเป็น junction ไป G:\My Drive\claude-memory\Inventory-Management)
#
# ใช้ยังไง (รันจากโฟลเดอร์โปรเจกต์):
#   .\.claude\sync-memory.ps1 -Push   # ความจำเครื่อง  → repo   (ทำก่อน git push ตอนจบงานบนคอม)
#   .\.claude\sync-memory.ps1 -Pull   # repo → ความจำเครื่อง    (ทำหลัง git pull ตอนเริ่มงานบนคอม)
# แท็บเล็ต/เครื่องใหม่: ไม่ต้องรัน — Claude อ่านจาก .claude/memory ใน repo ได้เลย

param([switch]$Push, [switch]$Pull)

$ErrorActionPreference = 'Stop'
$repoMem  = Join-Path $PSScriptRoot 'memory'
# หา project-id ของเครื่องนี้อัตโนมัติจากพาธโปรเจกต์ (ใช้ได้ทุกเครื่อง ไม่ต้อง hardcode)
$repoRoot = Split-Path $PSScriptRoot -Parent
$projId   = $repoRoot -replace '[:\\]','-'
$localMem = Join-Path $env:USERPROFILE ".claude\projects\$projId\memory"

if (-not $Push -and -not $Pull) { Write-Host "ระบุ -Push (เครื่อง→repo) หรือ -Pull (repo→เครื่อง)"; exit 1 }

if ($Push) {
  if (-not (Test-Path $localMem)) { Write-Host "ไม่พบความจำในเครื่อง: $localMem"; exit 1 }
  New-Item -ItemType Directory -Force $repoMem | Out-Null
  Copy-Item "$localMem\*.md" $repoMem -Force
  Write-Host "✔ ความจำ → repo : $((Get-ChildItem $repoMem -Filter *.md).Count) ไฟล์"
  Write-Host "  อย่าลืม: git add .claude/memory ; git commit ; git push"
}

if ($Pull) {
  if (-not (Test-Path $repoMem)) { Write-Host "ไม่พบ .claude/memory ใน repo"; exit 1 }
  New-Item -ItemType Directory -Force $localMem | Out-Null
  Copy-Item "$repoMem\*.md" $localMem -Force
  Write-Host "✔ repo → ความจำเครื่อง : $((Get-ChildItem $localMem -Filter *.md).Count) ไฟล์"
}
