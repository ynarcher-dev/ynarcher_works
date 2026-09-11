-- HTML_TEMPLATE의 문서 값은 표식별 별도 입력값이 아니라, 작성자가 화면에서
-- 직접 편집한 전체 HTML이다. 데이터 구조는 바뀌지 않고 jsonb 계약 주석만 바로잡는다.

comment on column public.approval_form_versions.fields is
  '필드 스키마(jsonb 배열). 각 원소: {key, label, type, required?, options?, primaryAmount?, columns?, levels?, defaultValue?, htmlAssets?}. '
  'type ∈ TEXT/TEXTAREA/RICHTEXT/HTML_TEMPLATE/NUMBER/MONEY/DATE/SELECT/TABLE/BUDGET_TREE. '
  'HTML_TEMPLATE는 defaultValue에 새 문서의 원문 HTML, htmlAssets에 원본 이미지 src→Storage 경로를 저장하고 문서 값은 {html:편집한 전체 HTML}이다. '
  'TABLE은 행 객체 배열, BUDGET_TREE는 층 있는 예산표다. primaryAmount가 문서 대표 금액의 원천이며 버전 행은 불변이다.';
