import { Badge, Button, DataTable, InlineSelect, Spinner, type Column, type DataTableProps } from '@ynarcher/ui'
import { useMemo } from 'react'
import { maskEmail, maskPhone } from '@/lib/mask'
import { useSensitiveStore } from '@/features/admin/sensitiveStore'
import { OverflowTags } from '@/features/master/OverflowTags'
import type { MasterColumn, MasterRow } from '@/features/master/types'

/** 컬럼 name의 점 경로(예: 'profile.position')로 중첩 값을 읽는다. */
function resolveField(row: MasterRow, path: string): unknown {
  if (!path.includes('.')) return (row as Record<string, unknown>)[path]
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, row)
}

/** 값이 비면 두 번째 경로에서 대체값을 읽는다(프로필 profile.* / 조직 contact.* 공용). */
function resolveEither(row: MasterRow, primary: string, fallback: string): unknown {
  const v = resolveField(row, primary)
  return v == null || v === '' ? resolveField(row, fallback) : v
}

/**
 * 복사 버튼 텍스트: 이름/소속·담당자/직책·직급/이메일/연락처를 라벨과 함께 줄바꿈으로 조합.
 * 프로필 엔티티(전문가·VAN·투자자)는 최상위 스칼라(email/phone)와 profile.* 를,
 * 조직 엔티티(기업·기관·대학·기타)는 representative와 contact.* 를 함께 커버한다.
 */
function buildCopyText(row: MasterRow): string {
  const line = (label: string, value: unknown) =>
    `${label}: ${value == null || value === '' ? '' : String(value)}`
  return [
    line('이름', resolveField(row, 'name')),
    line('소속/담당자', resolveEither(row, 'affiliation', 'representative')),
    line('직책/직급', resolveEither(row, 'profile.position', 'contact.position')),
    line('이메일', resolveEither(row, 'email', 'contact.email')),
    line('연락처', resolveEither(row, 'phone', 'contact.phone')),
  ].join('\n')
}

interface MasterListViewProps {
  label: string
  columns: MasterColumn[]
  /** (미사용) 정본/임시 상태 배지 — 상태 컬럼 제거로 현재 렌더에 반영되지 않는다. */
  hasStatus?: boolean
  rows: MasterRow[]
  isLoading: boolean
  /** 상세 보기 핸들러(현재 목록 버튼은 미노출, 상세 모달 연동 유지를 위해 옵션으로 보존). */
  onView?: (row: MasterRow) => void
  /** 수정(NETWORKS 등 편집 가능 컨텍스트에서만 주입). 미지정 시 수정 버튼 미노출. */
  onEdit?: (row: MasterRow) => void
  /** 행 클릭(상세페이지 진입 등). 지정 시 행이 클릭 가능해진다. */
  onRowClick?: (row: MasterRow) => void
  /** 비활성화(소프트 삭제) 핸들러. 지정 시 관리 컬럼의 비활성화 버튼이 활성화된다. */
  onDeactivate?: (row: MasterRow) => void
  /** true면 비활성화 버튼이 내장 confirm 없이 핸들러를 호출한다(사유 입력 모달 등 사용 시). */
  deactivateWithReason?: boolean
  /** 관리(비활성화) 컬럼 노출 여부. HUB(조회 센터)는 false, NETWORKS(원장)는 true. 기본 true. */
  manageable?: boolean
  /**
   * 인라인 구분 드롭다운(kind: 'category' 컬럼 전용). 미분류 임시 저장소에서 목록에 머문 채
   * 구분을 선택해 대상 네트워크로 이관할 때 주입한다. 미주입 시 해당 컬럼은 태그로 폴백한다.
   */
  categorySelect?: {
    /** 드롭다운 옵션(value = 저장/이관 기준 구분 라벨). 선두에 빈 값 플레이스홀더 권장. */
    options: { value: string; label: string }[]
    /** 선택 시 호출. value가 빈 문자열(플레이스홀더)이면 호출 측에서 무시한다. */
    onChange: (row: MasterRow, value: string) => void
    /** 이관 처리 중 전체 드롭다운 비활성화(중복 제출 방지). */
    disabled?: boolean
  }
  /** 행 다중선택 키(controlled). 지정 시 선택 상태를 상위가 소유(일괄 작업용). */
  selectedKeys?: string[]
  /** 선택 변경 콜백. 지정 시 selectable 체크박스 선택을 상위로 전달한다. */
  onSelectionChange?: (keys: string[]) => void
  /**
   * 서버 사이드 페이지네이션(0-base page). 지정 시 표 하단에 페이저를 노출하고 No. 컬럼을
   * 전체 건수 기준으로 매긴다. 미지정 시 페이저 없이 전달된 rows를 그대로 렌더한다(HUB 등).
   * DataTable로 그대로 전달된다(페이저·넘버링은 공용 컴포넌트가 소유).
   */
  pagination?: DataTableProps<MasterRow>['pagination']
}

/**
 * 마스터 공용 리스트뷰. NETWORKS와 HUB가 동일한 표를 공유하며, 개인정보 컬럼은 항상 마스킹한다.
 * 편집 가능 여부(수정 버튼)만 `onEdit` 주입으로 갈린다.
 */
export function MasterListView({
  label,
  columns,
  rows,
  isLoading,
  onEdit,
  onRowClick,
  onDeactivate,
  deactivateWithReason,
  manageable = true,
  categorySelect,
  selectedKeys,
  onSelectionChange,
  pagination,
}: MasterListViewProps) {
  const show = useSensitiveStore((s) => s.show)
  const cols = useMemo<Column<MasterRow>[]>(() => {
    const base: Column<MasterRow>[] = columns.map((c) => ({
      key: c.name,
      header: c.label,
      align: c.align,
      className: c.className,
      render: (r) => {
        if (c.kind === 'placeholder') return '-'
        const raw = resolveField(r, c.name)
        if (c.kind === 'match') {
          // 목록은 읽기용 태그. 가능 여부 설정은 상세 페이지 드롭다운에서 수행한다.
          const ok = raw == null || raw === '' ? true : raw === true || raw === 'true' || raw === 'available'
          return (
            <Badge tone={ok ? 'success' : 'neutral'}>
              {ok ? '가능' : '불가능'}
            </Badge>
          )
        }
        if (c.kind === 'count') {
          const n = raw == null || raw === '' ? 999 : Number(raw)
          return <span className="tabular-nums">{n.toLocaleString()}건</span>
        }
        if (c.kind === 'rating') {
          const score = raw == null || raw === '' ? 5.0 : Number(raw)
          return (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-warning"
                aria-hidden
              >
                <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {score.toFixed(1)}
            </span>
          )
        }
        if (c.kind === 'tags') {
          const arr = Array.isArray(raw) ? (raw as unknown[]).map(String) : []
          if (arr.length === 0) return '-'
          return <OverflowTags tags={arr} />
        }
        if (c.kind === 'link') {
          // 링크드인 등 URL: 값이 있으면 브랜드 색 아이콘 링크, 없으면 회색 아이콘(비활성).
          const url = typeof raw === 'string' ? raw.trim() : ''
          const icon = (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
            </svg>
          )
          if (!url) {
            return (
              <span className="inline-flex text-gray-300" title="링크드인 없음" aria-label="링크드인 없음">
                {icon}
              </span>
            )
          }
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex text-[#0A66C2] hover:opacity-80"
              title="링크드인 프로필 열기"
              aria-label="링크드인 프로필 열기"
            >
              {icon}
            </a>
          )
        }
        const v = raw as string | null | undefined
        if (c.kind === 'category') {
          // 인라인 구분 드롭다운(미분류 임시 저장소). 핸들러 미주입 시 태그로 폴백한다.
          if (categorySelect) {
            const known = categorySelect.options.some((o) => o.value === v)
            return (
              <InlineSelect
                value={known ? (v as string) : ''}
                disabled={categorySelect.disabled}
                // 행 클릭(상세 진입)과 분리한다.
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  categorySelect.onChange(r, e.target.value)
                }}
              >
                {categorySelect.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </InlineSelect>
            )
          }
          return v ? <Badge tone="neutral">{v}</Badge> : '-'
        }
        if (c.kind === 'tag') return v ? <Badge tone="neutral">{v}</Badge> : '-'
        if (c.mask === 'email') return show.email ? (v ?? '-') : maskEmail(v ?? null)
        if (c.mask === 'phone') return show.phone ? (v ?? '-') : maskPhone(v ?? null)
        return v ?? '-'
      },
    }))
    // 담당자(관리 주체) 컬럼: NETWORKS 8종은 모두 공동관리(쓰기 권한자 누구나 수정)다.
    // 목록은 개념만 배지로 노출하고, 실제 기여자는 상세 페이지에서 확인한다.
    // 작성자(등록자)는 우측 표준 컬럼(created_by)에 별도 표시된다.
    base.push({
      key: '_manager',
      header: '담당자',
      className: 'w-24',
      render: () => <span className="text-gray-600">공동관리</span>,
    })
    // 수정 가능(NETWORKS)일 때만 액션 컬럼을 노출한다. 보기 버튼은 제거됨.
    if (onEdit) {
      base.push({
        key: '_action',
        header: '',
        align: 'right',
        render: (r) => (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onEdit(r)}>
              수정
            </Button>
          </div>
        ),
      })
    }
    return base
  }, [columns, onEdit, show.email, show.phone, categorySelect])

  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={cols}
      rows={rows}
      rowKey={(r) => r.id}
      layout="fixed"
      manageable={manageable}
      onRowClick={onRowClick}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      pagination={pagination}
      meta={{
        // 작성자 = 레코드 생성자(created_by → users). FK 임베드한 creator.name을 노출한다.
        author: (r) =>
          (r as { creator?: { name?: string | null } | null }).creator?.name || '-',
        // 복사 버튼: 이름/소속/직책·직급/이메일/연락처를 텍스트로 복사.
        copyText: buildCopyText,
        onDeactivate,
        deactivateWithReason,
      }}
      emptyText={`등록된 ${label} 정보가 없습니다.`}
    />
  )
}
