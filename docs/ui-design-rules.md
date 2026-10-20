# UI 설계 규칙

앱 전체의 통일성이 최우선이다. 변경 전 공통 규칙과 전체 사용처를 확인하고,
변경 후 가져오기·출력·사이드바·편집 도구·설정·작업 상태를 함께 검증한다.
화면별 임의 팔레트나 선택 표시 예외를 추가하지 않는다.

## 2026-10-20 작업 진입과 적용 범위

- 작품·화의 작업은 해당 항목의 `ActionMenu`에서 시작한다. 이름 변경창에 삭제나
  다중 선택 진입을 넣지 않는다. 다중 선택은 작품 목록 안에서 하고, 대상·개수와
  실행·취소 버튼은 스크롤 중에도 남긴다. 파괴적 실행 직전에 삭제 범위를 확인한다.
- 작품 용어집은 작품 ID가 권위다. 열린 화가 없어도 열고 저장할 수 있다. 화 메모리와
  화 분석은 실제 해당 작품의 화가 있을 때만 제공한다. 메뉴·빠른 도구·명령 팔레트는
  `open-work-context` 명령과 `buildWorkContextCommand`를 공유한다.
- 설정 초안의 저장·취소와 즉시 적용되는 파일·연결 관리를 구분한다. 즉시 적용 페이지도
  다른 탭에 미저장 초안이 있으면 저장·취소를 유지한다. 폰트 파일 관리에서 돌아와도
  즐겨찾기·숨김·정렬 초안을 보존한다.
- 가져오기 검토와 조사 결과는 기존 편집창을 대체한다. 초안은 모델에 유지하고, 검토를
  취소하면 원래 편집 작업으로 돌아온다. 동일 작업을 위한 모달을 겹쳐 놓지 않는다.
- 설명은 짧은 필수 정보, 보충 툴팁, 접힌 도움말로 나눈다. 삭제 결과·권한 승인 범위·
  복구할 수 있는 오류는 툴팁에만 숨기지 않는다. 실행 실패 메시지는 사용자가 닫을 수
  있을 때까지 유지한다.
- 수직 도구 모음은 Tab 진입점 하나와 위/아래·Home·End 탐색을 제공한다. 탐색으로
  명령을 실행하지 않는다. 메뉴 위치 계산은 `useAnchoredMenuPosition`을 공유하고,
  포털 메뉴는 모달 위의 기존 `--layer-select-menu` 계층을 사용한다.

검증: `uxNavigation`, `customSelect`, `popupPrimitives`, `settingsModalSafety`,
`fontManagerModal`, `chapterBulkDeleteModal`, `styleGuideFileExchange`, `styleGuideReset`.
이번 비교 자료는 23개 기본 화면과 18개 추가 상태를 1600×980 및 1240×760에서
production component와 격리 QA 브리지로 캡처했다. 외부 계정의 실서비스 인증 테스트와
구분한다. 로컬 전달물은 `C:/tmp/carrot-ux-before-after-2026-10-20.html` 및 같은 폴더의
`carrot-ux-comparison-manifest.json`이며, 원본 PNG 경로·크기·SHA-256을 기록한다.

## 2026-09-29 컨트롤과 색상 정리

일반 컨트롤 188곳은 공용 primitive를 직접 사용한다. `Button variant="bare"`는 버튼 하나와
기존 자식 구조를 유지하고 기본 type 생략도 보존한다. `Input`/`Textarea`는 native ref, IME,
선택, validation, controlled/uncontrolled 동작을 유지하며 레이블과 레이아웃은 기존 소유자가
담당한다. 파일 단위 wrapper나 별도 barrel로 정책 검사를 우회하지 않는다.

2026-10-13 사용자 요청으로 기존 화면별 색상 모음을 단일 팔레트로 통합했다.
`styles/palette.css`의 `--palette-*`만 색상 원시값을 정의한다. 중립 회색 계열,
당근색 선택·활성·주요 동작, 진행·정보용 청색, 완료용 녹색, 주의용 황갈색과
오류용 적색을 사용한다. 같은 역할은 모든 화면에서 동일한 semantic token과
강조 방식으로 표시한다. 선택·활성·포커스의 색을 제거하지 않는다. 불필요한 카드
외피를 제거하는 것과 선택 상태의 시인성을 낮추는 것은 구분한다. `foundations.css`의 공통 역할과 palette의 component
역할은 이 팔레트를 참조한다. 새 화면별 색상 값을 추가하지 않는다.
`check:css-structure`가 원시 색상 정의 위치를 검사하며 기존 maintainability 검사는
feature와 primitive에서 색상 리터럴 추가를 막는다. 사용자 지정 그림·출력색은
데이터이므로 UI 팔레트로 치환하지 않는다. 캔버스 보조 표시도 팔레트 토큰을 사용한다.

유지하는 raw native 입력은 다음 여섯 JSX 위치뿐이다. 주석 속 `<input>` 예제는 AST 기반
검사에서 컨트롤로 세지 않는다. 각 입력의 OS 기능을 wrapper로 숨겨 숫자를 줄이지 않는다.

| 파일                                             | 입력과 유지 이유                    | 검증                                                       |
| ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------- |
| `ColorField.tsx`                                 | OS color chooser와 별도 HEX draft   | `editorColorSwap`, 서식·gather 테스트                      |
| `ConditionalBatchConditionValueEditor.tsx`       | 조건의 정확한 native 색상 값        | `conditionalBatchEditor`, 조건 값 테스트                   |
| `gatherText/GatherTextDirectDetailControls.tsx`  | 혼합 선택 서식의 색상 chooser       | `gatherTextDirectFormatModal`, `gatherTextFormatSelection` |
| `inpaintingPanel/RetouchInpaintingStep.tsx`      | 브러시 native 색상 선택             | retouch UI·geometry 테스트, 실제 화면 QA                   |
| `settingsModal/FormatDefaultsDetailSections.tsx` | 기본 서식 색상 chooser              | `formatDefaultsPanel`, preset 복원 테스트                  |
| `gatherText/GatherTextFileInputs.tsx`            | OS 파일 선택, 취소·같은 파일 재선택 | gather import·modal 테스트                                 |

이 문서는 현재 다크 팔레트와 좌·중앙·우 레이아웃, 기능의 진입 위치를 유지하면서 UI를 일관되게 다듬기 위한 구현 기준이다. 실제 코드와 정적 게이트가 규칙의 권위이며, 예외는 사유·소유 범위·행동 테스트를 같이 남긴다.

## 표면 계층

동일한 시각 평면에는 표면을 하나만 사용한다.

```text
앱 shell
├─ 좌측 rail
├─ workspace/canvas
└─ 우측 rail
   └─ section: 여백 + 제목 + divider
      └─ control/selection item

중첩 계층: modal / popover / menu / tooltip
```

- rail은 이미 표면이다. rail 안의 일반 그룹에 배경, 둥근 테두리, 그림자를 다시 추가하지 않는다.
- 그룹은 `Section`, `SectionHeader`, `CollapsibleSection`의 여백·타이포·divider로 나눈다.
- inset 표면은 코드, 로그, 이미지 미리보기, 캔버스처럼 실제로 다른 작업 공간일 때만 사용한다.
- 그림자와 elevation은 다른 콘텐츠 위에 겹쳐 뜨는 modal, popover, menu에만 사용한다. 같은 평면의 tile은 elevation을 사용하지 않는다.
- 하나의 활성 작업 범위에 high-emphasis primary action은 하나만 둔다. 나머지 행동은 secondary, ghost, danger로 의미를 분리한다.

이 원칙은 카드를 단순 장식용 테두리로 쓰지 말라는 [USWDS Card 지침](https://designsystem.digital.gov/components/card/), 같은 평면의 tile에 elevation을 주지 않는 [Carbon Tile 지침](https://carbondesignsystem.com/components/tile/usage/), 하나의 범위에 primary button을 하나만 두는 [Carbon Button 지침](https://carbondesignsystem.com/components/button/usage/)를 이 앱의 구조에 맞게 적용한 것이다.

## primitive 선택표

| 의도                       | 사용할 primitive                                 | 사용하지 말 것                        |
| -------------------------- | ------------------------------------------------ | ------------------------------------- |
| 즉시 행동                  | `Button`, `IconButton`                           | feature의 raw `<button>`              |
| 텍스트·숫자 입력           | `Field`, `NumberField`                           | 레이블없는 raw `<input>`              |
| 한 항목 선택               | `Select`, `SegmentedControl`                     | 임의 드롭다운, clickable `div`        |
| 독립 boolean               | `CheckboxField`                                  | 스타일이 서로 다른 raw checkbox       |
| 뷰 전환                    | `Tabs`                                           | 키보드 규칙이 없는 버튼 묶음          |
| 일반 그룹                  | `Section`, `SectionHeader`, `CollapsibleSection` | generic `Card`, 표면 안의 동일 표면   |
| 선택·실행 가능한 반복 항목 | `SelectionSurface`                               | 장식 목적의 selectable card           |
| 앱 위 다이얼로그           | `Modal`                                          | feature 전용 focus trap               |
| anchored popup             | `usePopupController` + 공용 menu/popover         | 각 component의 별도 document listener |

새 primitive를 만들기 전에 component 이름과 의도의 동의어를 `rg`로 검색한다. 모양이 비슷하다는 이유로 합치지 않고, 소유 도메인, 입력·출력, 오류 정책, 변경 이유가 모두 같을 때만 공용화한다.

## 접근성과 상호작용 계약

- 포인터 대상은 최소 24×24 CSS px을 확보한다. 예외가 필요하면 [WCAG 2.2 Target Size](https://www.w3.org/TR/WCAG22/#target-size-minimum)의 간격·동등 대상 조건을 만족해야 한다.
- 키보드 focus는 항상 보여야 하고, sticky 헤더나 overlay에 완전히 가려지지 않아야 하며, DOM과 시각 순서를 일치시킨다.
- Modal은 열릴 때 내부의 적절한 요소로 focus를 옮기고, Tab을 내부에 가두며, Escape로 닫고, 닫힌 후 호출 요소로 focus를 복원한다.
- Menu는 화살표·Home·End·Escape 조작과 focus 복원을 지원한다. Tab은 메뉴 항목 순환용으로 변질시키지 않는다.
- Tabs는 `tablist`/`tab`/`tabpanel`, 화살표 이동, Home/End, 선택과 focus 상태를 일관되게 구현한다.
- Combobox는 입력 focus를 유지하는동안 popup option을 키보드로 탐색하고, Escape로 popup을 닫으며, 표준 텍스트 편집 키를 가로채지 않는다.

위 패턴의 role·키보드·focus 계약은 [WAI-ARIA APG Modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [Menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/), [Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)를 따른다.

## 레이아웃과 스크롤 소유권

- 앱 shell은 `100vh` 범위를 넘지 않고 page/body 스크롤을 만들지 않는다. 좌·우 rail이 필요한 스크롤을 소유한다.
- editor의 sticky chrome은 고정하고 `.editor-panel-body`만 세로로 스크롤한다. rail과 editor body에 동시에 외부·내부 스크롤바가 보이지 않게 한다.
- scroll container의 grid/flex 조상은 `min-height: 0`을 갖고, 가로 넘침은 해당 container에서 차단한다.
- 접힌 section은 본문과 내부 여백을 layout에서 제거한다. 본문이 없는 유령 표면을 남기지 않는다.
- 200% zoom, 1240×760, 긴 번역문에서도 page scrollWidth/scrollHeight가 viewport를 넘지 않아야 한다. 필요한 콘텐츠는 소유 container 안에서만 스크롤한다.

## CSS 소유권

- 전역 CSS는 foundations, app shell, 캔버스 paint order처럼 여러 component가 공유하는 경계만 소유한다. feature 스타일은 CSS Module을 사용한다.
- UI chrome의 색상, 그림자, z-index는 `foundations.css`·`palette.css`의 semantic token을 사용한다. 캔버스 표시색, 이미지 출력색, 네이티브 특수 입력만 명시적 허용 목록으로 분리한다.
- feature 전용 selector가 전역으로 누출되거나 다른 feature의 DOM 구조에 의존하지 않는다.
- 기존 허용 목록은 제거 대상이지 새 코드의 예시가 아니다. `npm run check:maintainability`는 raw control, 색상/z-index, cross-feature selector, 파일 단위 lint disable의 신규 증가를 실패시킨다.

## Do / Don't

| Do                                                                 | Don't                                          |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| rail 안의 그룹을 제목·여백·divider로 구분                          | panel → card → inset card로 표면 중첩          |
| 표시 이름은 하나만 두고 icon button에 정확한 `aria-label` 제공     | 같은 범위의 이름을 제목과 toolbar에 반복       |
| 같은 명령은 command map의 이름·실행 함수 공유                      | sidebar·빈 화면·palette에 실행 로직 복제       |
| 기본·오류·disabled·focus·긴 텍스트 상태를 primitive에서 해결       | feature별로 hover/focus/disabled 스타일 재구현 |
| 내부 scroll owner를 하나로 정하고 page overflow assertion으로 검증 | body와 rail, panel body에 중첩 스크롤 방치     |

## 실제 적용 예시

기존 서식 패널은 rail 안에 테두리와 우측 스크롤을 다시 쌓았다.

![기존 서식 패널의 중첩 표면](images/readme-guide/19-editor-format.png)

현재 서식 패널은 rail을 단일 표면으로 사용하고, 그룹은 divider와 여백으로 나누며, 고정 chrome와 본문 scroll owner를 분리한다.

![넓은 화면의 현재 서식 패널](images/ui-refactor-format-wide.png)

![좁은 화면의 현재 서식 패널](images/ui-refactor-format-narrow.png)

## UI 변경 완료 조건

1. 실제 production component와 stylesheet를 import한다. 정적 HTML 복제는 QA 근거가 아니다.
2. 최소 1600×980과 1240×760을 캡처하고 두 PNG를 열어 확인한다.
3. 한국어·영어·일본어, 긴 텍스트, 200% zoom, popup/modal, focus-visible, disabled 상태 중 변경 범위에 해당하는 것을 검증한다.
4. `documentElement`/`body`의 외부 overflow, 잘림, 겹침, 가로 overflow, 불필요한 중첩 표면이 없어야 한다.
5. focused test, architecture/duplicate/UI policy gate, `npm run check`, build를 통과한다.
6. 회전 표시의 고리와 회전 호는 서로 구분되어야 한다. 팔레트를 변경할 때 두 색을 같은 토큰으로 합치지 않는다. 애니메이션은 정적 캡처뿐 아니라 실제 production element의 시간 경과에 따른 회전값과 재생 상태도 확인한다.

## 큰 UI 변경 전 기준 확인

2026-10-13에 다음 공식 문서를 읽고 적용 기준을 확인했다. 타 제품의 외관을 복제하지 않고
이 앱의 기존 당근색 강조, 정보 밀도, 작업 흐름에 원칙을 적용한다.

- [Fluent tokens](https://fluent2.microsoft.design/design-tokens): 원시 팔레트와 의미별 alias를 분리한다.
- [Fluent color](https://fluent2.microsoft.design/color): 상태색은 의미 전달에만 쓰고 같은 의미는 같은 색으로 표시한다.
- [Carbon color/states](https://www.carbondesignsystem.com/building-blocks/foundations/color/overview): 기본·hover·선택·focus·disabled 역할을 분리하고 모든 사용처가 공유한다.
- [Spectrum color](https://spectrum.adobe.com/page/using-color/): 화면별 임의 색을 만들지 않고 색의 의미를 레이블/아이콘과 함께 전달한다.
- [Spectrum component spacing](https://spectrum.adobe.com/foundations/layout-and-structure/spacing/component-spacing): 같은 구조의 컴포넌트는 공통 밀도와 내부 간격 기준을 사용한다.
- [Fluent layout](https://fluent2.microsoft.design/layout): 숫자만 일괄 적용하지 않고 정렬과 요소 간 관계가 일관되는지 확인한다.
- [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): 선택·포커스·체크 등 필수 표시가 인접 배경과 충분히 구분되어야 한다.
- [Carbon tooltip](https://www.carbondesignsystem.com/building-blocks/core/components/tooltip/guidelines): 보조 설명을 툴팁에 두되 오류와 작업에 필수적인 정보는 짧게 보이게 한다.

검증은 개별 스크린샷 하나로 끝내지 않는다. 공통 팔레트의 참조/순환 검사, 대비 측정,
같은 역할의 공통 token 사용 확인과 함께 실제 production component를 사용한 넓은/좁은
가져오기·출력·사이드바/편집 도구·설정·작업 기록을 확인한다.
