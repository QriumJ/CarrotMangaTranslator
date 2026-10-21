# HunyuanOCR 1.5 앱 통합 — 2026-10-21

## 최종 사용자 계약

- 목록은 HayaiOCR → HunyuanOCR 1.5 → PaddleOCR(레거시). 기존 Hayai/Paddle 선택은 보존한다.
- 일본어는 Hayai, 비일본어는 Hunyuan을 추천한다. 자동 언어는 두 용도를 안내한다.
  추천은 설정 초안의 적용 버튼으로만 바뀌며 실행 중 저장 설정을 변경하지 않는다.
- 최신 사용자 지시에 따라 **F16 기본, Q4_K_M 수동 절약 옵션**이다. 모델 자동도 F16이다.
  앞선 계획의 4GB GPU 자동 Q4 및 RAM별 자동 모델 분기는 이 지시로 대체했다. Q5는 없다.
- 장치 자동은 Windows NVIDIA/AMD 전용 메모리 4GiB 이상 GPU, Apple Metal 통합 메모리
  8GiB 이상 GPU이며 그 외/용량 불명은 CPU다. 수동 GPU/CPU 선택이 우선한다.
  4GB GPU의 F16 실행을 막지 않는다. 4GB 실제 카드에서 시험한 것은 아니다.

## 실행과 데이터 권위

`shared/hunyuanOcr.ts`가 추천/선택 해석을, `runtimeSupport/hunyuanAssets.ts`가 불변
자산을, `hunyuanLaunch.ts`/`hunyuanServer.ts`/`hunyuanRequest.ts`가 네이티브 실행을
소유한다. 설정 타입은 기존 `settingsTypes.ts`에 둔다. 기존 CUDA/ROCm 설정은 Hayai/Paddle
의미를 유지하고, Hunyuan 실행 모델·장치·backend는 작업 시작 시 별도로 해석한다.

`translationRuntimePort.ts`의 기존 탐지 → 고정 영역 경로를 재사용한다. 사용자 선택 영역은
재탐지하지 않는다. `recognitionBboxes` 순서, 원래 영역 ID/좌표, 대사와 효과음 분리를
유지하며 영역 하나씩 인식한다. 전체 페이지 자동 인식으로 우회하지 않는다. 결과와 효과음
producer는 Hunyuan으로 기록하고 번역 체크포인트 복원에도 이 정보를 유지한다.

인식 전 기존 GPU 자원 조정 경로로 유휴 인페인팅 자원을 해제하고, 탐지 후 탐지 세션을
해제한다. 번역 endpoint는 기존 작업 수명 경로가 정리한다. Hunyuan 서버는 OCR 작업
내에서만 재사용하고 정상 종료·실패·취소에 자식 프로세스 트리 종료 완료를 기다린다.
여러 페이지에서 서버를 유지하는 Hunyuan OCR workflow는 기존 model-runtime 자원을
독점한다. API/Codex 번역을 선택해도 OCR 단계 사이에 다른 작업의 모델이 함께 상주하지
않도록 renderer admission과 main 작업 자원 판정에 같은 정책을 사용한다.
Gemma 서버/실행 인자를 공유하지 않는다. `llamaRuntimePurpose: hunyuan`은 설치 경계에만
사용하여 번역 모델 런타임 선택을 오염시키지 않는다.

GPU 초기화/할당/OOM 오류만 같은 모델 CPU로 한 번 재시도한다. 다운로드·SHA 오류,
잘못된 입력, 취소, timeout, 일반 프로세스 크래시는 CPU 전환으로 숨기지 않는다.
실행 backend와 전환 이유를 진행 이벤트에 남기며 실패한 페이지의 부분 결과는 반환하지 않는다.
캐시에는 모델 revision, b11146, 실제 영역별 backend/모델, GPU index와 실행 설정을 넣는다.
GPU→CPU 또는 혼합 실행 결과를 GPU 결과로 재사용하지 않는다.

기본 인자는 context 4096, batch/microbatch 512, parallel slot 1, 흰 여백 16px,
temperature 0, repeat penalty 1.08, 최대 384 tokens이다. 길이 제한이면 1024로 한 번만
재시도하고 다시 잘리면 오류다. context 초과는 선택 영역 분할을 안내한다. 영역별 GPU 60초,
CPU 120초이며 startup readiness 제한은 120초다. CUDA Flash Attention on, Vulkan/Metal auto,
CPU off. CPU는 가용 CPU 수에서 최대 16 threads, decoder/vision/KV/op offload 모두 끈다.
KV 양자화와 DFlash는 사용하지 않는다.

## 자산

모델 저장소: `prithivMLmods/HunyuanOCR-1.5-GGUF-Updated`

revision: `9ddd3b47beb0de305ecd89a717748bac080d7aee`

| 파일                       |      bytes | SHA-256                                                            |
| -------------------------- | ---------: | ------------------------------------------------------------------ |
| HunyuanOCR.F16.gguf        | 1083218528 | `59eb3992dac3d34c168af3538d6d5792ee1451508b621e9788b04d78a675ef1f` |
| HunyuanOCR.Q4_K_M.gguf     |  354966656 | `4148eadce41e41ccb694a947193c7ef58bc71e6e87a022c66bcf4195ce01f036` |
| HunyuanOCR.mmproj-f16.gguf |  997235744 | `2c9c459f68a9a3c221b1a8088d9c91ac1007ef22aa89045108d14d949f9a3994` |

첫 사용 시 선택 decoder와 공통 F16 projector만 설치한다. 모델 전환 시 projector는 재사용한다.
캐시 경로는 `<dataRoot>/models/hunyuan-ocr/<revision>`다. 기존 다운로드·무결성 검사 경로를 쓴다.

런타임은 ggml-org/llama.cpp **b11146**. CUDA/Vulkan/Metal은 기존
`runtime/model/speed-llama-runtime-contracts.cjs`의 고정 자산을 재사용한다.
추가한 Windows CPU 공식 자산:

- `https://github.com/ggml-org/llama.cpp/releases/download/b11146/llama-b11146-bin-win-cpu-x64.zip`
- 18,560,055 bytes
- SHA-256 `14cf1303ca9ac3abd94816850532f9f9a69ac66fbaca3776fc6f9061c2fac1d1`
- 압축 내부 51개 파일, 가장 긴 상대 경로 28자. 설치 경로 예산에 이를 등록했다.
- CPU backend의 `ggml-cpu-x64.dll`/`ggml-cpu.dll` 검증을 추가했다. CUDA DLL을 요구하지 않는다.
  첫 실제 CPU 설치에서 드러난 경로 예산/CPU backend 오판을 수정하고 회귀 테스트를 추가했다.

별도 외부 자산 또는 앱 릴리스는 게시하지 않았다.

## 실제 앱 경로 평가

장비는 Windows, NVIDIA GeForce RTX 4090(24GB), AMD Ryzen 9 7950X(32 logical CPUs)다.
CPU 모델 시험은 위에서 정한 16 threads 제한을 사용했다.

원본 고정 reference SHA-256:
`345a746fe252473c29c8bfc80f06cb893c4844627e520509a0cce4bade901359`.
46개 이미지의 234영역을 앱의 실제 Electron 이미지 디코더, 고정 영역 인식, 네이티브
서버 경로로 실행했다. 정답은 앞선 실험의 assistant 전사이며 독립 human gold가 아니다.
중국어 수동/자동 표본은 내용이 겹친다. NFKC 후 문자/숫자만 남긴 CER이므로 문장부호와
공백 정확도는 포함하지 않는다.

| 표본        | 영역/문자 | F16 CUDA        | F16 CPU    | Q4 CUDA    | Q4 CPU     |
| ----------- | --------- | --------------- | ---------- | ---------- | ---------- |
| 중국어 자동 | 66 / 760  | 8자 오류, 1.05% | 8, 1.05%   | 30, 3.95%  | 30, 3.95%  |
| 중국어 수동 | 68 / 776  | 16, 2.06%       | 16, 2.06%  | 16, 2.06%  | 17, 2.19%  |
| 일본어      | 32 / 384  | 86, 22.40%      | 86, 22.40% | 67, 17.45% | 68, 17.71% |
| 영어        | 34 / 1031 | 0, 0%           | 0, 0%      | 7, 0.68%   | 7, 0.68%   |
| 스페인어    | 34 / 1124 | 2, 0.18%        | 2, 0.18%   | 2, 0.18%   | 2, 0.18%   |

같은 일본어 표본의 기존 Hayai는 앞선 측정에서 여백 없음 1/384, 16px 여백 2/384 오류였다.
따라서 일본어 Hayai 추천을 유지한다. Q4 일본어 점수 차이는 후리가나 처리 영향이 있어
모델 전반의 성능 역전으로 해석하지 않는다.

| 실행                | 234영역 전체 시간 | 최대 프로세스 전용 VRAM |
| ------------------- | ----------------: | ----------------------: |
| F16 CUDA, batch 512 |          37.257초 |                2.832GiB |
| Q4 CUDA, batch 512  |          30.815초 |                2.141GiB |
| F16 CPU             |         511.317초 |                       0 |
| Q4 CPU              |         493.148초 |                       0 |

시간은 초기 로딩과 측정 종료 대기를 포함한다. CPU 실행 중 코드 검증도 진행했으므로
순수한 하드웨어 성능 비교로 쓰지 않는다. WDDM 프로세스 GPU counter를 약 100ms 주기로
측정했다. 시스템 전체 VRAM/드라이버/화면 표시 메모리를 포함한 값이 아니며 순간 피크를
놓칠 수 있다.

추가 검증:

- F16 batch/microbatch 128: 234영역 raw text까지 512와 전부 동일.
  42.599초, 최대 2.809GiB. 약 24MiB 절약에 비해 이 실행에서 약 14% 느려 기본 512를 유지했다.
  이미 영역 단위/단일 slot/4096 context/유휴 모델 해제로 큰 메모리 중첩을 제거했다.
- F16 CUDA 크기 변화 시험: 8페이지, 160/640/960px 선택 영역 24개 연속 처리.
  12.745초, 최대 2.942GiB, 크래시 없음.
- 실제 탐지 → 탐지 모델 해제 → Hunyuan 인식: 중/일/영/서 4페이지,
  대사 13개와 효과음 3개, 오류 없이 완료. 인식 서버 최대 2.832GiB.
- Windows NVIDIA에서 Vulkan F16 6영역 시험 성공, 102문자 오류 0.
  이는 AMD 장비 실측이 아니다. Vulkan 최초 런타임 설치/시작도 포함했다.
- 실제 CUDA999 장치 요청으로 GPU 초기화 실패를 재현했다. b11146의
  `invalid device: CUDA999` 메시지 분류를 보완한 뒤 CPU F16으로 정확히 한 번 전환,
  6영역 완료 및 저장 설정 유지 경로를 확인했다. 모델은 Q4로 바뀌지 않았다.
- 이전 b11103 전체 페이지 실행 크래시는 이번 b11146 영역 경로에서 재현되지 않았다.
  이전 전체 페이지 네이티브 결함 자체를 수정했다고 주장하지 않는다.
- 실제 자식 프로세스로 readiness, 취소/종료 완료, startup 크래시 진단, 실행 중 비정상 종료를
  검증한다. 회귀 테스트는 GPU→CPU 한 번, 중간 segment 실패, 결과 중복 방지, 잘린 출력,
  캐시 분리와 malformed region 거부를 포함한다.

AMD/Apple Silicon 실기, 물리적 4GB GPU와 GPU OOM 실측은 미검증이다.
플랫폼별 자산/인자/추천/CPU 전환 계약은 자동 테스트하며 OOM은 주입 테스트로 검증한다.
큰 선택 영역에서는 위 측정치를 넘을 수 있다. 앞선 전체 페이지 F16 약 4.03GiB와
이번 영역 측정 2.83~2.94GiB를 섞어 안내하지 않는다.

## 검증 파일과 복구

실험 결과·네이티브 로그·메모리 CSV·고정 좌표는
`.tmp/hunyuan-integration-20261021/`에 있다. `run.cjs`는 production
`translationRuntimePort`/`hunyuanRecognitionSession`을 사용한다. `--batch=128`만
비교 실험용 네이티브 인자 변경이며 기본/CPU/전체 탐지 시험에는 사용하지 않았다.
정상 F16 CPU 결과는 `f16-cpu-verified2-results.json`, Q4 CPU는
`q4-cpu-verified-results.json`이다. 이름에 verified가 없는 초기 CPU 실패 기록도 남겼다.

복구는 OCR 설정에서 Hayai/Paddle로 바꾸거나 Hunyuan 장치를 CPU, 모델을 Q4로 수동 선택한다.
무결성 오류는 실패한 정확한 자산의 재설치를 통해 복구한다. 보관함/원본/출력물을 정리할
필요가 없다. 앱이 GPU 실패를 처리할 때 저장 설정은 유지된다.

영어/스페인어 임시 다운로드는 시험 후 경로·SHA를 확인하여 해당 20개 파일만 제거했다.
기존 보관함/중국어 원본/모델 producer artifact는 보존한다.
QA 임시 엔트리는 제거하고 아래 캡처는 보존한다.

- `C:\tmp\hunyuan-settings-wide-final-20261021.png`
- `C:\tmp\hunyuan-settings-narrow-final-20261021.png`

실제 설정 컴포넌트, SegmentedControl, JobProgressReadout과 공용 modal/style로
1280×1000 및 480×1000을 캡처했다. 목록 순서, 선택 시인성, 다운로드/CPU 전환의 긴 문구,
외부 가로 스크롤/잘림을 직접 확인했다. Impeccable detector 결과 `[]`.

`verify:hf-assets`는 Hunyuan 3개를 포함한 39개 자산을 통과했다.
최종 `npm run check`는 27개 gate 전체 통과, exit 0이었다(549.16초).
이 실행에서만 `MGT_VITEST_MAX_WORKERS=8`을 사용했고 저장소 설정은 변경하지 않았다.
테스트는 1,422개 파일 / 11,149개 case 통과, 실패 0이며 기존 1개 파일 / 9개 case는 skip이다.
타입·린트·구조·포맷·커버리지 기준과 production build, page artwork parity,
image protocol smoke, renderer/preload bundle 검사를 모두 통과했다.
최종 로그와 결과는 `.tmp/check-logs/`, `.tmp/check-results/vitest.json`,
`.tmp/check-timings.json`에 있다.

신규 production 파일 11개의 첫 Windows 커버리지는
`.tmp/hunyuan-integration-20261021/introduced-coverage.json`에 기록했다.
SHA-256: `3d07d7247d9c701fd97918e2f848dc95c3abdeab96c3d0b4f1fa68e085fdc6da`.
기존 파일의 하한은 낮추지 않고 새 파일만 기존 inventory에 등록했다. 설치·전체 인식의
네이티브 실측은 Vitest 계측과 별도로 위 결과에 기록한다.
Paddle 표시명 변경에 맞춰 기존/새 로그의 진행 상태 병합과 검증 timeout 분류도 유지한다.
