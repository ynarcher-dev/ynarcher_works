import { Badge, Button, Checkbox, Input, Modal, Select, TextArea, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  MODULE_PARTICIPATION,
  MODULE_TYPES,
  MODULE_VISIBILITY_OPTIONS,
  PARTICIPATION_MODE_LABEL,
} from '@/features/program/config'
import type { Program, ProgramModule } from '@/features/program/hooks'
import { useSetProgramModule } from '@/features/program/hooks'
import { MODULE_META, MODULE_STATUS_META, readModuleSettings } from '@/features/program/detail/moduleMeta'
import { isCompleteRange, moduleWithin, type CompleteRange } from '@/features/program/programPeriods'

interface FormValues {
  title: string
  status: string
  visibility: string
  /** 매칭 모듈에서만 선택 입력. 그 외는 서버가 템플릿 기본값으로 강제한다. */
  participation_mode: string
  start_date: string
  end_date: string
  memo: string
}

/** 제목 정규화(앞뒤 공백 제거 + 소문자) — 프로그램 내 모듈명 중복 판정 기준(서버와 동일). */
const normTitle = (s: string) => s.trim().toLowerCase()

const labelOf = (type: string) => MODULE_TYPES.find((d) => d.type === type)?.label ?? type

function periodLabel(r: CompleteRange): string {
  return `${r.start} ~ ${r.end}`
}

/**
 * 운영 모듈 인스턴스 생성/수정 폼(2단계 마법사의 2단계 겸 편집 모달).
 * 모듈명(자율 입력·프로그램 내 중복 금지) · 상태 · 공유 범위 · 일정 · 담당자(풀에서 다중) · 설명을 입력하고,
 * set_program_module RPC로 인스턴스와 담당자를 원자적으로 저장한다.
 */
export function ModuleFormModal({
  program,
  moduleType,
  module,
  existingTitles,
  onClose,
  onSaved,
}: {
  program: Program
  /** 배치할(또는 편집 중인) 템플릿 타입. */
  moduleType: string
  /** 편집 대상 인스턴스(신규 생성이면 undefined). */
  module?: ProgramModule
  /** 같은 프로그램의 다른 인스턴스 모듈명(정규화 전 원본). 자기 자신은 제외해 전달한다. */
  existingTitles: string[]
  onClose: () => void
  onSaved?: (moduleId: string) => void
}) {
  const toast = useToast()
  const save = useSetProgramModule(program.id)
  const isEdit = Boolean(module)

  // 모듈 기간이 들어갈 수 있는 구간: 제안 기간·운영 기간 중 완전 구간만 후보.
  const allowedRanges = useMemo<CompleteRange[]>(() => {
    const ranges: (CompleteRange | null)[] = [
      isCompleteRange({ start: program.proposal_start_date, end: program.proposal_end_date })
        ? { start: program.proposal_start_date!, end: program.proposal_end_date! }
        : null,
      isCompleteRange({ start: program.start_date, end: program.end_date })
        ? { start: program.start_date!, end: program.end_date! }
        : null,
    ]
    return ranges.filter((r): r is CompleteRange => r !== null)
  }, [program])
  const proposalRange = allowedRanges[0]?.start === program.proposal_start_date ? allowedRanges[0] : null

  // 담당자 풀: 프로그램 담당자(program_managers)를 user_id로 중복 제거.
  const pool = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of program.managers ?? []) {
      if (m.user_id && !seen.has(m.user_id)) seen.set(m.user_id, m.user?.name ?? '이름 미상')
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [program.managers])

  const [assignees, setAssignees] = useState<string[]>(
    () => (module?.assignees ?? []).map((a) => a.user_id),
  )
  const toggleAssignee = (id: string) =>
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const settings = readModuleSettings(module?.settings)
  const modePolicy = MODULE_PARTICIPATION[moduleType]
  const fixedMode = modePolicy?.default ?? null
  const takenTitles = useMemo(() => new Set(existingTitles.map(normTitle)), [existingTitles])

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: module?.title ?? '',
      status: module?.status ?? 'DRAFT',
      visibility: module?.visibility || 'INTERNAL_ONLY',
      participation_mode: module?.participation_mode ?? fixedMode ?? '',
      start_date: settings.start_date ?? '',
      end_date: settings.end_date ?? '',
      memo: settings.memo ?? '',
    },
  })

  const titleValue = watch('title')
  const dupTitle = titleValue.trim().length > 0 && takenTitles.has(normTitle(titleValue))

  const onSubmit = async (values: FormValues) => {
    const title = values.title.trim()
    if (!title) {
      toast.show('모듈명을 입력하세요.', 'warning')
      return
    }
    if (takenTitles.has(normTitle(title))) {
      toast.show('이미 같은 이름의 모듈이 있습니다.', 'warning')
      return
    }
    if (!values.start_date || !values.end_date) {
      toast.show('일정(시작일·종료일)을 반드시 설정하세요.', 'warning')
      return
    }
    if (values.start_date > values.end_date) {
      toast.show('종료일은 시작일 이후여야 합니다.', 'warning')
      return
    }
    if (assignees.length === 0) {
      toast.show(
        pool.length === 0
          ? '먼저 개요에서 사업 담당자를 배정한 뒤 담당자를 지정하세요.'
          : '담당자를 최소 한 명 이상 지정하세요.',
        'warning',
      )
      return
    }
    if (
      (values.start_date || values.end_date) &&
      allowedRanges.length > 0 &&
      !allowedRanges.some((r) => moduleWithin(r, values.start_date, values.end_date))
    ) {
      toast.show('모듈 기간은 제안 기간 또는 운영 기간 내에서만 설정할 수 있습니다.', 'warning')
      return
    }
    // 선택형(매칭)만 폼 값을 쓰고, 나머지는 서버가 템플릿 기본값으로 강제(null 전송).
    const participationMode = modePolicy?.options ? values.participation_mode || fixedMode : null
    try {
      const id = await save.mutateAsync({
        moduleId: module?.id ?? null,
        moduleType,
        title,
        status: values.status,
        visibility: values.visibility,
        participationMode,
        settings: {
          ...(module?.settings ?? {}),
          start_date: values.start_date || undefined,
          end_date: values.end_date || undefined,
          memo: values.memo || undefined,
        },
        assigneeUserIds: assignees,
      })
      toast.show(isEdit ? '모듈 설정을 저장했습니다.' : '모듈을 추가했습니다.', 'success')
      onSaved?.(id)
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한과 입력값을 확인하세요.', 'danger')
    }
  }

  const operationRange = allowedRanges.find((r) => r !== proposalRange) ?? null
  const Icon = MODULE_META[moduleType]?.icon

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `${module?.title || labelOf(moduleType)} 설정` : '모듈 세팅'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting || save.isPending}>
            {isEdit ? '저장' : '추가'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {/* 파생 템플릿 배지 — 어느 템플릿에서 나온 인스턴스인지 항상 표기. */}
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-600">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <span className="text-caption text-gray-500">템플릿</span>
          <Badge tone="neutral" size="sm">
            {labelOf(moduleType)}
          </Badge>
        </div>

        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="mod-title">
            모듈명
          </label>
          <Input
            id="mod-title"
            placeholder={`예: 1차 ${labelOf(moduleType)}`}
            {...register('title')}
          />
          {dupTitle && (
            <p className="mt-1 text-caption text-brand">이미 같은 이름의 모듈이 있습니다.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-status">
              상태
            </label>
            <Select id="mod-status" {...register('status')}>
              {Object.entries(MODULE_STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-visibility">
              공유 범위
            </label>
            <Select id="mod-visibility" {...register('visibility')}>
              {MODULE_VISIBILITY_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {modePolicy?.options && (
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-mode">
              배정 방식
            </label>
            <Select id="mod-mode" {...register('participation_mode')}>
              {modePolicy.options.map((m) => (
                <option key={m} value={m}>
                  {PARTICIPATION_MODE_LABEL[m] ?? m}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-start">
              시작일 <span className="text-brand">*</span>
            </label>
            <Input id="mod-start" type="date" {...register('start_date')} />
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-end">
              종료일 <span className="text-brand">*</span>
            </label>
            <Input id="mod-end" type="date" {...register('end_date')} />
          </div>
          {allowedRanges.length > 0 && (
            <p className="col-span-2 text-caption text-gray-400">
              모듈 기간은 다음 범위 안에서만 설정할 수 있습니다 —{' '}
              {proposalRange && <>제안 {periodLabel(proposalRange)}</>}
              {proposalRange && operationRange && ' · '}
              {operationRange && <>운영 {periodLabel(operationRange)}</>}
            </p>
          )}
        </div>

        <div>
          <span className="text-body font-medium text-gray-800">
            담당자 <span className="text-brand">*</span>
          </span>
          {pool.length === 0 ? (
            <p className="mt-1 rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-caption text-gray-500">
              사업 담당자 풀이 비어 있습니다. 개요에서 담당자를 먼저 배정하세요.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {pool.map((p) => {
                const on = assignees.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-radius-md border px-3 py-1.5 text-body transition-colors duration-fast ${
                      on
                        ? 'border-brand/40 bg-brand-25 text-gray-900'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-25'
                    }`}
                  >
                    <Checkbox checked={on} onChange={() => toggleAssignee(p.id)} />
                    {p.name}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="mod-memo">
            설명
          </label>
          <TextArea
            id="mod-memo"
            rows={3}
            placeholder="카드에 표시할 운영 메모"
            {...register('memo')}
          />
        </div>
      </form>
    </Modal>
  )
}
