import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getEnv } from '@/lib/env'
import { anonHeaders, functionsBase } from '@/lib/supabase'

type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file' | 'consent'

interface Field {
  id: string
  field_type: FieldType
  label: string
  is_required: boolean
  options: string[]
  file_constraints: { accept?: string; max_mb?: number }
  sort_order: number
}

interface Landing {
  landing_title?: string
  poster_path?: string
  overview?: string
  schedule?: string
  target?: string
  doc_guide?: string
  privacy_consent_text?: string
  contact?: string
}

interface FormPayload {
  title: string
  landing: Landing
  fields: Field[]
}

type State =
  | { kind: 'loading' }
  | { kind: 'closed' }
  | { kind: 'notfound' }
  | { kind: 'ok'; form: FormPayload }
  | { kind: 'done' }

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-body text-gray-900 outline-none focus:border-brand'

/** 공개 버킷 포스터 경로 → 공개 URL. */
function posterUrl(path?: string): string | null {
  if (!path) return null
  return `${getEnv().VITE_SUPABASE_URL}/storage/v1/object/public/program-posters/${path}`
}

/** File → base64(데이터 URL 접두 제거). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const res = String(r.result)
      resolve(res.slice(res.indexOf(',') + 1))
    }
    r.onerror = () => reject(new Error('read_failed'))
    r.readAsDataURL(file)
  })
}

/** 장문 랜딩 섹션(있을 때만 렌더). */
function Section({ title, body }: { title: string; body?: string }) {
  if (!body || !body.trim()) return null
  return (
    <section className="mt-5">
      <h2 className="text-body font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 whitespace-pre-wrap text-body text-gray-700">{body}</p>
    </section>
  )
}

/**
 * 공개 신청 랜딩·접수 페이지(/apply/:token). 인증 불필요.
 * application-form-get으로 폼을 받아 렌더하고, application-submit으로 접수한다.
 */
export function ApplyPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [values, setValues] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Record<string, File>>({})
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${functionsBase}/application-form-get`, {
          method: 'POST',
          headers: anonHeaders,
          body: JSON.stringify({ token }),
        })
        if (!alive) return
        if (res.status === 403) return setState({ kind: 'closed' })
        if (!res.ok) return setState({ kind: 'notfound' })
        const form = (await res.json()) as FormPayload
        setState({ kind: 'ok', form })
      } catch {
        if (alive) setState({ kind: 'notfound' })
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [token])

  const form = state.kind === 'ok' ? state.form : null
  // 동의 필드(없으면 가상 동의 1개로 대체) — 전부 체크해야 제출 가능.
  const consentFields = useMemo<Field[]>(() => {
    const real = (form?.fields ?? []).filter((f) => f.field_type === 'consent')
    if (real.length > 0) return real
    return [
      {
        id: '__consent__',
        field_type: 'consent',
        label: '개인정보 수집·이용에 동의합니다.',
        is_required: true,
        options: [],
        file_constraints: {},
        sort_order: 999,
      },
    ]
  }, [form])

  if (state.kind === 'loading') return <Centered>불러오는 중…</Centered>
  if (state.kind === 'notfound')
    return <Centered title="찾을 수 없는 신청서입니다">링크가 올바른지 확인하세요.</Centered>
  if (state.kind === 'closed')
    return <Centered title="현재 모집 중이 아닙니다">모집 기간이 아니거나 마감되었습니다.</Centered>
  if (state.kind === 'done')
    return (
      <Centered title="신청이 접수되었습니다">
        제출해 주셔서 감사합니다. 심사 결과는 담당자가 개별 안내드립니다.
      </Centered>
    )

  const { landing, fields } = form!
  const inputFields = fields.filter((f) => f.field_type !== 'consent')
  const allConsented = consentFields.every((c) => consents[c.id])

  const onSubmit = async () => {
    setError(null)
    for (const f of inputFields) {
      if (!f.is_required) continue
      if (f.field_type === 'file' ? !files[f.id] : !(values[f.id] ?? '').trim()) {
        setError(`필수 항목을 입력하세요: ${f.label}`)
        return
      }
    }
    if (!allConsented) {
      setError('개인정보 수집·이용에 동의해야 신청할 수 있습니다.')
      return
    }
    setSubmitting(true)
    try {
      const fileItems = await Promise.all(
        Object.entries(files).map(async ([field_id, file]) => ({
          field_id,
          file_name: file.name,
          content_type: file.type,
          data_base64: await fileToBase64(file),
        })),
      )
      const answers = [
        ...inputFields
          .filter((f) => f.field_type !== 'file')
          .map((f) => ({ field_id: f.id, value: values[f.id] ?? '' })),
        // 실제 동의 필드는 접수 기록으로 남긴다(가상 동의는 제외).
        ...consentFields
          .filter((c) => c.id !== '__consent__')
          .map((c) => ({ field_id: c.id, value: '동의' })),
      ]
      const res = await fetch(`${functionsBase}/application-submit`, {
        method: 'POST',
        headers: anonHeaders,
        body: JSON.stringify({ token, consent: true, answers, files: fileItems }),
      })
      if (!res.ok) throw new Error('submit_failed')
      setState({ kind: 'done' })
    } catch {
      setError('제출에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const poster = posterUrl(landing.poster_path)

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-title-md font-bold text-gray-900">{landing.landing_title || form!.title}</h1>
      {poster && (
        <img src={poster} alt="모집 포스터" className="mt-4 w-full rounded-lg border border-gray-200" />
      )}
      <Section title="모집 개요" body={landing.overview} />
      <Section title="모집/사업 일정" body={landing.schedule} />
      <Section title="지원 대상" body={landing.target} />
      <Section title="제출 서류 안내" body={landing.doc_guide} />

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-title-sm font-bold text-gray-900">신청서 작성</h2>
        <div className="mt-4 space-y-4">
          {inputFields.map((f) => (
            <div key={f.id}>
              <label className="text-body font-medium text-gray-800" htmlFor={`f-${f.id}`}>
                {f.label}
                {f.is_required && <span className="text-danger"> *</span>}
              </label>
              <div className="mt-1">
                {f.field_type === 'textarea' ? (
                  <textarea
                    id={`f-${f.id}`}
                    rows={3}
                    className={inputClass}
                    value={values[f.id] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  />
                ) : f.field_type === 'select' ? (
                  <select
                    id={`f-${f.id}`}
                    className={inputClass}
                    value={values[f.id] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  >
                    <option value="">선택하세요</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.field_type === 'file' ? (
                  <input
                    id={`f-${f.id}`}
                    type="file"
                    accept={f.file_constraints.accept}
                    className="text-body text-gray-700"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      setFiles((prev) => {
                        const next = { ...prev }
                        if (file) next[f.id] = file
                        else delete next[f.id]
                        return next
                      })
                    }}
                  />
                ) : (
                  <input
                    id={`f-${f.id}`}
                    type={f.field_type === 'email' ? 'email' : f.field_type === 'tel' ? 'tel' : 'text'}
                    className={inputClass}
                    value={values[f.id] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 개인정보 동의 */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-25 p-4">
          {landing.privacy_consent_text && (
            <p className="whitespace-pre-wrap text-caption text-gray-600">
              {landing.privacy_consent_text}
            </p>
          )}
          <div className="mt-3 space-y-2">
            {consentFields.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-body text-gray-800">
                <input
                  type="checkbox"
                  checked={consents[c.id] ?? false}
                  onChange={(e) => setConsents((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                />
                {c.label}
                {c.is_required && <span className="text-danger">*</span>}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 text-caption text-danger">{error}</p>}

        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="mt-5 w-full rounded bg-brand px-4 py-2.5 text-body font-medium text-white transition-colors duration-fast hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? '제출 중…' : '신청서 제출'}
        </button>

        {landing.contact && (
          <p className="mt-6 whitespace-pre-wrap text-center text-caption text-gray-400">
            문의: {landing.contact}
          </p>
        )}
      </div>
    </main>
  )
}

/** 중앙 정렬 안내 화면(로딩/에러/완료 공통). */
function Centered({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      {title && <p className="text-title-sm font-bold text-gray-900">{title}</p>}
      <p className="mt-2 text-body text-gray-500">{children}</p>
    </main>
  )
}
