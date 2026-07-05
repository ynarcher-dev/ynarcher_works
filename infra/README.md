# infra — 배포 인프라 구성 자산

본 폴더는 와이앤아처 통합 Works 플랫폼의 정적 호스팅(S3/CloudFront) 및 운영 런북 자산을 관리합니다. 상세 절차는 [배포·CI/CD 가이드](../docs/docs_dev/10_deployment_cicd_guide.md)를 참조하십시오.

| 경로 | 역할 |
| :--- | :--- |
| `cloudfront/error-responses.json` | SPA 딥링크 폴백(403/404 → `index.html` 200) CloudFront 커스텀 오류 응답 |
| `s3-bucket-policy.json` | CloudFront OAC 전용 S3 읽기 버킷 정책(퍼블릭 차단 유지) |
| `runbooks/restore-drill.md` | 백업/복구 절차 및 분기 복구 리허설 런북(RPO 24h/RTO 4h) |

> [!NOTE]
> WORKS(내부)와 GUEST(서브도메인)는 **각각 별도 버킷 + 별도 CloudFront 배포**로 분리합니다. 두 배포 모두 위 SPA 폴백 오류 응답을 동일하게 적용합니다.
