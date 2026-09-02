import { describe, expect, it } from 'vitest'
import { effectiveWindow, gate, kstDay, type GateInput } from './publicModuleLinkGate.ts'

/**
 * 모듈 공개 링크 게이트 회귀 테스트.
 *
 * 이 판정은 틀리는 방향이 둘이고 둘 다 사고다 — 느슨하면 닫은 문이 열려 있고, 빡빡하면
 * 열어 둔 문이 담당자 몰래 닫힌다. 그래서 '열린다'와 '닫힌다'를 같은 무게로 검증한다.
 * 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §15
 */

/** 열려 있는 링크의 기본형. 각 케이스는 어긋내고 싶은 한 축만 덮어쓴다. */
function open(over: Partial<GateInput> = {}): GateInput {
  return {
    linkStatus: 'OPEN',
    linkOpenAt: null,
    linkCloseAt: null,
    moduleStartDate: null,
    moduleEndDate: null,
    moduleExists: true,
    moduleEnabled: true,
    moduleStatus: 'OPEN',
    programAlive: true,
    ...over,
  }
}

const at = (iso: string) => new Date(iso).getTime()

describe('열리는 경우', () => {
  it('상태가 OPEN이고 기간이 비어 있으면 무기한 열린다', () => {
    expect(gate(open()).reason).toBeNull()
  })

  it('완료(CLOSED) 모듈도 계속 열어 둔다 — 끝난 메뉴의 자료를 되돌아보는 것은 정당한 용도다', () => {
    expect(gate(open({ moduleStatus: 'CLOSED' })).reason).toBeNull()
  })

  it('공개 기간 안이면 열린다', () => {
    const input = open({ linkOpenAt: '2026-09-01T00:00:00Z', linkCloseAt: '2026-09-30T00:00:00Z' })
    expect(gate(input, at('2026-09-15T00:00:00Z')).reason).toBeNull()
  })
})

describe('링크 상태·기간', () => {
  it('PRIVATE는 아직 열지 않은 것이라 closed와 사유를 가른다', () => {
    expect(gate(open({ linkStatus: 'PRIVATE' })).reason).toBe('private')
  })

  it('CLOSED는 담당자가 마감한 것이다', () => {
    expect(gate(open({ linkStatus: 'CLOSED' })).reason).toBe('closed')
  })

  it('시작 전은 scheduled — 마감과 같은 문구로 뭉뚱그리지 않는다', () => {
    const input = open({ linkOpenAt: '2026-09-10T00:00:00Z' })
    expect(gate(input, at('2026-09-01T00:00:00Z')).reason).toBe('scheduled')
  })

  it('마감 후는 closed', () => {
    const input = open({ linkCloseAt: '2026-09-10T00:00:00Z' })
    expect(gate(input, at('2026-09-11T00:00:00Z')).reason).toBe('closed')
  })

  it('경계값: 시작 시각 정각은 열린다', () => {
    const input = open({ linkOpenAt: '2026-09-10T00:00:00Z' })
    expect(gate(input, at('2026-09-10T00:00:00Z')).reason).toBeNull()
  })
})

describe('모듈 기간 상속', () => {
  it('링크에 기간이 없으면 모듈 기간을 KST 하루의 시작·끝으로 읽는다', () => {
    const w = effectiveWindow(open({ moduleStartDate: '2026-09-01', moduleEndDate: '2026-09-30' }))
    expect(w.openAt).toBe('2026-09-01T00:00:00+09:00')
    expect(w.closeAt).toBe('2026-09-30T23:59:59.999+09:00')
  })

  it('마감일 당일 한국 시간 오후 6시에도 열려 있다 — UTC로 읽으면 오전 9시에 닫힌다', () => {
    const input = open({ moduleEndDate: '2026-09-30' })
    // 2026-09-30 18:00 KST = 09:00Z. 오프셋을 명시하지 않으면 이 시점에서 이미 마감된다.
    expect(gate(input, at('2026-09-30T09:00:00Z')).reason).toBeNull()
  })

  it('마감일 다음 날 한국 시간 0시 1분에는 닫힌다', () => {
    const input = open({ moduleEndDate: '2026-09-30' })
    expect(gate(input, at('2026-09-30T15:01:00Z')).reason).toBe('closed')
  })

  it('링크에 적은 기간이 모듈 기간을 이긴다', () => {
    const w = effectiveWindow(
      open({ moduleEndDate: '2026-09-30', linkCloseAt: '2026-10-05T00:00:00Z' }),
    )
    expect(w.closeAt).toBe('2026-10-05T00:00:00Z')
  })

  it('날짜 형식이 아닌 세팅값은 상속하지 않는다(빈 문자열·자유 입력 방어)', () => {
    expect(effectiveWindow(open({ moduleStartDate: '', moduleEndDate: '미정' })).closeAt).toBeNull()
  })

  it('kstDay는 하루의 시작과 끝을 오프셋과 함께 답한다', () => {
    expect(kstDay('2026-01-01', 'start')).toBe('2026-01-01T00:00:00+09:00')
    expect(kstDay('2026-01-01', 'end')).toBe('2026-01-01T23:59:59.999+09:00')
  })
})

describe('모듈·사업 생존', () => {
  it('고아 링크(모듈이 지워짐)는 module_closed로 닫힌다 — 주소 오류가 아니다', () => {
    expect(gate(open({ moduleExists: false })).reason).toBe('module_closed')
  })

  it('꺼진 모듈은 닫힌다', () => {
    expect(gate(open({ moduleEnabled: false })).reason).toBe('module_closed')
  })

  it('준비(DRAFT) 모듈은 열지 않는다 — 아직 열리지 않은 자료가 바깥에 먼저 나가면 안 된다', () => {
    expect(gate(open({ moduleStatus: 'DRAFT' })).reason).toBe('module_closed')
  })

  it('취소된 모듈은 닫힌다', () => {
    expect(gate(open({ moduleStatus: 'CANCELLED' })).reason).toBe('module_closed')
  })

  it('사업이 종료·취소·삭제되면 링크도 함께 닫힌다', () => {
    expect(gate(open({ programAlive: false })).reason).toBe('module_closed')
  })
})

describe('판정 순서는 바깥부터', () => {
  it('담당자가 마감한 링크는 모듈이 준비 단계여도 closed로 답한다', () => {
    // 안쪽(모듈)에서 먼저 걸리면 "메뉴가 없습니다"가 되어 실제 원인과 어긋난다.
    const input = open({ linkStatus: 'CLOSED', moduleStatus: 'DRAFT' })
    expect(gate(input).reason).toBe('closed')
  })

  it('모듈이 아예 없으면 링크 상태보다 먼저 걸린다', () => {
    const input = open({ moduleExists: false, linkStatus: 'PRIVATE' })
    expect(gate(input).reason).toBe('module_closed')
  })
})

describe('닫혔을 때도 기간을 함께 답한다', () => {
  it('화면이 "언제 열립니다"를 말할 수 있어야 하므로 사유와 기간이 같이 나온다', () => {
    const input = open({ linkOpenAt: '2026-09-10T00:00:00Z', linkCloseAt: '2026-09-20T00:00:00Z' })
    const r = gate(input, at('2026-09-01T00:00:00Z'))
    expect(r.reason).toBe('scheduled')
    expect(r.openAt).toBe('2026-09-10T00:00:00Z')
    expect(r.closeAt).toBe('2026-09-20T00:00:00Z')
  })
})
