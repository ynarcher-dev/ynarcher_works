-- NETWORKS는 외부 인물 원장이다. 국가가 없는 활성 행은 목록 필터와 권역 판별에서
-- 의미가 불명확하므로 신규 생성 및 복구를 막는다.
--
-- 과거 테스트용으로 soft-delete 된 country_tag_id=NULL 행은 감사 이력으로 보존한다.
-- 따라서 컬럼 전체 NOT NULL 대신 "활성 행"에 대한 CHECK를 사용한다.
ALTER TABLE public.networks
  ADD CONSTRAINT networks_active_country_required_chk
  CHECK (deleted_at IS NOT NULL OR country_tag_id IS NOT NULL)
  NOT VALID;

-- NOT VALID 제약도 추가 이후의 쓰기에는 즉시 적용된다. 기존 행 검증은 별도로 실행해
-- ACCESS EXCLUSIVE 잠금 구간을 짧게 유지한다.
ALTER TABLE public.networks
  VALIDATE CONSTRAINT networks_active_country_required_chk;

COMMENT ON CONSTRAINT networks_active_country_required_chk ON public.networks IS
  '활성 네트워크 인물은 국가 태그가 필수이며, 국가 미확인 삭제 이력만 보존한다.';
