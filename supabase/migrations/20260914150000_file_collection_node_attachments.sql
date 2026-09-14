-- =====================================================================
-- 파일받기 — **문항에 딸린 담당자 자료**(양식·견본) (2026-09-14 사용자 지정)
--
-- 무엇이 부족했는가
--   지금까지 파일받기에서 파일이 흐르는 방향은 하나였다 — 게스트가 올리고 WORKS가 받는다.
--   그런데 "이 양식에 맞춰 내 주십시오"는 **문항마다 다른 말**이라, 담당자가 건네야 할 서식이
--   생기면 붙일 자리가 없었다(모듈 공지에 한 벌로 올리면 어느 문항의 양식인지 화면이 답하지
--   못한다). 그래서 귀속을 화면이 아니라 **문항 1개**로 둔다 — 게시판 첨부(공지 1건)와 같은 축이다.
--
-- 왜 전용 표를 만들지 않는가
--   20260913210500의 "attachments를 쓰지 않는다"는 **게스트 제출물**에 대한 것이다. 그 전제는
--   게스트끼리 서로의 파일을 못 본다는 것인데, 여기 붙는 자료는 정확히 그 반대다 — 담당자가
--   배정된 사람 **모두에게** 같은 양식을 건넨다. 전제가 반대이므로 표도 반대쪽(`attachments`,
--   버킷 `attachments`)을 쓴다. 게스트 제출물은 여전히 `file_collection_files`가 갖는다.
--
--   귀속: `target_type = 'file_collection_node'`, `target_id` = 문항 마디 id,
--        `program_module_id` = 그 문항의 파일받기 모듈(모듈 하드 삭제 차단 집계가 이 칸을 본다).
--
-- 이 마이그레이션이 여는 것과 좁히는 것
--   · (여는 것) 게스트가 **자기 배정이 있는** 파일받기의 문항 자료를 읽는다 — 새 정책 하나.
--   · (좁히는 것) 이 종류의 첨부는 내부에서도 **그 사업을 읽을 수 있는 사람만** 본다.
--     공용 `attachments_select`는 target_type을 가리지 않으므로, 손대지 않으면 M&A 비밀딜의
--     문항 양식이 사업 밖 내부 사용자에게 열린다(파일받기 원장 여섯 표는 이미 막고 있다).
--   · (좁히는 것) 쓰기는 그 사업의 **쓰기 권한자**만 한다. 공용 insert 정책은 업로더 본인
--     여부만 보므로, 손대지 않으면 남의 사업 문항에 파일을 붙일 수 있다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: project / mna (행마다 문항의 모듈이 답한다. FUND 불가 —
--     판정 헬퍼가 entity_key에서 거른다). 데이터 등급: Internal(담당자가 배포하는 양식).
--   · 접근 주체: 그 사업 읽기 권한자(내부)와 **그 파일받기에 배정된 활성 게스트**.
--     쓰기는 그 사업 쓰기 권한자뿐이다.
--   · Scope: module → collection → node. 게스트 쪽은 assignment까지 되짚는다.
--   · **신규 테이블·신규 SECURITY DEFINER·신규 GRANT 없음.** 기존 판정 헬퍼
--     (`app.file_collection_internal_read/write`, `app.file_collection_guest_assignment_ids`)를
--     그대로 부른다. 셋 다 authenticated에 EXECUTE가 이미 있다.
--   · 재귀 없음: 되짚는 표(file_collection_nodes·assignments)의 정책은 attachments를 보지 않는다.
--   · Storage: 기존 비공개 버킷 `attachments` 그대로, 정책 변경 없음. 다운로드는 기존
--     material-download Edge Function(호출자 토큰으로 RLS 재검증 + access_logs 적재)을 탄다 —
--     새 다운로드 경로를 만들지 않는다. 이 마이그레이션이 SELECT를 좁히면 그 재검증도 함께 좁아진다.
--   · 삭제: 소프트 삭제(`deleted_at`)뿐이다. DELETE 정책은 신설하지 않는다.
-- 근거: 20260911224000(공용 attachments 정책의 현재 정본), 20260901180000(공지 첨부의 같은 축),
--       20260913210500(파일받기 판정 헬퍼), 20260902180000(모듈 하드 삭제 차단 집계)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 내부 읽기 — 문항 자료는 그 사업을 읽을 수 있는 사람만 본다
--     20260911224000의 정책에 `file_collection_node` 가드 한 줄을 더한 것이고 나머지는 같다.
-- ---------------------------------------------------------------------
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (
    app.is_admin()
    or (
      app.current_app_user_id() is not null
      and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest')
      and (
        case
          when target_type = 'ma_buyer' then app.can_read_ma_party('ma_buyer', target_id)
          when target_type = 'ma_seller' then app.can_read_ma_party('ma_seller', target_id)
          else true
        end
      )
      and (
        target_type not in ('office_minute', 'office_minute_voice')
        or app.can_read_minute(target_id)
      )
      and (target_type <> 'approval' or app.can_read_approval(target_id))
      -- 문항 자료는 파일받기 원장 여섯 표와 같은 경계를 탄다(M&A 비밀딜 경계 포함).
      and (
        target_type <> 'file_collection_node'
        or (program_module_id is not null and app.file_collection_internal_read(program_module_id))
      )
    )
  );

-- ---------------------------------------------------------------------
-- (2) 내부 쓰기 — 붙이는 것도 내리는 것도 그 사업의 쓰기 권한자만
--     문항이 실제로 그 모듈의 살아 있는 마디인지까지 본다(귀속 칸 둘이 어긋나면 거절).
-- ---------------------------------------------------------------------
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = app.current_app_user_id()
    and app.current_app_user_id() is not null
    and (
      case
        when target_type = 'ma_buyer' then app.can_manage_ma_party('ma_buyer', target_id)
        when target_type = 'ma_seller' then app.can_manage_ma_party('ma_seller', target_id)
        else true
      end
    )
    and (
      target_type not in ('office_minute', 'office_minute_voice')
      or app.is_minute_author(target_id)
    )
    and (target_type <> 'approval' or app.is_approval_drafter(target_id))
    and (
      target_type <> 'file_collection_node'
      or (
        program_module_id is not null
        and app.file_collection_internal_write(program_module_id)
        and exists (
          select 1
            from public.file_collection_nodes n
           where n.id = attachments.target_id
             and n.program_module_id = attachments.program_module_id
             and n.node_type = 'QUESTION'
             and n.deleted_at is null
        )
      )
    )
  );

drop policy if exists attachments_update on public.attachments;
create policy attachments_update on public.attachments for update to authenticated
  using (
    case
      when target_type = 'ma_buyer' then app.can_manage_ma_party('ma_buyer', target_id)
      when target_type = 'ma_seller' then app.can_manage_ma_party('ma_seller', target_id)
      -- 올린 사람만 내릴 수 있으면 담당자가 바뀐 사업에서 남의 양식을 치울 길이 없다.
      -- 그 사업을 쓸 수 있으면 그 사업의 자료를 정리할 수 있다.
      when target_type = 'file_collection_node' then
        program_module_id is not null and app.file_collection_internal_write(program_module_id)
      else app.is_admin() or uploaded_by = app.current_app_user_id()
    end
  )
  with check (
    case
      when target_type = 'ma_buyer' then app.can_manage_ma_party('ma_buyer', target_id)
      when target_type = 'ma_seller' then app.can_manage_ma_party('ma_seller', target_id)
      when target_type = 'file_collection_node' then
        program_module_id is not null and app.file_collection_internal_write(program_module_id)
      else app.is_admin() or uploaded_by = app.current_app_user_id()
    end
  );

-- ---------------------------------------------------------------------
-- (3) 게스트 읽기 — **배정된 사람만**
--     공용 게스트 정책은 `program_module_id`만 보므로(모듈 메뉴가 열린 게스트 전원), 그대로
--     두면 배정도 없는 게스트가 문항 양식을 읽는다. 이 종류만 공용에서 빼고 전용 정책이 받는다.
--     전용 정책은 배정 집합(`file_collection_guest_assignment_ids`)을 되짚으므로 계정 활성·
--     명부 생존·모듈 개방·세션 판정이 그 함수 하나에 모여 있다.
-- ---------------------------------------------------------------------
drop policy if exists attachments_guest_select on public.attachments;
create policy attachments_guest_select on public.attachments for select
  using (
    app.is_guest()
    and deleted_at is null
    and target_type <> 'file_collection_node'
    and program_module_id is not null
    and program_module_id in (select app.guest_open_module_ids())
  );

drop policy if exists attachments_fc_node_guest_select on public.attachments;
create policy attachments_fc_node_guest_select on public.attachments for select
  using (
    app.is_guest()
    and deleted_at is null
    and target_type = 'file_collection_node'
    and exists (
      select 1
        from public.file_collection_nodes n
        join public.file_collection_assignments a on a.collection_id = n.collection_id
       where n.id = attachments.target_id
         and n.deleted_at is null
         and a.id in (select app.file_collection_guest_assignment_ids())
    )
  );

comment on policy attachments_fc_node_guest_select on public.attachments is
  '파일받기 문항에 담당자가 붙인 자료(양식·견본)를 그 파일받기에 배정된 게스트가 읽는다. 게스트 제출물은 file_collection_files가 갖는다.';

-- 문항별 조회는 idx_attachments_target (target_type, target_id)가 이미 선두 키를 덮는다 —
-- 부분 인덱스를 새로 얹지 않는다.
