// [AI 작성하기] 자료의 **종류**를 파일명에서 판정한다 — 읽을 자료와 읽지 않을 자료를 가르는 첫 답.
//
// 2026-09-09에 카드×자료 격자를 걷고 자료 칸을 **상(읽을 자료)·하(읽지 않을 자료)** 둘로 갈랐다.
// 담당자가 손으로 옮기기 전에 어느 칸에 세울지를 이 판정이 정한다. 파일명으로 가르는 이유는
// 그것이 담당자가 이미 알고 있는 사실이기 때문이다 — "IR.pdf"가 IR 자료라는 것을 알기 위해
// 파일을 열 필요가 없고, 열지 않으니 값이 들지 않는다.
//
// **종류는 곧 무게이기도 하다.** 서버가 모델에 자료를 넘길 때 이 종류를 꼬리표로 붙이면, 확정
// 숫자를 어느 자료에서 읽을지를 모델이 가릴 수 있다(재무제표·감사보고서가 IR보다 앞선다).
// 격자를 걷으며 잃은 "재무 카드에 발표 자료가 섞이지 않게 하는 방어"를 이 꼬리표가 대신한다.
//
// **모르면 읽지 않는 쪽이다.** 아무 낱말에도 걸리지 않는 파일은 `other`이고 하에 선다 —
// 잘못 읽은 자료는 그럴듯한 틀린 값을 폼에 앉히지만, 잘못 뺀 자료는 담당자가 한 번 눌러
// 올리면 된다. 실패의 방향을 안전한 쪽으로 둔다.
//
// 화면과 서버가 **같은 판정**을 써야 한다 — 화면이 상에 세운 자료에 서버가 다른 꼬리표를 달면
// 담당자가 본 것과 모델이 읽은 것이 어긋난다. 그래서 파서와 같은 자리(`_shared/docParse`)에
// 두고 앱은 `@docparse` 별칭으로 같은 파일을 쓴다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4

export type SourceKind =
  | 'audit'
  | 'pnl'
  | 'financial'
  | 'shareholders'
  | 'registry'
  | 'cert'
  | 'ir'
  | 'plan'
  | 'intro'
  | 'other'

/** 화면 줄과 모델 꼬리표가 함께 쓰는 이름. 한 곳에서만 적는다. */
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  audit: '감사보고서',
  pnl: '손익계산서',
  financial: '재무제표',
  shareholders: '주주명부',
  registry: '등기·등록 서류',
  cert: '인증서',
  ir: 'IR 자료',
  plan: '사업계획서',
  intro: '회사소개서',
  other: '기타',
}

/**
 * 낱말 표. **먼저 걸리는 것이 이긴다** — 순서가 곧 규칙이다.
 *
 * 확정 숫자를 담는 서류(감사보고서·손익·재무제표)를 앞에 두는 이유는 한 파일명에 여러 낱말이
 * 함께 서는 일이 잦기 때문이다("재무제표(손익계산서 포함)"). 그때 더 좁은 종류가 답이어야 한다.
 *
 * 영문 약어(`ir`·`bp`)는 **낱말 경계**로만 잡는다 — `first`·`dir`의 `ir`이 걸리면 아무 파일이나
 * IR이 된다. 한글·숫자·구분자는 경계로 본다(파일명에 영문 낱말 사이 공백이 없는 일이 흔하다).
 */
const RULES: ReadonlyArray<{ kind: SourceKind; words: readonly string[]; tokens?: readonly string[] }> = [
  { kind: 'audit', words: ['감사보고서', 'audit'] },
  { kind: 'pnl', words: ['손익', 'income statement', 'p&l', 'pnl', 'p/l'] },
  { kind: 'financial', words: ['재무제표', '재무상태', '재무', 'financial', 'balance sheet', '결산'] },
  { kind: 'shareholders', words: ['주주명부', '주주', 'shareholder', 'cap table', 'captable'] },
  { kind: 'registry', words: ['등기', '사업자등록', '법인등록', '등록증'] },
  { kind: 'cert', words: ['인증', 'certificate', 'certification', '확인서'] },
  { kind: 'ir', words: ['투자소개', 'investor', 'pitch', 'deck'], tokens: ['ir'] },
  { kind: 'plan', words: ['사업계획', 'business plan'], tokens: ['bp'] },
  { kind: 'intro', words: ['회사소개', '기업소개', '소개서', '소개자료', 'company profile', 'introduction'] },
]

/** 확장자와 경로를 떼고 비교하기 쉬운 모양으로. 링크는 주소의 마지막 마디만 본다. */
function normalizeName(name: string): string {
  let base = name.trim()
  if (/^https?:\/\//i.test(base)) {
    // 주소는 경로 마디들이 이름이다. 호스트는 종류를 말하지 않는다(드라이브 주소가 대부분이다).
    try {
      base = decodeURIComponent(new URL(base).pathname)
    } catch {
      base = ''
    }
  }
  base = base.replace(/\\/g, '/').split('/').pop() ?? ''
  base = base.replace(/\.[a-z0-9]{1,6}$/i, '')
  return base.toLowerCase()
}

/** 영문 토큰이 낱말 경계 안에 있는가 — 앞뒤가 영문자가 아니어야 한다. */
function hasToken(text: string, token: string): boolean {
  return new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(text)
}

/**
 * 파일명(또는 링크 주소)에서 자료의 종류를 판정한다.
 *
 * 걸리는 낱말이 없으면 `other`다 — 그 자료는 하에 서고 담당자가 올리기 전에는 읽히지 않는다.
 */
export function classifySourceKind(name: string): SourceKind {
  const text = normalizeName(name)
  if (!text) return 'other'
  for (const rule of RULES) {
    if (rule.words.some((w) => text.includes(w))) return rule.kind
    if (rule.tokens?.some((t) => hasToken(text, t))) return rule.kind
  }
  return 'other'
}

/** 이 종류의 자료를 **묻지 않고** 읽을 자료 칸에 세우는가. 담당자의 이동이 언제나 이긴다. */
export function readsByDefault(kind: SourceKind): boolean {
  return kind !== 'other'
}
