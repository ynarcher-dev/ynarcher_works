import { describe, expect, it } from 'vitest'
import { sourcesFromFiles } from '@/features/startup/startupAiFill'

describe('sourcesFromFiles — 보류 파일의 격자 키', () => {
  it('같은 File 실물은 다시 읽어도 같은 키다', () => {
    const file = new File(['a'], '계획서.pdf', { type: 'application/pdf' })
    expect(sourcesFromFiles([file])[0]?.key).toBe(sourcesFromFiles([file])[0]?.key)
  })

  it('같은 이름의 앞 파일을 지워도 남은 파일이 앞 파일의 배정을 이어받지 않는다', () => {
    const first = new File(['a'], '계획서.pdf', { type: 'application/pdf' })
    const second = new File(['b'], '계획서.pdf', { type: 'application/pdf' })
    const before = sourcesFromFiles([first, second])
    const after = sourcesFromFiles([second])

    expect(before[0]?.key).not.toBe(before[1]?.key)
    expect(after[0]?.key).toBe(before[1]?.key)
  })
})
