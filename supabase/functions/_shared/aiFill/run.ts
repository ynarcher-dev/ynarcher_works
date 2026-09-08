// [AI 작성하기] 실행의 뼈대 — **어떻게 뽑는가**의 전부가 여기 있다.
//
// 대상이 스타트업이든 전문가든 사업이든 이 순서는 같다. 자격을 묻고, 자료를 모으고, 요청을
// 나누고, 반출을 기록하고, 조각을 골라 모델을 부르고, 근거를 대조하고, 빠진 카드를 한 번 더
// 묻는다. 대상마다 다른 것은 프로파일에 담기고, 진입점(`index.ts`)은 프로파일 하나를 골라
// 이 함수를 부르는 일만 한다.
//
// 보안(대상과 무관하게 지켜지는 것):
// - 인증된 **내부 사용자**만 호출한다. 게스트 커스텀 JWT는 받지 않는다(WORKS 전용 기능).
// - 쓰기 자격을 서버가 다시 묻는다. 판정식은 프로파일이 정책에서 꺼낸 함수를 되묻는다.
// - 첨부 메타·캐시는 **호출자 토큰**으로 조회해 RLS를 그대로 태운다. service_role은 스토리지
//   바이트를 읽는 데와 감사 로그 적재에만 쓴다(material-download와 같은 규약).
// - 자료마다 access_logs를 적재하고, **적재에 실패하면 모델을 부르지 않는다**(기록 없는 반출 금지).
// - 등록 모드로 올라온 파일은 **우리 쪽 어디에도 저장하지 않는다**(초안만 만들고 버린다).
// - Files API로 올렸다면 **끝나며 반드시 지운다**(성공·실패·예외 모두). 구글의 48시간 자동
//   삭제에 기대지 않는다 — 기밀 자료를 필요한 시간보다 오래 남길 이유가 없다.
// - GEMINI_API_KEY는 서버 시크릿으로만 접근하며 클라이언트로 노출하지 않는다.
// - DB에 쓰지 않는다(감사 로그 제외). 저장은 화면의 통상 저장 경로(RLS)가 담당한다.
// - 로그에 자료 본문·생성 본문을 남기지 않는다. 담기는 것은 수(數)와 짧은 코드뿐이다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8·§16.16,
//       docs/docs_dev/11_migration_security_gate.md

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../cors.ts'
import { supabaseAdmin } from '../supabaseAdmin.ts'
import type { SourceChunk } from './chunks.ts'
import { applyCompose, buildComposeSchema, composableCards, factsOf } from './compose.ts'
import type { DraftEnvelope } from './envelope.ts'
import { normalizeEnvelope } from './envelope.ts'
import { EVIDENCE_RULES } from './evidence.ts'
import { deleteFile, type UploadedFile } from './filesApi.ts'
import { generateDraft } from './generate.ts'
import { planGroups, type CardGroup } from './groups.ts'
import { readIntake } from './intake.ts'
import { ASSEMBLY_BUDGET_MS, TIMEOUT_MS } from './limits.ts'
import { readLink } from './linkRead.ts'
import { dedupe, mergeEnvelopes } from './merge.ts'
import { buildParts, selectParts } from './parts.ts'
import { runPool } from './pool.ts'
import { chunkRanker, type AiFillProfile, type CallerClient } from './profile.ts'
import { readConcurrency } from './request.ts'
import { buildEnvelopeSchema } from './schema.ts'
import { validateSources } from './sources.ts'
import { missingCards, planTopup } from './topup.ts'

const BUCKET = 'attachments'

/** 실패한 요청이 맡고 있던 카드. 화면이 "무엇을 못 썼는지"를 이 목록으로 말한다. */
interface FailedCards<K extends string> {
  keys: K[]
  /** 담당자에게 그대로 보이는 사유. 구글의 원문 오류·자료 내용은 담기지 않는다. */
  message: string
  /** 구글이 준 상태 코드(있으면). 운영이 원인을 가르는 데만 쓴다. */
  upstream: number | null
}

/** 호출자 토큰을 그대로 실은 클라이언트 — 이 클라이언트의 조회에는 RLS가 끝까지 걸린다. */
function callerClient(token: string) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** 이번 실행의 계측. **자료 내용은 담기지 않는다** — 수와 짧은 코드뿐이다. */
interface RunMetrics {
  promptTokens: number
  cachedTokens: number
  outputTokens: number
  verified: number
  unverified: number
  rejected: number
}

/**
 * AI 작성 한 번을 끝까지 수행한다.
 *
 * @param isCardKey 카드 키 판정. 프로파일의 목록에서 만들어 진입점이 넘긴다.
 */
export async function runAiFill<K extends string, C>(
  req: Request,
  profile: AiFillProfile<K, C>,
  isCardKey: (v: unknown) => v is K,
): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  const startedAt = Date.now()

  // 1) 호출자 인증(내부 사용자 전용) -------------------------------------------
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
  const admin = supabaseAdmin()
  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)
  const { data: me } = await admin
    .from('users')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  const appUserId = (me?.id as string | undefined) ?? null
  if (!appUserId) return jsonResponse({ error: 'unauthorized' }, 401)

  // 2) 서버 시크릿 ------------------------------------------------------------
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'not_configured', message: 'AI 작성 키가 설정되지 않았습니다.' }, 503)
  }
  // 별칭 모델을 기본값으로 둔다(특정 버전은 신규 프로젝트에 폐기될 수 있어 GEMINI_MODEL로 덮어쓴다).
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest'

  const caller = callerClient(token)

  // 3) 요청을 읽고 자격을 묻는다 -------------------------------------------------
  const intake = await readIntake(req, { profile, caller, isCardKey })
  if ('error' in intake) {
    return jsonResponse({ error: intake.error.code, message: intake.error.message }, intake.error.status)
  }
  const { cards, assignments, extracts, subject } = intake
  let sources = intake.sources

  if (cards.length === 0) {
    return jsonResponse({ error: 'invalid_request', message: '작성할 카드를 선택해야 합니다.' }, 400)
  }
  // 예비 검사 — 적혀 있는 크기로 먼저 끊는다(큰 파일을 내려받기 전에 막기 위해).
  const sizeError = validateSources(sources)
  if (sizeError) return jsonResponse({ error: sizeError.code, message: sizeError.message }, sizeError.status)

  // 4) 묶음을 여기서 정한다 — **감사 로그보다 먼저**여야 한다.
  // 반출 기록은 "실제로 밖으로 나간 자료"를 적는 것이라, 어느 카드에도 배정되지 않아 모델에
  // 닿지 않을 자료까지 적으면 그 기록이 사실이 아니게 된다. 겸해서 그런 자료는 내려받지도
  // 않는다(스토리지 왕복과 자료 모으기 시간을 그만큼 아낀다).
  const groups = planGroups(cards, assignments, sources.map((s) => s.key), {
    order: profile.cardKeys,
    family: profile.family,
  })
  if (groups.length === 0) {
    return jsonResponse({ error: 'invalid_request', message: '카드마다 읽을 자료를 하나 이상 지정해야 합니다.' }, 400)
  }
  const usedKeys = new Set(groups.flatMap((g) => g.sourceKeys))
  sources = sources.filter((s) => usedKeys.has(s.key))

  // 5) 감사 로그 — 적재에 실패하면 모델을 부르지 않는다 ----------------------------
  // 등록 모드는 가리킬 행이 없어 resource_id가 비고, 무엇을 보냈는지는 파일명이 답한다.
  const { error: logErr } = await admin.from('access_logs').insert(
    sources.map((s) => ({
      user_id: appUserId,
      resource_type: s.attachmentId ? profile.audit.stored : profile.audit.draft,
      resource_id: s.attachmentId,
      // **무엇이 나갔는지를 범위까지 적는다.** 분석된 자료는 원본 바이트가 아니라 우리가
      // 뽑은 글자만 나가므로, 둘을 같은 문구로 적으면 실제 반출의 무게가 흐려진다.
      reason: `AI 작성하기(외부 AI 전송, ${extracts.has(s.key) ? '분석 글자' : '원본'}): ${s.name}`,
    })),
  )
  if (logErr) {
    return jsonResponse({ error: 'log_failed', message: '자료 반출 기록을 남기지 못해 중단했습니다.' }, 500)
  }

  // 6) 자료 조립 + Gemini 호출 ---------------------------------------------------
  // 올린 자료는 어느 경로로 끝나든 지워야 하므로 지우는 쪽이 목록을 쥔다. 조립이 돌려주는
  // 값에 실으면 업로드 도중 시간이 초과돼 예외로 빠져나갈 때 목록이 함께 사라진다.
  const uploaded: UploadedFile[] = []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const built = await buildParts(
      sources,
      {
        apiKey,
        signal: controller.signal,
        download: async (path) => {
          const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path)
          if (dlErr || !blob) {
            console.error('[ai-fill] 스토리지 읽기 실패', path, dlErr?.message)
            return null
          }
          return await blob.arrayBuffer()
        },
        readLink,
        // 모아 오는 일은 여기까지. 남은 시간은 모델이 쓴다.
        deadline: Date.now() + ASSEMBLY_BUDGET_MS,
        // 요청이 둘 이상이면 인라인을 쓰지 않는다(요청마다 base64 사본이 생긴다).
        forceFilesApi: groups.length > 1,
        extracts,
      },
      uploaded,
    )
    if ('error' in built) {
      return jsonResponse({ error: built.error.code, message: built.error.message }, built.error.status)
    }
    const notices = [...built.notices]

    // 읽을 것이 하나도 남지 않으면 모델을 부르지 않는다(빈 초안에 비용을 쓰지 않는다).
    if (built.fileParts.size === 0 && built.chunks.size === 0) {
      return jsonResponse(
        { error: 'no_readable_source', message: `읽을 수 있는 자료가 없습니다. ${dedupe(notices).join(' / ')}` },
        400,
      )
    }

    // 프롬프트·정규화가 함께 쓰는 원장 값(소재지 선택지 등). 상수로 두면 원장이 바뀌는 날
    // 서버만 옛 목록으로 판정하므로 그 카드를 고른 요청에서만 그때그때 받아 온다.
    const context = await profile.loadContext(caller as unknown as CallerClient, cards)

    // 6-2) 묶음마다 조각을 고른다. 지정한 자료를 하나도 못 읽은 묶음은 부르지 않는다 —
    // 근거 없이 부르면 모델이 지어낼 자리만 생기고, 담당자에게는 "못 찾았다"로 보여
    // 자료를 못 읽었다는 사실이 묻힌다.
    const failedCards: FailedCards<K>[] = []
    const runnable = groups.flatMap((group) => {
      const selected = selectParts(built, group.sourceKeys, chunkRanker(profile, group.cards))
      notices.push(...selected.notices)
      if (selected.parts.length === 0) {
        failedCards.push({ keys: group.cards, message: '지정한 자료를 읽지 못해 건너뛰었습니다.', upstream: null })
        return []
      }
      return [{ group, selected }]
    })
    if (runnable.length === 0) {
      return jsonResponse(
        { error: 'no_readable_source', message: `읽을 수 있는 자료가 없습니다. ${dedupe(notices).join(' / ')}` },
        400,
      )
    }

    const metrics: RunMetrics = {
      promptTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      verified: 0,
      unverified: 0,
      rejected: 0,
    }

    /** 한 묶음의 요청 한 벌. 근거 대조가 **그 묶음이 실제로 보낸 조각**만 보게 닫아 넣는다. */
    const callFor = (
      group: CardGroup<K>,
      selected: { parts: unknown[]; index: ReturnType<typeof selectParts>['index'] },
      label: string,
    ) =>
      generateDraft<K>({
        apiKey,
        model,
        parts: [
          ...selected.parts,
          { text: `${profile.buildPrompt(group.cards, subject, context)}\n\n${EVIDENCE_RULES}` },
        ],
        cards: group.cards,
        signal: controller.signal,
        schema: buildEnvelopeSchema(group.cards, profile.cardSchemas),
        normalize: (parsed) =>
          normalizeEnvelope(parsed, group.cards, {
            normalizeCard: (key, raw, warn) => profile.normalizeCard(key, raw, warn, context),
            cardShape: profile.cardShape,
            index: selected.index,
            maxNotes: profile.maxNotes,
          }),
        label,
      })

    // 6-3) 병렬 호출. 한 묶음의 실패가 다른 묶음의 결과를 버리지 않는다.
    const settled = await runPool(
      runnable,
      readConcurrency(Deno.env.get('GEMINI_MAX_CONCURRENCY')),
      ({ group, selected }, i) => callFor(group, selected, `${i + 1}/${runnable.length}`),
    )

    // 6-4) 성공한 것만 합치고 실패한 카드는 이름으로 말한다.
    const envelopes: DraftEnvelope<K>[] = []
    let modelVersion: string | null = null
    let abortedGroups = 0
    for (const [i, r] of settled.entries()) {
      const group = runnable[i].group
      if (r.status === 'rejected') {
        const aborted = r.reason instanceof DOMException && r.reason.name === 'AbortError'
        if (aborted) abortedGroups += 1
        else console.error('[ai-fill] 묶음 예외', r.reason instanceof Error ? r.reason.message : r.reason)
        failedCards.push({
          keys: group.cards,
          message: aborted ? '시간이 초과돼 이 카드는 작성하지 못했습니다.' : 'AI 작성 중 오류가 발생했습니다.',
          upstream: null,
        })
        continue
      }
      if ('failure' in r.value) {
        failedCards.push({ keys: group.cards, message: r.value.failure.message, upstream: r.value.failure.upstream })
        continue
      }
      envelopes.push(r.value.envelope)
      metrics.promptTokens += r.value.telemetry.promptTokens ?? 0
      metrics.cachedTokens += r.value.telemetry.cachedTokens ?? 0
      metrics.outputTokens += r.value.telemetry.outputTokens ?? 0
      metrics.verified += r.value.stats.verified
      metrics.unverified += r.value.stats.unverified
      metrics.rejected += r.value.stats.rejected
      // 별칭이 실제로 어느 모델이었는지. 묶음마다 같은 값이라 먼저 온 것을 쓴다.
      modelVersion ??= r.value.telemetry.modelVersion
    }

    // 6-5) 봉투에서 빠진 카드만 한 번 더 묻는다 -----------------------------------
    // 요청은 성공했는데 모델이 그 카드를 담지 않은 경우다(출력이 길어질 때 실제로 난다).
    // 값이 null로 온 카드는 여기 들지 않는다 — 읽고 없다고 답한 것이라 다시 물어도 같다.
    let topupCalled = false
    if (envelopes.length > 0) {
      const answered = envelopes.flatMap((e) => Object.keys(e.cards))
      const missing = missingCards(cards, answered, failedCards.flatMap((f) => f.keys), profile.cardKeys)
      const plan: CardGroup<K> | null = planTopup(missing, groups)
      const selected = plan ? selectParts(built, plan.sourceKeys, chunkRanker(profile, plan.cards)) : null
      if (plan && selected && selected.parts.length > 0) {
        topupCalled = true
        const again = await callFor(plan, selected, '보완').catch(() => null)
        // 보완이 실패해도 이미 손에 든 초안을 버리지 않는다. 그 카드는 값 없이 남고,
        // 병합이 기존 값을 지키므로 담당자가 잃는 것이 없다.
        if (again && !('failure' in again)) {
          envelopes.push(again.envelope)
          metrics.promptTokens += again.telemetry.promptTokens ?? 0
          metrics.cachedTokens += again.telemetry.cachedTokens ?? 0
          metrics.outputTokens += again.telemetry.outputTokens ?? 0
          metrics.verified += again.stats.verified
          metrics.unverified += again.stats.unverified
          metrics.rejected += again.stats.rejected
        }
      }
    }

    // 6-6) 작문 패스 — **자료를 다시 읽지 않고 문장만 다시 쓴다** ----------------------
    // 봉투를 여기서 미리 합치는 것은 이 패스의 입력이 "1단계가 확정한 사실 전부"이기 때문이다.
    // 묶음별 봉투를 따로 넘기면 핵심 포인트를 쓰는 요청이 재무 표를 보지 못한다.
    const merged = mergeEnvelopes(envelopes)
    const composed: K[] = []
    let composeFailed: string | null = null
    let composeModel: string | null = null
    if (profile.compose && envelopes.length > 0) {
      const spec = profile.compose
      const targets = composableCards(cards, merged.cards, spec, profile.cardKeys)
      if (targets.length > 0) {
        // 모델을 따로 고를 수 있게 둔다 — 두 단계가 서로 다른 일을 하므로 저울도 다르다.
        // 값이 없으면 1단계와 같은 모델이라, 설정하지 않은 환경에서 조용히 달라지지 않는다.
        composeModel = (spec.modelEnv ? Deno.env.get(spec.modelEnv) : null) ?? model
        const written = await generateDraft<K>({
          apiKey,
          model: composeModel,
          // 자료가 실리지 않는다. 손에 있는 것이 1단계의 값뿐이라 지어낼 자리가 없다.
          parts: [
            {
              text: `${spec.buildPrompt(targets, subject, context)}\n\n--- 1단계가 확정한 사실(JSON) ---\n${factsOf(merged.cards)}`,
            },
          ],
          cards: targets,
          signal: controller.signal,
          schema: buildComposeSchema(targets, spec.cardSchemas),
          temperature: spec.temperature,
          normalize: (parsed) =>
            normalizeEnvelope(parsed, targets, {
              normalizeCard: (key, raw, warn) => profile.normalizeCard(key, raw, warn, context),
              cardShape: profile.cardShape,
              // 조각을 싣지 않았으므로 대조할 지도가 없다. 스키마에도 근거 칸이 없어 실제로
              // 여기 걸릴 값은 오지 않지만, 지도를 비워 두는 것이 곧 "이 패스는 근거를 만들지
              // 않는다"는 선언이다.
              index: { chunks: new Map(), sources: new Map() },
              maxNotes: profile.maxNotes,
            }),
          label: '작문',
        }).catch((e: unknown) => {
          const aborted = e instanceof DOMException && e.name === 'AbortError'
          return {
            failure: {
              message: aborted
                ? '시간이 초과돼 문장 다듬기를 건너뛰었습니다.'
                : '문장 다듬기 중 오류가 발생했습니다.',
              upstream: null,
            },
          } as const
        })

        if ('failure' in written) {
          // **초안을 버리지 않는다.** 1단계 결과가 이미 손에 있고 그것만으로도 값은 다 들어
          // 있다. 담당자에게는 "문장이 덜 다듬어졌다"는 사실만 알린다.
          composeFailed = written.failure.message
        } else {
          composed.push(...applyCompose(merged, written.envelope, targets, profile.cardShape, profile.maxNotes))
          metrics.promptTokens += written.telemetry.promptTokens ?? 0
          metrics.cachedTokens += written.telemetry.cachedTokens ?? 0
          metrics.outputTokens += written.telemetry.outputTokens ?? 0
        }
      }
    }

    // 6-7) 카드를 가로질러 보는 판정 — **작문 패스 뒤**여야 한다.
    // 판정 대상은 담당자가 실제로 보게 될 문장이고, 그 문장을 마지막에 정한 것이 작문 패스다.
    if (profile.crossCheck) {
      profile.crossCheck(merged.cards, (card, line) => {
        const lines = (merged.notes[card] ??= [])
        if (lines.length < profile.maxNotes * 2) lines.push(line)
      })
    }

    console.log(
      '[ai-fill] 실행 요약',
      JSON.stringify({
        profile: profile.name,
        groups: groups.length,
        called: runnable.length,
        topup: topupCalled,
        composed: composed.length,
        composeFailed: composeFailed !== null,
        ok: envelopes.length,
        failed: failedCards.length,
        sources: sources.length,
        extracted: extracts.size,
        // 조각을 몇 개 들고 몇 개를 실제로 보냈는가. 예산 압박을 이 두 수가 답한다.
        chunks: [...built.chunks.values()].reduce((sum, list: SourceChunk[]) => sum + list.length, 0),
        skipped: dedupe(notices).length,
        uploaded: uploaded.length,
        ...metrics,
        elapsedMs: Date.now() - startedAt,
      }),
    )

    // 전부 실패했을 때만 오류다. 하나라도 성공하면 그 카드는 담당자의 손에 들어가야 한다.
    if (envelopes.length === 0) {
      const allAborted = abortedGroups === settled.length
      return jsonResponse(
        {
          error: allAborted ? 'timeout' : 'draft_failed',
          message: allAborted
            ? '대용량 문서 분석이 지연되어 시간이 초과됐습니다. 잠시 후 다시 시도하세요.'
            : (failedCards[0]?.message ?? 'AI 작성에 실패했습니다.'),
          // 못 읽은 자료도 함께 보낸다 — 실패한 이유가 그것일 수 있다.
          skippedSources: dedupe(notices),
          failedCards,
        },
        allAborted ? 504 : 502,
      )
    }

    return jsonResponse({
      ...merged,
      // 못 읽었거나 일부만 읽은 자료는 결과와 같은 자리에서 알린다.
      skippedSources: dedupe(notices),
      // 부분 성공. 빈 배열이면 전부 성공이며, 화면은 이 목록으로 "무엇을 못 썼는지"를 말한다.
      failedCards,
      // 문장까지 다시 쓴 카드. 값이 채워진 것과 다른 축이라 따로 말한다.
      composed,
      // 다듬지 못했을 때의 사유. 값은 다 들어 있으므로 실패가 아니라 **알림**이다.
      composeFailed,
      model,
      composeModel,
      // 별칭이 아니라 실제로 답한 모델. 운영이 품질 변화를 이 값으로 가른다.
      modelVersion,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return jsonResponse(
      {
        error: aborted ? 'timeout' : 'server_error',
        message: aborted
          ? '대용량 문서 분석이 지연되어 시간이 초과됐습니다. 잠시 후 다시 시도하세요.'
          : 'AI 작성 중 오류가 발생했습니다.',
      },
      aborted ? 504 : 500,
    )
  } finally {
    clearTimeout(timer)
    // 올린 자료는 성공·실패·예외를 가리지 않고 지운다.
    await Promise.all(uploaded.map((f) => deleteFile(apiKey, f)))
  }
}
