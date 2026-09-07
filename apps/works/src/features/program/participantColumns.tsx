import { Badge, type BadgeTone, type Column } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { maskEmail, maskName, maskPhone } from '@/lib/mask'
import type { SensitiveField } from '@/features/admin/sensitiveContents'
import {
  MANAGEMENT_STATUS_LABEL,
  MANAGEMENT_STATUS_TONE,
  type ManagementStatus,
} from '@/features/startup/startupClassification'
import { guestDoorBadge } from '@/features/program/guestDoorBadge'
import type { MasterTable, ParticipantRow } from '@/features/program/participantHooks'

interface LoginBadge {
  label: string
  tone: BadgeTone
}

/**
 * 대상 → 원장 상세 경로. 명부는 값을 복제하지 않고 원장을 가리키므로, 이름을 누르면
 * 그 원장으로 간다(기업은 STARTUP 상세, 전문가는 NETWORKS 상세).
 * 원장이 없는 내부 임직원 행은 갈 곳이 없어 링크를 걸지 않는다.
 */
function masterPath(row: ParticipantRow): string | null {
  if (!row.master_id) return null
  if (row.master_table === 'startups') return `/startup/discovered/${row.master_id}`
  if (row.master_table === 'networks') return `/networks/record/${row.master_id}`
  return null
}

/**
 * 구분 표기. 기업은 STARTUP 원장의 구분(발굴·보육·투자·기타)을 그대로 비추고, 전문가는
 * NETWORKS 원장 이름을 쓴다. 명부가 스스로 분류를 만들지 않는다 — 분류는 원장이 소유하고
 * 여기서는 라벨·톤 매핑(startupClassification)만 빌린다.
 */
function categoryBadge(row: ParticipantRow): LoginBadge | null {
  if (row.master_table === 'startups') {
    const code = row.masterCategory as ManagementStatus | null
    if (!code || !(code in MANAGEMENT_STATUS_LABEL)) return { label: '기업(구분 미지정)', tone: 'neutral' }
    return { label: MANAGEMENT_STATUS_LABEL[code], tone: MANAGEMENT_STATUS_TONE[code] }
  }
  if (row.master_table === 'networks') return { label: '전문가', tone: 'neutral' }
  return null
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
 * 참가자 명부(참여 기업·참여 전문가) 표의 컬럼.
 *
 * 머리글은 자격을 그대로 부른다 — 기업 탭에서 '대상'·'성명'이라 적으면 무엇의 이름인지가
 * 한 번 더 번역을 거친다. 기업의 로그인 명의는 원장의 대표자이고, 전문가는 본인이다.
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
  const isCompany = persona === 'startups'
  return [
    {
      key: 'targetName',
      header: isCompany ? '기업명' : '전문가명',
      type: 'name',
      render: (r) => {
        const to = masterPath(r)
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
      render: (r) => {
        const b = categoryBadge(r)
        return b ? <Badge tone={b.tone}>{b.label}</Badge> : '임직원'
      },
    },
    {
      key: 'loginName',
      header: isCompany ? '대표자' : '성명',
      type: 'person',
      render: (r) => {
        if (!r.master_id) return '—'
        if (!r.loginName) return <span className="text-danger">{isCompany ? '대표자 없음' : '성명 없음'}</span>
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
      key: 'login_status',
      header: '로그인 상태',
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
      // 옛 행은 트리거가 생기기 전이라 비어 있고, 지어내지 않고 그대로 비운다.
      key: 'createdByName',
      header: '생성자',
      type: 'person',
      render: (r) => r.createdByName ?? <span className="text-gray-500">—</span>,
    },
  ]
}
