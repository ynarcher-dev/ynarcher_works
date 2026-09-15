import {
  Button,
  DataTable,
  DocumentPickerModal,
  EmptyValue,
  IconButton,
  PanelCard,
  tableText,
  type Column,
  type DocumentPickerItem,
} from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  PROGRAM_LINK_META,
  PROGRAM_LINK_TYPES,
  programLinkKind,
  programRefKey,
  type ProgramLinkDraft,
  type ProgramLinkType,
} from '@/features/approval/programLinkApi'
import {
  WORKSPACE_PICK_ALL,
  WORKSPACE_PICK_PAGE_SIZE,
  filterWorkspaceCandidates,
  pageOfWorkspaceCandidates,
  type WorkspaceCandidate,
} from '@/features/approval/workspacePicker'
import { useMinuteLinkPool } from '@/features/office/minutes/minuteLinkSearch'
import { useDebounced } from '@/lib/useDebounced'

interface Props {
  /** 지금 걸린 워크스페이스(0 또는 1건). 상위는 지금까지와 같은 명단 상태를 그대로 쓴다. */
  value: ProgramLinkDraft[]
  onChange: (next: ProgramLinkDraft[]) => void
  readOnly?: boolean
}

/** 후보 한 줄 → 표의 한 줄. 사업코드가 문서 번호 자리에, 구분이 문서 종류 자리에 선다. */
function toItem(row: WorkspaceCandidate): DocumentPickerItem {
  return {
    id: programRefKey(row),
    docNo: row.code,
    title: row.label,
    kind: PROGRAM_LINK_META[row.targetType].kindLabel,
  }
}

/**
 * 워크스페이스 표의 값 열 셋 — 사업코드·이름·구분.
 *
 * 문서 창의 네 칸에서 **기안자만 빠진다**. 워크스페이스에는 기안자가 없고, 빈 칸을 남겨 두면
 * 표가 "채워질 수 있는데 비어 있는 값"을 말하게 된다. 나머지 셋은 문서 창과 같은 자리·같은
 * 폭에 서서, 두 카드가 나란히 놓였을 때 눈이 같은 모서리를 따라간다.
 */
function workspaceValueColumns(): Column<DocumentPickerItem>[] {
  return [
    {
      key: 'docNo',
      header: '사업코드',
      // 문서 번호와 같은 성격(식별 코드)이라 같은 규격으로 선다 — 좌측 정렬·한 줄·고정폭.
      widthRem: 11,
      className: 'w-44 whitespace-nowrap',
      render: (row) => row.docNo ?? <EmptyValue />,
    },
    {
      key: 'title',
      header: '이름',
      type: 'name',
      primary: true,
      sortable: false,
      render: (row) => (
        <span className="block truncate" title={row.title}>
          {row.title}
        </span>
      ),
    },
    {
      key: 'kind',
      header: '구분',
      type: 'text',
      render: (row) => row.kind ?? <EmptyValue />,
    },
  ]
}

/**
 * 예산을 배정할 워크스페이스 — **품의서 본문과 예산표 사이**에 선다.
 *
 * 우측 패널이 아니라 본문 흐름에 두는 이유는, 예산표를 가진 품의에서 이 값이 곁들이는 정보가
 * 아니라 **예산이 누구 것인지 정하는 값**이기 때문이다. 아래 표에 적히는 금액이 어느 사업의
 * 예산인지를 그 표 바로 위에서 묻는다. 서버도 같은 것을 요구한다 —
 * `app.assert_budget_spend_submittable`은 예산표를 가진 품의가 워크스페이스 한 곳에 걸리지
 * 않으면 상신을 거절한다.
 *
 * **한 곳만 고른다.** 예산표는 곧 한 워크스페이스의 예산이라 두 곳에 걸면 같은 돈이 두
 * 사업에서 각각 자기 것으로 집계된다(DB 트리거 `check_approval_program_link_rules`가 같은
 * 규칙을 건다).
 *
 * 고르는 창은 근거 품의와 **같은 `DocumentPickerModal`**이다. 후보가 원장 전체라 "무엇이
 * 있는지 보러" 여는 자리라는 점이 같고, 그런 창이 화면마다 다른 모양이면 담당자가 매번 다시
 * 배운다. 다른 것은 값 열 셋과, 후보를 서버가 아니라 이미 읽어 둔 풀에서 좁힌다는 것뿐이다.
 */
export function ApprovalWorkspaceField({ value, onChange, readOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [kind, setKind] = useState<string>(WORKSPACE_PICK_ALL)
  const [page, setPage] = useState(0)
  const debouncedKeyword = useDebounced(keyword)

  useEffect(() => {
    setPage(0)
  }, [debouncedKeyword, kind])

  /**
   * 세 원장을 한 목록으로 합친다 — 고르는 사람은 원장 경계가 아니라 이름으로 찾는다.
   * 종류 목록(`PROGRAM_LINK_TYPES`)은 모듈 상수라 길이가 렌더마다 같다. 창이 서 있는 동안에만
   * 읽어(기안 화면 첫 로딩에 얹히지 않게) 세 원장을 각각 묻는다.
   */
  const projects = useMinuteLinkPool(programLinkKind('program'), open)
  const maPrograms = useMinuteLinkPool(programLinkKind('ma_program'), open)
  const funds = useMinuteLinkPool(programLinkKind('fund'), open)
  const pools = [projects, maPrograms, funds]
  const loading = pools.some((pool) => pool.isLoading)
  const isError = pools.some((pool) => pool.isError)

  const candidates = useMemo<WorkspaceCandidate[]>(
    () =>
      [projects.data, maPrograms.data, funds.data]
        .flatMap((rows) => rows ?? [])
        .map((row) => ({
          targetType: row.targetType as ProgramLinkType,
          targetId: row.targetId,
          label: row.label,
          code: row.code,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ko')),
    [projects.data, maPrograms.data, funds.data],
  )

  const narrowed = useMemo(
    () => filterWorkspaceCandidates(candidates, { keyword: debouncedKeyword, kind }),
    [candidates, debouncedKeyword, kind],
  )
  const items = useMemo(
    () => pageOfWorkspaceCandidates(narrowed, page).map(toItem),
    [narrowed, page],
  )

  const picked = value[0] ?? null
  const pickedItem = useMemo<DocumentPickerItem | null>(
    () =>
      picked
        ? toItem({
            targetType: picked.targetType,
            targetId: picked.targetId,
            label: picked.label,
            code: picked.code,
          })
        : null,
    [picked],
  )

  /** 고른 한 줄의 열 — 값 셋은 창과 공유하고, 해제만 이 화면이 더한다. */
  const pickedColumns = useMemo<Column<DocumentPickerItem>[]>(() => {
    const columns = workspaceValueColumns()
    if (readOnly) return columns
    return [
      ...columns,
      {
        key: '__clear',
        header: '',
        align: 'center',
        widthRem: 3,
        className: 'w-12',
        render: (row) => (
          <IconButton
            variant="ghost"
            density="table"
            label={`${row.title} 연동 해제`}
            onClick={() => onChange([])}
            icon={<X size={14} />}
          />
        ),
      },
    ]
  }, [readOnly, onChange])

  const openPicker = () => {
    setKeyword('')
    setKind(WORKSPACE_PICK_ALL)
    setPage(0)
    setOpen(true)
  }

  return (
    <PanelCard
      title="워크스페이스 연동"
      action={
        readOnly ? undefined : (
          // 카드 헤더의 조작이라 카드 맥락을 그대로 따른다(32px) — 근거 품의 패널과 짝이므로
          // 한쪽만 고치면 같은 화면에서 같은 뜻의 버튼이 두 크기로 선다.
          <Button variant="outline" onClick={openPicker}>
            {picked ? '변경' : '선택'}
          </Button>
        )
      }
    >
      {pickedItem ? (
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
        // 접지 않는다 — 고르지 않으면 상신 자체가 막히는 값이라, 그 사실이 말풍선 뒤에 있으면
        // 담당자는 상신 버튼을 눌러 보고서야 알게 된다.
        <p className={tableText.empty}>
          이 품의의 예산이 어느 워크스페이스의 것인지 고르세요. 한 곳만 고를 수 있으며, 고르지
          않으면 상신할 수 없습니다.
        </p>
      )}

      <DocumentPickerModal
        open={open}
        onClose={() => setOpen(false)}
        title="워크스페이스 선택"
        help="열람할 수 있는 사업·M&A·조합만 목록에 나옵니다. 예산표는 곧 한 워크스페이스의 예산이라 한 곳만 고를 수 있습니다."
        items={items}
        valueColumns={workspaceValueColumns()}
        loading={loading}
        error={isError}
        onRefresh={() => pools.forEach((pool) => void pool.refetch())}
        search={{
          value: keyword,
          onChange: setKeyword,
          label: '워크스페이스 검색',
          placeholder: '이름·사업코드로 검색',
        }}
        filter={{
          value: kind,
          allValue: WORKSPACE_PICK_ALL,
          options: [
            { value: WORKSPACE_PICK_ALL, label: '전체' },
            ...PROGRAM_LINK_TYPES.map((type) => ({
              value: type,
              label: PROGRAM_LINK_META[type].kindLabel,
            })),
          ],
          onChange: setKind,
        }}
        pagination={{
          page,
          pageSize: WORKSPACE_PICK_PAGE_SIZE,
          total: narrowed.length,
          onChange: setPage,
        }}
        value={pickedItem?.id ?? null}
        valueItem={pickedItem}
        onSubmit={(id) => {
          const next = candidates.find((candidate) => programRefKey(candidate) === id)
          // 고른 줄이 후보에서 사라졌다면(그 사이 원장이 바뀌었다면) 지금 값을 그대로 둔다 —
          // 이름을 알 수 없는 연동을 만들지 않는다.
          if (next) onChange([next])
        }}
        emptyText="연동할 수 있는 워크스페이스가 없습니다. 열람 권한이 있는 사업·M&A·조합이 있는지 확인하세요."
      />
    </PanelCard>
  )
}
