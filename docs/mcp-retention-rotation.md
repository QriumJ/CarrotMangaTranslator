# 채팅 저장과 복구 이력 수명

2026-10-25. 이전 MCP checkpoint 문서의 공유 256/4,096개·1 GiB 저장 차단 정책을 대체한다.

## 정책

일반 페이지 변경(`change`)의 payload는 최대 7일간 보관하며 1 GiB와 4,096개를 순환
목표로 사용한다. 오래된 생성 시각, ID 순서로 검증된 비활성 복구본만 퇴역시킨다.
현재 저장에서 생성/수정 중인 기록과 복구 lease, 활성 작업과 부모 기록이 참조하는
변경은 보호한다. 보호 데이터만으로 목표를 넘으면 저장을 허용하고 다음 저장에서 다시
순환을 시도한다. 단일 기록·이미지·작업의 기존 안전 크기 제한은 유지한다.
만료 정리와 용량 순환은 각각 한 번에 최대 128개씩 처리한다. 오래 누적된 기록을
한 저장에서 전부 퇴역시키다 native journal 항목 한도에 걸리지 않도록 정리 작업량도 제한한다.

출력물, 삭제 원본 복구, 가져오기, 이동, 문맥 변경, 실행/워크플로 기록은 이 예산에
포함하지 않는다. 기존 종류별 만료와 명시적 폐기 규칙은 그대로다. 이 정책은 보관함,
원본, 현재 이미지, 사용자 출력 파일을 정리할 권한을 부여하지 않는다.

세션의 활성 predicate는 동일 데이터 프로필에서 공유하고 모든 네이티브 작업 종료 후
등록을 해제한다. undo/redo는 기존 artifact lease로 record 경로를 보호한다. 재시작 후
workflow/composite의 직접 참조와 미완료 attempt ID도 보호한다. 읽을 수 없는 부모는
해당 owner의 변경을 보수적으로 보호한다. 알 수 없는 파일이나 읽을 수 없는 변경 기록은
용량 정리 대상이 아니다. OAuth 조회/복구/명시적 폐기 권한은 owner 경계를 유지한다.

## 저장과 호환

새 페이지·새 복구본·이전 payload 퇴역·목록 변경은 기존 library transaction 하나에
참여한다. 커밋 전 실패는 모두 롤백하고 커밋 후 정리 실패는 기존 startup recovery가
마무리한다. 실제 저장장치 부족은 `storage_full`, 순환된 복구 요청은 `history_reclaimed`로
구분한다. 순환된 기록 조회는 `state=reclaimed`, `available=false`를 반환하며 현재 저장
실패로 표현하지 않는다. 모델에게 사용자 기록 삭제 승인을 받아오도록 지시하지 않는다.

순환 영수증은 원래 ID/owner/requestId/생성·만료 시각을 유지하고 payload 크기는 0이다.
원래 만료 때 영수증도 제거한다. 이것은 복구 가능성을 약속하거나 작업 재실행을 허용하지
않는다. 목록은 기존 snapshot pagination을 유지하고 `state`와 `historyPolicy`를 추가한다.

기존 v1 암호화 목록은 읽기 호환한다. 첫 쓰기부터 루트 v2 manifest가 UUID generation의
암호화된 목록 페이지를 가리킨다. 페이지는 256항목 이하, 파일은 8 MiB 이하이며 generation,
페이지 번호, 중복 ID를 검증한다. 페이지 수가 같으면 달라진 페이지만 기존 atomic
replacement로 갱신해 워크플로 체크포인트마다 목록 디렉터리를 다시 만들지 않는다.
페이지 수가 바뀌면 새 generation 게시와 기존 generation 퇴역도 같은 트랜잭션에 속한다.
기록 payload/이미지 형식과 ID는 변경하지 않는다.

v2 목록을 지원하지 않는 이전 앱으로의 직접 downgrade는 지원하지 않는다. 되돌릴 경우
앱을 종료하고 변경 전의 전체 데이터 프로필 백업을 사용해야 하며 일부 index 파일만
교체하거나 남은 디렉터리를 임의 삭제해서는 안 된다.

## 검증

기존 복구·트랜잭션 characterization 18건을 기준으로 1 GiB 이미지 저장, 4,096개 이력
순환과 재시작 undo/redo를 검증한다. 추가 통합 테스트는 4,200개 필수 기록의 v1 전환,
페이지 손상, 다른 연결의 보호와 만료, 부모 참조, 필수 payload/현재 이미지 보존,
강제 종료 전후 원자성과 디스크 부족 롤백을 검사한다. 실제 사용자 보관함은 사용하지 않는다.

새 목록/정책 모듈의 최초 Windows V8 커버리지 근거는
`.tmp/retention-coverage/coverage-summary.json`이며 SHA-256은
`fe9de3ed1db8c8d517b2c7d49fe3ea89222ede0c5c1b139c226fd09e976ca7a0`이다.
8개 테스트 파일의 83건이 통과한 측정값을 새 파일의 기준으로 등록했다.
목록 모듈의 lines/branches는 97.05%/96.29%, 정책은 92.4%/90.14%이며
두 모듈의 functions는 100%다. 기존 파일의 커버리지 기준은 낮추지 않았다.

최종 `npm run check`는 Windows에서 27개 단계 모두 통과했다(706.15초).
테스트는 1,452개 파일·11,416건 통과, 기존 skip은 1개 파일·9건이다.
커버리지 하한, 타입/lint/구조 검사, Electron/renderer 빌드, artwork parity,
image protocol smoke와 번들 검사를 포함한다. 실행 환경의 테스트 worker만 8개로
제한했으며 테스트 timeout과 기존 기준은 변경하지 않았다.
전체 로그는 `.tmp/retention-check-verified.log`, 테스트 결과는
`.tmp/check-results/vitest.json`에 남겼다.

기존 설명을 조사할 때 참고한 공식 자료:
[VS Code 이력 저장 구현](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/workingCopy/common/workingCopyHistoryService.ts),
[Blender 저장 복구](https://docs.blender.org/manual/en/4.4/troubleshooting/recover.html).
