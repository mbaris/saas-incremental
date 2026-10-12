interface ClockCallbacks {
  canAdvance(): boolean;
  speed(): number;
  /** Return true when an incident or another decision interrupts simulation. */
  step(): boolean;
  save(): void;
  interrupted(): void;
}

/** Fixed simulation ticks, independent of render frequency; no offline catch-up. */
export function createSimulationClock(callbacks: ClockCallbacks, startedAt: number) {
  let last = startedAt;
  let accumulator = 0;
  let saveElapsed = 0;
  return {
    reset(now: number) {
      last = now;
    },
    advance(now: number) {
      const delta = Math.max(0, Math.min((now - last) / 1000, 1));
      last = now;
      if (callbacks.canAdvance()) {
        accumulator += delta * callbacks.speed();
        while (accumulator >= 1) {
          accumulator--;
          if (callbacks.step()) {
            accumulator = 0;
            callbacks.save();
            callbacks.interrupted();
            break;
          }
        }
      }
      saveElapsed += delta;
      if (saveElapsed >= 10) {
        callbacks.save();
        saveElapsed = 0;
      }
    },
  };
}
