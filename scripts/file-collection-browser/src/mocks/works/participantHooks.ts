/**
 * 사업 명부 조회의 **검증용 대역**. '받는 사람' 탭이 고를 후보만 있으면 되므로 그 줄만 만든다.
 * 실제 모듈은 Supabase를 순회해 읽는다.
 */
import { query } from '../scenario'

export type ParticipantLoginStatus = 'NONE' | 'INVITED' | 'ACTIVE' | 'LOCKED'

export interface ParticipantRow {
  id: string
  master_table: string | null
  master_id: string | null
  user_id: string | null
  login_status: ParticipantLoginStatus
  hasAccount: boolean
  accountId: string | null
  accountName: string | null
  accountEmail: string | null
  userType: string | null
  isGuestAccount: boolean
  lastLoginAt: string | null
  createdByName: string | null
  targetName: string
  subtitle: string
  loginName: string | null
  email: string | null
  phone: string | null
  masterCategory: string | null
}

const LONG_NAME = '주식회사와이앤아처스타트업얼라이언스홀딩스컴퍼니코리아대표이사김와이앤'

const rows: ParticipantRow[] = Array.from({ length: 12 }, (_, i) => ({
  id: `par-${i}`,
  master_table: 'startups',
  master_id: `st-${i}`,
  user_id: i % 5 === 4 ? null : `usr-${i}`,
  login_status: i % 5 === 4 ? 'NONE' : 'ACTIVE',
  hasAccount: i % 5 !== 4,
  accountId: i % 5 === 4 ? null : `acc-${i}`,
  accountName: i === 0 ? LONG_NAME : `담당자 ${i + 1}`,
  accountEmail:
    i === 0 ? 'very.long.mailbox.name.for.overflow.check@ynarcher-partners-company.co.kr' : `g${i}@example.com`,
  userType: i % 5 === 4 ? null : 'GUEST',
  isGuestAccount: i % 5 !== 4,
  lastLoginAt: null,
  createdByName: '박담당',
  targetName: i === 0 ? LONG_NAME : `${i + 1}. 주식회사 표본기업`,
  subtitle: '대표 김표본',
  loginName: `김표본${i}`,
  email: `g${i}@example.com`,
  phone: '010-0000-0000',
  masterCategory: 'PORTFOLIO',
}))

export function useProgramParticipants(_programId: string | undefined) {
  return query<ParticipantRow[]>(rows)
}
