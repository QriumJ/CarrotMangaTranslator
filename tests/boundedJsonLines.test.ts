import { expect, it } from "vitest";
import { BoundedJsonLines } from "../src/main/runtimeSupport/boundedJsonLines";

it("frames split UTF-8, CRLF, blank lines and a final record without a newline", () => {
  const reader = new BoundedJsonLines(20);
  const lines: string[] = [];
  for (const byte of Buffer.from('"한글"\r\n\n{"ok":true}'))
    reader.push(Buffer.from([byte]), (value) => lines.push(value));
  reader.end((value) => lines.push(value));
  expect(lines).toEqual(['"한글"', '{"ok":true}']);
});
it("limits a record's bytes rather than a chunk's size or character count", () => {
  const reader = new BoundedJsonLines(6);
  const lines: string[] = [];
  reader.push(Buffer.from("한글\n123456\n123456\n"), (value) =>
    lines.push(value),
  );
  expect(lines).toEqual(["한글", "123456", "123456"]);
  reader.push(Buffer.from("123456"), () => {});
  expect(() => reader.push(Buffer.from("7"), () => {})).toThrow("6 bytes");
  reader.clear();
  reader.push(Buffer.from("ok\n"), (value) => lines.push(value));
  expect(lines.at(-1)).toBe("ok");
});
