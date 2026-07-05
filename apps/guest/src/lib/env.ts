import { z } from 'zod'

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_APP_ENV: z.enum(['local', 'development', 'production']).default('local'),
})

let cached: z.infer<typeof schema> | null = null

/** 공개 환경 변수(VITE_) 검증 접근자. */
export function getEnv(): z.infer<typeof schema> {
  if (!cached) {
    cached = schema.parse({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
    })
  }
  return cached
}
