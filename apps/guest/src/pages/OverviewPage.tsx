import { Badge, Banner, Card, InfoField, InfoGrid, PageHeader, Spinner } from '@ynarcher/ui'
import { contextTags } from '@/auth/contextDisplay'
import { useGuestStore } from '@/auth/guestStore'
import { overviewLabelOf } from '@/config/navigation'
import { useGuestMe } from '@/features/meHooks'
import { useOverviewFiles, useProgramOverview } from '@/features/overviewHooks'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_TONE } from '@/features/programMeta'
import { GuestFileCard } from '@/pages/modules/FileModule'
import { formatDate } from '@/lib/format'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 소개 화면 — 로그인 직후 첫 화면. 세 덩어리를 위에서 아래로 세운다(2026-09-13 개편).
 *
 *   1. **지금 어디에 들어와 있는가**(요약) — 이름·종류·자격·상태·기간처럼 이미 세션과
 *      `guest-auth-refresh`가 답하고 있던 사실들. 종전에는 이 화면이 소개문만 그려서, 참여자가
 *      자기 맥락을 확인하려면 마이페이지까지 들어가야 했다.
 *   2. **소개문**과 3. **첨부 자료** — WORKS 상세의 개요 탭과 같은 2:1 분할이며 편집만 없다.
 *
 * 새로 만들어 낸 값은 없다. 없는 값은 칸을 세우지 않고, 못 받은 값은 못 받았다고 적는다 —
 * 참여 건수·진척도 같은 지표는 원장이 답하지 않으므로 여기서 세지 않는다.
 * 본문은 글쓰기·NOTICE와 같은 허용 목록 정화기·조판 한 벌을 태운다.
 */
export function OverviewPage() {
  // 부르는 이름은 사이드바와 **같은 자리**에서 온다 — 두 곳에 적으면 메뉴는 '조합 개요'인데
  // 본문 머리는 '사업개요'인 화면이 된다.
  const label = overviewLabelOf(useGuestStore((s) => s.program)?.entityKey)

  return (
    <div className="space-y-5">
      <PageHeader title={label} />
      <ContextSummaryCard />
      {/* 분할은 요약 아래에서 시작한다. 파일이 없으면 우측 칸은 empty:hidden으로 칸째 사라진다. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          <OverviewBodyCard />
        </div>
        <div className="mt-5 min-w-0 empty:hidden lg:mt-0">
          <OverviewFilesRail />
        </div>
      </div>
    </div>
  )
}

/**
 * 지금 들어와 있는 맥락의 요약.
 *
 * 값의 출처는 세션(스토어)과 `guest-auth-refresh` 둘이며 마이페이지와 **같은 질의**를 쓴다 —
 * 두 화면이 같은 사실을 각자 받으면 서로 다른 시점의 값을 그릴 수 있다. 응답이 아직 없거나
 * 실패해도 세션이 아는 것(이름·종류·자격)은 그대로 세운다: 화면이 통째로 비면 참여자는
 * '내가 어디에 있는지'를 잃는다.
 */
function ContextSummaryCard() {
  const program = useGuestStore((s) => s.program)
  const { data: me, isPending, isError } = useGuestMe()
  if (!program) return null

  // 자격은 갱신 응답이 있으면 그쪽이 최신이다(전환 직후 스토어보다 먼저 도착할 수 있다).
  const tags = contextTags(program.entityKey, me?.participation.persona ?? program.persona)
  const status = me?.program.status
  const period =
    me && (me.program.start_date || me.program.end_date)
      ? `${formatDate(me.program.start_date)} ~ ${formatDate(me.program.end_date)}`
      : null

  return (
    // 카드의 제목은 **지금 들어와 있는 곳의 이름**이다. 그 위에 '참여 중인 프로젝트' 같은 줄을
    // 한 단 더 세우면 카드 제목(16px)보다 큰 글자가 카드 안에 생겨 위계가 뒤집힌다 —
    // 무엇에 대한 카드인지는 바로 아래 중립 태그(종류·자격)가 답한다.
    <Card
      title={program.title}
      actions={
        // 색이 붙는 칸은 여기 하나다 — 상태는 신호이고, 종류·자격은 분류라 중립으로 선다.
        // 라벨 표에 있는 운영 상태만 그린다(내부 상태 코드를 원문으로 흘리지 않는다).
        status && PROGRAM_STATUS_LABEL[status] ? (
          <Badge tone={PROGRAM_STATUS_TONE[status] ?? 'neutral'}>
            {PROGRAM_STATUS_LABEL[status]}
          </Badge>
        ) : null
      }
    >
      <div className="space-y-3">
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {tags.map((t) => (
              <Badge key={t.key}>{t.label}</Badge>
            ))}
          </div>
        )}

        {me && (
          <InfoGrid columns={2}>
            <InfoField label="코드" value={me.program.code} />
            <InfoField label="기간" value={period} />
            {/* 조합에는 주관 기관이라는 칸 자체가 없다 — 없는 칸을 '-'로 세우지 않는다. */}
            {me.program.host_organization !== undefined && (
              <InfoField label="주관기관" value={me.program.host_organization} />
            )}
            {me.company && <InfoField label="소속 기업" value={me.company.name} />}
            <InfoField
              label="참여 시작일"
              value={me.participation.joined_at ? formatDate(me.participation.joined_at) : null}
              meta
            />
          </InfoGrid>
        )}
        {isPending && <p className="text-caption text-gray-500">상세 정보를 불러오는 중입니다…</p>}
        {isError && (
          <Banner tone="warning">
            상세 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 잠시 후 다시 열어 주십시오.
          </Banner>
        )}
      </div>
    </Card>
  )
}

/**
 * 소개문 카드. 담당자가 WORKS에서 쓴 글 한 편이며 게스트는 읽기만 한다.
 * 조회 범위 판정은 RLS가 하므로 화면은 돌아온 것을 그린다.
 */
function OverviewBodyCard() {
  const { data: body, isLoading } = useProgramOverview()
  const html = sanitizeRichText(body)
  return (
    <Card title="소개" bodyClassName="min-w-0">
      {isLoading ? (
        <Spinner />
      ) : html ? (
        <div className={RICH_BODY_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="py-8 text-center text-body text-gray-600">아직 등록된 소개가 없습니다.</p>
      )}
    </Card>
  )
}

/**
 * 소개에 딸린 첨부 파일 — WORKS 사업개요 탭 우측 파일 패널의 게스트판. 글쓰기 메뉴의
 * 파일 칸과 같은 판정으로, 파일이 없으면 칸을 세우지 않는다.
 */
function OverviewFilesRail() {
  const { data } = useOverviewFiles()
  if (!data?.length) return null
  return <GuestFileCard files={data} title="첨부 자료" />
}
