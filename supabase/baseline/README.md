# Database baseline artifacts

이 디렉터리는 cutoff까지의 마이그레이션을 재생해 만든 스키마 스냅샷 한 쌍을 보관합니다.

* `current_schema.sql`: cutoff까지의 이력으로 재구축한 `public`, `app` 스키마
* `manifest.json`: 정규화 규칙, cutoff, 마이그레이션 수, 이력 SHA-256, 스키마 SHA-256, 생성 환경

## 값은 manifest가 답합니다

**cutoff·마이그레이션 수·해시·생성 환경의 정본은 `manifest.json`입니다.** 이 README에 베껴 두지 않습니다 — 갱신할 때마다 두 곳이 어긋나기 때문입니다. 값을 확인하려면 `manifest.json`을 열거나 `pnpm db:baseline:check`를 돌리십시오. 최근 검증 실행의 수치와 날짜는 [CURRENT_STATUS.md](../../docs/CURRENT_STATUS.md)가 가집니다.

확인된 사실은 하나입니다 — `pnpm db:baseline:verify`가 **새 스택에서 cutoff까지 다시 재생한 덤프의 정규형이 작업 트리의 이 스냅샷과 바이트까지 같음**을 확인했습니다.

> [!IMPORTANT]
> 그 통과가 말하는 것은 **cutoff 시점 스키마의 재현성 하나**입니다. 신규 환경 부트스트랩이나 복구가 된다는 증명이 아니고, `public`·`app` 밖(`auth`·`storage` 등)은 담겨 있지 않으며, RLS·권한이 의도대로 막는다는 뜻도 아닙니다(그것은 `pnpm test:db`의 pgTAP이 가집니다).

## 갱신

산출물은 직접 편집하지 않습니다. 격리된 로컬 스택에서만 생성·검증합니다.

```powershell
pnpm db:baseline:refresh   # 격리 스택에서 재생하고 산출물 한 쌍을 기록
pnpm db:baseline:check     # 빠른 점검(Docker 불필요)
pnpm db:baseline:verify    # 새 스택에서 cutoff까지 재생해 바이트로 대조
```

두 파일은 한 쌍이라 한쪽만 갱신하면 점검이 해시 불일치로 거부합니다. 상세 절차·한계·복구는 [`12_database_baseline_operations.md`](../../docs/docs_dev/12_database_baseline_operations.md)가 소유합니다.
