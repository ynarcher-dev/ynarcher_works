import { Badge, type BadgeTone, type Column } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { maskEmail, maskName, maskPhone } from '@/lib/mask'
import type { SensitiveField } from '@/features/admin/sensitiveContents'
import {
  MANAGEMENT_STATUS_LABEL,
  MANAGEMENT_STATUS_TONE,
  type ManagementStatus,
} from '@/features/startup/startupClassification'
import type { ParticipantRow } from '@/features/program/participantHooks'

/** 게스트가 진입할 수 없는 사업 상태. 이때 열린 문은 화면에서 '닫힘'으로 읽힌다. */
const DEAD_STATUSES = ['FINISHED', 'CANCELLED']

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
 * 로그인 상태 표기. 저장값 5종에 파생 표기 1종('닫힘')이 얹힌다 —
 * 사업이 종료·취소되면 판정 시점에 자동으로 막히지만 원장 값은 그대로 둔다.
 * 상태를 내려 저장하면 사업을 되돌렸을 때 자동 복구되지 않아, '사업이 끝났다'와
 * '담당자가 막았다'라는 다른 두 사실이 한 칸에 섞인다.
 */
export function loginBadge(row: ParticipantRow, programStatus: string): LoginBadge {
  if (row.login_status === 'NOT_APPLICABLE' || !row.master_id) {
    return { label: '해당 없음', tone: 'neutral' }
  }
  if (DEAD_STATUSES.includes(programStatus) && (row.login_status === 'INVITED' || row.login_status === 'ACTIVE')) {
    return { label: '닫힘 (사업 종료)', tone: 'neutral' }
  }
  switch (row.login_status) {
    case 'INVITED':
      return { label: '초대 발송됨', tone: 'warning' }
    case 'ACTIVE':
      return { label: '로그인 완료', tone: 'success' }
    case 'BLOCKED':
      return { label: '차단됨', tone: 'danger' }
    default:
      return { label: '허용 전', tone: 'neutral' }
  }
}

/**
 * 참가자 명부(참여 기업·참여 전문가) 표의 컬럼.
 *
 * 로그인 주체는 성명과 연락처 두 열로 나눈다 — 둘은 다른 축이다. 성명은 이 사업에 누가
 * 들어오는가(기업은 원장의 대표자, 전문가는 본인)이고, 연락처는 인증번호가 어디로 가는가다.
 * 한 칸에 붙여 두면 어느 쪽이 잘못돼 매핑이 막혔는지 눈으로 가릴 수 없다.
 * 표기는 ADMIN '민감정보 관리'의 정책을 그대로 따른다.
 */
export function participantColumns(
  masked: Record<SensitiveField, boolean>,
  programStatus: string,
): Column<ParticipantRow>[] {
  return [
    {
      key: 'targetName',
      header: '대상',
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
      key: 'role',
      header: '역할',
      type: 'badge',
      render: (r) => <Badge tone="info">{r.role}</Badge>,
    },
    {
      key: 'loginName',
      header: '성명',
      type: 'person',
      render: (r) => {
        if (!r.master_id) return '—'
        if (!r.loginName) return '성명 없음'
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
        return '연락처 없음'
      },
    },
    {
      // 계정 유무는 명부 행이 아니라 원장 행이 답한다(계정의 키가 그것이다). 이 열이 있어야
      // 담당자가 계정 발급 화면을 확인하러 가지 않는다 — 그래도 버튼은 `연결` 하나뿐이라,
      // 이 열은 무엇을 눌러야 하는지가 아니라 무슨 일이 일어날지를 알려 준다.
      key: 'hasAccount',
      header: '계정',
      type: 'text',
      render: (r) => {
        if (!r.master_id) return '—'
        if (!r.hasAccount) return <span className="text-gray-500">없음</span>
        return r.lastLoginAt
          ? `있음 · ${new Date(r.lastLoginAt).toLocaleDateString('ko-KR')}`
          : '있음'
      },
    },
    {
      key: 'login_status',
      header: '상태',
      type: 'badge',
      render: (r) => {
        const b = loginBadge(r, programStatus)
        return <Badge tone={b.tone}>{b.label}</Badge>
      },
    },
    {
      // 접근 기간은 계정이 아니라 이 줄이 갖는다 — 같은 사람이 두 사업에 걸리면 기간이
      // 서로 다르기 때문이다. 만료되면 이 줄만 게스트 목록에서 사라진다.
      key: 'access_ends_at',
      header: '접근 기간',
      type: 'period',
      render: (r) => {
        if (!r.master_id) return '—'
        if (!r.access_ends_at) return <span className="text-gray-500">제한 없음</span>
        const end = new Date(r.access_ends_at)
        const expired = end.getTime() <= Date.now()
        return (
          <span className={expired ? 'text-danger' : undefined}>
            {`~ ${end.toLocaleDateString('ko-KR')}`}
            {expired ? ' (만료)' : ''}
          </span>
        )
      },
    },
  ]
}
