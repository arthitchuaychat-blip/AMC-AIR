-- locked: ปิดงานถาวร — แก้ไขได้เฉพาะธุรการ
alter table job_orders add column if not exists locked boolean default false;
