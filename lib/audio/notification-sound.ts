/**
 * Web Audio API notification sound generator for QueueFlow.
 * Synthesizes a clean two-tone chime without external audio assets or dependencies.
 */

export interface PlayTurnChimeOptions {
  /** Optional audio context constructor for testing or dependency injection */
  AudioContextClass?: typeof AudioContext;
}

/**
 * Plays a pleasant, short two-tone chime to announce when a ticket is called.
 * Safely handles unsupported environments, suspended states, and browser autoplay blocks.
 *
 * @returns Promise<boolean> Resolves to true if audio playback succeeded, false otherwise.
 * Never throws or rejects.
 */
export async function playTurnChime(
  options?: PlayTurnChimeOptions,
): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const CtxClass =
    options?.AudioContextClass ??
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!CtxClass) {
    return false;
  }

  let ctx: AudioContext | null = null;
  try {
    ctx = new CtxClass();

    // If context is suspended by browser autoplay policy, attempt to resume
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Autoplay policy prevented resumption; clean up and exit gracefully
        await ctx.close().catch(() => {});
        return false;
      }
    }

    if (ctx.state !== "running") {
      await ctx.close().catch(() => {});
      return false;
    }

    const now = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Tone 2: A5 (880.00 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.12);
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.4);

    // Cleanup: close the AudioContext once the chime has finished
    const activeCtx = ctx;
    setTimeout(() => {
      activeCtx.close().catch(() => {});
    }, 450);

    return true;
  } catch {
    // Fail silently without disrupting UI state
    if (ctx) {
      try {
        void ctx.close().catch(() => {});
      } catch {
        // Ignore
      }
    }
    return false;
  }
}
