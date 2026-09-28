# MCP 기본 번역 품질 계약 — 2026-09-27

일반적인 “이 화 번역해줘” 요청의 시작점을 `carrot_get_translation_guide`로
연결했다. 새 실행 큐를 만들지 않고 기존 문맥·영역·폰트·이미지 업로드·워크플로·
composite 검수 계약을 안내한다. 이 변경은 연결 AI의 작업 선택과 완료 보고를
개선한다. 번역 모델이나 보호된 폰트/배치 알고리즘을 교체하지 않는다.

## 공개 계약

- guide는 chapterId와 선택 pageIds(최대 50개)를 받는 읽기 전용 도구다.
  문맥 revision, 이전 챕터 ID, 페이지별 revision과 저장된 누락, 실제 노출 도구,
  다음 단계와 완료 조건을 반환한다. 모델·저장·큐·할당량 사용은 없다.
- 모든 원본을 보고 대사·내레이션·소개문·말풍선 밖 글씨·효과음을 포함한다.
  OCR/검출 후보가 비어 있어도 검사를 생략하지 않는다. 일반 누락은 기존 블록
  생성, 효과음 누락은 기존 수동 영역 계약으로 등록한다.
- 이미지 경로는 대화 생성 도구+실제 PNG 전달, 앱 Codex, 로컬 순서다.
  대화 도구 유무/전달 능력과 앱 runtime 준비 상태는 서버가 추정하지 않는다.
  `imageCapabilities`는 host-reported이며, 서버가 확인한 노출 도구와 구분한다.
  PNG 업로드/적용 도구가 없으면 호스트 파일 경로를 추천하지 않는다.
- 앱 배경 복원은 `carrot_run_page_erasure(engine=codex, blockId, ...)`다.
  engine 생략은 로컬 선택이다. expectedModel은 현재 설정에서 읽고 고정하지 않는다.
  효과음 생성은 `carrot_generate_sound_effects`, 일반 대사는 편집 가능한 텍스트다.
- 생성 가능/전송 불가/실패/검수 탈락은 이유를 남기고 다음 경로로 진행한다.
  정책 거절은 다른 제공자나 로컬 작업으로 우회할 근거가 아니다.
- `quality.imageHistory`는 영역별 hostAttempts/appAttempts, 결과, 이유를 기록한다.
  합계 3회를 넘거나 중복 영역이면 거부한다. 보정 보고에서 기존 횟수 감소·누락과
  정책 거절 해제도 거부한다. 앱 효과음의 `priorGenerationAttempts`를 전달하면
  기존 독립 재판독 루프가 남은 횟수만 사용한다.

## 품질 검수와 신뢰 경계

기존 수동 composite의 계약은 유지한다. 새 안내는
`qualityPolicy: "complete-translation-v1"`, `maxReviewPasses: 3`을 요구한다.
내용 변경 후 최종 review가 없는 품질 plan은 거부한다. 최초 검수와 최대 두 번의
보정/재검수를 기존 declared phase와 예산으로 진행한다.

보고에는 각 페이지의 sourceCoverage, translationAccuracy, contextConsistency,
soundEffectCoverage, backgroundRestoration, typography, generatedGlyphs,
soundEffectsFound/Completed, unresolved, imageHistory를 포함한다.
실제 블록·생성 레이어·정리 이미지가 있으면 해당 검사를 not-applicable로
대체할 수 없다. 저장된 번역 누락·원문 누락·오래된 생성 레이어·미해결 효과음도
accepted를 차단한다. 이미지가 없는 파일명이나 AI 주장만으로 완료되지 않는다.

기존 네이티브 검수는 모든 대상 페이지의 실제 PNG 조회와 현재 원본·문맥·설정·폰트·
page/review revision을 검증한다. 편집 후 과거 증거로 새 보고를 승인할 수 없다.
공개 `qualityReview`는 pending, partial, accepted-at-reviewed-revision을 구분한다.
마지막 값은 저장된 검수 당시 revision의 이력이며 현재 보관함을 매번 재검증했다는
뜻이 아니다. 저장·내보내기 성공과 연결 AI가 판단한 미적 품질을 구분한다.

서버는 다른 도구 namespace의 이미지 호출 횟수나 AI의 실제 시각 판독을 관측할 수
없다. 외부 생성 횟수는 보고된 누적 기록이며 전역 호출 차단 장치가 아니다.
기존 수동 생성 도구에 새 요청을 보내면서 이전 횟수를 고의로 누락하는 것까지
서버가 차단한다고 주장하지 않는다. 일반 요청을 안내로 유도하되 모든 수동 도구
사용에 품질 정책을 강제하지도 않는다. 체크리스트만으로 번역 품질을 보장하지 않는다.

## 2.3화 원본 보존 평가

평가 대상은 작품 `97f0d17e-5bbd-47e7-ae58-b56f81e2213a`의 챕터
`f95e0d72-7513-4651-9f9c-2c9a808b225d`다. 원본/정리본/마스크를
`.tmp/translation-quality-20260927/mcp-baseline/`에 복사하고 production page-export
renderer로 9페이지를 실제 렌더했다. 양쪽 원본과 렌더를 직접 확인했다.
chapter JSON과 원본 이미지 SHA-256을 전후 대조했다. 사용자 chapter나 library는
수정하지 않았다. 66블록 모두 ordinary, 명시적 fontFamily 0, 생성 레터링 0,
효과음 검토 기록 0이었다.

| 페이지 | 기존 출력에서 확인한 문제                                              | 판정      |
| ------ | ---------------------------------------------------------------------- | --------- |
| 1      | 큰 웃음 효과음 ガハハ 미처리, 소개문/일반 대사 표현 차이 부족          | 보정 필요 |
| 2      | 미모리 소개문이 지나치게 작음, 말풍선 밖 “도와드릴게요!”가 좁은 세로열 | 보정 필요 |
| 3      | 말풍선 밖 짧은 대사의 좁은 줄바꿈, 본문 크기/여백 불균형               | 보정 필요 |
| 4      | 왼쪽 아래 작은 はい 미번역, 그림 위 대사의 가독성 부족                 | 보정 필요 |
| 5      | 상단 仲良くしてね〜 미번역, “또 보자.”와 “실례하겠습니다.” 크기 불균형 | 보정 필요 |
| 6      | 말투/호칭 줄바꿈과 크기 불균형. 오른쪽 위 빈 말풍선은 원본도 비어 있음 | 보정 필요 |
| 7      | 패널 경계의 외부 대사가 12px로 지나치게 작음                           | 보정 필요 |
| 8      | 주요 독백 4개가 12px, 작은 いいぞ 미번역                               | 보정 필요 |
| 9      | 큰 ボーン 효과음 미처리, 독백이 한 글자씩 끊겨 가독성 저하             | 보정 필요 |

레이아웃의 overflow=false만으로 좋은 결과를 판정할 수 없다. 예컨대 8페이지
독백은 기하학적 overflow가 없으면서도 읽기 어렵다. 그림의 미세 손상/잔재까지
없다고 인증하지 않았다. 이 평가는 AI 시각 감사이며 human gold가 아니다.

다른 작품 `7efa661e-e82d-46b5-bd62-bcb231ffb68e`의 참고 챕터에서는
2/4/6페이지를 별도로 렌더했다. 식자 표현만 참고했고 문구·인물·정답은 복사하지 않았다.
`render-results.json`, 페이지별 `page-N-layout.json`, `source-manifest.json`,
`native-mcp-preview.png`를 같은 증거 폴더에 보존한다.

## 실제 연결과 남은 검증

현재 연결된 플러그인의 render-page-preview에 이어 capabilities/server-info도
`-32603 Internal error`를 반환했다. 같은 소스의 격리 네이티브 MCP 미리보기는
정상 PNG를 반환했다. 서버/클라이언트 로그가 연결된 재현 없이 이를 미리보기
알고리즘 결함으로 단정하지 않는다.

따라서 새 ChatGPT 연결의 짧은 요청 성공과 9페이지 개선 출력의 동일 원본 비교는
아직 미완료다. 기존 출력 전체 감사, 네이티브 PNG 파이프라인 시험, 모의 모델을 쓰는
회귀 검사를 실제 ChatGPT의 자동 번역 성공으로 대신하지 않는다. 수정 앱을 사용한
연결 도구 목록에 guide가 나타난 뒤 격리 복사본을 대상으로 후속 시험해야 한다.

## 구현·검증 근거

- 핵심 구현: application/mcpTranslationGuide, application/mcpTranslationQuality,
  shared/mcpTranslationGuide, shared/mcpTranslationQuality, mcpTranslationGuideTool.
- 기존 composite report/evidence/projection에 선택적 품질 계약을 확장했다.
- 새 회귀 검사는 전체 범위 안내, 실제 노출 도구 필터, 경로 선택/실패/거절,
  합산 재시도 상한, 저장된 누락, 잘못된 not-applicable, 오래된 증거,
  실제 PNG 조회와 문맥 연결, 중복 보고, 세션 종료를 검사한다.
- 네이티브 smoke는 synthetic inference 경계만 대체하며 실제 PNG chunk 업로드,
  보호 픽셀 보존, 이미지 이력, 레터링 적용/복구, 앱 렌더를 실행한다.
  생성형 모델을 실제로 호출한 시험은 아니다.
- architecture baseline은 기존 권위 재사용으로 증가한 직접 import 5곳만 실측
  반영했다. pageRevision 83→84, mcpEditPolicy 240→242, mcpContextEditing 36→37,
  mcpReadTools 30→31, mcpOutputSchemas runtime imports 44→45. 전역 상한은 유지했다.
- 신규 소스 5개를 coverage manifest에 추가했다. 기존 수치/기준을 낮추지 않았다.
  초기 실측 근거는 증거 폴더의 `coverage-initial.json`이다.

검사 로그는 증거 폴더의 `check-final.log`, `build-final.log`, `native-smoke.log`에
보존한다. 기존 미커밋 발견/프로토콜 수정도 유지하며 커밋·푸시·릴리스는 하지 않았다.

최종 결과: `npm run check`와 동일한 `node scripts/check.cjs` 전체 통과
(384.30초, 테스트 9,678 통과/16 생략). 타입·lint·format·아키텍처·기존 커버리지
기준·빌드·이미지 프로토콜·렌더러/프리로드 경계 검사 모두 통과했다.
production panel/export 픽셀 비교 두 시나리오는 mismatchedPixels=0이었다.
별도 `npm run build`와 격리 Electron의 전체 MCP native smoke도 통과했다.
마지막에 내용만 추가한 이 검증 기록은 Prettier와 diff 검사를 별도로 확인했다.

컴파일된 HTTP 서버의 2025-11-25/2026-07-28 도구 호출에서도 guide가
9페이지/66블록과 전체 단계, engine=codex 안내를 정상 반환했다.
읽기 전용 스냅샷 port를 사용한 로컬 HTTP 검증이며 ChatGPT 연결 시험과 구분한다.
응답은 `guide-http-results.json`, 페이지별 감사는 `evaluation.json`에 보존한다.

## Chapter 2.32 후속: 첫 식자 판단과 도구 호출 수

사용자가 지적한 Chapter 2.32는 같은 작품의
`332a25cc-b376-491f-9b5c-8715037b4301`이다. 9페이지/81블록 모두 명시적
fontFamily가 없었다. 2·8·9페이지의 기존 저장 상태를 격리 복사하여 실제
production page-export renderer로 렌더하고 직접 확인했다. 이 이미지는 개선본이 아니다.

- 2페이지: 넓은 말풍선에 비해 작은 대사와 소개문, 좁은 세로 식자.
- 8페이지: 작은 독백과 넓어진 텍스트 영역이 머리카락·이마 위로 침범.
- 9페이지: 효과음은 처리됐지만 기본 고딕을 크게 늘린 표현, 작은 본문과의 불균형.

저장된 `reviewStatus=reviewed`와 `overflow=false`는 이 문제를 드러내지 못했다.
또한 9페이지 효과음은 저장된 40px와 실제 자동 맞춤 결과 약 177px가 달라,
저장 숫자만으로 결과를 판단할 수 없다.

후속 변경은 AI에 노출되는 guide·서버 instructions·도구 설명이다. 원본을 읽을 때
번역과 식자를 함께 설계하고, 표현별 소수 폰트 견본을 비교해 일관된 팔레트를 정하며,
원본 이미지 픽셀과 화면 픽셀의 차이 및 글자 면적과 nominal fontSizePx의 차이를
이해하도록 구체화했다. 좁은 원문 열을 그대로 쓰거나 그림 위로 영역을 늘리는 대신
사용할 여백과 줄바꿈을 먼저 결정하고 기존 batch 도구로 적용하도록 했다.

목표는 한 번의 계획된 적용과 한 번의 최종 화면 확인이다. review budget은 최대치이며
정해진 횟수만큼 반복하라는 뜻이 아님을 모든 주요 발견 경로에서 명시했다. 실제 결함이
보일 때만 해당 부분을 고친다. 최소 글자 크기, 새 품질 차단 조건, 강제 반복 로직이나
보호된 폰트/배치 알고리즘 변경은 추가하지 않았다. 기존 이미지 생성 우선순위와
실제 저장·렌더 증거 계약은 유지한다.

증거는 `.tmp/chapter232-typography-review/`에 보존했다. `existing-page-2.png`,
`existing-page-8.png`, `existing-page-9.png`, 각 layout JSON 및 source-manifest.json은
기존 결과 감사용이다. 원본·저장 챕터 해시를 확인했으며 library는 수정하지 않았다.
이번 안내 변경 이후 관련 11개 파일/79개 테스트, 변경 소스 ESLint·Prettier,
`npm run compile:electron`이 통과했다. 로그는 같은 디렉터리에 있다.
위 전체 check 결과는 이 안내 후속 변경 전의 결과다.

ChatGPT 실제 연결의 자동 수행 및 개선 출력은 여전히 미검증이다. 안내 변경과
회귀 검사 통과를 첫 시도 번역 품질 개선의 실증으로 주장하지 않는다.
