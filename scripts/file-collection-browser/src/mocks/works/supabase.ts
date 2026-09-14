/**
 * Supabase 클라이언트의 **검증용 대역**.
 *
 * 실물(`apps/works/src/lib/supabase.ts`)은 모듈이 적재되는 순간 `getEnv()`로 `VITE_SUPABASE_URL`
 * 을 요구하고, 이 픽스처에는 그 값이 없어 화면이 서기도 전에 zod가 던진다. 그래서 이 자리만
 * 갈아 끼운다 — 화면과 그 화면이 쓰는 규칙(검증·격자·잠금)은 실물 그대로 둔다.
 *
 * **아무 데도 보내지 않는다.** 원장 불러오기 전용 축약 RPC만 아래 고정 응답으로 받고,
 * 그 밖의 호출은 던진다 — 그래야 대역이 빠진 자리가 검증에서 드러난다.
 */
function refuse(path: string): never {
  throw new Error(`[fixture] Supabase 호출이 대역을 빠져나갔습니다: ${path}`)
}

export const supabase = {
  rpc: async (fn: string) => {
    if (fn === 'guest_account_ledger_candidates') {
      return {
        data: [
          {
            source_id: 'network-1',
            name: '김와이앤아처대표이사',
            email: 'very.long.mailbox.name@ynarcher-partners-company.co.kr',
            affiliation: '주식회사 와이앤아처파트너스 글로벌사업본부',
            total_count: 2,
          },
          {
            source_id: 'network-2',
            name: '박전문가',
            email: 'expert@example.com',
            affiliation: '독립 전문가',
            total_count: 2,
          },
        ],
        error: null,
      }
    }
    return refuse(`rpc(${fn})`)
  },
  from: (table: string) => refuse(`from(${table})`),
  functions: { invoke: (fn: string) => refuse(`functions.invoke(${fn})`) },
  storage: { from: (bucket: string) => refuse(`storage.from(${bucket})`) },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
  },
}
