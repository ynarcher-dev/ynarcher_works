import { Badge, Button, RefLinkList, useToast } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { historyText } from '@/features/networks/config'
import { useAffiliations, useRemoveAffiliation, type Affiliation } from '@/features/networks/affiliationHooks'

/** 기간 한 줄. 시작만 있으면 '2024-03 ~', 둘 다 없으면 빈 문자열. */
function period(a: Affiliation): string {
  const from = a.startedOn?.slice(0, 7) ?? ''
  const to = a.endedOn?.slice(0, 7) ?? ''
  if (!from && !to) return ''
  return to ? `${from || '?'} ~ ${to}` : `${from} ~`
}

/**
 * 소속 관계 패널 — **이 사람이 어느 조직에 어느 직함으로 있(었)는가**.
 *
 * 옆의 '이력' 카드와 축이 다르다. 저쪽은 *소속 칸이 어떻게 고쳐졌는가*의 감사 기록(글자
 * 세 개)이고 여기는 *지금 어디에 속했는가*의 사실(원장 행 + 직함 + 기간)이다. 그래서 여기서만
 * 답할 수 있는 것이 둘 있다 — **겸직**(현재가 여럿)과 **그 조직으로 가는 길**이다.
 *
 * 현재가 위에 서고 지난 것이 아래 선다. 지난 줄을 감추지 않는 이유가 이 표를 만든 까닭이다 —
 * "전 스타트업A 대표"가 남아야 하고, 그것이 대표가 바뀌었을 때 전임자에게 남는 사실이다.
 *
 * **내리는 버튼은 잘못 이은 줄에만 쓴다.** 자리를 떠난 것은 지우는 일이 아니라 끝나는 일이고,
 * 그 끝내기는 스타트업 폼이 대표자를 바꾸는 순간 트리거가 대신 찍는다.
 */
export function AffiliationPanel({ networkId }: { networkId: string }) {
  const toast = useToast()
  const { data, isLoading } = useAffiliations(networkId)
  const remove = useRemoveAffiliation()

  if (isLoading) return <p className="text-body text-gray-600">불러오는 중…</p>

  const rows = data ?? []
  if (rows.length === 0) {
    // 빈 상태는 접지 않는다 — 왜 비었는지와 어디서 채워지는지를 함께 말한다.
    return (
      <p className="text-body text-gray-600">
        연결된 소속이 없습니다. 스타트업 원장에서 이 사람을 대표자·핵심 팀원으로 이으면 여기 한 줄이 섭니다.
      </p>
    )
  }

  const drop = async (a: Affiliation) => {
    try {
      await remove.mutateAsync(a.id)
      toast.show('잘못 이어진 소속을 내렸습니다.', 'success')
    } catch {
      toast.show('내리지 못했습니다. 네트워크 원장 쓰기 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 first:pt-0">
          {/* 조직 이름은 갈 곳이 있으면 링크다 — 상호참조는 배지가 아니라 텍스트 링크다
              (CLAUDE.md 2026-09-03). 라우터는 앱이 주입한다. */}
          <RefLinkList
            as={Link}
            className={historyText.primary}
            items={[
              {
                key: a.id,
                label: a.orgLabel || '(이름을 읽지 못했습니다)',
                to: a.orgType === 'startup' && a.orgId ? `/startup/${a.orgId}` : null,
                title: a.orgType === 'startup' ? undefined : '원장에 연결되지 않은 소속입니다.',
              },
            ]}
          />
          {a.title && <span className={historyText.primary}>· {a.title}</span>}
          {!a.endedOn && <Badge tone="success">현재</Badge>}
          <span className={`tabular-nums ${historyText.meta}`}>{period(a)}</span>
          <span className="grow" />
          <Button
            variant="ghost"
            disabled={remove.isPending}
            title="잘못 이어진 줄을 내립니다. 자리를 떠난 것이면 스타트업 원장에서 사람을 바꾸십시오."
            onClick={() => void drop(a)}
          >
            내리기
          </Button>
        </li>
      ))}
    </ul>
  )
}
