# 통합 서식 패널과 부분 행간 인계

2026년 10월 21일 기준 작업 기록이다. 기존 텍스트 탭과 서식 탭을 서식 패널로 합치고, 블록 전체와 선택 문자와 입력 커서가 같은 문자 서식 컨트롤을 사용한다. UI와 UX 재구성은 사용자의 요청으로 로컬 Claude Code에 맡겼다. 앱 릴리스와 커밋은 이 작업에 포함하지 않는다.

## 적용 범위

블록 선택은 전체 문자, 번역문 범위 선택은 그 문자, 번역문 삽입점은 이후 입력 문자에 적용한다. 여러 블록은 각 블록의 전체 문자에 적용한다. 별도 전체 또는 문자 또는 줄 모드는 없다. 정렬, 쓰기 방향, 줄바꿈, 자동 맞춤, 글자 영역 배경과 프리셋은 블록 속성이다. 그림자는 외곽선·광선과 함께 문자 효과이며 같은 선택 범위를 따른다. 원문 OCR은 문자 서식의 대상이 아니다.

문자 서식은 기존 안전한 마크업에 저장한다. `[line-height=1.18]`은 118%이며 `[letter-spacing=0.1]`은 0.1em이다. 범위와 허용값은 기존 블록 상수와 같다. HTML이나 줄 번호별 데이터를 저장하지 않는다. 속성이 없는 문서는 기존 값을 상속하고 기존 측정 경로를 유지한다. 전체 글자 크기를 변경하면 크기 덮어쓰기만 없애고 부분 색상과 강조를 보존한다. 블록의 굵게 등 상속 플래그를 일부에서 해제할 때는 다른 문자에 기존 효과를 먼저 보존한다.

## 행간과 실제 출력 줄

행간은 해당 줄과 앞줄 사이의 거리다. 첫 줄 위에는 추가 여백을 만들지 않는다. 같은 줄에 서로 다른 값이 있으면 가장 큰 유효 행간을 사용한다. 줄 전체를 선택하면 간격을 줄일 수 있다. 명시적 줄바꿈, 빈 줄, 자동 줄바꿈과 세로쓰기에서 동일한 규칙을 사용한다. 서식은 줄 번호 대신 문자를 따라간다.

공통 측정 결과가 UTF-16 원문 범위, 생략한 줄 끝 공백의 소비 길이, 줄별 간격을 제공한다. 출력 줄 선택은 이 범위를 사용한다. 말풍선 모양 안에서는 이동한 줄의 실제 높이 대역을 원래 모양과 다시 교차시켜 허용 폭을 계산한다. 고정 반복 한도 안에서 수렴하지 않거나 모양 밖으로 나가면 적합 판정을 하지 않는다. 곡선 텍스트의 자간은 문자별 값을 사용하며 기존 곡선 간격 맞춤이 켜진 경우에는 그 맞춤이 우선한다.

선택 미리보기는 렌더러의 임시 상태다. 별도 창은 블록 ID, 선택 키, 텍스트와 논리적 범위를 전달한다. 이전 블록이나 이전 선택 키의 요청은 거부하며 실제 번역문이 달라지면 하이라이트를 표시하지 않는다. 선택 미리보기는 문서와 내보내기에 저장하지 않는다.

## 구현 경계

- `src/shared/richTextMarkup.ts`와 `richTextBlockFormatting.ts`: 안전한 마크업과 전체 및 부분 서식 규칙.
- `src/renderer/src/lib/textLineTypes.ts`, `inlineLineMetrics.ts`, `inlineBubbleLineSlots.ts`: 줄 데이터, 간격, 모양 재교차.
- `overlayTextWrapping.ts`, `bubbleTextWrapping.ts`, `balancedBubbleTextWrapping.ts`, `verticalTextSpacing.ts`: 기존 줄바꿈에 문자별 자간 연결.
- `bubbleTextQuality.ts`: 기존 줄바꿈 품질 평가를 동작 변경 없이 분리. 기존 characterization 테스트를 통과시킨 뒤 이동했다.
- `OverlayText.tsx`, `OverlayTextRun.tsx`, `overlayTextStyles.ts`: 공통 미리보기 및 출력 렌더링.
- `textSelectionPreview.ts`, `panelCommandDispatcher.ts`: 임시 캔버스 선택 표시와 오래된 요청 차단.

폰트 매칭 모델과 학습 자산은 변경하지 않았다. PSD는 기존 지원 범위를 유지한다. 부분 서식을 단일 편집 가능 텍스트 스타일로 표현할 수 없으면 실제 렌더링한 이미지 레이어를 보존한다.

아키텍처 예외는 실제 추가된 직접 소비자만 대상으로 기록했다. 마크업 공통 함수, 말풍선 형상 검증, 안정적인 이벤트 콜백, 패널 세션 조합과 말풍선 배치의 파일별 import 한도를 측정해 변경했다. 전역 한도나 린트 규칙은 낮추지 않았다.

## 확인한 결과

보호된 줄바꿈 경로를 변경하기 전에 기존 명시적 빈 줄, 소프트 래핑, 공백 소비와 혼합 글자 크기의 characterization 테스트를 추가하고 통과시켰다. 이후 부분 행간, 자간, UTF-16 범위, CRLF와 이모지, 서식 저장, 전체 크기 변경 시 다른 속성 보존, 상속 굵기 해제, 실제 말풍선 모양과 세로쓰기를 검증했다.

실제 Chromium의 production `PageArtwork`에서 세 줄 예시를 측정했다. 기본 120%의 간격은 28.8px와 28.8px다. 둘째 줄만 200%로 설정하면 47.98px와 28.8px이며, 80%로 설정하면 19.2px와 28.8px다. 가로쓰기와 세로쓰기 모두 같은 결과다. 반올림 오차를 포함한 화면 좌표이며, 처음과 끝의 중앙 배치 이동은 정상이다.

- 가로쓰기 캡처: `C:/tmp/inline-leading-render-01.png`
- 세로쓰기 캡처: `C:/tmp/inline-leading-vertical-01.png`

`npm run compile:electron`과 `npm run qa:page-artwork-parity:from-build -- --keep-artifacts`를 실행했다. 부분 행간과 자간을 추가한 회전 및 왜곡 fixture를 포함한다. 836×1200에서 native-size와 metadata-mismatch 두 경우 모두 미리보기와 출력의 다른 픽셀이 0이고 채널 최대 차이도 0이다. production PSD의 배경, 텍스트 레이어와 알파 검증도 통과했다.

부분 그림자까지 포함한 최종 픽셀 비교 결과와 PNG 및 PSD는 `.tmp/page-artwork-pixel-parity/21288-1792528501346/artifacts/`에 있다. 두 비교에서 다른 픽셀과 최대 채널 차이가 모두 0이며 production PSD 검증도 통과했다. 이 이미지는 렌더링 스트레스 검사용 fixture이며 UI 디자인 예시가 아니다.

통합 패널은 실제 로컬 Claude Code가 구현했다. 사용자가 이전 결과의 복잡함을 다시 지적한 뒤, Codex가 공식 문서와 실제 화면을 대조하고 Claude에 독립 반박 검토를 요청했다. Claude는 기본 속성의 우선순위와 세로 이동 문제를 수용하되, OCR을 무조건 숨기는 안과 코드 편집을 메뉴에 감추는 안은 채택하지 않았다. 단순한 패딩 수정 대신 선택 명령, OCR 작업, 문자 속성의 배치를 재구성했다.

크기와 행간, 자간과 장평, 색상과 투명도를 각각 짝으로 배치한다. 300px 패널에서도 두 열을 유지하며 더 작은 폭에서는 공용 반응형 규칙을 따른다. 적용 대상은 문자 서식 제목 옆에 표시한다. 선택 명령은 번역문 바로 아래, 원문 지우기와 말풍선 맞춤은 OCR 제목 옆에 둔다. 접힌 상세 효과는 활성 또는 혼합 효과를 요약한다. 정렬과 자동 맞춤을 블록 설정의 앞쪽에 둔다.

production EditorPanel과 PageArtwork를 함께 띄운 900px 높이 화면에서, 기존 400px 패널의 크기/행간 입력은 약603/663px에 있었고 새 배치는 약554/554px다. 자동 맞춤은 상세 효과를 닫아도 약990px였지만 약845px로 올라왔다. 300px 패널에서는 약873px로 첫 화면 안에 들어온다. 이 수치는 고정 QA 표본의 화면 좌표이며 사용자 작업 시간 측정이나 사용성 연구 결과가 아니다.

번역문 편집 표면은 기본 글자색에 맞는 밝고 어두운 문서 배경을 사용하고, 읽을 수 있는 글자에는 불필요한 개별 대비 배경을 칠하지 않는다. 혼합 글자색에서 대비가 부족한 경우에만 보조 대비 처리를 유지한다. 실제 서식 마크업과 캔버스/출력 효과는 변경하지 않는다.

최종 production QA 캡처:

- 400px 패널: `C:/tmp/claude-format-redesign-wide400-range-2.png` (배치 측정, 입력 표면 개선 전).
- 300px 패널: `C:/tmp/claude-format-redesign-rail300-range.png` (배치 측정, 입력 표면 개선 전).
- 색상 팝업과 문자 선택 유지: `C:/tmp/claude-format-final-wide400-color-popup.png`, `C:/tmp/claude-format-final-rail300-color-popup.png`.
- 어두운 글자와 외곽선: `C:/tmp/claude-format-final-wide400-dark-ink-outlined.png`.
- 밝은 글자와 외곽선: `C:/tmp/claude-format-final-wide400-light-ink-outlined.png`.
- 여러 블록과 혼합 서식: `C:/tmp/claude-format-redesign-wide400-multi.png`.
- 접힌 활성 효과: `C:/tmp/claude-format-redesign-rail300-effects-folded.png`.

실제 CSS zoom=2 검사는 `C:/tmp/format-final-scale200.png`에 보존했다. `claude-format-redesign-zoom200-block.png`은 CSS viewport를800×450으로 줄인 시험이며 실제 배율 변경과 구별한다. 최종 표면 변경 후 확대 검증 결과는 최종 QA 기록을 따른다. 캡처는 보존하고 임시 QA 소스만 제거한다. 실제 편집자 대상 사용성 연구를 수행했다고 주장하지 않는다.

초기 QA의 색상 팝업 열기 스크립트는 React StrictMode에서 타이머를 중복 예약해 두 번 토글했다. 최종 QA는 정리되는 타이머로 이를 수정했다. 이와 별개로 발견한 실제 선택 소실은 컨트롤 포커스 전환 중 DOM을 교체한 뒤 native Range를 복원하고, 포커스가 다른 컨트롤에 있을 때는 저장된 선택을 권위로 사용하여 수정했다. 실제 브라우저 캡처와 독립적인 포커스 회귀 검사로 확인한다.

예전 부분 서식 전용 컴포넌트4개는 제거했다. 새 소유자들의 coverage floor는 측정값으로 추가한다. 기존 기준을 낮추지 않고, 숫자 컨트롤로 옮긴 두 wrapper의 분기 기준은 실제 공용 소유자에 연결한다.

추가 회귀 검사는 코드 모드의 명시적 굵게 on/off 및 복합 속성, 커서 이동 시 대기 서식 해제, 한국어 composition 완료와 중복 input, 실제 코드 전체 선택, 같은 블록 재선택과 다른 블록 전환, 혼합 광선의 개별 속성 보존, 포커스 중 실행 취소 반영을 포함한다. 코드 편집은 시각 편집과 동일한 safe-markup 파서 및 문자 스타일 적용을 사용한다. 서식만 바뀐 마크업은 텍스트 입력과 다른 style history 키로 합쳐져 연속 조작을 복원할 수 있다.

2026-10-21 최종 `npm run check`는 536.83초에 통과했다. 테스트 파일 1,432개 통과·1개 생략, 테스트 11,234개 통과·9개 생략이다. 타입 검사, 린트, 아키텍처, 기존 커버리지 하한, 실제 빌드, artwork parity, 이미지 프로토콜 smoke 및 renderer/preload 번들 검사를 모두 포함한다. 로그는 `.tmp/format-complete-check9.log`와 `.tmp/check-logs/`에 보존한다. 별도 `npm run build`도 통과했고 로그는 `.tmp/format-final-build2.log`에 있다. 마지막 줄바꿈 순회 정리 후 빌드는 위 전체 검사에서 다시 수행했다.

이전 전체 실행은 대용량 보관함 복원 테스트의 15초 제한 초과로 실패했다. 해당 테스트는 단독 실행에서 2개 모두 통과했고, 최종 전체 검사는 저장소가 지원하는 `MGT_VITEST_MAX_WORKERS=8`로 동시 부하를 줄여 재실행했다. 테스트 시간 제한이나 커버리지 하한은 낮추지 않았다. 빈 문단의 부분 행간 회귀 검사를 추가하고, 내부에서 생성하는 밀집 문자 배열은 직접 entries 순회하여 불가능한 빈 항목 방어 분기를 제거했다. 관련 40개 줄바꿈·배치 테스트와 최종 전체 검사로 동작을 확인했다.

## 편집 관례의 근거

선택 및 삽입점의 차이는 [Adobe 서식 적용 범위](https://helpx.adobe.com/indesign/desktop/format-and-style-text/composition-and-text-wrapping/apply-and-manage-text-formatting.html)를 따른다. 선택 후 같은 행간 입력란을 사용하는 순서는 [Photoshop 간격 조절](https://helpx.adobe.com/photoshop/desktop/text-typography/characters-glyphs/adjust-line-and-character-spacing.html), 한 줄의 최대 유효 행간은 [InDesign 행간 규칙](https://helpx.adobe.com/indesign/desktop/format-and-style-text/character-formatting/adjust-line-spacing-with-leading.html)을 기준으로 한다.

비율 표시는 [CLIP STUDIO 만화 텍스트 가이드](https://tips.clip-studio.com/en-us/articles/851)를 참고했다. 가까운 문자 속성 배치는 [Figma 텍스트 속성](https://help.figma.com/hc/en-us/articles/360039956634-Explore-text-properties)의 관례를 참고한다. 출력 줄 선택 보조 명령은 패널 입력창과 캔버스의 줄바꿈 차이를 보완하기 위한 앱 전용 기능이다.

추가 UX 판단 근거는 [Photoshop 문자 패널](https://helpx.adobe.com/photoshop/using/formatting-characters.html), [CLIP STUDIO 기본·상세 설정](https://help.clip-studio.com/en-us/manual_en/480_text/Text_settings.htm), [Affinity 문자 패널](https://affinity.help/publisher2/en-US.lproj/pages/Panels/characterPanel.html), [NN/g 점진적 노출](https://www.nngroup.com/articles/progressive-disclosure/)이다. 기능을 삭제하기보다 자주 쓰는 속성을 먼저 보이고 상세 기능의 진입점을 명확하게 두는 판단에 사용했다. 제품마다 다른 서식 적용 의미를 임의로 섞지 않았다.

진단은 독립된 두 검토로 수행했다. 화면·코드 검토와 22개 TSX에 대한 정적 detector는 서로의 결과를 보지 않았다. detector는 0건이었으나 작업 흐름 문제가 없다는 뜻으로 해석하지 않았다. 기존 캡처 검토 당시 live browser overlay는 수행하지 않았고, 최종 구현은 저장소의 실제 Chromium QA로 검증했다. 상세 검토 기록은 `.tmp/format-ui-critique-20261021.md`, Claude의 수용·기각 판단은 `.tmp/claude-format-redesign-review.md`에 있다.

## 호환과 복구

기존 문서는 마이그레이션 없이 열 수 있다. 새 부분 간격이나 그림자가 있는 문서를 이 기능 이전 앱에서 저장하면 해당 태그를 해석하지 못할 수 있으므로 이전 앱으로 되돌리기 전 원본 문서 백업을 유지한다. 기능을 되돌릴 때 사용자 library, 원본과 출력물을 정리하지 않는다. 새 서식을 제거하려면 현재 버전의 서식 제거 기능으로 일반 텍스트를 만들거나 해당 속성을 전체에 다시 지정한다.

## 선택한 문자에만 적용하는 그림자

그림자 사용·색·X/Y 위치·블러·불투명도는 문자 효과의 같은 선택 범위를 따른다. 실제 Claude Code가 그림자 컨트롤을 문자 효과에 연결하고 기존 블록 설정의 중복 컨트롤을 제거했다. 선택한 한 글자나 단어에만 적용할 수 있고, 삽입점에서는 이후 입력할 문자에 적용한다. `[shadow-enabled=false]`는 상속된 블록 그림자를 선택 부분에서만 끄는 명시적 덮어쓰기다. 다른 그림자 값은 유지하므로 다시 켤 수 있다.

`richTextShadow.ts`가 기본값 상속과 속성 매핑을 소유한다. 색, 위치, 흐림, 불투명도는 기존 그림자의 허용 범위를 사용한다. 전체 문자 속성 변경은 해당 속성의 부분 덮어쓰기만 정리한다. 여러 블록을 편집할 때는 창 간 명령에 변경한 그림자 필드 목록을 포함하고 각 블록에서 개별 해석하므로 다른 블록의 색이나 흐림을 첫 블록 값으로 바꾸지 않는다. 필드 목록은 명령 메타데이터이며 문서에는 저장하지 않는다.

부분 그림자가 없는 기존 문서는 종전의 합성 후 drop-shadow를 유지한다. 부분 그림자가 있으면 공통 artwork 렌더러의 별도 그림자 평면을 외곽선·글자 앞에 그려 중복을 방지한다. 선택하지 않은 문자는 블록 기본값을 상속한다. 가로·세로쓰기와 곡선에 같은 속성을 전달하며, 회전·왜곡·이미지 출력은 기존 공통 렌더러를 사용한다. PSD의 편집 가능한 단일 스타일에 표현할 수 없는 부분 간격·그림자는 이미지 레이어를 보존한다.

실제 선택한 `절대로`에만 그림자를 켜고 X 위치를 바꾼 production 캡처:

- 400px 패널: `C:/tmp/format-shadow-verified-wide.png`
- 실제 300px 패널: `C:/tmp/format-shadow-verified-narrow.png`
- 실제 CSS zoom 2, 내부 스크롤: `C:/tmp/format-shadow-verified-zoom2.png`

초기 좁은 화면 캡처는 앱의 플로팅 패널 규칙 때문에 실제 패널 폭이 400px였다. 위 최종 캡처는 QA 컨테이너 폭을 300px로 고정해 확인했다. 확대 캡처도 뷰포트 축소를 대신 쓰지 않고 CSS zoom과 그에 맞춘 컨테이너 높이로 검증했다. 원문·출력물은 건드리지 않았으며 임시 QA 엔트리는 제거하고 캡처는 보존했다.

그림자 추가 전 기존 markup·effect·artwork·curve 33개 characterization 테스트를 통과했다. 새 테스트는 명시적 off, 저장/재열기, DOM 편집, 삽입점, 코드 편집, 혼합값, 여러 블록과 별도 창 명령, 곡선과 PSD fallback을 포함한다. 새 shared shadow 소유자의 첫 focused coverage는 네 지표 모두 100%이며 `.tmp/shadow-coverage/coverage-summary.json`에 기록했다. 기존 커버리지 하한은 낮추지 않았다.
