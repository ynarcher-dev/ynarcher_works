import { Button, Input, Modal } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  useCloneOrgVersion,
  useUpdateOrgVersion,
  type OrgVersion,
} from '@/features/management/hooks'
import { OrgTreeEditor } from '@/features/management/panels/OrgTreeEditor'

interface OrgReformModalProps {
  open: boolean
  onClose: () => void
  versions: OrgVersion[]
  activeVersionId: string | null
}

const TODAY = () => new Date().toISOString().slice(0, 10)

/** 운영 일수: 시작일 당일을 1일째로 센다(현재 조직이 며칠째 운영 중인지). */
function operatingDays(from: string): number {
  return dayjs().startOf('day').diff(dayjs(from).startOf('day'), 'day') + 1
}

/**
 * 조직 개편 모달 — 현재 운영 조직 현황을 보여주고, 현재 구조를 초안(DRAFT) 버전으로 복제해
 * 새 조직을 설계한다. "예약하기"로 확정(PUBLISHED)하거나 "취소하기"로 초안을 폐기한다.
 * 초안 편집은 즉시 저장되지만 DRAFT라 어디에도 노출되지 않으며, 폐기 시 통째로 되돌릴 수 있다.
 */
export function OrgReformModal({ open, onClose, versions, activeVersionId }: OrgReformModalProps) {
  const active = versions.find((v) => v.id === activeVersionId) ?? null

  const cloneVersion = useCloneOrgVersion()
  const updateVersion = useUpdateOrgVersion()

  const [draftId, setDraftId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 모달을 열 때마다 초기화(현재 조직 종료일 다음 또는 오늘을 기본 시작일로).
  useEffect(() => {
    if (!open) return
    setDraftId(null)
    setError(null)
    setBusy(false)
    setLabel(active ? `${active.label} 개편안` : '새 조직')
    setFrom(active?.effective_to ?? TODAY())
    setTo('')
  }, [open, active])

  const resetAndClose = () => {
    setDraftId(null)
    onClose()
  }

  /** 초안 생성: 현재 조직을 복제 → 상태를 DRAFT로 낮춰 노출되지 않게 한다. */
  const startDraft = async () => {
    if (!active) return
    if (!label.trim()) return setError('버전 이름을 입력하세요.')
    if (!from) return setError('새 조직 시작일을 입력하세요.')
    if (to && to <= from) return setError('종료 예정일은 시작일보다 뒤여야 합니다.')
    setError(null)
    setBusy(true)
    try {
      const newId = await cloneVersion.mutateAsync({
        srcVersionId: active.id,
        label: label.trim(),
        effectiveFrom: from,
        effectiveTo: to || null,
      })
      await updateVersion.mutateAsync({ id: newId, values: { status: 'DRAFT' } })
      setDraftId(newId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '초안 생성에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 설계 중 날짜/이름 변경은 초안 버전에 바로 반영한다. */
  const patchDraft = (values: Partial<{ label: string; effective_from: string; effective_to: string | null }>) => {
    if (draftId) updateVersion.mutate({ id: draftId, values })
  }

  /** 예약하기: 초안을 PUBLISHED로 확정 → 가용기간 타임라인에 예정 버전으로 편입. */
  const reserve = async () => {
    if (!draftId) return
    if (to && to <= from) return setError('종료 예정일은 시작일보다 뒤여야 합니다.')
    setBusy(true)
    try {
      await updateVersion.mutateAsync({ id: draftId, values: { status: 'PUBLISHED' } })
      resetAndClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '예약에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 취소하기: 초안이 있으면 폐기(soft delete) 후 닫는다. 없으면 그냥 닫는다. */
  const cancel = async () => {
    if (!draftId) return resetAndClose()
    setBusy(true)
    try {
      await updateVersion.mutateAsync({
        id: draftId,
        values: { deleted_at: new Date().toISOString() },
      })
    } catch {
      // 폐기 실패해도 DRAFT라 노출되지 않으므로 조용히 닫는다.
    } finally {
      setBusy(false)
      resetAndClose()
    }
  }

  const footer = (
    <>
      <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
        취소하기
      </Button>
      <Button size="sm" onClick={reserve} disabled={busy || !draftId}>
        {busy && draftId ? '처리 중…' : '예약하기'}
      </Button>
    </>
  )

  return (
    <Modal open={open} onClose={cancel} size="lg" title="조직 개편" footer={footer}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        {/* 현재 운영 조직 현황 */}
        <section className="space-y-2">
          <h3 className="text-caption font-semibold text-gray-500">현재 운영 조직</h3>
          {active ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2.5 text-body sm:grid-cols-4">
              <div>
                <dt className="text-caption text-gray-400">조직명</dt>
                <dd className="font-semibold text-gray-800">{active.label}</dd>
              </div>
              <div>
                <dt className="text-caption text-gray-400">시작일</dt>
                <dd className="tabular-nums text-gray-700">{active.effective_from}</dd>
              </div>
              <div>
                <dt className="text-caption text-gray-400">종료일</dt>
                <dd className="tabular-nums text-gray-700">{active.effective_to ?? '미정'}</dd>
              </div>
              <div>
                <dt className="text-caption text-gray-400">운영 기간</dt>
                <dd className="font-semibold tabular-nums text-brand-700">
                  {operatingDays(active.effective_from)}일째
                </dd>
              </div>
            </dl>
          ) : (
            <p className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-3 text-body text-gray-400">
              현재 운영 중인 조직이 없습니다.
            </p>
          )}
        </section>

        <hr className="border-gray-200" />

        {/* 조직 개편 설계 */}
        <section className="space-y-3">
          <h3 className="text-caption font-semibold text-gray-500">조직 개편</h3>

          {!draftId ? (
            <>
              <p className="text-caption text-gray-500">
                현재 조직 구조를 복제해 새 조직을 설계합니다. 시작일·종료 예정일을 정하고 설계를
                시작하세요.
              </p>
              <label className="block space-y-1">
                <span className="text-caption font-semibold text-gray-600">새 조직 이름</span>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-caption font-semibold text-gray-600">시작일</span>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-caption font-semibold text-gray-600">
                    종료 예정일(비우면 무기한)
                  </span>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9"
                  />
                </label>
              </div>
              {error && <p className="text-caption text-danger">{error}</p>}
              <div className="flex justify-end">
                <Button size="sm" onClick={startDraft} disabled={busy || !active}>
                  {busy ? '초안 생성 중…' : '구조 설계 시작'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* 초안 가용기간(편집 가능) */}
              <div className="grid grid-cols-1 gap-2 rounded-radius-md border border-info-border bg-info-subtle px-3 py-2.5 sm:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-caption font-semibold text-gray-600">새 조직 이름</span>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={() => label.trim() && patchDraft({ label: label.trim() })}
                    className="h-9 bg-white"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-caption font-semibold text-gray-600">시작일</span>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value)
                      if (e.target.value) patchDraft({ effective_from: e.target.value })
                    }}
                    className="h-9 bg-white"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-caption font-semibold text-gray-600">
                    종료 예정일(비우면 무기한)
                  </span>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value)
                      patchDraft({ effective_to: e.target.value || null })
                    }}
                    className="h-9 bg-white"
                  />
                </label>
              </div>

              {/* 새 조직 구조 설계 — 조직관리와 동일 기능 */}
              <OrgTreeEditor versionId={draftId} activeVersionId={activeVersionId} editable />

              {error && <p className="text-caption text-danger">{error}</p>}
              <p className="text-caption text-gray-400">
                · '예약하기'를 누르면 이 조직이 예정 버전으로 확정됩니다. '취소하기'를 누르면 설계한
                초안이 폐기됩니다.
              </p>
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}
