# Non-Paddle Chinese OCR comparison — 2026-10-20

## Outcome

Executed **8 non-Paddle families, 19 model/configuration combinations**, each on
all 134 fixed crops from the same 20 image chunks used in the earlier audits.
HunyuanOCR 1.5 was also rerun in a separate process: all 134 raw output strings
matched exactly. There are 2,680 completed region evaluations including that
repeat, but only 20 source images and 68 selected text regions; the manual and
automatic crops overlap and must not be treated as independent samples.

**HunyuanOCR 1.5 is the strongest non-Paddle candidate on the matched automatic
crops:** 8 edits / 760 reference characters, 61/66 normalized-exact regions.
HunyuanOCR 1.0 follows at 10 edits and 59 exact regions. The previously adjusted
official PP-OCRv6 medium had 14 edits and 59 exact regions; unchanged Hayai v2
had 90 edits and 23 exact regions.

This supports further evaluation of Hunyuan for a Chinese-specific route,
while keeping Japanese Hayai unchanged. It does not establish a universal
ranking or justify silently replacing the app default. No production code,
settings, UI, dependencies, model cache or language routing was changed.

## What actually ran

| Family                   | Executed alternatives                                                               | Chinese scope                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| CnOCR native recognizers | general, scene, doc `densenet_lite_136-gru`                                         | Chinese-focused native models; documented simplified Chinese support, not traditional/vertical coverage |
| chineseocr_lite          | bundled DBNET + CRNN                                                                | Chinese-focused lightweight OCR                                                                         |
| Alibaba DuGuang          | CRNN, ConvNextViT general Chinese/English recognition                               | Chinese/English OCR                                                                                     |
| EasyOCR                  | simplified generation 1, simplified generation 2, traditional generation 1          | Chinese-specific recognition weights in a multilingual toolkit                                          |
| GOT-OCR 2.0              | official Transformers checkpoint                                                    | OCR model with Chinese/English support                                                                  |
| HunyuanOCR               | 1.5 root checkpoint and archived 1.0                                                | Multilingual OCR VLM supporting Chinese, not Chinese-exclusive                                          |
| DeepSeek-OCR 2           | official checkpoint, Free OCR prompt                                                | OCR VLM supporting Chinese, not Chinese-exclusive                                                       |
| Tesseract                | `tessdata_best` and `tessdata_fast`, each with automatic/horizontal/vertical layout | Chinese language weights; six configurations, not six unrelated OCR engines                             |

Primary sources:
[CnOCR](https://github.com/breezedeus/CnOCR),
[chineseocr_lite](https://github.com/DayBreak-u/chineseocr_lite),
[DuGuang implementation](https://github.com/modelscope/modelscope/tree/master/modelscope/models/cv/ocr_recognition),
[EasyOCR](https://github.com/JaidedAI/EasyOCR),
[GOT-OCR 2.0](https://huggingface.co/stepfun-ai/GOT-OCR-2.0-hf),
[HunyuanOCR](https://huggingface.co/tencent/HunyuanOCR),
[DeepSeek-OCR 2](https://huggingface.co/deepseek-ai/DeepSeek-OCR-2),
[Tesseract model families](https://tesseract-ocr.github.io/tessdoc/Data-Files.html).

CnOCR's Paddle-derived recognition/detection options were explicitly excluded.
The new candidates use no Paddle inference models. Pure geometric ordering
helpers were reused from the app's existing Python adapter; that is not Paddle
model inference. The existing Paddle result appears only as a prior comparator.

## Fixed inputs and scoring

The source images, coordinates and references are unchanged from the
[Chinese Hayai audit](hayai-chinese-ocr-audit-20261020.md) and
[v2.5 audit](hayai-v25-comparison-20261020.md). The subsequent
[Paddle comparison](chinese-ocr-comparison-20261020.md) explains why fixed white
padding was selected. Every new candidate receives the same RGB source crop
with a 16 px white border; no neighboring source pixels are added.

- 68 manual crops: 776 normalized reference characters.
- 66 production-matched automatic crops: 760 characters.
- Automatic groups: simplified horizontal/angled 245; traditional horizontal
  218; traditional vertical 297 characters.
- NFKC followed by alphanumeric-only normalization, with no script conversion.
  Spaces and punctuation are excluded; character variants remain errors.
- No output is selected by reference text, and no spelling correction or
  simplified/traditional conversion is applied.
- Outer detection boxes remain fixed. This evaluates recognition of selected
  regions, including any inner line detection/order errors, **not full-page
  detector recall or end-to-end translation quality**.

The original references were assistant-transcribed, not independent human gold.
The sample has already been inspected and used for earlier experiments.
It is not a fresh heldout benchmark. Visual review also found a questionable
reference/crop correspondence: AR034's reference includes `了` after `不用麻煩`,
while that character is not apparent in the actual tested crop. The fixed
reference was not edited to improve any candidate's score. Tiny differences
between top candidates should be interpreted in light of these limitations.

## All automatic-crop results

Each row below ran all 66 automatic and all 68 manual crops. Horizontal-only
recognizers and script-specific weights were deliberately also tested outside
their supported scope to expose coverage limits; their aggregate score must
not be mistaken for their accuracy on supported horizontal simplified text.
The separate script/orientation columns are essential.

| Configuration                     | Errors / 760 |    CER | Exact / 66 | Simplified errors / 245 | Traditional horizontal / 218 | Traditional vertical / 297 |
| --------------------------------- | -----------: | -----: | ---------: | ----------------------: | ---------------------------: | -------------------------: |
| chineseocr-lite                   |          236 | 31.05% |         14 |                       9 |                           75 |                        152 |
| cnocr-densenet_lite_136-gru       |          368 | 48.42% |         13 |                      14 |                           59 |                        295 |
| cnocr-doc-densenet_lite_136-gru   |          372 | 48.95% |         12 |                      15 |                           60 |                        297 |
| cnocr-scene-densenet_lite_136-gru |          372 | 48.95% |         13 |                      16 |                           59 |                        297 |
| DeepSeek-OCR-2                    |          208 | 27.37% |         33 |                       6 |                            7 |                        195 |
| duguang-ConvNextViT               |          305 | 40.13% |         31 |                       8 |                            4 |                        293 |
| duguang-CRNN                      |          310 | 40.79% |         26 |                       5 |                           10 |                        295 |
| easyocr-zh_sim_g1                 |          382 | 50.26% |         13 |                      13 |                           75 |                        294 |
| easyocr-zh_sim_g2                 |          381 | 50.13% |         13 |                      12 |                           74 |                        295 |
| easyocr-zh_tra_g1                 |          366 | 48.16% |         21 |                      71 |                            3 |                        292 |
| GOT-OCR-2.0-hf                    |          252 | 33.16% |         23 |                       2 |                           32 |                        218 |
| HunyuanOCR-v1.0                   |           10 |  1.32% |         59 |                       0 |                            2 |                          8 |
| HunyuanOCR 1.5                    |            8 |  1.05% |         61 |                       0 |                            0 |                          8 |
| tesseract-best-auto               |          225 | 29.61% |         21 |                      79 |                           45 |                        101 |
| tesseract-best-horizontal         |          388 | 51.05% |         17 |                      78 |                           33 |                        277 |
| tesseract-best-vertical           |          495 | 65.13% |          7 |                     224 |                          201 |                         70 |
| tesseract-fast-auto               |          424 | 55.79% |         14 |                      77 |                           53 |                        294 |
| tesseract-fast-horizontal         |          376 | 49.47% |         16 |                      71 |                           37 |                        268 |
| tesseract-fast-vertical           |          522 | 68.68% |          5 |                     226 |                          196 |                        100 |

Prior comparison, same automatic reference set:

| Prior configuration               | Errors / 760 | Exact / 66 | Simplified / 245 | Traditional horizontal / 218 | Traditional vertical / 297 |
| --------------------------------- | -----------: | ---------: | ---------------: | ---------------------------: | -------------------------: |
| Existing Hayai v2                 |           90 |         23 |               33 |                           25 |                         32 |
| Validated Hayai v2.5 graphs-off   |           77 |         30 |               20 |                           30 |                         27 |
| Adjusted official PP-OCRv6 medium |           14 |         59 |                6 |                            0 |                          8 |

Manual-crop top results:

| Candidate                         | Errors / 776 | Exact / 68 |
| --------------------------------- | -----------: | ---------: |
| HunyuanOCR 1.0                    |           13 |         60 |
| HunyuanOCR 1.5                    |           16 |         62 |
| Adjusted official PP-OCRv6 medium |           17 |         61 |

Hunyuan 1.5 wins automatic aggregate CER and exact regions. Version 1.0 has
fewer manual-crop edits, while 1.5 has more exact manual regions. This is not
uniform dominance of the newer checkpoint on every metric.

## What the failures show

- Hunyuan 1.5 has zero normalized edits on the tested simplified and traditional
  horizontal automatic crops. Its eight edits are all in vertical traditional
  text: omission, character-variant substitution, and right-to-left column order.
  Examples include `哈哈！抱歉！ → 抱歉！哈哈！`,
  `我小時候好像有拌過 → 我小時候好像有過`, and `醃 → 腌`.
  One scored omission is the questionable AR034 reference noted above.
- GOT-OCR 2.0 has only 2/245 simplified errors, but 218/297 vertical traditional
  errors. Good horizontal recognition does not translate into reliable vertical
  manga column order.
- DeepSeek-OCR 2 has 6 simplified and 7 traditional-horizontal errors, but 195
  vertical errors. It completed every crop without hitting the token limit.
  Its model size alone did not give better results on this manga layout.
- EasyOCR traditional recognition has only 3/218 horizontal traditional errors.
  Its native CRAFT/readtext path was poor on the vertical sample. Simplified
  weights also have predictable traditional-character vocabulary limitations.
- DuGuang CRNN has 5/245 simplified errors; ConvNextViT has 4/218 horizontal
  traditional errors. The tested line-recognition path fails badly on vertically
  rotated Chinese glyphs. These are potentially useful horizontal recognizers,
  not demonstrated replacements for all Chinese manga.
- CnOCR native models and chineseocr_lite perform much better on simplified
  horizontal text than on traditional/vertical text. The native CnOCR models'
  documented scope excludes traditional and vertical support.
- Tesseract's explicitly vertical model/PSM setting improves its vertical
  subset but damages horizontal text. No reference-driven “choose the best
  setting for each region” composite was reported.

## Adapter and runtime details

CnOCR and DuGuang are line recognizers in this experiment. They share the
non-Paddle `chineseocr_lite` DBNET detector at short side 512. Its perspective
crop helper rotates tall lines CCW. The same detector/crops are used for
chineseocr_lite CRNN. CnOCR ONNX preprocessing/CTC decoding follows the installed
native implementation: PIL grayscale, height 32, width preserving aspect ratio,
pixel values divided by 255, explicit input lengths, final-vocabulary-index CTC
blank. DuGuang uses the official model classes, matching RGB resizing/black
padding/chunking and CTC dictionaries; all checkpoint keys loaded strictly.
The DuGuang pipeline is a shared-detector adapter, not its full official
page-detection pipeline. Likewise, these are not default CnOCR end-to-end runs.

EasyOCR uses its CRAFT detector, each chosen Chinese recognizer, greedy decoding,
batch size 8, and normal `readtext` processing. Nonempty line outputs are ordered
using the existing geometric vertical-column helper when geometry indicates
vertical text, otherwise the existing horizontal canonical sort. The detector
and recognition models are independent of Paddle. No annotated orientation is
passed to any sorter.

GOT-OCR uses its native plain OCR processor and eager attention because its
Transformers implementation rejected SDPA. Hunyuan uses native Transformers
SDPA with the fixed prompt:

> 提取图片中的所有文字，按照阅读顺序输出原文，不要翻译，不要解释。

Hunyuan uses greedy decoding and repetition penalty 1.08. No DFlash draft model,
vLLM, quantization, or llama.cpp acceleration was tested.

DeepSeek uses its official `infer` implementation, `Free OCR` prompt, 1024 base
resolution, 768 local image size, crop mode enabled, and eager decoder attention.
Its model-specific vision attention retains the upstream SDPA implementation.
A runtime wrapper caps generation at 384 new tokens, matching the other VLM
tests; the upstream weight/source files were not edited. Evaluation mode returns
the text directly, with result-image saving disabled. Its upstream adapter emits
missing-attention-mask/pad-token warnings, which are retained in the log.
No successful VLM run hit the 384-token limit.

All GPU inference used this PC's RTX 4090. Most runs use the existing torch
2.9.1+cu126 / Transformers 5.13.1 environment plus experiment-local dependencies.
DeepSeek uses isolated Transformers 4.46.3 and tokenizers 0.20.3 as required by
its custom implementation, with the same torch installation.

CnOCR/chineseocr_lite use ONNX Runtime CPU with four threads. Tesseract uses the
Windows `tesserocr` 2.11.0 wheel linked to **Tesseract 4.1.3**, not Tesseract 5.
Its language weights are pinned current `tessdata_best`/`tessdata_fast`, with
`chi_sim+chi_tra` at PSM 3/6 and `chi_sim_vert+chi_tra_vert` at PSM 5.
The initial PyPI source build failed; the published Windows wheel resolved it.
A relative tessdata path resolved its Unicode absolute-path initialization issue.

For 66 automatic crops, Hunyuan 1.5 took **21.27 seconds initially and 25.54
seconds on repeat**; 1.0 took **23.17 seconds**. Prior adjusted Paddle took about
4.84–5.08 seconds, and prior Hayai recognition about 1.82 seconds. Different
batching, detection stages, environments and some concurrent experiment work
make these harness-cost measurements, not a controlled runtime speed ranking
or expected app latency. Hunyuan's current sequential implementation is
materially slower. Hunyuan 1.5 repeat peak torch memory was 2,112,363,008 bytes
allocated / 2,264,924,160 bytes reserved; this is process torch accounting, not
total system GPU usage.

## Artifact identity and verification

| Model                            | Pinned repository revision                 |                                          Weight bytes |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------------: |
| `stepfun-ai/GOT-OCR-2.0-hf`      | `d3017ef2c2c1395888c8d635c5e0508bcb0ac78d` |                                         1,121,114,488 |
| `tencent/HunyuanOCR`, root = 1.5 | `47644ecc4fc854efa4f505155158831f36773ee4` |                                         2,239,932,512 |
| Same repository, `v1.0/` archive | same pinned revision                       | Four shards; exact sizes and hashes in local manifest |
| `deepseek-ai/DeepSeek-OCR-2`     | `aaa02f3811945a91062062994c5c4a3f4c0af2b0` |                                         6,778,573,880 |

Hugging Face downloads were checked against pinned LFS SHA-256 or Git blob
metadata. EasyOCR downloads passed the package's published model MD5 checks
and have local SHA-256 inventory. CnOCR archives were checked against pinned
Hugging Face LFS SHA-256. DuGuang model files were checked against ModelScope
file metadata; its source code is pinned to a Git commit. Tesseract language
weights use pinned Git revisions and local SHA-256 inventory. All 20 source
image hashes and all reference fields/coordinates were verified unchanged.

Local evidence directory: `.tmp/nonpaddle-ocr-20261020/`.

- `download_*.py`, model manifests, and `duguang-source/`: download provenance
  and inspected model/preprocessing implementations.
- `common.py`: frozen crop/scoring contract.
- `run_light.py`, `run_easy.py`, `run_vlm.py`, `run_deepseek.py`,
  `run_tesseract.py`, `duguang_adapters.py`: executable inference adapters.
- `results/*.json`: every raw prediction, per-region timing, grouping and scores.
- `hunyuan-errors.png`: visually inspected residual-error crops.
- `finalize.py`, `verification.json`: independent edit-distance recount,
  reference and source checks, all model inventories, and 134/134 Hunyuan repeat
  parity. All 19 configurations completed all 134 crops with no per-crop caught
  inference failures.

Use `ocr-runtime/.venv-gpu-cuda-transformers-cu126/Scripts/python.exe` with
`PYTHONUTF8=1` from the repository root. `run_light.py duguang` selects DuGuang;
`run_vlm.py HunyuanOCR` selects 1.5 and `run_vlm.py HunyuanOCR-v1.0` selects 1.0.
Each script uses only its experiment-local dependencies/model files plus the
unchanged source images. Existing app environments were not upgraded.

The unchanged Hayai production adapter SHA-256 remains
`f5284ca7835f7d88549021b15a5c70f85779285ef29dbf20e20369876aec1903`.
Production/UI tests were unnecessary because only local experiment files and
this report were added. Before adoption, evaluate fresh independently
transcribed works, actual page/worker integration, language-specific routing,
and optimized batch/runtime behavior.
