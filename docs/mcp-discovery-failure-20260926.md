# ChatGPT 도구 검색 실패 — 2026-09-26

## 현재 결론

05:36:49 UTC 같은 연결에 **249개 / 450,954 bytes**를 보낸 뒤 사용자가
ChatGPT 도구 화면의 **Write 131 / Read 118**을 확인했다. 바로 앞의 전체 출력
스키마 포함 응답은 249개 / 3,226,545 bytes를 전송했지만 화면에는 진단용
`carrot_get_capabilities` 1개만 남았다. 같은 도구 목록에서 `outputSchema`만
생략하자 갱신이 성공했다. 249개라는 도구 수가 실패 원인은 아니다.

현재 출력 스키마 묶음의 ChatGPT 처리 문제로 범위를 좁혔지만, 특정 byte 제한인지,
스키마의 어떤 구조 때문인지는 ChatGPT 내부 오류 없이 단정하지 않는다.
정식 구현에서는 ChatGPT가 사용하는 2026 stateless discovery에서 선택 필드인
`outputSchema`를 생성·전송하지 않는다. 이름, 설명, 입력 스키마, 권한/annotation과
도구 수는 그대로다. `mcpToolResult`의 Zod 결과 검증 및 `structuredContent`는
그대로 유지하며, 기존 2025 클라이언트의 출력 스키마도 유지한다.

이 확인은 **연결 및 전체 도구 목록 등록 복구**다. Chapter 2.3 읽기·번역·편집의
실제 ChatGPT 실행 완료를 의미하지 않는다. 갱신된 플러그인을 새 대화에 추가해
실제 작업을 확인해야 한다. 현재 실행 앱은 성공한 임시 호환 프로필을 유지하며,
다음 일반 실행부터는 정식 코드가 같은 modern 응답을 제공한다.

정식 수정 검증:

- 새 회귀 테스트 4개가 수정 전 실패하고 수정 후 통과했다. production factory의
  modern 목록을 legacy 목록에서 `outputSchema`만 제외한 결과와 대조해 이름,
  입력 계약, OAuth scope와 annotation, 전체 도구 보존을 검사한다.
- modern HTTP 호출의 정상 `structuredContent`, 잘못된 필드 타입 및 사적 필드
  유출 차단을 확인했다. 관련 Vitest 8파일 / 94테스트 통과.
- 진단 preload 없이 컴파일된 production 서버를 별도 포트에서 실행한
  `full-compatibility-smoke.cjs`가 Read 118 / Write 131, 미인증 401,
  modern 호출의 검증된 결과 및 독립 SDK의 legacy 출력 스키마/호출을 확인했다.
  보관함과 모델은 호출하지 않았다. fixture modern 응답은 450,818 bytes다.
- 같은 응답이 공식 2026 `ListToolsResultResponse`와 입력 스키마 검사,
  output-sync union 인자 계약 검사를 통과했다.
- 변경 파일 ESLint/Prettier, architecture budget, error-handling 정책,
  `compile:electron`, `git diff --check` 통과. 전체 저장소 check를 재실행한 것은 아니다.

## 관측과 확인된 결함

사용자가 제공한 04:17–04:18 UTC 로그에서 OAuth token 요청과
`server/discover`가 HTTP 200으로 완료됐다. ChatGPT는 MCP `2026-07-28`을
사용했고, `tools/list`도 249개 도구 / 3,226,496 bytes를 HTTP 200으로
전송 완료했다. 해당 요청의 서버 500, 연결 중단, 타임아웃은 기록되지 않았다.
이 결과만으로 ChatGPT 내부 응답 처리 성공을 판단할 수는 없다.

[공식 ListToolsResult 규격](https://modelcontextprotocol.io/specification/2026-07-28/schema#listtoolsresult)의
필수 `ttlMs`, `cacheScope`가 도구 목록 응답에서 누락돼 있었다.
`server/discover`에는 이미 두 필드가 있었지만, 목록 응답의 modern 변환은
`resultType`과 서버 식별자만 추가했다. 기존 테스트도 이 누락을 검사하지 않았다.

## 수정과 검증

- modern `tools/list` 성공 응답에 `ttlMs: 0`, `cacheScope: "private"`를 추가했다.
  도구 목록은 현재 승인 범위에 종속되므로 다른 인증 컨텍스트에서 공유하지 않는다.
  HTTP `Cache-Control: no-store`도 유지한다.
- 기존 2025 프로토콜 응답, 오류 응답, 도구 목록과 실행 권한은 유지한다.
- 새 회귀 테스트가 수정 전 필드 누락으로 실패하는 것을 확인했다.
- 컴파일된 production HTTP 서버를 임시 loopback 포트에서 실행해 실제
  `server/discover` / `tools/list` 응답을 수집했다. 도구 factory만 사용하고
  보관함 port와 모델, 도구 실행은 호출하지 않았다.
- 공식 JSON Schema를 Python `jsonschema.Draft202012Validator`로 검사했다.
  수정 전 목록 응답은 두 required-property 오류로 실패했고, 수정 후 두 응답은
  모두 통과했다. 등록된 249개 output schema 자체도 JSON Schema 유효성 검사를 통과했다.
- 관련 Vitest 6파일 80테스트, 수정 파일 ESLint, architecture budget,
  `compile:electron`(TypeScript 컴파일 포함), `git diff --check` 통과.

공식 스키마 원본:
<https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2026-07-28/schema.json>

이번 검사에 사용한 로컬 스키마 SHA-256:
`4b587dd323e3422c2f2175141eb313cc70e36c6d3865b54c39ca093ac0f4340b`

재현 스크립트, 공식 스키마 사본, 수정 전후 HTTP 응답은
`.tmp/mcp-discovery-audit-20260926/`에 보존한다.

## 남은 확인

사용자 앱 재시작 후 ChatGPT에서 연결 재시도가 필요하다. 프로토콜 결함은 재현 및
수정됐지만 ChatGPT 내부 validator의 실제 오류는 공개되지 않았으므로, 이것이
유일한 원인이고 연결이 복구됐다고 아직 확정하지 않는다. 3.23 MB 크기나 249개
도구 수 자체가 제한을 초과했다는 증거는 없으며 추측으로 도구를 제거하지 않았다.
컴퓨터 유즈, 사용자 앱 강제 종료, 보관함 변경, 로컬 모델 실행은 하지 않았다.

## 두 번째 재시도 후 전체 목록 검증

04:27:38 UTC에 새 앱이 시작됐고, 04:34 UTC 요청은 이전보다 33 bytes 늘어난
3,226,529 bytes를 전송했다. 따라서 캐시 필드 수정은 반영됐지만, 사용자의
ChatGPT 연결 오류는 계속됐다. 앞의 대표 도구 응답 검증만으로는 충분하지 않았다.

실제 production factory에서 249개 도구를 모두 구성하고 전체 응답을 검증한 결과,
75번째 `carrot_get_output_sync`의 입력 스키마 최상위 `type: "object"`가 없었다.
Zod union은 두 object 분기를 `anyOf`로 변환하면서 최상위 type은 만들지 않는다.
개별 JSON Schema로는 유효하지만 MCP Tool descriptor 계약에는 맞지 않는다.

- 공식 전체 `ListToolsResultResponse` 검증이 수정 전
  `result.tools[74].inputSchema: 'type' is a required property`로 실패했다.
- 해당 도구를 만드는 기존 readTool에서 최상위 object type을 명시했다.
  기존 union, 인자 검증, 조회 방식, 권한은 유지한다.
- 수정 후 249개 전체 응답과 498개 입력/출력 JSON Schema 검사 통과.
- `id` 또는 `requestId` 하나만 받는 계약도 확인했다. 둘 다 입력, 빈 object,
  추가 필드, object가 아닌 입력은 계속 거절한다.
- `mcpDiscoveryContract.test.ts`가 production 등록 도구 전체와 출력 계약 registry를
  대조하고 모든 입력의 root type을 검사한다. 수정 전 실패, 수정 후 통과했다.
- 관련 7파일 87테스트, 변경 파일 ESLint, 서버 컴파일 통과.

전체 응답 증거는 같은 `.tmp/mcp-discovery-audit-20260926/` 아래
`full-before-tools.json`, `full-after-tools.json`, `validate-full.py`에 보존했다.
테스트에서 수집용 임시 파일 쓰기 코드는 제거했다.

독립 MCP TypeScript SDK `@modelcontextprotocol/sdk@1.30.1`를 프로젝트 의존성과
분리해 같은 임시 증거 폴더에 설치했다. SDK `Client`와
`StreamableHTTPClientTransport`로 컴파일된 production HTTP 서버에 연결하고,
동일한 249개 descriptor의 수정 전후 입력 스키마를 전달했다.
SDK가 수정 전에는 `tools[74].inputSchema.type`의 `expected "object"`로
목록 전체를 거절했고, 수정 후에는 `listTools()`로 249개를 정상 수신했다.
두 경우 모두 tool invoke 0회, 서버 예외 0개였다. 이 SDK의 협상 연결 검증과
별도의 공식 2026 스키마 검증을 구분하며, ChatGPT 내부 구현을 실행한 것은 아니다.
결과는 `sdk-validation.json`, 재현은 `sdk-audit.cjs`에 있다.

## 세 번째 재시도와 격리 진단

05:13:14 UTC 앱 재시작 후 05:14 UTC 요청에서도 실패가 계속됐다.
도구 목록은 3,226,545 bytes로, 두 필드 수정에 이어 input root type 수정까지
반영된 상태였다. 앞의 두 결함은 실제 결함이지만 ChatGPT 연결 실패의 전부는
아니었다. 일반 SDK 성공을 ChatGPT 복구 성공으로 해석하지 않는다.

추가 production 변경 대신 `.tmp/mcp-discovery-audit-20260926/`에 임시
`launch-probe.cjs`와 `probe-preload.cjs`를 준비했다. 기존 dev launcher를 그대로
사용하고 Electron main 프로세스에만 discovery 응답 변환을 넣는다. 인증 및
권한 검증이 끝난 성공 `tools/list`의 descriptor만 좁히며, 인증 처리·실행 함수·
보관함·설정·승인 기록은 변경하지 않는다. 조회 결과나 인증정보는 기록하지 않는다.

`probe-profile.json`을 바꾸면 재시작 없이 다음 목록 요청부터 적용된다.

- `minimal`: `carrot_get_capabilities` 한 개, 출력 스키마 생략.
- `without-output-schemas`: 권한상 보이는 전체 도구의 출력 스키마만 생략.
- `full`: 기존 전체 목록 그대로.
- `range`: 지정 offset/count 부분 목록. 필요 시 `omitOutputSchemas`와 조합.

`probe-test.cjs`에서 동일 SDK 연결을 유지한 채 네 모드 전환, 예상 도구 수,
미인증 HTTP 401, 도구 호출 0회를 확인했다. 별도 Electron main 프로세스에서도
preload 적용을 확인했으며 이 smoke는 창이나 모델을 만들지 않았다.
진단 mode와 개수/byte size만 `probe-trace.jsonl`에 기록한다.

사용자 앱을 정상 종료한 뒤 이 launcher로 한 번 실행해 ChatGPT의 실제 결과를
비교해야 한다. 아직 특정 크기 제한이나 출력 스키마 비호환을 확정하지 않았다.
진단 후 profile을 `full`로 복원하고 일반 launcher로 실행하면 hook이 사라진다.

## 진단 실행 중 새 연결 등록

사용자 정상 종료 확인 후 05:24:56 UTC에 probe가 설치된 dev 앱을 시작했다.
05:27:33에 OAuth client 등록, 05:28:05에 token 발급이 있었고,
05:28:07/05:28:39 목록 응답은 최소 프로필의 도구 1개 / 660 bytes였다.
사용자는 기존 ChatGPT 플러그인을 삭제하고 다시 만들자 연결된 것 같다고 보고했다.
연결 재등록과 최소 목록이 동시에 달라졌으므로, 캐시/등록 상태만이 원인이라고
단정하지 않는다. 새 연결에서 전체 목록을 비교하기 위해 probe profile을 `full`로
복원했고, 같은 플러그인에서 도구 새로고침 결과를 요청했다. 이 확인 전에는
전체 249개 기능이 ChatGPT에서 복구됐다고 보고하지 않는다.

사용자는 새로고침도 성공했다고 답했다. 05:29:32 UTC 인증된 `tools/call`
HTTP 200 / 15,490 bytes는 확인됐지만, full 복원 후 새로운 `tools/list` 요청은
아직 없었다. 따라서 도구 호출 연결 성공과 전체 목록 갱신 성공을 구분한다.
진단용 1개 목록이 ChatGPT에 저장돼 있을 가능성을 배제하기 위해 full 상태에서
플러그인 삭제/재등록을 요청했다. 앱 재시작은 필요하지 않다.
