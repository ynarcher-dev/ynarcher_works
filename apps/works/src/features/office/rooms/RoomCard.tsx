import { Badge, Button, CardShell, InfoField, cardText, cn } from '@ynarcher/ui'
import { ImageIcon, Users } from 'lucide-react'
import {
  buildSlots,
  scheduleLabel,
  type ReservationSpan,
} from '@/features/office/rooms/availability'
import { roomPhotoUrl, roomSchedule, type MeetingRoom } from '@/features/office/rooms/meetingRoomsApi'

interface Props {
  room: MeetingRoom
  date: Date
  /** 그날 이 회의실의 유효 예약(시간대). */
  spans: ReservationSpan[]
  onReserve: () => void
}

/**
 * 가로형 회의실 카드(레퍼런스 재현): 좌측 사진 · 중앙 이름/위치/요일일정 · 우측 인원·예약하기,
 * 하단에 운영시간을 슬롯으로 쪼갠 가용성 바(예약된 슬롯은 채워 표시).
 * 컨테이너는 CardShell — 카드 밀도 맥락을 내려 내부 버튼·배지가 카드 규격으로 렌더된다.
 * 글자 위계는 cardText·InfoField가 소유하고 화면에서 규격 클래스를 직접 쓰지 않는다.
 */
export function RoomCard({ room, date, spans, onReserve }: Props) {
  const url = roomPhotoUrl(room.photoPath)
  const schedule = roomSchedule(room)
  const slots = buildSlots(schedule, spans, date)

  return (
    <CardShell className="flex items-stretch gap-4">
      {/* 사진 */}
      <div className="flex h-28 w-44 shrink-0 items-center justify-center overflow-hidden rounded-radius-md bg-gray-100 text-gray-400">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-8" aria-hidden />
        )}
      </div>

      {/* 정보 + 가용성 바 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className={cardText.subhead}>{room.name}</h3>
            {room.location && <InfoField label="위치" value={room.location} />}
            <p className={cardText.label}>{scheduleLabel(schedule, date)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {room.capacity != null && (
              <Badge tone="info">
                <Users className="mr-1 size-3" aria-hidden />
                인원 {room.capacity}
              </Badge>
            )}
            <Button onClick={onReserve}>예약하기</Button>
          </div>
        </div>

        {/* 가용성 슬롯 바 */}
        <div className="mt-auto pt-3">
          {slots.length === 0 ? (
            <p className={cardText.label}>이 날은 예약할 수 없습니다.</p>
          ) : (
            <div className="flex gap-0.5">
              {slots.map((s) => (
                <span
                  key={s.start}
                  title={`${s.start} - ${s.end}${s.reserved ? ' (예약됨)' : ''}`}
                  className={cn(
                    'h-2.5 flex-1 rounded-sm',
                    s.reserved ? 'bg-brand/70' : 'bg-gray-200',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </CardShell>
  )
}
