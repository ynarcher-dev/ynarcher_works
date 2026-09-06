import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import type { ExtractBody } from '@docparse/types.ts'
import type { AiSource } from '@/features/startup/startupAiFill'
import { analyzeSource, useMaterialExtracts, type LocalExtract } from '@/features/startup/startupAiExtract'
import { sourceStatus, type AiSourceStatus } from '@/features/startup/startupAiExtractState'

/**
 * 자료 분석 단계의 상태를 한곳에서 든다 — 캐시 · 이번 세션의 결과 · 진행 중 · 담당자 지정.
 *
 * 모달에서 뗀 이유는 줄 수가 아니라 **소유**다. 모달은 "무엇을 고르는가"를 알고, 이 훅은
 * "그 자료가 지금 어떤 상태인가"를 안다. 둘이 한 파일에 있으면 격자 선택을 만질 때마다
 * 분석 상태가 함께 흔들린다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.3·§16.5
 */

export interface AiExtractController {
  statusOf: (source: AiSource) => AiSourceStatus
  /** 지금 열고 있는 자료 수와 전체(진행 표시용). 놀고 있으면 null. */
  progress: { done: number; total: number } | null
  busy: boolean
  /** 고른 자료 중 분석 대상만 골라 차례로 연다. */
  analyze: (sources: AiSource[]) => Promise<void>
  /** 이 자료만 원본 그대로 보낸다(되돌릴 수 있다). */
  toggleOriginal: (key: string) => void
  isForcedOriginal: (key: string) => boolean
  /** 등록 모드에서 작성 요청에 함께 실을 글자. 수정 모드에서는 비어 있다. */
  pendingExtracts: Record<string, { name: string; body: ExtractBody }>
  error: string | null
}

export function useStartupAiExtracts(sources: AiSource[], startupId?: string): AiExtractController {
  const attachmentIds = useMemo(
    () => sources.filter((s) => s.kind === 'attachment').map((s) => s.key),
    [sources],
  )
  const cached = useMaterialExtracts(attachmentIds)
  const queryClient = useQueryClient()

  /** 이번 세션에서 만든 결과. 등록 모드의 유일한 저장소이고, 수정 모드에서는 캐시보다 앞선다. */
  const [local, setLocal] = useState<Record<string, LocalExtract>>({})
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [forced, setForced] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const statusOf = useCallback(
    (source: AiSource): AiSourceStatus =>
      sourceStatus({
        source,
        // 방금 만든 결과가 캐시보다 앞선다 — 캐시 조회는 무효화 뒤 한 박자 늦게 온다.
        record: local[source.key]?.record ?? cached.data?.[source.key] ?? null,
        running: running.has(source.key),
        forcedOriginal: forced.has(source.key),
      }),
    [local, cached.data, running, forced],
  )

  const analyze = useCallback(
    async (targets: AiSource[]) => {
      const todo = targets.filter((s) => statusOf(s).analyzable)
      if (todo.length === 0) return
      setError(null)
      setProgress({ done: 0, total: todo.length })

      let stored = false
      for (const [i, source] of todo.entries()) {
        setRunning((prev) => new Set(prev).add(source.key))
        try {
          const result = await analyzeSource(source, startupId)
          setLocal((prev) => ({ ...prev, [source.key]: result }))
          if (source.kind === 'attachment') stored = true
        } catch (e) {
          // 한 건이 죽어도 나머지는 계속 연다. 사유는 그 줄이 아니라 위쪽 한 줄이 말한다 —
          // 서버가 통째로 거절한 경우(권한·파서 버전)라 자료의 문제가 아니기 때문이다.
          setError(e instanceof Error ? e.message : '자료를 분석하지 못했습니다.')
        } finally {
          setRunning((prev) => {
            const next = new Set(prev)
            next.delete(source.key)
            return next
          })
          setProgress({ done: i + 1, total: todo.length })
        }
      }

      setProgress(null)
      // 저장된 자료가 있으면 캐시 조회를 다시 세운다(다음에 창을 열 때 그대로 보여야 한다).
      if (stored) await queryClient.invalidateQueries({ queryKey: ['attachment-extracts'] })
    },
    [statusOf, startupId, queryClient],
  )

  const toggleOriginal = useCallback((key: string) => {
    setForced((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const pendingExtracts = useMemo(() => {
    const out: Record<string, { name: string; body: ExtractBody }> = {}
    for (const source of sources) {
      if (source.kind === 'attachment') continue
      if (forced.has(source.key)) continue
      const body = local[source.key]?.body
      if (body) out[source.key] = { name: source.name, body }
    }
    return out
  }, [sources, local, forced])

  return {
    statusOf,
    progress,
    busy: running.size > 0 || progress !== null,
    analyze,
    toggleOriginal,
    isForcedOriginal: (key: string) => forced.has(key),
    pendingExtracts,
    error,
  }
}
