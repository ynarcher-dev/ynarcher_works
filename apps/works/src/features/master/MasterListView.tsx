import { Button, DataTable, Select, Spinner, type Column, type DataTableProps } from '@ynarcher/ui'
import { useMemo } from 'react'
import { maskBy } from '@/lib/mask'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import type { MasterColumn, MasterRow } from '@/features/master/types'

/** 컬럼 name의 점 경로(예: 'profile.position')로 중첩 값을 읽는다. */
function resolveField(row: MasterRow, path: string): unknown {
  if (!path.includes('.')) return (row as Record<string, unknown>)[path]
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, row)
}

interface MasterListViewProps {
  label: string
  /**
   * 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리'). 이 목록이 어느 메뉴인지에 따라
   * 이름·이메일·연락처를 가릴지가 갈린다. 카탈로그: features/admin/sensitiveContents.ts
   */
  contentKey: string
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
  /**
   * 비활성화(소프트 삭제) 핸들러. 목록의 '관리' 컬럼은 이 핸들러가 있을 때만 렌더한다 —
   * 상세페이지가 있는 엔티티는 비활성화를 상세에서 수행하므로 목록에 관리 열을 두지 않는다.
   */
  onDeactivate?: (row: MasterRow) => void
  /** true면 비활성화 버튼이 내장 confirm 없이 핸들러를 호출한다(사유 입력 모달 등 사용 시). */
  deactivateWithReason?: boolean
  /**
   * 인라인 구분 드롭다운(kind: 'category' 컬럼 전용). 미분류 임시 저장소에서 목록에 머문 채
   * 구분을 선택해 대상 네트워크로 이관할 때 주입한다. 미주입 시 해당 컬럼은 텍스트로 폴백한다.
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
  contentKey,
  columns,
  rows,
  isLoading,
  onEdit,
  onRowClick,
  onDeactivate,
  deactivateWithReason,
  categorySelect,
  selectedKeys,
  onSelectionChange,
  pagination,
}: MasterListViewProps) {
  const masked = useMaskPolicy(contentKey)
  const cols = useMemo<Column<MasterRow>[]>(() => {
    const base: Column<MasterRow>[] = columns.map((c) => ({
      key: c.name,
      header: c.label,
      type: c.type,
      align: c.align,
      className: c.className,
      render: (r) => {
        if (c.kind === 'placeholder') return '-'
        const raw = resolveField(r, c.name)
        if (c.kind === 'match') {
          // 목록은 읽기 전용 표기. 가능 여부 설정은 상세 페이지 드롭다운에서 수행한다.
          // 배지가 아니라 텍스트다(2026-08-20) — 기본값이 '가능'이라 열 전체가 같은 배지로
          // 채워지고, 그러면 색이 신호가 아니라 배경이 된다. 눈에 띄어야 하는 쪽은 드문
          // '불가능'이므로 그쪽만 위험색 글자로 두고 '가능'은 본문 톤으로 둔다.
          const ok = raw == null || raw === '' ? true : raw === true || raw === 'true' || raw === 'available'
          return ok ? '가능' : <span className="text-danger-700">불가능</span>
        }
        // 집계값(활동·만족도)은 목록 RPC가 실어 준다. 집계 대상이 한 건도 없으면 '-'로 비워 둔다 —
        // 만족도를 0.0으로 채우면 '최하 평가'와, 임의의 기본값(999건·5.0)은 실데이터와 구분되지 않는다.
        if (c.kind === 'count') {
          if (raw == null || raw === '') return '-'
          return <span className="tabular-nums">{Number(raw).toLocaleString()}건</span>
        }
        if (c.kind === 'rating') {
          if (raw == null || raw === '') return '-'
          const score = Number(raw)
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
          // 배지가 아니라 한 줄 텍스트로 잇는다(2026-08-20). 배지는 그 자체가 강세라 값이
          // 여러 개인 열에서는 색 덩어리가 줄마다 다른 길이로 서고, 개수에 따라 셀 안에서
          // 정렬이 흔들렸다. 색은 상태에만 쓰고 분류는 텍스트로 둔다는 규칙과도 같은 방향이다.
          // 폭을 넘치면 말줄임으로 자르고 전체 값은 title로 남긴다.
          const text = arr.join(', ')
          return (
            <span className="block truncate" title={text}>
              {text}
            </span>
          )
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
              // 링크드인 공식 브랜드색. 외부 서비스 식별색은 팔레트 밖 예외다 — 회색으로 누르면
              // "링크드인으로 나간다"는 정보 자체가 사라진다. 이 아이콘 외의 자리에 쓰지 않는다.
              // eslint-disable-next-line no-restricted-syntax
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
          // 인라인 구분 드롭다운(미분류 임시 저장소). 핸들러 미주입 시 텍스트로 폴백한다.
          if (categorySelect) {
            const known = categorySelect.options.some((o) => o.value === v)
            return (
              <Select
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
              </Select>
            )
          }
          return v || '-'
        }
        // 분류 값(권역 등)도 배지가 아니라 텍스트다 — 색은 상태에만 쓴다(5_component_spec_rules §3.4).
        if (c.kind === 'tag') return v || '-'
        // 마스킹 여부는 콘텐츠(메뉴)별 정책이 정한다 — 정책이 '공개'면 원본을 그대로 보여준다.
        if (c.mask) return masked[c.mask] ? maskBy(c.mask, v ?? null) : (v ?? '-')
        return v ?? '-'
      },
    }))
    // 담당자(관리 주체) 컬럼: NETWORKS 8종은 모두 공동관리(쓰기 권한자 누구나 수정)다.
    // 목록은 개념만 배지로 노출하고, 실제 기여자와 최초 생성자는 상세 페이지에서 확인한다.
    base.push({
      key: '_manager',
      header: '담당자',
      type: 'person',
      // 색은 셀의 위계 톤을 그대로 따른다(여기서 다시 지정하면 열마다 색이 어긋난다).
      render: () => '공동관리',
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
  }, [columns, onEdit, masked, categorySelect])

  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={cols}
      rows={rows}
      rowKey={(r) => r.id}
      // 폭·정렬은 열마다의 type이 정하고, 레이아웃은 기본(auto)이라 계산 폭보다 긴 값
      // (이메일·소속 등)은 말줄임 대신 열이 늘어나 다 보인다.
      // selectable은 자리 기본값(페이지에 바로 놓인 표 = 켬)을 그대로 따른다.
      // 관리 컬럼은 비활성화 핸들러가 주입된 목록(상세페이지가 없는 미분류)에만 남긴다.
      showManageColumn={Boolean(onDeactivate)}
      onRowClick={onRowClick}
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      pagination={pagination}
      // 생성자(created_by)는 권한을 주지 않는 축이라 목록에서 내린다 — NETWORKS는 담당자 원장이 없어
      // 영구 공동관리이며, 그 사실은 위 '담당자' 컬럼이 답한다. 최초 생성자는 상세 페이지에만 남는다.
      showAuthor={false}
      meta={{
        onDeactivate,
        deactivateWithReason,
      }}
      emptyText={`등록된 ${label} 정보가 없습니다.`}
    />
  )
}
