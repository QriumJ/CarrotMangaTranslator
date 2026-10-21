# 이슈 #157: Python bootstrap 고정과 원격 자산 조사

2026-10-22, 기준 커밋 `08c9241ec01848676bced92f569e12708e53b42c`.

## 확인한 원인과 수정

`https://bootstrap.pypa.io/get-pip.py`는 내용이 갱신되는 주소다. v3.7.0은
예전 파일의 SHA-256을 고정했으므로 정상적으로 내려받은 새 파일도 거부했다.
실제 production downloader로 HayaiOCR와 PaddleOCR 각각 총 3회 시도 후 실패를
재현했다. 신고와 같은 2,234,489바이트였고 실제 해시는
`f4448a01e3ab2914c65f4ca59d4cacba6b2dbde19a483fbac46587f8bbaff424`였다.

PyPA의 커밋 `f6f644156f23dfe9acc06e7b9ca75eee311f2e37`에서 기존 기대 해시와
정확히 일치하는 파일을 찾아 세 runtime manifest의 주소를 고정했다.

- URL: <https://raw.githubusercontent.com/pypa/get-pip/f6f644156f23dfe9acc06e7b9ca75eee311f2e37/public/get-pip.py>
- 크기: 2,230,488바이트
- SHA-256: `fb24e693bab954209a063d90953621412ccad4a500905a726286e038f508ddf6`
- 스크립트 내 bootstrap pip: 26.2.1. 스크립트가 설치하는 pip는 별도 package
  resolver의 결과이며 이번 실제 설치에서는 26.2.2였다.

Flux의 중복 URL 상수를 제거하고 기존 manifest를 직접 사용한다. 개발용
`prepare-ocr-python.cjs`와 `flux-rocm-build/python-setup.cjs`도 같은 manifest와
검증 downloader를 사용한다. 개발용 OCR Python archive에도 기존 hash 계약을
적용했다. URL override에는 대응 SHA-256이 필요하다.

체크섬 검증은 유지한다. `verify:hf-assets`에는 세 엔진의 Python archive와
bootstrap script 6개를 추가해 실제 파일을 내려받아 해시를 검사하게 했다.
회귀 테스트는 commit 주소 고정, TS/CJS 계약 일치, override 검증,
Flux의 정상 설치·캐시 재사용과 변경된 script의 실행 전 거부를 검사한다.

기존 marker는 URL도 비교하므로 옛 URL로 설치된 bootstrap은 한 번 다시 준비될
수 있다. 그 이후 같은 설치는 재사용된다. 앱 버전 릴리스는 만들지 않았다. AMD SDK만 별도 자산 prerelease로 고정했다.
롤백은 이 변경의 diff를 되돌리는 것이지만, 옛 가변 URL로 되돌리면 #157이 재발한다.

## 같은 유형의 전수조사 범위

`src`, `scripts`, `.github`, `tools`의 자체 소스에서 원격 URL과 URL 생성 함수,
manifest, Python `snapshot_download`/`from_pretrained`, lockfile 소비 경로를
조사했다. URL 후보 257행·101개 파일에서 19개 자산군의 계약을 분류했다.
vendor, node_modules, Rust target, 설치된 site-packages와 사용자
보관함은 대상이 아니다. 이것은 다운로드 자산의 주소·버전·해시 계약 조사이며
저장소 전체의 모든 기능에 대한 보안 감사는 아니다.

| 자산군                                              | 확인 결과                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| HayaiOCR/PaddleOCR/Flux get-pip                     | 이번 장애 확인 및 수정. 개발 스크립트 두 곳의 가변 URL도 제거                                                                    |
| Python archive, macOS Python                        | 명시적 버전/빌드 주소와 SHA-256 사용                                                                                             |
| Gemma 본체/mmproj/draft                             | 설정 단계의 `resolve/main`은 최종 download task에서 내장 자산의 commit revision으로 교체됨. 동일 장애 아님                       |
| Hunyuan, Paddle 선택 모델, Hayai model/processor    | commit revision 사용. Hayai는 snapshot 내부 파일 해시도 검증                                                                     |
| Flux GGUF/VAE/LLM, AOT/LaMa, YOLO, 말풍선·글꼴 모델 | commit 또는 고유 release tag에 결합된 manifest 사용                                                                              |
| llama/bee/lemonade, Flux native, Koharu, ZLUDA      | 명시적 release tag·파일명과 hash 계약. 이름의 `master-929-…`는 branch URL이 아닌 고정 release tag                                |
| CUDA/cuDNN                                          | 버전이 포함된 redistrib manifest 및 그 안의 패키지 SHA-256 사용                                                                  |
| 관리 CLI, WASM, FFmpeg                              | npm 버전, CDN 패키지 버전, release/build 경로 및 hash 사용                                                                       |
| Python package index                                | index는 가변이지만 일반 Windows OCR/Flux CPU 설치는 버전·해시 lockfile을 사용. index 주소만으로 #157과 같은 버그로 판정하지 않음 |
| 연구/학습 스크립트, 사용자가 지정한 모델·endpoint   | 앱 내장 고정 자산과 구분. 연구 결과의 재현성은 각 artifact 계약을 따라야 하며 이번 변경으로 학습 자산을 수정하지 않음            |

## 후속 위험 3개 수정

1. **AMD SDK 24개**: 기존 SHA-256과 크기를 바꾸지 않고 원래 wheel 파일명으로
   고유 [자산 릴리스](https://github.com/ucx0204/CarrotMangaTranslator/releases/tag/rocm-sdk-10.0.0-win-x64-20261022-r1)에 고정했다.
   원본 전체 다운로드와 게시 후 새 빈 폴더 재다운로드 검증을 완료한 뒤
   native manifest와 같은 24개를 사용하는 Hayai ROCm lock의 URL을 전환했다.
   native 캐시 버전은 `koharu-0.83.5-r3`로 바꿨다. 모델·알고리즘·wheel bytes는 같다.
   개별 파일 목록·원본 주소·크기·SHA-256·TheRock 빌드 출처는
   [자산 manifest](issue-157-rocm-assets.json)에 기록한다. 원본 내 라이선스는 보존하고
   구성요소의 upstream 고지를 `THIRD_PARTY_NOTICES.txt`로 함께 배포한다.
   Hayai의 다른 PyTorch 및 일반 Python 패키지는 기존 버전·해시 lock 계약을 유지한다.
2. **VC++ 자동 설치**: Microsoft의 고유 download URL, 버전 14.44.35211.0,
   25,635,768 bytes, SHA-256
   `cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b`를
   공통 runtime manifest에 기록했다. 내려받은 원본의 Authenticode는 Valid이며
   Microsoft Corporation 서명이다. 새 다운로드와 기존 캐시를 실행 전 검증하고,
   손상된 캐시는 다시 받으며 해시가 맞지 않으면 실행하지 않는다.
   `MANGA_TRANSLATOR_VCREDIST_X64_URL` override에는
   `MANGA_TRANSLATOR_VCREDIST_X64_SHA256`이 필요하다.
   사용자가 여는 도움말 링크는 자동 실행 경로와 별개다.
3. **진단용 Flux Diffusers**: 기본 모델을 commit
   `e7b7dc27f91deacad38e78976d1f2b499d76a294`로 고정했다.
   snapshot 다운로드, 캐시 marker, 워커의 pipeline/transformer config 로딩이 모두
   같은 revision을 사용한다. revision이 없거나 바뀐 marker는 재준비한다.
   워커는 준비된 snapshot을 local-only로 읽고 GGUF config의 무고정 fallback을 제거했다.
   custom model에는 전체 40자리 commit을
   `MANGA_TRANSLATOR_FLUX_PYTHON_MODEL_REVISION` 또는
   `MGT_FLUX_PYTHON_MODEL_REVISION`으로 지정해야 한다.

롤백은 소비 코드의 이전 URL/캐시 버전을 되돌리는 방식이며, 게시된 자산은
삭제·교체하지 않는다. 이전 가변 URL로 되돌리면 upstream 변경 위험도 되돌아온다.

## 검증 근거

아래 첫 전체 검사 수치는 bootstrap 수정 직후의 1차 결과다. 후속 3개 수정의
최종 전체 검사 결과는 마지막 절에 기록했다.

- 수정 전 focused baseline 2회: 각 4개 파일, 37개 테스트 통과.
- 수정 후 focused: 5개 파일, 42개 테스트 통과.
- `npm run check`: 전체 1,437개 테스트 파일·11,273개 테스트 통과
  (1개 파일·9개 테스트는 기존 skip). 타입 검사 3종, lint, format, architecture,
  coverage 기준, build, page artwork parity, image protocol smoke와 bundle 경계 검사
  모두 통과했다. 빌드된 두 runtime manifest의 내용도 source와 대조했다.
- `npm run verify:hf-assets`: 45개 항목 통과. Bootstrap 6개 및 직접 URL 자산은
  실제 GET 바이트 SHA-256 검증, 대형 HF 자산은 원격 metadata 방식이다.
- Electron에서 각기 빈 data/cache 디렉터리로 실제 설치: Paddle Python 3.12.7,
  Hayai Python 3.14.8, Flux Python 3.14.8, 모두 pip import 성공. 세 엔진 모두 두 번째
  호출에서 같은 interpreter를 재사용하고 추가 준비 로그가 없었다. 시스템 Python
  fallback은 비활성화했고 반환 경로가 해당 격리 root 내부인지 검사했다.
- AMD 원본 24개 전체 SHA-256과 byte size가 기존 manifest와 일치했다.
  이전 미확인 10개도 모두 확인했다. 원본 증거는
  `.bug-hunter/issue-157-20261022/amd-staged-verified.json`이며,
  게시본 검증 증거는 `amd-github-verification.json`이다. 서버 자산 26개의
  이름·크기·서버 digest 및 재다운로드 SHA-256이 모두 일치했고, wheel 24개의 내부
  파일 6,038개를 실제 압축 해제해 경로·파일 크기·ZIP CRC를 검증했다.
- AMD production `ensureNativeInferenceRuntime`를 빈 runtime/cache에서 실행해
  새 GitHub core wheel과 MSVC 자산을 원격 설치했다. 실제 Windows DLL 15개를
  로딩했고, 두 번째 호출은 같은 디렉터리를 재사용하며 다운로드 이벤트가 0개였다.
  AMD GPU 하드웨어 추론은 이 PC에서 새로 검증한 범위가 아니다.
- VC++ 실제 원본 다운로드와 Microsoft Authenticode 검증, 손상 다운로드·캐시·위조
  cache marker·override 해시 누락의 실행 차단을 검증한다.
- Flux 고정 revision으로 설정·토크나이저 17개를 빈 캐시에 실제 다운로드하고
  두 번째 호출에서 재사용했다. Python loader 테스트는 pipeline과 GGUF config의
  exact revision/local-only 전달 및 무고정 fallback 차단을 검사한다.
- bootstrap smoke의 검증 범위는 다운로드·검증·압축 해제·pip 실행·재사용이다.
  전체 OCR 모델 추론이나 Flux 이미지 생성, macOS 실기기 설치를 새로 실행한 것은 아니다.

실행 로그·upstream 원본 대조·재현·기계 판정은
`.bug-hunter/issue-157-20261022/`에 보존한다. 사용자 보관함과 원본·출력물은
접근하거나 변경하지 않았다.

## 후속 수정의 검증 기록

새로 수정한 `pythonRuntimePackages.ts`를 커버리지 관리 목록에 추가했다.
기준은 기존 `.tmp/production-cleanup-coverage-baseline-node22.json`의 원래 측정값이며
SHA-256 `a0e1199f46a80734d228ff1772b99d1fde2f700321346da77abf9c29795e4c0a`를
확인했다. 기존 파일의 기준은 변경하지 않고 관리 대상 수만 862→863으로 맞췄다.

첫 12-worker 전체 실행에서 보관함의 2,000-entry 복원 테스트가 15초 제한에 걸렸다.
동일 테스트의 단독 실행은 통과했다. 최종 재검사는 저장소의 공식
`MGT_VITEST_MAX_WORKERS=6` 설정을 사용하며 테스트 timeout·skip·커버리지 기준을
낮추지 않았다. Flux 기본 모델과 별칭, custom 모델에 대한 revision 전달/거부 테스트도
추가해 새 분기를 검증한다.

최종 결과:

- `MGT_VITEST_MAX_WORKERS=6 npm run check`: 713.66초, 전체 27개 gate 통과.
  1,438개 테스트 파일·11,289개 테스트 통과, 기존 1개 파일·9개 테스트 skip.
  타입 검사 3종, lint/format, 아키텍처·정책, 전체/파일별 커버리지 기준, build,
  page-artwork parity, image-protocol smoke, renderer/preload 경계 모두 통과했다.
- Python worker 회귀 테스트 3개 통과. Flux 기본/별칭/custom 모델 경로를 추가 검증했고
  launch spec 분기 커버리지는 90%로 기존 40% 기준을 넘었다.
- `npm run verify:hf-assets`: 46개 항목 통과. AMD 24개는 이와 별도로 원본/게시본의
  실제 전체 파일 해시와 압축 해제를 검증했다.
- 빌드 후 manifest 4개와 CJS/lock/Python 파일 4개, 합계 8개 runtime 산출물이
  수정된 소스와 일치했다. 최종 전체 검사 중 24개 커밋 대상 파일이 변경되지
  않았음을 SHA-256으로 확인했다. 이후 변경은 이 검증 결과 문서뿐이다.
- 게시 태그는 기준 commit `08c9241ec01848676bced92f569e12708e53b42c`와 일치한다.
  원본 wheel과 게시 staging은 보존했으며, 재다운로드 검증용 26개 복사본과
  압축 해제 검증용 임시 파일만 제거했다.

최종 로그는 `.bug-hunter/issue-157-20261022/check-final-six-workers.log`,
`check-final-timings.json`, `check-final-tests.log`,
`final-built-runtime-parity.json`에 있다. AMD GPU 실기기 추론과 전체 Flux 모델의
새 이미지 생성은 검증 범위에 포함하지 않았다.
