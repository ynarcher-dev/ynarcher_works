import { describe, expect, it } from 'vitest'
import { jobTitleLabel, type JobTitleModes } from '@/features/management/jobTitle'

/**
 * 호칭 규칙은 화면이 아니라 부르는 말에서 나온다 — 태그 관리에서 넣을 법한 설정을 그대로 두고,
 * 실제로 쓰는 조합을 사례로 박아 둔다. 규칙을 고칠 일이 생기면 여기 사례부터 고친다.
 */
const modes: JobTitleModes = {
  // 임원 직급은 맡은 자리와 나란히, 사원 직급은 직책 설정을 따른다(기본).
  rank: new Map([
    ['이사', 'PARALLEL_SEPARATE'],
    ['상무', 'PARALLEL_SEPARATE'],
  ]),
  // 역할명 직책만 직급을 앞에 붙인다. 실장·팀장은 설정 없이 기본으로 둔다.
  position: new Map([
    ['심사역', 'PARALLEL_JOINED'],
    ['매니저', 'PARALLEL_JOINED'],
  ]),
}

describe('jobTitleLabel', () => {
  describe('사원직급(직책 설정을 따름)', () => {
    it('병렬 표기 직책은 직급을 앞에 붙여 한 단어로 적는다', () => {
      expect(jobTitleLabel('책임', '매니저', modes)).toBe('책임매니저')
      expect(jobTitleLabel('선임', '심사역', modes)).toBe('선임심사역')
    })

    it('설정 없는 직책은 직급을 밀어내고 직책만 적는다', () => {
      expect(jobTitleLabel('수석', '실장', modes)).toBe('실장')
      expect(jobTitleLabel('수석', '팀장', modes)).toBe('팀장')
    })
  })

  describe('임원직급(병렬 표기)', () => {
    it('직책이 있으면 직급/직책으로 나란히 적는다', () => {
      expect(jobTitleLabel('이사', '본부장', modes)).toBe('이사/본부장')
      // 직책이 병렬이어도 직급 쪽 설정이 이겨서 붙여쓰기가 아니라 슬래시가 된다.
      expect(jobTitleLabel('이사', '심사역', modes)).toBe('이사/심사역')
    })

    it('직책이 없으면 직급만 적는다', () => {
      expect(jobTitleLabel('이사', '', modes)).toBe('이사')
      expect(jobTitleLabel('상무', null, modes)).toBe('상무')
    })
  })

  describe('우선 표기가 부딪히면 직급이 이긴다', () => {
    const both: JobTitleModes = {
      rank: new Map([['수석', 'PRIORITY']]),
      position: new Map([['실장', 'PRIORITY']]),
    }
    it('직급 우선이 직책 우선을 누른다', () => {
      expect(jobTitleLabel('수석', '실장', both)).toBe('수석')
    })
    it('직책만 우선이면 직책이 남는다', () => {
      const positionOnly: JobTitleModes = {
        rank: new Map(),
        position: new Map([['실장', 'PRIORITY']]),
      }
      expect(jobTitleLabel('수석', '실장', positionOnly)).toBe('실장')
    })
  })

  it('한쪽이 비면 설정과 무관하게 남은 값이 곧 호칭이다', () => {
    expect(jobTitleLabel('책임', '', modes)).toBe('책임')
    expect(jobTitleLabel('', '팀장', modes)).toBe('팀장')
    expect(jobTitleLabel(null, '매니저', modes)).toBe('매니저')
    expect(jobTitleLabel('이사', null, modes)).toBe('이사')
  })

  it('값이 없거나 공백뿐이면 아무것도 적지 않는다', () => {
    expect(jobTitleLabel(null, null, modes)).toBe('')
    expect(jobTitleLabel('  ', '  ', modes)).toBe('')
    expect(jobTitleLabel(' 책임 ', ' 매니저 ', modes)).toBe('책임매니저')
  })

  it('같은 말이 양쪽 원장에 있으면 한 번만 적는다', () => {
    expect(jobTitleLabel('이사', '이사', modes)).toBe('이사')
  })

  describe('병렬 표기의 모양은 선언한 쪽이 정한다', () => {
    it('직급이 붙여쓰기를 고르면 붙는다', () => {
      const joinedRank: JobTitleModes = {
        rank: new Map([['이사', 'PARALLEL_JOINED']]),
        position: new Map(),
      }
      expect(jobTitleLabel('이사', '본부장', joinedRank)).toBe('이사본부장')
    })

    it('직책이 따로쓰기를 고르면 슬래시로 나뉜다', () => {
      const separatePosition: JobTitleModes = {
        rank: new Map(),
        position: new Map([['매니저', 'PARALLEL_SEPARATE']]),
      }
      expect(jobTitleLabel('책임', '매니저', separatePosition)).toBe('책임/매니저')
    })

    it('양쪽이 다른 모양을 고르면 직급 쪽 모양이 이긴다', () => {
      const clash: JobTitleModes = {
        rank: new Map([['이사', 'PARALLEL_SEPARATE']]),
        position: new Map([['매니저', 'PARALLEL_JOINED']]),
      }
      expect(jobTitleLabel('이사', '매니저', clash)).toBe('이사/매니저')
    })
  })

  it('태그 원장을 아직 못 읽었으면 직책 우선으로 떨어진다', () => {
    expect(jobTitleLabel('책임', '매니저')).toBe('매니저')
    expect(jobTitleLabel('이사', '본부장')).toBe('본부장')
    expect(jobTitleLabel('책임', '')).toBe('책임')
  })
})
