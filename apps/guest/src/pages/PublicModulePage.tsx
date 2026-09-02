import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'
import { anonHeaders, functionsBase } from '@/lib/supabase'

/**
 * 모듈 공개 링크 열람 페이지(/p/:token). 인증 불필요.
 *
 * 셸 밖의 격리 뷰포트다 — 사이드바·전역 검색·프로필이 없고, **이 메뉴 하나만** 보인다.
 * 같은 사업의 다른 메뉴·참가자 명부·내부 메모는 서버 응답에 애초에 실리지 않는다.
 *
 * 여기 들어온 사람은 게스트가 아니다(세션도 사업 고정 코드도 없다). 같은 메뉴를 참여기업은
 * 로그인해서, 그 밖의 사람은 이 주소로 볼 뿐이며 두 경로는 서로를 전제하지 않는다.
 *
 * 닫힌 이유는 뭉뚱그리지 않는다 — 주소가 틀린 것과 아직 안 열린 것과 마감된 것은 다른
 * 사실이고, 열람자는 자기 잘못인지부터 알아야 한다.
 * 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §5.3
 */

type DenyReason = 'not_found' | 'private' | 'scheduled' | 'closed' | 'module_closed'

interface PostItem {
  id: string
  title: string
  body: string | null
  activity_date: string | null
  created_at: string
}
interface LinkItem {
  id: string
  label: string
  url: string
  description: string | null
}
interface FileItem {
  id: string
  file_name: string
  label: string | null
  description: string | null
  byte_size: number | null
}

interface Payload {
  program: { title: string }
  module: {
    type: 'POST' | 'LINK' | 'FILE'
    title: string | null
    start_date: string | null
    end_date: string | null
    memo: string | null
  }
  contact: string | null
  open_at: string | null
  close_at: string | null
  content: { posts?: PostItem[]; links?: LinkItem[]; files?: FileItem[] }
}

type State =
  | { kind: 'loading' }
  | { kind: 'deny'; reason: DenyReason; openAt?: string | null; closeAt?: string | null }
  | { kind: 'ok'; payload: Payload }

function fmtDateTime(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtSize(bytes: number | null): string {
  if (!bytes || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

function Centered({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      {title && <p className="text-title-sm font-bold text-gray-900">{title}</p>}
      {children && <p className="mt-2 text-body text-gray-600">{children}</p>}
    </main>
  )
}

export function PublicModulePage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busyFile, setBusyFile] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${functionsBase}/public-module-get`, {
          method: 'POST',
          headers: anonHeaders,
          body: JSON.stringify({ token }),
        })
        if (!alive) return
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            reason?: DenyReason
            open_at?: string | null
            close_at?: string | null
          }
          return setState({
            kind: 'deny',
            reason: body.reason ?? 'not_found',
            openAt: body.open_at,
            closeAt: body.close_at,
          })
        }
        setState({ kind: 'ok', payload: (await res.json()) as Payload })
      } catch {
        if (alive) setState({ kind: 'deny', reason: 'not_found' })
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [token])

  const download = async (fileId: string) => {
    setBusyFile(fileId)
    try {
      const res = await fetch(`${functionsBase}/public-module-file`, {
        method: 'POST',
        headers: anonHeaders,
        body: JSON.stringify({ token, attachmentId: fileId }),
      })
      if (!res.ok) throw new Error('failed')
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch {
      // 링크가 그사이 닫혔을 수 있다 — 화면을 갈아 끼우지 않고 다시 열어 보게 한다.
      window.alert('파일을 내려받지 못했습니다. 링크가 닫혔을 수 있습니다.')
    } finally {
      setBusyFile(null)
    }
  }

  if (state.kind === 'loading') return <Centered>불러오는 중…</Centered>

  if (state.kind === 'deny') {
    if (state.reason === 'not_found')
      return <Centered title="주소가 올바르지 않습니다">링크를 다시 확인해 주세요.</Centered>
    if (state.reason === 'scheduled' && state.openAt)
      return (
        <Centered title="아직 열리지 않았습니다">
          {fmtDateTime(state.openAt)}부터 볼 수 있습니다.
        </Centered>
      )
    if (state.reason === 'closed')
      return (
        <Centered title="마감되었습니다">
          {state.closeAt ? `${fmtDateTime(state.closeAt)}에 마감되었습니다.` : undefined}
        </Centered>
      )
    return <Centered title="열려 있지 않은 메뉴입니다">담당자에게 문의해 주세요.</Centered>
  }

  const { program, module: mod, contact, content } = state.payload
  const period = [mod.start_date, mod.end_date].filter(Boolean).join(' ~ ')

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 py-10">
      <p className="text-caption text-gray-500">{program.title}</p>
      <h1 className="mt-1 text-title-sm font-bold text-gray-900">{mod.title ?? '공유된 메뉴'}</h1>
      {period && <p className="mt-1 text-caption tabular-nums text-gray-600">{period}</p>}
      {mod.memo && <p className="mt-3 whitespace-pre-wrap text-body text-gray-700">{mod.memo}</p>}

      <div className="mt-6 border-t border-gray-200 pt-6">
        {mod.type === 'POST' && (
          <div className="space-y-6">
            {(content.posts ?? []).length === 0 && (
              <p className="text-body text-gray-500">아직 등록된 글이 없습니다.</p>
            )}
            {(content.posts ?? []).map((p) => (
              <article key={p.id}>
                <h2 className="text-body font-semibold text-gray-900">{p.title}</h2>
                <p className="mt-0.5 text-caption tabular-nums text-gray-500">
                  {p.activity_date ?? p.created_at.slice(0, 10)}
                </p>
                {/* 본문은 담당자가 사내 에디터로 쓴 리치텍스트지만, 여기는 인증 없는 입구라
                    게스트 화면과 같은 정화기를 반드시 거친다(script·iframe·이벤트 속성 제거). */}
                <div
                  className={`mt-2 ${RICH_BODY_CLASS}`}
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(p.body) }}
                />
              </article>
            ))}
          </div>
        )}

        {mod.type === 'LINK' && (
          <ul className="space-y-2">
            {(content.links ?? []).length === 0 && (
              <p className="text-body text-gray-500">아직 등록된 링크가 없습니다.</p>
            )}
            {(content.links ?? []).map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-radius-sm border border-gray-200 px-4 py-3 hover:border-brand"
                >
                  <span className="text-body font-medium text-gray-900">{l.label}</span>
                  {l.description && (
                    <span className="mt-0.5 block text-caption text-gray-600">{l.description}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}

        {mod.type === 'FILE' && (
          <ul className="space-y-2">
            {(content.files ?? []).length === 0 && (
              <p className="text-body text-gray-500">아직 등록된 파일이 없습니다.</p>
            )}
            {(content.files ?? []).map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-radius-sm border border-gray-200 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-gray-900">
                    {f.label?.trim() || f.file_name}
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-gray-600">
                    {[f.description, fmtSize(f.byte_size)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busyFile === f.id}
                  onClick={() => void download(f.id)}
                  className="shrink-0 rounded-radius-sm border border-gray-300 px-3 py-1.5 text-caption text-gray-800 hover:border-brand disabled:opacity-60"
                >
                  {busyFile === f.id ? '준비 중…' : '내려받기'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {contact && (
        <p className="mt-8 border-t border-gray-200 pt-4 text-caption text-gray-600">
          문의: {contact}
        </p>
      )}
    </main>
  )
}
