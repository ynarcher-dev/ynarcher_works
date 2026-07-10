import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/networks/hooks'

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
