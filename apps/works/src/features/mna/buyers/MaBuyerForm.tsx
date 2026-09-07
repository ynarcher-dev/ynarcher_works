import { CardShell, Field, Input, TextAction, useToast } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useEditReasonPrompt } from '@/components/EditReasonPrompt'
import { FormTopBar } from '@/components/FormTopBar'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useTagTokenField } from '@/features/admin/TagTokenField'
import {
  StartupPickerModal,
  type StartupPick,
} from '@/features/mna/buyers/StartupPickerModal'
import {
  MAX_INDUSTRIES,
  MA_BUYER_NOUN,
  MA_BUYER_TARGET_TYPE,
  type MaBuyerRow,
} from '@/features/mna/buyers/config'
import { useCreateMaBuyer, useUpdateMaBuyer } from '@/features/mna/buyers/hooks'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'

interface MaBuyerFormValues {
  name: string
  wish: string
  /** 백만원 단위로 입력받는다 — 표기와 같은 단위여야 적은 값과 읽는 값이 같다(저장은 원 단위). */
  fundsMillion: string
  /** 바이어 쪽 연락 창구. 우리 쪽 관리 주체가 아니다. */
  contactName: string
  contactEmail: string
}

interface Props {
  /** 기존 레코드 id. 미지정 시 신규 등록. */
  recordId?: string
  initial: MaBuyerRow | null
  onDone: (result: { id: string }) => void
  onCancel: () => void
  /** 상단 바 뒤로가기 목적지(목록 경로). */
  backTo: string
}

/**
 * M&A BUYER 등록/수정 폼.
 *
 * 칸은 여섯이고 나머지는 전부 본문이 받는다 — 서술을 칸으로 쪼개면 대부분의 행에서 비고,
 * 빈 칸이 많은 폼은 무엇을 적어야 하는 자리인지 스스로 답하지 못한다. 칸이 되는 기준은 둘이다:
 * 목록을 좁히거나 정렬하는 값(분야·희망사항·가용자금)과 매번 같은 자리에서 꺼내 쓰는 값
 * (담당자·이메일).
 *
 * 카드 구성·배치는 조회 화면과 같다 — 읽던 자리에서 그대로 고치게 한다. 우측 자료 관리도
 * 같은 자리에 서되 여기서는 편집 가능하고, 등록 모드에서는 아직 붙일 레코드가 없어
 * 보류 목록(`PendingMaterialPanel`)이 그 자리를 대신한 뒤 저장 직후 한꺼번에 올라간다.
 */
export function MaBuyerForm({ recordId, initial, onDone, onCancel, backTo }: Props) {
  const toast = useToast()
  const create = useCreateMaBuyer()
  const update = useUpdateMaBuyer()
  const isEdit = Boolean(recordId)
  // 수정 저장은 사유를 받아야 확정된다 — 사유는 변동 이력의 note로 남는다.
  const { askReason, reasonModal } = useEditReasonPrompt()
  // 등록 모드에서 미리 고른 자료. 저장 성공 직후 새 id로 일괄 업로드한다.
  const pending = usePendingMaterials()

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<MaBuyerFormValues>({
    values: {
      name: initial?.name ?? '',
      wish: initial?.wish ?? '',
      fundsMillion:
        initial?.available_funds == null
          ? ''
          : String(Math.round(Number(initial.available_funds) / 1_000_000)),
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

  // STARTUP 원장 매핑(선택). 이름과 별개의 값이라 함께 들고 다닌다 — 이름은 '이 바이어를
  // 부르는 이름'이고 이 값은 '그 기업이 우리 원장의 어느 행인가'다.
  const [startupId, setStartupId] = useState<string | null>(initial?.startup_id ?? null)
  const [startupName, setStartupName] = useState<string>(initial?.startup?.name ?? '')
  const [picking, setPicking] = useState(false)

  /**
   * 스타트업 원장 한 행을 이 폼에 얹는다.
   *
   * 규칙은 하나 — **연결은 값을 덮지 않는다.** 비어 있는 칸만 채우고 이미 적힌 칸은 그대로
   * 둔다. 연결은 되돌릴 수 있지만(연결 해제) 덮어써서 잃은 입력은 되돌릴 방법이 없고,
   * 원장 표기와 이 바이어를 부르는 이름이 다른 경우도 흔하다(약칭·계약서 표기).
   * AI 초안이 "근거를 못 찾은 칸은 기존 값 유지"인 것과 같은 이유다.
   *
   * 가져오는 값이 셋인 이유는 스타트업 원장이 **이미 답하고 있는 것**이기 때문이다 —
   * 연결해 놓고 분야·대표자·이메일을 손으로 또 적게 하면 같은 사실이 두 곳에 살고, 그때부터
   * 어긋난다. 다만 복사이지 참조가 아니다: 담기고 나면 이 바이어의 값이라 따로 고칠 수 있고,
   * 원장 쪽이 바뀌어도 따라 변하지 않는다(바이어의 창구가 그 기업 대표가 아닐 수 있다).
   */
  const applyStartup = (s: StartupPick) => {
    setStartupId(s.id)
    setStartupName(s.name)

    const filled: string[] = []
    if (!getValues('name').trim()) {
      setValue('name', s.name, { shouldValidate: true })
    }
    if (industries.length === 0 && s.industries?.length) {
      setIndustries(s.industries.slice(0, MAX_INDUSTRIES))
      filled.push('분야')
    }
    if (!getValues('contactName').trim() && s.representative) {
      setValue('contactName', s.representative)
      filled.push('담당자')
    }
    if (!getValues('contactEmail').trim() && s.email) {
      setValue('contactEmail', s.email, { shouldValidate: true })
      filled.push('이메일')
    }

    // 무엇이 함께 들어왔는지 밝힌다 — 연결 버튼 하나에 칸 셋이 조용히 바뀌면, 담당자는
    // 자기가 적지 않은 값이 언제 들어왔는지 알 수 없다.
    toast.show(
      filled.length
        ? `스타트업 DB를 연결하고 ${filled.join('·')}을(를) 가져왔습니다.`
        : '스타트업 DB를 연결했습니다.',
      'success',
    )
  }

  const onSubmit = async (v: MaBuyerFormValues) => {
    const million = v.fundsMillion.replace(/,/g, '').trim()
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      industries,
      wish: v.wish.trim() || null,
      // 입력은 백만원, 저장은 원. 단위를 저장 쪽에 맞추면 담당자가 0을 여섯 개 세게 된다.
      available_funds: million === '' ? null : Number(million) * 1_000_000,
      contact_name: v.contactName.trim() || null,
      contact_email: v.contactEmail.trim() || null,
      startup_id: startupId,
      overview_html: overview.trim() || null,
    }

    try {
      if (isEdit && recordId) {
        const reason = await askReason()
        if (!reason) return
        await update.mutateAsync({ id: recordId, values: payload, reason })
        toast.show(`${MA_BUYER_NOUN} 정보를 수정했습니다.`, 'success')
        onDone({ id: recordId })
      } else {
        const newId = await create.mutateAsync(payload)
        // 등록 전에 첨부한 자료를 새 레코드에 올린다. 실패해도 등록 자체는 되돌리지 않는다 —
        // 자료는 상세에서 다시 붙일 수 있지만 되돌린 등록은 입력한 것이 통째로 사라진다.
        const { failed } = await pending.flush(newId, () => MA_BUYER_TARGET_TYPE)
        toast.show(
          failed > 0
            ? `${MA_BUYER_NOUN}을(를) 등록했지만 자료 ${failed}건 업로드에 실패했습니다. 상세페이지에서 다시 첨부해 주세요.`
            : `${MA_BUYER_NOUN}을(를) 등록했습니다.`,
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
                  onActionClick={() => setPicking(true)}
                  {...register('name', { required: '기업명은 필수입니다.' })}
                />
                {startupId && (
                  <p className="mt-1.5 flex items-center gap-2 text-caption text-gray-600">
                    <span className="truncate">
                      스타트업 DB 연결:{' '}
                      <span className="text-gray-900">{startupName || '기업'}</span>
                    </span>
                    <TextAction
                      onClick={() => {
                        setStartupId(null)
                        setStartupName('')
                      }}
                    >
                      연결 해제
                    </TextAction>
                  </p>
                )}
              </Field>
              <Field
                label="가용자금"
                error={errors.fundsMillion?.message}
                hint="백만원 단위로 적습니다. 범위나 조건이 붙는 금액은 상세내용에 적습니다."
              >
                <Input
                  inputMode="numeric"
                  placeholder="예: 50000"
                  invalid={Boolean(errors.fundsMillion)}
                  {...register('fundsMillion', {
                    validate: (v) =>
                      v.trim() === '' ||
                      /^[0-9,]+$/.test(v.trim()) ||
                      '숫자만 입력합니다(백만원 단위).',
                  })}
                />
              </Field>
              <Field label="분야" hint={industryField.hint} hintInline={industryField.hintInline}>
                {industryField.control}
              </Field>
              <Field label="희망사항" hint="한 줄 요약입니다. 자세한 조건은 상세내용에 적습니다.">
                <Input placeholder="예: 제조 분야 경영권 인수" {...register('wish')} />
              </Field>
              <Field label="담당자" hint="바이어 쪽 연락 창구입니다. 우리 담당자가 아닙니다.">
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

          <CardShell>
            <p className="mb-3 text-caption font-medium text-gray-700">상세내용</p>
            <RichTextEditor
              value={overview}
              onChange={setOverview}
              placeholder="인수 배경·희망 조건·미팅 메모 등을 자유롭게 적습니다."
            />
          </CardShell>
        </div>

        <div className="space-y-4 lg:col-span-1">
          {isEdit && recordId ? (
            <MaterialPanel targetType={MA_BUYER_TARGET_TYPE} targetId={recordId} />
          ) : (
            <PendingMaterialPanel slot={MA_BUYER_TARGET_TYPE} pending={pending} />
          )}
        </div>
      </div>

      {picking && (
        <StartupPickerModal onPick={applyStartup} onClose={() => setPicking(false)} />
      )}
    </form>
  )
}
