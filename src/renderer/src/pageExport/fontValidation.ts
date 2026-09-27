import type { BlockFontLoadReport } from "../lib/blockFontLoading";
import { getBaseBlockFontOptions, type BlockFontCatalog } from "../lib/fonts";
import { DEFAULT_BLOCK_FONT_ID } from "../../../shared/blockFontCatalog";

export function assertExportFontsLoaded(
  report: BlockFontLoadReport,
  catalog: BlockFontCatalog,
): void {
  const requests = [
    ...report.failures.map((failure) => failure.css),
    ...report.missingFamilies,
  ];
  if (requests.length === 0) return;
  const options = getBaseBlockFontOptions(catalog).filter(
    (font) => font.id !== DEFAULT_BLOCK_FONT_ID,
  );
  const names = new Set(
    requests.map((request) => {
      const font = options.find(
        (option) =>
          request === option.cssFamily ||
          request.endsWith(` ${option.cssFamily}`),
      );
      return font ? `“${font.label}”` : request;
    }),
  );
  const details = report.failures.map(
    ({ css, error }) =>
      `${css} (${error instanceof Error ? error.message : String(error)})`,
  );
  throw new Error(
    `출력에 필요한 폰트를 불러오지 못했습니다: ${[...names].join(", ")}. ` +
      "해당 글꼴을 사용하는 텍스트의 폰트를 기본 제공 폰트로 변경한 뒤 다시 출력해 주세요. " +
      "사용자 폰트라면 원본 TTF/OTF 파일을 다시 받아 등록해 주세요. " +
      `진단: ${details.join("; ") || report.missingFamilies.join(", ")}`,
  );
}
