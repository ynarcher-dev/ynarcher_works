import type { GuestHostConfig, GuestHostEntity } from '@/features/guest/host'
import type { Fund } from '@/features/fund/hooks'

/**
 * 조합(FUND)의 게스트 맥락 설정 — **대상은 포트폴리오사 하나**다.
 *
 * 사업 워크스페이스처럼 `ProgramWorkspaceConfig`를 세우지 않는다. 조합은 사업이 아니라
 * 그 설정의 대부분(사업구분·제안 단계·주관·인력 배치 RPC·목록 경로)을 답할 수 없고, 값을
 * 지어내 채우면 그 설정이 거짓을 말하기 시작한다. 게스트 화면들이 실제로 묻는 다섯 칸만 든다.
 *
 * **명단은 포트폴리오가 답한다**(2026-09-09 사용자 확정). `investments`가 이미 "이 조합이
 * 누구에게 투자했는가"를 답하고 있으므로 참가자 명단 표를 따로 두지 않는다 — 같은 사실을
 * 두 곳에 적으면 어긋나고, 어긋났을 때 어느 쪽이 사실인지 판정할 근거가 없다.
 *
 * **딜메이커는 여기 들지 않는다.** 그 사람들은 `startup_managers`의 내부 임직원이고, 포털은
 * 밖에서 들어오는 사람을 위한 문이다. 안에 있는 사람에게 문을 하나 더 내면 계정도 비밀번호도
 * 감사 기록도 한 사람이 둘을 갖게 된다 — 그들이 보아야 할 것은 WORKS 안에 창으로 낸다.
 *
 * 근거: docs/docs_planning/3_9_2_external_portal_expansion.md §9
 */
export const FUND_GUEST_HOST: GuestHostConfig = {
  key: 'fund',
  entityKey: 'fund',
  entityNoun: 'FUND',
  // '사업개요'·'프로젝트 개요'와 같은 자리. 조합이 밖에 내놓는 소개문이다.
  overviewNoun: '조합 개요',
  // 명단을 부르는 이름은 그 명단이 실제로 사는 곳의 이름이어야 한다 — 담당자가 여는 탭도
  // 포트폴리오이고, '참가자 목록'이라 적으면 어디에 가서 담아야 하는지가 어긋난다.
  rosterLabel: '포트폴리오',
  // 계정을 세우는 대상은 포트폴리오사(STARTUP 원장) 하나다. LP·조합원은 이번 범위 밖이며,
  // 그쪽은 보는 것이 자기 회사 한 줄이 아니라 조합 전체라 무엇을 보여줄지부터 정해야 한다.
  guestMasterTables: ['startups'],
  rosterSource: {
    kind: 'table',
    table: 'investments',
    parentColumn: 'fund_id',
    idColumn: 'startup_id',
    master: 'startups',
    deletedColumn: 'deleted_at',
  },
}

/**
 * 조합 한 줄을 게스트 화면이 읽는 모양으로 옮긴다.
 *
 * 옮기는 것은 셋뿐이다 — 제목 칸의 이름(`name` → `title`), 담당자 목록의 이름(`operators`),
 * 그리고 없을 수 있는 값의 기본형. **칸 이름을 맞추는 일은 원장을 아는 쪽이 끝낸다**:
 * 게스트 화면이 `fund.name`을 알게 되면 그 이름이 표·모달·훅으로 번져, 원장을 하나 더 여는
 * 일이 그 전부를 고치는 일이 된다.
 */
export function fundAsGuestHost(fund: Fund): GuestHostEntity {
  return {
    id: fund.id,
    title: fund.name,
    status: fund.status,
    guest_access_ends_at: fund.guest_access_ends_at ?? null,
    // 문을 여닫을 수 있는 사람 — 운용·관리 인력 전원이다. 대표펀드매니저 한 사람으로 좁히지
    // 않는 것은 사업이 PM 한 사람으로 좁히지 않는 것과 같은 이유다(자리를 비웠을 때 아무도
    // 문을 열 수 없어서는 안 된다). 실제 강제는 서버의 app.is_program_manager가 한다.
    managers: (fund.operators ?? []).map((o) => ({ user_id: o.user_id })),
  }
}
