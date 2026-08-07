/**
 * Visualize — the firing-sequence animation.
 *
 * Holds a clock over the computed firing times and reports which holes have
 * detonated by now. The original runs this with a millisecond counter in the
 * top right and a prompt on the status line:
 *
 *   "Press space bar to pause display or ESC to abort."
 *
 * Speed is expressed as blast-milliseconds per real second. A real blast is
 * over in under three seconds and the interesting structure is in the first
 * few hundred milliseconds, so it is played back heavily slowed by default.
 */

/**
 * Playback speeds, offered by v3.0 as Visualize > Slow|Medium|Fast
 * (SHOTPLAN.OVR @0x04F7). Values are blast-milliseconds per real second.
 *
 * A real blast is over in under three seconds and all the interesting
 * structure sits in the first few hundred milliseconds, so even "Fast" is
 * heavily slowed relative to reality.
 */
export const SPEEDS = { Slow: 40, Medium: 120, Fast: 400 };

/** Prompt line, verbatim from SHOTPLAN.OVR @0x12024. */
export const VISUALIZE_PROMPT =
  'Press space bar to pause display or ESC to abort.';

export class Visualization {
  /**
   * @param {object} times  result of computeTimes()
   * @param {number} msPerSecond  blast-ms advanced per real second
   */
  constructor(times, msPerSecond = 120) {
    this.times = times;
    this.msPerSecond = msPerSecond;
    this.t = 0;
    this.running = true;
    this.done = false;
    // Run a little past the last hole so the final detonation is visible.
    this.end = times.last + 150;
  }

  /** Advance by a real-time delta in milliseconds. */
  tick(dtRealMs) {
    if (!this.running || this.done) return false;
    this.t += (dtRealMs / 1000) * this.msPerSecond;
    if (this.t >= this.end) {
      this.t = this.end;
      this.done = true;
    }
    return true;
  }

  togglePause() {
    this.running = !this.running;
  }

  /** Has this hole (1-based index) fired by the current clock? */
  hasFired(holeIndex1) {
    const t = this.times.fire.get(holeIndex1);
    return t !== undefined && t <= this.t;
  }

  /** Milliseconds since this hole fired, or null. */
  sinceFired(holeIndex1) {
    const t = this.times.fire.get(holeIndex1);
    if (t === undefined || t > this.t) return null;
    return this.t - t;
  }

  get firedCount() {
    let n = 0;
    for (const t of this.times.fire.values()) if (t <= this.t) n++;
    return n;
  }
}
