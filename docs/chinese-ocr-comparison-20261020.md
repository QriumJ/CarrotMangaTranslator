# Chinese OCR candidate comparison — 2026-10-20

## Decision

Keep the existing Hayai v2 for Japanese. For a future Chinese-specific route,
**official PP-OCRv6 medium detection + medium recognition is the first candidate**
on this corpus. With a 16 px white border around the unchanged input crop and
blank recognition results removed before geometric reading-order determination,
it produced **14 errors / 760 characters (1.84%)**, with **59 / 66 exact regions**.
The existing Hayai baseline produced 90 errors (11.84%), with 23 exact regions.
This is 84.4% fewer character edits on these selected regions.

No production source, language routing, Japanese model, runtime package, or
installed model default was changed. This is an executed local comparison, not
a shipped Chinese OCR integration or full-page translation benchmark.

**Relationship to the existing app:** the app's `Paddle OCR` option already
uses PP-OCRv6, with medium detection/recognition in the standard configuration
and explicitly selected small models in economy mode. `paddle-legacy` is an
internal route identifier, not an old model-version label. The official winning
weights in this experiment came from that existing local cache. This experiment
does not establish an improvement over the app's existing Paddle route: it
compares Hayai against region-cropped Paddle inference with added padding and
explicit Chinese vertical ordering. The existing Paddle route normally predicts
on the page image and applies its own filtering, merging and reading-order
logic. Benchmark that actual route before deciding what integration changes
are necessary.

## Candidates and sources

- [Official PP-OCRv6 medium](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_safetensors):
  dedicated text recognition supporting Chinese, including traditional Chinese;
  a multilingual OCR model, not Chinese-exclusive.
- [Kellenok PP-OCRv6_manga v0.2](https://huggingface.co/Kellenok/PP-OCRv6_manga):
  a Chinese/Japanese manga adaptation. Tested its FP32 ONNX detector and recognizer.
- [CnOCR model catalog](https://cnocr.readthedocs.io/zh-cn/latest/models/) was
  reviewed during selection. CnOCR exposes multiple recognition backends,
  including PaddleOCR families, so it is not one additional independent model
  accuracy result. No CnOCR runtime benchmark is claimed here.

Author benchmark scores were not used as local test results. Both candidate
families were run on the retained images from the previous Hayai comparison.

Pinned artifacts:

| Component                                            | Hugging Face revision                      | Weight bytes | Weight SHA-256                                                     |
| ---------------------------------------------------- | ------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| `PaddlePaddle/PP-OCRv6_medium_det_safetensors`       | `4236c2b61741a259c091fd879dcc4edc339e916c` |   88,020,412 | `bd393266c02e1a680b1b34c301d5d0d81e6290440b7f8ab0f5d5032276b17eb1` |
| `PaddlePaddle/PP-OCRv6_medium_rec_safetensors`       | `024cad6a831de75c2c3c26e711ba8c4a82ccd24b` |   76,741,720 | `5f43c16f2a684b1d2284662178bdb604febd3d6bfdb5ca73828d08d0f7c0c3e9` |
| `Kellenok/PP-OCRv6_manga`, `det/manga_det_v0.2.onnx` | `b3b65cbd29cd0240a6b471e49373eb5a80abacee` |    1,816,954 | `d132078c46e292b226fb5a2ca52a7612ad319262dfdf493e7d8e3be435295978` |
| Same repository, `rec/manga_rec_v0.2.onnx`           | same                                       |   21,167,540 | `de12c84c63e62c80339e882e675983d886670dcb6f0147e1ed041afd6fa81888` |

The official models were already cached; their files were checked against pinned
remote metadata. The manga models were downloaded to an isolated experiment
directory and likewise verified. Full configuration, processor, dictionary and
example inventories are in `official-manifest.json` and `manga-manifest.json`.

## Fixed sample and comparison contract

See the [Chinese audit](hayai-chinese-ocr-audit-20261020.md) and
[Hayai v2.5 comparison](hayai-v25-comparison-20261020.md) for source URLs and
baseline methodology. The same 20 image chunks across four works were reused:
simplified Chinese color comics, traditional Chinese color webtoon text, and
traditional Chinese vertical monochrome manga. All 20 input hashes were checked.

There are 68 manually selected crops (776 characters) and 66 matched production
automatic crops (760 characters). These are overlapping views of the same
content, not 134 independent samples. Outer automatic regions are unchanged.
Each new OCR pipeline detects and recognizes text lines inside those regions.
Detection omissions, duplicate text and incorrect line order count as errors.
This does not measure full-page detection recall; the two prior unmatched/
contaminated automatic regions remain excluded.

References were assistant-transcribed before the earlier Hayai inference, not
independently validated human gold. They were not corrected after seeing these
results. Source reference SHA-256:
`8fd7cd13b14ca729fba6004dc7d56d76e3802d18785ef73cde641948b87df51a`.
Normalization remains NFKC followed by alphanumeric characters only: punctuation
and spacing are excluded, but simplified/traditional/Japanese variants are not
collapsed. "Exact" means exact under this normalization.

The previous development/within-title heldout split is retained for reporting.
Both splits' failures were inspected before the padding experiment. Therefore,
the final adjusted results are exploratory and the old heldout split is **not
an untouched final validation set**. New titles and independent transcription
are needed before a broad production accuracy claim.

## Results

Final adjusted candidates add a fixed 16 px white border on all sides, without
fetching any neighboring pixels from the original page. Empty/whitespace-only
line outputs are removed before determining reading order. No dictionary
correction, reference-based output choice, character conversion, or annotated
orientation is used.

| Pipeline                                                    | Automatic errors / 760 | Automatic exact / 66 | Manual errors / 776 | Manual exact / 68 |
| ----------------------------------------------------------- | ---------------------: | -------------------: | ------------------: | ----------------: |
| Existing Hayai v2, prior unchanged baseline                 |            90 (11.84%) |                   23 |                  86 |                25 |
| Hayai v2.5, prior validated graphs-off run                  |            77 (10.13%) |                   30 |                  79 |                31 |
| **Official medium det + medium rec**                        |         **14 (1.84%)** |               **59** |                  17 |                61 |
| Official medium det + manga rec                             |             18 (2.37%) |                   55 |                  21 |                58 |
| Manga det + official medium rec, perspective crop           |             32 (4.21%) |                   50 |                  32 |                51 |
| Manga det + manga rec, perspective crop                     |             18 (2.37%) |                   52 |                  14 |                55 |
| Manga det + official medium rec, author's axis-aligned crop |             37 (4.87%) |                   46 |                  35 |                50 |
| Manga det + manga rec, author's axis-aligned crop           |             18 (2.37%) |                   52 |                  18 |                53 |

All error and exact-match counts were independently recomputed.
Official-detector outputs were rerun in a separate
process: all 134 predictions matched byte-for-byte for each recognizer.

Automatic script/orientation breakdown:

| Group                           | Characters | Hayai v2 errors | Hayai v2.5 errors | Adjusted official PP-OCRv6 errors |
| ------------------------------- | ---------: | --------------: | ----------------: | --------------------------------: |
| Simplified, horizontal + angled |        245 |              33 |                20 |                                 6 |
| Traditional, horizontal         |        218 |              25 |                30 |                                 0 |
| Traditional, vertical           |        297 |              32 |                27 |                                 8 |

Automatic split breakdown: official medium has 4/494 development errors and
10/266 old-heldout errors. Manga's paired models have 12/494 and 6/266 with
perspective crops, or 13/494 and 5/266 with the author's crop. Manga also has
fewer manual-crop edits with perspective crops. Thus the official candidate
wins overall automatic CER and exact regions here, not every subset.

## Why the adapter matters

The first unpadded run gave official medium 53 automatic errors and 30 manual
errors. Tight crop edges caused missed or fragmented lines, especially vertical
text; some overlapping fragments repeated characters. A white border lets the
line detector see space around boundary characters, reducing automatic errors
to 14 without adding information from outside the original input.

The initial manga pipeline gave 160 automatic errors. Many tiny detections
recognized as blank nevertheless influenced the inherited geometric orientation
vote, causing vertical columns to be read horizontally. Excluding these empty
outputs alone reduced errors to 90; adding the same fixed border reduced them
to 18. The initial 160-error result is an adapter failure observation, not a
fair final ranking of the manga model.

All four detector/recognizer pairings were tested to separate localization from
recognition. Perspective crops use PaddleX `CropByPolys("quad")`; the additional
manga run matches its author's axis-aligned crop and CCW vertical rotation.
Official inputs use RGB as required by PaddleX's Transformers predictor; manga
inputs use the author's BGR preprocessing. Detector thresholds were left at
official processor defaults or the manga example's .15/.25/1.4 settings.

Reading order reuses the existing production geometry helpers in
`paddleocr-bboxes.py`, choosing vertical ordering from detected line geometry.
The experiment explicitly calls the vertical column sorter for Chinese too;
the current production `sort_textline_group` only selects that path for Japanese.
Single-character fragments and nearly aligned horizontal fragments can still
cause ordering errors. No production helper was changed.

Residual official failures include `緩一下啦 → 緩啦`, `均勻 → 均匀`,
dropped characters, reversed fragments in `啊！！！有反应？` and
`唉…怎么？坏了？`, and extra `fr` on one vertical crop. Manga retains errors
such as `沒 → 没`, `學 → 学`, and `樣 → 様`. Neither candidate is error-free.

## Runtime and practical limits

Official models ran FP32 on RTX 4090 with torch 2.9.1+cu126 and Transformers
5.13.1. Manga models ran FP32 OpenVINO 2026.4.1 on CPU with four threads.
OpenVINO was installed only under the ignored experiment's `deps/` directory.
Existing environments and app dependencies were not upgraded.

For 66 automatic regions, official detection + recognition took about
**4.84–5.08 seconds**, excluding initialization and image loading. The manga
paired models took 3.74 seconds with perspective crops or 4.06 seconds with
author crops in these runs. Prior Hayai recognition was about 1.82 seconds.
These are different runtime/device and batching configurations: the new harness
uses sequential line recognition, while Hayai used batched bubble recognition.
They demonstrate the current harness cost, not a controlled model speed ranking
or expected packaged-app latency. No new full-page translation/rendering,
worker integration, memory benchmark, or CPU-only official benchmark is claimed.

## Evidence and reproduction

Local ignored evidence: `.tmp/chinese-ocr-comparison-20261020/`.

- `download.py`: pinned artifact retrieval/verification.
- `compare.py`: initial unpadded four-way comparison.
- `blank-filtered-results.json`: unpadded outputs reordered after blank filtering.
- `compare-padded.py`: common 16 px border and blank filtering, results in `padded/`.
- `compare-author-crop.py`: author-style manga crops and official repeat,
  results in `author-crop/`.
- Each run contains predictions, line polygons, metrics, timings and environment.
- `failure-crops.png`: visually inspected diagnostic crop sheet.
- `finalize.py` / `verification.json`: independently recomputed error counts,
  unchanged references, 20 source image hashes, complete model checks,
  official repeated-output parity, and evidence hashes.

Run scripts from the repository root with
`ocr-runtime/.venv-gpu-cuda-transformers-cu126/Scripts/python.exe` and
`PYTHONUTF8=1`. They depend on the retained prior raw images and original fixed
references. The experiment is not an installable model release.

The existing Hayai adapter remains SHA-256
`f5284ca7835f7d88549021b15a5c70f85779285ef29dbf20e20369876aec1903`.
No production or UI changes were made, so app build/UI tests were not run.
Follow-up integration should be restricted to an explicit Chinese-language
route, preserve Japanese Hayai, handle the added line detector and reading order,
and validate on fresh independently transcribed works before enabling a default.
