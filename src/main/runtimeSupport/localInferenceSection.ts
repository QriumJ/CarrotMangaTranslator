import { AsyncLocalStorage } from "node:async_hooks";

type Waiter = {
  ownerId: string;
  signal?: AbortSignal;
  onAbort: () => void;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const owners = new AsyncLocalStorage<string>();
const inside = new AsyncLocalStorage<string>();
let anonymousOwner = 0;

/**
 * Serializes the short local GPU stages (detection, OCR, font inference,
 * layout) of jobs that share the model runtime. Remote API/Codex calls stay
 * outside this section, so another job can use the GPU while one waits on the
 * network. Calls from the same owner share an admitted section, which keeps
 * nested and parallel stages of one job from waiting on themselves.
 * Exclusive local-model jobs never overlap other model jobs, so this section
 * is uncontended for them.
 */
export class LocalInferenceSection {
  private owner: string | null = null;
  private holders = 0;
  private readonly queue: Waiter[] = [];

  get activeOwner(): string | null {
    return this.owner;
  }

  get waiting(): number {
    return this.queue.length;
  }

  async run<T>(
    work: () => Promise<T>,
    signal?: AbortSignal,
    ownerId = owners.getStore(),
  ): Promise<T> {
    // Work outside a job still nests: it inherits the stage it runs inside.
    const owner =
      ownerId ?? inside.getStore() ?? `anonymous:${++anonymousOwner}`;
    // Nested stages already hold the section for their owner.
    if (inside.getStore() === owner && this.owner === owner) return work();
    await this.enter(owner, signal);
    try {
      return await inside.run(owner, work);
    } finally {
      this.leave();
    }
  }

  private enter(owner: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.owner === null || this.owner === owner) {
      this.owner = owner;
      this.holders += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        ownerId: owner,
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = this.queue.indexOf(waiter);
          if (index < 0) return;
          this.queue.splice(index, 1);
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        },
      };
      this.queue.push(waiter);
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
    });
  }

  private leave(): void {
    this.holders -= 1;
    if (this.holders > 0) return;
    this.owner = null;
    const next = this.queue.shift();
    if (!next) return;
    // Admit every queued stage of the next owner together, in FIFO order.
    const admitted = [
      next,
      ...this.queue.filter((waiter) => waiter.ownerId === next.ownerId),
    ];
    for (const waiter of admitted.slice(1))
      this.queue.splice(this.queue.indexOf(waiter), 1);
    this.owner = next.ownerId;
    this.holders = admitted.length;
    for (const waiter of admitted) {
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      waiter.resolve();
    }
  }
}

const sharedSection = new LocalInferenceSection();

/** Job composition marks the owner once; stages never pass it explicitly. */
export function withLocalInferenceOwner<T>(ownerId: string, run: () => T): T {
  return owners.run(ownerId, run);
}

export function runLocalInference<T>(
  work: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return sharedSection.run(work, signal);
}
