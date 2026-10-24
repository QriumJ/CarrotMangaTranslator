/** Bounds each UTF-8 wire record before allocating a JavaScript string. */
export class BoundedJsonLines {
  private buffer: Buffer = Buffer.alloc(0);
  private length = 0;
  constructor(private readonly maxBytes: number) {}

  push(chunk: Buffer, line: (value: string) => void): void {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline < 0 ? chunk.length : newline;
      const length = this.length + end - start;
      if (length > this.maxBytes)
        throw new Error(
          `JSONL 응답 한 줄이 ${this.maxBytes} bytes 제한을 초과했습니다.`,
        );
      if (length > this.buffer.length) {
        const next = Buffer.allocUnsafe(
          Math.min(
            this.maxBytes,
            Math.max(length, this.buffer.length * 2, 8192),
          ),
        );
        this.buffer.copy(next, 0, 0, this.length);
        this.buffer = next;
      }
      chunk.copy(this.buffer, this.length, start, end);
      this.length = length;
      if (newline < 0) return;
      this.emit(line);
      start = newline + 1;
    }
  }

  end(line: (value: string) => void): void {
    if (this.length) this.emit(line);
    this.clear();
  }

  clear(): void {
    this.buffer = Buffer.alloc(0);
    this.length = 0;
  }

  private emit(line: (value: string) => void): void {
    const end =
      this.length && this.buffer[this.length - 1] === 13
        ? this.length - 1
        : this.length;
    const value = this.buffer.toString("utf8", 0, end);
    this.length = 0;
    if (value.length) line(value);
  }
}
