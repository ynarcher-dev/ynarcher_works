import {
  Badge,
  Button,
  cn,
  DataTable,
  EmptyValue,
  Select,
  Tooltip,
  tooltipScale,
  type Column,
} from '@ynarcher/ui'
import { DupCell } from '@/features/networks/BulkDupCell'
import { CountryOptionList } from '@/features/networks/CountryOptionList'
import type { NetworkCategory } from '@/features/networks/config'
import type { CountryTag } from '@/features/networks/countryOptions'
import type { ExistingRef, ParsedRow } from '@/features/networks/bulkUpload'

export type Decision = 'new' | 'merge' | 'skip'

export interface ReviewRow extends ParsedRow {
  /** 편집 가능한 저장 대상 구분(코드). 빈 값이면 아직 고르지 않은 상태라 업로드가 막힌다. */
  targetCategory: NetworkCategory | ''
  /** CSV의 국가명을 태그 원장과 대조한 결과. 못 찾으면 null(국가 미확인). */
  countryTagId: string | null
  /** 국가 표시값 — 찾은 태그명, 못 찾았으면 원값, 원값도 없으면 빈 문자열. */
  countryLabel: string
  /**
   * 자사 임직원인가. 네트워크 원장은 회사 밖 사람의 자리이므로 이 행은 올라가지 않으며,
   * 화면에서 되돌릴 수도 없다 — 추천이 아니라 정책이다(2026-09-10 사용자 결정).
   */
  internal: boolean
  /** 이름 칸에 조직명이 들어온 것으로 보이는가. 의심일 뿐이라 결정은 되돌릴 수 있다. */
  orgLikeName: boolean
  /** 확실중복(이메일·전화 일치)으로 매칭된 기존 레코드. 없으면 신규. */
  match: ExistingRef | null
  /** 처리 방식(비활성 매칭은 결정 대신 '복구하기' 버튼 사용). */
  decision: Decision
}

/**
 * 결정 옵션. 중복(매칭)이 있으면 합치기/미업로드만 — 중복인데 새로 만드는 신규 등록은 없앤다.
 * 중복이 없으면 신규 등록/미업로드.
 */
function decisionOptions(hasMatch: boolean): { value: Decision; label: string }[] {
  return hasMatch
    ? [
        { value: 'merge', label: '합치기' },
        { value: 'skip', label: '미업로드' },
      ]
    : [
        { value: 'new', label: '신규 등록' },
        { value: 'skip', label: '미업로드' },
      ]
}

/**
 * 이름 옆에 서는 한 줄 표시 — **이 줄이 무엇인가**에 답한다.
 *
 * 하나만 세운다. 자사 제외는 되돌릴 수 없어 먼저 서고, 조직명 의심은 사람이 판단할 것이라
 * 그다음이며, 접힘은 이 줄이 여러 줄을 대신한다는 사실이라 마지막이다. 셋을 함께 세우면
 * 이름 칸이 표시로 덮여 정작 이름이 밀린다.
 */
function RowFlag({ row }: { row: ReviewRow }) {
  if (row.internal) return <Badge tone="neutral">자사</Badge>
  if (row.orgLikeName) return <Badge tone="warning">조직명?</Badge>
  if (row.foldedLines.length > 0) {
    return (
      <Badge tone="info" title={`파일 ${row.foldedLines.join(', ')}행을 이 줄에 접었습니다`}>
        접힘 {row.foldedLines.length}
      </Badge>
    )
  }
  return null
}

interface Props {
  rows: ReviewRow[]
  categoryOptions: { value: string; label: string }[]
  /** 국가 선택지 — 자국이 먼저, 그 아래 구분선, 나머지는 가나다순(등록 폼과 같은 순서). */
  countryOptions: { domestic: CountryTag[]; overseas: CountryTag[] } | undefined
  /** 선택된 행 번호(제어). */
  selected: number[]
  /** 이미 복구 처리된(활성화된) 행 번호. 해당 행은 '복구됨'으로 잠긴다. */
  revivedLines: number[]
  busy?: boolean
  onSelectionChange: (lines: number[]) => void
  onCategory: (line: number, label: string) => void
  /** 국가 재지정. 빈 값은 '미확인'이며, 실제 업로드 대상에 남아 있으면 저장이 차단된다. */
  onCountry: (line: number, tagId: string) => void
  onDecision: (line: number, decision: Decision) => void
  /** 비활성 매칭 행 즉시 복구(활성화). */
  onRevive: (line: number) => void
  /** 비활성 사유를 모달로 연다(사유가 있는 행에서만 불린다). */
  onShowReason: (line: number) => void
}

/**
 * 대용량 업로드 리뷰 테이블. 공용 DataTable(디자인 통일) 위에 구분 재결정·중복 강조·결정을 얹는다.
 * 중복이 있는 행은 '중복' 칸을 테두리 박스로 강조해 선행 데이터(이름/구분/생성자)를 함께 보인다.
 */
export function BulkReviewTable({
  rows,
  categoryOptions,
  countryOptions,
  selected,
  revivedLines,
  busy,
  onSelectionChange,
  onCategory,
  onCountry,
  onDecision,
  onRevive,
  onShowReason,
}: Props) {
  // 모든 열의 좌우 패딩을 px-2로 통일해 열 간 여백이 들쑥날쑥하지 않게 한다(중복 칸은 폭만 w-72로 넓힘).
  const pad = 'px-2'
  /**
   * 셀렉트가 놓이는 열의 폭(8rem = `w-32`).
   *
   * 값이 아니라 조작이 놓이는 열이라 `ColumnType` 어디에도 들지 않으므로 `widthRem`으로 직접
   * 적는다 — 그리고 **적어야 표의 폭 계산에 잡힌다**(`Column.widthRem` 주석). 8rem은 셀 여백
   * 16px + 셀렉트 좌우 여백 48px을 빼면 글자 자리가 64px이라, 네 글자 라벨(`일반기업`)과
   * 국가명 대부분이 들어간다. 열 개가 넘는 표라 여기서 더 넓히기보다 긴 국가명이 잘리는 쪽을
   * 택했고, 잘린 값은 펼친 목록이 온전히 보여 준다.
   */
  const selectRem = 8
  // 비활성(미복구) 상태: 복구하기를 아직 누르지 않은 비활성 매칭 행.
  const isDeactivated = (r: ReviewRow) =>
    r.internal || (Boolean(r.match?.deleted) && !revivedLines.includes(r.line))
  // 비활성 행은 원본 데이터 텍스트를 옅게 처리한다.
  const dim = (r: ReviewRow, normal: string) => (isDeactivated(r) ? 'text-gray-300' : normal)
  /**
   * 파일에서 온 글자 값 한 열. 길이를 예측할 수 없는 가변폭 열이라 **셀 안에서 말줄임**한다
   * (전체 값은 `title`이 답한다).
   *
   * 접지 않는 이유는 폭이 아니라 리듬이다 — 열 개가 넘는 이 표에서 한 열만 두 줄이 되면 행의
   * 기준선이 하나로 읽히지 않고, 스물여섯 자짜리 회사 메일 하나가 그 아래 천 행의 높이를
   * 정하게 된다. 잘리는 것이 문제였다면 늘릴 것은 폭이 아니라 줄일 것이 열이다.
   */
  const textCol = (
    key: string,
    header: string,
    type: 'text' | 'long',
    value: (r: ReviewRow) => string,
  ): Column<ReviewRow>[] => [
    {
      key,
      header,
      type,
      className: pad,
      render: (r) => {
        const v = value(r)
        return (
          <span className={cn('block truncate', dim(r, 'text-gray-600'))} title={v || undefined}>
            {v || '-'}
          </span>
        )
      },
    },
  ]
  const columns: Column<ReviewRow>[] = [
    {
      key: 'name',
      header: '이름',
      type: 'name',
      className: pad,
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <span className={cn('font-medium', dim(r, 'text-gray-800'))}>{r.name || <EmptyValue />}</span>
          <RowFlag row={r} />
        </span>
      ),
    },
    ...textCol('affiliation', '소속', 'long', (r) => r.affiliation),
    ...textCol('department', '부서', 'text', (r) => r.department),
    ...textCol('position', '직책', 'text', (r) => r.position),
    ...textCol('email', '이메일', 'text', (r) => r.email),
    {
      key: 'phone',
      header: '연락처',
      type: 'phone',
      className: pad,
      // 엑셀이 지수 표기로 바꾼 번호는 자릿수가 이미 잘려 되돌릴 수 없다. 빈 칸으로 두되
      // 왜 비었는지는 말한다 — 그냥 비워 두면 명함에 번호가 없었던 것으로 읽힌다.
      render: (r) =>
        r.phoneCorrupt ? (
          <span className="text-warning" title="엑셀이 지수 표기로 바꾼 번호라 복원할 수 없습니다.">
            번호 훼손
          </span>
        ) : (
          <span className={dim(r, 'text-gray-600')}>{r.phone || '-'}</span>
        ),
    },
    {
      /**
       * 국가. 파일이 적어 낸 값이 먼저이고 없으면 연락처로 짐작하는데(`guessCountryName`),
       * 명함첩에는 국가 열이 없어 **거의 전부가 짐작**이다. 그 짐작은 한쪽으로만 빗나간다 —
       * 한국 번호를 그대로 쓰는 해외 체류자·해외 법인 담당자는 `미확인`이 아니라 `한국`으로
       * 확정 저장되어, 목록의 '국가 미확인' 축에도 걸리지 않는다. 그래서 고칠 자리는 저장 뒤가
       * 아니라 **파일을 보고 있는 지금**이어야 한다(2026-09-10 사용자 지정).
       *
       * 원장에 없는 이름으로 온 값은 `title`이 답한다 — 저장되는 것은 태그 id뿐이라 그 글자를
       * 선택지로 세울 수 없고, 조용히 지우면 파일이 뭐라고 적었는지 물을 곳이 없어진다.
       */
      key: 'country',
      header: '국가',
      widthRem: selectRem,
      className: cn('w-32', pad),
      render: (r: ReviewRow) => (
        <Select
          value={r.countryTagId ?? ''}
          disabled={r.decision === 'skip' || isDeactivated(r)}
          title={
            !r.countryTagId && r.countryLabel
              ? `파일의 값 '${r.countryLabel}'은 국가 원장에 없습니다.`
              : undefined
          }
          onChange={(e) => onCountry(r.line, e.target.value)}
        >
          <CountryOptionList options={countryOptions} emptyLabel="미확인" />
        </Select>
      ),
    },
    {
      key: 'category',
      header: '구분',
      widthRem: selectRem,
      className: cn('w-32', pad),
      render: (r) => (
        <Select
          value={r.targetCategory}
          disabled={r.decision === 'skip' || isDeactivated(r) || r.internal}
          onChange={(e) => onCategory(r.line, e.target.value)}
        >
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ),
    },
    {
      key: 'dup',
      header: (
        <span className="flex items-center whitespace-nowrap">
          중복 여부
          <Tooltip
            label="중복 여부"
            content="이름·전화·이메일 중 2개 이상 일치하면 중복으로 봅니다."
            className={tooltipScale.gap}
          />
        </span>
      ),
      // 왼쪽은 좁혀(pl-1) 구분 열에 붙이고, 오른쪽은 키워(pr-8) 주황 '중복' 뱃지가 결정 열에 붙지 않게 한다.
      widthRem: 18,
      className: 'w-72 pl-1 pr-8',
      // 중복이 있는 행만 표시. 비활성 미복구는 '비활성: 이름' 한 줄, 그 외는 생성자·구분·중복.
      render: (r) =>
        r.match ? (
          <DupCell
            row={r}
            match={r.match}
            revived={revivedLines.includes(r.line)}
            onShowReason={() => onShowReason(r.line)}
          />
        ) : (
          <span className="text-gray-300">중복 없음</span>
        ),
    },
    {
      key: 'decision',
      header: '결정',
      align: 'center',
      // 드롭다운 글씨가 잘리지 않게 열을 넓히고(w-32) 오른쪽 여백(pr-4)으로 우측 끝에서 살짝 당긴다.
      widthRem: selectRem,
      className: 'w-32 pl-2 pr-4',
      // 비활성 매칭은 먼저 '복구하기'로 의사를 밝힌 뒤에야 결정(합치기/미업로드) 드롭다운이 열린다.
      render: (r) =>
        r.internal ? (
          <span className="text-caption text-gray-500">제외</span>
        ) : r.match?.deleted && !revivedLines.includes(r.line) ? (
          <Button disabled={busy} onClick={() => onRevive(r.line)}>
            복구하기
          </Button>
        ) : (
          <Select
            value={r.decision}
            disabled={!r.name}
            onChange={(e) => onDecision(r.line, e.target.value as Decision)}
          >
            {decisionOptions(Boolean(r.match)).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.line)}
      numbered={false}
      standardColumns={false}
      // 비활성(미복구) 중복 행은 배경을 회색으로 눌러 표시한다(복구 확정 시 일반 행으로 복귀).
      rowClassName={(r) => (isDeactivated(r) ? 'bg-gray-100' : undefined)}
      selectedKeys={selected.map(String)}
      onSelectionChange={(keys) => onSelectionChange(keys.map(Number))}
      emptyText="업로드할 데이터가 없습니다."
    />
  )
}
