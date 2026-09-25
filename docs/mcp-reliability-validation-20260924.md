# MCP 신뢰성 수정 및 실행 검증 — 2026-09-24

대상은 `feat/mcp-app-bridge`의 `ae560b39a6c0b3cd77d6babd5e35fee6049690e7`이다.
첨부 분석의 12개 결함을 실제 서비스, HTTP, 네이티브 저장 경계에서 재검증하고 수정했다.
원래 작업 폴더의 master에는 MCP 구현이 없어서 기존
`CarrotMangaTranslator-MCP-Review` 워크트리에서 작업했다. 커밋·push·릴리스는 하지 않았다.
이 기록은 해당 결함과 인접 회귀에 대한 검증이며 저장소 전체의 무결함 인증이 아니다.

## 수정과 근거

| 항목                          | 수정                                                                                                                                                | 회귀 검증                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1. TXT 왕복 오배치            | 내보내기 필드와 필터링한 블록 집합을 가져오기 파서에 전달한다. 명시적 both 형식을 번역 전용으로 재해석하지 않는다. 수정 없는 내보내기는 변경 0개다. | `mcpTextImportPolicy.test.ts`: 빈 번역 뒤 여러 줄 번역, both/translated 왕복 및 기존 가져오기 검사                  |
| 2. sourceSize 재시도          | 원래 작업 종류로 executor를 정확히 조회하고 없는 실행 함수는 거절한다. PNG 기본 분기를 없앴다.                                                      | `mcpJobRecovery.test.ts`: 측정 2회, PNG 0회                                                                         |
| 3. OAuth 용량 고갈            | 미승인 client 64개는 오래된 항목부터 회수하고 활성 승인 client는 보호한다. 철회·만료 grant와 종속 토큰을 회수한다.                                  | `mcpReliability.test.ts`: 130회 등록, 기존 토큰과 재시작, 270회 승인·철회                                           |
| 4. 임시 경로 별칭             | 신뢰하는 OS 임시 root만 실제 경로로 해석한다. 그 아래 symlink·파일 identity 검사는 유지한다.                                                        | `mcpLibraryImportStaging.test.ts`: root junction 허용, 내부 junction 거절, 원본 bytes 보존                          |
| 5. 생성 후 용량 거절          | 모델 실행 전에 자리를 예약한다. 같은 owner/requestId의 동시 요청은 한 준비 작업을 공유한다. 다른 입력으로 ID를 재사용하면 거절한다.                 | `mcpReliability.test.ts`, 기존 preview 생명주기 테스트: 32번째 대기 중 추가 생성 차단, 중복 생성 없음               |
| 6. 부분 읽기 순서 Undo        | 선택 편집의 신뢰된 내부 저장만 정확한 blockOrder를 보존한다. 일반 저장의 정규화는 유지한다. 원격 입력에 우회 플래그를 추가하지 않았다.              | `mcpSelectionReferences.test.ts`: 실제 저장에서 부분 순서와 speaker 상태 apply/undo/redo                            |
| 7. 완료 512개 후 정체         | 최근 항목 512개 밖의 완료 작업은 영속 가능한 영수증으로 전환한다. fingerprint, 대상, 결과 참조를 남긴다.                                            | `mcpReliability.test.ts`: 실제 서비스로 514개 순차 완료, 다른 owner, 재시작, 과거 요청 재전송·충돌 및 workflow 조회 |
| 8. 권한과 capabilities 불일치 | 현재 요청에 노출된 도구 목록으로 기능 안내를 만든다. preview 도구 자체에도 이미지 scope 계약을 명시한다.                                            | `mcpReliabilityHttp.test.ts`: 실제 OAuth read-only/full 연결 비교                                                   |
| 9. 입력 오류 정보 소실        | 도구 인자 오류를 `isError` 결과로 반환하고 필드·타입·범위 정보를 제한된 크기로 제공한다. 원본 값이나 내부 예외는 반환하지 않는다.                   | 실제 HTTP의 인자 거절 검사, 8193자 번역 거절 및 저장 호출 수 확인                                                   |
| 10. busy를 재시도 불가로 안내 | 네이티브 `APP_ACTIVITY_BUSY`를 안전한 `editor_busy`, `retryable: true` 응답으로 변환한다.                                                           | `mcpReliability.test.ts`: 경로를 담은 원래 예외가 응답에 유출되지 않음                                              |
| 11. 정상 일괄 번역 413        | 인증된 MCP 요청 한도를 8 MiB로 맞췄다. OAuth 요청은 64 KiB를 유지한다.                                                                              | `mcpReliabilityHttp.test.ts`: 100블록 × 8192자 한글을 HTTP로 전달하여 모두 저장                                     |
| 12. 구버전 batch 불일치       | batch를 요구하는 `2025-03-26` 지원 주장을 제거하고 구현한 버전으로 협상한다.                                                                        | `mcpReadServer.test.ts`, `mcpModernProtocol.test.ts`                                                                |

추가로 큰 요청을 거절하는 도중 연결이 먼저 끊겨 `ECONNRESET`이 발생하는 경우를 확인했다.
초과 bytes는 보관하지 않고 기존 timeout 안에서 소비한 뒤 413을 반환하도록 수정했다.
`mcpHostileTransport.test.ts`가 초과 요청 거절과 이후 정상 요청을 함께 확인한다.

깨끗한 상태라도 열린 화는 닫아야 하는 작업에서 기존 `editor_busy` 안내는 해결책이 아니었다.
`editor_open`을 구분하고 로컬 편집을 보존한 뒤 화를 닫도록 안내한다.
원격으로 편집기를 강제로 닫거나 보호 조건을 제거하지 않는다.

## 검증 결과

최종 `npm run check`는 종료 코드 0으로 **26개 gate 전부 통과**했다(379.49초).
전체 테스트는 **9,608개 통과, 0개 실패, 16개 skip**이다. 타입 검사 3종,
lint·format·의존성·구조·기존 커버리지 기준, production build, page artwork parity,
이미지 프로토콜 smoke, renderer/preload bundle 경계가 모두 통과했다.
Skip에는 로컬에 없는 선택적 모델 자산, 플랫폼·권한 조건이 포함되며 통과로 세지 않았다.
로그: `.tmp/mcp-full-check-complete.log`, `.tmp/check-results/vitest.json`.

- 수정 전 소스의 별도 checkout에 회귀 테스트를 적용했다. 7개 파일에서 27개 실패,
  56개 통과, 1개 skip을 확인했다. 이는 기존 테스트 전체의 baseline이 아니라
  새 기대 동작을 원본에 실행한 재현 묶음이다.
- HTTP body 문제는 capability 검사와 분리해 원본에서 `413 != 200` 실패를 추가 확인했다.
- 수정 중 마지막 집중 검사에서는 10개 파일, 40개 테스트가 통과했다.
  이후 종료·소유권·누적 용량 경계를 더 보강했으며 최종 전체 검사에 포함했다.
- 재현 로그: `.tmp/mcp-reproduced-original.log`, `.tmp/mcp-reproduced-body-limit.log`.
- 수정 후 집중 로그: `.tmp/mcp-canary-final.log`.
- `npm run build` 통과. 빌드된 Electron에
  `node node_modules/electron/cli.js scripts/mcp-electron-smoke.cjs`를 실행하여
  종료 코드 0, 72개 PASS 검사와 `PASS MCP native smoke finished`를 확인했다.
  전용 포트 38759와 임시 data root를 사용하고 외부 터널은 끈 상태다.
  네이티브 암호화·재시작 복원, 원문 크기 측정, 이미지 픽셀 복구, 가져오기,
  삭제·이동 Undo/Redo, 작업 파일 왕복, 복합 작업과 결과 ZIP 재구성을 포함한다.
  모델 추론만 결정적인 테스트 대역이다. 실행 후 임시 data root도 정리됐다.
  로그: `.tmp/mcp-build-final.log`, `.tmp/mcp-native-final.log`.
- Bug Hunter 근거 JSON은 `.bug-hunter/`에 보존했다. 단일 에이전트가 실행 근거를 정리한
  기록이며 독립 에이전트 검증이나 수정 전 불변 승인 기록으로 표현하지 않는다.

## 남아 있는 한도와 검증 범위

- 영수증은 최근 512개 + 압축된 기록 4096개로 제한하며 7일간 중복 실행 방지를 유지한다.
  기존 암호화 저장의 byte 한도도 유지한다. 무제한 이력 저장이나 무제한 처리 보장은 아니다.
  과거 세션 전용 결과는 재시작 때와 같은 영속 메타데이터로 축약된다.
- 생성 결과의 실제 크기는 실행 후에만 알 수 있으므로 계획별/전체 byte 검사는 후단에도 남는다.
- macOS `/var` 형태의 root 별칭은 Windows junction으로 재현했다. 실제 macOS 앱에서
  PDF/RAR를 실행하거나 macOS CI를 재실행한 것은 아니다.
- Windows가 파일 symlink 생성을 `EPERM`으로 금지하면 관련 4개 테스트는 이유를 명시하고
  skip한다. 다른 오류는 계속 실패한다. directory junction 검사는 실제 실행한다.
- 사용자 보관함, 원본, 출력물은 사용하지 않았다. 생성·번역 모델 전송은 테스트 대역을
  사용했다. 실제 ChatGPT 자연어 작업의 완주율이나 유료 모델 결과 품질은 측정하지 않았다.
- renderer UI는 변경하지 않았다. 따라서 새 UI 캡처는 이 수정의 검증 항목에 포함하지 않는다.
- 재현용 `C:\tmp\mcp-reliability-baseline-20260924`는 후속 작업에서 정리했다.
  최초 묶음 명령은 `blocked by policy`로 거절됐으며 구체적인 차단 주체와 이유는 확인되지 않았다.
  이후 `node_modules` 정션만 먼저 분리하고 원본 의존성과 다른 링크가 없음을 확인한 뒤
  워크트리를 제거했다. 임시 경로 및 Git 등록 제거와 원본 보존을 확인했고 재현 로그는 유지했다.

## 구조와 호환성

기존 batch 타입 모듈에 실행 상태·항목 타입을 모아 순환 의존을 피했다. 준비 중 요청의
예약과 중복 합치기는 `mcpPageBatchPreparation.ts`가 담당한다. 공유 알고리즘을 복제하거나
barrel export를 만들지 않았다.

의존 예외는 실제 추가된 두 소비자만 기록했다. `mcpEditPolicy.ts`는 예약 관리자가 기존
typed error를 사용하므로 238 → 239, `mcpArguments.ts`는 도구 오류 응답이 기존 입력 오류를
직접 분류하므로 25 → 26이다. 전역 한도, 테스트 커버리지 기준과 lint 규칙은 낮추지 않았다.
새 준비 관리자 파일의 커버리지 항목만 실측값으로 추가했다. 보관 용량, 실패 후 재시도,
종료 전후의 준비 작업, 서로 다른 owner의 요청 ID 재사용 경계를 추가 검증했다.

도구 인자 오류 응답은 JSON-RPC 오류에서 모델이 읽을 수 있는 도구 오류로 바뀐다.
알 수 없는 도구와 잘못된 프로토콜 envelope는 기존 프로토콜 오류를 유지한다.
근거: [MCP 도구 오류 처리](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling),
[구버전 batching 계약](https://modelcontextprotocol.io/specification/2025-03-26/basic#batching).
