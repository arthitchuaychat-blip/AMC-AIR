begin;

insert into quotations(quote_no,status,issue_date,created_at,title) select 'PERF-TEST-'||lpad(n::text,3,'0'),'sent','2026-01-31','2026-01-31 23:59:59+07','unique-pagination-fixture' from generate_series(1,123) n;
insert into quotations(quote_no,status,issue_date,title) values ('PERF-TEST-OLD','sent','2020-01-01','unique-pagination-fixture'),('PERF-TEST-NEXT','sent','2026-02-01','unique-pagination-fixture');
do $$
declare r jsonb; a jsonb; b jsonb; c jsonb;
begin
 r:=quotation_page_bundle('unique-pagination-fixture','2026-01-31','2026-01-31');
 if (r->>'total')::int<>123 or jsonb_array_length(r->'nos')<>50 then raise exception 'count/date range'; end if;
 a:=r->'nos'; b:=quotation_page_bundle('unique-pagination-fixture','2026-01-31','2026-01-31','all','all','','{}',50)->'nos';
 c:=quotation_page_bundle('unique-pagination-fixture','2026-01-31','2026-01-31','all','all','','{}',100)->'nos';
 if (select count(distinct x) from jsonb_array_elements_text(a||b||c) x)<>123 then raise exception 'duplicate/missing page'; end if;
 if (quotation_page_bundle('PERF-TEST-OLD')->>'total')::int<>1 then raise exception 'old quote search'; end if;
 if (quotation_page_bundle('unique-pagination-fixture',null,null,'approved')->>'total')::int<>0 then raise exception 'status filter'; end if;
 if (quotation_page_bundle('unique-pagination-fixture',null,null,'all','all','','{}',999)->'nos')<>'[]'::jsonb then raise exception 'empty page'; end if;
end $$;
select 'PASS: 123 rows across 3 pages, no loss/duplicates, inclusive last day, old search, status filter, empty page' as result;

rollback;
