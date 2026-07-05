-- 106_ac_series.sql — จัดกลุ่มแอร์เป็น ยี่ห้อ → รุ่น/ซีรีส์ → ขนาด + สเปครายขนาด + โบรชัวร์รายรุ่น
-- รันใน Supabase → SQL Editor (ครั้งเดียว) — มีแกะข้อมูลอัตโนมัติจากชื่อ/รายละเอียดสินค้าให้ท้ายไฟล์มีตารางตรวจ

-- 1) สเปครายขนาด (เพิ่มบน materials — แก้ได้ในฟอร์มสินค้า)
alter table materials add column if not exists series       text;     -- ชื่อรุ่น/ซีรีส์ (เช่น FTKQ, Apollo III)
alter table materials add column if not exists voltage      text;     -- 220V / 380V
alter table materials add column if not exists refrigerant  text;     -- ชนิดน้ำยา R32 / R410A / R22
alter table materials add column if not exists seer         numeric;  -- ค่า SEER
alter table materials add column if not exists pipe_size    text;     -- ขนาดท่อน้ำยา เช่น 1/4 1/2
alter table materials add column if not exists energy_label text;     -- ฉลากประหยัดไฟ: เบอร์ 5 (★–★★★) / มอก. / null=ไม่มี

-- 2) ข้อมูลระดับ "รุ่น" (คุณสมบัติ + โบรชัวร์ ใช้ร่วมทุกขนาด)
create table if not exists ac_series (
  id           bigint generated always as identity primary key,
  brand        text not null default '',
  name         text not null,
  features     text,          -- คุณสมบัติของรุ่น (แสดงบนเว็บ)
  brochure_url text,          -- โบรชัวร์ (PDF/รูป)
  created_at   timestamptz not null default now(),
  unique (brand, name)
);
alter table ac_series enable row level security;
grant select on ac_series to anon;
drop policy if exists ac_series_read on ac_series;
create policy ac_series_read on ac_series for select to anon, authenticated using (true);
drop policy if exists ac_series_write on ac_series;
create policy ac_series_write on ac_series for all to authenticated
  using (my_role() in ('admin','exec','sales','stock','finance','hr'))
  with check (my_role() in ('admin','exec','sales','stock','finance','hr'));

-- 3) แกะสเปคจากชื่อ+รายละเอียด (เติมเฉพาะช่องที่ยังว่าง — แก้ทับได้ในฟอร์ม)
-- ชนิดน้ำยา
update materials m set refrigerant = 'R' || upper((regexp_match(t.txt, 'R[ -]?(32|410A|410|22|290)'))[1])
from (select code, coalesce(name_th,'')||' '||coalesce(name_en,'')||' '||coalesce(description,'') as txt from materials) t
where t.code = m.code and m.kind = 'ac' and m.refrigerant is null and t.txt ~* 'R[ -]?(32|410A|410|22|290)';
update materials set refrigerant = 'R410A' where refrigerant = 'R410';

-- กำลังไฟ (เจอ 380 ก่อน 220 — เครื่อง 3 เฟสมักเขียนทั้งคู่)
update materials m set voltage = case when t.txt ~* '380\s*V' then '380V' when t.txt ~* '220\s*V' then '220V' end
from (select code, coalesce(name_th,'')||' '||coalesce(name_en,'')||' '||coalesce(description,'') as txt from materials) t
where t.code = m.code and m.kind = 'ac' and m.voltage is null and t.txt ~* '(380|220)\s*V';

-- ค่า SEER
update materials m set seer = ((regexp_match(t.txt, 'SEER[ :=]*([0-9]+\.?[0-9]*)', 'i'))[1])::numeric
from (select code, coalesce(name_th,'')||' '||coalesce(name_en,'')||' '||coalesce(description,'') as txt from materials) t
where t.code = m.code and m.kind = 'ac' and m.seer is null and t.txt ~* 'SEER[ :=]*[0-9]';

-- ขนาดท่อน้ำยา (เช่น "Pipe 1/4 1/2")
update materials m set pipe_size = trim((regexp_match(t.txt, 'PIPE[ :=]*([0-9]+/[0-9]+(?:[ ,x·]+[0-9]+/[0-9]+)?)', 'i'))[1])
from (select code, coalesce(name_th,'')||' '||coalesce(name_en,'')||' '||coalesce(description,'') as txt from materials) t
where t.code = m.code and m.kind = 'ac' and m.pipe_size is null and t.txt ~* 'PIPE[ :=]*[0-9]+/[0-9]+';

-- ฉลากประหยัดไฟ: "#5", "#5*", "#5**", "#5***" → เบอร์ 5 (+ดาว) · เจอคำว่า มอก → มอก.
update materials m set energy_label = 'เบอร์ 5' ||
  case when length((regexp_match(t.txt, '#\s*5(\*{1,3})'))[1]) > 0
       then ' ' || repeat('★', length((regexp_match(t.txt, '#\s*5(\*{1,3})'))[1])) else '' end
from (select code, coalesce(name_th,'')||' '||coalesce(name_en,'')||' '||coalesce(description,'') as txt from materials) t
where t.code = m.code and m.kind = 'ac' and m.energy_label is null and t.txt ~ '#\s*5';
update materials m set energy_label = 'มอก.'
from (select code, coalesce(name_th,'')||' '||coalesce(name_en,'')||' '||coalesce(description,'') as txt from materials) t
where t.code = m.code and m.kind = 'ac' and m.energy_label is null and t.txt ~* 'มอก';

-- ชื่อรุ่น: (ก) ชื่อมี "... Series" → เอาคำหน้า Series (ไม่เกิน 2 คำ) · (ข) ไม่มีก็เดาจากตัวอักษรนำหน้ารหัส (FTKQ09… → FTKQ)
update materials m set series = trim((regexp_match(t.txt, '([A-Za-z0-9]+(?: [A-Za-z0-9]+)?)\s+Series', 'i'))[1])
from (select code, coalesce(name_th,'')||' '||coalesce(name_en,'') as txt from materials) t
where t.code = m.code and m.kind = 'ac' and m.series is null and t.txt ~* '[A-Za-z0-9]\s*Series';
update materials set series = upper((regexp_match(code, '^[0-9]*([A-Za-z]{2,})'))[1])
where kind = 'ac' and series is null and code ~ '^[0-9]*[A-Za-z]{2,}';

-- 4) สร้างข้อมูลรุ่นตั้งต้น — คุณสมบัติยกจากสินค้าตัวแรกของแต่ละรุ่น
insert into ac_series (brand, name, features)
select distinct on (coalesce(brand,''), series) coalesce(brand,''), series, features
from materials
where kind = 'ac' and series is not null
order by coalesce(brand,''), series, code
on conflict (brand, name) do nothing;

-- 5) เปิดคอลัมน์ใหม่ให้เว็บ
drop view if exists web_products cascade;
create view web_products as
  select code, name_th, name_en, kind, brand, btu, ac_type, unit,
         sale_price, description, photo_url, power_cost_year, features, category, btu_min, btu_max,
         series, voltage, refrigerant, seer, pipe_size, energy_label
  from materials
  where web_published = true and coalesce(active, true) = true;
grant select on web_products to anon, authenticated;

-- ✅ ตรวจผล 1: สรุปรุ่นต่อยี่ห้อ (ยี่ห้อ · รุ่น · กี่ขนาด)
select coalesce(brand,'?') as ยี่ห้อ, series as รุ่น, count(*) as จำนวนขนาด,
       string_agg(distinct coalesce(energy_label,'-'), ', ') as ฉลาก
from materials where kind = 'ac' and series is not null
group by 1, 2 order by 1, 2 limit 100;

-- ✅ ตรวจผล 2: ตัวอย่างสเปคที่แกะได้ 30 ตัวแรก
select code, series, voltage, refrigerant, seer, pipe_size, energy_label
from materials where kind = 'ac' order by brand, series, btu limit 30;

-- ✅ ตรวจผล 3: แอร์ที่ยังเดารุ่นไม่ได้ (ควรว่างหรือน้อยมาก)
select code, name_th from materials where kind = 'ac' and series is null limit 50;
