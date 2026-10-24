import { asRecord, type JsonRecord } from "./codexAppServerProtocol";
const MAX_RECENT_NOTIFICATIONS = 256;
// Completion can precede its request acknowledgement. Retain one maximum-size
// record for late waiters; diagnostic reports have a much smaller budget.
const MAX_RECENT_NOTIFICATION_BYTES = 64 * 1024 * 1024;
const MAX_DIAGNOSTIC_BYTES = 2 * 1024 * 1024;
const MAX_STDERR_LINES = 24;
const MAX_STDERR_LINE_LENGTH = 2_000;
export class CodexAppServerDiagnostics {
  readonly recentNotifications: JsonRecord[] = [];
  readonly recentStderr: string[] = [];
  stderrSequence = 0;
  private recentNotificationBytes = 0;
  private readonly notificationSizes: number[] = [];
  read(threadId: string, turnId: string | null, stderrSince = 0) {
    const retainedStart = this.stderrSequence - this.recentStderr.length;
    let bytes = 0;
    return {
      notifications: this.recentNotifications.filter((notification, index) => {
        const size = this.notificationSizes[index];
        if (bytes + size > MAX_DIAGNOSTIC_BYTES) return false;
        const params = asRecord(notification.params);
        const matches =
          params?.threadId === threadId &&
          turnId !== null &&
          (params.turnId === turnId || asRecord(params.turn)?.id === turnId);
        if (matches) bytes += size;
        return matches;
      }),
      // Process-wide context; stderr is not attributed to a particular turn.
      processStderr: this.recentStderr
        .slice(Math.max(0, stderrSince - retainedStart))
        .join("\n"),
    };
  }

  remember(notification: JsonRecord): void {
    const size = Buffer.byteLength(JSON.stringify(notification));
    while (
      this.recentNotifications.length &&
      (this.recentNotifications.length >= MAX_RECENT_NOTIFICATIONS ||
        this.recentNotificationBytes + size > MAX_RECENT_NOTIFICATION_BYTES)
    ) {
      this.recentNotifications.shift();
      this.recentNotificationBytes -= this.notificationSizes.shift() ?? 0;
    }
    if (size <= MAX_RECENT_NOTIFICATION_BYTES) {
      this.recentNotifications.push(notification);
      this.notificationSizes.push(size);
      this.recentNotificationBytes += size;
    }
  }

  captureStderr(chunk: string): void {
    for (const rawLine of chunk.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line) continue;
      this.stderrSequence++;
      this.recentStderr.push(line.slice(0, MAX_STDERR_LINE_LENGTH));
      if (this.recentStderr.length > MAX_STDERR_LINES) {
        this.recentStderr.shift();
      }
    }
  }

  clear() {
    this.recentNotifications.length = 0;
    this.notificationSizes.length = 0;
    this.recentNotificationBytes = 0;
  }
}
