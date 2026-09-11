-- 20260911193000의 공문 전용 컴포넌트 결정을 범용 HTML 양식으로 바로잡는다.
-- 과거 버전은 불변으로 남기고 현재 공문만 새 버전을 발행한다.
-- 화면은 sandbox iframe에서 원문을 표시하며 script·iframe·form은 실행 전에 제거한다.

do $$
declare
  v_form_id uuid;
  v_version_id uuid;
  v_next_version integer;
begin
  select f.id
    into v_form_id
    from public.approval_forms f
   where f.deleted_at is null
     and f.security_grade <> '하이웍스 원본'
     and (f.abbrev = '공문' or f.name = '공문')
   order by case when f.abbrev = '공문' then 0 else 1 end
   limit 1;

  if v_form_id is null then
    raise notice '현재 사용 공문 양식이 없어 범용 HTML 버전 발행을 건너뜁니다.';
    return;
  end if;

  if exists (
    select 1
      from public.approval_forms f
      join public.approval_form_versions v on v.id = f.current_version_id
      cross join lateral jsonb_array_elements(v.fields) field
     where f.id = v_form_id
       and field->>'type' = 'HTML_TEMPLATE'
  ) then
    return;
  end if;

  select coalesce(max(v.version_no), 0) + 1
    into v_next_version
    from public.approval_form_versions v
   where v.form_id = v_form_id;

  insert into public.approval_form_versions (form_id, version_no, fields)
  values (
    v_form_id,
    v_next_version,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'html_document',
        'label', '공문',
        'type', 'HTML_TEMPLATE',
        'required', true,
        'defaultValue', $html$
<div class="se-contents" style="box-sizing:content-box;font-family:'맑은 고딕',sans-serif;font-size:16px;line-height:1.6;margin:0">
  <table style="border-collapse:separate;border-spacing:0;margin-left:auto;margin-right:auto;width:653px;border:0" cellpadding="0">
    <colgroup>
      <col style="width:71px">
      <col style="width:16px">
      <col style="width:406px">
      <col style="width:160px">
    </colgroup>
    <tbody>
      <tr style="height:28px">
        <td colspan="3" style="padding:0;vertical-align:bottom"><p style="font-size:20px;font-weight:bold;line-height:1;margin:0">와이앤아처&nbsp;주식회사</p></td>
        <td rowspan="3" style="padding:0;text-align:center;vertical-align:top"><img style="width:76.4973px;height:65.8862px;object-fit:contain" src="/ynarcher.com/approval/image/form_view/1969" width="76.4973" height="65.8862"></td>
      </tr>
      <tr style="height:20px"><td colspan="3" style="padding:0;vertical-align:bottom;font-size:12px;line-height:1">서울시&nbsp;강남구 테헤란로7길 22 한국과학기술회관 2관 2층 202호</td></tr>
      <tr style="height:20px"><td colspan="3" style="padding:0;vertical-align:bottom;font-size:12px;line-height:1">Tel.&nbsp;02-2690-1550&nbsp;&nbsp;&nbsp;Fax.&nbsp;02-6918-6560&nbsp;&nbsp;&nbsp;<a style="text-decoration:underline;color:rgb(22,63,199)" target="_blank" href="http://www.ynarcher.com">www.ynarcher.com</a></td></tr>
      <tr><td colspan="4" style="height:20px;padding:0">&nbsp;</td></tr>
      <tr style="height:28px">
        <td style="padding:0;font-size:14px">문서번호</td><td style="padding:0;text-align:center;font-size:14px">:</td>
        <td style="padding:0;font-size:14px">{{# 문서 번호}}</td><td style="padding:0;text-align:center;font-size:14px">{{#발송일}}</td>
      </tr>
      <tr style="height:28px"><td style="padding:0;font-size:14px">수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신</td><td style="padding:0;text-align:center;font-size:14px">:</td><td colspan="2" style="padding:0;font-size:14px">{{# 수신}}</td></tr>
      <tr style="height:28px"><td style="padding:0;font-size:14px">참&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;조</td><td style="padding:0;text-align:center;font-size:14px">:</td><td colspan="2" style="padding:0;font-size:14px">{{# 참조}}</td></tr>
      <tr style="height:28px">
        <td style="padding:0;border-bottom:1px solid #000;font-size:14px">제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목</td><td style="padding:0;border-bottom:1px solid #000;text-align:center;font-size:14px">:</td><td colspan="2" style="padding:0;border-bottom:1px solid #000;font-size:14px">{{# 문서 제목}}</td>
      </tr>
      <tr><td colspan="4" style="padding:16px 0 0;font-size:14px;line-height:1.4">{{#에디터}}</td></tr>
      <tr style="height:110px"><td colspan="4" style="padding:8px 0 0;text-align:center;vertical-align:top"><img style="width:270px;height:99.8px;object-fit:contain;border:0" src="/ynarcher.com/approval/image/form_view/940" width="270" height="99.8"></td></tr>
    </tbody>
  </table>
</div>
$html$
      )
    )
  )
  returning id into v_version_id;

  update public.approval_forms
     set current_version_id = v_version_id
   where id = v_form_id;
end;
$$;

comment on column public.approval_form_versions.fields is
  '필드 스키마(jsonb 배열). 각 원소: {key, label, type, required?, options?, primaryAmount?, columns?, levels?, defaultValue?, htmlAssets?}. '
  'type ∈ TEXT/TEXTAREA/RICHTEXT/HTML_TEMPLATE/NUMBER/MONEY/DATE/SELECT/TABLE/BUDGET_TREE. '
  'HTML_TEMPLATE는 defaultValue에 원문 HTML, htmlAssets에 원본 이미지 src→Storage 경로를 저장하고 문서 값은 {slots:{표식:값}}이다. '
  'TABLE은 행 객체 배열, BUDGET_TREE는 층 있는 예산표다. primaryAmount가 문서 대표 금액의 원천이며 버전 행은 불변이다.';
