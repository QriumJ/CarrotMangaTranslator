# 오류 신고: 전체 로그와 GitHub 연결

## 사용자 흐름

처음 한 번 GitHub로 로그인을 누르면 기존 기본 브라우저의 GitHub 인증 페이지가 열린다.
신고창의 코드를 입력하고 Gist·공개 저장소 권한을 승인한다. 이후 신고하기 한 번으로
전체 진단 파일 업로드 → 재다운로드 검증 → 공개 이슈 생성 → 기본 브라우저로 결과 열기를 수행한다.
별도 서버, 내장 GitHub 창, 파일 선택 대화상자, ZIP 첨부나 붙여넣기는 없다.
로그아웃은 로컬 토큰을 제거하며 GitHub의 게시물이나 앱 권한 승인을 삭제하지 않는다.

## 앱 등록과 인증

개발자 등록: https://github.com/settings/applications/new
Application name: Carrot Manga Translator
Homepage URL / Authorization callback URL: https://github.com/ucx0204/CarrotMangaTranslator
Enable Device Flow를 켠다. 이 흐름에서는 callback URL과 client secret을 사용하지 않는다.
공개 Client ID는 src/main/githubReportService.ts에 있으며, 배포 앱에 포함된다.
2026-10-25 실제 GitHub device/code 발급 성공으로 등록과 Device Flow 활성화를 확인했다.
실제 사용자 계정의 승인·게시까지 했다는 의미는 아니다.

로그인 토큰은 Electron safeStorage로 암호화하고 기존 fsync/atomic-rename adapter로 저장한다.
암호화 불가능 시 평문 저장으로 우회하지 않는다. 만료 토큰은 refresh token으로 갱신한다.
동일 계정 검증, 폴링 간격과 slow_down, 거절·만료, 취소, 중복 요청을 처리한다.
토큰·device_code는 main 프로세스에만 있고 렌더러에는 계정명·사용자 입력 코드만 전달한다.

## 로그 보존과 전체 스냅샷

logger는 문자열 길이·객체 키 수·배열 항목 수로 자르지 않으며 Error의 stack, cause,
자체 속성과 AggregateError.errors를 보존한다. getter 실패는 해당 속성에만 표시한다.
순환 참조, 깊이 64 안전 제한, Buffer 길이 표현과 개인정보 정제는 유지한다.
렌더러 Error 속성은 IPC 직렬화 전에 보존한다. HTTP 오류 응답의 4,000자 제한과
stderr 기록 콜백의 16 KiB 제한, 기본 이전 로그 회전의 4 MiB 제한을 제거했다.
현재·직전 실행 전체를 보존하며 더 오래된 실행은 다음 앱 실행 시 교체된다.

신고 준비 시 오류 context, 실행 진단, 시스템 정보와 현재·이전 로그를 별도 스냅샷으로
저장한다. 로그는 읽기 시작 시 파일 크기까지 읽어 이후 추가 기록과 분리한다.
오류 등급·관련 작업·행 수·문자 길이로 업로드 데이터를 선별하거나 자르지 않는다.
개인정보를 정제하고 UTF-8/LF로 정규화한 뒤 256 KiB 이하 파일로 순서대로 분할한다.
한 UTF-8 문자를 파일 경계에서 나누지 않는다. 빈 파일과 원래 없는 로그 파일을 구분한다.
읽기 실패·손상은 누락으로 숨기지 않는다. 이미 기록 전에 유실된 내용은 복구할 수 없다.

신고창 미리보기와 복사만 기존 60 KiB IPC 예산을 사용한다. 업로드는 미리보기 문자열을
사용하지 않고 main의 reportId로 전체 스냅샷을 읽는다. 시스템·로그 포함 선택은 실제
업로드 파일 선택에 적용된다. 제목·설명에도 개인정보 정제를 적용한다.

## 업로드와 재시도

16개 파일씩 비목록 Gist로 올린다. 각 manifest는 시각·순서·바이트 수·SHA-256을 기록한다.
Gist API 내용이 축약되면 GitHub의 raw 파일을 받으며 이 요청에는 인증 토큰을 전달하지 않는다.
업로드한 모든 파일의 바이트 수와 SHA-256이 일치해야 이슈를 생성한다. 이슈에는 모든
Gist 링크와 파일 수·바이트 수가 들어간다. 링크 목록 자체가 GitHub 본문 한도를 넘으면
링크를 자르지 않고 오류로 남긴다. Gist가 비목록이어도 공개 이슈에서 링크하면 누구나 읽을 수 있다.

로컬 journal에 계정·신고 내용·업로드 진행·완료 이슈를 저장한다. 재시도는 같은 스냅샷과
선택을 사용한다. 서버 저장 후 응답만 끊긴 경우 고유 신고 ID로 기존 Gist·이슈를 조회한다.
결과를 확인할 수 없으면 중복 POST하지 않고 오류를 남긴다. 확정된 4xx 거절은 재시도 가능하다.
브라우저 열기 실패는 이미 완료된 이슈를 실패로 바꾸지 않으며 주소를 표시한다.
스냅샷·업로드 기록은 github-report-private에 유지하고 Git 추적 대상에서 제외한다.

## 검증과 의존 경계

githubReport.test.ts가 4 MiB 초과 다중 Gist·한글/이모지·중간/끝 원인 보존, 개인정보 정제,
선택 제외, 저장 후 원본 변경, 재다운로드 손상, 로컬 손상, 429 재시도와 응답 유실 후
중복 방지, 인증·갱신·암호화 저장을 검증한다. 실제 production 신고창은 넓고 좁은 화면으로 캡처한다.
기존 durable storage를 직접 재사용하여 libraryTransactionStorage의 소비자가 27개가 됐다.
해당 파일의 실측 예외만 기록하며 전역 의존 상한이나 기존 커버리지 기준은 낮추지 않는다.

새 10개 production 파일의 최종 Windows v8 검증 커버리지: .tmp/github-report-coverage-verified-20261025.json
SHA-256: 48d37d9ee2c50627bf11ecadcfc734a3ac38b55536a0eaeeecbd130edfdc0a7c. 기존 파일의 exact floor는 유지했다.

## 전체 로그 신고 구현 확인 (2026-10-25, UI 보완 전)

- 집중 회귀 테스트 111개 통과. 실제 GitHub 인증 코드 발급 성공을 확인했다.
- Windows Electron의 실제 safeStorage로 암호화 저장, 복원, 로그아웃을 확인했다.
  토큰 대신 합성 fixture를 사용했다. 실계정의 Gist·이슈 게시 시험은 수행하지 않았다.
- 동시 worker 4개로 전체 check 27단계 통과: 테스트 11,370개 통과 / 9개 건너뜀,
  기존 커버리지 기준, 빌드, 페이지 출력 parity, 이미지 프로토콜과 번들 경계 포함.
  결과: .tmp/github-report-check-verified.log 및 .tmp/check-timings.json.
- 실제 production 신고창 캡처: C:/tmp/carrot-github-report-wide-20261025.png,
  C:/tmp/carrot-github-report-narrow-20261025.png. 임시 QA 엔트리는 제거했다.
- 기존 2,000개 파일 복원 검사는 병렬 실행 중 15초 제한을 초과하고 단독 검증은 통과했다.
  해당 테스트의 실행 제한만 60초로 조정했으며 데이터·소유권 검증 조건은 유지했다.

## Claude Code UI 보완 (2026-10-25)

사용자 요청으로 로컬 Claude Code에 실제 화면과 수정 작업을 전달했다. 인증 코드를 별도
영역에 크게 표시하고 복사·취소를 제공한다. 하단 강조 버튼은 로그인 전 `GitHub로 로그인`,
승인 대기 중 `브라우저 다시 열기`, 연결 후 `신고하기`가 된다. 업로드 실패 뒤에는 같은
스냅샷으로 재시도하며, 성공 뒤에는 등록된 이슈를 다시 연다. 승인 대기 문구는 코드 영역에
남기고 하단 버튼은 실제 동작 중일 때만 잠근다. 공개 신고 안내와 전체 로그 업로드는 유지한다.

기존 계정 IPC의 `reopen`은 대기 중인 고정 GitHub 인증 주소만 다시 연다. 토큰은 렌더러로
넘기지 않는다. 코드 복사 실패 안내는 새 코드가 발급될 때만 초기화해 빠른 클릭의 결과를
나중에 지우지 않도록 했다.

UI·인증 집중 테스트 31개와 변경 5개 파일의 커버리지 기준 유지, 타입 검사·전체 린트·빌드를
확인했다. UI 보완 후 전체 check는 다시 실행하지 않았다. 실제 production 컴포넌트의
넓은·좁은 화면 캡처를 확인했고 임시 QA 엔트리는 제거했다.

- 인증 대기: C:/tmp/claude-report-ui-final-pending-wide.png,
  C:/tmp/claude-report-ui-final-pending-narrow.png
- 연결 후 신고: C:/tmp/claude-report-ui-connected-wide.png,
  C:/tmp/claude-report-ui-connected-narrow.png
- 변경 파일 커버리지: .tmp/report-ui-coverage/coverage-summary.json
