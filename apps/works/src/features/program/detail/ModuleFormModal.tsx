import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  TextArea,
  TokenMultiSelect,
  useToast,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  MODULE_PARTICIPATION,
  MODULE_TYPES,
  MODULE_VISIBILITY_LABEL,
  moduleVisibilityOptions,
  PARTICIPATION_MODE_LABEL,
} from '@/features/program/config'
import type { Program, ProgramModule } from '@/features/program/hooks'
import { useSetProgramModule } from '@/features/program/hooks'
import {
  MODULE_META,
  MODULE_STATUS_META,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'
import { failureText } from '@/lib/failureText'
import { ModulePublicLinkFields } from '@/features/program/detail/ModulePublicLinkFields'
import { useModuleTemplateMap } from '@/features/program/moduleTemplateHooks'
import { useModulePublicLinkForm } from '@/features/program/detail/publicLinkForm'
import {
  isCompleteRange,
  moduleWithin,
  type CompleteRange,
} from '@/features/program/programPeriods'

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
  /**
   * 기간·담당자를 이 폼이 받지 않는 모듈(2026-09-09). 퀵리뷰는 담당자가 세팅한 배치물이 아니라
   * 연결된 매물을 비추는 거울이라, 두 칸의 답은 원장이 갖는다(퀵 리뷰의 작성일·작성자).
   *
   * **감추는 것이 아니라 받지 않는 것이 요점이다** — 칸을 세워 두면 담당자가 고칠 수 있고, 고친
   * 값은 화면에 서지 못한다(목록·운영 화면이 원장 값을 얹는다). 고쳐 봐야 아무 일도 일어나지
   * 않는 칸은 없는 편이 낫다. 그래서 저장할 때도 두 값을 함께 비운다.
   */
  const ledgerOwned = moduleType === 'QUICK_REVIEW'

  // 모듈 기간이 들어갈 수 있는 구간: 제안 기간·운영 기간 중 완전 구간만 후보.
  const allowedRanges = useMemo<CompleteRange[]>(() => {
    const ranges: (CompleteRange | null)[] = [
      isCompleteRange({
        start: program.proposal_start_date,
        end: program.proposal_end_date,
      })
        ? {
            start: program.proposal_start_date!,
            end: program.proposal_end_date!,
          }
        : null,
      isCompleteRange({ start: program.start_date, end: program.end_date })
        ? { start: program.start_date!, end: program.end_date! }
        : null,
    ]
    return ranges.filter((r): r is CompleteRange => r !== null)
  }, [program])
  const proposalRange =
    allowedRanges[0]?.start === program.proposal_start_date ? allowedRanges[0] : null

  // 담당자 풀: 프로그램 담당자(program_managers)를 user_id로 중복 제거.
  const pool = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of program.managers ?? []) {
      if (m.user_id && !seen.has(m.user_id)) seen.set(m.user_id, m.user?.name ?? '이름 미상')
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [program.managers])

  // 담당자는 사람만이 아니라 **그 사람이 이 모듈에서 하는 일**까지가 한 줄이다(2026-09-06).
  // 역할(PM·멤버)은 여기서 받지 않는다 — 사업 담당자 원장이 이미 아는 사실이라, 모듈마다 다시
  // 고르게 하면 같은 사람이 화면마다 다른 역할로 서게 된다.
  const [assignees, setAssignees] = useState<{ id: string; duty: string }[]>(() =>
    // 원장이 답하는 모듈에서는 들고 오지 않는다 — 목록이 얹어 준 작성자는 배정이 아니라 사실이라,
    // 이 폼이 그것을 자기 값으로 삼으면 저장하는 순간 사실이 배정으로 굳는다.
    ledgerOwned
      ? []
      : (module?.assignees ?? []).map((a) => ({
          id: a.user_id,
          duty: a.duty ?? '',
        })),
  )
  // 칩에 이름을 세우려면 id가 아니라 항목 자체를 들어야 한다(원장에서 빠진 사람은 '이름 미상').
  const nameOfUser = (id: string) => pool.find((p) => p.id === id)?.name ?? '이름 미상'
  const selectedAssignees = useMemo(
    () => assignees.map((a) => pool.find((p) => p.id === a.id) ?? { id: a.id, name: '이름 미상' }),
    [assignees, pool],
  )
  /** 사람 목록 변경(칩 추가·삭제). 이미 적어 둔 업무롤은 그대로 들고 간다. */
  const onChangeAssignees = (next: { id: string }[]) => {
    setAssignees((prev) =>
      next.map((n) => ({
        id: n.id,
        duty: prev.find((p) => p.id === n.id)?.duty ?? '',
      })),
    )
  }
  const setDuty = (id: string, duty: string) =>
    setAssignees((prev) => prev.map((a) => (a.id === id ? { ...a, duty } : a)))

  const settings = readModuleSettings(module?.settings)
  // 선택지의 상한은 ADMIN이 배치한 템플릿 카탈로그가 답한다(3_2_1). 화면이 목록을 따로 들면
  // ADMIN이 고친 상한이 여기만 안 바뀐다.
  const { map: templates } = useModuleTemplateMap()
  const template = templates.get(moduleType)
  // 링크 공유는 모듈 저장과 별개 원장이라 상태·저장 경로가 따로다(버튼만 하나로 묶는다).
  //
  // 모집만 예외로 칸을 세우지 않는다 — 성격은 PUBLIC_LINK이지만(공개 주소가 그 템플릿의 존재
  // 이유다) 주소·상태·기간을 **모집 설정 패널이 이미 소유**하기 때문이다. 같은 스위치를 두
  // 곳에 두면 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가 없다. 담기는 원장은 이제 하나이되
  // (2026-09-02 이관), 만지는 자리는 그 모듈의 운영 화면 한 곳이다.
  const linkCardable = template?.visibility === 'PUBLIC_LINK' && moduleType !== 'RECRUITMENT'
  const linkForm = useModulePublicLinkForm(module?.id, linkCardable)

  // 고를 수 있는 값은 ADMIN이 템플릿에 박은 성격이 정한다. 서버는 모듈 원장 트리거가 같은
  // 판정을 한다 — 화면에서 감추는 것은 보안이 아니다.
  const visibilityOptions = moduleVisibilityOptions(template?.visibility)
  const storedVisibility = module?.visibility || null
  // 값이 하나뿐이면 셀렉트로 두지 않는다(고를 것이 없는 셀렉트는 고를 수 있다고 말하는
  // 컨트롤이다). 저장값이 지금의 성격 밖이면 — ADMIN이 나중에 성격을 바꾼 경우 — **고쳐 쓰지
  // 않고 사실대로 보이되 고칠 수 없게** 둔다. 담당자가 설정한 적 없는 값이 원장에 남으면
  // 이력이 거짓말을 하고, 실제 노출은 어느 쪽이든 성격 축이 판정한다.
  const offTemplate = Boolean(
    storedVisibility && !visibilityOptions.some((v) => v.value === storedVisibility),
  )
  const visibilityFixed = visibilityOptions.length <= 1 || offTemplate
  const fixedVisibility = storedVisibility ?? visibilityOptions[0]?.value ?? 'INTERNAL_ONLY'
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
      // 같은 이유로 기간도 비워 시작한다(목록이 얹은 작성일이 폼의 초기값으로 굳지 않게 한다).
      start_date: ledgerOwned ? '' : (settings.start_date ?? ''),
      end_date: ledgerOwned ? '' : (settings.end_date ?? ''),
      memo: settings.memo ?? '',
    },
  })

  const titleValue = watch('title')
  // 링크 칸이 '기간을 비우면 어떻게 되는지'를 말하려면 지금 편집 중인 모듈 기간이 필요하다.
  const startValue = watch('start_date')
  const endValue = watch('end_date')
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
    if (!ledgerOwned && (!values.start_date || !values.end_date)) {
      toast.show('일정(시작일·종료일)을 반드시 설정하세요.', 'warning')
      return
    }
    if (values.start_date > values.end_date) {
      toast.show('종료일은 시작일 이후여야 합니다.', 'warning')
      return
    }
    if (!ledgerOwned && assignees.length === 0) {
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
        // 고를 수 없는 칸은 폼 값을 쓰지 않는다 — 셀렉트가 서지 않았으므로 폼에는 초기값이
        // 그대로 남아 있고, 그 값을 보내면 서버가 성격 밖 저장으로 거부한다.
        visibility: visibilityFixed ? fixedVisibility : values.visibility,
        participationMode,
        settings: {
          ...(module?.settings ?? {}),
          // 폼이 비운 값은 키째 빠진다(undefined는 직렬화에서 사라진다) — 목록이 얹어 준
          // 작성일이 이 저장에 실려 원장에 굳는 일을 여기서 막는다.
          start_date: values.start_date || undefined,
          end_date: values.end_date || undefined,
          memo: values.memo || undefined,
        },
        // 빈 업무롤은 빈 문자열이 아니라 null로 보낸다 — '안 적었다'와 '지웠다'가 원장에서
        // 같은 모양이어야 화면이 둘을 가르지 않는다(서버도 같은 규칙으로 접는다).
        assignees: assignees.map((a) => ({
          userId: a.id,
          duty: a.duty.trim() || null,
        })),
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
    } catch (e) {
      // 서버가 이유를 말해 준다(모듈명 중복·기간 범위·담당자 풀·권한). 일반 문구로 덮으면
      // 담당자는 같은 값을 다시 넣어 보는 것 말고 할 수 있는 일이 없다.
      toast.show(failureText(e, '저장에 실패했습니다. 권한과 입력값을 확인하세요.'), 'danger')
    }
  }

  const operationRange = allowedRanges.find((r) => r !== proposalRange) ?? null
  // 허용 범위는 시작일·종료일 두 칸에 함께 걸리는 규칙이라 칸이 아니라 그 둘을 담은 카드가
  // 갖는다(2026-09-06). 한 칸에만 달면 다른 칸을 채우다 막힌 사람은 규칙이 어디 적혀 있는지
  // 찾지 못하고, 두 칸에 같은 문구를 두 번 달면 같은 규칙이 둘로 읽힌다.
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
      dismissible={false}
      open
      onClose={onClose}
      sectioned
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
        <Card
          title="기본 정보"
          actions={
            /* 파생 템플릿 배지 — 어느 템플릿에서 나온 인스턴스인지 항상 표기. 값이 아니라 이
               카드가 무엇에 대한 것인지의 표기라 본문 첫 줄을 먹지 않고 제목 줄에 선다. */
            <span className="flex items-center gap-1.5">
              {Icon && <Icon className="size-4 shrink-0 text-gray-500" aria-hidden />}
              <Badge tone="neutral">{labelOf(moduleType)}</Badge>
            </span>
          }
        >
          <div className="space-y-3">
            <Field
              label="모듈명"
              error={dupTitle ? '이미 같은 이름의 모듈이 있습니다.' : undefined}
            >
              <Input placeholder={`예: 1차 ${labelOf(moduleType)}`} {...register('title')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="상태">
                <Select {...register('status')}>
                  {Object.entries(MODULE_STATUS_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {visibilityFixed ? (
                <Field
                  as="div"
                  label="공개 범위"
                  hintInline
                  /* 되읽기·차단 안내는 접지 않는다 — 왜 고를 수 없는지가 이 줄의 내용이다. */
                  hint={
                    offTemplate
                      ? `이 종류는 지금 ${
                          MODULE_VISIBILITY_LABEL[visibilityOptions[0]?.value ?? ''] ?? '다른 범위'
                        }만 씁니다. 저장된 값은 그대로 두되 노출은 종류의 성격이 정합니다.`
                      : '이 종류의 공개 범위는 ADMIN 모듈 관리가 정합니다.'
                  }
                >
                  <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-body text-gray-700">
                    {MODULE_VISIBILITY_LABEL[fixedVisibility] ?? fixedVisibility}
                  </p>
                </Field>
              ) : (
                <Field label="공개 범위">
                  <Select {...register('visibility')}>
                    {visibilityOptions.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            <Field label="설명">
              <TextArea rows={3} placeholder="카드에 표시할 운영 메모" {...register('memo')} />
            </Field>
          </div>
        </Card>

        {/*
          공개 링크 카드는 **템플릿의 성격이 `PUBLIC_LINK`일 때만** 선다(모집 하나뿐이다).
          안쪽 컴포넌트는 이미 그 판정으로 `null`을 돌려주고 있었는데 감싸는 카드가 무조건
          서서, 글쓰기·URL첨부·파일첨부 모듈에서는 제목만 남은 빈 카드가 떴다 — 빈 카드는
          "여기에 무언가 있어야 하는데 안 나왔다"로 읽혀, 없는 것보다 나쁘다.
          같은 판정을 두 곳에 적지 않도록 카드도 `linkForm.available` 하나를 본다.
        */}
        {linkForm.available && (
          <Card title="공개 링크">
            <ModulePublicLinkFields
              form={linkForm}
              moduleStartDate={startValue}
              moduleEndDate={endValue}
            />
          </Card>
        )}

        <Card title="운영 기간" help={rangeHelp}>
          <div className="space-y-3">
            {modePolicy?.options && (
              <Field label="배정 방식">
                <Select {...register('participation_mode')}>
                  {modePolicy.options.map((m) => (
                    <option key={m} value={m}>
                      {PARTICIPATION_MODE_LABEL[m] ?? m}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {ledgerOwned ? (
              /* 차단 안내는 접지 않는다 — 왜 여기서 못 정하는지가 이 자리의 내용이다. */
              <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-body text-gray-700">
                이 모듈의 기간은 연결된 매물의 <b>퀵 리뷰 작성일</b>이 답합니다. 여기서 정하지
                않습니다.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="시작일" required>
                  <Input type="date" {...register('start_date')} />
                </Field>
                <Field label="종료일" required>
                  <Input type="date" {...register('end_date')} />
                </Field>
              </div>
            )}
          </div>
        </Card>

        <Card title="담당자">
          {ledgerOwned ? (
            <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-body text-gray-700">
              이 모듈의 담당은 연결된 매물의 <b>퀵 리뷰를 작성한 사람</b>이 답합니다. 여기서
              지정하지 않습니다.
            </p>
          ) : (
          <div className="space-y-3">
            <Field as="div" label="담당자" required>
              {pool.length === 0 ? (
                <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-body-sm text-gray-500">
                  사업 담당자 풀이 비어 있습니다. 개요에서 담당자를 먼저 배정하세요.
                </p>
              ) : (
                /* 사람 이름은 읽어야 고를 수 있는 값이 아니라 boxed 체크박스가 과했다(2026-09-05).
                   다만 후보가 이 사업 담당자 풀로 이미 닫혀 있어 '무엇이 있는지 보러' 여는 자리가
                   아니므로, 돋보기는 정본과 달리 기본값인 드롭다운으로 둔다. */
                <TokenMultiSelect<{ id: string; name: string }>
                  selected={selectedAssignees}
                  onChange={onChangeAssignees}
                  getKey={(a) => a.id}
                  getLabel={(a) => a.name}
                  options={pool}
                  placeholder="담당자 이름 검색"
                  browsable
                />
              )}
            </Field>

            {/*
              업무롤 — 위 칸이 '누구인가'를 묻고 여기가 '무엇을 하는가'를 묻는다. 같은 이름이 칩과
              이 줄에 두 번 서지만 두 값은 다른 물음의 답이고, 이름이 곧 이 줄의 라벨이라 지울 수
              없다. 역할(PM·멤버)은 여기서 받지 않는다 — 사업 담당자 원장이 이미 아는 사실이다.
              선택 전에는 줄 자체를 세우지 않는다(늘 비어 있는 칸은 곧 안 읽히는 칸이 된다).
            */}
            {assignees.length > 0 && (
              <Field as="div" label="업무롤">
                <div className="space-y-2">
                  {assignees.map((a) => (
                    <div
                      key={a.id}
                      className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-2"
                    >
                      <span className="truncate text-body text-gray-700" title={nameOfUser(a.id)}>
                        {nameOfUser(a.id)}
                      </span>
                      <Input
                        value={a.duty}
                        maxLength={200}
                        placeholder="이 모듈에서 하는 일 (예: 신청서 검토·선발 총괄)"
                        onChange={(e) => setDuty(a.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </Field>
            )}
          </div>
          )}
        </Card>
      </form>
    </Modal>
  )
}
