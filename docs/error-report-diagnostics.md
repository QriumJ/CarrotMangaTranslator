# 원클릭 오류 보고 진단 계약

Issue #151 및 과거 클립보드 안내만 제출된 보고서의 정보 누락을 대상으로 수정했다.

- 신고 context는 jobId, executionId, incidentAt을 보존한다. 같은 workflow run을 재개해도 별도 execution으로 신고한다. 모든 생성 경로에서 공유 필드 길이를 적용하고 IPC의 strict 검증은 유지한다.
- 현재 작업과 최근 종료 12회의 진단 복사본은 기존 ActiveJobStore가 보유한다. 작업 권한·예약·재개 데이터로 사용하지 않는다. 실행 당시 provider/model, 생성 한도, OCR/인페인팅 설정 중 허용 필드만 저장한다. API 키, 헤더, 원문, 경로는 복사하지 않는다.
- 보고서에는 선택한 실행의 상태, 마지막 진행 시각과 경과 시간, 취소 요청, 마지막 실행 phase, 진행량을 포함한다. 수동 보고는 현재/최근 작업도 포함한다. 설정·GPU·timing 수집은 각각 3초 뒤 부분 결과로 진행한다.
- timing v1에 optional activeStage/activePage/activeCleanup을 추가했다. 시작 checkpoint가 있으므로 완료되지 않은 단계도 위치를 알 수 있다. 재시작 후 orphan은 interrupted이며, 실제 종료 시각은 추정하지 않는다. 새 앱은 기존 v1 파일을 읽지만 구버전 strict schema는 새 필드가 있는 파일을 읽지 못한다.
- 로그 경로는 logger.getLogPath/getPreviousLogPath가 권위다. 이전 세션과 현재 세션을 표시하고, 관련 실행/오류/진행 로그별 제한을 둬 INFO가 원인 오류를 밀어내지 않게 한다. 최대 200개, 항목당 8 KiB, 로그 전체 48 KiB이며 누락 수와 축약 여부를 표시한다. UTF-8 문자를 자르지 않는다. 다른 세션 로그를 신고 원인으로 단정하지 않는다.
- 취소·실패·부분 실패는 마지막 실제 진행량을 유지한다. completed만 done 및 total/total이다. 서비스는 원래 Error/cause/AggregateError를 job adapter로 전달하고, 페이지 오류는 즉시 누적해 후속 fatal/cancel/cleanup 실패에도 보존한다.
- 모델 응답 파싱 오류는 허용된 오류 메시지·stack frame·응답 구조/길이만 남긴다. 예전 preview 기반 오류는 원문이 message/stack/cause에 복제될 수 있으므로 해당 진단 전체를 생략한다. 새로운 보고서에서 이전 원문을 재게시하지 않는다.
- 긴 GitHub 보고서는 Error/System/Logs의 제한된 요약을 항상 미리 입력하고 전체 보고서는 클립보드에 둔다. URL은 7,000자 이내다. GitHub 자동 제출이나 파일 업로드는 하지 않는다.

회귀 검증: errorReport*, pageWorkflowService/Timing/Progress, completionSoundIntegration, jobEventMainProcessPerformance, logger/loggerRuntime, fixedBlockFallbackReview 테스트. UI는 실제 ErrorReportDialog와 공통 스타일로 넓은 창/좁은 창을 캡처한다.

의존성 예산은 측정된 두 logger 소비자(errorReportEnvironment.ts, pageWorkflowJob.ts), job adapter의 logger import 및 main/index.ts의 공유 context 정규화 import만 반영한다. 전역 제한·검증·coverage 기준은 낮추지 않는다.
