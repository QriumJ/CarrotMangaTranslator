# 페이지 순서·이름 편집기

## 사용자 흐름

페이지 헤더의 `+` 옆 `페이지 편집` 아이콘 또는 같은 앱 명령으로 현재 화 전체를 연다.
필터 결과 대신 chapter snapshot 전체를 사용한다. 썸네일 표에서 개별 이름을 직접 바꾸거나
순서 변경·이름 변경 설정을 펼친다. 확장자는 읽기 전용이다.

- 선택: 공용 범위 선택 계약, Shift 기준 상태 적용, Ctrl/Command 단일 토글,
  전체·해제·반전·범위 입력.
- 순서: 선택 묶음 드래그와 삽입선, 가장자리 자동 스크롤(dnd-kit), 위·아래·맨 앞·맨 뒤·
  기준 페이지 앞·뒤. 자연 정렬과 뒤집기는 전체 또는 선택된 자리 안에서만 적용한다.
- 이름: 번호, 문자 치환·추가·삭제, 줄 단위 목록, 작품·화·기존 이름·번호 버튼 조합.
  공백·영문 대소문자·기존 숫자 자릿수·정규식은 `공백·대소문자·숫자 정리`에서 활성화한다.
- 정규식은 독립 worker에서 실행하며 1.5초 후 종료한다. 목록 길이 불일치는 오류다.
- 입력 즉시 검증하고 한 셀의 연속 입력은 하나의 실행 취소 단계다. 일괄 작업도 각각 한 단계다.
  저장 전까지 초안이며 닫기/다시 불러오기로 버릴 때 확인한다.

## 데이터와 출력 계약

`pageOrganization.ts`의 요청은 화 ID, 이름·순서·페이지 목록의 revision, 전체 pageIds,
변경한 baseName 목록이다. 이미지/번역 내용은 revision 대상이 아니므로 별도 내용 저장 후에도
메타데이터 저장이 가능하다. renderer는 저장 전 현재 페이지의 dirty 내용을 먼저 저장한다.

`pageOrganizationFacade`는 기존 library mutation lock과 chapter structure/page content 활동
자원을 사용한다. store는 최신 chapter를 다시 읽고 revision과 전체 ID 집합을 확인한다.
`libraryOrganization` 트랜잭션으로 이름·순서·기억의 페이지 이름/위치를 함께 게시한다.
출력 충돌 검증 실패나 stale 요청은 쓰기 전 중단되며 UI 초안은 남는다.

변경한 페이지에만 optional `outputBaseName`을 기록한다. 원본의 확장자와 sourceFileName,
imagePath, 페이지 ID 및 번역 블록은 유지한다. 공용 IPC/PageRecord schema를 통해 일반 저장·
공유 export/import에서도 필드를 보존한다. 기존 페이지는 필드 없이 기존 출력 규칙을 따른다.
이미지·PSD 이름 결정기는 명시 이름에 번호·정리·축약을 적용하지 않는다. 기존 파일 충돌 시
명시 이름의 출력을 거부한다. 자동 저장은 새 결과 경로를 사용하고 이전 결과 파일을 지우지 않는다.
원본/인페인팅 복구 경로는 유지한다. 복구 미러는 outputBaseName을 포함한다.

조직 변경 알림은 publishedMirrorRevisions를 무효화해 순서만 바꾼 경우에도 미러를 갱신한다.
시각적 revision이 같으면 이미지 재렌더링은 생략한다. 기존 page revision 알고리즘은 바꾸지 않는다.

## 검증

- `pageEditorOperations`, `pageEditorUi`, `pageEditorRenameWorker`: 선택·범위·자연 정렬·
  묶음 이동·이름 조합·Unicode·오류·worker 종료·실행 취소·저장 실패 초안 유지.
- `pageOrganizationAction`: 현재 페이지 저장 순서, 화 전환/저장 실패 시 요청 차단.
- `pageOrganizationMutation`: 원자적 저장, 기억 보정, stale/목록/충돌 거부, 재시작과 원본 보존.
- `pageImageExport`의 `pageOrganizationExport.cases`: 실제 PNG/PSD 결과 이름과 기존 파일 충돌.
- `linkedWorkspaceSyncService`의 `pageOrganizationLinked.cases`: 이전 결과 보존,
  새 결과 이름, 복구 메타데이터, 순서 변경만 있을 때 렌더 생략, 외부 파일 충돌.
- `shareExportCompletionRepair`: 공유/복원 메타데이터의 명시 출력 이름 보존.

실제 production PageEditorModal과 공용 스타일에 300페이지, 긴 일본어 이름, 다중 선택,
이름 오류, 펼친 번호 설정을 넣고 검증했다. 외부 스크롤·가로 넘침·겹침이 없고 설정과 표는
각각 내부 스크롤을 사용한다. QA 엔트리는 제거했고 이미지는 보존했다.

- `C:/tmp/page-editor-wide-final.png` (1600×980)
- `C:/tmp/page-editor-narrow-final.png` (1240×760)

출시 버전 변경/태그/릴리스는 이 작업 범위에 포함하지 않는다.

## 최종 실행 기록 (2026-10-01)

- `npm run check`: 26단계 전부 통과 (`.tmp/page-editor-check-final.log`).
- 테스트: 10,035개 통과, 기존 skip 8개, 실패 0개.
- TypeScript, lint, architecture, 중복/접근성 primitive 정책, build, artwork parity,
  image protocol smoke, renderer/preload bundle 검증 통과.
- Impeccable detector: 지적 0건 (`.tmp/page-editor-design-detect.json`).
- 새 소스 18개의 coverage floor는 마지막 전체 실행의 실측값으로 등록했다.
  기존 기록은 그대로 보존했다. 이번에 처음 변경된 `useLibraryReorderActions`의 기존 파일
  floor는 불변 Node 22 원본 artifact에서 가져왔다. 전체 대상은 기존 801 + 추가 1,332개다.

## 페이지 편집 버튼 무응답 수정 (2026-10-01)

`AppSessionView`의 비활성 모달 렌더링 경계가 `pageEditor`를 열린 창으로 인식하지 않아,
클릭으로 상태가 바뀌어도 `AppModals`가 다시 렌더되지 않았다. 열린 상태 판정에 추가했다.

- 실제 `PageListHeader` → 비활성 렌더링 경계 → `AppModals`/`PageEditorModal`을 연결한
  회귀 테스트로 열기·닫기·다시 열기와 필터 밖 페이지 포함을 확인한다.
- 수정 전 동일 테스트 실패: `.tmp/page-editor-button-reproduction.log`.
- 관련 24개 테스트 통과: `.tmp/page-editor-button-tests.log`.
- 실제 헤더 버튼 클릭 후 QA 캡처를 직접 열어 잘림·겹침이 없음을 확인했다.
  `C:/tmp/page-editor-button-wide.png` (1600×980),
  `C:/tmp/page-editor-button-narrow.png` (1240×760).
- 수정 후 `npm run check` 26단계와 빌드 모두 통과
  (`.tmp/page-editor-button-check.log`, 432.54초).
