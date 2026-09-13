import { Badge, EmptyValue, type BadgeTone, type Column } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { maskEmail, maskName, maskPhone } from '@/lib/mask'
import type { SensitiveField } from '@/features/admin/sensitiveContents'
import { guestDoorBadge } from '@/features/program/guestDoorBadge'
import { PARTICIPANT_PERSONAS } from '@/features/program/participantPersona'
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
 * 실제 게이트는 그 셋의 AND이므로 한 열이 그 결과를 답한다.
 *
 * **판정 자체는 여기 살지 않는다**(2026-09-07). GUEST계정 발급 화면의 참여 사업 목록이 같은
 * 사실을 답해야 하는데, 각자 조합하면 어긋난 날 어느 쪽이 사실인지 판정할 근거가 없다 —
 * 순서와 라벨의 소유자는 `guestDoorBadge`이고, 여기서는 명부 행을 그 입력으로 옮길 뿐이다.
 *
 * **`hasTarget`은 원장이 아니라 "로그인이라는 개념이 서는가"를 묻는다**(2026-09-13). 그
 * 판정에 원장 연결을 쓰던 동안, 원장 없는 게스트 계정은 문이 실제로 열려 있어도 화면에서
 * `해당 없음`으로 읽혔다 — 계정이 달린 줄은 원장이 없어도 들어올 수 있으므로 그 줄에는
 * 문이 있다. 계정도 원장도 없는 줄만 여전히 `해당 없음`이다.
 */
export function loginBadge(
  row: ParticipantRow,
  programStatus: string,
  guestAccessEndsAt: string | null,
): LoginBadge {
  return guestDoorBadge({
    loginStatus: row.login_status,
    hasTarget: Boolean(row.master_id) || row.isGuestAccount,
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
 * GUEST 계정 명부 표의 컬럼 — **계정이 첫 열이고 원장은 곁들이는 열이다**(2026-09-13 개편).
 *
 * 종전 이 표의 축은 자격(원장)이었다. 첫 열이 기업명이고 머리글이 자격마다 갈렸으며
 * (`기업명`·`전문가명`), 원장이 없는 줄은 `임직원`이라 적혔다. 명부가 자격 탭을 걷고 한 벌로
 * 서면서 그 셋이 모두 성립하지 않는다.
 *
 *  · 머리글은 **자격을 부르지 않는다.** 한 표에 여러 자격이 함께 서므로 자격을 부르는 머리글은
 *    그중 하나를 골라 전체에 붙이는 일이 된다.
 *  · 첫 열은 **계정명**이다. 이 표가 답하는 물음이 "누가 이 사업에 들어오는가"이고, 그 답을
 *    가진 것은 원장의 기업명이 아니라 문을 여는 계정이다.
 *  · `연결 원장`은 **선택적 표시**다. 없으면 빈 칸이며 `임직원`이라 적지 않는다 — 임직원 줄은
 *    애초에 이 명부에 서지 않는다(`isGuestRosterRow`).
 *
 * 표기는 ADMIN '민감정보 관리'의 정책을 그대로 따른다.
 */
export function participantColumns(
  masked: Record<SensitiveField, boolean>,
  programStatus: string,
  guestAccessEndsAt: string | null,
): Column<ParticipantRow>[] {
  return [
    {
      key: 'accountName',
      header: '계정명',
      type: 'name',
      primary: true,
      render: (r) => {
        // 계정이 아직 없는 줄은 원장이 적어 둔 대상 이름으로 선다. 그 사실을 함께 적지 않으면
        // 이름이 있으니 계정도 있는 것으로 읽힌다.
        if (!r.accountName) {
          return (
            <span>
              {r.targetName} <span className="text-body-sm text-gray-500">(계정 없음)</span>
            </span>
          )
        }
        return masked.name ? maskName(r.accountName) : r.accountName
      },
    },
    {
      key: 'accountEmail',
      header: '이메일',
      type: 'long',
      // 계정의 이메일은 **로그인 아이디**다. 원장 이메일과 갈리므로 원장값으로 대신 채우지
      // 않는다 — 담당자가 그 값으로 안내하면 들어오지 못한다.
      render: (r) => {
        if (!r.accountEmail) return <EmptyValue />
        return masked.email ? maskEmail(r.accountEmail) : r.accountEmail
      },
    },
    {
      key: 'phone',
      header: '연락처',
      type: 'phone',
      render: (r) => {
        if (!r.phone) return <EmptyValue />
        return masked.phone ? maskPhone(r.phone) : r.phone
      },
    },
    {
      key: 'source',
      header: '연결 원장',
      type: 'text',
      /*
        명부가 스스로 분류를 만들지 않는다 — 분류는 원장이 소유하고 자격 설정이 라벨·톤만
        빌린다. 연결이 없으면 빈 칸이다(없는 사실을 채우지 않는다).
      */
      render: (r) => {
        if (!r.master_table || !r.master_id) return <EmptyValue />
        const spec = PARTICIPANT_PERSONAS[r.master_table]
        const badge = spec.categoryBadge(r.masterCategory)
        const to = spec.detailPath(r.master_id)
        const name = to ? (
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
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <span className="truncate">{name}</span>
          </div>
        )
      },
    },
    {
      // 머리글이 `로그인 상태`이던 것을 `상태`로 줄인다(2026-09-08). 배지 열의 폭(80px)은
      // 담기는 **값**이 정한 규격인데(배지 네 글자), 여섯 글자 머리글이 그 폭을 넘겨 두 줄로
      // 접히며 표 전체의 행 높이를 밀어 올리고 있었다.
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
