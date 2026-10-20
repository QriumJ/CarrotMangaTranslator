# Current Hayai Chinese comic OCR audit — 2026-10-20

Follow-up: [v2.5 local integration and Japanese/Chinese comparison](hayai-v25-comparison-20261020.md).
The model/settings in this original audit remain unchanged.

## Decision

No production settings or model artifacts were changed. On this small sample,
preprocessing and decoding changes did not produce a reliable improvement over
the current pipeline. Padding helped manually selected tight crops, but that
benefit disappeared with the app's automatic regions. Do not promote the manual
crop result as an app quality improvement.

This completes an inference-tuning investigation of the existing pinned model.
It does not establish that training or every possible decoding strategy cannot
improve Chinese recognition. Hayai v2.5 was not installed or evaluated; it remains
the subsequent Japanese/Chinese comparison stage requested by the user.

## Runtime and sample

- Production adapter: `src/main/runtime/hayai-bboxes.py`, SHA-256
  `f5284ca7835f7d88549021b15a5c70f85779285ef29dbf20e20369876aec1903`.
- Model: `JustANormalTinkerer/hayai-ocr-v2`, revision
  `53aed13296a9d39bd7c0c0bcba745010d8142b5b`.
- Processor revision: `b53b807d3a2d5e2b3911292f2d69e5341cdc064c`.
- Existing verified local cache, RTX 4090, PyTorch `2.14.1+cu126`.
- Default: 256 image patches, 128 generated tokens, batch 8, greedy decoding,
  repetition penalty 1.0. Weights are float32; the pinned model's own generation
  code internally enters CUDA float16 autocast. Disabling that autocast in an
  isolated experiment did not change these transcriptions.
- 20 page/chunk images from four Chinese-language works; 68 manually selected
  text regions, 776 alphanumeric reference characters.
- Development: 42 regions / 508 characters / 12 images.
- Within-title holdout: 26 regions / 268 characters / eight additional images.

Sources:

1. [非人哉, episode 1](https://www.kuaikanmanhua.com/webs/comic-next/5180):
   simplified Chinese, two images.
2. [画里仙](https://m.kuaikanmanhua.com/webs/world/123907249534195400776):
   simplified Chinese color webcomic; five development and four heldout chunks.
3. [洙熙0, episode 1](https://www.webtoons.com/zh-hant/drama/zhuxi0/%E7%AC%AC1%E8%A9%B1/viewer?episode_no=1&title_no=3589):
   traditional Chinese localization of a Korean webtoon; three development and
   two heldout chunks.
4. [CCC official preview](https://event.creative-comic.tw/tcm2020hk/bookpreview/20preview.pdf):
   traditional Chinese, monochrome, vertical text; PDF pages 3–6, printed 72–75.
   The title was not independently verified.

References were visually transcribed by the assistant and fixed before each
split's first inference, with crop-sheet inspection. They are **not human gold**.
An ambiguous uncommon character was excluded before heldout inference. This is a
small convenience sample, not a representative accuracy benchmark.

## Results

CER is Levenshtein errors divided by reference characters after NFKC and retaining
only alphanumeric characters. Punctuation and whitespace are ignored. Simplified,
traditional, and Japanese character variants remain distinct. Lower is better.

| Input / candidate                        |     Development |         Heldout |
| ---------------------------------------- | --------------: | --------------: |
| Manual crop, default                     | 52/508 = 10.24% | 34/268 = 12.69% |
| Manual crop, 8% padding                  |  47/508 = 9.25% | 32/268 = 11.94% |
| Automatic crop, default                  | 51/494 = 10.32% | 39/266 = 14.66% |
| Automatic crop, 8% padding               | 55/494 = 11.13% | 39/266 = 14.66% |
| Automatic crop, grayscale + autocontrast | 51/494 = 10.32% | 39/266 = 14.66% |
| Automatic crop, sharpening               | 51/494 = 10.32% | 38/266 = 14.29% |
| Automatic crop, 384 patches              | 55/494 = 11.13% | 38/266 = 14.29% |
| Automatic crop, 512 patches              | 71/494 = 14.37% | 48/266 = 18.05% |

Sharpening changed total automatic-crop errors from 90 to 89, but fully correct
regions fell from 23/66 to 21/66. That is insufficient evidence to change the
default. Padding changed total automatic-crop errors from 90 to 94.

Automatic evaluation uses actual source `detectPageTextRegions` →
`buildHayaiRegionManifest`, DirectML, and the production Python crop helper with
floor/ceil boundaries. The initial 12-image automatic batch also ran through the
production Python CLI. Candidate comparisons use production recognition on the
same matched automatic boxes, without translation or rendering.

This is **not full-page end-to-end accuracy or detector recall**: references were
matched to automatic regions by IoU ≥ 0.3. R026 was excluded because its automatic
box also contains adjacent clipped dialogue; the H005 sound effect did not match
the threshold. The resulting 66 regions contain 760 reference characters. No
recognition-segment overrides occurred in the tested manifests.

Other development experiments:

- 128 / 384 / 512 / 768 patches: 159 / 54 / 66 / 122 errors out of 508.
- 2× Lanczos enlargement: 53 errors.
- Beam 2: 64 errors; 512 patches + beam 2: 76 errors.
- 4% / 8% / 15% padding: 51 / 47 / 53 errors.
- Grayscale / autocontrast / sharpening: 51 / 50 / 50 errors.
- Threshold 160 or 200: 64 errors each.
- White 8% padding: 49 errors.
- Projection-based line splitting at 128 / 256 / 384 patches: 130 / 61 / 56 errors.
  This diagnostic used annotated orientation and is not a deployable detector.
- Candidate selection using mean greedy-token log probability: baseline + padding
  gave 48 errors; baseline + contrast + sharpening gave 52; all five candidates
  gave 50. References were not used to select a candidate.

The confidence experiment first attempted the existing teacher-forcing scoring
helper. The pinned model's forward path failed with a GQA head mismatch. That
attempt has no valid metrics. The reported confidence experiment instead used an
output-head hook during actual generation and asserted text parity with the
previously recorded candidate outputs.

Observed residual failures include `熟水 → 熱水`, `幫 → 輩`, confusion between
visually similar characters, dropped repeated characters, and mixed character
variants. A language label or blanket simplified/traditional conversion cannot
repair all these errors. No dictionary correction or reference-dependent
replacement was added.

## Local evidence and rerun

Evidence directory: `.tmp/hayai-zh-audit-20261020/` (local, ignored by Git).

`audit-summary.json` binds model/source hashes, metrics, reference hashes and
source pages. `inventory.json` records downloaded image URLs and hashes;
`raw-inventory.json` records all temporary media hashes, including extracted PDF
images. `cleanup.json` records the cleanup status. **Cleanup is blocked**: automatic
approval review rejected both scoped recursive removal and a safer attempt to
delete only individually SHA-256-verified regular files, returning only
`blocked by policy`. No deletion command ran. The 137 downloaded/derived media
and HTML files remain in this audit's `raw/` directory; the isolated Electron
profile also remains. User library/originals/model caches were not targeted.

The retained Python/CJS experiment scripts and JSON results are local evidence,
not installed app functionality. `finalize.py` independently recomputes the
reported edit distances and asserts reference hashes and production-adapter
identity. App build/UI tests were not run because production code and UI were
unchanged.

To reconstruct the sample from the repository root after eventual cleanup, create `raw/`, run
`fetch.py`, `download.py`, `heldout_download.py`, and `pdf_extract.py` using Python
with Pillow (`pdf_extract.py` additionally needs pypdf). Run `prepare.py` and
`prepare_heldout.py`; verify their output against the retained reference hashes
before inference. Source URLs can expire or change: use the source pages to
refresh URLs, and require matching image hashes. Do not silently substitute new
bytes under the same sample ID.

The production Hayai Python environment can then run `run.py`, `sweep.py`,
`sweep2.py`, `lines.py`, `confidence.py`, `heldout.py`, and `auto_padding.py`.
`detect.cjs` runs with the repository's Electron binary and current TypeScript
sources; `HAYAI_AUDIT_HELDOUT=1` selects the heldout split. The detector manifests
must exist before `auto_padding.py`. Review each script's inputs before rerunning.
Until cleanup becomes available, use the existing raw assets after checking their
hashes instead of downloading duplicate copies.

## Subsequent v2.5 comparison

Keep this model and its hashes as the baseline. Install the successor in an
isolated cache/runtime with its own revision and asset verification. Reuse the
same Chinese source hashes and coordinates, and add separately annotated Japanese
horizontal/vertical, monochrome/color and sound-effect samples before inference.
Compare both identical recognition crops and each complete production pipeline.
Report script-specific CER, exact regions, detection omissions, speed and memory,
with a heldout split. No Chinese-only inference change should become the shared
default without Japanese regression evidence.
