// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { playTurnChime } from "./notification-sound";

describe("playTurnChime audio utility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns false gracefully when AudioContext is unsupported", async () => {
    const originalAudioContext = window.AudioContext;
    // @ts-expect-error test unsupported environment
    delete window.AudioContext;

    const result = await playTurnChime();
    expect(result).toBe(false);

    window.AudioContext = originalAudioContext;
  });

  it("returns false gracefully when AudioContext initialization throws", async () => {
    class ThrowingAudioContext {
      constructor() {
        throw new Error("Audio hardware unavailable");
      }
    }

    const result = await playTurnChime({
      AudioContextClass: ThrowingAudioContext as unknown as typeof AudioContext,
    });

    expect(result).toBe(false);
  });

  it("handles suspended state and browser autoplay block gracefully", async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockResume = vi.fn().mockRejectedValue(new Error("Autoplay not allowed"));

    class SuspendedAudioContext {
      state = "suspended";
      resume = mockResume;
      close = mockClose;
    }

    const result = await playTurnChime({
      AudioContextClass: SuspendedAudioContext as unknown as typeof AudioContext,
    });

    expect(result).toBe(false);
    expect(mockResume).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it("plays chime tones and closes AudioContext on successful execution", async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockResume = vi.fn().mockResolvedValue(undefined);

    const mockStart = vi.fn();
    const mockStop = vi.fn();
    const mockConnect = vi.fn();
    const mockSetValueAtTime = vi.fn();
    const mockExponentialRampToValueAtTime = vi.fn();

    class RunningAudioContext {
      state = "running";
      currentTime = 1.0;
      resume = mockResume;
      close = mockClose;
      destination = {};
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: mockSetValueAtTime },
          connect: mockConnect,
          start: mockStart,
          stop: mockStop,
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: mockSetValueAtTime,
            exponentialRampToValueAtTime: mockExponentialRampToValueAtTime,
          },
          connect: mockConnect,
        };
      }
    }

    const result = await playTurnChime({
      AudioContextClass: RunningAudioContext as unknown as typeof AudioContext,
    });

    expect(result).toBe(true);
    // 2 tones: 2 oscillators started and stopped
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStop).toHaveBeenCalledTimes(2);

    // Context cleanup scheduled after chime completes
    expect(mockClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
