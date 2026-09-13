/**
 * 주소가 정하는 화면 상태.
 *
 * 가짜 훅들이 **한 곳에서** 이 값을 읽는다 — 상태를 훅마다 따로 두면 같은 화면 안에서
 * 공개 여부가 갈리는 조합이 생긴다. 주소를 읽는 시점은 모듈 적재 때 한 번이며, 러너는
 * 상태마다 페이지를 새로 연다.
 */
const params = new URLSearchParams(globalThis.location?.search ?? '')

export const scenario = {
  /** 원장 조회가 실패한 화면(빈 성공과 구분해 보여야 한다). */
  failing: params.get('state') === 'error',
  /** 아직 원장이 없는 첫 진입. */
  empty: params.get('state') === 'empty',
  /** 공개 뒤인가 — WORKS는 구성이 잠기고 관제가 첫 화면이 된다. */
  published: params.get('published') === '1',
  /** 워크스페이스 쓰기 권한. 화면에서 감추는 것은 인가가 아니지만 조작부 유무가 갈린다. */
  canWrite: params.get('canWrite') !== '0',
  /** GUEST 모듈 상태 — `CLOSED`면 올리기·제출이 잠긴다. */
  moduleStatus: params.get('moduleStatus') ?? 'OPEN',
  /** 내 배정이 없는 GUEST(공개 전과 같은 빈 화면). */
  unassigned: params.get('assigned') === '0',
  /** 얕은 표본(2단계)으로 세운 화면 — 조작을 눌러 보는 줄들이 쓴다. */
  shallow: params.get('shallow') === '1',
  /** 트리 조회가 늦게 오는 화면 — 로딩 뒤 초기화가 실제로 서는지 본다. */
  slowLoad: params.get('slow') === '1',
  /** 구성 저장이 거절되는 화면 — 그때 고치던 것이 남아 있는지 본다. */
  saveError: params.get('saveError') === '1',
}

/** 조회 훅의 공통 모양. 실제 훅은 react-query를 쓰지만 화면이 읽는 칸은 이것뿐이다. */
export function query<T>(data: T, opts: { loading?: boolean } = {}) {
  return {
    data: scenario.failing ? undefined : data,
    isLoading: Boolean(opts.loading),
    isError: scenario.failing,
    error: scenario.failing ? new Error('표본: 조회 실패') : null,
    refetch: () => Promise.resolve(),
  }
}

/** 변경 훅의 공통 모양. 실제로 아무 데도 보내지 않는다(원격 통신 없음). */
export function mutation<A, R>(result: R) {
  return {
    mutate: (_args: A, opts?: { onError?: (e: unknown) => void; onSuccess?: (r: R) => void }) => {
      opts?.onSuccess?.(result)
    },
    mutateAsync: (_args: A) => Promise.resolve(result),
    isPending: false,
    isError: false,
    error: null,
  }
}
