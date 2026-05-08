/**
 * Singleton idle-tracking store.
 *
 * - Records `lastActivity` from broad window events (capture phase).
 * - A 1-second tick computes elapsed time and emits state to subscribers
 *   so a single React component can render a confirmation modal with a
 *   live countdown.
 * - `extend()` resets the timer (used by the "Stay signed in" button).
 *
 * The hook layer (useIdleTimeout) is responsible only for *enabling* the
 * store with the current config and for performing the actual sign-out
 * when the store reports that the threshold was reached.
 */

export interface IdleState {
  /** True while the warning modal should be visible. */
  warning: boolean;
  /** Seconds remaining until forced sign-out (>= 0). */
  secondsRemaining: number;
  /** Configured warn lead time in seconds (for modal copy). */
  warnSeconds: number;
}

type Listener = (state: IdleState) => void;
type LogoutHandler = () => void | Promise<void>;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "click",
  "pointerdown",
  "keydown",
  "keypress",
  "wheel",
  "scroll",
  "touchstart",
  "touchmove",
  "input",
] as const;

class IdleStore {
  private listeners = new Set<Listener>();
  private state: IdleState = { warning: false, secondsRemaining: 0, warnSeconds: 30 };
  private lastActivity = Date.now();
  private idleMinutes = 5;
  private warnSeconds = 30;
  private enabled = false;
  private loggedOut = false;
  private tickHandle: number | null = null;
  private boundActivity: ((e: Event) => void) | null = null;
  private boundVisibility: (() => void) | null = null;
  private logoutHandler: LogoutHandler | null = null;

  getState() { return this.state; }

  subscribe(cb: Listener) {
    this.listeners.add(cb);
    cb(this.state);
    return () => { this.listeners.delete(cb); };
  }

  private emit() {
    for (const cb of this.listeners) cb(this.state);
  }

  private setState(patch: Partial<IdleState>) {
    const next = { ...this.state, ...patch };
    if (
      next.warning === this.state.warning &&
      next.secondsRemaining === this.state.secondsRemaining &&
      next.warnSeconds === this.state.warnSeconds
    ) return;
    this.state = next;
    this.emit();
  }

  /** Reset the inactivity timer (called on user activity and via "Stay signed in"). */
  extend = () => {
    this.lastActivity = Date.now();
    this.loggedOut = false;
    if (this.state.warning) this.setState({ warning: false, secondsRemaining: 0 });
  };

  configure(opts: { idleMinutes: number; warnSeconds: number; onLogout: LogoutHandler }) {
    this.idleMinutes = Math.max(1, opts.idleMinutes);
    this.warnSeconds = Math.max(5, opts.warnSeconds);
    this.logoutHandler = opts.onLogout;
    this.setState({ warnSeconds: this.warnSeconds });
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.loggedOut = false;
    this.lastActivity = Date.now();

    this.boundActivity = (_e: Event) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      // Activity always resets the inactivity clock and dismisses the warning.
      this.extend();
    };
    this.boundVisibility = () => {
      if (document.visibilityState === "visible") this.extend();
    };

    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, this.boundActivity!, { passive: true, capture: true });
    });
    document.addEventListener("visibilitychange", this.boundVisibility);

    this.tickHandle = window.setInterval(() => this.tick(), 1000);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.tickHandle != null) {
      window.clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    if (this.boundActivity) {
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, this.boundActivity!, { capture: true } as EventListenerOptions);
      });
      this.boundActivity = null;
    }
    if (this.boundVisibility) {
      document.removeEventListener("visibilitychange", this.boundVisibility);
      this.boundVisibility = null;
    }
    this.setState({ warning: false, secondsRemaining: 0 });
  }

  private async tick() {
    if (!this.enabled || this.loggedOut) return;
    const idleMs = Math.round(this.idleMinutes * 60_000);
    const warnMs = Math.max(5_000, Math.min(idleMs - 5_000, Math.round(this.warnSeconds * 1_000)));
    const elapsed = Date.now() - this.lastActivity;

    if (elapsed >= idleMs) {
      this.loggedOut = true;
      this.setState({ warning: false, secondsRemaining: 0 });
      try { await this.logoutHandler?.(); } catch { /* noop */ }
      return;
    }

    if (elapsed >= idleMs - warnMs) {
      const remaining = Math.max(0, Math.ceil((idleMs - elapsed) / 1000));
      this.setState({ warning: true, secondsRemaining: remaining, warnSeconds: this.warnSeconds });
    } else if (this.state.warning) {
      this.setState({ warning: false, secondsRemaining: 0 });
    }
  }
}

export const idleStore = new IdleStore();
