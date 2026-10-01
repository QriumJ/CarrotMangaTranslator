# 작품 번역 지침과 기존 화의 페이지 추가

## 사용자 동작

- `용어/기억 → 번역 규칙`에서 작품별 지침을 하나의 여러 줄 입력칸으로 편집한다.
- 캐릭터의 `말투`도 자유 입력이다. 이전 말투 분류 선택기는 제거했다.
- 저장한 지침과 활성 캐릭터의 말투는 누적 번역의 켜짐 여부와 관계없이 번역 요청에 들어간다. 누적 번역의 메모리 수집 동작은 유지한다.
- `보관함에 추가` 창은 `새 화 추가`가 기본이며, 옆의 `페이지 추가`를 선택하면 대상 작품·화·추가 위치를 고른다. 두 모드를 오가도 입력한 제목과 원본 선택을 보존한다.
- 왼쪽 페이지 목록의 `+`는 현재 화가 선택된 `페이지 추가` 모드로 바로 연결한다. 두 진입점은 같은 가져오기 창과 저장 요청을 사용한다. 화의 맨 뒤, 기준 페이지 앞 또는 뒤에 추가할 수 있다.
- `추가한 페이지만 번역`을 선택하면 추가가 끝난 뒤 새 페이지 ID만 선택된 번역 창을 연다.

## 데이터와 실행 계약

- `src/shared/workContextInstructions.ts`가 이전 호칭·효과음·톤과 말투 enum을 문장으로 변환한다. 명시적인 빈 프롬프트는 빈 상태를 유지한다. 읽기 자체는 사용자 파일을 다시 쓰지 않는다.
- 저장 필드는 `rules.prompt`와 `customSpeechStyle`을 사용한다. 이전 enum 필드는 파일 호환용으로 남긴다. AI 메모리 병합은 사용자 프롬프트를 바꾸지 않는다.
- 지침은 8,000자, 말투는 1,200자까지 받는다. 모델 요청에서 말투를 임의로 자르거나 후순위 캐릭터의 말투를 누락하지 않는다. 문맥 예산을 넘으면 지침을 조용히 버리는 대신 기존 예산 검증에서 알린다.
- 지침과 말투를 JSON 문자열인 데이터 행으로 전달해 언어별 기본 프롬프트 변환이 입력 문구를 다시 쓰지 않도록 한다.
- 페이지 작업 실행 기록과 준비된 번역 체크포인트에 지침을 보존한다. 재개 시 요청에만 적용하고 현재 작품 설정을 과거 값으로 덮어쓰지 않는다. 지침이 없는 이전 실행 기록은 첫 재개 때 현재 지침을 한 번 저장한다.
- MCP의 기존 enum 규칙 수정은 이전 기본 지침을 문장으로 갱신한다. 직접 작성한 프롬프트가 있으면 `rules.prompt`로 명시적으로 수정해야 한다. 컨텍스트 revision과 회차 이동의 인물 정의 비교는 이전/새 말투 표현을 같은 의미로 취급한다.

## 페이지 추가의 저장 권위

- `src/main/libraryStore/importIntoChapter.ts`는 기존 이미지 준비와 라이브러리 트랜잭션을 사용한다. 새 UUID 하위 폴더만 게시하며 기존 페이지 ID·이미지·편집 결과는 유지한다.
- 게시 잠금 안에서 대상 화와 기준 페이지를 다시 읽는다. 페이지 순서, 화 상태, 작품 변경 시각과 이야기 메모리의 페이지 위치를 함께 갱신한다.
- 준비 실패나 취소 시 새 파일을 롤백한다. 게시 중 중단은 기존 트랜잭션 복구 경로를 따른다.
- 자동 결과 저장은 기존 연결 위치·옵션·활성 여부를 유지하고 새 원본/결과 경로만 등록한다. 기존 경로를 먼저 예약해 같은 이름·다른 확장자의 페이지를 앞에 추가해도 원본과 결과가 충돌하지 않는다.

## 검증 자료

테스트는 입력 변경, 기존 설정 변환, 번역 요청의 누적 모드·언어쌍, 실행 재개, 선택한 위치의 페이지 추가, 실패/중단 복구와 자동 저장 재시작을 다룬다. 실모델 번역 품질 평가는 이 변경의 자동 검사에 포함하지 않는다.

실제 프로덕션 컴포넌트를 공식 `qa:ui`로 1600×980과 1240×760에서 캡처하고 열어 확인했다. 임시 QA 진입점은 제거했고 캡처는 보존한다.

- `C:/tmp/work-instructions-rules-wide-v1.png`, `C:/tmp/work-instructions-rules-narrow-v1.png`
- `C:/tmp/work-instructions-characters-wide-v1.png`, `C:/tmp/work-instructions-characters-narrow-v1.png`
- `C:/tmp/work-instructions-add-wide-v1.png`, `C:/tmp/work-instructions-add-narrow-v1.png`
- `C:/tmp/work-instructions-pages-wide-v1.png`, `C:/tmp/work-instructions-pages-narrow-v1.png`

보관함 추가 창의 모드 선택 검증은 `C:/tmp/import-destination-chapters-wide-v1.png`, `C:/tmp/import-destination-chapters-narrow-v1.png`, `C:/tmp/import-destination-pages-wide-v2.png`, `C:/tmp/import-destination-pages-narrow-v2.png`에 보존한다. 페이지 모드의 캡처는 실제 모드 버튼을 누른 뒤 수행했다. 창 외부 스크롤·가로 잘림을 검사하고 네 이미지를 직접 열어 확인했다.

검사 로그와 coverage 근거는 저장소 `.tmp/work-instructions-*`에 둔다. 기존 coverage 기준은 유지하고, 새로 검사 범위에 포함된 기존 파일은 봉인된 Node 22 측정값을 그대로 등록했다. 새 파일만 Windows 실측값으로 등록했다.

최종 `npm run check`는 26개 단계 모두 통과했다 (`.tmp/work-instructions-check-7.log`, 412.76초). 1,298개 테스트 파일·9,998개 테스트가 통과했고 기존 플랫폼 조건 등 8개는 건너뛰었다. 실제 빌드, page artwork parity와 image protocol smoke도 통과했다. 전체 부하에서 렌더 시작이 늦어지던 기존 HTTP 권한 회수 테스트는 시작 대기 시간을 같은 파일의 통합 테스트 기준에 맞췄으며, 권한 회수·출력 미게시 검증은 그대로 유지했다.

보관함 추가 창을 통합한 후 최종 전체 검사를 다시 통과했다 (`.tmp/import-destination-check-3.log`, 434.02초). 26개 단계, 1,299개 테스트 파일, 10,005개 테스트가 통과했고 8개는 건너뛰었다. 빌드, coverage 기준, page artwork parity와 image protocol smoke도 통과했다. 모드 전환과 입력 보존, 대상 변경, 비동기 응답 순서, 실패 재시도, 대상 삭제와 실행 중 잠금을 검증했다. 검사 중 발견한 번역 함수의 namespace 타입과 coverage manifest 정렬을 수정했으며, 사용자가 유지하도록 요청한 UI와 페이지 목록의 `+`는 변경하지 않았다. 최종 검증 기록은 `.tmp/import-destination-validation.json`에 보존한다.
