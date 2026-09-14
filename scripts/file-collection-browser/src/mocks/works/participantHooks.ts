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
  // 실물 모듈은 `isSuccess`로 '명부를 실제로 읽었다'를 가른다(`rosterKnown`). 공용 `query`는
  // 그 칸을 내지 않으므로 여기서 나머지 칸과 어긋나지 않게 얹는다 — 조회가 끝났고 실패가
  // 아니며 자료가 실제로 있을 때만 참이다.
  const result = query<ParticipantRow[]>(rows)
  return {
    ...result,
    isSuccess: !result.isLoading && !result.isError && result.data !== undefined,
  }
}

/* ------------------------------------------------------------------------- *
 * `GUEST 계정 추가` 창이 쓰는 자리 — 계정 후보 목록과 담기.
 *
 * 실물은 `guest_accounts_list` RPC가 걸러 페이징한다. 대역도 **서버가 자른다**는 그 규칙을
 * 그대로 흉내 낸다(탭·검색으로 좁힌 뒤 페이지로 자르고 전체 건수를 함께 답한다) — 화면에서
 * 다시 거르면 페이저와 줄 수가 어긋나는 그 오작동이 여기서는 재현되지 않는다.
 * ------------------------------------------------------------------------- */

export const GUEST_CANDIDATE_PAGE_SIZE = 20

type MasterTable = 'startups' | 'networks' | 'ma_sellers' | 'ma_buyers'
type Facet = MasterTable | 'fund' | 'unlinked'

export interface GuestAccountIdentity {
  masterTable: MasterTable
  masterId: string
  name: string | null
}

export interface GuestAccountCandidate {
  userId: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  isActive: boolean
  identities: GuestAccountIdentity[]
}

interface Candidate extends GuestAccountCandidate {
  /** 서버의 `p_facet` 축. 화면이 읽는 값이 아니라 대역이 자를 때만 쓴다. */
  facet: Facet
}

const LONG_AFFILIATION =
  '주식회사 와이앤아처파트너스 글로벌사업본부 해외투자전략실 동남아시아지역담당팀'
const LONG_EMAIL = 'very.long.mailbox.name.for.overflow.check@ynarcher-partners-company.co.kr'

/** 폭을 재는 줄은 앞에 세운다 — 첫 페이지에서 눈으로 확인할 수 있어야 한다. */
const HEAD: Candidate[] = [
  {
    // 긴 소속 + 긴 이메일 + 인격 둘. 한 줄에서 잘림이 가장 먼저 나는 자리다.
    userId: 'cand-long',
    name: '김와이앤아처대표이사',
    email: LONG_EMAIL,
    phone: '010-1234-5678',
    affiliation: LONG_AFFILIATION,
    isActive: true,
    facet: 'startups',
    identities: [
      { masterTable: 'startups', masterId: 'st-9', name: '주식회사 표본기업' },
      { masterTable: 'networks', masterId: 'nw-9', name: '표본 전문가 네트워크' },
    ],
  },
  {
    // 소속·연락처가 비어 있는 계정 — 빈 칸이 실제로 `EmptyValue`로 서는지.
    userId: 'cand-empty',
    name: '이빈칸',
    email: 'blank@example.com',
    phone: null,
    affiliation: null,
    isActive: true,
    facet: 'unlinked',
    identities: [],
  },
  {
    // 이미 이 사업 명부에 있는 계정(위 명부 대역의 `usr-1`). 보이되 고를 수 없다.
    userId: 'usr-1',
    name: '담당자 2',
    email: 'g1@example.com',
    phone: '010-0000-0000',
    affiliation: '표본벤처스',
    isActive: true,
    facet: 'startups',
    identities: [{ masterTable: 'startups', masterId: 'st-1', name: '2. 주식회사 표본기업' }],
  },
  {
    // 정지된 계정 — 담는 것 자체는 막지 않고 배지만 선다.
    userId: 'cand-suspended',
    name: '박정지',
    email: 'suspended@example.com',
    phone: '010-2222-3333',
    affiliation: '휴면기업',
    isActive: false,
    facet: 'ma_sellers',
    identities: [{ masterTable: 'ma_sellers', masterId: 'ms-1', name: '매도 표본' }],
  },
]

const FACET_CYCLE: Facet[] = ['startups', 'networks', 'ma_buyers', 'ma_sellers', 'fund', 'unlinked']

const IDENTITY_NAME: Record<MasterTable, string> = {
  startups: '표본 스타트업',
  networks: '표본 전문가',
  ma_buyers: '매수 표본',
  ma_sellers: '매도 표본',
}

const TAIL: Candidate[] = Array.from({ length: 26 }, (_, i) => {
  const facet = FACET_CYCLE[i % FACET_CYCLE.length]!
  const linked = facet !== 'fund' && facet !== 'unlinked'
  return {
    userId: `cand-${i}`,
    name: `게스트 ${i + 1}`,
    email: `guest${i}@example.com`,
    phone: i % 4 === 3 ? null : `010-3${String(i).padStart(3, '0')}-0000`,
    affiliation: i % 3 === 2 ? null : `표본파트너스 ${i + 1}실`,
    isActive: true,
    facet,
    identities: linked
      ? [{ masterTable: facet as MasterTable, masterId: `${facet}-${i}`, name: `${IDENTITY_NAME[facet as MasterTable]} ${i + 1}` }]
      : [],
  }
})

const CANDIDATES: Candidate[] = [...HEAD, ...TAIL]

const matches = (c: Candidate, term: string) =>
  [c.name, c.email, c.affiliation, c.phone].some((v) => (v ?? '').toLowerCase().includes(term))

export function useGuestAccountCandidates(search: string, page: number, facet: Facet | null = null) {
  const term = search.trim().toLowerCase()
  const filtered = CANDIDATES.filter(
    (c) => (facet === null || c.facet === facet) && (term === '' || matches(c, term)),
  )
  const start = page * GUEST_CANDIDATE_PAGE_SIZE
  return query({
    rows: filtered.slice(start, start + GUEST_CANDIDATE_PAGE_SIZE).map(({ facet: _f, ...row }) => row),
    total: filtered.length,
  })
}

/**
 * 담기의 대역. 기본은 전부 성공이고, `?addFail=1`이면 **전부 사유와 함께 막힌다** — 배너가
 * 여러 줄로 펴졌을 때 표를 덮는지가 이 화면의 위험이라 그 상태도 재야 한다.
 */
export function useAddGuestAccounts(_programId: string) {
  const failing = new URLSearchParams(globalThis.location?.search ?? '').get('addFail') === '1'
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: async (userIds: string[]) =>
      failing
        ? {
            requested: userIds.length,
            added: 0,
            alreadyPresent: 0,
            failed: userIds.map((userId) => ({ userId, status: 'FAILED' as const, reason: 'NOT_AUTHORIZED' })),
            unanswered: [] as string[],
          }
        : {
            requested: userIds.length,
            added: userIds.length,
            alreadyPresent: 0,
            failed: [] as { userId: string; status: 'FAILED'; reason: string | null }[],
            unanswered: [] as string[],
          },
  }
}
