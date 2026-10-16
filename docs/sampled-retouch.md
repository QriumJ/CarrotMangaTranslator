# 복제 도장과 치유 브러시

## 구현 계약

브러시 메뉴의 순서는 브러시, 사각형, 원형, 복제 도장, 치유 브러시다.
Alt/Option 클릭 또는 원본 지정 버튼으로 같은 페이지의 위치를 지정한다. 원본이 없을 때는
일반 클릭도 원본을 지정한다(아무 반응 없이 무시하지 않는다).
현재 보정 결과가 기본이며 페이지 원본으로 전환할 수 있다. 텍스트 레이어는 샘플링하지 않는다.
정렬은 기본 켜짐, 불투명도는 100%, 복제 경도는 100%, 치유 경도는 50%다.
기존 크기 범위 4–90px와 Alt+우클릭 크기 조절을 유지한다. 설정은 workspace preference에
보존하고 좌표는 페이지 이동, 외부 이미지 변경, 실행 취소 후 초기화한다.
두 도구의 command ID는 `retouch-tool-clone`, `retouch-tool-heal`이며 기본 단축키는 없다.

`sampledRetouchGesture`가 획 시작 시 revision, 원본 종류, 정수 이동량과 설정을 고정한다.
획마다 UUID를 부여하고 `Esc`와 페이지 이동은 취소 IPC로 연결한다. 확정 결과를 받은 뒤에도
새 이미지의 load 이벤트까지 preview와 busy 상태를 유지한다. 이미지 오류와 페이지 해제 시
리스너를 제거한다. 상태 표시는 공통 RangeInput, SegmentedControl, CheckboxField, Button을 사용한다.

## 캔버스 상호작용 (2026-10-16 UX 정리)

- 도구 선택은 `isRetouchTool` 하나로 판정한다. 이전에는 `useAppSessionUiState`의 별도 목록에
  clone/heal이 빠져 있어 `inpaintingTool`이 `"none"`이 되었고, 실제 앱에서 커서·클릭·획이 모두
  무시되었다. 테스트가 이 경로를 거치지 않아 드러나지 않았으므로 회귀 테스트를 추가했다.
- 커서 상태는 stage의 `data-sampled-state`로 표현한다. `pick`(원본 없음, Alt 누름, 원본 지정
  버튼 활성)은 정밀 십자 커서와 점선 원, 커서 옆 안내 칩을 보인다. `ready`는 브러시 안에 원본
  픽셀 미리보기를, `paint`는 미리보기 없이 실시간 획을 보인다. 원본 위치에는 브러시 크기의 점선
  원과 십자 표시를 그린다. Alt는 포인터 이벤트의 `altKey`와 keydown/keyup/blur로 추적한다.
- `.image-stage`의 `line-height: 0`을 안내 칩이 상속하지 않도록 별도 line-height를 둔다.
- `[`/`]`(`retouch-brush-smaller`/`retouch-brush-larger`)는 모든 크기 조절 보정 도구에 적용되며,
  10px 미만 1, 30px 미만 2, 그 이상 5씩 바꾼다. 반경이 바뀌면 보이는 커서를 즉시 다시 그린다.
- Esc는 진행 중인 획이나 원본 지정 대기, 저장 중 요청만 취소하고 도구는 유지한다. 그 외의 Esc는
  기존처럼 도구를 빠져나간다. 이 규칙은 모든 브러시형 보정 도구에 같이 적용된다.
- 패널은 크기·경도·불투명도를 같은 열에 맞춘 슬라이더로, 샘플 대상을 SegmentedControl로,
  원본 지정 상태를 상태 점과 버튼 한 줄로 보인다.

`InpaintingRetouchRequestSchema`는 clone/heal에 stroke, sampled, requestId를 요구한다.
파일 경로는 요청으로 받지 않는다. 새 도구만 최대 32,768점을 허용하며 기존 paint/restore의
1,200점 제한은 유지한다. 공유 geometry 스키마를 명시적으로 내보내 MCP의 `.shape` 의존을
제거했다. worker는 이미지 범위 밖 좌표를 디코딩 전에 거부한다.

## 픽셀과 메모리

- `shared/sampledRetouch`는 256×256 희소 타일에 최대 coverage를 누적한다. 자국 간격은
  프레임 경계와 관계없이 유지한다. 겹친 자국에서 불투명도를 반복 적용하지 않는다.
- `sampledRetouchRaster`는 입력을 수정하지 않고 완성된 patch를 만든 뒤에만 적용한다.
  같은 획이 복사 영역을 덮어도 이전 픽셀을 복사한다. 원본 범위 밖은 제외한다.
- 치유는 원본 RGB에 경계의 대상−원본 차이에 대한 조화 함수를 더한다. 원본 기울기를
  보존하는 Poisson 방식이다. 알파는 별도 source-over이며 완전 투명 영역을 해에서 제외한다.
- 다중 해상도 보정, red/black SOR, 경계 평면 초기 추정, 동일 채널 해 재사용을 사용한다.
  최대 80회 V-cycle, 잔차 2e-5 종료 조건이다. 실패하면 복제로 대체하지 않는다.
- 연결된 타일은 하나의 희소 이웃 그래프로 푼다. 조밀한 작은 영역에만 픽셀 수의 두 배 이하인
  lookup 배열을 쓰며 긴 대각선은 Map을 유지한다. 타일별 독립 풀이로 생기는 이음새가 없다.
- 타일 저장량과 활성 픽셀당 256바이트의 보수적 자료구조 예산을 합쳐 128MiB 전에 거부한다.
  이 수치는 JS 엔진의 정확한 heap 상한이 아니라 사전 작업량 제한이다. 전체 페이지 디코딩
  버퍼와 PNG encoder 작업 메모리는 별도다.
- renderer는 rAF당 모아서 처리하고 타일 scratch canvas, alpha 버퍼를 재사용한다.
  화면 밖 타일 업로드를 생략하고 확대 변경 시 기존 coverage를 다시 그린다.
  최대 브러시의 큰 이동을 한 프레임에 모두 계산하면 56ms가 측정되어, 동일 rasterizer의
  dab 단위 iterator를 프레임당 약 4ms씩 진행하도록 보완했다. 남은 점과 마지막 endpoint는
  다음 rAF에서 이어 처리한다. worker는 같은 iterator를 동기적으로 끝까지 소비한다.

## 작업 스레드와 게시

`sampledRetouchClient`가 한 worker와 한 활성 요청만 유지한다. worker는 Electron API를
import하지 않으며 일반 PNG에는 `pngjs`를 사용한다. 비-PNG와 색 메타데이터(gAMA/iCCP/cHRM/sRGB/cICP)가 있는 PNG는 별도 Electron 프로세스에서 기존 nativeImage 디코더로 정규화하고, 기존 경로와 같이 native decode가 비어 있을 때만 FFmpeg를 사용한다. JPEG에서 FFmpeg와 nativeImage 사이에 최대 3단계 차이가 실측되어 초기 계획을 보완했다. 감마 PNG는 `toPNG()`만 호출하면 ICC와 원본 샘플이 남으므로 기존 보정 경로처럼 `toBitmap()` → `createFromBitmap()`을 거친다. 이 경로의 실제 색 변환과 알파 반올림을 테스트한다. 정규화 프로세스는 앱 잠금·보관함 초기화 전에 종료되는 전용 bootstrap 경로다. 취소는 SharedArrayBuffer의
원자 플래그로 전달한다. FFmpeg에는 AbortSignal을 전달한다. worker 오류, 타임아웃, 소유자
변경 및 30초 유휴 시 스레드를 해제한다.

worker 캐시는 한 페이지의 original RGBA, current RGBA, 1바이트 mask뿐이다. 경로와 크기가
바뀌면 재디코딩한다. 논리적 상주 픽셀 버퍼는 9바이트/픽셀이다. 최초 마스크는 전체 계산하고
이후 정확히 같은 current artifact를 이어받을 때만 patch 위치를 갱신한다. 반투명 PNG에서도
기존 `nativeImage.toBitmap()`과 같이 premultiplied 채널 및 알파의 차이가 2를 넘는지 비교한다.
Electron 44.5.1의 실제 픽셀을 확인해 characterization 테스트에 기록했다.

이미지와 마스크 PNG 인코딩 및 파일 기록은 worker에서 수행한다. 전체 PNG 기록 비용은 남는다.
기존 `withLibraryContentEdit`, revision 검사, revision store, artifact 보존 및 통합 history를
재사용한다. 이미지와 마스크가 모두 준비된 다음 게시하며 한 획은 하나의 history transaction이다.
기존 paint/restore raster 알고리즘은 이동하거나 수정하지 않았다.

architecture 예외의 직접 소비자 변화는 pageRevision +1(획 시작 revision),
ipcSchemaPrimitives +1(취소 UUID), inpaintingIpc runtime import +1(worker dispatch)다.
전역 상한을 바꾸거나 간접 forwarding 모듈로 의존을 숨기지 않았다.

## 검증 기록 — 2026-10-16 Windows, Ryzen 9 7950X

새 테스트는 `sampledRetouch*.test.ts`에 있다. 중첩 샘플, 알파, 이미지 경계, coverage,
타일 경계·분리 영역의 독립 Jacobi 기준 풀이, 취소, 예산 초과, strict IPC, 이전 모드 호환,
정렬/비정렬, revision 고정, 실제 PNG/mask worker와 100회 확정 획 및 저장 실패를 다룬다.

최종 `npm run check` 전체 성공(`.tmp/stamp-check11.log`, 약 598초): 1,398개 테스트 파일,
10,918개 테스트 통과, 9개 테스트 skip. lint·typecheck·architecture·format·기존 coverage floor,
build, page-artwork-parity, image-protocol-smoke와 renderer/preload bundle 검사까지 통과했다.
기존 floor 2,331개는 변경하지 않았다. 마지막 프레임 분할 이후 기능 코드를 고정한 채 실행했다.

| 측정                                    | 결과                                                       |
| --------------------------------------- | ---------------------------------------------------------- |
| 512px 원형 영역, 비균일 흑백, warm 20회 | 알고리즘 p95 146.63ms, 최대 155.32ms                       |
| 같은 영역, RGB마다 다른 밝기 변화       | 알고리즘 p95 224.39ms, 최대 249.71ms                       |
| 실제 Chromium preview 180프레임, 최종   | 그리기 p95 1.4ms, 최대 4.3ms                               |
| Chromium CPU 4배 제한, 초기 일반 입력   | 그리기 p95 7.4ms, 최대 17.2ms                              |
| rAF 프레임 간격                         | 두 조건 모두 p95 약 16.8ms                                 |
| 24MP 첫 clone, 디코딩·PNG 기록 포함     | 약 1.56초, 메인 최대 지연 8.42ms, 프로세스 RSS 약 412MiB   |
| 120MP 첫 clone, 디코딩·PNG 기록 포함    | 약 8.53초, 메인 최대 지연 9.07ms, 프로세스 RSS 약 1,305MiB |
| 1MP 100회 변경 획, 10회마다 페이지 교체 | 10회 단위 RSS 약 104–140MiB, worker 종료·GC 후 약 83MiB    |

큰 페이지 측정은 세로 줄무늬 PNG와 작은 획이다. 모든 120MP 콘텐츠의 속도나 메모리 사용을
보장하지 않는다. 24MP를 준비한 실제 Chromium의 최대 반경 90px·큰 이동 입력에서 분할 후
프레임별 미리보기 처리는 최대 10.7ms였다. CPU 4배 제한에서는 최대 36.1ms였으며,
예산을 넘는 대각선 두 사례의 프레임 p95는 각각 14.1ms/11.3ms였다. 이는 일반 드래그와
다른 극단 입력이고, CPU 제한에서도 모든 프레임이 16.7ms 이내라는 뜻은 아니다.
측정 로그는 `.tmp/stamp-fast-chunk.log`, `.tmp/stamp-fast-chunk-cpu4.log`에 보존했다.
최종 worker로 1,200×100,000px(120MP) 웹툰 형태도 저장 완료와 PNG·mask 크기를 확인했다.
전체 테스트가 동시에 실행되던 조건에서 약 15.04초였고 worker 해제 후 RSS는 약 67MiB였다.
이 값은 유휴 상태 성능 비교에 사용하지 않는다(`.tmp/stamp-webtoon.log`).
preview의 그리기 시간과 rAF 프레임 간격을 혼동하지 않는다. 16.7ms를
엄밀히 적용한 프레임 간격 기준은 16.8ms 측정으로 충족했다고 주장하지 않는다.
120MP 디코딩 시작 500ms 뒤 취소한 별도 측정에서는 파일을 게시하지 않고 약 3.52초에
worker와 버퍼를 해제했다(RSS 약 70MiB, 메인 최대 지연 8.41ms). pngjs의 동기 디코딩·인코딩
도중에는 원자 플래그를 읽을 수 없으므로 취소 완료가 즉각적이지 않다. UI 이벤트 루프는
그동안 계속 응답하며 완료된 임시 결과를 게시하지 않는다.
Apple Silicon macOS 실행·패키징, 저사양 실물 PC, 모든 색 프로파일/EXIF 조합의 동등성은
이 Windows 측정으로 대체할 수 없다. 출시 승인 전에 별도로 검증해야 한다.

실제 production component QA 캡처는 `C:/tmp/stamp-wide-perf.png`,
`C:/tmp/stamp-narrow-4.png`, `C:/tmp/stamp-cpu4.png`에 보존했다. 마지막 endpoint 보정 후
`C:/tmp/stamp-final-wide.png`, `C:/tmp/stamp-final-narrow.png`도 다시 확인했다.
프레임 분할 후 최종 캡처는 `C:/tmp/stamp-chunk-final-wide.png`,
`C:/tmp/stamp-chunk-final-narrow.png`다.
임시 QA 엔트리는 제거했다.

## 참고 구현과 출처

직접 코드를 옮기지 않고 기존 알고리즘 구조를 비교해 구현했다.

- [PhotoCraft retouch](https://github.com/storytold/photocraft/blob/e4b2868a02c99afb30ed5c61022e03b13574e873/crates/paint/src/retouch.rs), [Poisson](https://github.com/storytold/photocraft/blob/e4b2868a02c99afb30ed5c61022e03b13574e873/crates/algo/src/poisson.rs): 고정 샘플과 다중 해상도 풀이.
- [GIMP heal](https://github.com/GNOME/gimp/blob/d8d30252dd7b3dace58233a1b8cfc87cabcd1a63/app/paint/gimpheal.c): 차이 경계와 종료 조건.
- [Krita duplicate](https://github.com/KDE/krita/blob/2568c1a0ec2a5af697f89c15cc373a490ae7c70d/plugins/paintops/defaultpaintops/duplicate/kis_duplicateop.cpp): 이전 픽셀 샘플링.
- [PhotoDemon](https://github.com/tannerhelland/PhotoDemon/blob/8357ce499191bf12b84091b936aa9424ac35022f/Modules/Clonestamp.bas): 영역 합성과 자원 재사용.
- [Pinta](https://github.com/PintaProject/Pinta/blob/e6bfb062468bc628c1429b513549176f5701ccd7/Pinta.Tools/Tools/CloneStampTool.cs): 상대 위치와 획 단위 확정.
- [miniPaint](https://github.com/viliusle/miniPaint/blob/a79733eb803fc97084ef0ee4faa96b031e69e1c0/src/js/tools/clone.js): Canvas 상호작용 비교.
- [darktable](https://github.com/darktable-org/darktable/blob/37d514c78c59e6ce3e5910223df160c6c4c53242/src/common/heal.c): 마스크 계산과 CPU 경로.
- [OpenCV](https://docs.opencv.org/4.13.0/df/da0/group__photo__clone.html): seamless cloning 비교 기준. 새 OpenCV 런타임은 추가하지 않았다.

추가 QA: `C:/tmp/stamp-heal-wide.png`(치유·원본·최소 경도/불투명도),
`C:/tmp/stamp-heal-narrow-busy.png`(계산 중·비활성 컨트롤)을 확인했다.

Windows x64 unpacked 패키지에서 main module graph smoke를 통과했다. ASAR 안의 실제
worker로 PNG·JPEG·감마 PNG 각각 clone/heal을 실행하고 획 바깥 픽셀, 중심 복사 픽셀,
마스크를 native 디코더 기준과 대조했다. 실제 Electron main client에서도 사전 취소,
계산 중 취소, 동시 요청 차단, 실패 후 복구, 소유자 변경과 유휴 해제를 확인했다.
패키지는 `.tmp/stamp-package-final-20261016/win-unpacked`, 측정 로그는
`.tmp/stamp-packaged-final-Q3Q53T/result.json`, `.tmp/stamp-client-chunk-smoke.log`에 있다.
이 절은 기능 개발 단계의 Windows unpacked 측정 기록이다. v3.4.0 설치 EXE와
macOS 패키징·실행 검증은 각각 정식 Release·macOS Release workflow에서 수행하며,
최종 배포의 commit과 workflow는 릴리스에 첨부한 플랫폼별 provenance로 확인한다.

기존 커버리지 floor는 유지했고 신규 소비자 네 파일은 Node 22 원본 artifact의 측정값을
그대로 등록했다. 새 모듈의 최초 측정은 `.tmp/stamp-coverage-first.json`에 보존했다.
introduced artifact에 새 기록만 추가한 SHA-256은
`ded12bf93801d8025d28263f3efc5198799b0bf6d1695e88e3f61e623ae3aef2`다.
