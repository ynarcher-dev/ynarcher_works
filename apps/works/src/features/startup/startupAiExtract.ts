import { useQuery } from '@tanstack/react-query'
import { PARSER_VERSION, type ExtractBody, type ExtractResult, type ExtractSummary } from '@docparse/types.ts'
import { supabase } from '@/lib/supabase'
import { readInvokeError, type AiSource } from '@/features/startup/startupAiFill'
import { resolveAiMime } from '@/features/startup/startupAiFormats'
import type { AiExtractRecord } from '@/features/startup/startupAiExtractState'
import type { DocParseRequest, DocParseResponse } from '@/features/startup/docParseWorker'

/**
 * 자료 분석 호출부 — 캐시 조회 · 브라우저 파싱 · 서버 분석 요청.
 *
 * **자료가 어디에 있는가가 경로를 정한다.**
 *   * 원장에 있는 첨부(파일·링크): 서버가 연다(`startup-material-extract`). 브라우저는
 *     스토리지 바이트를 읽을 수 없고, 바깥 주소는 CORS로 막힌다.
 *   * 등록 모드의 보류 파일: **브라우저 Web Worker가 연다.** 바이트가 이미 여기 있고,
 *     저장할 자리가 없으므로 서버에 물어볼 것도 없다 — 요청 한 번을 통째로 아낀다.
 *   * 등록 모드의 보류 링크: 서버가 가져오되 저장하지 않고 결과만 돌려준다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.5
 */

/** 화면이 들고 있는 분석 결과 한 건(등록 모드에서는 본문까지 든다). */
export interface LocalExtract {
  record: AiExtractRecord
  /** 등록 모드에서만 채워진다 — 작성 요청에 함께 실을 글자다. */
  body?: ExtractBody
}

interface ExtractResponse {
  status: 'ready' | 'failed' | 'original'
  summary: ExtractSummary | null
  reason: string | null
  body: ExtractBody | null
  analyzedAt: string
}

/** 캐시 원장 조회 결과를 화면이 쓰는 모양으로. */
function toRecord(row: {
  status: string
  parser_version: string
  summary: ExtractSummary | null
  failed_reason: string | null
  analyzed_at: string | null
}): AiExtractRecord {
  return {
    status: row.status === 'ready' || row.status === 'original' ? row.status : 'failed',
    parserVersion: row.parser_version,
    summary: row.summary,
    failedReason: row.failed_reason,
    analyzedAt: row.analyzed_at,
  }
}

/**
 * 고른 자료의 분석 상태를 한 번에 묻는다.
 *
 * **본문(`body`)은 받지 않는다.** 격자가 상태 줄을 그리는 데 필요한 것은 건수뿐이고, 자료
 * 열넷의 본문을 받으면 창이 열릴 때마다 수 MB가 오간다. 본문은 작성할 때 서버가 읽는다.
 */
export function useMaterialExtracts(attachmentIds: string[]) {
  const ids = [...attachmentIds].sort()
  return useQuery({
    queryKey: ['attachment-extracts', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, AiExtractRecord>> => {
      const { data, error } = await supabase
        .from('attachment_extracts')
        .select('attachment_id, status, parser_version, summary, failed_reason, analyzed_at')
        .in('attachment_id', ids)
      if (error) throw new Error(error.message)
      const out: Record<string, AiExtractRecord> = {}
      for (const row of data ?? []) out[String(row.attachment_id)] = toRecord(row)
      return out
    },
  })
}

/** 작업자 하나를 만들어 재사용한다 — 파일마다 새로 띄우면 번들을 매번 다시 깨운다. */
let worker: Worker | null = null
function docParseWorker(): Worker {
  worker ??= new Worker(new URL('./docParseWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** 보류 파일 하나를 브라우저에서 연다. */
export function parseInBrowser(key: string, file: File, mime: string): Promise<ExtractResult> {
  return new Promise((resolve) => {
    const w = docParseWorker()
    const onMessage = (event: MessageEvent<DocParseResponse>) => {
      if (event.data.key !== key) return
      w.removeEventListener('message', onMessage)
      resolve(event.data.result)
    }
    w.addEventListener('message', onMessage)
    file.arrayBuffer().then((bytes) => {
      const message: DocParseRequest = { key, bytes, mime, fileName: file.name }
      // 바이트를 넘기고 이쪽 참조를 버린다(같은 파일을 두 벌로 들고 있지 않는다).
      w.postMessage(message, [bytes])
    })
  })
}

/** 서버에 분석을 맡긴다(원장에 있는 자료 · 보류 링크). */
async function requestExtract(body: Record<string, unknown>): Promise<ExtractResponse> {
  const { data, error } = await supabase.functions.invoke<ExtractResponse>('startup-material-extract', { body })
  if (error) throw new Error(await readInvokeError(error, '자료를 분석하지 못했습니다.'))
  if (!data) throw new Error('분석 결과가 비어 있습니다.')
  return data
}

/**
 * 자료 한 건을 분석한다.
 *
 * 돌려주는 것은 **화면이 그대로 세울 수 있는 한 줄**이다. 실패도 값으로 답한다 — 던지면
 * 여러 건을 잇달아 분석할 때 한 건이 나머지를 멈춘다.
 */
export async function analyzeSource(source: AiSource, targetId?: string): Promise<LocalExtract> {
  const base = { targetId, parserVersion: PARSER_VERSION, fileName: source.name }

  if (source.kind === 'file') {
    const mime = resolveAiMime(source.file.type, source.name) ?? 'text/plain'
    const result = await parseInBrowser(source.key, source.file, mime)
    const record: AiExtractRecord = {
      status: result.status === 'ready' ? 'ready' : 'failed',
      parserVersion: PARSER_VERSION,
      summary: result.status === 'ready' ? result.summary : null,
      failedReason: result.status === 'ready' ? null : result.reason,
      analyzedAt: new Date().toISOString(),
    }
    // 등록 모드는 저장할 자리가 없다. 서버에 물어볼 것도 없으므로 요청을 아예 만들지 않는다.
    return { record, body: result.status === 'ready' ? result.body : undefined }
  }

  const payload =
    source.kind === 'link'
      ? { ...base, source: 'link', url: source.url, mime: '', byteSize: 0 }
      : {
          ...base,
          source: source.url ? 'link' : 'file',
          attachmentId: source.id,
          url: source.url,
          mime: resolveAiMime(source.contentType, source.name) ?? '',
          byteSize: source.bytes ?? 0,
        }

  const res = await requestExtract(payload)
  return {
    record: {
      status: res.status,
      parserVersion: PARSER_VERSION,
      summary: res.summary,
      failedReason: res.reason,
      analyzedAt: res.analyzedAt,
    },
    body: res.body ?? undefined,
  }
}
