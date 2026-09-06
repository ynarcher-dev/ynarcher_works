// Edge Function이 쓰는 원격 import의 **타입만** 잇는다(tsconfig.functions.json 전용).
//
// 함수는 Deno로 배포되고 배포 도구는 타입을 보지 않는다. 그래서 이 선언이 없으면 원격
// 모듈을 쓰는 파일의 타입 오류가 실행 순간까지 드러나지 않는다 — 실제로 이 기능을 나누며
// 가장 넓게 고친 파일들(run·intake·extractRun)이 전부 그쪽이었다.
//
// 런타임과 무관하다. 설치된 같은 패키지의 타입을 빌려 쓸 뿐이며, 빌드·배포는 이 파일을 보지 않는다.
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}

/**
 * Deno 전역의 **최소 선언**.
 *
 * 실제 타입을 끌어오지 않는 이유는 이 설정의 목적이 우리 코드의 타입을 보는 것이지 런타임을
 * 흉내 내는 것이 아니기 때문이다. 여기 적힌 것만 함수들이 실제로 쓴다.
 */
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
  resolveDns(query: string, recordType: string): Promise<string[]>
}
