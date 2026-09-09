import type { BadgeTone } from '@ynarcher/ui'
import {
  MANAGEMENT_STATUS_LABEL,
  MANAGEMENT_STATUS_TONE,
  type ManagementStatus,
} from '@/features/startup/startupClassification'

/**
 * 참가자 명부의 **자격**(persona) 정의 — 이 축 하나가 명부 화면 전체의 차이를 흡수한다.
 *
 * 종전에는 자격이 화면마다 `persona === 'startups'` 삼항으로 흩어져 있었다(카드 제목·표
 * 머리글 넷·검색 자리표시자 둘·모달 안내·원장 상세 경로·후보 조회 컬럼·구분 배지). 자격이
 * 둘일 때는 삼항이 곧 분기 전부라 값싼 표현이었으나, **셋째가 들어오는 순간 그 표현이
 * 성립하지 않는다** — 삼항은 "이것이 아니면 저것"이라 셋을 답하지 못하고, 여덟 자리를 각각
 * 열어 고치면 어느 한 곳을 빠뜨렸을 때 화면이 기업 라벨로 셀러를 부른다.
 *
 * 그래서 자격은 화면이 아니라 이 표가 소유한다. 자격을 여는 일은 `MasterTable` 유니온에
 * 값을 더하고 이 표에 그 항목을 적는 것뿐이며, 더하지 않은 자격은 애초에 화면에 세울 수
 * 없다(타입이 막는다).
 *
 * **키는 원장 이름 그대로**다(`program_participants.master_table` 값). 자격을 옮겨 적는 표를
 * 하나 더 두면 그 표가 곧 어긋날 자리가 된다 — 무엇으로 참여시키는가는 어느 원장에서
 * 왔는가가 답하고, 그 사실은 이미 명부 행에 저장되어 있다.
 *
 * 근거: docs/docs_planning/3_4_4_ac_participant_pool.md,
 *       docs/docs_planning/3_9_2_external_portal_expansion.md
 */

/**
 * 원장 한 행에서 명부가 읽는 사실.
 *
 * 원장마다 컬럼 이름이 다르므로(기업은 `representative`, 전문가는 `affiliation`) 여기서 한
 * 모양으로 맞춘다. 맞추는 일을 화면에서 하면 표·모달·훅이 각자 원장 컬럼 이름을 알게 되고,
 * 원장이 컬럼 하나를 바꾸는 날 고칠 곳이 셋으로 늘어난다.
 */
export interface LedgerFacts {
  /** 대상 이름(기업명·전문가명). 명부 표의 첫 열. */
  name: string
  /** 로그인 명의 — 기업은 대표자, 전문가는 본인. 없으면 매핑이 막힌다. */
  loginName: string | null
  /** 이름 아래 한 줄 보조(기업은 대표자, 전문가는 소속). */
  subtitle: string
  email: string | null
  phone: string | null
  /** 원장이 이 대상을 무엇으로 분류하는가. 분류축이 없는 원장은 null. */
  category: string | null
  /**
   * **원장에서 내려간 행인가**(비활성화 또는 중복 병합, 2026-09-09).
   *
   * 명단에서 그 줄을 빼지 않고 이 값으로 표시만 한다(사용자 확정). 빼면 원장을 정리하는
   * 행동이 **남의 워크스페이스 사업 기록을 조용히 바꾸고**, 참가기업 10곳으로 운영한 사업이
   * 폐업 2곳을 정리한 뒤 8곳으로 보인다 — 참가 사실은 업무 기록이라 원장 정리로 건수가
   * 달라져서는 안 된다. 진행 중 사업에서는 오히려 "이 대상은 원장에서 내려갔다"가 담당자에게
   * 필요한 정보다(왜 연락이 닿지 않는지의 답).
   *
   * 무엇이 '내려감'인가는 원장마다 다르므로 각 자격의 `map`이 답한다 — NETWORKS는 통합 원장에
   * 병합(`merged_into_id`) 축이 하나 더 있고, 나머지 셋은 `deleted_at` 하나다.
   */
  retired: boolean
}

export interface ParticipantPersona {
  /**
   * 탭·배지·추가 버튼이 함께 쓰는 이름 — **그 사람이 무엇으로 들어오는가**다.
   *
   * 2026-09-08에 `참여 기업`·`참여 전문가`에서 `스타트업`·`전문가`로 줄였다(사용자 지정).
   * '참여'를 뗀 것은 자리가 이미 그 말을 하고 있어서다 — 이 이름이 서는 곳은 그 사업의 명부와
   * 계정생성 창구뿐이라, 참여 중이라는 사실을 이름이 한 번 더 적으면 같은 말이 두 번 선다.
   * M&A가 `SELLER`·`BUYER`인 것과도 층이 맞는다: 넷 다 **무엇인가**를 부르는 한 낱말이다.
   */
  label: string
  /** 표의 대상 이름 열 머리글. 자격을 그대로 부른다(기업 탭에서 '대상'이라 적으면 번역이 한 번 더 든다). */
  nameHeader: string
  /** 표의 로그인 명의 열 머리글. */
  loginNameHeader: string
  /** 명의가 비었을 때 표가 붉게 적는 말. 머리글과 같은 낱말을 써야 무엇이 비었는지 바로 읽힌다. */
  loginNameMissing: string
  /** 명부 표 위 검색 자리표시자. */
  listSearchPlaceholder: string
  /** 추가 모달 검색 자리표시자. */
  pickSearchPlaceholder: string
  /** 추가 모달 제목 줄 도움말 — 어느 원장에서 고르는지 밝힌다. */
  pickHelp: string
  /**
   * 원장 상세 경로. 명부는 값을 복제하지 않고 원장을 가리키므로 이름을 누르면 그리로 간다.
   * 갈 곳이 없는 자격은 null을 돌려주고, 그때 이름은 링크가 아니라 글자로 선다.
   */
  detailPath: (id: string) => string | null
  /** 원장 조회 정의 — 명부 합성과 후보 검색이 같은 한 벌을 쓴다. */
  ledger: {
    table: string
    /** PostgREST select 문자열. `id`를 반드시 포함한다. */
    columns: string
    /**
     * 후보를 좁히는 조건. 통합 원장에서 한 구분만 고를 때 쓴다(NETWORKS는 표가 하나이고
     * 전문가인지는 행의 `category`가 답한다) — 여기서 좁히지 않으면 명부에 담기는 대상이
     * 조용히 넓어진다.
     */
    narrow?: { column: string; value: string }
    /** 후보 검색이 `or`로 묶는 컬럼들. */
    searchColumns: readonly string[]
    /**
     * 중복을 흡수당한 행을 가리키는 컬럼. **가진 원장에만** 적는다(현재 NETWORKS 하나).
     *
     * 후보 검색이 이 값이 찬 행을 뺀다 — 이미 합쳐서 죽은 행을 명단에 담으면 그 줄은 정본이
     * 아닌 곳을 가리키고, 정본을 고쳐도 명단은 옛 값을 계속 든다. 없는 원장에 `.is()`를 걸면
     * 컬럼이 없어 조회 전체가 거절되므로, 있는지 여부를 이 칸이 답한다.
     */
    mergedColumn?: string
    map: (row: Record<string, unknown>) => LedgerFacts
      /**
       * 계정 명의를 **원장에 되쓸 때**의 칸. 읽는 것은 `map`이 답하고 쓰는 것은 여기가 답한다.
       *
       * 두 방향을 한 칸으로 합치지 않는 이유는 읽기가 여러 칸을 한 모양으로 맞추는 일이라
       * 그 반대가 자동으로 정해지지 않기 때문이다 — 쓰기는 그 값이 실제로 사는 칸 하나를
       * 정확히 가리켜야 한다(스타트업의 명의는 `representative`이지 `name`이 아니다).
       */
      person: { name: string; email: string; phone: string }
  }
  /**
   * 구분 배지 — 명부가 스스로 분류를 만들지 않고 원장의 분류를 그대로 비춘다.
   * 분류축이 없는 자격은 자기 이름 하나를 고정으로 돌려준다.
   */
  categoryBadge: (code: string | null) => { label: string; tone: BadgeTone }
}

/** 문자열 칸 하나를 다듬어 읽는다 — 원장의 빈 문자열과 공백은 '없음'과 같은 뜻이다. */
function text(row: Record<string, unknown>, key: string): string | null {
  const v = row[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * 원장 출처 = 자격 키. 내부 임직원 참가자는 원장이 없다(null).
 *
 * 2026-09-04 원장 통합 전에는 'experts'였다 — 그때는 원장 이름 하나가 '어느 표인가'와
 * '전문가인가'를 함께 답했다. 지금은 표가 'networks' 하나이고 전문가인지는 행의 category가
 * 답하므로, 후보 조회에 그 조건을 함께 건다(`ledger.narrow`).
 */
export type MasterTable = 'startups' | 'networks' | 'ma_sellers' | 'ma_buyers'

/**
 * 이 앱이 명부에 세울 수 있는 자격 전부.
 *
 * 여기 없는 원장은 명부에 담기지 않는다 — 그리고 그 강제는 화면이 아니라 DB의 CHECK 제약이
 * 함께 한다(화면에서 숨기는 것은 보안이 아니다). 자격을 하나 열 때는 두 곳을 같은 커밋에서
 * 함께 연다(M&A 두 종은 `20260908220000`이 열었다).
 *
 * **이 표는 앱이 아는 자격 전부이고, 어느 워크스페이스가 그중 무엇을 쓰는지는 여기서 답하지
 * 않는다.** 그 답은 `ProgramWorkspaceConfig.guestMasterTables`가 갖는다 — 자격에 워크스페이스
 * 칸을 두면 한 자격이 두 곳에서 쓰이게 되는 날 그 칸이 배열이 되고, 결국 같은 사실을 양쪽에
 * 적는 표가 둘이 된다.
 */
export const PARTICIPANT_PERSONAS: Record<MasterTable, ParticipantPersona> = {
  startups: {
    label: '스타트업',
    nameHeader: '기업명',
    loginNameHeader: '대표자',
    loginNameMissing: '대표자 없음',
    listSearchPlaceholder: '기업명 · 대표자 · 연락처 검색',
    pickSearchPlaceholder: '기업명 · 대표자',
    pickHelp: 'STARTUP 원장에 등록된 기업만 담을 수 있습니다.',
    detailPath: (id) => `/startup/${id}`,
    ledger: {
      table: 'startups',
      columns: 'id, name, representative, email, phone, management_status, deleted_at',
      searchColumns: ['name', 'representative'],
      map: (row) => ({
        name: String(row.name ?? ''),
        loginName: text(row, 'representative'),
        subtitle: text(row, 'representative') ?? '',
        email: text(row, 'email'),
        phone: text(row, 'phone'),
        category: text(row, 'management_status'),
        retired: Boolean(row.deleted_at),
      }),
      person: { name: 'representative', email: 'email', phone: 'phone' },
    },
    categoryBadge: (code) => {
      const key = code as ManagementStatus | null
      if (!key || !(key in MANAGEMENT_STATUS_LABEL)) {
        return { label: '기업(구분 미지정)', tone: 'neutral' }
      }
      return { label: MANAGEMENT_STATUS_LABEL[key], tone: MANAGEMENT_STATUS_TONE[key] }
    },
  },
  ma_sellers: {
    // 밖에서 부르는 이름은 원장 이름 그대로다 — M&A에서 SELLER·BUYER는 업계 용어이고,
    // '참여 매각기업'처럼 옮겨 적으면 담당자가 화면에서 쓰는 말과 어긋난다.
    label: 'SELLER',
    nameHeader: '기업명',
    loginNameHeader: '담당자',
    loginNameMissing: '담당자 없음',
    listSearchPlaceholder: '기업명 · 담당자 · 연락처 검색',
    pickSearchPlaceholder: '기업명 · 담당자',
    pickHelp: 'M&A SELLER 원장에 등록된 기업만 담을 수 있습니다.',
    detailPath: (id) => `/mna/sellers/${id}`,
    ledger: {
      table: 'ma_sellers',
      // 연락처는 20260908220000이 더했다 — 포털 계정의 초기 비밀번호가 되는 값이라
      // 계정이 아니라 원장이 갖는다.
      columns: 'id, name, contact_name, contact_email, phone, deleted_at',
      searchColumns: ['name', 'contact_name'],
      map: (row) => ({
        name: String(row.name ?? ''),
        loginName: text(row, 'contact_name'),
        subtitle: text(row, 'contact_name') ?? '',
        email: text(row, 'contact_email'),
        phone: text(row, 'phone'),
        category: null,
        retired: Boolean(row.deleted_at),
      }),
      person: { name: 'contact_name', email: 'contact_email', phone: 'phone' },
    },
    categoryBadge: () => ({ label: 'SELLER', tone: 'neutral' }),
  },
  ma_buyers: {
    label: 'BUYER',
    nameHeader: '기업명',
    loginNameHeader: '담당자',
    loginNameMissing: '담당자 없음',
    listSearchPlaceholder: '기업명 · 담당자 · 연락처 검색',
    pickSearchPlaceholder: '기업명 · 담당자',
    pickHelp: 'M&A BUYER 원장에 등록된 기업만 담을 수 있습니다.',
    detailPath: (id) => `/mna/buyers/${id}`,
    ledger: {
      table: 'ma_buyers',
      columns: 'id, name, contact_name, contact_email, phone, deleted_at',
      searchColumns: ['name', 'contact_name'],
      map: (row) => ({
        name: String(row.name ?? ''),
        loginName: text(row, 'contact_name'),
        subtitle: text(row, 'contact_name') ?? '',
        email: text(row, 'contact_email'),
        phone: text(row, 'phone'),
        category: null,
        retired: Boolean(row.deleted_at),
      }),
      person: { name: 'contact_name', email: 'contact_email', phone: 'phone' },
    },
    categoryBadge: () => ({ label: 'BUYER', tone: 'neutral' }),
  },
  networks: {
    label: '전문가',
    nameHeader: '전문가명',
    loginNameHeader: '성명',
    loginNameMissing: '성명 없음',
    listSearchPlaceholder: '전문가명 · 연락처 검색',
    pickSearchPlaceholder: '전문가명 · 소속',
    pickHelp: 'NETWORKS 원장의 전문가만 담을 수 있습니다.',
    detailPath: (id) => `/networks/${id}`,
    ledger: {
      table: 'networks',
      columns: 'id, name, affiliation, email, phone, deleted_at, merged_into_id',
      // 통합 원장이라 표 하나에 11종이 함께 산다. 전문가 구분으로 좁히지 않으면 투자사·기관까지
      // 후보에 서고, 명부에 담기는 대상이 결정 없이 넓어진다.
      narrow: { column: 'category', value: 'experts' },
      searchColumns: ['name', 'affiliation'],
      // 통합 원장은 중복 병합(정본으로 흡수)을 운용하는 유일한 원장이다.
      mergedColumn: 'merged_into_id',
      map: (row) => ({
        name: String(row.name ?? ''),
        loginName: text(row, 'name'),
        subtitle: text(row, 'affiliation') ?? '',
        email: text(row, 'email'),
        phone: text(row, 'phone'),
        category: null,
        // 병합된 행은 정본으로 흡수돼 더는 스스로를 답하지 않는다 — 비활성과 같은 무게로 본다.
        retired: Boolean(row.deleted_at || row.merged_into_id),
      }),
      person: { name: 'name', email: 'email', phone: 'phone' },
    },
    categoryBadge: () => ({ label: '전문가', tone: 'neutral' }),
  },
}

/** 자격 키가 이 앱이 아는 것인가 — 원장에서 읽어 온 문자열을 좁힐 때 쓴다. */
export function isMasterTable(value: string | null | undefined): value is MasterTable {
  return Boolean(value && value in PARTICIPANT_PERSONAS)
}

/**
 * 자격 라벨 — 원장 이름(startups·networks)이 아니라 **이 사업에서의 자격**으로 적는다.
 * 담당자가 고르는 것은 "어느 원장에서 왔나"가 아니라 "무엇으로 참여시키나"이고, 그 선택이
 * 게스트가 볼 화면을 정한다(3_9_1 §4).
 *
 * 이 한 벌이 사업 상세 탭·계정 원장의 자격 배지·게스트 전환기의 어휘를 함께 정한다 —
 * 같은 축을 화면마다 다른 말로 적으면 담당자가 안내한 말과 게스트가 본 말이 어긋난다.
 */
export const PERSONA_LABEL = Object.fromEntries(
  Object.entries(PARTICIPANT_PERSONAS).map(([key, persona]) => [key, persona.label]),
) as Record<MasterTable, string>
