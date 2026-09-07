import { CardShell, Field, Input, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormTopBar } from '@/components/FormTopBar'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useTagTokenField } from '@/features/admin/TagTokenField'
import {
  MAX_INDUSTRIES,
  MA_BUYER_NOUN,
  type MaBuyerRow,
} from '@/features/mna/buyers/config'
import { useCreateMaBuyer, useUpdateMaBuyer } from '@/features/mna/buyers/hooks'

interface MaBuyerFormValues {
  name: string
  wish: string
  /** 백만원 단위로 입력받는다 — 표기와 같은 단위여야 적은 값과 읽는 값이 같다(저장은 원 단위). */
  fundsMillion: string
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
 * 칸은 넷뿐이고 나머지는 전부 본문이 받는다 — 서술을 칸으로 쪼개면 대부분의 행에서 비고,
 * 빈 칸이 많은 폼은 무엇을 적어야 하는 자리인지 스스로 답하지 못한다. 칸으로 남은 넷은
 * 목록을 좁히거나 정렬하는 값이라는 공통점 하나로 묶인다(근거: 원장 마이그레이션 주석).
 *
 * 폼의 카드 구성·순서는 조회 화면과 같다 — 읽던 자리에서 그대로 고치게 한다.
 */
export function MaBuyerForm({ recordId, initial, onDone, onCancel, backTo }: Props) {
  const toast = useToast()
  const create = useCreateMaBuyer()
  const update = useUpdateMaBuyer()
  const isEdit = Boolean(recordId)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MaBuyerFormValues>({
    values: {
      name: initial?.name ?? '',
      wish: initial?.wish ?? '',
      fundsMillion:
        initial?.available_funds == null
          ? ''
          : String(Math.round(Number(initial.available_funds) / 1_000_000)),
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

  const onSubmit = async (v: MaBuyerFormValues) => {
    const million = v.fundsMillion.replace(/,/g, '').trim()
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      industries,
      wish: v.wish.trim() || null,
      // 입력은 백만원, 저장은 원. 단위를 저장 쪽에 맞추면 담당자가 0을 여섯 개 세게 된다.
      available_funds: million === '' ? null : Number(million) * 1_000_000,
      overview_html: overview.trim() || null,
    }

    try {
      if (isEdit && recordId) {
        await update.mutateAsync({ id: recordId, values: payload })
        toast.show(`${MA_BUYER_NOUN} 정보를 수정했습니다.`, 'success')
        onDone({ id: recordId })
      } else {
        const newId = await create.mutateAsync(payload)
        toast.show(`${MA_BUYER_NOUN}을(를) 등록했습니다.`, 'success')
        onDone({ id: newId })
      }
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <FormTopBar
        backTo={backTo}
        mode={isEdit ? 'edit' : 'create'}
        onCancel={onCancel}
        busy={isSubmitting}
      />

      <CardShell>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="기업명" required error={errors.name?.message}>
            <Input
              invalid={Boolean(errors.name)}
              {...register('name', { required: '기업명은 필수입니다.' })}
            />
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
    </form>
  )
}
