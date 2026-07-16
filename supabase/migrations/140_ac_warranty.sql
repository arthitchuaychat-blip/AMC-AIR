-- 140: การรับประกันแอร์ (warranty) บนการ์ดสินค้า — ข้อความอิสระ แสดงต่อลูกค้าได้ (ไม่ใช่ข้อมูลภายใน)
-- เติมค่าเริ่มต้นตามยี่ห้อ (ข้อมูลรับประกันมาตรฐานผู้ผลิตในไทย ก.ค. 2026) — แก้รายรุ่นทับได้ในการ์ดสินค้า
alter table materials add column if not exists warranty text;

-- เติมเฉพาะแถวที่ยังว่าง (รันซ้ำได้ ไม่ทับของที่แก้เองแล้ว)
update materials set warranty = 'คอมเพรสเซอร์ 5 ปี · แผงคอยล์/PCB 3 ปี · อะไหล่ 1 ปี'
  where kind = 'ac' and brand = 'Daikin' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 5 ปี · แผงคอยล์ 3 ปี · อะไหล่ 1 ปี'
  where kind = 'ac' and brand = 'Mitsubishi Electric' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 5 ปี · อะไหล่ 5 ปี'
  where kind = 'ac' and brand = 'Mitsubishi Heavy Duty' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 7–10 ปี · อะไหล่ 3–5 ปี (ตามซีรีส์ เช่น XInverter Plus 10/5 · Tech S 7/3)'
  where kind = 'ac' and brand = 'Carrier' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี · ตัวเครื่อง/อะไหล่ 5 ปี (ฟรีบริการหลังการขาย 5 ปีแรก)'
  where kind = 'ac' and brand = 'Haier' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี · อะไหล่ 5 ปี (เงื่อนไขซื้อหน้าร้าน)'
  where kind = 'ac' and brand = 'TCL' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี (รุ่นธรรมดา 7 ปี) · อะไหล่ 5 ปี · ฟรีค่าแรง 5 ปี'
  where kind = 'ac' and brand = 'Midea' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี (รุ่นธรรมดา 5 ปี) · แผงคอยล์ 3 ปี · อะไหล่ 1 ปี'
  where kind = 'ac' and brand = 'Samsung' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี (บางซีรีส์ 12 ปี) · อะไหล่ 3 ปี'
  where kind = 'ac' and brand = 'Hisense' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี (อินเวอร์เตอร์) · แผงคอยล์/บอร์ด 3 ปี · อะไหล่ 1 ปี'
  where kind = 'ac' and brand = 'LG' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี · อะไหล่ 5 ปี'
  where kind = 'ac' and brand = 'Gree' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์สูงสุด 10 ปี · อะไหล่ 2 ปี (ตามรุ่น)'
  where kind = 'ac' and brand = 'Central' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี · อะไหล่ 2 ปี (รุ่น 30,000 BTU ขึ้นไป: คอมฯ 5 ปี อะไหล่ 1 ปี)'
  where kind = 'ac' and brand = 'Star aire' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี · อะไหล่ 5 ปี'
  where kind = 'ac' and brand = 'AUX' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 10 ปี · อะไหล่ 2 ปี (ตามรุ่น)'
  where kind = 'ac' and brand = 'Amena' and coalesce(trim(warranty), '') = '';
update materials set warranty = 'คอมเพรสเซอร์ 5–10 ปี · อะไหล่ 1–5 ปี (ตามรุ่น)'
  where kind = 'ac' and brand = 'Eminent' and coalesce(trim(warranty), '') = '';
