import { CardShell, Field, formText, Input, PanelCard, TextAction, useToast } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useEditReasonPrompt } from '@/components/EditReasonPrompt'
import { FormTopBar } from '@/components/FormTopBar'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useTagTokenField } from '@/features/admin/TagTokenField'
import { StartupPickerModal } from '@/features/mna/parties/StartupPickerModal'
import {
  MAX_INDUSTRIES,
  formatWonInput,
  parseWon,
  type MaPartyConfig,
  type MaPartyRow,
} from '@/features/mna/parties/config'
import { useCreateMaParty, useUpdateMaParty } from '@/features/mna/parties/hooks'
import { readQuickReview, type QuickReview } from '@/features/mna/parties/quickReview'
import { MaQuickReviewFields } from '@/features/mna/parties/MaQuickReviewFields'
import { MaQuickReviewFinancialFields } from '@/features/mna/parties/MaQuickReviewFinancialFields'
import { quickReviewCatalog, applyQuickReviewDraft } from '@/features/mna/parties/quickReviewAi'
import { SectionHeading } from '@/components/SectionHeading'
import { AiFillButton } from '@/features/ai/AiFillButton'
import { sourcesFromFiles, sourcesFromLinks, sourcesFromMaterials } from '@/features/ai/aiFillClient'
import { useMaterials } from '@/features/networks/materialHooks'
import { useStartupLink } from '@/features/mna/parties/startupLink'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'

interface MaPartyFormValues {
  name: string
  wish: string
  /** 원 단위, 세 자리마다 쉼표. 표기와 같은 단위여야 적은 값과 읽는 값이 같다. */
  funds: string
  /** 상대 쪽 연락 창구. 우리 쪽 관리 주체가 아니다. */
  contactName: string
  contactEmail: string
}

interface Props {
  config: MaPartyConfig
  /** 기존 레코드 id. 미지정 시 신규 등록. */
  recordId?: string
  initial: MaPartyRow | null
  onDone: (result: { id: string }) => void
  onCancel: () => void
  /** 상단 바 뒤로가기 목적지(목록 경로). */
  backTo: string
}

/**
 * M&A BUYER·SELLER 등록/수정 폼.
 *
 * 칸은 여섯이고 나머지는 전부 본문이 받는다 — 서술을 칸으로 쪼개면 대부분의 행에서 비고,
 * 빈 칸이 많은 폼은 무엇을 적어야 하는 자리인지 스스로 답하지 못한다. 칸이 되는 기준은 둘이다:
 * 목록을 좁히거나 정렬하는 값(분야·희망사항·금액)과 매번 같은 자리에서 꺼내 쓰는 값
 * (담당자·이메일).
 *
 * 카드 구성·배치는 조회 화면과 같다 — 읽던 자리에서 그대로 고치게 한다. 우측 자료 관리도
 * 같은 자리에 서되 여기서는 편집 가능하고, 등록 모드에서는 아직 붙일 레코드가 없어
 * 보류 목록(`PendingMaterialPanel`)이 그 자리를 대신한 뒤 저장 직후 한꺼번에 올라간다.
 */
export function MaPartyForm({ config, recordId, initial, onDone, onCancel, backTo }: Props) {
  const toast = useToast()
  const create = useCreateMaParty(config)
  const update = useUpdateMaParty(config)
  const isEdit = Boolean(recordId)
  // 수정 저장은 사유를 받아야 확정된다 — 사유는 변동 이력의 note로 남는다.
  const { askReason, reasonModal } = useEditReasonPrompt()
  // 등록 모드에서 미리 고른 자료. 저장 성공 직후 새 id로 일괄 업로드한다.
  const pending = usePendingMaterials()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MaPartyFormValues>({
    values: {
      name: initial?.name ?? '',
      wish: initial?.wish ?? '',
      funds:
        initial?.available_funds == null
          ? ''
          : Number(initial.available_funds).toLocaleString(),
      contactName: initial?.contact_name ?? '',
      contactEmail: initial?.contact_email ?? '',
    },
  })

  const [industries, setIndustries] = useState<string[]>(
    Array.isArray(initial?.industries) ? (initial?.industries as string[]) : [],
  )
  // 분야 칸의 규격은 화면이 아니라 `useTagTokenField`가 소유한다(STARTUP·NETWORKS와 같은 원장·같은 칸).
  const industryField = useTagTokenField({
    table: 'industry_tags',
    noun: '분야',
    adminMenu: '분야 관리',
    value: industries,
    onChange: setIndustries,
    max: MAX_INDUSTRIES,
  })

  const [overview, setOverview] = useState<string>(initial?.overview_html ?? '')

  // 퀵 리뷰는 절 7종을 통째로 들고 있는 값이라 폼 값(react-hook-form)이 아니라 상태다 —
  // 저장 단위가 절 하나이고 목록(주주·지표·연도 행)이 그 안에 있어, 칸 단위 등록으로는
  // 배열의 추가·삭제를 표현할 수 없다(스타트업 상세의 성장 지표와 같은 처리).
  const [quickReview, setQuickReview] = useState<QuickReview>(() =>
    readQuickReview(initial?.quick_review),
  )

  /**
   * 'AI 작성하기'가 읽을 자료. **모드가 무엇을 읽는지 정한다** — 수정은 이미 올라간 첨부,
   * 등록은 아직 올라가지 않은 보류 파일·링크다(등록 모드의 파일은 서버가 저장하지 않는다).
   */
  const { data: uploaded, isLoading: materialsLoading } = useMaterials(
    config.targetType,
    isEdit ? recordId : undefined,
  )
  const aiSources = isEdit
    ? sourcesFromMaterials(uploaded ?? [])
    : [
        ...sourcesFromFiles(pending.files(config.targetType)),
        ...sourcesFromLinks(pending.links(config.targetType)),
      ]

  /**
   * 프롬프트에 실을 대상 이름 — 저장된 값이 아니라 **지금 폼에 적힌 이름**이다.
   *
   * 등록 모드에는 저장된 행이 없고, 수정 모드에서도 방금 이름을 고쳐 놓고 초안을 만들 수
   * 있다. 원장 값을 보내면 모델이 다른 회사 이름으로 문서를 쓴다.
   */
  const watchedName = watch('name').trim()

  // STARTUP 원장 매핑(선택). 고르면 이름·분야·담당자·이메일을 원장 값으로 덮어쓴다.
  const link = useStartupLink(initial, {
    setText: (f, value) => setValue(f, value, { shouldValidate: true }),
    setIndustries,
  })

  const onSubmit = async (v: MaPartyFormValues) => {
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      industries,
      wish: v.wish.trim() || null,
      // 저장은 원 단위 하나다. 화면마다 단위를 바꿔 저장하면 어느 자리에서 적힌 값인지에
      // 따라 같은 컬럼이 다른 뜻을 갖는다.
      available_funds: parseWon(v.funds),
      contact_name: v.contactName.trim() || null,
      contact_email: v.contactEmail.trim() || null,
      startup_id: link.startupId,
      overview_html: overview.trim() || null,
      // 퀵 리뷰를 쓰지 않는 원장에서는 이 칸을 아예 보내지 않는다 — 빈 문서를 저장하면
      // 목록에서 '있는데 비어 있는' 행과 '없는' 행을 가를 수 없다.
      ...(config.hasQuickReview ? { quick_review: quickReview } : {}),
    }

    try {
      if (isEdit && recordId) {
        const reason = await askReason()
        if (!reason) return
        await update.mutateAsync({ id: recordId, values: payload, reason })
        toast.show(`${config.noun} 정보를 수정했습니다.`, 'success')
        onDone({ id: recordId })
      } else {
        const newId = await create.mutateAsync(payload)
        // 등록 전에 첨부한 자료를 새 레코드에 올린다. 실패해도 등록 자체는 되돌리지 않는다 —
        // 자료는 상세에서 다시 붙일 수 있지만 되돌린 등록은 입력한 것이 통째로 사라진다.
        const { failed } = await pending.flush(newId, () => config.targetType)
        toast.show(
          failed > 0
            ? `${config.noun}을(를) 등록했지만 자료 ${failed}건 업로드에 실패했습니다. 상세페이지에서 다시 첨부해 주세요.`
            : `${config.noun}을(를) 등록했습니다.`,
          failed > 0 ? 'warning' : 'success',
        )
        onDone({ id: newId })
      }
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {reasonModal}
      {/* 상단 바(뒤로가기 ↔ 취소·확정) — 조회 화면의 '수정' 버튼과 같은 자리를 쓴다. */}
      <FormTopBar
        backTo={backTo}
        mode={isEdit ? 'edit' : 'create'}
        onCancel={onCancel}
        busy={isSubmitting}
      />

      {/* 조회와 같은 3열 배치: 좌측 2/3 편집 카드 + 우측 1/3 자료 관리. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CardShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="기업명"
                required
                error={errors.name?.message}
                hint="스타트업 DB에 있는 기업이면 돋보기로 찾아 연결하세요. 없으면 직접 입력합니다."
                as="div"
              >
                {/* 돋보기는 이름을 대신 채워 주는 것이 아니라 원장의 행을 가리키는 일이다.
                    그래서 고른 뒤에도 이름 칸은 그대로 고칠 수 있다. 자리가 칸 안쪽 오른쪽
                    끝인 것은 바로 아래 분야 칸의 돋보기와 같은 규격이기 때문이며, 그 규격은
                    화면이 아니라 공용 `Input`의 `action` 슬롯이 소유한다. */}
                <Input
                  invalid={Boolean(errors.name)}
                  action={<Search />}
                  actionLabel="스타트업 DB에서 찾기"
                  onActionClick={() => link.setPicking(true)}
                  {...register('name', { required: '기업명은 필수입니다.' })}
                />
                {link.startupId && (
                  // 연결 결과를 되읽는 줄이라 접지 않는다(3.6.1의 예외). 규격은 화면이 조합하지
                  // 않고 폼 도움말 토큰(`formText.hint`)을 그대로 쓴다 — 같은 자리의 `Field`
                  // 도움말과 크기·색이 갈리면 한 칸 안에서 캡션이 두 규격이 된다.
                  <p className={`mt-1.5 flex items-center gap-2 ${formText.hint}`}>
                    <span className="truncate">
                      스타트업 DB 연결:{' '}
                      <span className="text-gray-900">{link.startupName || '기업'}</span>
                    </span>
                    <TextAction onClick={link.clear}>연결 해제</TextAction>
                  </p>
                )}
              </Field>
              <Field
                label={config.fundsLabel}
                error={errors.funds?.message}
                hint="원 단위로 적습니다. 범위나 조건이 붙는 금액은 상세내용에 적습니다."
              >
                <Input
                  inputMode="numeric"
                  placeholder="예: 50,000,000"
                  invalid={Boolean(errors.funds)}
                  {...register('funds')}
                  // 적는 동안 세 자리마다 쉼표를 다시 찍는다 — 0이 아홉 개 붙는 값이라
                  // 쉼표 없이는 적는 사람도 읽는 사람도 자릿수를 눈으로 세어야 한다.
                  // 숫자 아닌 글자는 애초에 들어오지 못하므로 형식 검증도 따로 두지 않는다
                  // (막을 수 있는 것을 통과시킨 뒤 오류로 알리지 않는다).
                  onChange={(e) =>
                    setValue('funds', formatWonInput(e.target.value), { shouldDirty: true })
                  }
                />
              </Field>
              <Field label="분야" hint={industryField.hint} hintInline={industryField.hintInline}>
                {industryField.control}
              </Field>
              <Field label="희망사항" hint="한 줄 요약입니다. 자세한 조건은 상세내용에 적습니다.">
                <Input placeholder={config.wishPlaceholder} {...register('wish')} />
              </Field>
              <Field label="담당자" hint="상대 쪽 연락 창구입니다. 우리 담당자가 아닙니다.">
                <Input placeholder="예: 김이사" {...register('contactName')} />
              </Field>
              <Field label="이메일" error={errors.contactEmail?.message}>
                <Input
                  type="email"
                  placeholder="예: contact@company.com"
                  invalid={Boolean(errors.contactEmail)}
                  {...register('contactEmail', {
                    validate: (v) =>
                      v.trim() === '' ||
                      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ||
                      '이메일 형식이 아닙니다.',
                  })}
                />
              </Field>
            </div>
          </CardShell>

          {/* 카드 제목은 화면이 아니라 카드가 소유한다 — 손으로 쓰면 조회의 같은 카드(16px)와
              편집의 카드가 다른 규격으로 서서, '수정'을 누르는 순간 제목이 작아진다. */}
          <PanelCard title="상세내용">
            <RichTextEditor
              value={overview}
              onChange={setOverview}
              placeholder={config.overviewPlaceholder}
            />
          </PanelCard>

          {/* 퀵 리뷰 편집은 조회와 **같은 카드 구성·같은 순서**로 선다. 밴드 제목도 조회와
              같은 부품(`SectionHeading`)이라, '수정'을 누르는 순간 화면의 뼈대가 바뀌지 않는다. */}
          {config.hasQuickReview && (
            <>
              <SectionHeading title="퀵 리뷰" accent />
              <MaQuickReviewFields qr={quickReview} onChange={setQuickReview} />
              <MaQuickReviewFinancialFields qr={quickReview} onChange={setQuickReview} />
            </>
          )}
        </div>

        <div className="space-y-4 lg:col-span-1">
          {isEdit && recordId ? (
            <MaterialPanel targetType={config.targetType} targetId={recordId} />
          ) : (
            <PendingMaterialPanel slot={config.targetType} pending={pending} />
          )}

          {/* AI 작성하기는 자료 관리 **바로 아래**에 선다 — 이 기능이 읽는 것이 위 카드의
              파일이라, 재료에서 떨어뜨리면 무엇을 근거로 채우는지가 화면에서 사라진다.
              부품은 스타트업과 같은 공용 컴포넌트이고 갈리는 것은 카탈로그(카드 목록·함수
              이름)뿐이다. */}
          {config.hasQuickReview && (
            <AiFillButton
              catalog={quickReviewCatalog(quickReview)}
              sources={aiSources}
              loading={isEdit && materialsLoading}
              targetId={recordId}
              subjectName={watchedName || undefined}
              onFilled={(result, cards) => {
                const { review, outcome } = applyQuickReviewDraft(quickReview, result, cards)
                setQuickReview(review)
                return outcome
              }}
            />
          )}
        </div>
      </div>

      {link.picking && (
        <StartupPickerModal onPick={link.apply} onClose={() => link.setPicking(false)} />
      )}
    </form>
  )
}
