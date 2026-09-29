# 2026-09-29 감사 후 수정

기준 커밋은 `97a296493dd75858c3622a0acdc4d2e8060be07d`, 앱 버전은 2.8.6이다.
이 문서는 해당 감사에서 확인한 결함과 추가 개선의 수정 근거를 기록한다.
사용자 보관함·원본·출력물 대신 격리된 테스트 데이터를 사용했다.

## 확인된 결함 10건

| ID         | 수정된 동작                                                                                                                      | 회귀 검증                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| STORAGE-1  | 공유 가져오기 준비 중 추가된 화를 보존하고, 원래 선택에서 제외한 화만 정리한다. 최신 보존 페이지 편집도 유지한다.                | 실제 공유 가져오기 transaction의 동시 추가·편집·제외 검증                              |
| STORAGE-2  | 백업 파일 목록을 큰 배열 spread 없이 누적하며 취소와 전체 파일 예산을 확인한다.                                                  | 가상 파일 150,000개의 순회 및 기존 백업 검증                                           |
| RENDERER-1 | 화를 교체하기 직전에 최신 편집 저장을 기다리고, 그 사이 새로 그린 마스크도 폐기 확인에 포함한다.                                 | 지연된 열기 응답, 추가 편집, 저장 실패, 재선택, 마스크 폐기 거절                       |
| RENDERER-2 | 연속 입력을 하나의 Undo로 합쳐도 버튼이 판단하는 최신 snapshot을 갱신한다.                                                       | 실제 session 충돌 검사와 연속 입력 Undo                                                |
| RENDERER-3 | 복제 ID가 원래 ID 길이에 따라 계속 늘어나지 않도록 새 ID를 생성한다.                                                             | 30회 연속 복제 및 저장 스키마 검증                                                     |
| RENDERER-4 | 복제·보관함 삽입·수동 생성이 최신 페이지의 기존 500개 제한을 동일하게 지킨다. 초과 시 기존 편집·선택을 유지하고 이유를 표시한다. | 499→500, 이미 500, 재렌더 전 반복 요청과 동시 추가                                     |
| ROOT-1     | 번역문 대신 실제 표시되는 원문이 바뀌면 출력 revision도 바뀐다.                                                                  | 보이는 원문과 숨겨진 원문의 revision 차이                                              |
| ROOT-2     | 공유 데이터에서 PC 내부 작업 이어하기 식별자를 제거한다. 기존 잘못된 식별자도 다른 화의 실행을 재개하지 못한다.                  | 공유 export/import, 저장된 run과 요청 화·페이지 집합 검증, 실제 재개 UI                |
| MCP-1      | 승인 거래에서 검증한 콜백 origin을 CSP에 허용한다.                                                                               | 실제 Chromium의 로컬 콜백 도달 및 CSP 오류 없음                                        |
| MCP-2      | refresh 토큰 이력을 무한 누적하지 않으며, 발급 실패가 기존 연결이나 재시도 권한을 소모하지 않는다.                               | 92일·5클라이언트·11,040회 회전, 재시작, 기존 snapshot 이행, 재사용·변조·만료·발급 실패 |

화 전환 중 편집기 전체를 잠그거나 기존 지원 용량을 낮추지 않았다.
공유 가져오기 UI를 연 뒤 제출하기 전의 별도 revision 계약까지 새로 설계한 것은 아니다.

추가 독립 검토에서는 마스크 폐기 확인창이 숫자 입력의 blur를 유발해, 직전 저장 이후
새 편집이 생기는 경로도 재현했다. 확인 뒤의 저장 barrier와 최신 요청 검사를 추가했다.
그 저장을 기다리는 동안 새로 그린 마스크도 기존 승인에 포함되지 않도록 현재 마스크
map의 identity를 다시 확인한다. 실제 확인창·숫자 입력·저장 훅을 연결한 테스트가
저장 성공, 실패 시 편집 보존, 재선택 및 승인 뒤 새 마스크를 검증한다.

## 성능과 경계 정리

- 페이지 작업의 소유권 획득에서 중복 전체 화 읽기를 제거했다. 100페이지·1단계에서 preflight를 포함한 읽기가 203회에서 103회로 감소했다. 실제 처리와 최종 저장에 필요한 최신 상태 읽기는 유지한다. 이 수치는 읽기 호출 횟수이며 실제 앱 처리 시간의 절반을 보장하지 않는다.
- PNG 검증과 순수 픽셀 합성을 세션 소유 워커로 옮겼다. 워커 하나를 재사용하고 대기·실행 중 취소, 종료 대기, staging 보존을 관리한다. Electron의 기존 native 이미지 decode/encode는 그대로 사용한다.
- 실제 컴파일한 워커와 4,000×4,000 입력으로 측정한 검증의 최대 메인 타이머 간격은 약 318ms에서 16.5ms로 감소했다. 워커 생성·전송을 포함한 검증 완료 시간은 302ms에서 420ms였다. 목적은 UI 응답성 개선이며 총 처리 시간이 항상 감소한다는 의미는 아니다. native 이미지 처리 시간은 이 Node 측정에 포함되지 않는다.
- Electron 43.3.0 / Node 24.18.1에서도 기본 factory로 검증·종료를 실행했다. 실제 compiled dependency closure와 PNG 라이브러리를 격리 ASAR에 넣은 추가 검증도 unpack이나 동기 fallback 없이 통과했다. 실제 installer 전체를 새로 패키징한 검증과는 구분한다.
- 같은 앱 명령의 단축키가 command map을 사용한다. 기존 열기/닫기 토글 의미는 유지한다.
- ZIP은 항목을 모으는 중 파일 예산을 검사한다. 정상 directory header를 파일 수로 세어 기존 패키지를 거부하지 않으며, 불필요한 directory 목록은 보관하지 않는다.
- 공유 SFX 해결 기록의 블록 참조도 새 ID로 치환한다. MCP 서비스의 빠른 끄기/켜기는 이전 세션 정리 뒤 새 세션을 열도록 직렬 순서를 지킨다.

## UI와 의존성

일반 UI의 실제 raw JSX control 188개를 공용 primitive로 옮겼다. native 속성, ref, form submit 기본값, 입력 초안, 이벤트 및 아이콘 배치를 보존한다. 색상 선택·파일 입력 6개는 명시적 native 예외로 남기고 사유와 테스트를 UI 규칙에 기록했다. 기존 정규식 집계에 포함되던 주석 1건은 AST 집계로 바로잡았다.

CSS 391개 선언에 들어 있던 색상 405개와 숫자 z-index 15개를 semantic token으로 옮겼다. 전후 token을 풀어 실제 값을 비교했으며 기존 색상·투명도·paint order를 유지한다. primitive stylesheet 직접 참조 3건도 제거했다. 유지보수 gate의 해당 baseline은 실제 감소량에 맞춰 낮췄다.

`vitest`와 coverage는 4.1.11, `adm-zip`은 0.6.1로 올리고 취약한 전이 의존성의 허용 범위 업데이트를 적용했다. 모델 runtime·Electron·앱 버전은 유지했다. 수정 후 `npm audit` 결과는 취약 패키지 **9개에서 0개**다. 이는 npm 감사 대상 범위의 결과이며 외부 모델/runtime 전체에 대한 보안 인증은 아니다.

## 화면 검증

일반 UI·상태 조립 파일 10개의 책임을 나눠 파일 단위 lint 예외를 **59개에서 49개**로
줄였다. 조건/작업/패턴/가져오기 화면과 저장·미리보기·작업 이벤트·번역 흐름에서,
저장 세대 번호·타이머·구독·취소·종료 순서의 소유자를 유지했다. 새 barrel이나 forwarding
wrapper로 의존성을 숨기지 않고 실제 구현과 공용 primitive를 직접 참조한다.
조건 편집 stylesheet의 직접 소비자는 30개, 세 조립 컴포넌트의 직접 runtime import는
각 13개로 측정했다. 해당 모듈만 사유와 함께 기록하고 기존 action/condition card의
불필요해진 예외는 제거했다. 전역 의존성 상한은 유지한다.

수정 전후 실제 컴포넌트의 조건 8·작업 10·패턴 9·가져오기 4개 상태는 DOM 비교
31/31을 통과했다. DOM 비교는 focus·IME·화면 geometry를 대신하지 않으며 아래의 실제
브라우저 캡처와 입력·저장 동작 테스트로 보완한다. 남은 49개 lint 예외는
[전체 예외 검토](lint-exceptions-audit-20260929.md)에 근거를 기록했다. 보호 알고리즘과
transaction·호환성 경계를 길이 경고만 줄이려고 이동하지 않았다. cross-script proxy
전체 수치 parity와 main 시작/종료 조립에는 기존 검증 공백이 남아 있으며, 이 작업이
그 영역의 완전한 검증이나 영구 예외 승인을 의미하지 않는다.

실제 production component와 stylesheet, 저장소 QA bridge를 사용했다. 앱 전체, 편집기, 설정, 연구 제안, 웹 가져오기, 캔버스 변형을 1600×980과 1240×760에서 직접 확인했다. 긴 한국어·일본어·영어, disabled, focus, dropdown/modal, HEX 입력 중간값을 포함했다. `#12` 초안이 React 재렌더 후에도 유지되고 적용 색상은 마지막 유효값 `#112233`인 것을 확인했다.

- [앱 좁은 화면](C:/tmp/manga-audit-app-narrow-20260929.png)
- [편집기 넓은 화면](C:/tmp/manga-audit-editor-wide-20260929.png)
- [편집기 좁은 화면](C:/tmp/manga-audit-editor-narrow-20260929.png)
- [설정 입력·포커스](C:/tmp/manga-audit-settings-hex-20260929.png)
- [웹 가져오기 좁은 화면](C:/tmp/manga-audit-web-import-narrow-20260929.png)
- [캔버스 변형 좁은 화면](C:/tmp/manga-audit-overlay-narrow-20260929.png)
- [200% 배율 상당의 웹 가져오기](C:/tmp/manga-ui-web-import-zoom200-runner-01.png)
- [200% 배율 상당의 설정 팝오버](C:/tmp/manga-ui-settings-zoom200-runner-02.png)
- [200% 배율 상당의 편집기 HEX 초안](C:/tmp/manga-ui-editor-hex-zoom200-runner-01.png)

확대 검증은 CSS viewport 620×380과 DPR 2에서 1240×760 PNG로 수행했다.
CSS zoom이나 pinch 확대 대신 실제 좁아진 레이아웃과 body portal을 함께 검증했다.
최종 화면에서 외부 가로·세로 overflow, 패널 겹침, 패널 가로 overflow는 없었다.
내부 스크롤은 정상 동작을 유지한다. 임시 QA entry만 제거하고 PNG와 진단 JSON은 보존했다.

디자인 탐지기의 기존 선택/경고 표시선, 캔버스 핸들, 투명도 격자, 진행률 너비 애니메이션 제안은 각각의 기능과 연결되어 있다. 단순 스타일 경고를 없애기 위해 이 표시를 제거하지 않았다.

구조 분리 후 조건·작업 편집과 가져오기·작품 메뉴·설정에서 넓은/좁은 10개 화면을
추가로 확인했다. 실제 입력 이벤트, 접기/펴기 뒤 값 유지, 선택 제외, JPEG 품질 1/100,
긴 작품명 메뉴를 검증했다. 조건 편집과 가져오기는 200% 상당의 화면도 추가했다.
패턴 드래그 버튼 중복 제거 후 영향 화면 4개도 재캡처해 이번 수정의 검토 이미지는
총 32개다. 실패한 fixture 캡처나 중간 preflight는 이 수에 포함하지 않는다.

- [조건 편집·입력 유지](C:/tmp/manga-ui-conditional-action-narrow-drag-handle-final-03.png)
- [가져오기·선택 제외](C:/tmp/manga-ui-import-structure-narrow-final-02.png)
- [긴 작품명 메뉴](C:/tmp/manga-ui-import-work-menu-structure-wide-final-02.png)
- [확대 조건 편집](C:/tmp/manga-ui-conditional-structure-zoom200-final-01.png)
- [확대 가져오기 메뉴](C:/tmp/manga-ui-import-structure-zoom200-final-02.png)

## 검증 기록

개별 수정의 회귀 검증, OAuth 독립 반례 검토, 실제 브라우저 CSP 확인 및 컴파일된 이미지 워커 측정을 수행했다. 최종 `npm run check`와 동일한 진입점인 `node scripts/check.cjs`의 **26개 gate가 모두 통과**했다. 총 소요 시간은 363.292초다.

- 전체 테스트: **9,913개 통과, 실패 0개, 기존 skip 8개 유지**. 수정 전 9,805개 통과에서 회귀 검증을 보강했다.
- TypeScript·Electron·JS 타입 검사, lint, formatting, 아키텍처·유지보수 정책, 중복·미사용 코드 검사가 통과했다.
- 전체 coverage와 파일별 기존 기준을 통과했다. Statements 85.24%, branches 78.47%, functions 87.59%, lines 86.46%다.
- production build, 출력 이미지 pixel parity, image protocol smoke, renderer·preload bundle 검사가 통과했다.
- 실제 HTTP OAuth 발급·회전·재시작·폐기와 잘못된 snapshot의 원자적 거부, IPC의 다른 화 재개 거부를 검증했다. 백업은 가상 fs port에서 1,000,001개 파일 경계, 누적 예산, 취소 및 진행률 생략 경로를 확인했다.
- 실제 화면 캡처 32개의 파일 크기와 SHA-256을 최종 대조했고 임시 QA entry가 제거됐음을 확인했다.

최종 결과는 `.bug-hunter/remediation-20260929/full-check-final.log`,
`full-check-final-timings.json`, `full-check-final-vitest.json`,
`full-check-final-coverage.json`에 보존했다. 확인된 결함 10건의 `fix-report.json`은
Bug Hunter schema 검증도 통과했다. 최초 검사에서 발견한 기존 테스트의 기대값 불일치와
새 분기의 coverage 미달은 테스트를 보강해 해결했고, 해당 실패 기록도 보존했다.
이 검증 기록 시점에는 커밋이나 릴리스를 만들지 않았다.

커버리지 기준은 수정 전 동일 HEAD에서 통과한 전체 측정치를 별도로 보존했다.
기존 파일의 covered/total 비율과 과거 측정 artifact의 binding은 낮추거나 바꾸지 않았다.
기존 coverage 기록 2,041개가 기준 커밋과 동일함을 별도로 대조했다.
새 모듈은 별도의 실제 실행 측정으로 inventory에 추가하고, 새로 감사 범위에 들어온
기존 파일은 수정 전 전체 측정치를 사용한다. 부분 테스트 측정과 최종 전체 검증 결과는
서로 구분한다.

원본 감사와 이번 수정의 기계 판독 증거는 각각 `.bug-hunter/audit-20260929-97a29649/`, `.bug-hunter/remediation-20260929/`에 있다. 이 수정은 해당 감사의 확인된 문제와 개선 범위를 다루며, 저장소의 모든 코드에 결함이 없다고 주장하지 않는다.
