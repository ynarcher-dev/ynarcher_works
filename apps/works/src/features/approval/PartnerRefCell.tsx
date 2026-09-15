import {
  Badge,
  Button,
  DocumentPickerModal,
  EmptyValue,
  PickerField,
  useToast,
  type Column,
  type DocumentPickerItem,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import type { PartnerSnapshot } from '@/features/approval/partnerSnapshot'
import { bankLabel } from '@/features/management/partners/config'
import {
  fetchPartnerPaymentDetail,
  usePartnerOption,
  usePartnerOptions,
  type PartnerOption,
  type PartnerPaymentDetail,
} from '@/features/management/partners/partnerDirectoryApi'
import { PartnerQuickAddModal } from '@/features/management/partners/PartnerQuickAddModal'

interface Props {
  /** 표 머리글의 이름(`거래처명`). 칸의 접근명이 이 문구로 시작한다. */
  label: string
  /** 저장된 값 — 거래처 원장 행의 id 하나. */
  value: string
  /** 그 줄이 든 이름 사본. 비어 있으면(사본 열이 없는 옛 양식) 원장이 이름을 답한다. */
  snapshotName: string
  /** 고른 거래처 한 벌(또는 해제). 줄의 사본 칸들을 한 번에 갈아 끼우는 일은 표가 한다. */
  onPick: (snapshot: PartnerSnapshot | null) => void
  /**
   * 여럿을 한 번에 고른 결과 — **첫 벌이 이 줄에 들어가고 나머지는 새 줄이 된다**(그 폄은
   * 표가 한다). 넘기면 고르는 창이 체크박스로 선다.
   *
   * 송금 요청은 거래처 하나에 한 줄이라, 열 곳에 보내는 요청서는 창을 열고 닫는 일이 열 번
   * 반복된다 — 고르는 일 자체는 같은 목록에서 이어지는 한 번의 일인데도 그렇다.
   */
  onPickMany?: (snapshots: PartnerSnapshot[]) => void
}

/** 한 페이지에 세우는 줄 수. 검색이 원장 전체를 훑는 자리라 페이지가 길면 고르기 전에 지친다. */
const PARTNER_PICK_PAGE_SIZE = 10

/** 후보 한 줄 → 표의 한 줄. 거래처 코드가 문서 번호 자리에, 거래처명이 제목 자리에 선다. */
function toItem(row: PartnerOption): DocumentPickerItem {
  return { id: row.id, docNo: row.code, title: row.name }
}

/**
 * 거래처 표의 값 열 다섯 — 코드·거래처명·은행·계좌·예금주.
 *
 * 은행·계좌·예금주는 `DocumentPickerItem`에 없는 값이라 원장 줄을 id로 되찾아 적는다. 창이
 * 문서 말고 다른 원장도 같은 모양으로 고르게 하려고 값 열을 밖으로 냈으므로(`valueColumns`),
 * 창이 아는 네 칸에 억지로 욱여넣기보다 여기서 필요한 칸을 세우는 편이 맞다.
 */
function partnerValueColumns(byId: Map<string, PartnerOption>): Column<DocumentPickerItem>[] {
  return [
    {
      key: 'docNo',
      header: '코드',
      // 문서 번호와 같은 성격(식별 코드)이라 같은 규격으로 선다 — 좌측 정렬·한 줄·고정폭.
      // `widthRem`과 `className`의 폭은 반드시 같은 값이어야 한다(7rem = 112px = w-28).
      widthRem: 7,
      className: 'w-28 whitespace-nowrap tabular-nums',
      render: (row) => row.docNo ?? <EmptyValue />,
    },
    {
      key: 'title',
      header: '거래처명',
      type: 'name',
      primary: true,
      // 순서는 서버가 정한다(코드순). 표가 스스로 정렬하면 지금 페이지만 다시 늘어선다.
      sortable: false,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate" title={row.title}>
            {row.title}
          </span>
          {/* 거래가 끝난 거래처도 목록에 남는다(과거 요청을 설명해야 한다).
              새로 고르는 자리에서는 그 사실이 보여야 한다. */}
          {byId.get(row.id)?.isActive === false && <Badge tone="neutral">거래 중단</Badge>}
        </span>
      ),
    },
    {
      key: 'bank',
      header: '은행',
      type: 'text',
      render: (row) => {
        const code = byId.get(row.id)?.bankCode
        return code ? bankLabel(code) : <EmptyValue />
      },
    },
    {
      key: 'account',
      header: '계좌',
      // 계좌번호는 자릿수를 견주는 값이 아니라 식별 값이다 — 코드 열과 같은 규격으로 선다
      // (9rem = 144px = w-36).
      widthRem: 9,
      className: 'w-36 whitespace-nowrap tabular-nums',
      render: (row) => {
        const last4 = byId.get(row.id)?.accountNoLast4
        return last4 ? `****${last4}` : <EmptyValue />
      },
    },
    {
      key: 'holder',
      header: '예금주',
      type: 'person',
      render: (row) => byId.get(row.id)?.accountHolder || <EmptyValue />,
    },
  ]
}

/**
 * 송금 요청 한 줄의 '거래처명' 칸 — **원장에서 고르기만 한다.**
 *
 * 이름을 글자로 적는 칸을 두지 않는 이유는 지급 담당자가 계좌를 확인할 곳이 없어지기
 * 때문이다. 원장에 없으면 그 자리에서 넣되 **원장에 먼저 들어간 뒤** 이 줄이 그 행을 가리킨다.
 *
 * 고르는 순간 **그때의 계좌 한 벌이 이 줄에 적힌다**(2026-09-15에 뒤집힌 판단 — 근거는
 * `partnerSnapshot.ts`). 종전에는 은행·계좌·예금주를 원장이 매번 답했고, 그래서 결재가 끝난
 * 뒤 원장을 고치면 이미 승인된 요청서의 계좌가 함께 바뀌었다. 승인된 지시가 나중에 바뀌면
 * 그 문서는 무엇을 승인한 것인지 답하지 못한다.
 *
 * 계좌 **전체**는 고른 뒤 한 건만 온다(`trade_partner_payment_detail`). 목록은 가려진 뷰를
 * 읽어 뒤 4자리만 보인다 — 원장을 훑는 일에 계좌 전체가 필요하지는 않다.
 *
 * 고르는 창은 근거 품의와 **같은 `DocumentPickerModal`**이다(2026-09-15 사용자 확정). 후보가
 * 원장 전체라 "무엇이 있는지 보러" 여는 자리라는 점이 같고, 그런 창이 화면마다 다른 모양이면
 * 담당자가 매번 다시 배운다. 값은 확인을 눌러야 정해지므로, **계좌 전체를 부르는 조회도 확인
 * 한 번에 한 번씩만** 일어난다(그 조회는 `access_logs`에 남는다). 표 안에서는 체크박스가 서고
 * 고른 만큼 줄이 생긴다(`onPickMany`) — 표 밖에서는 종전대로 라디오 한 줄이다.
 *
 * 경영지원의 계좌 확인 여부('확인 전' 딱지)는 이 창에 세우지 않는다(2026-09-15 사용자 확정).
 * 고르는 사람이 정하는 값이 아니고 여기서 거르는 데도 쓰이지 않는다. 결재자가 읽는 자리
 * (`RefCellText`)와 거래처 원장 화면에는 그대로 선다.
 */
export function PartnerRefCell({ label, value, snapshotName, onPick, onPickMany }: Props) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  // 사본에 이름이 있으면 원장에 묻지 않는다. 읽는 이유는 사본 열이 없는 옛 양식의 이름 때문이다.
  const { data: picked } = usePartnerOption(value || null)
  const { data: options, isLoading, isError, refetch } = usePartnerOptions(keyword)

  // 검색어를 바꾸면 첫 페이지로 돌아간다 — 세 번째 페이지를 보던 중 목록이 두 줄로 줄면
  // 빈 표 앞에서 "결과가 없다"고 읽게 된다.
  useEffect(() => {
    setPage(0)
  }, [keyword])

  const all = useMemo(() => options ?? [], [options])
  /** 값 열이 원장 줄을 되찾는 통로. 창이 아는 것은 id·코드·이름 셋뿐이다. */
  const byId = useMemo(() => new Map(all.map((o) => [o.id, o])), [all])
  const columns = useMemo(() => partnerValueColumns(byId), [byId])
  // 후보를 서버가 아니라 이미 읽어 둔 목록에서 자른다(검색 한 번이 최대 50건을 가져온다).
  const items = useMemo(
    () => all.slice(page * PARTNER_PICK_PAGE_SIZE, (page + 1) * PARTNER_PICK_PAGE_SIZE).map(toItem),
    [all, page],
  )

  const displayName = snapshotName || picked?.name || ''
  /**
   * 확정된 값의 표시 정보. 그 거래처가 지금 페이지에 없어도 푸터의 '현재 선택'이 서야 하므로
   * 목록과 별개로 넘긴다. 코드를 모르면(원장을 읽지 못하는 사용자) 이름만으로 선다.
   */
  const valueItem = useMemo<DocumentPickerItem | null>(
    () => (value ? { id: value, docNo: picked?.code ?? null, title: displayName } : null),
    [value, picked, displayName],
  )

  const toSnapshot = (detail: PartnerPaymentDetail): PartnerSnapshot => ({
    id: detail.id,
    name: detail.name,
    partnerType: detail.partnerType,
    bankCode: detail.bankCode ?? '',
    accountNo: detail.accountNo ?? '',
    accountHolder: detail.accountHolder ?? '',
  })

  /**
   * 고른 여러 건을 사본 여러 벌로 옮긴다.
   *
   * 계좌 전체는 줄마다 한 번씩 부른다(`access_logs`에도 그만큼 남는다) — 목록이 든 값은 뒤
   * 4자리뿐이라 건수를 줄일 방법이 없다.
   *
   * **읽은 것까지는 넣는다.** 한 건이 실패했다고 아홉 건을 버리면 담당자는 다시 열 건을
   * 고르게 되는데, 그 다음 시도에서도 같은 한 건이 실패한다. 대신 어느 거래처가 빠졌는지
   * 이름으로 알린다 — 건수만 말하면 무엇을 다시 고를지 알 수 없다.
   */
  const applyMany = async (ids: string[], chosen: DocumentPickerItem[]) => {
    const nameOf = (id: string) => chosen.find((i) => i.id === id)?.title ?? '이름 미상'
    const details = await Promise.all(
      ids.map(async (id) => {
        try {
          return await fetchPartnerPaymentDetail(id)
        } catch {
          return null
        }
      }),
    )
    const snapshots: PartnerSnapshot[] = []
    const failed: string[] = []
    details.forEach((detail, i) => {
      const id = ids[i]
      if (detail) snapshots.push(toSnapshot(detail))
      else if (id) failed.push(nameOf(id))
    })
    if (snapshots.length === 0) {
      toast.show('거래처 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.', 'danger')
      return
    }
    onPickMany?.(snapshots)
    if (failed.length > 0) {
      toast.show(`${failed.join(', ')}의 지급 정보를 읽지 못해 빼고 넣었습니다.`, 'warning')
    }
  }

  /**
   * 고른 한 건을 사본으로 옮긴다.
   *
   * 지급 정보를 읽지 못하면 **아무것도 바꾸지 않는다.** id만 넣고 계좌 칸을 비워 두면 그 줄은
   * "계좌가 없는 거래처"로 읽히고, 그대로 결재가 흐르면 지급 담당자는 어디로 보낼지 알 수 없다.
   */
  const apply = async (id: string) => {
    try {
      const detail = await fetchPartnerPaymentDetail(id)
      if (!detail) {
        toast.show('거래처 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.', 'danger')
        return
      }
      onPick(toSnapshot(detail))
    } catch {
      toast.show('거래처 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.', 'danger')
    }
  }

  return (
    <>
      <PickerField
        density="table"
        label={label}
        text={displayName || (value ? '거래처 (열람 권한 없음)' : '')}
        placeholder="거래처 선택"
        open={open}
        onClick={() => setOpen(true)}
      />

      <DocumentPickerModal
        open={open}
        onClose={() => setOpen(false)}
        title="거래처 선택"
        help={
          onPickMany
            ? '목록의 계좌는 뒤 4자리만 보입니다. 고르면 그때의 은행·계좌·예금주가 이 줄에 사본으로 적히며, 나중에 원장이 바뀌어도 이 문서의 계좌는 그대로 남습니다. 여럿을 고르면 첫 거래처가 이 줄에 들어가고 나머지는 아래에 줄로 추가됩니다.'
            : '목록의 계좌는 뒤 4자리만 보입니다. 고르면 그때의 은행·계좌·예금주가 이 줄에 사본으로 적히며, 나중에 원장이 바뀌어도 이 문서의 계좌는 그대로 남습니다.'
        }
        items={items}
        valueColumns={columns}
        loading={isLoading}
        error={isError}
        onRefresh={() => void refetch()}
        search={{
          value: keyword,
          onChange: setKeyword,
          label: '거래처 검색',
          placeholder: '거래처명·코드·예금주로 검색',
        }}
        pagination={{
          page,
          pageSize: PARTNER_PICK_PAGE_SIZE,
          total: all.length,
          onChange: setPage,
        }}
        value={value || null}
        valueItem={valueItem}
        // 확인을 누른 뒤에야 계좌 전체를 부른다. 읽지 못하면 값을 바꾸지 않고 안내만 한다.
        onSubmit={(id) => void apply(id)}
        // 줄을 펼 수 있는 자리에서만 여럿을 고른다(표 밖에서 쓰면 한 건짜리 창 그대로다).
        onSubmitMany={onPickMany ? (ids, pickedItems) => void applyMany(ids, pickedItems) : undefined}
        onClear={() => onPick(null)}
        actions={
          <Button variant="outline" onClick={() => setAdding(true)}>
            새 거래처 등록
          </Button>
        }
        emptyText="등록된 거래처가 없습니다. [새 거래처 등록]으로 원장에 넣을 수 있습니다."
        noResultText="찾는 거래처가 없습니다. [새 거래처 등록]으로 원장에 넣을 수 있습니다."
      />

      <PartnerQuickAddModal
        open={adding}
        onClose={() => setAdding(false)}
        initialName={keyword}
        // 방금 만든 행은 **고른 것으로 확정한다** — 등록은 그 자리에서 쓰려고 하는 일이라,
        // 창에 돌아와 같은 줄을 한 번 더 고르게 할 이유가 없다. 계좌는 목록이 아니라 지급
        // 조회로 다시 읽는다(원장이 정규화한 값과 문서의 사본이 갈리지 않게).
        //
        // 여러 곳을 한 번에 넣었으면 고르는 창에서 여럿을 고른 것과 **같은 길**로 흐른다 —
        // 첫 곳이 이 줄에 들어가고 나머지는 새 줄이 된다. 줄을 펼 수 없는 자리(표 밖)에서는
        // 지금까지처럼 첫 곳 하나만 이 칸에 든다.
        onCreated={(partners) => {
          const ids = partners.map((p) => p.id)
          const first = ids[0]
          if (!first) return
          if (onPickMany) {
            void applyMany(
              ids,
              partners.map((p) => ({ id: p.id, docNo: null, title: p.name })),
            )
          } else {
            void apply(first)
          }
          setOpen(false)
        }}
      />
    </>
  )
}
