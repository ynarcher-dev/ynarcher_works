import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { cardText, formText } from '../densityScale'
import { Button } from '../components/Button'
import { Checkbox } from '../components/Checkbox'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Radio } from '../components/Radio'
import { Select } from '../components/Select'
import { Spinner } from '../components/Spinner'
import { documentPickerValueColumns } from './documentPickerColumns'
import {
  documentPickerView,
  resolvePickedItem,
  type DocumentPickerItem,
} from './documentPickerState'

/** '보기' 필터 한 축. 선택지가 둘 이상일 때만 넘긴다 — 한 칸짜리 드롭다운은 고를 것이 없다. */
export interface DocumentPickerFilter {
  /** 라벨(기본 '보기'). 화면에 글자로 서고 그대로 컨트롤의 접근명이 된다. */
  label?: string
  value: string
  /** 좁히지 않은 상태의 값. 이 값이면 '검색 결과 없음'이 아니라 '후보 없음'으로 적는다. */
  allValue: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
}

export interface DocumentPickerSearch {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** 검색칸의 접근명. 칸 안에 글자 라벨을 세우지 않으므로 이것이 이름을 대신한다. */
  label?: string
}

export interface DocumentPickerModalProps {
  open: boolean
  onClose: () => void
  /** 무엇을 고르는 창인가(예: `근거 품의 선택`). */
  title: string
  /** 고르는 규칙·후보 범위. 제목 옆 도움말로 접힌다. */
  help?: ReactNode
  /** 지금 페이지의 후보. 자르기·정렬은 서버가 하고 창은 받은 것만 세운다. */
  items: DocumentPickerItem[]
  loading?: boolean
  error?: boolean
  /**
   * 목록을 다시 읽는다. 명시적인 새로고침 버튼과 실패 화면의 '다시 시도'가 같은 동작을 부른다 —
   * 둘을 갈라 두면 같은 일에 이름이 둘이 된다.
   */
  onRefresh: () => void
  search: DocumentPickerSearch
  filter?: DocumentPickerFilter
  /** 서버 페이지네이션(0-base). 전체 건수는 `count: 'exact'`로 센 값이어야 페이지 수가 맞는다. */
  pagination: { page: number; pageSize: number; total: number; onChange: (page: number) => void }
  /** 확정된 값. 창을 열 때의 시작점이며, 취소하면 이 값이 그대로 남는다. */
  value: string | null
  /**
   * 확정된 값의 표시 정보. 그 문서가 지금 페이지에 없어도 아래 '현재 선택'이 서야 하므로
   * 목록과 별개로 받는다.
   */
  valueItem?: DocumentPickerItem | null
  /**
   * 확인(한 건). 창을 닫는 일은 이 컴포넌트가 이어서 하므로 호출부는 값만 받는다.
   *
   * 여럿 고르는 창에서는 `onSubmitMany`가 대신 받는다 — **둘 중 하나는 반드시 넘긴다.**
   */
  onSubmit?: (id: string, item: DocumentPickerItem | null) => void
  /**
   * 확인(여러 건). 넘기면 줄마다 라디오 대신 **체크박스**가 서고, 머리글에 이 페이지 전체를
   * 켜고 끄는 칸이 붙는다.
   *
   * 여럿 고르기를 기본으로 두지 않는 이유는 그대로다 — 고른 것이 하나뿐인 자리에서 체크박스를
   * 보이면 담당자는 둘째 줄을 눌렀을 때 첫째가 풀리는 것을 납득하지 못한다. 반대로 **고른 만큼
   * 줄이 생기는 자리**(지출 내역·송금 요청)에서는 한 건씩 창을 열고 닫는 일이 건수만큼 반복된다.
   *
   * 순서는 **고른 차례**다 — 받는 쪽이 첫 번째를 지금 줄에 넣고 나머지를 새 줄로 펴므로,
   * 페이지 순서로 다시 세우면 담당자가 처음 고른 것이 지금 줄에 들어가지 않는다.
   */
  onSubmitMany?: (ids: string[], items: DocumentPickerItem[]) => void
  /**
   * 값을 비울 수 있는 창인가. 넘기면 푸터에 '선택 해제'가 서고, 그것으로 고른 줄을 푼 뒤
   * **확인을 눌러야** 비워진다 — 창 안의 모든 조작이 확인 전까지 임시라는 약속을 이 버튼만
   * 예외로 두면, 취소로 되돌릴 수 있는 것과 없는 것이 같은 자리에 섞인다.
   */
  onClear?: () => void
  /**
   * 도구줄(검색·보기 옆)에 세우는 조작 하나. '이 목록에 없다'는 사실을 그 자리에서 푸는
   * 버튼(예: 거래처 즉석 등록)을 위한 자리다 — 창을 닫고 다른 화면에 다녀오게 하면 쓰던
   * 문서가 그대로 남아 있는지부터 걱정하게 된다.
   */
  actions?: ReactNode
  /** 문서 종류 열의 머리글(양식·구분 등 원장마다 부르는 이름이 다르다). */
  kindHeader?: string
  /**
   * 값 열을 다른 것으로 바꾼다(기본은 문서 번호·제목·기안자·문서 종류).
   *
   * 문서가 아닌 원장을 같은 모양으로 고를 때 쓴다 — 워크스페이스에는 기안자가 없고 문서
   * 번호 대신 사업코드가 선다. 창의 나머지(검색·보기·페이지·라디오·현재 선택)는 그대로라,
   * 고르는 일이 원장마다 다른 모양이 되지 않는다. 고르는 열(라디오)은 이 목록이 아니라
   * 창이 언제나 맨 앞에 세운다.
   */
  valueColumns?: Column<DocumentPickerItem>[]
  /** 고를 것이 하나도 없을 때의 안내 — 이 창을 닫고 무엇을 먼저 해야 하는지 답한다. */
  emptyText: string
  /** 검색·필터로 좁혀 결과가 없을 때. */
  noResultText?: string
  /** 조회 실패 안내. 재시도 버튼은 컴포넌트가 붙인다. */
  errorText?: string
}

/**
 * 많은 문서 중에서 **한 건**을 검색해 고르는 창.
 *
 * 고르는 목록이 몇 줄이 아니라 원장 전체일 때 쓴다. 후보가 수십·수백 건이면 "무엇이 있는지
 * 보러" 여는 자리이므로 드롭다운이 아니라 표를 품은 모달이고(5_component_spec_rules §2.3 NOTE),
 * 표가 들어가므로 폭은 `modal-xl`이다(§3.5).
 *
 * **기본은 여럿이 아니라 하나다.** 체크박스를 깔지 않고 줄마다 라디오를 세우는 이유가
 * 그것이다 — 고른 것이 하나뿐이라는 사실을 형태가 말해야, 담당자가 둘째 줄을 눌렀을 때 첫째가
 * 풀리는 것을 납득한다. 줄 전체도 같은 일을 하므로 작은 표식을 겨눌 필요는 없다.
 *
 * 고른 만큼 줄이 생기는 자리에서만 `onSubmitMany`로 체크박스를 켠다 — 형태(라디오/체크박스)와
 * 결과(하나로 확정/여럿으로 폄)가 언제나 같은 것을 가리키게 한다.
 *
 * 순수 UI다 — 조회·검색·필터·페이지는 전부 호출부가 갖고 여기는 받은 것을 세운다. 창이
 * 스스로 들고 있는 상태는 **아직 확정되지 않은 선택**뿐이다. 취소하면 그 임시 선택이
 * 버려지고 원래 값이 남으며, 다시 열면 현재 값에서 시작한다.
 */
export function DocumentPickerModal({
  open,
  onClose,
  title,
  help,
  items,
  loading = false,
  error = false,
  onRefresh,
  search,
  filter,
  pagination,
  value,
  valueItem = null,
  onSubmit,
  onSubmitMany,
  onClear,
  actions,
  kindHeader = '문서 종류',
  valueColumns,
  emptyText,
  noResultText = '검색 결과가 없습니다. 검색어나 보기 조건을 바꿔 보세요.',
  errorText = '목록을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.',
}: DocumentPickerModalProps) {
  // 여럿 고르기 창인가. 받는 쪽이 여러 건을 감당하는지로만 갈린다 — 형태만 바꾸고 결과는
  // 한 건으로 내는 창을 만들면 체크박스가 거짓말을 한다.
  const multi = Boolean(onSubmitMany)
  /**
   * 아직 확정되지 않은 선택 — **고른 차례대로** 든다.
   *
   * 하나만 고르는 창에서도 같은 배열을 쓴다(길이가 0 또는 1). 두 벌의 상태를 두면 '확인이
   * 눌리는가'·'선택 해제가 서는가' 같은 판정을 두 번 적게 되고, 그 둘이 갈리는 순간 형태와
   * 결과가 어긋난다.
   */
  const [pendingIds, setPendingIds] = useState<string[]>(value ? [value] : [])
  /**
   * 마지막으로 본 '고른 줄'들. 목록에서 사라져도 아래 요약이 남아야 하므로 창이 들고 있는다
   * (`resolvePickedItem`).
   */
  const [remembered, setRemembered] = useState<DocumentPickerItem[]>(valueItem ? [valueItem] : [])
  const wasOpen = useRef(false)
  // 라디오 묶음 이름. 같은 화면에 이 창이 둘 있으면(근거 품의·변경 대상 품의) 이름이 겹쳐
  // 한쪽을 고르는 순간 다른 쪽이 풀린다.
  const radioName = useId()

  // 창이 열리는 **순간**에만 현재 값으로 되돌린다. 열려 있는 동안 값이 다시 흘러들면 고르던
  // 중에 선택이 원래 값으로 튕긴다(`valueItem`은 호출부가 매 렌더 새로 만드는 객체다).
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPendingIds(value ? [value] : [])
      setRemembered(valueItem ? [valueItem] : [])
    }
    wasOpen.current = open
  }, [open, value, valueItem])

  /** 고른 줄들의 표시 정보. 지금 페이지에 없는 줄은 기억해 둔 것이 답한다. */
  const pickedItems = pendingIds
    .map((id) => resolvePickedItem(id, items, remembered.find((r) => r.id === id) ?? null))
    .filter((item): item is DocumentPickerItem => item !== null)
  const picked = pickedItems[0] ?? null
  // 비울 것이 있어야 비운다 — 처음부터 비어 있던 창에서 확인이 켜져 있으면, 아무것도 고르지
  // 않고 확인을 눌러도 무언가 정해진 것처럼 보인다.
  const clearable = Boolean(onClear) && Boolean(value) && pendingIds.length === 0
  const narrowed =
    search.value.trim().length > 0 || (filter ? filter.value !== filter.allValue : false)
  const view = documentPickerView({ loading, error, itemCount: items.length, narrowed })

  const choose = (item: DocumentPickerItem) => {
    if (!multi) {
      setPendingIds([item.id])
      setRemembered([item])
      return
    }
    // 여럿 고르기에서는 같은 줄을 다시 누르면 풀린다(체크박스의 뜻 그대로).
    setPendingIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
    )
    setRemembered((prev) => (prev.some((r) => r.id === item.id) ? prev : [...prev, item]))
  }

  // 이 페이지 전체를 켜고 끈다. 페이지 **밖**의 선택은 건드리지 않는다 — 검색으로 좁혀
  // 두 페이지에서 나눠 고른 것이 셋째 페이지의 전체 해제로 함께 풀리면 되돌릴 길이 없다.
  const pageAllChecked = items.length > 0 && items.every((i) => pendingIds.includes(i.id))
  const pageSomeChecked = items.some((i) => pendingIds.includes(i.id))
  const togglePage = () => {
    const pageIds = items.map((i) => i.id)
    if (pageAllChecked) {
      setPendingIds((prev) => prev.filter((id) => !pageIds.includes(id)))
      return
    }
    setPendingIds((prev) => [...prev, ...pageIds.filter((id) => !prev.includes(id))])
    setRemembered((prev) => [...prev, ...items.filter((i) => !prev.some((r) => r.id === i.id))])
  }

  const columns: Column<DocumentPickerItem>[] = [
    {
      key: '__pick',
      header: multi ? (
        <span className="flex items-center justify-center">
          <Checkbox
            checked={pageAllChecked}
            // 일부만 켜진 상태는 '켜짐'도 '꺼짐'도 아니다 — DOM 속성이라 ref로만 준다.
            ref={(el) => {
              if (el) el.indeterminate = pageSomeChecked && !pageAllChecked
            }}
            onChange={togglePage}
            disabled={items.length === 0}
            aria-label="이 페이지 전체 선택"
          />
        </span>
      ) : (
        '선택'
      ),
      align: 'center',
      // 값이 아니라 조작이 놓이는 열이라 종류가 없다 — 폭은 `widthRem`이 답한다(§3.1).
      widthRem: 3.5,
      className: 'w-14',
      render: (row) => (
        <div className="flex items-center justify-center">
          {multi ? (
            <Checkbox
              checked={pendingIds.includes(row.id)}
              onChange={() => choose(row)}
              aria-label={`${row.title} 선택`}
            />
          ) : (
            <Radio
              name={radioName}
              checked={pendingIds[0] === row.id}
              onChange={() => choose(row)}
              aria-label={`${row.title} 선택`}
            />
          )}
        </div>
      ),
    },
    ...(valueColumns ?? documentPickerValueColumns(kindHeader)),
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      help={help}
      // 표를 품는 대화의 폭(§3.5).
      size="xl"
      footer={
        <div className="flex w-full min-w-0 items-center gap-3">
          {/* 현재 선택은 푸터에 둔다 — 본문이 스크롤되어도 무엇을 고른 채로 확인을 누르는지가
              버튼 옆에 남아야 한다. 검색·페이지로 그 줄이 목록 밖으로 나가도 여기는 남는다. */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className={cn('shrink-0', cardText.label)}>현재 선택</span>
            {picked ? (
              <>
                {/* 여럿일 때는 건수가 먼저다 — 이름만 이어 적으면 창이 좁을수록 끝이 잘려
                    몇 건을 고른 채 확인을 누르는지가 사라진다. */}
                <span className={cn('shrink-0', cardText.meta)}>
                  {multi ? `${pickedItems.length}건` : (picked.docNo ?? '번호 없음')}
                </span>
                <span
                  className={cn('min-w-0 truncate', cardText.value)}
                  title={pickedItems.map((i) => i.title).join(', ')}
                >
                  {pickedItems.map((i) => i.title).join(', ')}
                </span>
              </>
            ) : (
              <span className={formText.hint}>아직 고르지 않았습니다.</span>
            )}
          </div>
          {onClear && pendingIds.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setPendingIds([])
                setRemembered([])
              }}
            >
              선택 해제
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            // 고른 것이 없어도, 확정된 값을 비우는 일이 남아 있으면 확인은 눌린다.
            disabled={pendingIds.length === 0 && !clearable}
            onClick={() => {
              const first = pendingIds[0]
              if (onSubmitMany && pendingIds.length > 0) onSubmitMany(pendingIds, pickedItems)
              else if (first) onSubmit?.(first, picked)
              else if (clearable) onClear?.()
              else return
              onClose()
            }}
          >
            확인
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-80">
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? '제목·문서 번호·문서 종류·기안자로 검색'}
              aria-label={search.label ?? '문서 검색'}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              }
            />
          </div>
          {filter && (
            <label className="flex items-center gap-2">
              <span className={cn('shrink-0', formText.label)}>{filter.label ?? '보기'}</span>
              <Select
                className="w-44"
                value={filter.value}
                onChange={(e) => filter.onChange(e.target.value)}
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            {actions}
            <Button variant="outline" onClick={onRefresh}>
              새로고침
            </Button>
          </div>
        </div>

        {view === 'error' ? (
          <EmptyState
            title="목록을 읽지 못했습니다."
            description={errorText}
            action={
              <Button variant="outline" onClick={onRefresh}>
                다시 시도
              </Button>
            }
          />
        ) : view === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Spinner />
            <span className={formText.hint}>불러오는 중입니다…</span>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
            // 고르는 열은 이 창이 맨 앞에 직접 세운다(`__pick`) — 표가 주는 선택 열은
            // 값을 확정하는 일과 무관해, 둘을 함께 두면 같은 줄에 표식이 둘이 된다.
            selectable={false}
            numbered={false}
            standardColumns={false}
            layout="fixed"
            onRowClick={choose}
            rowClassName={(row) => (pendingIds.includes(row.id) ? 'bg-brand/5' : undefined)}
            emptyText={view === 'empty-narrowed' ? noResultText : emptyText}
            pagination={{
              page: pagination.page,
              pageSize: pagination.pageSize,
              total: pagination.total,
              onChange: pagination.onChange,
            }}
          />
        )}
      </div>
    </Modal>
  )
}
