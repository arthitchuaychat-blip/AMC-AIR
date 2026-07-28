-- 181_tool_type_photos.sql — รูปอ้างอิงต่อชนิดเครื่องมือ (จาก Wikimedia Commons, สัญญาอนุญาตเปิด)
--   เก็บที่ tool_types.photo_url → เครื่องมือทุกชิ้นของชนิดนั้นแสดงรูปนี้อัตโนมัติ ถ้าชิ้นนั้นยังไม่มีรูปถ่ายจริง
--   รันซ้ำได้ · รันใน Supabase → SQL Editor หลัง 179/180

alter table tool_types add column if not exists photo_url text;

update tool_types t set photo_url = v.url
from (values
  ('ไขควงสั้น',              'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Screw_Driver_display.jpg/330px-Screw_Driver_display.jpg'),
  ('ไขควงยาว',              'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Screw_Driver_display.jpg/330px-Screw_Driver_display.jpg'),
  ('ตลับเมตร',              'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Tape_Measure_25%27_Klein_Tools.jpg/330px-Tape_Measure_25%27_Klein_Tools.jpg'),
  ('บันไดทรงเอ 5 ขั้น',      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Ladder.webp/330px-Ladder.webp.png'),
  ('บันไดทรงเอ 6 ขั้น',      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Ladder.webp/330px-Ladder.webp.png'),
  ('บันไดทรงเอ 7 ขั้น',      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Ladder.webp/330px-Ladder.webp.png'),
  ('บันไดสไลด์ 9 ขั้น',      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Ladder.webp/330px-Ladder.webp.png'),
  ('ถังดับเพลิง',            'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Wheeled_fire_extinguisher.jpg/330px-Wheeled_fire_extinguisher.jpg'),
  ('เครื่องดูดฝุ่น',          'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Numatic_Henry_vacuum_cleaner_%283308986870%29_%28cropped%29.jpg/330px-Numatic_Henry_vacuum_cleaner_%283308986870%29_%28cropped%29.jpg'),
  ('ประแจเลื่อน 10 นิ้ว',     'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Adjustablewrenches.jpg/330px-Adjustablewrenches.jpg'),
  ('ประแจเลื่อน 12 นิ้ว',     'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Adjustablewrenches.jpg/330px-Adjustablewrenches.jpg'),
  ('เครื่องเจีย 4"',          'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/AngleGrinder.jpg/330px-AngleGrinder.jpg'),
  ('มีดคัตเตอร์',            'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Aaknife2.jpg/330px-Aaknife2.jpg'),
  ('ระดับน้ำสั้น',            'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/DetalheNivelDeBurbuja.jpg/330px-DetalheNivelDeBurbuja.jpg'),
  ('ระดับน้ำแบบยาว',         'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/DetalheNivelDeBurbuja.jpg/330px-DetalheNivelDeBurbuja.jpg'),
  ('ชุดหกเหลี่ยม',           'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Set_of_eight_hex_allen_keys_on_ring_on_table.jpg/330px-Set_of_eight_hex_allen_keys_on_ring_on_table.jpg'),
  ('ปั้มน้ำแรงดันสูง',        'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/H%C3%B6gtryckstv%C3%A4tt_-_Pressure_washer_-_Ystad-2011.jpg/330px-H%C3%B6gtryckstv%C3%A4tt_-_Pressure_washer_-_Ystad-2011.jpg'),
  ('คลิปแอมป์',              'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Clampmeter_Fluke_337.jpg/330px-Clampmeter_Fluke_337.jpg'),
  ('เลื่อยไร้สาย',           'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Reciprocating_Saw.JPG/330px-Reciprocating_Saw.JPG'),
  ('ดินสอ',                 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Pencils_hb.jpg/330px-Pencils_hb.jpg'),
  ('ไฟคาดหน้าผาก',          'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Black_Diamond_Spot_on_Half_Dome_Helmet.JPG/330px-Black_Diamond_Spot_on_Half_Dome_Helmet.JPG'),
  ('เสื้อสะท้อนแสง',         'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Warnweste_gelb.jpg/330px-Warnweste_gelb.jpg'),
  ('ประแจก็อกแก็ก เบอร์ 11',  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Socket_wrench_and_sockets.JPG/330px-Socket_wrench_and_sockets.JPG'),
  ('ประแจก็อกแก็ก เบอร์ 14',  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Socket_wrench_and_sockets.JPG/330px-Socket_wrench_and_sockets.JPG'),
  ('คีมปอกสายไฟ',           'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tool_1530843.jpg/330px-Tool_1530843.jpg'),
  ('หมวก',                  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Cologne_Germany_Industrial-work-with-Personal-Protective-Equipment-04.jpg/330px-Cologne_Germany_Industrial-work-with-Personal-Protective-Equipment-04.jpg')
) as v(name, url)
where t.name = v.name;

-- ✅ ตรวจผล: ควรได้ ~26 ชนิดที่มีรูป
select count(*) as types_with_photo from tool_types where photo_url is not null;
