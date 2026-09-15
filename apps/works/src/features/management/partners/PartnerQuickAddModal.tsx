import {
  Button,
  IconButton,
  Input,
  Modal,
  Select,
  cn,
  formText,
  tableGrid,
  tableText,
  useToast,
} from '@ynarcher/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  BANKS,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPE_ORDER,
  registrationLabel,
  type PartnerType,
} from '@/features/management/partners/config'
import {
  digitsOnly,
  emptyPartnerDraft,
  normalizeAccountNo,
  registrationLength,
  toPartnerInput,
  validatePartnerDraft,
  withPartnerType,
  type PartnerDraft,
} from '@/features/management/partners/partnerForm'
import { useQuickRegisterPartner } from '@/features/management/partners/partnerDirectoryApi'

/** 원장에 들어간 거래처 한 건 — 부른 쪽이 그 줄을 곧바로 쓸 수 있게 이름까지 함께 돌려준다. */
export interface QuickAddedPartner {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  /**
   * 원장에 들어간 거래처들 — **적은 순서 그대로**다. 부른 쪽은 첫 건을 지금 줄에 넣고
   * 나머지를 새 줄로 편다(송금 요청 표가 하는 일과 같다).
   */
  onCreated: (partners: QuickAddedPartner[]) => void
  /** 검색해도 없어서 새로 넣는 자리이므로 검색어를 첫 줄의 이름 칸에 미리 넣는다. */
  initialName?: string
}

/** 손대지 않은 줄인가 — 비어 있는 줄은 검증하지도, 등록하지도 않는다. */
function isBlankDraft(draft: PartnerDraft): boolean {
  return (
    !draft.name.trim() &&
    !draft.registrationNo &&
    !draft.bankCode &&
    !draft.accountNo.trim() &&
    !draft.accountHolder.trim()
  )
}

/** 첫 줄만 검색어를 들고 시작한다. */
function initialRows(name: string | undefined): PartnerDraft[] {
  return [{ ...emptyPartnerDraft(), name: name ?? '' }]
}

/**
 * 송금 요청에서의 즉석 거래처 등록 — **한 번에 여러 곳**.
 *
 * **원장에 먼저 들어가고 그 다음 요청 줄에 실린다.** 요청서에만 있고 원장에는 없는 거래처를
 * 만들지 않는 것이 이 창의 전부다 — 그런 거래처가 생기면 지급 담당자가 계좌를 어디서
 * 확인해야 하는지 답할 곳이 없다.
 *
 * 칸을 2열 폼이 아니라 **가로 한 줄**로 세우는 이유는 이 창이 열리는 자리 때문이다. 송금 요청은
 * 거래처 하나에 한 줄이라 새 거래처도 대개 여럿이 함께 생기는데(행사 하나에 업체 다섯), 세로로
 * 접힌 폼은 한 곳을 넣을 때마다 창을 열고 닫게 만든다. 한 줄이 한 거래처이므로 이 창을 닫고
 * 돌아갈 송금 요청 표와 읽는 방향도 같다.
 *
 * 검증은 거래처 원장의 등록 폼과 **같은 함수**가 한다(`validatePartnerDraft`). 종전에는 이 창만
 * 자릿수를 세는 약한 규칙을 따로 들고 있어, 같은 원장에 들어가는 행인데도 어디서 넣었는지에
 * 따라 통과하는 값이 달랐다 — 사업자등록번호의 체크숫자 검증이 그 예다.
 *
 * 여기서 만든 거래처에는 **"확인 전" 딱지가 붙는다**(서버가 정한다). 계좌 정보를 확인하기
 * 전에 들어온 행이 확인된 행과 같은 얼굴로 서면 결재자가 둘을 가릴 수 없다. 딱지가 붙어도
 * 상신은 막지 않는다 — 거르는 일은 결재자의 반려가 한다.
 */
export function PartnerQuickAddModal({ open, onClose, onCreated, initialName }: Props) {
  const toast = useToast()
  const register = useQuickRegisterPartner()
  const [rows, setRows] = useState<PartnerDraft[]>(() => initialRows(initialName))

  // 창이 열리는 **순간**에만 되돌린다. 열려 있는 동안 되돌리면 적던 값이 사라지고, 되돌리지
  // 않으면 다른 검색어로 다시 열었을 때 지난번에 적다 만 줄이 그대로 서 있다.
  useEffect(() => {
    if (open) setRows(initialRows(initialName))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const setRow = (index: number, next: PartnerDraft) =>
    setRows((prev) => prev.map((r, i) => (i === index ? next : r)))
  const addRow = () => setRows((prev) => [...prev, emptyPartnerDraft()])
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))

  const filled = rows.filter((r) => !isBlankDraft(r))

  /**
   * 줄을 **차례대로** 원장에 넣는다.
   *
   * 한꺼번에 보내지 않는 이유는 거래처 코드(`YN-00001`)를 서버가 순번으로 매기기 때문이다.
   * 동시에 보내면 코드 순서가 적은 순서와 어긋나, 방금 넣은 다섯 곳이 목록에서 뒤섞여 선다.
   *
   * 한 줄이 실패해도 나머지를 멈추지 않는다 — 중복처럼 그 줄만의 사유인 경우가 대부분이고,
   * 멈추면 사람이 뒤의 줄을 다시 적어야 한다. 대신 **성공한 것은 성공한 대로 넘기고** 실패한
   * 줄만 창에 남긴다(이미 원장에 들어간 행을 없던 일로 되돌릴 수는 없으므로 감추지 않는다).
   */
  const submit = async () => {
    if (filled.length === 0) {
      toast.show('거래처명을 입력하세요.', 'warning')
      return
    }
    for (const [i, draft] of filled.entries()) {
      const error = validatePartnerDraft(draft)
      if (error) {
        toast.show(`${i + 1}행: ${error.message}`, 'warning')
        return
      }
    }

    const created: QuickAddedPartner[] = []
    const failed: PartnerDraft[] = []
    for (const draft of filled) {
      const input = toPartnerInput(draft)
      try {
        const id = await register.mutateAsync({
          name: input.name,
          partnerType: input.partnerType,
          registrationNo: input.registrationNo,
          bankCode: input.bankCode,
          accountNo: input.accountNo,
          accountHolder: input.accountHolder,
        })
        created.push({ id, name: input.name })
      } catch {
        failed.push(draft)
      }
    }

    if (created.length > 0) onCreated(created)

    if (failed.length > 0) {
      setRows(failed)
      const names = failed.map((d) => d.name.trim() || '이름 없음').join(', ')
      toast.show(`${names} 등록에 실패했습니다. 남은 줄을 확인해 주세요.`, 'danger')
      return
    }

    toast.show(
      `거래처 ${created.length}곳을 원장에 등록했습니다. 경영지원 확인 전 상태입니다.`,
      'success',
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="거래처 등록"
      // 표를 품는 대화의 폭(5_component_spec_rules §3.5).
      size="xl"
      // 쓰던 값이 클릭 한 번에 사라지지 않도록 바깥 클릭으로 닫지 않는다.
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={register.isPending || filled.length === 0}
          >
            {filled.length > 1 ? `${filled.length}곳 등록` : '등록'}
          </Button>
        </>
      }
    >
      {/* **이 안내는 접지 않는다.** 지금 만드는 것이 요청서 한 줄이 아니라 원장의 행이고,
          한 번 들어가면 이 화면에서 되돌릴 수 없다 — 되돌릴 수 없는 작업의 파급 효과 고지는
          말풍선 뒤로 숨기지 않는다(CLAUDE.md '안내 문구는 접는다'의 예외). */}
      <p className="mb-3 rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2 text-body-sm text-gray-700">
        여기서 등록한 거래처는 거래처 원장에 바로 들어갑니다. 경영지원이 계좌 정보를 확인하기
        전까지 <b>확인 전</b>으로 표시됩니다.
      </p>

      {/* 밀도 맥락을 내려받지 못하는 수제 표라 격자를 `tableGrid`에서 가져온다 — 직접 적으면
          같은 화면의 표끼리 행 높이·여백이 갈린다(송금 요청 표와 같은 규약). */}
      <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-300">
        {/* `table-fixed` — 폭은 칸의 성격이 정하고 내용이 밀지 않는다. 자동 배치에서는 입력
            상자의 기본 너비가 기준이 되어, 여덟 자리면 끝나는 등록번호 칸이 이름 칸만큼 넓어진다. */}
        <table className="w-full min-w-[56rem] table-fixed border-collapse">
          <colgroup>
            {/* 이름만 폭을 주지 않는다 — 길이의 상한을 모르는 칸이 남는 폭을 갖는다. */}
            <col />
            <col style={{ width: '7rem' }} />
            <col style={{ width: '9rem' }} />
            <col style={{ width: '9rem' }} />
            <col style={{ width: '10rem' }} />
            <col style={{ width: '7rem' }} />
            <col style={{ width: '3rem' }} />
          </colgroup>
          <thead>
            <tr className={cn(tableGrid.head, 'border-b border-gray-200 bg-gray-25')}>
              <th className={cn('text-left', tableGrid.cellX, tableText.head)}>
                거래처명
                <span className={cn('ml-0.5', formText.required)}>*</span>
              </th>
              <th className={cn('text-left', tableGrid.cellX, tableText.head)}>구분</th>
              {/* 머리글은 한 이름으로 선다 — 줄마다 구분이 달라 라벨(사업자등록번호/생년월일)이
                  갈리므로, 그 이름은 칸 자신이 자리표시자와 접근명으로 든다. */}
              <th className={cn('text-left', tableGrid.cellX, tableText.head)}>등록번호</th>
              <th className={cn('text-left', tableGrid.cellX, tableText.head)}>은행</th>
              <th className={cn('text-left', tableGrid.cellX, tableText.head)}>계좌번호</th>
              <th className={cn('text-left', tableGrid.cellX, tableText.head)}>예금주</th>
              <th className={cn('text-center', tableGrid.cellX, tableText.head)}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const regLen = registrationLength(row.partnerType)
              const regLabel = registrationLabel(row.partnerType)
              return (
                <tr
                  key={index}
                  className={cn(tableGrid.row, 'border-b border-gray-200 last:border-b-0')}
                >
                  <td className={tableGrid.cellX}>
                    <Input
                      density="table"
                      aria-label={`${index + 1}행 거래처명`}
                      value={row.name}
                      onChange={(e) => setRow(index, { ...row, name: e.target.value })}
                    />
                  </td>
                  <td className={tableGrid.cellX}>
                    <Select
                      density="table"
                      aria-label={`${index + 1}행 구분`}
                      value={row.partnerType}
                      // 구분이 바뀌면 등록번호를 비운다 — 그 규칙은 partnerForm이 혼자 갖는다.
                      onChange={(e) =>
                        setRow(index, withPartnerType(row, e.target.value as PartnerType))
                      }
                    >
                      {PARTNER_TYPE_ORDER.map((t) => (
                        <option key={t} value={t}>
                          {PARTNER_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className={tableGrid.cellX}>
                    <Input
                      density="table"
                      inputMode="numeric"
                      aria-label={`${index + 1}행 ${regLabel}`}
                      placeholder={`${regLabel} ${regLen}자리`}
                      value={row.registrationNo}
                      onChange={(e) =>
                        setRow(index, {
                          ...row,
                          registrationNo: digitsOnly(e.target.value).slice(0, regLen),
                        })
                      }
                    />
                  </td>
                  <td className={tableGrid.cellX}>
                    <Select
                      density="table"
                      aria-label={`${index + 1}행 은행`}
                      value={row.bankCode}
                      onChange={(e) => setRow(index, { ...row, bankCode: e.target.value })}
                    >
                      <option value="">선택</option>
                      {BANKS.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className={tableGrid.cellX}>
                    <Input
                      density="table"
                      aria-label={`${index + 1}행 계좌번호`}
                      value={row.accountNo}
                      onChange={(e) =>
                        setRow(index, { ...row, accountNo: normalizeAccountNo(e.target.value) })
                      }
                    />
                  </td>
                  <td className={tableGrid.cellX}>
                    <Input
                      density="table"
                      aria-label={`${index + 1}행 예금주`}
                      value={row.accountHolder}
                      onChange={(e) => setRow(index, { ...row, accountHolder: e.target.value })}
                    />
                  </td>
                  {/* `IconButton`은 `grid`(블록 레벨)라 `text-center`가 닿지 않는다 — 감싸는
                      칸이 가운데로 세워야 머리글과 한 세로선에 선다. */}
                  <td className={tableGrid.cellX}>
                    <span className="flex items-center justify-center">
                      <IconButton
                        density="table"
                        variant="ghost"
                        danger
                        label={`${index + 1}행 삭제`}
                        onClick={() => removeRow(index)}
                        // 마지막 한 행은 남긴다 — 표가 통째로 사라지면 무엇을 적는 자리였는지 알 수 없다.
                        disabled={rows.length <= 1}
                        icon={<Trash2 size={14} />}
                      />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="border-t border-gray-200 p-2">
          <Button variant="ghost" density="table" onClick={addRow}>
            <Plus size={14} className="mr-1" />행 추가
          </Button>
        </div>
      </div>
    </Modal>
  )
}
