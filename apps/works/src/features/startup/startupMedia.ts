import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/master/entityHooks'

/** 미디어 1건(startups.media 배열 원소). 메타데이터는 URL 첨부 시 자동 채움(수동 편집 가능). */
export interface MediaItem {
  /** 원문 URL. */
  url: string
  /** 분류(언론기사·영상·기타). */
  kind?: string
  title?: string | null
  description?: string | null
  image?: string | null
  siteName?: string | null
}

/** 미디어 분류 선택지. */
export const MEDIA_KINDS = ['언론기사', '영상', '기타'] as const

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** 미디어 목록을 저장 순서대로 읽는다. */
export function readMedia(record: EntityRow): MediaItem[] {
  return asArray(record.media).map((m) => m as MediaItem)
}

/** link-metadata Edge Function 응답(OG 메타데이터). */
export interface LinkMetadata {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  type: string | null
}

/**
 * URL의 OG 메타데이터를 서버사이드(Edge Function)로 읽어온다.
 * 브라우저 CORS·SSRF 제약을 우회하고, 세션 토큰은 functions.invoke가 자동 첨부한다.
 */
export function useLinkMetadata() {
  return useMutation({
    mutationFn: async (url: string): Promise<LinkMetadata> => {
      const { data, error } = await supabase.functions.invoke('link-metadata', { body: { url } })
      if (error) {
        // context가 Response일 때만 본문(JSON)에서 서버 메시지를 읽는다.
        // (함수 미배포·네트워크 오류 시 context는 Response가 아닐 수 있어 방어적으로 처리)
        const ctx = (error as { context?: unknown }).context
        let message = ''
        if (ctx && typeof (ctx as Response).json === 'function') {
          const detail = await (ctx as Response).json().catch(() => null)
          message = (detail as { message?: string } | null)?.message ?? ''
        }
        if (!message && error instanceof Error) message = error.message
        throw new Error(message || '메타데이터를 불러오지 못했습니다.')
      }
      return data as LinkMetadata
    },
  })
}

/** 자동으로 긁어 볼 만한 주소인가 — 스킴과 점 하나. 여기서 막는 것은 오탈자가 아니라 왕복이다. */
function isFetchable(url: string): boolean {
  return /^https?:\/\/[^\s/]+\.[^\s/]+/.test(url)
}

/** 입력이 멈춘 뒤 기다리는 시간(ms). 타이핑 중인 주소를 매 글자마다 물으러 가지 않는다. */
const AUTO_DELAY_MS = 700

/**
 * 응답을 항목에 얹는다 — **비어 있는 칸만** 채운다.
 *
 * 담당자가 적어 둔 제목·설명을 덮지 않는 것이 이 함수의 전부다. 자동으로 도는 일이라
 * 덮어쓰면 손으로 고친 값이 소리 없이 사라지고, 그 순간부터 담당자는 이 칸을 믿지 못한다.
 * 주소도 덮지 않는다 — 지금 타이핑하고 있는 칸이다.
 *
 * 썸네일·출처는 반대로 응답이 이긴다. 손으로 적는 값이 아니라 그 주소가 지금 무엇을 내놓는지의
 * 사본이라, 옛 값을 지키는 것이 지키는 일이 되지 못한다.
 */
function fillBlanks(item: MediaItem, got: LinkMetadata): MediaItem {
  const filled = (v: string | null | undefined) => (v ?? '').trim() !== ''
  return {
    ...item,
    title: filled(item.title) ? item.title : got.title,
    description: filled(item.description) ? item.description : got.description,
    image: got.image ?? item.image ?? null,
    siteName: got.siteName ?? item.siteName ?? null,
  }
}

/**
 * 주소를 넣으면 메타데이터가 알아서 따라온다(2026-09-10 사용자 지정).
 *
 * 종전에는 줄마다 '메타데이터 불러오기' 버튼이 있었다. 그 버튼이 하는 일은 언제나 같고
 * 안 누를 이유도 없어서, 누르지 않은 줄은 정보가 없는 줄이 아니라 **담당자가 한 번 더 눌러야
 * 했던 줄**이었다. 할 일이 하나뿐인 버튼은 그 일을 스스로 하는 편이 낫다.
 *
 * 한 번 시도한 주소는 다시 묻지 않는다(성공도 실패도). 실패를 되풀이하면 주소가 잘못된 줄
 * 하나 때문에 목록을 고칠 때마다 왕복이 일어나고, 성공을 되풀이하면 담당자가 지운 제목이
 * 다음 렌더에 되살아난다. 주소를 고치면 그때 다시 묻는다 — 다른 주소이기 때문이다.
 */
export function useAutoLinkMetadata(
  media: MediaItem[],
  setMedia: (m: MediaItem[]) => void,
  onError?: (message: string) => void,
) {
  const meta = useLinkMetadata()
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null)

  // 응답이 돌아오는 사이에 담당자가 다른 줄을 고칠 수 있다. 요청을 보낼 때의 목록에 결과를
  // 얹으면 그 사이의 편집이 지워지므로, 얹을 때는 언제나 지금 화면의 목록을 기준으로 삼는다.
  // 나머지 셋을 ref로 든 것은 effect의 의존성을 목록 하나로 묶기 위해서다 — 상위가 매 렌더
  // 새 함수를 넘기면 그때마다 타이머가 다시 걸린다.
  const latest = useRef(media)
  const apply = useRef(setMedia)
  const fail = useRef(onError)
  const fetcher = useRef(meta)
  latest.current = media
  apply.current = setMedia
  fail.current = onError
  fetcher.current = meta

  const tried = useRef<Set<string>>(new Set())

  useEffect(() => {
    const pending = media
      .map((m) => (m.url ?? '').trim())
      .find((url) => isFetchable(url) && !tried.current.has(url))
    if (!pending) return

    const timer = setTimeout(() => {
      tried.current.add(pending)
      setLoadingUrl(pending)
      fetcher.current
        .mutateAsync(pending)
        .then((got) => {
          apply.current(
            latest.current.map((m) => ((m.url ?? '').trim() === pending ? fillBlanks(m, got) : m)),
          )
        })
        .catch((e: unknown) => {
          fail.current?.(e instanceof Error ? e.message : '메타데이터를 불러오지 못했습니다.')
        })
        .finally(() => setLoadingUrl(null))
    }, AUTO_DELAY_MS)

    return () => clearTimeout(timer)
  }, [media])

  return { loadingUrl }
}
