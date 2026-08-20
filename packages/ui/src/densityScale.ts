import type { Density } from './density'

/**
 * 밀도 스케일 — 모든 컴포넌트 치수의 단일 조절판.
 *
 * 높이·글자·여백·간격을 여기 한 곳에 모은다. 규격을 조정할 일이 생기면 컴포넌트를 돌아다니지
 * 않고 이 파일만 고친다. 값 자체(40px 등)는 `tailwind-preset.mjs`의 토큰이 갖고, 이 파일은
 * "어느 맥락에 어느 토큰을 쓰는가"라는 매핑만 갖는다.
 *
 * 크기를 가르는 축은 중요도가 아니라 놓이는 자리다.
 * - `page`  일반 UI — 페이지 툴바·상세 헤더·독립 폼
 * - `card`  카드섹션 내부
 * - `table` 데이터 테이블 셀 내부
 *
 * 근거: docs/docs_design/5_component_spec_rules.md §1.2
 */

/** 라벨이 있는 가변폭 컨트롤(버튼·입력·선택). 한 줄에 나란히 서므로 높이·글자를 공유한다. */
export const controlScale: Record<Density, { height: string; text: string; padX: string; gap: string }> = {
  page: { height: 'h-ctl-page', text: 'text-body', padX: 'px-4', gap: 'gap-2' },
  card: { height: 'h-ctl-card', text: 'text-body-sm', padX: 'px-3', gap: 'gap-1.5' },
  table: { height: 'h-ctl-table', text: 'text-caption', padX: 'px-2.5', gap: 'gap-1' },
}

/**
 * 컨트롤 안에 아이콘 슬롯이 있는 경우의 좌우 여백.
 * `leading`은 아이콘이 왼쪽(검색 입력), `trailing`은 오른쪽(셀렉트 화살표).
 * `iconLeft`/`iconRight`는 그 슬롯에 놓인 아이콘 자체의 절대 위치로, 위 여백과 짝을 이룬다.
 */
export const controlIconPad: Record<
  Density,
  { leading: string; trailing: string; iconLeft: string; iconRight: string }
> = {
  page: { leading: 'pl-11 pr-4', trailing: 'pl-4 pr-11', iconLeft: 'left-4', iconRight: 'right-4' },
  card: { leading: 'pl-9 pr-3', trailing: 'pl-3 pr-9', iconLeft: 'left-3', iconRight: 'right-3' },
  table: { leading: 'pl-7 pr-2.5', trailing: 'pl-2.5 pr-7', iconLeft: 'left-2.5', iconRight: 'right-2.5' },
}

/** 정사각 아이콘 버튼. 라벨이 없어 같은 맥락의 컨트롤보다 한 단계 작다. */
export const iconScale: Record<Density, { box: string; glyph: number }> = {
  page: { box: 'size-icon-page', glyph: 18 },
  card: { box: 'size-icon-card', glyph: 16 },
  table: { box: 'size-icon-table', glyph: 14 },
}

/** 배지·태그. 표시용(Badge)과 선택용(TagChip)이 같은 값을 공유해야 나란히 놓였을 때 어긋나지 않는다. */
export const tagScale: Record<Density, { height: string; text: string; padX: string; dot: string }> = {
  // 좌우 여백이 높이 대비 넉넉한 이유: 알약(pill) 형태라 양끝이 둥글게 깎여, 각진 모양과 같은
  // 여백을 주면 글자가 곡선에 붙어 답답해 보인다.
  page: { height: 'h-tag-page', text: 'text-tag-page', padX: 'px-2.5', dot: 'h-1.5 w-1.5' },
  card: { height: 'h-tag-card', text: 'text-tag-card', padX: 'px-2', dot: 'h-1 w-1' },
  table: { height: 'h-tag-table', text: 'text-tag-table', padX: 'px-2', dot: 'h-1 w-1' },
}

/** 여러 줄 입력(TextArea) — 높이는 `rows`가 정하므로 글자·여백만 밀도에 반응한다. */
export const textAreaScale: Record<Density, string> = {
  page: 'px-4 py-3 text-body',
  card: 'px-3 py-2 text-body-sm',
  table: 'px-2.5 py-1.5 text-caption',
}

/** 체크박스·라디오 등 정사각 선택 컨트롤. */
export const toggleScale: Record<Density, { box: string; text: string; gap: string }> = {
  page: { box: 'size-5', text: 'text-body', gap: 'gap-2' },
  card: { box: 'size-4', text: 'text-body-sm', gap: 'gap-2' },
  table: { box: 'size-3.5', text: 'text-caption', gap: 'gap-1.5' },
}

/**
 * 스위치 — 트랙과 썸이 함께 움직여야 하므로 별도 표로 둔다.
 * `travel`은 썸의 이동 거리로, 트랙 너비 − 썸 크기 − 좌우 여백(2px)과 일치해야 한다.
 */
export const switchScale: Record<Density, { track: string; thumb: string; travel: string }> = {
  page: { track: 'h-6 w-11', thumb: 'size-5', travel: 'translate-x-[22px]' },
  card: { track: 'h-5 w-9', thumb: 'size-4', travel: 'translate-x-[18px]' },
  table: { track: 'h-4 w-7', thumb: 'size-3', travel: 'translate-x-[14px]' },
}

/** 아바타 — 이니셜 글자가 원 안에서 같은 비율로 보이도록 크기와 글자를 함께 옮긴다. */
export const avatarScale: Record<Density, { box: string; text: string }> = {
  page: { box: 'size-10', text: 'text-body-lg' },
  card: { box: 'size-8', text: 'text-body' },
  table: { box: 'size-6', text: 'text-caption' },
}

/** 탭 — 언더라인 탭의 높이를 같은 맥락의 컨트롤과 맞춘다(가변 py 금지). */
export const tabScale: Record<Density, { height: string; text: string; padX: string }> = {
  page: { height: 'h-ctl-page', text: 'text-body', padX: 'px-4' },
  card: { height: 'h-ctl-card', text: 'text-body-sm', padX: 'px-3' },
  table: { height: 'h-ctl-table', text: 'text-caption', padX: 'px-2.5' },
}

/**
 * 페이지네이션 — 이동 버튼은 아이콘 버튼 격자를 그대로 쓴다.
 * 숫자 버튼(`numBox`)은 같은 높이를 유지하되 세 자리 이상에서 넓어져야 하므로 최소 너비로 잡는다.
 */
export const pagerScale: Record<
  Density,
  { box: string; numBox: string; text: string; glyph: number }
> = {
  page: { box: 'size-icon-page', numBox: 'h-icon-page min-w-icon-page', text: 'text-body-sm', glyph: 16 },
  card: { box: 'size-icon-card', numBox: 'h-icon-card min-w-icon-card', text: 'text-caption', glyph: 14 },
  table: { box: 'size-icon-table', numBox: 'h-icon-table min-w-icon-table', text: 'text-caption', glyph: 12 },
}

/**
 * 데이터 테이블 격자 — 표는 언제나 `table` 맥락이므로 밀도별 분기 없이 단일 값이다.
 * 행 높이 36px는 셀 안 컨트롤(24px) 위아래로 6px씩 남긴다.
 */
export const tableGrid = {
  head: 'h-row',
  row: 'h-row',
  /** 셀 좌우 여백. 셀 안 버튼의 `px-2.5`와 같은 값이라 열이 시각적으로 정렬된다. */
  cellX: 'px-2.5',
  /**
   * 열이 많은 표의 축소 여백. 폭을 고정한 표(`layout="fixed"`)와, 열 수가 많아 가로가 빠듯한
   * 표(`dense`, 예: 펀드 목록)가 함께 쓴다 — 둘 다 "한 줄에 열을 더 넣어야 한다"는 같은 사정이다.
   */
  cellXTight: 'px-2',
} as const

/**
 * 열 폭 스케일 — 폭을 가르는 축은 열의 중요도가 아니라 **담기는 데이터의 종류**다.
 *
 * 크기를 `densityScale`이 "놓이는 자리"로 가르듯, 폭은 "무엇이 들어가는가"로 가른다. 날짜 열은
 * 어느 화면에 있든 같은 폭이어야 하고, 사람 이름 열도 마찬가지다 — 그래야 화면을 옮겨 다녀도
 * 같은 종류의 정보가 같은 자리에서 읽힌다.
 *
 * 이 표가 생기기 전에는 기준이 없었다. works의 컬럼 196개 중 132개가 `w-16`부터 `w-72`까지
 * **13종의 값을 화면마다 손으로** 붙이고 있었고, 나머지 64개는 브라우저 자동이었다. 그래서 같은
 * '담당자' 열이 화면마다 다른 폭이었고, 심지어 같은 화면에서도 페이지를 넘겨 더 긴 이름이
 * 나타나면 폭이 바뀌었다.
 *
 * 값마다 `whitespace-nowrap`이 함께 들어 있는 것은 실수가 아니라 **이 스케일이 성립하기 위한
 * 조건**이다. 자동 레이아웃에서 셀의 width는 힌트일 뿐이라, 다른 열이 공간을 요구하면 브라우저는
 * 이 열을 min-content(끊을 수 있는 가장 짧은 조각)까지 쥐어짠다. `2026-05-14`는 하이픈에서 끊기므로
 * min-content가 `2026-` 폭이고, 그러면 지정한 112px과 무관하게 날짜가 두 줄로 접힌다. 줄바꿈을
 * 막아야 min-content가 문자열 전체가 되어 폭이 실제로 지켜진다. 표준 열(생성자·수정일)이 예전부터
 * `whitespace-nowrap`을 달고 있던 이유도 같다.
 *
 * > [!NOTE]
 * > 그래도 width는 **하한**이다. 내용이 지정 폭보다 길면 열은 그만큼 늘어난다. 폭을 정확히
 * > 고정하고 넘치는 글자를 잘라내려면 `layout="fixed"`를 쓴다.
 *
 * 머리글이 값보다 길면 머리글이 폭을 정한다는 점도 함께 기억할 것 — `투자금액(백만원)`처럼 단위를
 * 괄호로 붙인 머리글은 값이 3자리여도 열을 128px까지 벌린다. 그럴 때는 폭을 키우지 말고 머리글을
 * 줄이는 쪽이 맞다.
 *
 * 식별 열(`primary`)에는 폭을 주지 않는다 — `DataTable`이 남는 폭을 그 열에 몰아준다.
 */
export const columnWidth = {
  /** 순번. 세 자리까지 여유. */
  seq: 'w-12 whitespace-nowrap',
  /** 상태 배지 한 개. */
  badge: 'w-20 whitespace-nowrap',
  /** 사람 이름. */
  person: 'w-24 whitespace-nowrap',
  /** 업종·분류 등 짧은 라벨. 한 줄에 들어가지 않을 만큼 길어질 수 있으면 `wide`를 쓴다. */
  short: 'w-24 whitespace-nowrap',
  /** 날짜 `YYYY-MM-DD`. 표준 열 '수정일'과 같은 폭이라 표끼리 세로가 맞는다. */
  date: 'w-28 whitespace-nowrap',
  /** 금액·수량 등 자릿수가 있는 수치. */
  money: 'w-28 whitespace-nowrap',
  /** 건수·개수 등 세 자리 안쪽의 수치. */
  count: 'w-20 whitespace-nowrap',
  /** 일시 `YYYY-MM-DD HH:MM:SS`. */
  datetime: 'w-36 whitespace-nowrap',
  /**
   * 주소·비고 등 긴 텍스트 중 식별 열이 아닌 것.
   *
   * 유일하게 줄바꿈을 허용한다 — 길이를 예측할 수 없는 문장에 `whitespace-nowrap`을 걸면 열 하나가
   * 표 전체를 가로로 밀어낸다. 대신 이 열은 다른 열처럼 폭이 지켜지지 않을 수 있다.
   */
  wide: 'w-44',
} as const

/**
 * 카드 글자 위계 — 카드의 제목과 부제 규격.
 *
 * 카드 제목은 본문(14px)보다 한 단계 위인 16px에 세운다. 화면의 크기 사다리는
 * `페이지 제목 24 → 섹션 헤딩 20 → 카드 제목 16 → 본문 14`이고, 이 칸이 비면 카드 제목이
 * 본문과 같은 크기가 되어 굵기 하나로만 버틴다 — 그러면 스크롤할 때 카드가 어디서 시작하는지
 * 제목이 알려주지 못한다.
 *
 * 부제는 제목과 달리 크기를 본문에 맞추고 색으로만 물러난다. 제목 바로 아래에서 크기까지
 * 줄이면 한 헤더 안에 세 크기가 생긴다.
 */
export const cardText = {
  /** 카드 제목. 카드를 쓰는 쪽에서 직접 쓰지 말고 `Card`·`PanelCard`의 `title`에 맡긴다. */
  title: 'text-body-lg font-semibold text-gray-900',
  /** 카드 부제 — 제목 아래 한 줄 보조 설명. */
  subtitle: 'text-body text-gray-500',
  /**
   * 카드 안 소제목 — 제목 아래 층.
   *
   * 카드 제목과의 구분은 크기(16 → 14)가 맡고, 색은 제목과 같은 gray-900을 유지한다. 색까지
   * 빼면 소제목이 자기가 이끄는 본문(gray-900/700)보다 연해져 위계가 뒤집힌다 — 제목이 본문보다
   * 흐린 화면은 어디가 묶음의 시작인지 알려주지 못한다. 카드 제목이 없는 카드에서는 이 소제목이
   * 그 안의 최상위 라벨이 되므로 더욱 그렇다.
   */
  subhead: 'text-body font-semibold text-gray-900',
  /**
   * 라벨: 값 쌍의 라벨/값.
   *
   * 한 줄형(`InfoField`)과 세로형(라벨 위·값 아래) 필드가 같은 값을 공유한다. 크기는 본문 하나로
   * 두고 위계는 색으로만 만든다 — 라벨을 작게·굵게·유채색으로 만들면 반복될 때 위계가 아니라
   * 노이즈가 된다.
   */
  label: 'text-body text-gray-500',
  value: 'text-body text-gray-900',
  /**
   * 메타 값 — 생성자·수정일처럼 레코드 자체가 아니라 레코드를 **다룬 흔적**인 값.
   *
   * 도메인 값보다 한 단 연하다(2026-08-20). 이전에는 이 단계가 없어서 카드에서 `생성자: 박아처`가
   * `대표자: 정민서`와 완전히 같은 무게였다 — 레코드를 입력한 사람이 그 기업의 대표와 같은 크기로
   * 읽히는 셈이다. 표에는 이미 같은 개념(`tableText.meta`)이 있었는데 카드에만 없어서, 같은 정보가
   * 놓이는 자리에 따라 다른 위계를 가졌다.
   *
   * 색이 표의 메타(gray-600)와 다른 이유는 기준이 다르기 때문이다. 규칙은 양쪽 다 "도메인 값보다
   * 한 단 연하게"이고, 표의 값은 gray-700, 카드의 값은 gray-900이라 한 단 내린 결과가 각각
   * gray-600과 gray-700이 된다. 단계의 의미는 절대 색이 아니라 이웃과의 관계가 정한다.
   *
   * 라벨(gray-500)보다는 여전히 진하다 — 메타여도 값은 값이므로 라벨:값 구분은 유지되어야 한다.
   */
  meta: 'text-body text-gray-700',
  /**
   * 카드 제목 옆 건수 표기 — 배지가 아니라 `[3]` 말머리 형태.
   *
   * 알약 배지는 제목과 무게가 비슷해 제목 읽기를 방해한다. 카드가 세로로 쌓이면 제목마다
   * 회색 알약이 따라붙어 눈이 걸릴 곳이 늘어난다. 대괄호 숫자는 제목의 부속으로 읽히면서
   * 색 하나로 존재를 알린다 — 게시판 `[공지]` 말머리와 같은 판단이다.
   * 근거: hub/PostFlagBadges.tsx
   *
   * 크기는 본문 단계(14px)로 눌러 제목(16px)의 부속임을 드러낸다. 크기가 갈리므로 놓을 때는
   * `items-center`로 세로 중앙을 맞춘다 — 대괄호는 아래로 뻗는 글자라 baseline에 걸면
   * 숫자만 내려앉아 보인다. 소제목(`subhead`, 14px) 옆에서도 같은 값을 쓴다.
   */
  count: 'text-body font-semibold tabular-nums text-danger-700',
} as const

/**
 * 표 안 글자 위계 — 크기는 하나, 구분은 굵기와 색으로만 만든다.
 *
 * 셀 텍스트도 `table` 맥락의 컨트롤과 같은 12px에 세운다. 본문만 14px로 남으면 한 행 안에서
 * 값(14px)·버튼 라벨(12px)·배지(10px)가 제각각 크기로 보인다.
 *
 * 위계는 세 단계면 충분하다. 특히 `primary`(식별 열)를 행마다 하나로 제한하는 것이 핵심이다 —
 * 도메인 열 전체를 진하게 쓰면 한 행이 통째로 진해져 눈이 걸릴 곳이 없어진다.
 */
export const tableText = {
  /**
   * 머리글. 값보다 한 단계 눌러 배경으로 물러나게 한다.
   *
   * 눌러 두되 gray-500까지 내리지는 않는다(2026-08-20). 표 안 글자는 전부 12px인데, 한글 12px은
   * 받침까지 획이 촘촘해 라틴 12px보다 훨씬 먼저 뭉갠다. gray-500은 흰 배경에서 6.06:1로 AA는
   * 넘지만 이 크기에서는 흐리게 읽혔고, 머리글 배경(gray-50) 위에서는 5.60:1까지 떨어졌다.
   * gray-600으로 한 단 올리면 7.77:1(머리글 배경 위 7.19:1)이 되어 굵기(semibold)가 살아난다.
   * 값(gray-700)과의 위계는 여전히 색으로 갈린다.
   */
  head: 'text-caption font-semibold text-gray-600',
  /** 식별 값 — 그 행이 무엇인지 알려주는 열(이름·기업명). 행마다 하나만. */
  primary: 'text-caption font-medium text-gray-900',
  /** 일반 값 — 나머지 도메인 열 전부. */
  body: 'text-caption text-gray-700',
  /** 보조 값 — No.·생성자·수정일 등 레코드 자체가 아닌 메타. 근거는 `head`와 같다. */
  meta: 'text-caption text-gray-600',
  /** 빈 값 — 값이 없어 '-'로 대체한 자리. 실제 값과 구분되도록 한 단계 더 흐리게 둔다. */
  empty: 'text-gray-400',
} as const

/** 스피너 — 로딩 자리를 차지하는 크기이므로 아이콘 격자보다 한 단계 작게 잡는다. */
export const spinnerScale: Record<Density, string> = {
  page: 'size-6',
  card: 'size-5',
  table: 'size-4',
}

/** 폼 컨트롤 4상태(기본·호버·포커스·비활성) 공통 외형. 밀도와 무관하다. */
export const formBaseClass =
  'w-full rounded-radius-md border bg-white border-gray-300 text-gray-900 shadow-soft transition-all duration-fast ' +
  'placeholder:text-gray-400 hover:border-gray-400 ' +
  'focus-visible:outline-none focus-visible:border-brand/50 focus-visible:shadow-popover ' +
  'disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none'

/** 폼 오류 상태 덮어쓰기. */
export const formInvalidClass =
  'border-danger-700 bg-danger-subtle hover:border-danger-700 focus-visible:border-danger-700 focus-visible:shadow-popover'
