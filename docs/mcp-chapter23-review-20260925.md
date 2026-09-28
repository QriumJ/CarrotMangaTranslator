# Chapter 2.3 MCP 점검 — 2026-09-25

## 요청과 확인 범위

사용자가 전체 대사·효과음 번역을 AI가 맡을 수 있는지 확인하고, MCP가 막히면 이 작업 트리의 코드를 수정하도록 요청했다.
미정 작품 / Chapter 2.3: 9페이지, 저장 번역 블록 0개. 원본 9페이지를 직접 읽어 대사·내레이션·인물 소개·말풍선 밖 문구·효과음 68개 번역 초안을 작성했다.
본문 번역과 효과음 판단은 가능하다. 기존 MCP에는 원본 crop, 블록 생성·편집, Codex 원문 제거, 식자, 효과음 생성·검수·적용, preview/export가 구현되어 있다.
현재 ChatGPT 세션에는 선택한 당근 앱의 도구가 노출되지 않았다. Remote Desktop Commander는 정상 연결되었다.

## 연결 관측

로컬 listener 127.0.0.1:38475 및 Foreground Tailscale Funnel이 존재했다. serve status --json에서 HTTPS443, 해당 loopback proxy, AllowFunnel=true를 확인했다.
간략 funnel status의 No serve config는 Foreground 경로를 생략한 표시였다. 네트워크 설정 변경은 필요하지 않았다.
PC에서 공개 HTTPS OAuth protected-resource / authorization-server metadata 두 URL 모두 HTTP200을 받았다. 이 결과는 ChatGPT 인증 도구 호출 성공과 다르다.

## 이번 변경

src/main/mcp/mcpOutputSchemas.ts: z.toJSONSchema에 { reused: "ref" }를 추가해 반복 정의를 동일 문서의 $defs/$ref로 공유한다.
tests/mcpDiscoverySchema.test.ts: 249개 성공·오류 출력 계약의 참조 해석 동등성, 내부 참조 유효성, 기존 재귀 구조, 용량 감소를 확인한다.
실제 도구 생성 함수로 전체 native capability를 구성한 측정: 도구249개, tools/list JSON 3,669,526 → 3,226,338 bytes (443,188 bytes / 12.0775% 감소).
입력 스키마 합계244,561 bytes 불변. 출력 스키마3,214,795 → 2,771,607 bytes. 앱·저장소·도구 port는 호출하지 않은 factory 측정이다.
응답 크기가 미노출의 확정 원인이라는 증거는 없다. 이번 변경은 도구 검색 응답 개선이며 ChatGPT 재연결 성공으로 보고하지 않는다.

## 검증 결과

mcpStructuredOutputs + mcpDiscoverySchema: 9/9 통과. mcpReadServer + mcpModernProtocol: 59/59 통과. 총4파일68테스트 통과.
npm run build, npm run typecheck, npm run typecheck:electron 통과. 변경2파일 ESLint 통과. Prettier check 통과(이후 테스트의 non-null assertion을 명시적 guard로 바꿈).
변경 전 현재 작업 파일과 비교한 production diff는 위1줄. 기존 미커밋 변경을 보존했다. 사용자 앱 프로세스를 재시작하거나 인증/권한을 바꾸지 않았다.
Chapter2.3 JSON 및 원본9장 SHA256가 점검 전후 동일함을 확인했다. 페이지 편집·원문 제거·식자·모델 실행은 하지 않았다.

## 남은 확인

새 빌드로 앱을 재시작하고 ChatGPT가 도구 목록을 다시 받아야 실제 연결 복구 여부를 확인할 수 있다. 현재 실행 중인 프로세스의 기존 스키마 cache는 갱신되지 않았다.
검증 원본·크기 측정·로그는 .tmp/chapter23-mcp-20260925에 보존한다. 번역 초안은 사용자에게 Chapter_2_3_Korean_Draft.md로 전달한다.
