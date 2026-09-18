@echo off
rem สำรองไฟล์แนบ Supabase → Google Drive (K:) เดือนละครั้ง — ดับเบิลคลิกไฟล์นี้ได้เลย
rem รายละเอียด/วิธีแก้ปัญหา: docs\runbooks\backup-restore.md ข้อ 3.2
set npm_config_cache=D:\build-tmp\npm-cache
set TEMP=D:\build-tmp
set TMP=D:\build-tmp
if not exist D:\build-tmp mkdir D:\build-tmp
cd /d "%~dp0"
node backup-storage.mjs
echo.
if errorlevel 1 (echo *** มีปัญหา — อ่านบรรทัดที่ขึ้น ✗ ด้านบน แล้วรันซ้ำ หรือส่งรูปหน้าจอนี้ให้ Claude ***) else (echo *** สำรองครบแล้ว ***)
pause
