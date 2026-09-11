-- 현재 쓰는 전자결재 양식을 하이웍스의 익숙한 대분류 → 양식 순서로 배치한다.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 소유: OFFICE 사용 / ADMIN 관리, 데이터 등급: Internal, 범위: global.
--   · 양식 메타와 버전 시드만 추가·정렬한다. 테이블·RLS·함수·권한·개인정보 변경 없음.
--   · 하이웍스 복원 양식(security_grade='하이웍스 원본')은 건드리지 않는다.
--   · 새 양식의 세부 항목은 아직 확정되지 않았으므로 범용 본문 한 칸만 둔다. 예산·지출의
--     이미 확정된 구조만 현재 품의서·지출결의서에서 복제한다.

do $$
declare
  r         record;
  v_form    uuid;
  v_version uuid;
  v_fields  jsonb;
begin
  -- sort_order는 분류와 그 안의 양식을 함께 정한다. 백 단위가 대분류, 일 단위가 하위 순서다.
  update public.approval_forms
     set category = case abbrev
                      when '일반' then '공통'
                      when '품의' then '품의서'
                      when '예변' then '품의서'
                      when '지결' then '지출결의서'
                      when '법카' then '지출결의서'
                      when '휴가' then '내부문서'
                      else category
                    end,
         sort_order = case abbrev
                        when '일반' then 0
                        when '품의' then 100
                        when '예변' then 104
                        when '지결' then 200
                        when '법카' then 201
                        when '휴가' then 406
                        else sort_order
                      end
   where deleted_at is null
     and security_grade <> '하이웍스 원본'
     and abbrev in ('일반', '품의', '예변', '지결', '법카', '휴가');

  for r in
    select *
      from (values
        ('사업품의서'::text,             '사업품'::text, '품의서'::text,     101, 'NONE'::text,           '품의'::text),
        ('출장품의서',                   '출장품',       '품의서',           102, 'NONE',                 null),
        ('사업 결과보고',                '결과',         '품의서',           103, 'NONE',                 null),
        ('인건비 지출결의서',            '인건',         '지출결의서',       202, 'SPEND_OPTIONAL',       '지결'),
        ('세금계산서 발행요청서',        '세금',         '협조',             300, 'NONE',                 null),
        ('서류 협조 요청서',             '서협',         '협조',             301, 'NONE',                 null),
        ('일반 결재',                    '내결',         '내부문서',         400, 'NONE',                 null),
        ('제안서',                       '제안',         '내부문서',         401, 'NONE',                 null),
        ('퇴직원',                       '퇴직',         '내부문서',         402, 'NONE',                 null),
        ('복직원',                       '복직',         '내부문서',         403, 'NONE',                 null),
        ('휴직원',                       '휴직',         '내부문서',         404, 'NONE',                 null),
        ('인사명령',                     '인사',         '내부문서',         405, 'NONE',                 null),
        ('공문',                         '공문',         '외부문서',         500, 'NONE',                 null)
      ) as seed(name, abbrev, category, sort_order, budget_link, source_abbrev)
  loop
    select f.id
      into v_form
      from public.approval_forms f
     where f.deleted_at is null
       and f.security_grade <> '하이웍스 원본'
       and (f.abbrev = r.abbrev or f.name = r.name)
     order by case when f.abbrev = r.abbrev then 0 else 1 end
     limit 1;

    if v_form is null then
      v_fields := '[{"key":"body","label":"내용","type":"RICHTEXT"}]'::jsonb;

      if r.source_abbrev is not null then
        select v.fields
          into v_fields
          from public.approval_forms f
          join public.approval_form_versions v on v.id = f.current_version_id
         where f.abbrev = r.source_abbrev
           and f.deleted_at is null
           and f.security_grade <> '하이웍스 원본'
         limit 1;

        v_fields := coalesce(
          v_fields,
          '[{"key":"body","label":"내용","type":"RICHTEXT"}]'::jsonb
        );
      end if;

      insert into public.approval_forms
        (name, abbrev, category, retention, security_grade, sort_order, budget_link)
      values
        (r.name, r.abbrev, r.category, '영구', 'A등급', r.sort_order, r.budget_link)
      returning id into v_form;

      insert into public.approval_form_versions (form_id, version_no, fields)
      values (v_form, 1, v_fields)
      returning id into v_version;

      update public.approval_forms
         set current_version_id = v_version
       where id = v_form;
    else
      -- 이미 관리자가 같은 양식을 만든 경우 스키마·약칭은 보존하고 위치만 맞춘다.
      update public.approval_forms
         set name = r.name,
             category = r.category,
             sort_order = r.sort_order,
             budget_link = r.budget_link
       where id = v_form;
    end if;
  end loop;
end;
$$;
