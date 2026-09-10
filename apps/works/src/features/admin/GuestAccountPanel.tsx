import {
  Badge,
  Banner,
  Button,
  CardHeading,
  DataTable,
  EmptyValue,
  InfoField,
  InfoGrid,
  Checkbox,
  ListToolbar,
  Modal,
  RefLinkList,
  Spinner,
  Tabs,
  TagCell,
  usePaged,
  TextArea,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GUEST_PAGE_SIZE,
  useGuestAccounts,
  useSetGuestAccountActive,
  type GuestAccount,
  type GuestAccountProgram,
} from '@/features/admin/guestAccountHooks'
import type { GuestEntityKey } from '@/features/guest/host'
import { guestDoorBadge, isDoorOpen } from '@/features/program/guestDoorBadge'
import { PERSONA_LABEL, type MasterTable } from '@/features/program/participantPersona'
import { GUEST_TYPE_LABEL } from '@/lib/userTypes'

const DASH = <EmptyValue />

/** 워크스페이스 표기 — 사업 원장이 둘이라 어느 쪽 사업인지 함께 밝힌다. */
const WORKSPACE_LABEL: Record<string, string> = { project: '프로젝트', mna: 'M&A', fund: '조합' }

/** 사업 상세로 가는 길. 값을 복제하지 않고 원장을 가리킨다(명부와 같은 규약). */
const PROGRAM_PATH: Record<GuestAccountProgram['entity_key'], string> = {
  program: '/project',
  ma_program: '/mna/deals',
  fund: '/fund',
}

/** 상세 모달의 참여 사업 표 한 장. 모달 안이라 화면 목록(30)보다 짧게 끊는다. */
const PROGRAM_PAGE_SIZE = 5

/** ISO → `YYYY-MM-DD`. 표의 날짜는 자릿수가 맞아야 세로로 견줘진다. */
function day(v: string | null): string | null {
  return v ? String(v).slice(0, 10) : null
}

/** 그 참여 줄의 문 상태를 판정할 재료. 판정 자체는 명부와 같은 한 벌을 쓴다. */
function doorOf(p: GuestAccountProgram) {
  return {
    loginStatus: p.login_status,
    hasTarget: Boolean(p.master_table),
    programStatus: p.program_status,
    accessEndsAt: p.access_ends_at,
  }
}

/**
 * 게스트 계정 관리: 전사 게스트 계정 한 자리.
 *
 * **여러 곳에 같은 화면이 선다** — AC·M&A의 '계정생성'(내부 사용자 전원)과 ADMIN·OFFICE의
 * '게스트 계정 관리'이며, 갈리는 것은 `canSuspend`·`entityKey`·`masterTables` 셋뿐이다. 화면을 두 벌로
 * 만들지 않는 이유는 같은 목록을 각자 그리면 한쪽만 고쳐 어긋나기 때문이고, 연락처 마스킹도
 * 여기가 아니라 서버(`guest_accounts_list`)가 정한다 — UI에서 숨기는 것은 보안이 아니다.
 *
 * 축이 셋이다(3_9_1 §3).
 *   · **계정**은 사람 하나다. 발급은 내부 사용자 전원, 정지·해제는 ADMIN.
 *   · **문**은 그 사업 담당자가 참가자 명부에서 여닫는다.
 *   · **열쇠**(비밀번호)는 본인만 쥔다.
 *
 * **여기는 발급하고 들여다보는 자리다.** 그래서 답해야 하는 물음은 "이 계정이 어느 사업에
 * 걸려 있고 사업마다 언제까지 들어올 수 있는가"이며, 행을 누르면 그 답이 통째로 선다
 * (2026-09-07). 종전에는 참여 사업 **건수 칸만** 눌렸는데, 눌리는 자리가 셀 하나면 무엇을
 * 눌러야 하는지를 화면이 말하지 못한다 — 행이 곧 계정이므로 행 전체가 상세를 연다.
 *
 * **비밀번호 재설정 안내는 두지 않는다**(2026-09-07). 안내는 사업별로 나가고, 계정 목록은
 * 어느 사업의 맥락도 갖지 않아 여기서 보내면 받는 사람이 무슨 건으로 온 안내인지 모른다.
 *
 * 정지는 사업별 상태를 건드리지 않는다 — 풀면 원래 열려 있던 사업이 그대로 열린다.
 * 삭제는 두지 않는다(명부 행·초대 레코드가 이 계정을 가리키고 있어, 지우면 그 기록들이
 * 누구 것인지 답할 수 없게 된다). 되돌릴 수 있는 정지 하나로 충분하다.
 *
 * 근거 기획: docs/docs_planning/3_9_1_guest_unified_account.md §9·§11
 */
export function GuestAccountPanel({
  canSuspend = false,
  entityKey,
  masterTables,
}: {
  canSuspend?: boolean
  /**
   * 참여 사업 칸이 볼 범위. 주지 않으면 전 워크스페이스다.
   * 자리마다 다른 이유는 `useGuestAccounts` 주석 참조.
   */
  entityKey?: GuestEntityKey
  /**
   * 목록에 설 계정을 **인격의 출처 원장**으로 좁힌다(2026-09-08). 주지 않으면 전부(ADMIN).
   *
   * `entityKey`와 다른 축이다 — 저쪽은 참여 사업 칸이 무엇을 세는가이고 이쪽은 어느 계정이
   * 서는가다. 창구마다 발급하는 원장이 다르므로, 남의 원장 인격이 여기 서면 참여 사업 칸이
   * 비어 있어도 "그 사람 계정이 있다"가 드러난다.
   */
  masterTables?: readonly MasterTable[]
}) {
  const toast = useToast()
  /**
   * 지금 선 원장 탭. 창구는 원장을 **가르는 자리**이고(2026-09-08 사용자 지정 "각각에 하위
   * 탭에 AC는 스타트업, 전문가 / M&A는 SELLER, BUYER"), 그 값이 목록과 발급을 함께 정한다.
   *
   * 종전에는 목록이 이 워크스페이스의 원장을 한꺼번에 세우고 발급 창의 셀렉트가 원장을
   * 따로 물었다. 그러면 같은 물음에 컨트롤이 둘이라 방금 본 목록과 만든 계정이 어긋날 수
   * 있었고, 무엇보다 목록이 성격이 다른 인격을 섞어 세웠다 — SELLER와 BUYER를 한 표에
   * 담으면 어느 줄이 파는 쪽인지 이름만으로 가려야 한다.
   *
   * 원장이 없는 자리(ADMIN 계정 관리)는 탭이 서지 않고 전부를 세운다 — 그 화면이 소유한
   * 축은 정지·해제이고 그것은 계정에 걸리는 일이라 원장을 가려서는 안 된다(3_9_2 §6).
   */
  const [ledger, setLedger] = useState<MasterTable | null>(masterTables?.[0] ?? null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  /**
   * 참여 사업이 0건인 계정만 — **정지 여부를 사람이 판단하기 위한 축**이다.
   *
   * 그래서 정지를 소유한 화면(ADMIN)에만 선다. 창구(AC·M&A)는 계정을 세우는 자리라 이
   * 물음이 그 자리의 것이 아니고, 무엇보다 창구는 사업을 좁혀 보므로 여기서 0건이
   * '어디에도 안 걸림'이 아니라 '이 워크스페이스에 안 걸림'이 되어 뜻이 달라진다.
   */
  const [onlyOrphans, setOnlyOrphans] = useState(false)
  /** 상세를 펼쳐 보는 계정. 행을 누르면 열린다. */
  const [detail, setDetail] = useState<GuestAccount | null>(null)
  /** 정지하려는 계정(사유 입력). 해제는 사유를 묻지 않는다. */
  const [suspending, setSuspending] = useState<GuestAccount | null>(null)
  const [reason, setReason] = useState('')

  // 탭이 선 자리에서는 **그 원장 하나**로 좁힌다. 탭이 없으면 창구가 준 목록 전부이고,
  // 그것도 없으면(ADMIN) 전 원장이다.
  const scope = ledger ? [ledger] : masterTables
  const { data, isLoading, error } = useGuestAccounts(
    keyword,
    page,
    entityKey,
    scope,
    canSuspend && onlyOrphans,
  )
  const setActive = useSetGuestAccountActive()

  /**
   * 상세의 참여 사업 페이징. 계정 하나가 걸리는 사업은 대개 한둘이지만 해를 넘겨 쌓이면
   * 모달이 세로로 길어져 아래쪽이 화면 밖으로 나간다 — 표가 자라도 모달 높이는 그대로여야 한다.
   * 서버를 다시 부르지 않는 이유는 목록이 이미 계정 행에 통째로 실려 와 있기 때문이다.
   */
  const paged = usePaged(detail?.programs ?? [], PROGRAM_PAGE_SIZE)
  const setProgramPage = paged.setPage

  // 다른 계정을 열면 첫 장부터 본다. 클램프만으로는 3장짜리 계정을 열 때 2장에서 시작한다.
  useEffect(() => {
    setProgramPage(0)
  }, [detail?.user_id, setProgramPage])

  // 검색어·필터가 바뀌면 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => {
    setPage(0)
  }, [keyword, onlyOrphans])

  const submitSuspend = async () => {
    if (!suspending) return
    if (!reason.trim()) {
      toast.show('정지 사유를 입력하세요.', 'warning')
      return
    }
    try {
      await setActive.mutateAsync({ userId: suspending.user_id, active: false, reason })
      toast.show(`${suspending.name} 계정을 정지했습니다.`, 'success')
      setSuspending(null)
      setReason('')
    } catch {
      toast.show('정지에 실패했습니다. 관리자 권한을 확인하세요.', 'danger')
    }
  }

  const restore = async (a: GuestAccount) => {
    try {
      await setActive.mutateAsync({ userId: a.user_id, active: true })
      toast.show(`${a.name} 계정을 다시 열었습니다.`, 'success')
    } catch {
      toast.show('해제에 실패했습니다. 관리자 권한을 확인하세요.', 'danger')
    }
  }

  const columns: Column<GuestAccount>[] = [
    { key: 'name', header: '이름', type: 'name', render: (r) => r.name },
    {
      // 계정이 가진 자격들. `user_type`은 계정을 처음 세운 자격의 잔재라 더 이상 화면을
      // 가르지 않는다 — 한 사람이 참여 기업이면서 참여 전문가일 수 있고, 그때 유형 한 칸은
      // 절반만 말한다. 실제로 무엇으로 참여하는지는 참여 줄이 답하고, 계정이 무엇이 될 수
      // 있는지는 인격 목록이 답한다.
      key: 'identities',
      header: '자격',
      type: 'badge',
      render: (r) =>
        r.identities.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {r.identities.map((i) => (
              <Badge key={`${i.master_table}:${i.master_id}`} tone="info">
                {PERSONA_LABEL[i.master_table]}
              </Badge>
            ))}
          </span>
        ) : (
          <Badge tone="neutral">{GUEST_TYPE_LABEL[r.user_type] ?? r.user_type}</Badge>
        ),
    },
    { key: 'company', header: '소속 기업', type: 'text', render: (r) => r.company_name || DASH },
    { key: 'email', header: '이메일(로그인 ID)', type: 'long', render: (r) => r.email || DASH },
    {
      // 매핑된 사업을 **이름으로** 적는다 — 건수만으로는 어디에 걸려 있는지 답하지 못한다.
      // 이름 옆의 기간·상태까지는 한 줄에 들어가지 않으므로 그것은 행을 눌러 여는 상세가 답한다.
      key: 'programs',
      header: '참여 사업',
      type: 'tags',
      // 나열 상한 2는 원장이 정한 값이 아니라 이 열의 폭이다 — 넘는 것은 `외 N`이 답하고,
      // 전체는 상세가 답한다.
      render: (r) => <TagCell items={r.programs.map((p) => p.title ?? '(삭제된 사업)')} max={2} />,
    },
    {
      // 지금 실제로 들어올 수 있는 사업 수 / 걸려 있는 사업 수. 앞의 수는 개방 상태만이 아니라
      // 사업 상태·기간까지 함께 본 결론이라, 명부의 로그인 상태 열과 같은 답을 한다.
      key: 'open',
      header: '로그인 가능',
      type: 'count',
      render: (r) =>
        r.program_count
          ? `${r.programs.filter((p) => isDoorOpen(doorOf(p))).length}/${r.program_count}`
          : DASH,
    },
    {
      key: 'last_login',
      header: '최근 접속',
      type: 'date',
      render: (r) => day(r.last_login_at) ?? DASH,
    },
    {
      key: 'state',
      header: '계정 상태',
      type: 'badge',
      render: (r) =>
        r.is_active ? <Badge tone="success">사용</Badge> : <Badge tone="danger">정지</Badge>,
    },
  ]

  if (canSuspend) {
    columns.push({
      key: '_action',
      header: '',
      align: 'right',
      // 행 클릭(상세 열기)과 같은 자리에 서므로 전파를 끊는다 — 정지를 누르며 상세가 함께
      // 열리면 확인 모달 뒤에 다른 모달이 서서 무엇을 확인하는 중인지 흐려진다.
      render: (r) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {r.is_active ? (
            <Button variant="ghost" onClick={() => setSuspending(r)}>
              정지
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => void restore(r)}>
              정지 해제
            </Button>
          )}
        </div>
      ),
    })
  }

  /** 상세 모달의 참여 사업 표. 사업마다 문의 결론과 기간을 나란히 세운다. */
  const programColumns: Column<GuestAccountProgram>[] = [
    {
      key: 'title',
      header: '사업',
      type: 'name',
      render: (p) => (
        <RefLinkList
          as={Link}
          items={[
            {
              key: p.program_id,
              label: p.title ?? '(삭제된 사업)',
              // 워크스페이스가 하나로 좁혀진 자리에서는 되풀이하지 않는다.
              kind: entityKey ? null : (WORKSPACE_LABEL[p.workspace] ?? p.workspace),
              to: p.title ? `${PROGRAM_PATH[p.entity_key]}/${p.program_id}` : null,
              title: p.title ? undefined : '원장에서 삭제되었거나 볼 권한이 없는 사업입니다.',
            },
          ]}
        />
      ),
    },
    { key: 'code', header: '사업코드', type: 'code', render: (p) => p.code || DASH },
    {
      key: 'persona',
      header: '자격',
      type: 'text',
      render: (p) => (p.master_table ? PERSONA_LABEL[p.master_table] : DASH),
    },
    {
      key: 'door',
      header: '상태',
      type: 'badge',
      render: (p) => {
        const b = guestDoorBadge(doorOf(p))
        return <Badge tone={b.tone}>{b.label}</Badge>
      },
    },
    {
      // 기간은 계정이 아니라 사업이 갖는다 — 같은 사업의 두 줄은 같은 값을 본다(3_9_1 §8).
      key: 'ends',
      header: '로그인 종료',
      type: 'date',
      render: (p) => day(p.access_ends_at) ?? '제한 없음',
    },
  ]

  if (isLoading) return <Spinner />
  if (error) {
    return (
      <Banner tone="danger">
        게스트 계정 목록을 불러오지 못했습니다. 내부 사용자 권한이 필요합니다.
      </Banner>
    )
  }

  /** 상세에서 세우지 못한 참여 줄 수(사업을 볼 권한이 없거나 원장에서 삭제된 것). */
  const hidden = detail ? detail.program_count - detail.programs.length : 0

  return (
    <div className="space-y-4">
      {/* 원장이 둘 이상일 때만 탭이 선다 — 가를 것이 없는 자리에 선 탭은 '다른 것도 있다'고
          말하는 거짓 신호이고, 남는 것은 층뿐이다(M&A 연결 기업 탭과 같은 판단). */}
      {ledger && (masterTables?.length ?? 0) > 1 && (
        <Tabs
          items={masterTables!.map((key) => ({ key, label: PERSONA_LABEL[key] }))}
          value={ledger}
          onChange={(key) => {
            setLedger(key as MasterTable)
            // 탭을 옮기면 페이지를 처음으로 되돌린다 — 3쪽에 서 있다가 옮기면 그 원장에는
            // 3쪽이 없어 빈 화면이 뜨고, 화면은 왜 비었는지 답하지 못한다.
            setPage(0)
          }}
        />
      )}

      {/*
        **발급 버튼이 없다**(2026-09-08 사용자 지정 "사이드바에서는 매핑된 프로젝트가 조회되는
        기능으로만 하고, 실제 생성은 프로젝트 상세에서").

        걷어도 잃는 것이 없다 — 이 화면에서 만든 계정은 사업에 매핑되기 전까지 로그인해도
        "접근 가능한 사업이 없습니다"만 떴다. 즉 **아무 일도 하지 않는 버튼**이었고, 계정은
        언제나 "어느 사업에 들이려고" 만들어지므로 만드는 자리도 그 사업 안이어야 한다.

        옮긴 것이지 없앤 것이 아니다: 사람을 고르는 2단계 폼은 사업 상세의 명부 추가 모달로
        갔고, 오히려 거기서 더 많은 일을 한다(그 자리는 계정과 명부 행을 함께 만든다).

        남는 물음은 이 화면만 답할 수 있는 것들이다 — 이 계정이 **어느 사업들에** 걸려 있나,
        지금 열려 있나, 정지됐나. 사업을 가로지르는 물음이라 사업 안에서는 답할 수 없다.
      */}
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="이름 또는 이메일로 검색"
        filters={
          canSuspend ? (
            <Checkbox
              label="참여 사업 없는 계정만"
              checked={onlyOrphans}
              onChange={(e) => setOnlyOrphans(e.target.checked)}
              title="어느 사업에도 걸려 있지 않은 계정입니다. 로그인은 되지만 들어가도 아무것도 보이지 않습니다."
            />
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={data?.rows ?? []}
        rowKey={(r) => r.user_id}
        standardColumns={false}
        selectable={false}
        onRowClick={(r) => setDetail(r)}
        pagination={{
          page,
          pageSize: GUEST_PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
        }}
        emptyText="발급된 게스트 계정이 없습니다."
      />

      {/* 계정 상세 — 읽기만 하므로 바깥을 눌러 닫을 수 있다. */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.name} — 계정 상세` : ''}
        help="사업별 로그인 개방과 기간은 그 사업 담당자가 참가자 명부에서 정합니다. 이 화면은 발급과 조회만 합니다."
        size="xl"
      >
        {detail && (
          <div className="space-y-5">
            <InfoGrid columns={3}>
              <InfoField
                label="이메일(로그인 ID)"
                value={detail.email}
                valueClassName="truncate"
              />
              <InfoField label="연락처" value={detail.phone} valueClassName="truncate" />
              <InfoField label="소속 기업" value={detail.company_name} valueClassName="truncate" />
              <InfoField
                label="계정 상태"
                value={
                  detail.is_active ? (
                    <Badge tone="success">사용</Badge>
                  ) : (
                    <Badge tone="danger">정지</Badge>
                  )
                }
              />
              <InfoField
                label="비밀번호"
                value={detail.has_password ? '본인 설정 완료' : '초기 비밀번호(연락처)'}
              />
              <InfoField label="최근 접속" value={day(detail.last_login_at)} meta />
            </InfoGrid>

            <div className="space-y-2">
              <CardHeading
                level="subhead"
                count={detail.programs.length}
                help="닫힌 사업·끝난 사업도 지우지 않고 남깁니다 — 지금 어디에 걸려 있는지만이 아니라 그동안 어디에 걸렸었는지가 문의에 답할 근거입니다."
                trailing={hidden > 0 ? `볼 권한이 없는 사업 ${hidden}건 제외` : undefined}
              >
                참여 사업
              </CardHeading>
              <DataTable
                columns={programColumns}
                rows={paged.pageItems}
                rowKey={(p) => `${p.entity_key}:${p.program_id}:${p.master_table ?? '-'}`}
                standardColumns={false}
                selectable={false}
                numbered={false}
                pagination={{
                  page: paged.page,
                  pageSize: PROGRAM_PAGE_SIZE,
                  total: detail.programs.length,
                  onChange: setProgramPage,
                  // 계정을 받치는 보조 목록이라 번호줄이 아니라 화살표 둘이다(한 장뿐이면 사라진다).
                  compact: true,
                }}
                emptyText="아직 어느 사업에도 연결되지 않았습니다. 연결은 그 사업 담당자가 참가자 명부에서 합니다."
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 정지 — 쓰던 사유가 클릭 한 번에 사라지지 않도록 바깥 클릭으로 닫지 않는다. */}
      <Modal
        open={Boolean(suspending)}
        onClose={() => {
          setSuspending(null)
          setReason('')
        }}
        title="게스트 계정 정지"
        dismissible={false}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSuspending(null)
                setReason('')
              }}
            >
              취소
            </Button>
            <Button
              variant="danger"
              onClick={() => void submitSuspend()}
              disabled={setActive.isPending}
            >
              정지
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {/* 파급 효과 고지는 접지 않는다(안내 문구 규칙의 예외). */}
          <Banner tone="warning">
            <b>{suspending?.name}</b> 계정이 참여 중인 사업 {suspending?.program_count ?? 0}건에서
            동시에 멈춥니다. 접속 중인 세션도 즉시 끊깁니다. 사업별 개방 상태는 그대로 두므로,
            정지를 풀면 원래 열려 있던 사업이 그대로 열립니다.
          </Banner>
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="정지 사유 (감사 로그에 남습니다)"
            rows={3}
          />
        </div>
      </Modal>
    </div>
  )
}
