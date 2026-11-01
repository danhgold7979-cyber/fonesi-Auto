import type { ErrorCode } from './ipc-contract.js';

export type Caller = Readonly<{
  sender: object;
  isMainFrame: boolean;
  origin: string;
  url: string;
}>;
export type State = 'INITIALIZING' | 'ACTIVE' | 'REVOKED' | 'CLOSED';
export type Admission =
  | { ok: false; code: ErrorCode }
  | {
      ok: true;
      current: () => boolean;
      operationCurrent: () => boolean;
      release: () => void;
    };

// Main-owned policy state; identity is an application view, not a Document token.
export class ViewSession {
  private state: State = 'INITIALIZING';
  private initialLoads = 0;
  private generation = 0;
  private pending = 0;
  private ordinary = 0;
  private cleanup = 0;
  private onRevoke: (() => void) | null;
  private readonly sender: object;
  private readonly origin: string;
  private readonly url: string;
  constructor(sender: object, origin: string, url: string, onRevoke?: () => void) {
    this.onRevoke = onRevoke ?? null;
    this.sender = sender;
    this.origin = origin;
    this.url = url;
  }
  get status(): State {
    return this.state;
  }
  get outstanding(): number {
    return this.pending;
  }
  beginMainLoad(url: string): void {
    if (this.state !== 'INITIALIZING' || this.initialLoads !== 0 || url !== this.url) {
      this.revoke();
      return;
    }
    this.initialLoads++;
  }
  finishInitial(caller: Caller): boolean {
    if (this.state !== 'INITIALIZING' || this.initialLoads !== 1 || !this.trusted(caller)) {
      this.revoke();
      return false;
    }
    this.state = 'ACTIVE';
    return true;
  }
  revoke(): void {
    if (this.state === 'CLOSED' || this.state === 'REVOKED') return;
    this.state = 'REVOKED';
    this.generation++;
    const callback = this.onRevoke;
    this.onRevoke = null;
    try {
      callback?.();
    } catch {
      /* Revocation cannot be rolled back by cleanup notification. */
    }
  }
  close(): void {
    this.revoke();
    this.state = 'CLOSED';
  }
  private trusted(caller: Caller): boolean {
    return (
      caller.sender === this.sender &&
      caller.isMainFrame &&
      caller.origin === this.origin &&
      caller.url === this.url
    );
  }
  admit(caller: Caller): Admission {
    return this.admission(caller, false);
  }
  admitCleanup(caller: Caller): Admission {
    return this.admission(caller, true);
  }
  private admission(caller: Caller, cleanup: boolean): Admission {
    if (!this.trusted(caller)) return { ok: false, code: 'UNTRUSTED_SENDER' };
    if (this.state === 'INITIALIZING') return { ok: false, code: 'SESSION_UNAVAILABLE' };
    if (this.state !== 'ACTIVE') return { ok: false, code: 'SESSION_REVOKED' };
    if (this.pending >= 8 || (cleanup ? this.cleanup >= 1 : this.ordinary >= 7))
      return { ok: false, code: 'BUSY' };
    if (cleanup) this.cleanup++;
    else this.ordinary++;
    this.pending++;
    const generation = this.generation;
    let released = false;
    return {
      ok: true,
      current: () => !released && this.state === 'ACTIVE' && this.generation === generation,
      // Main-only liveness observer for an already-admitted bounded operation, not another RPC grant.
      operationCurrent: () => this.state === 'ACTIVE' && this.generation === generation,
      release: () => {
        if (!released) {
          released = true;
          this.pending--;
          if (cleanup) this.cleanup--;
          else this.ordinary--;
        }
      },
    };
  }
}
