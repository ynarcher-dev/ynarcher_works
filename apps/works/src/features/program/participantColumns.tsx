import { Badge, type BadgeTone, type Column } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { maskEmail, maskName, maskPhone } from '@/lib/mask'
import type { SensitiveField } from '@/features/admin/sensitiveContents'
import { guestDoorBadge } from '@/features/program/guestDoorBadge'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import type { ParticipantRow } from '@/features/program/participantHooks'

interface LoginBadge {
  label: string
  tone: BadgeTone
}

/**
 * 로그인 상태 한 열 — **결론만 적는다**(2026-09-05 개편).
 *
 * 종전에는 `계정`(있음/없음) · `상태`(허용 전·초대·완료·차단) · `접근 기간`(제한 없음·만료)
 * 세 열이 재료를 늘어놓고, "이 사람 지금 들어올 수 있나"의 조합은 담당자가 머리로 했다.
 * 실제 게이트는 그 셋의 AND이므로 한 열이 그 결과를 답한다. 계정 유무는 열을 잃지 않는다 —
 * 계정이 없으면 애초에 '미발급'이고, 있으면 옆의 최종 접속이 그것을 증언한다.
 *
 * **판정 자체는 여기 살지 않는다**(2026-09-07). GUEST계정 발급 화면의 참여 사업 목록이 같은
 * 사실을 답해야 하는데, 각자 조합하면 어긋난 날 어느 쪽이 사실인지 판정할 근거가 없다 —
 * 순서와 라벨의 소유자는 `guestDoorBadge`이고, 여기서는 명부 행을 그 입력으로 옮길 뿐이다.
 */
export function loginBadge(
  row: ParticipantRow,
  programStatus: string,
  guestAccessEndsAt: string | null,
): LoginBadge {
  return guestDoorBadge({
    loginStatus: row.login_status,
    hasTarget: Boolean(row.master_id),
    programStatus,
    accessEndsAt: guestAccessEndsAt,
  })
}

/**
 * 최종 접속 표기(`26.09.03. 14:22`). 초까지 적지 않는다 — 담당자가 보는 것은 '들어와 봤는가'와
 * '얼마나 오래됐는가'이지 정확한 시각이 아니다.
 *
 * 이 값은 **계정**의 사실이라 다른 사업에 로그인해도 갱신된다(계정이 대상마다 하나이므로).
 * 이 사업에 들어왔는지는 상태 열의 '이용 중'이 답한다.
 */
function formatLastLogin(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(d.getFullYear() % 100)}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}. ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/**
 * 참가자 명부 표의 컬럼.
 *
 * 머리글은 자격을 그대로 부른다 — 기업 탭에서 '대상'·'성명'이라 적으면 무엇의 이름인지가
 * 한 번 더 번역을 거친다. 그 낱말의 소유자는 이 파일이 아니라 자격 설정
 * (`PARTICIPANT_PERSONAS`)이다 — 자격이 셋 이상이 되면 삼항으로는 답할 수 없고, 자격마다
 * 여기를 열어 분기를 늘리면 새 자격을 여는 일이 표를 고치는 일이 된다.
 *
 * 연락처는 그 사람에게 인증이 어디로 가는가이므로 이름 옆에 붙어 한 짝으로 읽힌다 —
 * 매핑이 막혔을 때 성명이 빈 건지 연락처가 빈 건지 눈으로 가려야 한다.
 * 표기는 ADMIN '민감정보 관리'의 정책을 그대로 따른다.
 */
export function participantColumns(
  masked: Record<SensitiveField, boolean>,
  programStatus: string,
  guestAccessEndsAt: string | null,
  persona: MasterTable,
): Column<ParticipantRow>[] {
  const spec = PARTICIPANT_PERSONAS[persona]
  return [
    {
      key: 'targetName',
      header: spec.nameHeader,
      type: 'name',
      render: (r) => {
        // 명부는 값을 복제하지 않고 원장을 가리키므로, 이름을 누르면 그 원장으로 간다.
        // 원장이 없는 내부 임직원 행은 갈 곳이 없어 링크를 걸지 않는다.
        const to = r.master_id ? spec.detailPath(r.master_id) : null
        return to ? (
          <Link
            to={to}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-info underline underline-offset-2 transition-opacity duration-fast hover:opacity-80"
          >
            {r.targetName}
          </Link>
        ) : (
          r.targetName
        )
      },
    },
    {
      key: 'masterCategory',
      header: '구분',
      type: 'badge',
      // 명부가 스스로 분류를 만들지 않는다 — 분류는 원장이 소유하고 자격 설정이 라벨·톤만 빌린다.
      render: (r) => {
        if (!r.master_table) return '임직원'
        const b = spec.categoryBadge(r.masterCategory)
        return <Badge tone={b.tone}>{b.label}</Badge>
      },
    },
    {
      key: 'loginName',
      header: spec.loginNameHeader,
      type: 'person',
      render: (r) => {
        if (!r.master_id) return '—'
        if (!r.loginName) return <span className="text-danger">{spec.loginNameMissing}</span>
        return masked.name ? maskName(r.loginName) : r.loginName
      },
    },
    {
      key: 'contact',
      header: '연락처',
      type: 'text',
      render: (r) => {
        if (!r.master_id) return '—'
        if (r.email) return masked.email ? maskEmail(r.email) : r.email
        if (r.phone) return masked.phone ? maskPhone(r.phone) : r.phone
        return <span className="text-danger">연락처 없음</span>
      },
    },
    {
      // 머리글이 `로그인 상태`이던 것을 `상태`로 줄인다(2026-09-08). 배지 열의 폭(80px)은
      // 담기는 **값**이 정한 규격인데(배지 네 글자), 여섯 글자 머리글이 그 폭을 넘겨 두 줄로
      // 접히며 표 전체의 행 높이를 밀어 올리고 있었다. 규격을 정해 놓고 머리글이 그것을
      // 이기면 규격이 아니므로, 줄일 것은 열 폭이 아니라 머리글이다(DataTable 머리글 주석).
      //
      // 뜻을 잃지 않는 이유: 이 표에서 상태라 부를 만한 축은 문(門) 하나뿐이고, 옆의
      // `구분`은 원장의 분류라 헷갈릴 자리가 없다. 값 자체도 초대·이용 중·차단이라
      // 무엇의 상태인지 스스로 말한다.
      key: 'login_status',
      header: '상태',
      type: 'badge',
      render: (r) => {
        const b = loginBadge(r, programStatus, guestAccessEndsAt)
        return <Badge tone={b.tone}>{b.label}</Badge>
      },
    },
    {
      key: 'lastLoginAt',
      header: '최종 접속',
      type: 'datetime',
      render: (r) => {
        if (!r.master_id) return '—'
        if (!r.lastLoginAt) return <span className="text-gray-500">없음</span>
        return formatLastLogin(r.lastLoginAt)
      },
    },
    {
      // 생성자는 어떤 권한도 주지 않는 서술 값이라 관리 주체(사업 담당자)를 흐리지 않는다.
      // 값은 화면이 보내지 않고 INSERT 트리거가 찍는다(app.stamp_participant_insert).
      // 컬럼이 2026-09-05에 생겼으므로 그 전에 담긴 줄은 비어 있고, 지어내지 않고 비운다.
      key: 'createdByName',
      header: '생성자',
      type: 'person',
      render: (r) => r.createdByName ?? <span className="text-gray-500">—</span>,
    },
  ]
}
