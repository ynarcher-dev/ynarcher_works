import { describe, expect, it } from 'vitest'

import { buildEnrichment, type ExistingRef, type ParsedRow } from './bulkUpload'

const existing = (overrides: Partial<ExistingRef> = {}): ExistingRef => ({
  id: 'network-1',
  name: '김네트워크',
  email: 'old@example.com',
  phone: '01011112222',
  affiliation: '기존회사',
  expertise: [],
  profile: {},
  category: null,
  countryTagId: null,
  contributor: null,
  deleted: false,
  deactivatedBy: null,
  deactivateReason: null,
  ...overrides,
})

const row = (overrides: Partial<ParsedRow> = {}): ParsedRow => ({
  line: 2,
  name: '김네트워크',
  affiliation: '기존회사',
  department: '',
  position: '',
  email: 'new@example.com',
  phone: '010-9999-8888',
  linkedin: '',
  category: '',
  country: '',
  expertise: [],
  phoneCorrupt: false,
  foldedLines: [],
  ...overrides,
})

describe('네트워크 대용량 업로드 연락처 병합', () => {
  it('기본 합치기는 기존 연락처를 보존한다', () => {
    expect(buildEnrichment(existing(), row())).toBeNull()
  })

  it('연락처 갱신을 명시하면 이메일과 전화번호를 교체한다', () => {
    expect(buildEnrichment(existing(), row(), undefined, true)).toEqual({
      email: 'new@example.com',
      phone: '01099998888',
    })
  })

  it('기존 연락처가 비어 있으면 기본 합치기도 빈칸을 보강한다', () => {
    expect(buildEnrichment(existing({ email: null, phone: null }), row())).toEqual({
      email: 'new@example.com',
      phone: '01099998888',
    })
  })
})
