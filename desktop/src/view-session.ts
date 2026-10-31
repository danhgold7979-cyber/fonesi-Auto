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
      release: () => void;
    };

// Main-owned policy state; identity is an application view, not a Document token.
export class ViewSession {
  private state: State = 'INITIALIZING';
  private initialLoads = 0;
  private generation = 0;
  private pending = 0;
  private readonly sender: object;
  private readonly origin: string;
  private readonly url: string;
  constructor(sender: object, origin: string, url: string) {
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
    if (!this.trusted(caller)) return { ok: false, code: 'UNTRUSTED_SENDER' };
    if (this.state === 'INITIALIZING') return { ok: false, code: 'SESSION_UNAVAILABLE' };
    if (this.state !== 'ACTIVE') return { ok: false, code: 'SESSION_REVOKED' };
    if (this.pending >= 8) return { ok: false, code: 'BUSY' };
    this.pending++;
    const generation = this.generation;
    let released = false;
    return {
      ok: true,
      current: () => !released && this.state === 'ACTIVE' && this.generation === generation,
      release: () => {
        if (!released) {
          released = true;
          this.pending--;
        }
      },
    };
  }
}
