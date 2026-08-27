import { Badge, type BadgeTone, type Column } from '@ynarcher/ui'
import { maskEmail, maskName, maskPhone } from '@/lib/mask'
import type { SensitiveField } from '@/features/admin/sensitiveContents'
import type { ParticipantRow } from '@/features/program/participantHooks'

/** 게스트가 진입할 수 없는 사업 상태. 이때 열린 문은 화면에서 '닫힘'으로 읽힌다. */
const DEAD_STATUSES = ['FINISHED', 'CANCELLED']

const MASTER_LABEL: Record<string, string> = {
  startups: 'NETWORKS 기업',
  experts: 'NETWORKS 전문가',
}

interface LoginBadge {
  label: string
  tone: BadgeTone
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
 * 연동 DB 표의 컬럼.
 *
 * '로그인 계정' 열은 이 사업에 진입할 사람을 답한다 — 기업은 원장의 대표자, 전문가는 본인이며
 * 내부 임직원 참가자는 WORKS로 들어오므로 비운다. 표기는 ADMIN '민감정보 관리'의 정책을
 * 그대로 따르고(마스킹 여부는 화면이 정하지 않는다), 원본이 필요한 조회는 원장 상세가 맡는다.
 */
export function participantColumns(
  masked: Record<SensitiveField, boolean>,
  programStatus: string,
): Column<ParticipantRow>[] {
  return [
    { key: 'targetName', header: '대상', type: 'name', render: (r) => r.targetName },
    {
      key: 'master_table',
      header: '원본 원장',
      type: 'text',
      render: (r) => (r.master_table ? MASTER_LABEL[r.master_table] : '임직원'),
    },
    {
      key: 'role',
      header: '역할',
      type: 'badge',
      render: (r) => <Badge tone="info">{r.role}</Badge>,
    },
    {
      key: 'loginName',
      header: '로그인 계정',
      type: 'person',
      render: (r) => {
        if (!r.master_id) return '—'
        const name = r.loginName ? (masked.name ? maskName(r.loginName) : r.loginName) : '성명 없음'
        const contact = r.email
          ? masked.email
            ? maskEmail(r.email)
            : r.email
          : r.phone
            ? masked.phone
              ? maskPhone(r.phone)
              : r.phone
            : '연락처 없음'
        return (
          <span className="block truncate">
            {name} <span className="text-gray-500">{contact}</span>
          </span>
        )
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
  ]
}
