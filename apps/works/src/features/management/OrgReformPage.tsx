import {
  BackButton,
  Button,
  Card,
  DetailTopBar,
  InfoField,
  InfoGrid,
  Modal,
  Spinner,
  useToast,
} from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  activeOrgVersionId,
  useCloneOrgVersion,
  useOrgDraftVersions,
  useOrgVersions,
  useUpdateOrgVersion,
} from '@/features/management/hooks'
import { OrgDraftFields } from '@/features/management/panels/OrgDraftFields'
import {
  OrgReformStructure,
  type OrgReformStructureHandle,
} from '@/features/management/OrgReformStructure'

/** 조직 관리 목록 경로(뒤로가기 목적지). */
const LIST_PATH = '/management?tab=departments'
/** 새 조직 시작 가능한 최소일 = 내일. 오늘·과거는 선택/저장 불가(자정 넘어가면 발효). */
const TOMORROW = () => dayjs().add(1, 'day').format('YYYY-MM-DD')
/** 새 조직 시작 전일 = 현재 조직 종료일(핸드오프). */
const dayBefore = (d: string) => dayjs(d).subtract(1, 'day').format('YYYY-MM-DD')
/** 운영 일수: 시작일 당일을 1일째로 센다(현재 조직이 며칠째 운영 중인지). */
const operatingDays = (from: string) =>
  dayjs().startOf('day').diff(dayjs(from).startOf('day'), 'day') + 1

/**
 * 조직 개편 페이지 — 현재 운영 조직을 복제한 초안(DRAFT) 버전 위에서 새 조직을 설계한다.
 *
 * 모달이 아니라 페이지인 이유: 초안은 생성 즉시 서버에 남고 구조 편집도 즉시 저장되는데,
 * 모달은 닫히면 초안을 폐기해 설계가 통째로 사라졌다. 페이지에서는 나갔다 돌아와도
 * `?draft=<id>`(없으면 최근 초안)로 이어서 편집한다. 폐기는 명시적으로 눌러야만 일어난다.
 */
export function OrgReformPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const { data: versionRows, isLoading: versionLoading } = useOrgVersions()
  const { data: draftRows, isLoading: draftLoading } = useOrgDraftVersions()
  const versions = useMemo(() => versionRows ?? [], [versionRows])
  const drafts = useMemo(() => draftRows ?? [], [draftRows])
  const activeVersionId = useMemo(() => activeOrgVersionId(versions), [versions])
  const active = versions.find((v) => v.id === activeVersionId) ?? null

  // 대상 초안: URL 지정 > 최근 초안. 이미 폐기된 id가 URL에 남아 있으면 최근 초안으로 흘린다.
  const draft = drafts.find((d) => d.id === params.get('draft')) ?? drafts[0] ?? null

  const cloneVersion = useCloneOrgVersion()
  const updateVersion = useUpdateOrgVersion()
  const editorRef = useRef<OrgReformStructureHandle>(null)

  const [label, setLabel] = useState('')
  const [from, setFrom] = useState(TOMORROW())
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const draftId = draft?.id ?? null
  // 초안 전환(또는 최초 로드) 시 입력값을 서버 값으로 맞춘다. 초안이 없으면 생성 폼 기본값.
  useEffect(() => {
    if (draft) {
      setLabel(draft.label)
      setFrom(draft.effective_from)
      setTo(draft.effective_to ?? '')
    } else {
      setLabel(active ? `${active.label} 개편안` : '새 조직')
      setFrom(TOMORROW())
      setTo('')
    }
    setError(null)
    // 값 자체가 아니라 "어떤 초안을 보고 있는가"가 바뀔 때만 입력을 리셋한다.
  }, [draftId, active?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 초안 가용기간·이름은 입력 확정 즉시 서버에 반영한다(페이지를 떠나도 남게). */
  const commit = async (values: Record<string, unknown>) => {
    if (!draft) return
    try {
      await updateVersion.mutateAsync({ id: draft.id, values })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '초안 저장에 실패했습니다.', 'danger')
    }
  }

  /** 이름·날짜 검증(초안 생성·예약 공용). 통과 시 null. */
  const validate = (): string | null => {
    if (!label.trim()) return '새 조직 이름을 입력하세요.'
    if (!from) return '새 조직 시작일을 입력하세요.'
    if (from < TOMORROW()) return '새 조직 시작일은 내일 이후여야 합니다(오늘·과거 불가).'
    if (to && to <= from) return '종료 예정일은 시작일보다 뒤여야 합니다.'
    return null
  }

  /** 초안 생성: 현재 조직을 DRAFT 버전으로 복제하고 URL에 고정한다. */
  const startDraft = async () => {
    const err = validate()
    if (err || !active) return setError(err)
    setError(null)
    setBusy(true)
    try {
      const newId = await cloneVersion.mutateAsync({
        srcVersionId: active.id,
        label: label.trim(),
        effectiveFrom: from,
        effectiveTo: to || null,
      })
      setParams({ draft: newId }, { replace: true })
    } catch (e) {
      // 살아있는 초안은 원장에서 한 건으로 강제된다(org_versions_single_live_draft).
      // 다른 탭에서 먼저 만들었을 때만 걸리는 경로라 DB 원문 대신 할 일을 적는다.
      const raw = e instanceof Error ? e.message : ''
      setError(
        raw.includes('org_versions_single_live_draft')
          ? '이미 설계 중인 개편 초안이 있습니다. 기존 초안을 이어서 설계하거나 폐기한 뒤 다시 시도하세요.'
          : raw || '초안 생성에 실패했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }

  /** 구조 저장: 조직명·레벨명처럼 화면에만 반영된 편집분을 서버에 밀어 넣는다. */
  const saveStructure = async () => {
    setBusy(true)
    try {
      await editorRef.current?.save()
      toast.show('설계 내용을 저장했습니다.', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  /** 예약하기: 초안을 PUBLISHED로 확정하고 현재 조직 종료일을 새 조직 시작 전일로 맞춘다. */
  const reserve = async () => {
    if (!draft) return
    const err = validate()
    if (err) return setError(err)
    setError(null)
    setBusy(true)
    try {
      await editorRef.current?.save()
      await updateVersion.mutateAsync({
        id: draft.id,
        values: {
          label: label.trim(),
          status: 'PUBLISHED',
          effective_from: from,
          effective_to: to || null,
        },
      })
      if (active) {
        await updateVersion.mutateAsync({ id: active.id, values: { effective_to: dayBefore(from) } })
      }
      toast.show('조직 개편을 예약했습니다.', 'success')
      navigate(LIST_PATH)
    } catch (e) {
      setError(e instanceof Error ? e.message : '예약에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 초안 폐기: 설계한 초안을 통째로 되돌린다(soft delete). */
  const discard = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await updateVersion.mutateAsync({
        id: draft.id,
        values: { deleted_at: new Date().toISOString() },
      })
      setDiscardOpen(false)
      navigate(LIST_PATH)
    } catch (e) {
      setError(e instanceof Error ? e.message : '초안 폐기에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if ((versionLoading && !versionRows) || (draftLoading && !draftRows)) return <Spinner />

  return (
    <div className="space-y-5">
      <DetailTopBar
        back={<BackButton as={Link} to={LIST_PATH} />}
        actions={
          draft ? (
            <>
              <Button variant="outline-danger" onClick={() => setDiscardOpen(true)} disabled={busy}>
                초안 폐기
              </Button>
              <Button variant="secondary" onClick={() => void saveStructure()} disabled={busy}>
                저장
              </Button>
              <Button onClick={() => void reserve()} disabled={busy}>
                {busy ? '처리 중…' : '예약하기'}
              </Button>
            </>
          ) : undefined
        }
      />

      <Card title="현재 운영 조직">
        {active ? (
          <InfoGrid columns={2}>
            <InfoField label="조직명" value={active.label} />
            <InfoField label="시작일" value={active.effective_from} />
            <InfoField label="종료일" value={active.effective_to ?? '미정'} />
            <InfoField label="운영 기간" value={`${operatingDays(active.effective_from)}일째`} />
          </InfoGrid>
        ) : (
          <p className="text-body text-gray-500">현재 운영 중인 조직이 없습니다.</p>
        )}
      </Card>

      <Card
        title="조직 개편"
        help={
          draft
            ? '설계 내용은 초안 버전에 저장되어, 페이지를 나갔다 돌아와도 이어서 편집할 수 있습니다.'
            : '현재 조직 구조를 복제해 새 조직을 설계합니다. 시작일·종료 예정일을 정하고 설계를 시작하세요.'
        }
      >
        <div className="space-y-3">
          <OrgDraftFields
            label={label}
            from={from}
            to={to}
            minDate={TOMORROW()}
            onLabelChange={setLabel}
            onLabelCommit={() => {
              const next = label.trim()
              if (next && next !== draft?.label) void commit({ label: next })
            }}
            onFromChange={(v) => {
              setFrom(v)
              if (v >= TOMORROW()) void commit({ effective_from: v })
            }}
            onToChange={(v) => {
              setTo(v)
              void commit({ effective_to: v || null })
            }}
          />

          {active && from >= TOMORROW() && (
            <p className="rounded-radius-md border border-info-border bg-info-subtle px-3 py-2 text-caption text-info">
              현재 조직 <span className="font-semibold">{active.label}</span> 은{' '}
              <span className="font-semibold tabular-nums">{dayBefore(from)}</span> 까지 운영되고, 새
              조직이 <span className="font-semibold tabular-nums">{from}</span> 자정부터
              발효·교대합니다.
            </p>
          )}
          {error && <p className="text-caption text-danger">{error}</p>}

          {!draft && (
            <div className="flex justify-end">
              <Button onClick={() => void startDraft()} disabled={busy || !active}>
                {busy ? '초안 생성 중…' : '구조 설계 시작'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {draft && (
        <Card
          title="새 조직 구조"
          help="왼쪽에서 조직을 만들고 이름·레벨을 정하고, 오른쪽에서 그 조직에 인력을 배치합니다."
        >
          <OrgReformStructure
            ref={editorRef}
            versionId={draft.id}
            activeVersionId={activeVersionId}
          />
        </Card>
      )}

      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        size="sm"
        title="조직 개편 초안 폐기"
        footer={
          <>
            <Button variant="outline" onClick={() => setDiscardOpen(false)} disabled={busy}>
              닫기
            </Button>
            <Button variant="danger" onClick={() => void discard()} disabled={busy}>
              {busy ? '폐기 중…' : '초안 폐기'}
            </Button>
          </>
        }
      >
        <p className="text-body text-gray-700">
          설계 중인 초안 <span className="font-semibold text-gray-900">{draft?.label}</span> 을
          폐기합니다. 지금까지의 구조 설계·인력 배치가 모두 사라지며, 현재 운영 중 조직에는 영향이
          없습니다.
        </p>
      </Modal>
    </div>
  )
}
