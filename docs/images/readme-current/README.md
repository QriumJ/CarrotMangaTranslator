# README UI 캡처

2026-09-30, 소스 커밋 `e387aa1a394eec64e5e64d17701cfd4ccbe28a5c`의 실제 `App`·프로덕션 컴포넌트·스타일을 저장소 `qa:ui`로 촬영했다. 앱 동작 코드는 변경하지 않았다. 총 **72장: 일반·상세 화면 59장, 좁은 화면 11장, 원고 비교 2장**이다.

## 데이터와 검증 범위

- 저장소의 완전한 QA 브리지에 문서용 작품·페이지·블록·설정·연결 상태를 주입했다. 실제 사용자 보관함·인증정보는 사용하지 않았다.
- 원고·번역·효과음 배경은 기존 공개 [예제 자산](../readme-v2712/README.md)을 재사용하고 실제 식자 렌더러로 표시했다. 모델 품질 측정 자료가 아니다.
- 일반 화면은 실제 버튼·탭·키보드 이벤트로 열었다. 직접 진입이 어려운 폰트·블록 라이브러리·서식 일괄 적용·영역 번역·가져오기 미리보기·가리기는 해당 프로덕션 컴포넌트를 예제 상태로 열었다.
- 계정·하드웨어·MCP 주소·승인 코드·백업 목록은 예시다. ChatGPT·Claude 도움말 내부 그림은 앱에 포함된 주소 비식별 처리 자산이다. 실계정 인증·Funnel 연결·모델 실행·실제 복원·다운로드를 검증한 캡처는 아니다.
- QA의 빈 화면·렌더러 오류 검사와 탐색 완료·텍스트 넘침·외부 스크롤 검사를 실행했다. 모든 최종 PNG를 직접 열어 잘림·겹침·정렬을 확인했다.
- 좁은 화면은 패널 접기·펼치기와 내부 스크롤을 사용한다. 캐릭터 표는 내부 가로 스크롤, 일괄 편집은 규칙·미리보기·결과 탭으로 전환된다. 화면 전체의 가로·세로 오버플로는 없었다.
- 재촬영 전의 빈 상태·예제 데이터 오류 캡처는 최종 자산에서 제외하고 로컬 QA 기록에 보존했다. 임시 HTML·TSX·설정 파일은 작업 후 제거했다.

## 기능별 문서 대응

| 기능            | README 설명·캡처 범위                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| 설정            | 일반, 기본 서식, 단축키, 번역 3엔진, OCR, 이미지·제거, 조사, 하드웨어, 결과물, MCP, 업데이트            |
| 원고            | 입력 방식, 여러 화 미리보기, 웹 링크, 보관함·페이지 상태                                                |
| 번역            | Hayai 단계별 작업, 기존 번역 옵션, 영역 번역, 작업 센터                                                 |
| 편집            | 텍스트·부분 서식, 배치, 원근·곡선·워프, 블록 서식, 서식 일괄 적용                                       |
| 재사용          | 기본 서식, 프리셋·단축 슬롯, 폰트 관리, 블록 라이브러리                                                 |
| 이미지          | 자동 제거, 수동 보정, 효과음 후보, 원본·식자 비교, 전송 가리기                                          |
| 문맥·검수       | 용어집·캐릭터·규칙·기억, 인터넷 조사, 조건부 일괄 편집, 모아보기·TXT·검수표                             |
| 출력·이관       | 이미지·PSD, 자동 저장, 작업 내보내기·가져오기, 환경 백업·복원                                           |
| MCP 상세 가이드 | 준비·진단, Codex, ChatGPT 등록·권한, Claude 주소·인증, Claude Code, 코드 승인, 작업·출력·권한·문제 해결 |
| 접근성 확인     | 11개 좁은 화면, 도구·패널·목록·실행 버튼 확인                                                           |

설명은 README와 [MCP 상세 가이드](../../mcp-user-guide.md)에 나누어 수록했다. 표는 기능군별 문서 범위이며 모든 입력 조합·실제 모델 실행을 테스트했다는 뜻은 아니다.

## 화면 목록

| 파일                                                           | 크기        | 상태                                                |
| -------------------------------------------------------------- | ----------- | --------------------------------------------------- |
| [backup-restore.png](backup-restore.png)                       | 1600 × 1000 | 백업 검증 후 교체 내용·기존 환경 보존 경로 확인     |
| [batch-narrow.png](batch-narrow.png)                           | 1000 × 760  | 규칙·미리보기·결과를 탭으로 전환하는 일괄 편집      |
| [batch.png](batch.png)                                         | 1600 × 1000 | 화자 조건·치환 작업과 변경 전후 미리보기            |
| [block-library-v2.png](block-library-v2.png)                   | 1600 × 1000 | 저장된 블록을 검색하고 재사용하는 라이브러리        |
| [comparison-after.png](comparison-after.png)                   | 1086 × 1448 | 한국어 대사와 쾅 효과음                             |
| [comparison-before.png](comparison-before.png)                 | 1086 × 1448 | 일본어 예제 원고                                    |
| [context-characters-narrow.png](context-characters-narrow.png) | 1000 × 760  | 캐릭터 표의 내부 가로 스크롤                        |
| [context-characters.png](context-characters.png)               | 1600 × 1000 | 인물 이름과 말투                                    |
| [context-glossary.png](context-glossary.png)                   | 1600 × 1000 | 용어의 원문·번역·분류·별칭·사용 여부                |
| [context-memory.png](context-memory.png)                       | 1600 × 1000 | 페이지 장면 요약과 스토리 기억                      |
| [context-rules.png](context-rules.png)                         | 1600 × 1000 | 호칭·효과음·기본 톤 규칙                            |
| [editor-curve-v3.png](editor-curve-v3.png)                     | 1600 × 1000 | 곡선 변형 조절                                      |
| [editor-format-narrow-v2.png](editor-format-narrow-v2.png)     | 1000 × 760  | 좁은 창에서 검수·편집 패널을 펼친 상태              |
| [editor-format.png](editor-format.png)                         | 1600 × 1000 | 블록 전체의 서식과 간격·색상 설정                   |
| [editor-layout.png](editor-layout.png)                         | 1600 × 1000 | 위치·크기·회전과 원근·곡선·워프 탭                  |
| [editor-perspective-v3.png](editor-perspective-v3.png)         | 1600 × 1000 | 원근 변형 조절                                      |
| [editor-warp-v3.png](editor-warp-v3.png)                       | 1600 × 1000 | 워프 변형 조절                                      |
| [editor.png](editor.png)                                       | 1600 × 1000 | 선택 블록의 원문·번역문과 부분 서식 도구            |
| [erase.png](erase.png)                                         | 1600 × 1000 | 원문 제거 페이지 선택                               |
| [export-psd.png](export-psd.png)                               | 1600 × 1000 | PSD 대상 선택과 글자 제외 옵션                      |
| [export.png](export.png)                                       | 1600 × 1000 | 출력 범위·형식·저장 위치와 사전 확인                |
| [fonts.png](fonts.png)                                         | 1600 × 1000 | 폰트 등록·견본·즐겨찾기·표시 순서                   |
| [format-apply.png](format-apply.png)                           | 1600 × 1000 | 서식 일괄 적용의 항목과 범위                        |
| [gather-narrow.png](gather-narrow.png)                         | 1000 × 760  | 모아보기의 내부 세로 스크롤                         |
| [gather.png](gather.png)                                       | 1600 × 1000 | 원문과 번역문 모아보기·검색·파일 교환               |
| [import-preview.png](import-preview.png)                       | 1600 × 1000 | 여러 화의 제목·포함 여부·자동 저장 설정             |
| [import-web.png](import-web.png)                               | 1600 × 1000 | 웹 페이지 링크로 원고 가져오기                      |
| [import.png](import.png)                                       | 1600 × 1000 | 새 원본 추가의 입력 방식                            |
| [mcp-approval.png](mcp-approval.png)                           | 1600 × 1000 | 앱 이름·숫자 코드·요청 권한을 확인하는 승인 화면    |
| [mcp-chatgpt-bottom-v2.png](mcp-chatgpt-bottom-v2.png)         | 1600 × 1000 | ChatGPT 연결 도움말의 후속 단계                     |
| [mcp-chatgpt-create.png](mcp-chatgpt-create.png)               | 1600 × 1000 | ChatGPT MCP 앱의 주소·OAuth 입력                    |
| [mcp-chatgpt-permissions.png](mcp-chatgpt-permissions.png)     | 1600 × 1000 | ChatGPT 플러그인 관리와 실행 권한                   |
| [mcp-chatgpt.png](mcp-chatgpt.png)                             | 1600 × 1000 | 당근 도움말의 ChatGPT 플러그인 등록 화면            |
| [mcp-claude-address.png](mcp-claude-address.png)               | 1600 × 1000 | Claude 커스텀 커넥터 이름·주소                      |
| [mcp-claude-auth.png](mcp-claude-auth.png)                     | 1600 × 1000 | Claude 로그인·자동 등록 설정                        |
| [mcp-claude-bottom-v2.png](mcp-claude-bottom-v2.png)           | 1600 × 1000 | Claude 연결 도움말의 후속 단계                      |
| [mcp-claude-code.png](mcp-claude-code.png)                     | 1600 × 1000 | 당근 설정의 Claude Code 명령과 인증 순서            |
| [mcp-claude.png](mcp-claude.png)                               | 1600 × 1000 | 당근 도움말의 Claude 커스텀 커넥터 등록 화면        |
| [mcp-codex.png](mcp-codex.png)                                 | 1600 × 1000 | 당근 설정의 Codex 등록 명령과 승인 안내             |
| [mcp-narrow.png](mcp-narrow.png)                               | 1000 × 760  | MCP 상태·권한의 좁은 설정 창                        |
| [mcp-setup.png](mcp-setup.png)                                 | 1600 × 1000 | Tailscale 설치·PC 연결·Funnel 허용·연결 진단        |
| [mcp.png](mcp.png)                                             | 1600 × 1000 | MCP 설정과 권한                                     |
| [palette.png](palette.png)                                     | 1600 × 1000 | 기능 이름으로 찾는 명령 팔레트                      |
| [presets-v3.png](presets-v3.png)                               | 1600 × 1000 | 프리셋 목록·포함 항목·키보드 슬롯                   |
| [redaction-narrow.png](redaction-narrow.png)                   | 1000 × 760  | 가리기 캔버스·도구·검토 버튼                        |
| [redaction.png](redaction.png)                                 | 1600 × 1000 | 가리기 영역 편집과 페이지별 검토 상태               |
| [region.png](region.png)                                       | 1600 × 1000 | 지정 영역의 출력 방식·원문 지우기·엔진 선택         |
| [retouch.png](retouch.png)                                     | 1600 × 1000 | 브러시 보정과 크기·색 설정                          |
| [settings-api.png](settings-api.png)                           | 1600 × 1000 | API 연결 주소·인증·모델·재시도 설정                 |
| [settings-format.png](settings-format.png)                     | 1600 × 1000 | 기본 글꼴·크기·방향·효과와 미리보기                 |
| [settings-gemma.png](settings-gemma.png)                       | 1600 × 1000 | Gemma 모델 소스·프리셋·런타임·메모리 설정           |
| [settings-general-narrow.png](settings-general-narrow.png)     | 1000 × 760  | 일반 설정과 환경 백업                               |
| [settings-general.png](settings-general.png)                   | 1600 × 1000 | 앱 언어·휠 민감도·환경 백업 및 이관                 |
| [settings-hardware.png](settings-hardware.png)                 | 1600 × 1000 | 그래픽 GPU와 AI 연산 GPU                            |
| [settings-image.png](settings-image.png)                       | 1600 × 1000 | 원문 제거 모델·이미지 생성·전송 가리기              |
| [settings-ocr.png](settings-ocr.png)                           | 1600 × 1000 | OCR 엔진과 장치                                     |
| [settings-research.png](settings-research.png)                 | 1600 × 1000 | 인터넷 조사 키·분석 모델                            |
| [settings-results-narrow.png](settings-results-narrow.png)     | 1000 × 760  | 결과물 연결·상태 목록                               |
| [settings-results.png](settings-results.png)                   | 1600 × 1000 | 작품·화별 자동 저장 연결·형식·상태                  |
| [settings-shortcuts.png](settings-shortcuts.png)               | 1600 × 1000 | 단축키 변경과 충돌 확인                             |
| [settings-test.png](settings-test.png)                         | 1600 × 1000 | 앱 버전과 OCR·모델 확인                             |
| [settings.png](settings.png)                                   | 1600 × 1000 | 번역 엔진·언어와 Codex 로그인·모델 설정             |
| [sfx-narrow.png](sfx-narrow.png)                               | 1000 × 760  | 효과음 후보와 하단 실행 버튼                        |
| [sfx.png](sfx.png)                                             | 1600 × 1000 | 페이지별 효과음 후보와 번역·제거 옵션               |
| [share-import.png](share-import.png)                           | 1600 × 1000 | 가져올 작품과 화의 적용 방식                        |
| [share.png](share.png)                                         | 1600 × 1000 | 작품·화 선택 후 작업 파일 저장                      |
| [status.png](status.png)                                       | 1600 × 1000 | 원고 오른쪽 아래에서 여는 작업 센터                 |
| [translate-classic.png](translate-classic.png)                 | 1600 × 1000 | 기존 번역 실행의 문맥·블록·완료 처리 옵션           |
| [workflow-narrow.png](workflow-narrow.png)                     | 1000 × 760  | 페이지 작업의 내부 스크롤과 고정 실행 버튼          |
| [workflow.png](workflow.png)                                   | 1600 × 1000 | HayaiOCR 페이지 선택·작업 프리셋·실행 순서          |
| [workspace-narrow.png](workspace-narrow.png)                   | 1240 × 760  | 접힌 탐색 패널, 원고와 도구 모음                    |
| [workspace.png](workspace.png)                                 | 1600 × 1000 | 새 작업 화면: 보관함, 원고, 도구 모음과 페이지 블록 |

## 촬영 방식

임시 엔트리는 한국어 UI를 초기화하고 실제 컴포넌트와 저장소의 QA 브리지를 사용했다. 설정은 개편된 왼쪽 탐색 항목을 직접 선택하고 긴 도움말은 단계별로 스크롤했다. 반복 촬영에는 새 파일명을 사용했다.

```powershell
npm run qa:ui -- --entry "qa-readme.html?scene=workspace" --build-channel stable --wait 12500 --width 1600 --height 1000 --output docs/images/readme-current/workspace.png
```

화면별로 `scene`·탭·스크롤 위치와 뷰포트를 바꿨다. 좁은 창은 1000 × 760, 기본 작업 화면은 1240 × 760도 확인했다. 원고 비교는 1086 × 1448로 촬영했다. 예제의 엔진·작업 옵션은 권장 기본값을 뜻하지 않는다.
