/**
 * **앱 원장 모양 그대로**의 표본.
 *
 * 앞선 `fixtures.ts`가 `CollectionTreeTable` 한 부품만 먹이는 값이라면, 이쪽은 실제
 * WORKS 패널·GUEST 모듈이 훅에서 받는 DTO(`@ynarcher/master-data`)를 그대로 만든다 —
 * 화면을 통신 없이 세우되 **부품이 아니라 화면**을 재기 위해서다.
 *
 * 값은 손으로 적지 않고 규칙으로 만든다. 각 축이 맡는 극단은 셋이다: 깊이 20, 200자
 * 무공백 이름·긴 파일명·긴 코멘트, 그리고 **모든 상태**(미제출·임시·제출·보완요청·승인).
 */
import type {
  FileCollectionAssignmentDto,
  FileCollectionCommentDto,
  FileCollectionDto,
  FileCollectionFileDto,
  FileCollectionNodeDto,
  FileCollectionResponseDto,
  FileCollectionStatus,
} from '@ynarcher/master-data'
import { LONG_TITLE_200 } from './fixtures'

export const COLLECTION_ID = 'col-1'
export const MODULE_ID = 'mod-1'
export const PROGRAM_ID = 'prog-1'

export const LONG_FILE_NAME =
  '2026년도_와이앤아처_투자심의위원회_제출용_감사보고서_최종본_v12_수정반영_20260913_대표이사날인_스캔본_300dpi.pdf'

/** 줄바꿈 없이 이어지는 긴 코멘트 — 창 안에서 가로로 새는지 보는 값이다. */
export const LONG_COMMENT =
  '제출하신감사보고서의페이지일부가누락되어있어확인이어렵습니다전체페이지를다시스캔하여올려주시고파일명은회사명_서류명_발급일자순서로맞춰주시기바랍니다또한주주명부는발급일이3개월이내여야합니다'

const ALL_STATUSES: FileCollectionStatus[] = [
  'NOT_SUBMITTED',
  'DRAFT',
  'SUBMITTED',
  'REWORK_REQUESTED',
  'APPROVED',
]

const iso = (day: number) => `2026-09-${String(day).padStart(2, '0')}T09:12:34.000Z`

export const collection: FileCollectionDto = {
  id: COLLECTION_ID,
  program_module_id: MODULE_ID,
  title: `2026년 상반기 정기 제출 자료 요청 — ${LONG_TITLE_200.slice(0, 40)}`,
  guide:
    '아래 문항을 눌러 자료를 올린 뒤 문항마다 제출해 주십시오. 파일명은 회사명_서류명_발급일자 순서로 적어 주시고, 스캔본은 300dpi 이상 컬러로 올려 주세요.',
  published_at: null,
  // 표본 트리는 깊이 20까지 간다 — 단계 이름을 다 적어 두지 않고 앞 세 칸만 준다.
  // 나머지는 화면이 기본 이름으로 채우며, 그 자리가 좁은 화면에서 어떻게 접히는지가 검증 대상이다.
  level_names: ['대분류', '중분류', '소분류'],
  created_at: iso(1),
  updated_at: iso(9),
}

export const publishedCollection: FileCollectionDto = { ...collection, published_at: iso(10) }

/** 깊이 20 사슬 + 각 단의 문항 하나. 마지막 단은 200자 무공백 이름을 단다. */
export function buildNodes(): FileCollectionNodeDto[] {
  const rows: FileCollectionNodeDto[] = []
  let parent: string | null = null
  for (let depth = 0; depth < 20; depth += 1) {
    const id = `n-f${depth}`
    rows.push({
      id,
      collection_id: COLLECTION_ID,
      parent_id: parent,
      node_type: 'FOLDER',
      title: `${depth + 1}단계 제출 서류 묶음 — ${LONG_FILE_NAME.slice(0, 20 + depth)}`,
      guide: null,
      is_required: false,
      sort_order: 0,
      updated_at: iso(2),
    })
    rows.push({
      id: `n-q${depth}`,
      collection_id: COLLECTION_ID,
      parent_id: id,
      node_type: 'QUESTION',
      title: depth === 19 ? LONG_TITLE_200 : `${LONG_FILE_NAME} (${depth + 1}단 제출 문항)`,
      guide: depth % 4 === 0 ? LONG_COMMENT : null,
      is_required: depth % 2 === 0,
      sort_order: 1,
      updated_at: iso(3),
    })
    parent = id
  }
  // 아래에 아무것도 없는 묶음 하나. 옛 데이터에 흔한 모양이며, 가로 격자에서 '문항 넣기'가
  // 서는 유일한 자리다(그 조작이 실제로 열려 있는지를 재려면 표본에 이 줄이 있어야 한다).
  rows.push({
    id: 'n-empty',
    collection_id: COLLECTION_ID,
    parent_id: null,
    node_type: 'FOLDER',
    title: '빈 묶음(문항 없음)',
    guide: null,
    is_required: false,
    sort_order: 9,
    updated_at: iso(2),
  })
  return rows
}

export const nodes = buildNodes()

/**
 * 얕은 표본(2단계) — **조작을 눌러 보는 줄들**이 쓴다.
 *
 * 깊이 20짜리 표본은 좁은 화면의 잘림을 재기 위한 것이라 단계를 더 늘릴 자리가 없고, 같은
 * 이름의 칸이 스무 개라 무엇을 눌렀는지도 흐려진다. 그래서 상호작용은 이 표본에서 잰다.
 */
export const shallowNodes: FileCollectionNodeDto[] = [
  {
    id: 'n-s-f1',
    collection_id: COLLECTION_ID,
    parent_id: null,
    node_type: 'FOLDER',
    title: '재무 자료',
    guide: null,
    is_required: false,
    sort_order: 1,
    updated_at: iso(2),
  },
  {
    id: 'n-s-q1',
    collection_id: COLLECTION_ID,
    parent_id: 'n-s-f1',
    node_type: 'QUESTION',
    title: '재무제표',
    guide: '최근 3개년',
    is_required: true,
    sort_order: 1,
    updated_at: iso(3),
  },
  {
    id: 'n-s-q2',
    collection_id: COLLECTION_ID,
    parent_id: 'n-s-f1',
    node_type: 'QUESTION',
    title: '주주명부',
    guide: null,
    is_required: false,
    sort_order: 2,
    updated_at: iso(3),
  },
  {
    id: 'n-s-empty',
    collection_id: COLLECTION_ID,
    parent_id: null,
    node_type: 'FOLDER',
    title: '빈 묶음(문항 없음)',
    guide: null,
    is_required: false,
    sort_order: 2,
    updated_at: iso(2),
  },
]

export const shallowCollection: FileCollectionDto = {
  ...collection,
  title: '얕은 표본 — 조작 확인용',
  level_names: ['대분류', '문항'],
}
export const questionNodeList = nodes.filter((n) => n.node_type === 'QUESTION')

/** 배정 8건 — 이름이 긴 줄과 회수된 줄을 함께 둔다. */
export const assignments: FileCollectionAssignmentDto[] = Array.from({ length: 8 }, (_, i) => ({
  id: `asg-${i}`,
  collection_id: COLLECTION_ID,
  participant_id: `par-${i}`,
  guest_user_id: `usr-${i}`,
  assigned_at: iso(10),
  revoked_at: i === 7 ? iso(12) : null,
  guest_name:
    i === 0
      ? '주식회사와이앤아처스타트업얼라이언스홀딩스컴퍼니대표이사김와이앤'
      : `게스트 ${i + 1} — 주식회사 표본기업`,
}))

/**
 * 파일이 붙어 있는 두 칸. 각각 **다른 화면의 주인공**이다.
 *
 * `res-0-0`은 WORKS 검토 창이 서는 자리라 `SUBMITTED`여야 한다(검토 버튼은 그 상태에서만
 * 선다 — `canReviewResponse`). `res-0-1`은 GUEST가 아직 낼 수 있는 자리라 `REWORK_REQUESTED`다
 * (올리기·제출이 열리는 상태 집합에 든다). 둘 다 **회차는 2**이고, 아래 파일 목록의 현재
 * 회차도 2다 — 회차가 어긋나면 화면이 낸 파일을 하나도 '현재'로 세지 않아 빈 목록을 재게 된다.
 */
export const REVIEW_RESPONSE_ID = 'res-0-0'
export const GUEST_RESPONSE_ID = 'res-0-1'
const CURRENT_ROUND = 2

const FIXED: Record<string, { status: FileCollectionStatus; round: number }> = {
  [REVIEW_RESPONSE_ID]: { status: 'SUBMITTED', round: CURRENT_ROUND },
  [GUEST_RESPONSE_ID]: { status: 'REWORK_REQUESTED', round: CURRENT_ROUND },
}

/** 모든 상태가 한 화면에 서도록, 배정 × 문항 격자에 상태를 돌려 가며 깐다. */
export const responses: FileCollectionResponseDto[] = assignments.flatMap((a, ai) =>
  questionNodeList.slice(0, 6).map((n, qi): FileCollectionResponseDto => {
    const id = `res-${ai}-${qi}`
    const fixed = FIXED[id]
    const status = fixed?.status ?? ALL_STATUSES[(ai + qi) % ALL_STATUSES.length]
    return {
      id,
      assignment_id: a.id,
      node_id: n.id,
      status,
      round: fixed?.round ?? (status === 'REWORK_REQUESTED' ? 2 : 1),
      submitted_at: status === 'NOT_SUBMITTED' || status === 'DRAFT' ? null : iso(11),
      reviewed_at: status === 'APPROVED' || status === 'REWORK_REQUESTED' ? iso(12) : null,
    }
  }),
)

/**
 * 한 응답 칸의 파일 네 줄 — 지난 회차와 현재 회차가 각각 **낸 것과 끊긴 것**을 함께 갖는다.
 *
 * 지난 회차에 `PENDING`이 남는 것은 꾸며 낸 상황이 아니다. 올리다 끊긴 줄을 지우지 않고 다른
 * 파일로 제출하면 그대로 다음 회차로 넘어가며, 화면은 그 줄을 '전달되지 않은 파일'로 따로
 * 세운다(`fileCollectionView.pastRounds`). 그 자리가 실제로 서는지 여기서 함께 잰다.
 */
function filesOf(responseId: string, prefix: string): FileCollectionFileDto[] {
  const base = {
    response_id: responseId,
    content_type: 'application/pdf',
    uploaded_by: 'usr-0',
  } as const
  return [
    {
      ...base,
      id: `${prefix}-r1-ready`,
      round: 1,
      original_name: LONG_FILE_NAME,
      byte_size: 18_432_100,
      status: 'READY',
      created_at: iso(11),
      uploader_name: '주식회사와이앤아처스타트업얼라이언스홀딩스 김와이앤',
    },
    {
      ...base,
      id: `${prefix}-r1-pending`,
      round: 1,
      original_name: `끊긴_업로드_${LONG_FILE_NAME}`,
      byte_size: 0,
      status: 'PENDING',
      created_at: iso(11),
      uploader_name: '김와이앤',
    },
    {
      ...base,
      id: `${prefix}-r2-ready`,
      round: CURRENT_ROUND,
      original_name: `재제출_${LONG_FILE_NAME}`,
      byte_size: 24_117_248,
      status: 'READY',
      created_at: iso(12),
      uploader_name: '김와이앤',
    },
    {
      ...base,
      id: `${prefix}-r2-pending`,
      round: CURRENT_ROUND,
      original_name: `올리는중_${LONG_FILE_NAME}`,
      byte_size: 2_048,
      status: 'PENDING',
      created_at: iso(12),
      uploader_name: '김와이앤',
    },
  ]
}

export const files: FileCollectionFileDto[] = [
  ...filesOf(REVIEW_RESPONSE_ID, 'file-a'),
  ...filesOf(GUEST_RESPONSE_ID, 'file-b'),
]

function commentsOf(responseId: string, prefix: string): FileCollectionCommentDto[] {
  return [
    {
      id: `${prefix}-1`,
      response_id: responseId,
      round: 1,
      author_side: 'WORKS',
      body: LONG_COMMENT,
      created_at: iso(11),
      author_name: '와이앤아처 심사역 박담당',
    },
    {
      id: `${prefix}-2`,
      response_id: responseId,
      round: CURRENT_ROUND,
      author_side: 'GUEST',
      body: '말씀하신 대로 전체 페이지를 다시 스캔해 올렸습니다. 확인 부탁드립니다.',
      created_at: iso(12),
      author_name: '김와이앤',
    },
  ]
}

export const comments: FileCollectionCommentDto[] = [
  ...commentsOf(REVIEW_RESPONSE_ID, 'cmt-a'),
  ...commentsOf(GUEST_RESPONSE_ID, 'cmt-b'),
]
