// [AI 작성하기] 대상별 프로파일 — **무엇을 뽑는가**만 여기 담긴다.
//
// 이 파일이 이 기능의 재사용 경계다. 가르는 기준은 하나 — *무엇을 뽑는가*는 프로파일이,
// *어떻게 뽑는가*는 엔진이 소유한다. 자료를 모으고, 예산을 재고, 요청을 나누고, 모델을 부르고,
// 근거를 대조하는 일은 대상이 스타트업이든 전문가든 사업이든 똑같다. 대상마다 다른 것은
// 카드 목록·규격·프롬프트·권한 판정뿐이고, 그 전부가 이 인터페이스에 들어온다.
//
// 함수(엔드포인트)는 **대상마다 얇게** 둔다. 하나로 합쳐 `target` 인자로 가르지 않는 이유는
// 권한을 묻는 함수가 대상마다 다르고, 함수 이름이 곧 감사 로그와 배포의 경계이기 때문이다 —
// 한 함수가 여러 원장의 쓰기 자격을 판정하기 시작하면 어느 대상의 사고인지 로그가 답하지 못한다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.16

import type { SourceChunk } from './chunks.ts'
import type { ComposeSpec } from './compose.ts'
import type { SchemaNode } from './schema.ts'
import type { Warn } from './envelope.ts'

/**
 * 호출자 토큰을 실은 Supabase 클라이언트의 최소 모양.
 *
 * 구체 타입을 쓰지 않는 이유는 이 파일이 런타임을 모르게 두기 위해서다 — 프로파일은 판정의
 * 이름만 알면 되고, 클라이언트를 만드는 일은 함수 진입점이 한다.
 */
export interface CallerClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>
      }
      is(column: string, value: unknown): {
        order(column: string): PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>
      }
    }
  }
}

/**
 * 한 대상의 AI 작성 규격.
 *
 * @typeParam K 카드 키.
 * @typeParam C 프롬프트·정규화가 함께 쓰는 요청 시점 맥락(원장에서 받아 오는 선택지 등).
 */
export interface AiFillProfile<K extends string, C> {
  /** 로그에서 이 프로파일을 부르는 이름. */
  name: string
  /** 첨부의 다형 대상 키(`attachments.target_type`). */
  targetType: string
  /**
   * 옛 화면이 대상 id를 부르던 이름(`startupId` 등).
   *
   * 함수를 먼저 배포하고 화면을 뒤에 내보내는 순서라 그 사이 이미 떠 있는 화면이 옛 이름으로
   * 부른다. 화면이 모두 `targetId`로 넘어간 뒤 지운다.
   */
  legacyIdKey?: string

  /** 카드 키를 **화면 순서로** 담는다. 요청 순서를 쓰지 않는 근거가 이 목록이다. */
  cardKeys: readonly K[]
  cardLabels: Record<K, string>
  cardShape: Record<K, 'object' | 'array'>
  /**
   * 같은 자료를 읽더라도 한 요청에 함께 맡길 수 있는 카드 묶음.
   *
   * 나누는 목적은 입력을 줄이는 것이 **아니다** — 자료는 그대로이고 요청당 출력이 작아져
   * 답이 잘리지 않는 것이 목적이다(groups.ts 주석).
   */
  family: Record<K, string>
  cardSchemas: Record<K, SchemaNode>
  /**
   * 카드마다 그 값이 있을 법한 자리를 가리키는 낱말.
   *
   * **예산을 넘겨 조각을 골라야 할 때만 쓴다.** 예산 안에서는 전부 보내므로 이 목록이 회수에
   * 영향을 주지 않는다 — 빠짐없이 뽑는 것이 이 기능의 계약이고, 검색은 버리는 것을 줄이는
   * 수단일 뿐이다. 비워 두면 문서 순서대로 담는다.
   */
  cardKeywords?: Partial<Record<K, readonly string[]>>
  /** 카드마다 notes 줄 수 상한. */
  maxNotes: number

  /** 요청 시점에 원장에서 받아 오는 맥락(소재지 선택지 등). 카드가 필요로 할 때만 부른다. */
  loadContext(caller: CallerClient, cards: K[]): Promise<C>
  /** 체크된 카드의 지시를 이어 붙인다. 근거 규칙은 엔진이 뒤에 덧붙이므로 여기 적지 않는다. */
  buildPrompt(cards: K[], subject: string, context: C): string
  /** 카드 한 장의 값을 규격에 맞춘다. 규격 밖 값은 null로 치환하고 `warn`에 원문을 남긴다. */
  normalizeCard(key: K, raw: unknown, warn: Warn<K>, context: C): unknown

  /**
   * 카드를 **가로질러** 보는 판정. 없으면 하지 않는다.
   *
   * 정규화가 이 일을 못 하는 것은 엔진이 그것을 카드마다 따로 부르기 때문이고, 그 구조는
   * 일부러 그렇다 — 한 카드의 규격이 다른 카드의 값에 얽히면 카드를 늘릴 때마다 기존 카드의
   * 정규화를 다시 봐야 한다. 그래서 "같은 문장이 두 카드에 앉지 않았는가" 같은 물음만 여기서
   * 답하고, **고치지 않고 알리기만 한다**(어느 쪽을 다시 쓸지는 사람이 정한다).
   *
   * 작문 패스가 있으면 그 뒤에 부른다 — 판정 대상은 담당자가 실제로 보게 될 문장이다.
   */
  crossCheck?(cards: Partial<Record<K, unknown>>, warn: Warn<K>): void

  /**
   * 2단계 작문 패스의 규격. 없으면 그 패스는 아예 돌지 않는다(모델 호출이 늘지 않는다).
   *
   * 대상마다 필요가 다르다 — 원장의 칸을 채우는 대상에서는 1단계의 명사구가 그대로 최종본이고,
   * 읽는 사람을 앞에 둔 문서에서만 문장이 필요하다.
   */
  compose?: ComposeSpec<K, C>

  /** 이 레코드를 고칠 수 있는가. 판정식을 복제하지 않고 정책이 쓰는 함수를 되묻는다. */
  canWrite(caller: CallerClient, targetId: string): Promise<boolean>
  /** 이 대상을 만들 수 있는가(등록 모드 — 가리킬 행이 아직 없다). */
  canCreate(caller: CallerClient): Promise<boolean>
  /** 프롬프트에 실을 대상의 이름. 못 찾으면 빈 문자열(모델이 문서에서 확인한다). */
  subjectName(caller: CallerClient, targetId: string): Promise<string>

  /** 감사 로그의 `resource_type`. 원장에 있는 자료와 보류 자료가 갈린다. */
  audit: { stored: string; draft: string }

  /** 담당자에게 보이는 말 — 권한이 없을 때. */
  messages: { forbiddenWrite: string; forbiddenCreate: string }
}

/**
 * 카드 묶음이 조각을 고를 때 쓸 점수 함수를 만든다.
 *
 * 낱말이 하나도 없으면 점수 함수를 만들지 않는다(문서 순서를 그대로 쓴다). 점수가 0인 조각도
 * 버려지지 않고 뒤로 밀릴 뿐이라, 예산이 남으면 전부 담긴다.
 */
export function chunkRanker<K extends string, C>(
  profile: AiFillProfile<K, C>,
  cards: K[],
): ((chunk: SourceChunk) => number) | undefined {
  const words = new Set<string>()
  for (const card of cards) for (const w of profile.cardKeywords?.[card] ?? []) words.add(w.toLowerCase())
  if (words.size === 0) return undefined
  return (chunk) => {
    const hay = `${chunk.location}\n${chunk.text}`.toLowerCase()
    let score = 0
    for (const w of words) if (hay.includes(w)) score += 1
    return score
  }
}
