# 반복 초기화와 중복 처리 수정

2026-10-03. 기준 `f72a5895`(v3.1.0), 작업 브랜치
`codex/runtime-efficiency-fixes`. 수정은 [v3.1.1](release-notes/v3.1.1.md)에 반영한다.
모델 자산의 별도 릴리스는 포함하지 않는다.

## 수정 범위

| 경로                        | 변경                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #136 기존 블록 유지 번역    | 모든 대상의 최신 편집 입력을 먼저 인계받고 OCR을 배치로 완료한 뒤 번역한다. 같은 페이지를 다시 인계받지 않는다. 체크포인트 재검사 후 실제 추가 OCR이 필요할 때만 번역 세션을 종료한다.                                                                    |
| EFF-1 새 워크플로 원문 제거 | erase 단계가 기존 native workload를 소유한다. 각 페이지는 같은 모델을 빌리고 단계 종료 시 실제 정리를 기다린다.                                                                                                                                           |
| EFF-2 MCP 선택 번역         | 선택 작업에서 endpoint를 재사용한다. 상위 workflow가 소유한 같은 종류의 workload는 명시적으로 빌린다.                                                                                                                                                     |
| EFF-3 MCP 선택 OCR          | crop을 준비한 뒤 한 번의 OCR batch로 읽는다. 같은 페이지는 디코드를 공유하고 다음 페이지에서 교체한다. 알려진 블록과 자유 영역의 서로 다른 탐지 계약은 유지한다.                                                                                          |
| EFF-4 MCP 워크플로 OCR      | 화 안의 미완료 OCR 페이지를 첫 native 작업에서 함께 준비한다. 추가 페이지도 기존 예약·편집 인계를 거치고 저장·receipt는 각 단일 페이지 작업을 사용한다. 배치 후와 나중에 결과를 소비할 때 원본·revision·문맥을 다시 검사한다. 화별 cache 경계는 유지한다. |
| EFF-5 C23 GPU 글꼴 분석     | 줄·글자·복구 단계에서 Hayai 자식을 재사용한다. GPU는 항상 한 자식이며 기존 CPU 풀 정책은 유지한다.                                                                                                                                                        |
| EFF-6 기존 블록 crop        | 기존 known-block-crop 계약으로 확정된 영역 안의 재탐지를 생략한다. padding·크기·블록 기하는 유지한다.                                                                                                                                                     |
| EFF-7 규칙·검토             | 단계 안에서 숨은 Chromium을 재사용한다. preparePage가 실제 페이지·폰트·레이아웃을 준비하고 불필요한 PNG 캡처를 생략한다.                                                                                                                                  |
| EFF-8 MCP 일괄 출력         | 배치와 workflow 출력 단계가 renderer를 공유한다. 출력별 권한·원본·revision·시간 제한·PSD 계약과 부분 결과는 유지한다.                                                                                                                                     |

범위 밖의 단일 요청은 기존처럼 요청 종료 시 정리한다. 빈 작업은 자원을 생성하지
않고 취소·실패·정리 오류는 기존 소유권과 오류 전파 경계를 따른다.
사용자 library·원본·출력·설정은 수정하지 않는다.

## 실제 실행 근거

격리된 `.tmp/runtime-efficiency-real-20261003`에 결과를 보존했다.

- RTX 4090 / Hayai GPU / Gemma 12B QAT / rtx50 런타임의 동일 합성 4페이지에서
  기존 keep 모드의 OCR 프로세스와 Gemma endpoint가 각각 **4회 → 1회**.
  수정 후 약 **39.4초**, 네 페이지 모두 `こんにちは → 안녕하세요`였다.
  이전 약 192초에는 최초 런타임 설치가 포함되므로 개선 배수를 계산하지 않는다.
  사용자 신고의 RTX 5060 Ti 16GB와 다른 장비다.
- C23 GPU transport는 기존 단발 실행과 줄·글자·두 복구 배치를 비교했다.
  **8개 OCR JSON 전체 payload 동일**, 재사용 PID 하나. 배치 8, 최대 생성 96토큰,
  256 patch와 device 계약을 보존한다. `font-transport2/verification.json`.
  첫 검증기의 cp949 읽기 실패는 UTF-8 지정 후 재실행했다. 전체 폰트 모델의
  품질 재평가로 세지 않는다.
- 가로쓰기·여러 줄·세로쓰기 합성 crop은 실제 detector+Hayai와 known-block
  경로에서 같은 정답을 반환했다. `crop-quality/verification.json`.
  실제 만화 전체 분포의 품질 평가를 대신하지 않는다.
- 실제 Electron production renderer에서 정상 번역·원문과 동일한 번역·빈 번역을
  비교했다. 이전 PNG 렌더 후 계측과 새 준비 후 계측의 결과 및 다시 캡처한 픽셀이
  동일했다. `renderer/verification.json`, PNG 3개를 보존한다. 합성 입력은
  인페인팅을 제외하므로 배경 원문이 남아 있다.

회귀 검증에는 모델 획득/반환, 페이지 실패, 상위 workflow 재사용, OCR 결과 누락,
취소 중 정리 장벽, 원본 교체, renderer 취소와 분리 호출을 포함한다.
기존 감사는 `.bug-hunter/runtime-efficiency-20261003`, 최종 검사 기록은
`.bug-hunter/runtime-efficiency-fixes-20261003`에서 관리한다.

최종 `npm run check`의 26개 검사가 모두 통과했다. 테스트 10,050개 통과,
8개 건너뜀, 실패 0개이며 기존 커버리지 기준, production 빌드, 실제 페이지
픽셀 비교와 이미지 프로토콜 검사도 통과했다. 내장 자산 36개 검증도 완료했다.

## 계약과 rollback

C23 모델 bytes·공개 tag·cache version은 유지한다. Python transport의 SHA-256만
앱 권위인 `fontChapterC18Manifest.json.runtimeSources`에 반영한다.
되돌릴 때 transport와 source binding을 함께 되돌린다.

새 OCR 조정자가 library gateway와 McpEditError를 직접 사용하는 실측 consumer
상한은 각각 81과 246이다. 전역 예산이나 기존 알고리즘은 바꾸지 않는다.
새 두 모듈의 최초 Windows 커버리지는 `.tmp/runtime-efficiency-initial-coverage.json`,
SHA-256 `f1d5d2f9c07350dae0f81b54f0fd38ac0b03395f41fd065b3376f74c9a0e3645`에서 등록했다.
기존 커버리지 기준과 역사 artifact/provenance는 유지한다.

Rollback은 이 수정의 source·tests·source binding·새 모듈 inventory를 함께 되돌린다.
배포 자산, library 또는 기존 결과물을 지우는 절차는 없다.
