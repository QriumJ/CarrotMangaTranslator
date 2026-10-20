# Hayai v2.5 Nova local integration and comparison — 2026-10-20

## Outcome

v2.5 was downloaded, integrity-checked, and connected to the unchanged production
page/batch/worker adapter in an isolated evaluation environment. The existing app
default and model cache were not replaced.

The tested configuration is **512 patches, greedy decoding, CUDA graphs disabled**.
It completed 32 pages/chunks (20 Chinese-language, 12 Japanese), producing 175
dialogue regions. Four persistent-worker requests exactly matched their batch
outputs; input/output dimensions and dialogue geometry were preserved.

Chinese aggregate character errors improved from **90/760 to 77/760** (14.4% fewer
errors). This is not uniform: simplified Chinese improved substantially,
traditional horizontal text worsened, and traditional vertical text improved.
Japanese errors fell only from **59/939 to 57/939**, while exact regions fell from
**86/109 to 81/109**. A global default upgrade is not justified by this sample.

The upstream default CUDA-graph path was fast in crop tests but failed during the
32-page batch with an illegal CUDA memory access. The configuration that completed
the batch was approximately 7% slower for the Chinese corpus and 18% slower for
Japanese recognition than the existing model. Do not report the failing path's
speed as the speed of the validated integration.

## Exact artifacts

- Existing model: `JustANormalTinkerer/hayai-ocr-v2`
  at `53aed13296a9d39bd7c0c0bcba745010d8142b5b`.
- New model: [Hayai v2.5 Nova](https://huggingface.co/JustANormalTinkerer/hayai-ocr-v2.5-nova)
  at `2803d0dc005fa4396ab1e7c5a472d2c450a247f7`.
- New weights: 627,709,088 bytes; SHA-256
  `ac63cd177c5b68bd91e18dd4408e0400461c7cf19f484b0da1643e232d1ffc3a`.
- New `modeling_hayai.py`: 45,551 bytes; SHA-256
  `3409131b4a35fc1bc1f0d7c40f906f79d10f57476f40fe05939c5a1a0ba9d527`.
- Shared processor: `google/siglip2-base-patch16-naflex`
  at `b53b807d3a2d5e2b3911292f2d69e5341cdc064c`.
- Unchanged production adapter: `src/main/runtime/hayai-bboxes.py`, SHA-256
  `f5284ca7835f7d88549021b15a5c70f85779285ef29dbf20e20369876aec1903`.
- Hardware/runtime: RTX 4090; PyTorch `2.14.1+cu126`; existing Python 3.12.7
  Hayai environment. No package upgrades or new app releases.

Downloaded files were checked against the pinned Hugging Face metadata:
LFS SHA-256 for weights and Git blob hashes for other files, plus local SHA-256
inventory. Remote Python imports and inference entry points were inspected before
execution. A pinned local SigLIP vision configuration is supplied in memory to
avoid the new model constructor resolving an unpinned remote configuration.
The immutable downloaded files were not edited.

Loading reports two unused training heads, `decoder.ids_head.weight` and
`decoder.ids_norm.weight`. The model card describes IDS as training-only.
No inference weights were reported missing. The new tokenizer has the same
SHA-256 as the existing tokenizer.

## Sample and methodology

Chinese images/references are exactly those from the
[previous audit](hayai-chinese-ocr-audit-20261020.md): 68 manual regions and the
66 matched automatic regions, from 20 images across four Chinese-language works.
Automatic regions exclude R026 (merged adjacent clipped dialogue) and H005
(unmatched sound effect). This is selected-region recognition accuracy, not full
page detection recall.

Japanese: all 109 annotated regions on the 12 images in
[Ceynou/comictxt ground_truth](https://github.com/Ceynou/comictxt/tree/main/ground_truth).
The exact source commit and each source hash are saved in `japanese-source.json`.
Annotations were loaded before inference without correction based on model output.
They include 99 vertical and 10 horizontal regions, monochrome manga, dialogue,
handwriting and sound effects. Pages and selected changed crops were visually
inspected. These are public annotations, not independently validated human gold;
the model author already cites this benchmark, so it is not independent holdout.

Chinese references were assistant-transcribed before inference in the prior task,
not human gold. The prior development/within-title-heldout split remains fixed.
No statistical significance or broad language accuracy is claimed.

Normalization: NFKC, then alphanumeric characters only; whitespace/punctuation
excluded, character variants retained. Identical images, crop geometry, pinned
processor, batch size 8, max output 128 tokens, and repetition penalty 1.0 were
used. Only model/version, patch budget, and explicitly labeled generation mode
vary. Each recognition corpus ran three times with exact repeated-output checks.
Timing is median of runs 2–3 with CUDA synchronization; includes processor work,
excludes model loading, file reading, detection, translation and rendering.

## Recognition comparison

| Configuration                           | Chinese automatic errors / 760 | Chinese exact / 66 | Japanese errors / 939 | Japanese exact / 109 |
| --------------------------------------- | -----------------------------: | -----------------: | --------------------: | -------------------: |
| Existing v2, 256                        |                    90 (11.84%) |                 23 |            59 (6.28%) |                   86 |
| v2.5, 256, default fast path            |                    84 (11.05%) |                 28 |            72 (7.67%) |                   78 |
| v2.5, 384, default fast path            |                    79 (10.39%) |                 29 |            77 (8.20%) |                   76 |
| v2.5, 512, default fast path            |                     75 (9.87%) |                 31 |            57 (6.07%) |                   81 |
| v2.5, 512, module reference path        |                    78 (10.26%) |                 30 |            57 (6.07%) |                   81 |
| **v2.5, 512, fast engine / graphs off** |                **77 (10.13%)** |             **30** |        **57 (6.07%)** |               **81** |

The default fast path passed these crop tests but subsequently failed the page
batch. The final row is the batch/worker-tested configuration.
The module reference path did not restore Japanese exact-match accuracy.

Chinese script/orientation details for the batch-tested configuration:

| Group                           | Characters | Existing errors | v2.5 errors |
| ------------------------------- | ---------: | --------------: | ----------: |
| Simplified, horizontal + angled |        245 |              33 |          20 |
| Traditional, horizontal         |        218 |              25 |          30 |
| Traditional, vertical           |        297 |              32 |          27 |

Development automatic crops: 51 → 48 errors / 494 characters.
Within-title heldout automatic crops: 39 → 29 / 266.
Manual Chinese crops: 86 → 79 / 776; exact 25 → 31 / 68.
Automatic Chinese paired outcomes: 19 regions improved, nine worsened.
Japanese paired outcomes: nine improved, eleven worsened.

Examples of regressions include a Japanese phrase repeated twice where the old
model read it once, and Chinese `亂` being read as `凱`. Improvements are not a
general solution to visually similar Chinese character confusion.

| Recognition timing              | Existing v2 | v2.5 graphs off |
| ------------------------------- | ----------: | --------------: |
| Chinese automatic, 66 regions   |     1.815 s |         1.939 s |
| Japanese annotated, 109 regions |     1.696 s |         2.002 s |

The failed default graph path measured 0.729 s and 0.958 s respectively.
Peak allocated PyTorch CUDA memory in these runs was approximately 704–705 MiB
for the old model and 1,066–1,067 MiB for the tested new configuration. These are
process-local allocator measurements including model/inference caches, not total
system GPU memory or universal deployment requirements.

## Page/worker integration and failure

The evaluation loader delegates to the production adapter's `main`, `serve`,
`process_page`, crop, output-schema, normalization and memory-release code.
Only model loading/identity and new-model generation options are supplied by the
evaluation adapter. It defaults to 512 patches and disables CUDA graphs.

Japanese page detection uses actual production TypeScript
`detectPageTextRegions` → `buildHayaiRegionManifest` with DirectML. Ten source
WebP files were converted to PNG because direct Electron image loading rejected
WebP. Decoded RGB pixels and dimensions were asserted identical; original source
hashes and conversion hashes are retained. Chinese manifests reuse the actual
production-detector results from the prior audit.

The first 32-page OCR batch with upstream defaults failed on page 12,
`p_073.jpg`, after 11 successful pages. The error was
`CUDA error: an illegal memory access was encountered`.
The model's automatic float32/reference fallbacks could not recover the poisoned
CUDA context. This was one observed failure; its underlying CUDA-graph cause was
not fully localized or patched upstream.

A fresh process with `use_cuda_graph=False` completed all **32/32** pages and
produced **175 dialogue regions**. Four additional persistent-worker requests,
including the failed page, exactly matched batch JSON results. Geometry remained
locked to the input regions. This validates this sampled Windows CUDA path only:
CPU, ROCm, macOS, packaging and full UI workflows were not validated.

## Evidence and use

Local directory: `.tmp/hayai-v25-audit-20261020/`.

- `model-manifest.json`, `hf-info.json`: immutable model identity and inventory.
- `japanese-source.json`, `normalized-images.json`: source/decoded-pixel hashes.
- `references.json`: combined fixed references, with a hash in every result.
- `v2-256-results.json`, `v25-*-results.json`: raw predictions, metrics and timings.
- `summary.json`, `changes.json`: independently recomputed metrics and paired changes.
- `batch-stderr.txt`: original graph-path failure.
- `batch-nograph-stdout.jsonl`, `smoke-summary.json`: successful batch and geometry checks.
- `worker-stdout.jsonl`: four successful persistent-worker responses.
- `adapter.py`: isolated new-model loader over existing production page/worker code.
- `compare.py`, `summarize.py`, `verify_smoke.py`: repeatable evaluation.

From the repository root, the locally installed evaluation model can be rerun:

```powershell
$env:PYTHONUTF8 = '1'
$env:HAYAI_AUDIT_NO_CUDA_GRAPH = '1'
& ocr-runtime/.venv-hayai-cuda-cu126/Scripts/python.exe `
  .tmp/hayai-v25-audit-20261020/adapter.py `
  --batch .tmp/hayai-v25-audit-20261020/batch-nograph.json `
  --device gpu --max-num-patches 512
```

The evaluation model/code remains local and pinned; it does not replace the
installed app's selected model. Production source and UI are unchanged, so no
app build/UI capture was run. Temporary images remain local with the evidence;
the prior cleanup policy block was not retried through another tool or runtime.

Before any global promotion, require an independent Japanese regression set,
broader traditional-Chinese evaluation, and resolution or deliberate disabling
of the graph-path failure with performance measurements. A simplified-Chinese-only
opt-in is a more defensible candidate than replacing every language's default.
