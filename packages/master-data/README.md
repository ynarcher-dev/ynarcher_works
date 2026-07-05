# @ynarcher/master-data

**마스터 데이터 연동 레이어(Connected UI Layer)** 입니다. 비즈니스 데이터(Supabase Client, API Fetching)가 엮인 Picker, Auto-Complete Selector 및 공유 타입/스키마를 배치합니다.

* **마스터 SSOT**: 스타트업/전문가/협력사 마스터는 `NETWORKS`, 임직원 마스터는 `MANAGEMENT`가 원장입니다.
* **의존성 방향**: 본 패키지는 `packages/ui`(순수 UI)에 의존할 수 있으나, 그 역방향은 금지합니다.

> [!NOTE]
> 본 디렉터리는 모노레포 골격의 자리표시자입니다. 구현은 `PROGRESS.md` Phase 6(NETWORKS) 이후에서 진행합니다.
