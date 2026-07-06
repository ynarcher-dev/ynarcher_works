import { Badge, Button, DataTable, Spinner, type Column, type DataTableProps } from '@ynarcher/ui'
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
 * 조직 엔티티(기업·기관·대학·외주/거래)는 representative와 contact.* 를 함께 커버한다.
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
  /** 관리(비활성화) 컬럼 노출 여부. HUB(조회 센터)는 false, NETWORKS(원장)는 true. 기본 true. */
  manageable?: boolean
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
  manageable = true,
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
            <Badge tone={ok ? 'success' : 'neutral'} size="sm">
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
        const v = raw as string | null | undefined
        if (c.kind === 'tag') return v ? <Badge tone="neutral" size="sm">{v}</Badge> : '-'
        if (c.mask === 'email') return show.email ? (v ?? '-') : maskEmail(v ?? null)
        if (c.mask === 'phone') return show.phone ? (v ?? '-') : maskPhone(v ?? null)
        return v ?? '-'
      },
    }))
    // 수정 가능(NETWORKS)일 때만 액션 컬럼을 노출한다. 보기 버튼은 제거됨.
    if (onEdit) {
      base.push({
        key: '_action',
        header: '',
        align: 'right',
        render: (r) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
              수정
            </Button>
          </div>
        ),
      })
    }
    return base
  }, [columns, onEdit, show.email, show.phone])

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
      pagination={pagination}
      meta={{
        // 임시: created_by가 UUID로 노출되어 실제 작성자명 연동 전까지 '홍길동'으로 대체한다.
        author: () => '홍길동',
        // 복사 버튼: 이름/소속/직책·직급/이메일/연락처를 텍스트로 복사.
        copyText: buildCopyText,
        onDeactivate,
      }}
      emptyText={`등록된 ${label} 정보가 없습니다.`}
    />
  )
}
