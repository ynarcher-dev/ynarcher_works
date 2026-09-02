import {
  Badge,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  TextArea,
  Tooltip,
  tooltipScale,
  useToast,
} from '@ynarcher/ui'
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
import { ModulePublicLinkFields } from '@/features/program/detail/ModulePublicLinkFields'
import { useModuleTemplateMap } from '@/features/program/moduleTemplateHooks'
import { useModulePublicLinkForm } from '@/features/program/detail/publicLinkForm'
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
  // 선택지의 상한은 ADMIN이 배치한 템플릿 카탈로그가 답한다(3_2_1). 화면이 목록을 따로 들면
  // ADMIN이 고친 상한이 여기만 안 바뀐다.
  const { map: templates } = useModuleTemplateMap()
  const template = templates.get(moduleType)
  // 링크 공유는 모듈 저장과 별개 축이라 상태·저장 경로가 따로다(버튼만 하나로 묶는다).
  //
  // 모집만 예외로 칸을 세우지 않는다 — 상한은 켜져 있지만(공개 주소가 그 템플릿의 존재
  // 이유다) 주소·상태·기간을 **모집 설정 패널이 이미 소유**하기 때문이다. 같은 스위치를 두
  // 곳에 두면 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가 없다. 담기는 원장은 이제 하나이되
  // (2026-09-02 이관), 만지는 자리는 그 모듈의 운영 화면 한 곳이다.
  const linkCardable = Boolean(template?.allow_public_link) && moduleType !== 'RECRUITMENT'
  const linkForm = useModulePublicLinkForm(module?.id, linkCardable)
  // 상한이 닫혀 있으면 WORKS ONLY 한 칸만 남는다. 서버는 모듈 원장 트리거가 같은 판정을 한다.
  const visibilityOptions = MODULE_VISIBILITY_OPTIONS.filter(
    (v) => v.value !== 'GUEST_ONLY' || template?.allow_guest !== false,
  )
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
      // 링크 공유는 별개 원장이라 저장도 뒤이어 따로 간다. 실패해도 모듈 저장은 이미 끝났으므로
      // 무엇이 반영되고 무엇이 안 됐는지를 문구로 가른다 — 한 문장으로 뭉치면 담당자가
      // 모듈 설정까지 다시 입력한다.
      try {
        await linkForm.apply()
      } catch {
        toast.show('모듈은 저장했지만 링크 공유 설정은 반영하지 못했습니다.', 'danger')
        onSaved?.(id)
        onClose()
        return
      }
      toast.show(isEdit ? '모듈 설정을 저장했습니다.' : '모듈을 추가했습니다.', 'success')
      onSaved?.(id)
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한과 입력값을 확인하세요.', 'danger')
    }
  }

  const operationRange = allowedRanges.find((r) => r !== proposalRange) ?? null
  // 허용 범위는 시작일·종료일 두 칸에 함께 걸리는 규칙이라 두 칸이 같은 문구를 나눠 갖는다.
  // 한 칸에만 달면 다른 칸을 채우다 막힌 사람은 규칙이 어디 적혀 있는지 찾지 못한다.
  const rangeHelp =
    allowedRanges.length === 0
      ? undefined
      : '모듈 기간은 다음 범위 안에서만 설정할 수 있습니다.\n' +
        [
          proposalRange && `제안 ${periodLabel(proposalRange)}`,
          operationRange && `운영 ${periodLabel(operationRange)}`,
        ]
          .filter(Boolean)
          .join('\n')
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
          <span className="text-caption text-gray-600">템플릿</span>
          <Badge tone="neutral">
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
              {visibilityOptions.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ModulePublicLinkFields form={linkForm} />

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
              <Tooltip label="시작일" content={rangeHelp} className={tooltipScale.gap} />
            </label>
            <Input id="mod-start" type="date" {...register('start_date')} />
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-end">
              종료일 <span className="text-brand">*</span>
              <Tooltip label="종료일" content={rangeHelp} className={tooltipScale.gap} />
            </label>
            <Input id="mod-end" type="date" {...register('end_date')} />
          </div>
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
                  <Checkbox
                    key={p.id}
                    boxed
                    checked={on}
                    onChange={() => toggleAssignee(p.id)}
                    label={p.name}
                  />
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
