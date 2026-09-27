# 사용자 폰트 등록과 출력 오류 (#130)

#130의 `mgt-font://…` 로딩 실패에는 Chromium OTS의 `loca: Out of order
offset` / `Failed to parse table` 로그가 동반됐다. `NetworkError`만으로
인터넷 문제라고 판단할 수 없다. 제보자의 원본 폰트는 확보하지 않았다.

- 등록 시 기존 크기·확장자·시그니처 검사 후 숨겨진 sandbox renderer에서
  `FontFace`로 실제 바이트를 검사한다. 실패하면 등록하지 않으며 검사 창은
  성공·실패·15초 시간 초과 모두 정리한다. 검사는 등록할 때만 실행한다.
- 검사한 바이트를 그대로 저장한다. 비동기 검사 뒤 최신 인덱스를 읽어 동시
  등록을 보존하고, 인덱스 저장 실패 시 이번에 만든 폰트 파일만 회수한다.
- 등록 실패는 기존 공용 오류 기록과 토스트를 사용해 알린다. 자세한 파일
  진단은 오류 보고서에 남기며 토스트에는 지역화된 안내만 표시한다.
- 이미 등록된 폰트의 출력 실패는 카탈로그의 표시 이름과 기본 제공 폰트로
  변경하거나 원본 TTF/OTF를 다시 등록하는 방법을 오류 메시지에 포함한다.
  손상된 폰트를 임의로 고치거나 출력 폰트를 자동 교체하지 않는다.

등록 책임은 `customFontRegistration.ts`, Electron 로딩 검사는
`customFontLoadValidation.ts`, 출력 오류 진단은 `pageExport/fontValidation.ts`가
소유한다. 기존 폰트 선택·조판·폰트 매칭 알고리즘은 변경하지 않았다.
공용 오류 표시 및 토스트 소비자가 각 하나 늘어 의존 상한은 각각 29, 26이다.

검증: Electron 43.3.0에서 번들 `ko/dohyeon.ttf`는 허용하고, 복사본의 `loca`
offset을 역순으로 만든 파일은 실제 FontFace 검사에서 거부했다.
결과는 `.tmp/font-validation-native-result.json`에 기록했다.
등록 실패 화면은 실제 `FontManagerModal` / `FontsProvider` / `ToastViewport`로
1440×900 및 640×800에서 확인했다. 토스트는 닫기 버튼으로 해제할 수 있다.

새 파일 coverage floor는 `.tmp/font-validation-coverage/coverage-summary.json`
실측에서 추가했다(SHA-256
`d514be1e0b3a06e8524d91be9b546eb61319cb136a1382ab1836525a4ef8ffa7`).
기존 파일은 역사적 baseline 값을 사용하고 기존 floor/provenance는 유지했다.
