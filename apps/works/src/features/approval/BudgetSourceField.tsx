import {
  Button,
  DataTable,
  DocumentPickerModal,
  IconButton,
  PanelCard,
  documentPickerValueColumns,
  tableText,
  type Column,
  type DocumentPickerItem,
} from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useBudgetSourceDocuments } from '@/features/approval/budgetApi'
import {
  BUDGET_SOURCE_ALL_FORMS,
  BUDGET_SOURCE_PAGE_SIZE,
  budgetSourceViewOptions,
  type BudgetSourceForm,
} from '@/features/approval/budgetSourceQuery'
import { approvalFormDisplayName } from '@/features/approval/model'
import { useEmployees } from '@/features/management/hooks'
import { useDebounced } from '@/lib/useDebounced'

interface Props {
  /** 예산표를 가진 양식들. 비어 있으면 고를 대상 자체가 없다. */
  forms: BudgetSourceForm[]
  value: string | null
  onChange: (next: string | null) => void
  /**
   * 고른 문서의 표시용 정보(다시 열 때 이름을 보이려면 필요하다).
   *
   * 고르는 창의 표와 **같은 네 칸**(문서 번호·제목·기안자·문서 종류)을 채울 만큼 받는다.
   * 창에서 네 칸으로 읽던 것이 닫고 나면 제목 한 줄로 줄어들면, 같은 이름의 품의가 둘일 때
   * 어느 쪽을 고른 것인지 다시 창을 열어야 답할 수 있다.
   *
   * **금액을 담지 않는다.** 고르는 자리에서 품의 금액·사용 가능액을 보이면 담당자는 남은 돈이
   * 많은 품의를 고르게 되는데, 이 자리가 묻는 것은 "이 지출이 **어느 품의의 일**인가"다.
   * 금액은 고른 뒤 아래 예산표가 답한다.
   */
  picked: {
    id: string
    title: string
    docNo: string | null
    drafterId: string | null
    formName: string | null
  } | null
  /** 이 양식이 근거 품의를 반드시 요구하는가. */
  required: boolean
  /** 변경 대상 품의를 고르는 자리인가(예산 변경 품의). 라벨이 달라진다. */
  revise?: boolean
  readOnly?: boolean
}

/**
 * 근거 품의 — 이 지출이 어느 품의의 돈을 쓰는가(예산 변경 품의라면 무엇을 고치는가).
 *
 * **본문 앞에 선다.** 품의를 골라야 지출 내역의 예산 줄을 고를 수 있으므로, 뒤에 두면
 * 담당자가 내역을 적다가 위로 되돌아와야 한다.
 *
 * 후보는 **승인이 끝난 품의만**이다 — 흐르는 중인 품의의 예산은 아직 확정된 돈이 아니라,
 * 그 위에 지출을 걸면 결재 도중 예산이 바뀌어 차감의 근거가 흔들린다.
 *
 * 고르는 창은 공용 `DocumentPickerModal`이 갖는다. 후보가 원장 전체라 "무엇이 있는지 보러"
 * 여는 자리이고, 그런 창은 works 어디서나 같은 모양이어야 한다 — 이 화면이 갖는 것은
 * 무엇을 물을지(검색어·보기·페이지)와 그 답을 서버에서 어떻게 받아 오는가뿐이다.
 */
export function BudgetSourceField({
  forms,
  value,
  onChange,
  picked,
  required,
  revise = false,
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [formFilterId, setFormFilterId] = useState(BUDGET_SOURCE_ALL_FORMS)
  const [page, setPage] = useState(0)
  // 매 글자마다 원장을 묻지 않는다 — 검색칸을 눅이는 방식은 이 저장소의 다른 고르기 창
  // (비활성 원장·외부 참석자)과 같다. 엔터를 따로 요구하면 같은 일에 조작이 둘이 된다.
  const debouncedKeyword = useDebounced(keyword)
  const label = revise ? '변경 대상 품의' : '근거 품의'

  // 좁히는 조건이 바뀌면 첫 페이지로 돌아간다. 7페이지에 선 채로 검색하면 결과가 세 건인데
  // 빈 표가 보이고, 담당자는 "검색 결과가 없다"로 읽는다.
  useEffect(() => {
    setPage(0)
  }, [debouncedKeyword, formFilterId])

  const { data, isLoading, isError, refetch } = useBudgetSourceDocuments(
    {
      forms,
      keyword: debouncedKeyword,
      formFilterId,
      page,
      pageSize: BUDGET_SOURCE_PAGE_SIZE,
    },
    open,
  )

  // 기안자 이름은 문서 표에 없다. 임직원 원장은 결재 화면이 이미 한 번 읽어 두는 조회라
  // (같은 쿼리 키를 공유한다) 줄마다 이름을 묻는 일이 생기지 않는다.
  const { data: employees } = useEmployees()
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees ?? []) m.set(e.id, e.name)
    return m
  }, [employees])

  /** 원장 한 줄 → 표의 한 줄. 후보와 고른 값이 **같은 변환**을 거쳐야 같은 칸으로 선다. */
  const toItem = (row: {
    id: string
    docNo: string | null
    title: string
    drafterId: string | null
    formName: string | null
  }): DocumentPickerItem => ({
    id: row.id,
    docNo: row.docNo,
    title: row.title,
    // 이름을 확정할 수 없으면(복원 문서·퇴사 등) 비운다 — 표가 `-`로 적는다.
    drafter: row.drafterId ? nameById.get(row.drafterId) : undefined,
    kind: row.formName ? approvalFormDisplayName(row.formName) : undefined,
  })

  const items = useMemo<DocumentPickerItem[]>(
    () => (data?.rows ?? []).map(toItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, nameById],
  )

  const pickedItem = useMemo<DocumentPickerItem | null>(
    () => (picked ? toItem(picked) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picked, nameById],
  )

  /**
   * 고른 한 줄의 열 — 값 넷은 고르는 창과 공유하고, 해제만 이 화면이 더한다.
   * 머리글을 세우는 이유는 네 칸이 각각 무엇인지 창을 열지 않고 읽히게 하기 위해서다.
   */
  const pickedColumns = useMemo<Column<DocumentPickerItem>[]>(() => {
    const columns = documentPickerValueColumns()
    if (readOnly) return columns
    return [
      ...columns,
      {
        key: '__clear',
        // 머리글을 비워 두면 X 하나가 무엇을 지우는 것인지(줄인지 문서인지 연동인지) 답할
        // 자리가 없다. 값 넷이 이름을 들고 서 있는 표라, 조작 열만 이름이 없을 이유가 없다.
        header: '연동 해제',
        align: 'center',
        // `widthRem`과 `className`의 폭은 반드시 같은 값이어야 한다(6rem = 96px = w-24).
        widthRem: 6,
        className: 'w-24',
        // `IconButton`은 `grid`(블록 레벨)라 셀의 `text-center`가 닿지 않는다 — 머리글만
        // 가운데 서고 아이콘은 셀 왼쪽에 붙는다. 가운데 정렬은 감싸는 칸이 해야 한다.
        render: (row) => (
          <span className="flex items-center justify-center">
            <IconButton
              variant="ghost"
              density="table"
              label={`${row.title} ${label} 해제`}
              onClick={() => onChange(null)}
              icon={<X size={14} />}
            />
          </span>
        ),
      },
    ]
  }, [readOnly, label, onChange])

  const viewOptions = useMemo(() => budgetSourceViewOptions(forms), [forms])

  const openPicker = () => {
    setKeyword('')
    setFormFilterId(BUDGET_SOURCE_ALL_FORMS)
    setPage(0)
    setOpen(true)
  }

  return (
    <PanelCard
      title={label}
      action={
        readOnly ? undefined : (
          // 카드 헤더의 조작이라 카드 맥락을 그대로 따른다(32px) — 표 셀 규격(24px)으로
          // 눌러 두면 바로 위 '문서 연결'·'전체보기'와 같은 자리의 버튼이 저 혼자 작아진다.
          <Button variant="outline" onClick={openPicker}>
            {value ? '변경' : '선택'}
          </Button>
        )
      }
    >
      {value && pickedItem ? (
        <DataTable
          columns={pickedColumns}
          rows={[pickedItem]}
          rowKey={(row) => row.id}
          selectable={false}
          numbered={false}
          standardColumns={false}
          layout="fixed"
        />
      ) : (
        // **이 안내는 접지 않는다.** 왜 예산 줄을 고를 수 없는지를 말하는 차단 안내라,
        // 말풍선 뒤에 숨기면 담당자는 아래 표의 빈 선택지 앞에서 이유를 알 수 없다.
        <p className={tableText.empty}>
          {required
            ? `${label}를 골라야 지출 내역에서 예산 줄을 고를 수 있습니다.`
            : `${label}를 고르면 그 품의의 예산에서 차감됩니다. 비워 두어도 상신할 수 있습니다.`}
        </p>
      )}

      <DocumentPickerModal
        open={open}
        onClose={() => setOpen(false)}
        title={`${label} 선택`}
        help="승인이 끝난 품의만 고를 수 있습니다. 예산 변경 품의는 같은 돈을 두 번 쓰게 되므로 후보에 들지 않으며, 열람 권한이 없는 품의는 목록에 나오지 않습니다."
        items={items}
        loading={isLoading}
        error={isError}
        onRefresh={() => void refetch()}
        search={{
          value: keyword,
          onChange: setKeyword,
          label: `${label} 검색`,
          placeholder: '제목·문서 번호·문서 종류·기안자로 검색',
        }}
        filter={
          viewOptions
            ? {
                value: formFilterId,
                allValue: BUDGET_SOURCE_ALL_FORMS,
                options: viewOptions,
                onChange: setFormFilterId,
              }
            : undefined
        }
        pagination={{
          page,
          pageSize: BUDGET_SOURCE_PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
        }}
        value={value}
        valueItem={pickedItem}
        onSubmit={(id) => onChange(id)}
        emptyText={
          forms.length === 0
            ? '예산표를 가진 양식이 없습니다. ADMIN 결재 양식 관리에서 품의서 양식에 예산표를 추가하세요.'
            : '조회 가능한 승인 품의가 없습니다.'
        }
      />
    </PanelCard>
  )
}
