import { parseCsvTable } from '@/lib/csv'
import type { PersonaMatch } from '@/features/program/ledgerMatch'
import { gapText, ledgerGaps, type PersonField } from '@/features/program/participantPerson'
import {
  PARTICIPANT_PERSONAS,
  hasOwnLoginName,
  type MasterTable,
} from '@/features/program/participantPersona'

/**
 * 명단 대용량 담기의 **파싱과 판정 조립** — 화면과 조회에서 갈라 둔 순수 부분.
 *
 * **새 임포터를 만들지 않고 대조기를 만든다**(2026-09-09). 원장 대용량 등록은 이미 둘 있고
 * (공용 `BulkImportPage` + NETWORKS 전용 대조 업로드), 여기에 셋째를 더하면 검증 강도와 오류
 * 문구가 또 갈린다. 그리고 **명단이 실제로 필요한 것은 등록이 아니라 대조다** — 파일에 적힌
 * 이름 중 무엇이 이미 원장에 있고 무엇이 없는지를 가리는 일이고, 그것이 곧 4번(중복) 문제와
 * 같은 물음이다. 그래서 판정은 등록 창과 **같은 함수**(`findPersonaMatches`)를 쓴다.
 *
 * 받는 열은 명단 표에 서는 넷뿐이다 — 원장의 나머지 칸(구분·분야·소재지…)은 여기서 받지
 * 않는다. 그 값들을 받기 시작하면 이 화면이 원장 임포터가 되고, 그러면 원장 임포터가 둘이
 * 되어 같은 파일이 어디로 올라갔느냐에 따라 다르게 검증된다. 나머지는 원장에서 채운다.
 */

/** 파일에서 읽은 한 줄. */
export interface BulkRow {
  /** 원본 CSV 행 번호(1=헤더). 오류를 파일의 그 줄로 되돌릴 수 있어야 한다. */
  line: number
  name: string
  contactName: string
  email: string
  phone: string
}

/**
 * 줄마다의 처리 방식.
 *
 * `link`(있는 행 담기)와 `create`(원장에 만들어 담기)를 가르는 것은 대조 결과이고, 담당자가
 * 바꿀 수 있는 것은 `skip`으로 내리는 것뿐이다 — **중복인데 새로 만드는 선택지는 두지 않는다**
 * (NETWORKS 리뷰 표가 이미 그렇게 한다). 한 줄씩 예외를 열면 그 예외가 파일 단위로 반복되어,
 * 손으로 하나 만드는 것과 달리 수십 건의 중복이 한 번에 들어온다.
 */
export type BulkDecision = 'link' | 'create' | 'skip'

/** 리뷰 표에 서는 한 줄 — 파일 값 + 대조 결과 + 결정. */
export interface BulkEntry {
  row: BulkRow
  /** 원장에서 찾은 행. 없으면 신규다. */
  match: PersonaMatch | null
  /** 이미 이 명단에 담겨 있는가(대조로 찾은 행 기준). 담긴 줄은 결정을 바꿀 수 없다. */
  alreadyMapped: boolean
  /**
   * 이 줄이 담기면 원장이 **비워 두게 되는 칸**. 하나라도 있으면 담기지 않는다(2026-09-10).
   *
   * 보는 대상이 결정에 따라 갈린다 — 원장에 있는 행을 담는 줄(`link`)은 **그 원장 행**이
   * 답하고, 새로 만드는 줄(`create`)은 **파일·폼의 값**이 답한다. 담긴 것은 계정을 열 수
   * 있어야 하므로 어느 쪽이든 셋(명의·이메일·연락처)이 갖춰져야 한다.
   */
  gaps: PersonField[]
  decision: BulkDecision
}

/** 표준 헤더. 템플릿이 내려 주는 순서 그대로다. */
export const BULK_FIELDS = ['name', 'contactName', 'email', 'phone'] as const

/**
 * 헤더 별칭 — 자격마다 부르는 말이 다르므로(대표자/담당자/성명) **여러 이름을 한 칸으로**
 * 받는다. 내려받은 템플릿을 그대로 올릴 때뿐 아니라, 다른 데서 만든 표를 붙여 넣을 때도
 * 열을 잃지 않아야 한다. 매칭되지 않는 열은 무시한다.
 */
const HEADER_ALIASES: Record<string, (typeof BULK_FIELDS)[number]> = {
  기업명: 'name', 전문가명: 'name', 이름: 'name', 성명: 'name', 대상명: 'name', name: 'name',
  대표자: 'contactName', 담당자: 'contactName', 대표자명: 'contactName', 담당자명: 'contactName',
  contactname: 'contactName', representative: 'contactName', contact_name: 'contactName',
  이메일: 'email', email: 'email', 'e-mail': 'email', contact_email: 'email',
  연락처: 'phone', 전화: 'phone', 전화번호: 'phone', 휴대폰: 'phone', phone: 'phone', mobile: 'phone',
}

/**
 * CSV 텍스트를 표준 필드로 읽는다.
 *
 * **이름이 빈 줄은 버린다** — 이름 없이는 대조도 등록도 성립하지 않고, 그 줄을 리뷰 표에
 * 세우면 담당자가 고칠 수 없는 오류 줄이 목록을 채운다(고치는 자리는 파일이다).
 */
export function parseBulkCsv(text: string): BulkRow[] {
  const table = parseCsvTable(text)
  const fieldAt = table.headers.map((h) => {
    const key = h.trim().toLowerCase()
    return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s/g, '')] ?? null
  })
  const at = (cells: string[], field: (typeof BULK_FIELDS)[number]) => {
    const idx = fieldAt.indexOf(field)
    return idx >= 0 ? (cells[idx] ?? '').trim() : ''
  }
  return table.rows
    .map(({ line, cells }) => ({
      line,
      name: at(cells, 'name'),
      contactName: at(cells, 'contactName'),
      email: at(cells, 'email'),
      phone: at(cells, 'phone'),
    }))
    .filter((r) => r.name !== '')
}

/** 자격에 맞는 템플릿 CSV(헤더 + 예시 한 줄). 머리글은 그 자격이 부르는 말로 적는다. */
export function buildTemplateCsv(master: MasterTable): string {
  const spec = PARTICIPANT_PERSONAS[master]
  const sameName = spec.ledger.person.name === spec.ledger.matchColumns.name
  // 대상이 곧 사람인 자격(전문가)은 명의 열을 두지 않는다 — 이름 칸이 그 값이다.
  const headers = sameName
    ? [spec.nameHeader, '이메일', '연락처']
    : [spec.nameHeader, spec.loginNameHeader, '이메일', '연락처']
  const sample = sameName
    ? ['홍길동', 'hong@example.com', '010-1234-5678']
    : ['와이앤아처', '홍길동', 'hong@example.com', '010-1234-5678']
  return [headers.join(','), sample.join(',')].join('\n')
}

/**
 * 파일 줄 + 대조 결과 + 이미 담긴 목록 → 리뷰 표의 줄들.
 *
 * **기본 결정을 여기서 정한다**: 원장에 있으면 `link`, 없으면 `create`, 이미 담겼으면 `skip`.
 * 담당자가 아무것도 만지지 않고 실행해도 옳은 결과가 나와야 한다 — 리뷰 표는 확인하는
 * 자리이지 매 줄을 고르는 자리가 아니다.
 *
 * **파일 안의 중복도 접는다.** 같은 대상이 두 줄에 있으면 뒤엣줄이 `skip`으로 내려간다 —
 * 그러지 않으면 신규 두 건이 각각 만들어져 우리가 막으려던 중복을 우리가 만든다. 판정 키는
 * 대조에 걸린 원장 행 id이고, 신규 줄은 이름·이메일을 합친 값으로 본다(아직 id가 없다).
 */
export function buildEntries(
  master: MasterTable,
  rows: BulkRow[],
  matches: Map<number, PersonaMatch>,
  mappedMasterIds: ReadonlySet<string>,
): BulkEntry[] {
  const spec = PARTICIPANT_PERSONAS[master]
  // 대상이 곧 사람인 자격(전문가)은 이름 칸이 명의까지 답한다 — 파일에 명의 열이 없다.
  const ownLogin = hasOwnLoginName(spec)
  const seen = new Set<string>()
  return rows.map((row, i) => {
    const match = matches.get(i) ?? null
    const key = match ? `id:${match.id}` : `new:${row.name.trim().toLowerCase()}|${row.email.trim().toLowerCase()}`
    const duplicateInFile = seen.has(key)
    seen.add(key)

    const alreadyMapped = Boolean(match && mappedMasterIds.has(match.id))
    /*
      빈 칸을 어디서 보는가 — 있는 행을 담는 줄은 원장이, 새로 만드는 줄은 파일이 답한다.
      파일 값으로 원장의 빈 칸을 채우지는 않는다: 이 창이 받는 열은 명단 표에 서는 넷뿐이라
      여기서 원장을 고치기 시작하면 원장 임포터가 둘이 된다(이 파일 머리말의 근거 그대로).
    */
    const gaps = ledgerGaps(
      match ?? {
        loginName: ownLogin ? row.contactName : row.name,
        email: row.email,
        phone: row.phone,
      },
    )
    const decision: BulkDecision =
      alreadyMapped || duplicateInFile || gaps.length > 0 ? 'skip' : match ? 'link' : 'create'
    return { row, match, alreadyMapped, gaps, decision }
  })
}

/** 담기지 못하는 이유를 담당자가 읽는 말로. 비어 있지 않은 줄만 부른다. */
export function entryGapText(entry: BulkEntry, master: MasterTable): string {
  return gapText(entry.gaps, PARTICIPANT_PERSONAS[master].loginNameHeader)
}

/** 실행 요약 — 버튼과 결과 토스트가 같은 값을 읽는다. */
export function summarize(entries: BulkEntry[]): {
  link: number
  create: number
  skip: number
} {
  return entries.reduce(
    (acc, e) => ({ ...acc, [e.decision]: acc[e.decision] + 1 }),
    { link: 0, create: 0, skip: 0 },
  )
}
