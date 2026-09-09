import { Badge, Button, Card, PickList, PickRow, cardText, cn } from '@ynarcher/ui'
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp } from 'lucide-react'
import { SOURCE_KIND_LABELS } from '@docparse/sourceKind.ts'
import { formatBytes } from '@/features/networks/materialHooks'
import type { AiSource } from '@/features/ai/aiFillClient'
import { sourceKindOf } from '@/features/ai/aiReadSet'
import type { AiExtractController } from '@/features/ai/useAiExtracts'

/**
 * 'AI 작성하기'의 자료 두 칸 — **위는 읽을 자료, 아래는 읽지 않을 자료**다.
 *
 * 게스트 계정 창의 두 목록과 같은 부품(`PickList`·`PickRow`)이고 방향만 상하다(2026-09-09
 * 사용자 지정). 이 둘은 창의 **왼쪽 기둥**을 위아래로 나눠 쓴다 — 저쪽(계정 창)이 두 목록을
 * 좌우로 세운 것과 갈리는 이유는 담기는 것이 **이름이 긴 파일**이기 때문이다. 좌우로 다시
 * 가르면 한 줄에 남는 폭이 기둥의 절반이라 파일명이 잘리고, 위아래로 두면 두 칸 모두 기둥의
 * 폭을 그대로 쓴다.
 *
 * **개별 이동은 줄을 누르는 것 하나다.** 갈 자리가 하나뿐이라 고르기와 보내기가 같은 뜻이다.
 * 가운데 버튼이 맡는 것은 한 줄씩으로는 못 하는 일(전부 옮기기)뿐이다.
 *
 * **종류는 값이라 글자로, 분석 상태는 상태라 배지로** 선다(5_component_spec §3.4). 종류 꼬리표는
 * 기타가 아닐 때만 붙는다 — 전부에 붙이면 같은 말이 모든 줄에 서서 정작 무엇이 분류된 줄인지가
 * 그 반복에 묻힌다. 상태도 **할 일이 있을 때만**(여는 중·실패) 선다: 대개의 줄은 그냥 읽히므로
 * '준비됨'을 줄마다 적으면 그것이 곧 잡음이다.
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */

/** 이름에서 확장자를 뗀다 — 이름은 잘려도 되는 긴 값이고 형식은 끝까지 보여야 하는 짧은 값이다. */
function splitName(name: string): { base: string; ext: string | null } {
  const m = /^(.*)\.([A-Za-z0-9]{1,6})$/.exec(name)
  if (!m?.[1] || !m[2]) return { base: name, ext: null }
  return { base: m[1], ext: m[2].toUpperCase() }
}

function SourceRow({
  source,
  direction,
  status,
  onMove,
}: {
  source: AiSource
  /** 누르면 어디로 가는가 — 화살표가 그 방향을 가리킨다. */
  direction: 'down' | 'up'
  status?: { state: string; detail: string }
  onMove: () => void
}) {
  const { base, ext } = splitName(source.kind === 'link' ? '' : source.name)
  const kind = sourceKindOf(source)
  const origin = source.kind === 'attachment' ? source.origin : undefined
  const title = origin ? `${origin} · ${source.name}` : source.name
  const Arrow = direction === 'down' ? ChevronDown : ChevronUp
  return (
    <PickRow onClick={onMove} title={title}>
      <span className="min-w-0 flex-1 truncate text-body text-gray-900">
        {source.kind === 'link' ? source.name : base}
      </span>
      {/* 참조 자료에만 위치가 붙는다 — 어느 줄이 남의 것인지를 그 한 줄이 답한다. */}
      {origin && <span className={cn('shrink-0', cardText.meta)}>{origin}</span>}
      {kind !== 'other' && (
        <span className={cn('shrink-0 text-gray-600', cardText.meta)}>{SOURCE_KIND_LABELS[kind]}</span>
      )}
      <span className={cn('w-12 shrink-0 text-center', cardText.meta)}>
        {source.kind === 'link' ? '링크' : (ext ?? '')}
      </span>
      <span className={cn('w-16 shrink-0 text-right tabular-nums', cardText.meta)}>
        {source.bytes != null ? formatBytes(source.bytes) : ''}
      </span>
      {status?.state === 'running' && (
        <Badge tone="info" density="table">
          여는 중
        </Badge>
      )}
      {status?.state === 'failed' && (
        <Badge tone="danger" density="table" title={status.detail || undefined}>
          열지 못함
        </Badge>
      )}
      <Arrow size={14} className="shrink-0 text-gray-400" />
    </PickRow>
  )
}

export function AiSourcePanes({
  read,
  skip,
  extracts,
  disabled,
  onMove,
  onMoveAll,
}: {
  /** 읽을 자료(상). */
  read: AiSource[]
  /** 읽지 않을 자료(하). */
  skip: AiSource[]
  /** 읽을 자료의 분석 상태(오피스 파일은 서버가 미리 연다). */
  extracts: AiExtractController
  disabled: boolean
  onMove: (source: AiSource, to: 'read' | 'skip') => void
  onMoveAll: (to: 'read' | 'skip') => void
}) {
  return (
    // `min-w-0`이 없으면 이 덩어리가 격자 칸의 최소 폭을 자기 내용으로 밀어 올려, 옆 기둥이
    // 그만큼 좁아진다(칸의 기본 최소 폭이 내용이다). 줄어드는 일은 파일 이름의 말줄임이 받는다.
    <div className="min-w-0 space-y-2">
      <Card
        title="읽을 자료"
        count={read.length}
        help="이 칸의 자료만 외부 AI로 나가 초안의 근거가 됩니다. 파일명으로 종류를 알 수 있는 자료(IR·회사소개서·재무제표·손익계산서·감사보고서·인증서·등기 서류·주주명부·사업계획서)는 처음부터 여기 서고, 나머지는 아래에 섭니다. 줄을 누르면 아래로 내려갑니다."
      >
        <div className={cn('overflow-hidden rounded-radius-md border border-gray-200', disabled && 'opacity-60')}>
          <PickList
            isEmpty={read.length === 0}
            empty="읽을 자료가 없습니다. 아래 목록에서 줄을 눌러 올리세요."
            className="max-h-72"
          >
            {read.map((s) => (
              <SourceRow
                key={s.key}
                source={s}
                direction="down"
                status={extracts.statusOf(s)}
                onMove={() => !disabled && onMove(s, 'skip')}
              />
            ))}
          </PickList>
        </div>
      </Card>

      {/* 두 칸을 잇는 조작이라 어느 한쪽 끝에 붙이지 않고 가운데에 세운다. */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          density="table"
          onClick={() => onMoveAll('skip')}
          disabled={disabled || read.length === 0}
        >
          전부 내리기
          <ChevronsDown size={14} />
        </Button>
        <Button
          variant="outline"
          density="table"
          onClick={() => onMoveAll('read')}
          disabled={disabled || skip.length === 0}
        >
          <ChevronsUp size={14} />
          전부 올리기
        </Button>
      </div>

      <Card
        title="읽지 않을 자료"
        count={skip.length}
        help="이 칸의 자료는 AI로 나가지 않습니다. 읽어야 할 자료가 여기 있으면 줄을 눌러 위로 올리세요. 읽을 자료가 적을수록 초안이 정확해집니다."
      >
        <div className={cn('overflow-hidden rounded-radius-md border border-gray-200', disabled && 'opacity-60')}>
          <PickList isEmpty={skip.length === 0} empty="모든 자료를 읽습니다." className="max-h-56">
            {skip.map((s) => (
              <SourceRow key={s.key} source={s} direction="up" onMove={() => !disabled && onMove(s, 'read')} />
            ))}
          </PickList>
        </div>
      </Card>
    </div>
  )
}
