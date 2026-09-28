# 실제 Codex MCP 사용 검증 — 2026-09-24/25

## 환경과 범위

- 작업 트리: `CarrotMangaTranslator-MCP-Review`, `feat/mcp-app-bridge`. 릴리스·push 없음.
- 실제 production Electron 앱, OAuth, IPC, 페이지 소유권, 저장소, 렌더러, Codex 어댑터 사용.
- 사용자 보관함과 분리한 `.tmp/mcp-live-20260924`에 일본어 원본 2개 화에서 각 3페이지를 일반 가져오기 IPC로 복사. Tachidesk 원본은 수정하지 않음.
- 작품: Rawkuma (JA)의 _Daisougen no Chiisana Ryoushu_. 일반 대사·생각·이름표·효과음·내레이션 포함.
- 실제 클라이언트: Codex CLI 0.156.1, gpt-6-astra. 앱 원문 제거·효과음도 실제 원격 Codex. 로컬 OCR·폰트 모델·인페인팅 모델은 실행하지 않음.
- 네트워크만 격리 loopback으로 치환. 실제 Tailscale Funnel 공개 인터넷 접근과 ChatGPT 웹 계정 연결은 이 검증의 성공 범위가 아님.
- native smoke의 합성 추론은 별도의 계약 검사이며 실제 이미지 생성 성공의 근거로 쓰지 않음.

## 발견하고 수정한 문제

1. **Codex OAuth 등록 거부:** ChatGPT callback만 허용하던 정책에 Codex 숫자 loopback callback을 추가. 정확한 등록 URI/포트, PKCE, scope, 상태·쿠키 검사는 유지. 실제 `codex mcp login carrot --no-browser`에서 등록→앱 숫자 코드 대조→승인→토큰 교환 성공.
2. **MCP 원문 제거에서 Codex 선택 불가:** 기존 erasure 도구에 명시적 `engine: codex`, 모델 일치, 외부 처리 동의와 이미지 권한 검사를 추가. native page-pattern job과 같은 취소·저장·복구 계약 사용. 동의 누락·모델 불일치·권한 철회 시 로컬 모델로 대체하지 않음.
3. **폰트의 실제 모양을 비교할 경로 부재:** `carrot_get_font_samples` 추가. 등록된 사용 가능 폰트 1–4개를 실제 페이지 렌더러로 그려 이미지 반환. 기존 검증된 문자 견본 알고리즘은 변경하지 않음. 임시 배경 파일 한 개만 제한적으로 디코드. 모델·다운로드·저장 편집 없음. 결과는 시각 비교 자료이며 자동 매칭 정확도 보장이 아님.
4. **이미지 삽입·효과음 적용이 자기 작업을 busy로 오인:** production composition이 native page lease를 취득한 어댑터에도 전역 busy 검사를 전달했음. 해당 소유권 범위에서는 실제 미저장 편집 검사를 전달하도록 수정. 이미지·효과음·선택 적용·식자·폰트 일괄 적용·텍스트 교환·보관된 복구 경로 점검. native smoke의 무조건 성공하던 busy fixture를 실제 작업 상태 검사로 강화해 이 결함을 재현.
5. **Codex 사용 설명 누락:** 설정 도움말을 Codex/ChatGPT 탭, 번호 단계, 현재 주소가 포함된 명령과 복사 버튼으로 구성. 실제 production 컴포넌트의 넓은/좁은 화면을 캡처해 확인.

6. **한국어 생성 이미지 검수 누락:** MCP 효과음 경로가 독립 픽셀 재판독을 건너뛰고 기대 문구 메타데이터만 확인했음. 기존 blind readback/흰색·검정 바탕 검수 알고리즘을 연결. 정답을 재판독 모델에 전달하지 않으며, 불일치 시 관측 오류를 넣어 최대 3회 생성 후 계속 틀리면 적용 후보에서 제외. reader 실패·취소·권한 변경은 저장 없이 종료. 다른 모델로 대체하지 않음. 최초 불량 ‘덜컹’ 이미지는 실제 독립 판독에서 ‘ガチャ’로 읽혀 거부됨. 재생성한 후보는 판독과 실제 화면 검사를 거쳐 적용. 이 검사는 시각 품질을 완벽하게 보장하지 않으므로 최종 페이지 확인도 유지.
7. **비활성 생성 이미지의 서식 편집 실패:** 이미지가 꺼져 일반 글자로 보이는 블록까지 제외했고, 전부 제외된 scalar 서식 요청은 잘못된 ID 오류를 반환했음. 실제 활성 이미지 여부를 기존 공용 계약으로 판정하고, 대상이 모두 제외되면 제외 사유를 반환. 비활성 이미지 원본 데이터는 그대로 보존. 회전·워프·곡선 등 실제 편집과 정확한 undo/redo 검증.

## 실제 페이지에서 확인한 내용

- 제목으로 작품·화·페이지 찾기, 모델의 직접 원문 판독, 한국어 번역, 신규 블록 생성.
- Chapter 1 첫 페이지 5개 블록의 Codex 원문 제거 완료. 둘째 페이지도 원문 제거 후 대사·외침·내레이션 구분.
- 실제 Codex가 폰트 견본 및 저장 페이지 렌더링을 보고 폰트와 줄바꿈을 여러 번 수정.
- 최초 ‘덜컹’ 생성은 호출 성공/실패 항목 0이었지만 **한국어 형태가 잘못된 시각적 실패**였다. 이를 성공으로 검수한 판단도 잘못됐으며, 위 독립 판독 연결 후 재검증했다. 새 후보는 판독 후 실제 페이지에서 확인했다. 정상 글꼴·세로쓰기·회전·원근으로 만든 대안도 보존했다.
- 효과음 undo→과거 apply request 재전송→redo. 과거 request는 되돌린 화면을 다시 덮어쓰지 않음. redo 후 PNG SHA-256이 적용 직후와 동일.
- 외부 PNG 분할 업로드→검토→이미지 삽입→undo→redo→undo 성공. 기존 native 효과음으로 정확히 복구.
- 실제 CLI 연결 끊김 후 재접속, 기존 승인 유지, OAuth refresh 성공. 작업 중 중복 실행은 busy로 거부하며 기존 job을 조회할 수 있음.
- 첫 실제 CLI 시도에서는 원문 중첩 및 이미지 저장 실패를 완료로 보고하지 않고 미완료로 구분. 수정 후 해당 경로를 재실행함.

## 증거

검증 파일은 `.tmp/mcp-live-20260924`에 보존한다. OAuth 토큰·복사된 계정 인증 파일은 결과물이나 문서에 포함하지 않는다.

- `roundtrip-result.json`: 효과음·외부 이미지 왕복 검증과 PNG hash.
- `client-first-page-final.md`, `client-complete-pages-final.md`: 실제 클라이언트의 최초 실패/진행 결과. 중간 실패 기록을 최종 성공 기록처럼 해석하지 않는다.
- `1790261295571-carrot_render_page_preview-1.png`: 원문 제거 후 최초 식자.
- `1790262173259-carrot_render_page_preview-1.png`: 견본 비교·줄바꿈 수정 후 첫 페이지.
- `1790262984117-carrot_render_page_preview-1.png`: **폐기한 초기 한글 불량 결과**. 성공 증거가 아님.
- `rejected-glyph-readback.json`: 초기 불량 이미지를 정답 없이 읽은 실제 판독.
- `readback-generation-result.json`, `1790264796412-carrot_render_page_preview-1.png`: 독립 판독을 연결한 새 생성 후보와 적용 화면.
- `transform-readable-final.png`: 생성 이미지 대신 정확한 글꼴로 식자한 대안.
- `transform-acceptance.json`, `transform-*.png`: 8개 변형의 실제 렌더링 및 정확한 undo/redo.
- `previous-chapter-final.png`, `client-previous-chapter-final.md`: 이전 화를 참고하는 모호한 자연어 요청의 실제 Codex 결과.
- `export-acceptance.json`: 실제 HTTP로 받은 PSD/ZIP의 bytes/SHA-256, 레이어 및 archive 내부 동일성.
- `original-preservation.json`: 가져온 원본 6장과 Tachidesk 원본 SHA-256 대조.
- `.tmp/mcp-ui-qa-1790263340918`: production 설정 11개 상태의 화면과 overflow 검사. Codex 넓은/좁은 화면, ChatGPT 탭, 꺼짐, 승인 대기, 진단 오류, 200% 상당 viewport 포함.

새 coverage inventory 3개 파일의 floor는 이번 전체 V8 실행에서 관측한 값으로만 추가했다. 기존 파일의 floor는 낮추지 않았다. Font sample adapter는 native 실제 실행으로 검증하며 V8 unit coverage와 구분한다.

## 최종 검증

- 전체 `npm run check`: 9,635 passed / 16 skipped / 0 failed. 타입·린트·architecture·coverage gate·build·page-artwork parity·image protocol·bundle gate 통과. 로그: `.tmp/live-check-final7.log`.
- 강화한 실제 Electron native smoke 완료: OAuth/권한철회, 기존/신규 블록·원본 좌표, 지우기 복구, 구조 split/merge/delete, 번역/서식 batch, mask/paint, 외부 PNG, 효과음, durable undo/redo, context/memory/research, 텍스트/작업파일 교환, PNG/JPEG/WebP/PSD/ZIP, output sync, composite workflow. 적대적 HTTP 808개 검사 / production 도구 119개. 추론이 필요한 smoke fixture는 합성이며 실제 모델 품질 검증과 구분. 로그: `.tmp/live-native-smoke3.log`.
- 실제 일본어 만화: 2개 화, 3개 페이지 편집. 이전 화 참조 요청에서 Codex가 저장 블록과 렌더 이미지를 직접 읽고 15개 영역의 번역·원문 제거·줄바꿈·일본어 잔상 수정을 거쳐 PNG 다운로드까지 완료.
- 실제 변형 8종: 회전·원근·워프·곡선·그림자·광선·이중 외곽선·세로쓰기. 각각 렌더가 바뀌며 undo/redo 결과 PNG SHA-256이 정확히 복원됨. 불량 이미지 비활성화 후 같은 블록에 적용.
- 실제 PSD 두 장의 1125×1600 합성과 원본/제거/문자 레이어를 파싱. ZIP의 PSD 두 개와 manifest 확인, 개별 다운로드 파일의 SHA-256과 일치.
- 한국어 시각 판독·폰트 선택은 모델의 판단이므로 성공률 100%를 보장하지 않는다. 249개 도구의 모든 조합, 모든 만화, 공개 Funnel 경로, 로컬 모델 품질을 검증했다는 뜻이 아니다. 로컬 모델은 사용자 요청대로 이번 실사용에서 제외했다.

## 자연어 변형 후속 검증

실제 Codex에 “이미지 대신 읽기 편한 한글 글자로 바꾸고 워프나 곡선, 기울기로 움직이는 느낌을 살려 줘”라고 요청했다. 작품·화·페이지를 스스로 찾고 실제 폰트 견본을 비교한 뒤 이미지 비활성화, 도현체, 4×4 워프, −14° 회전, 글자 간격 수정을 수행했다. 중간 렌더 확인 후 재수정·저장했으며 비대상 블록의 공개 필드가 요청 전후 정확히 같았다. `codex-natural-warp-final.png`, `natural-warp-acceptance.json`, `client-transform-natural-final.md`에 보존.

클라이언트가 변형 좌표를 확인하려고 불필요한 저장소 검색도 시도했으므로 도구 설명에 블록 로컬 0–1 좌표, 격자 3/5의 4×4/6×6 row-major 배열과 곡선 계약을 명시했다. 사용자에게 격자 좌표를 요구하지 않는다.

마지막 워프 식자 결과도 PNG/JPEG/WebP/PSD로 각각 내보내 실제 HTTP 링크에서 다운로드했다. 파일 크기와 SHA-256을 출력 메타데이터에 대조했고, PNG 픽셀은 최종 미리보기와, PSD 합성 픽셀은 PNG와 정확히 일치했다. `final-export-acceptance.json`, `final-warp.png/jpeg/webp/psd`에 보존. 안내 문구 보완 후 린트와 빌드도 다시 통과했다.

## ChatGPT 그림 연결 안내 후속 수정 (2026-09-25)

사용자가 제공한 화면 순서대로 플러그인 → 추가 → MCP 앱 만들기 → 이름·주소·OAuth 입력 → 앱 승인 안내를 구성했다. 설치 목록의 당근망가번역기 아이콘을 강조하고, ⋯ → 관리 → 권한 → 모든 도구 허용은 확인 없이 변경 작업도 실행될 수 있는 선택 사항으로 설명한다. 일곱 그림은 각각 크게 보기를 지원하며 기존 Codex 안내는 유지한다.

앱 만들기 그림의 실제 서버 주소는 CSS 가림이 아니라 PNG 자체에 검은 막대로 가렸다. 내장 imagegen에 “연결 URL 전체만 불투명 검정으로 덮고 나머지 화면과 글자는 보존”을 요청하고 결과를 직접 확인했다. 배포용 PNG는 픽셀만 다시 인코딩해 원본 메타데이터를 포함하지 않는다. 자산 위치는 `src/renderer/src/assets/images/mcp-chatgpt/`이며 전체 브라우저의 탭·대화 목록이 담긴 스크린샷은 포함하지 않았다.

- `tests/mcpDesktopUi.test.tsx`: 14개 통과. 기존 Codex 명령 복사, ChatGPT 전환, 그림 확대·Escape 닫기 포함.
- 타입 검사·변경 파일 린트·CSS 구조·maintainability·architecture budget·빌드 통과. 안내 컴포넌트의 기존 coverage floor를 낮추지 않았으며 측정값은 모든 항목에서 기존 이상이다.
- `node scripts/mcp-ui-qa.cjs --chatgpt-only`: 실제 production 컴포넌트로 넓은/좁은 화면과 확대 보기 8개 캡처 및 이미지 로드·가로 넘침·대화상자 경계 검사 통과. `.tmp/mcp-ui-qa-1790304342441/`에 보존. 강조 테두리의 옆 아이콘 침범을 첫 검토에서 수정한 뒤 재확인했다.
- 위 전체 MCP 인수 검사와 별도로 수행한 도움말 UI 후속 검사이며, 새로운 외부 계정 연결이나 로컬 모델 실행은 하지 않았다.

사용자가 추가 제공한 관리 메뉴와 권한 항목 스크린샷은 4번의 설치된 플러그인 그림 다음에 순서대로 추가했다. `--permissions-only` QA로 넓은/좁은 화면을 확인했으며 `.tmp/mcp-ui-qa-1790304567176/chatgpt-manage-wide.png`, `chatgpt-manage-narrow.png`에 보존했다. UI 테스트는 전체 일곱 이미지의 안내 순서도 검사한다.
