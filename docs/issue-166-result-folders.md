# Issue 166: 기본 결과 폴더 제목 동기화

## 사용자 동작

- 작품·화 이름 변경창의 **결과 폴더도 함께 변경**은 기본 체크 상태다.
  체크하면 등록된 기본 결과 폴더도 현재 제목으로 변경하며, 해제하면 제목만 저장하고
  폴더는 현재 위치에 둔다. 선택은 해당 이름 변경에만 적용하고 다음 창은 다시 체크 상태로 연다.
- 현재 화의 결과 영역과 보관함의 작품·화 메뉴에서 결과 열기와 폴더 정리를 끝낸다.
- 수동 명령 이름은 **제목에 맞춰 폴더 이름 변경**이다. 전체 명령은 **모든 결과 폴더 이름을 제목에 맞춰 변경**이다.
- 작품 메뉴는 해당 작품, 화 메뉴는 해당 화만 정리한다. 전체 정리는 별도의 전체 명령이다.
  사용자 지정 위치는 정리에서 제외한다.
- 이름 충돌은 기존 폴더에 병합하지 않고 `(2)` 등 빈 새 경로로 분리한다.
- 완료 결과는 짧은 알림으로 표시하며 진행·실패·재시도는 해당 화에 표시한다.
- 자동 저장을 꺼도 기존 결과를 열 수 있다. 남겨 둔 이전 폴더도 해당 화에서 연다.
- 이 작업에는 화 삭제나 용어·기억 보관 기능 변경이 포함되지 않는다.

## 파일 보존과 복구

동선 기준은 [NN/g의 작업 대상에 맞는 메뉴](https://www.nngroup.com/articles/contextual-menus/)와
[기억 부담 줄이기](https://www.nngroup.com/articles/recognition-and-recall/)다.
자주 쓰는 결과 열기는 현재 화에 바로 두고, 드문 정리는 작품·화 메뉴에 둔다.
폴더 내부 구조 설명, 정상 상태의 통계 나열, 설정으로 이동해야 하는 오류 복구는 제거한다.

등록된 artifact와 복구 원본의 SHA-256을 확인한다. 추가 파일은 원래 위치에 남긴다.
등록된 파일이 외부에서 수정되었거나 누락됐으면 그 화의 이동 전체를 중단한다.
사용자 지정 경로, 공유 저장 연결, 보관함이 원본으로 참조하는 경로, 정션·심볼릭 링크는
이동하지 않는다. 임의로 옮긴 미등록 폴더는 이름으로 추측하여 합치거나 삭제하지 않는다.

새 경로를 배타적으로 예약하고 파일을 배타적 복사·해시 검증한다. 복구 문서는 기존
출력 snapshot의 내용을 유지하면서 작품·화 제목과 파일 이름만 갱신한다. registry의 원자적
교체가 commit point다. 이전 파일은 새 복사본과 이전 파일 모두 해시가 일치할 때만 제거하며
빈 디렉터리에만 비재귀 rmdir를 수행한다. 사용자 파일 때문에 남은 폴더는 결과에서 안내한다.

`linked-relocations/<uuid>.json`은 registry 교체 전에 저장된다. 교체 전 실패는 새 복사본만
되돌리고, 교체 후 중단은 다음 초기화에서 registry의 실제 경로를 확인해 마무리한다.
소유권·경로를 확인할 수 없으면 파일을 보존하며 오류를 알린다.

기본 폴더 정리는 진행 중 렌더를 배출하고, 기존 activity gate 및 metadata 직렬화를
사용한다. 반복 실행은 충돌로 할당된 접미사를 유지한다. 제목 변경은 먼저 저장되며,
파일 사용 중 등의 이유로 폴더 이동이 실패하면 해당 화에서 확인하고 재시도한다.

이동 실패와 이전 폴더 경로는 registry에 보존하며 이미지 동기화 오류와 구분한다.
사용자 수정 파일 등으로 이동이 실패한 화는 자동 출력도 중지한다. 결과 보기나 재시작으로
그 파일을 덮어쓰지 않으며, 소유권 검증을 통과한 재시도 뒤에만 출력을 재개한다.
이전 폴더 열기는 registry에 기록된 경로만 받으며 기본 결과 루트 밖 경로와 정션을 거부한다.
공개 저장 알림과 결과 보기의 큐 등록도 기존 metadata 직렬화 경계를 사용한다.

## 화면 검증 자료

실제 production `App`과 기존 공통 스타일을 임시 QA 엔트리에서 실행했다.
격리 QA 브리지에 예시 보관함·상태를 제공하고 실제 메뉴·이름 변경창·결과 영역의 이벤트를
사용했다. 사용자 보관함은 건드리지 않았다. 파일 이동·충돌·재시작 보존은 별도의
`linkedWorkspaceContext`·`linkedWorkspaceRelocation` 실제 임시 파일 통합 테스트로 검증한다.

| 화면              | 변경 전                                                        | 변경 후                                                            |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| 화 메뉴           | [before](C:/tmp/issue166-context-before-chapter-menu-wide.png) | [after](C:/tmp/issue166-context-after-label-chapter-menu-wide.png) |
| 작품 메뉴         | [before](C:/tmp/issue166-context-before-work-menu-wide.png)    | [after](C:/tmp/issue166-context-after-label-work-menu-wide.png)    |
| 실패 · 1600 × 980 | [before](C:/tmp/issue166-context-before-failure-wide.png)      | [after](C:/tmp/issue166-context-after-failure-wide.png)            |
| 실패 · 1240 × 760 | [before](C:/tmp/issue166-context-before-failure-narrow.png)    | [after](C:/tmp/issue166-context-after-failure-narrow.png)          |

[이전 폴더 열기](C:/tmp/issue166-context-after-preserved-wide.png) ·
[좁은 창 메뉴](C:/tmp/issue166-context-after-label-chapter-menu-narrow.png) ·
[재시도](C:/tmp/issue166-context-after-retry-narrow.png)

[전후 사진 모음](C:/tmp/issue166-context-before-after-v3.html) ·
[동선 검증 기록](C:/tmp/issue166-context-qa-results.json)

27개 완료 사례·137개 동선 조건을 검사했다. 작품·화 정리는 요청 ID와 범위를 확인하고
현재 화가 유지되는지 검사했다. 작품/화 제목 변경→이동 중→완료, 다른 화 결과 열기,
실패 재시도, 이전 폴더 열기, 자동 저장 중지 상태의 결과 열기를 확인했다.
좁은 화면의 메뉴는 실제 보관함 펼치기 버튼을 먼저 눌렀다. 모든 완료 사례에서
설정 열기 횟수는 0이며 외부 스크롤이 없었다. 긴 오류는 기본 두 줄로 제한하고 펼칠 수 있다.

이름 변경은 작품·화 각각 기본 체크와 해제 후 저장까지 확인했다. 해제하면 이동 상태가
발생하지 않고 기존 폴더명이 유지되며, 체크하면 이동 중→완료로 전환된다. 실제 native
회귀 테스트에서도 `false`일 때만 이동 알림이 생략되고 기존 2인자 호출·`true`·MCP·Undo는
기존 동작을 유지함을 확인했다.
[이름 변경 전](C:/tmp/issue166-rename-option-before.png) ·
[기본 체크](C:/tmp/issue166-rename-option-work-checked-wide.png) ·
[체크 해제 · 좁은 창](C:/tmp/issue166-rename-option-work-unchecked-narrow.png)

캡처 파일은 보존하고 임시 QA 엔트리는 완료 후 제거한다.

작품·화의 ⋯ 메뉴는 시각적 툴팁을 표시하지 않는다. 접근성 이름과 키보드 포커스는
유지한다. 실제 이름 변경 후 메뉴 버튼에 포커스가 돌아오는 동선을 다시 확인했다.
[제거 전](C:/tmp/issue166-rename-option-work-title-only-wide.png) ·
[제거 후 · 넓은 창](C:/tmp/issue166-no-menu-tooltip-wide.png) ·
[제거 후 · 좁은 창](C:/tmp/issue166-no-menu-tooltip-narrow-v2.png)
