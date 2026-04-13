import { useRef, useState, useCallback } from "react";

/** Plays a short notification chime using the Web Audio API. */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // silently ignore if AudioContext unavailable
  }
}

/**
 * Detects when a total count increases and triggers a visual flash + sound + optional callback.
 */
export function useNewItemAlert(onNewItems?: (diff: number, label?: string) => void) {
  const prevTotal = useRef<number | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [flash, setFlash] = useState(false);

  const checkForNewItems = useCallback((newTotal: number, label?: string) => {
    if (prevTotal.current !== null && newTotal > prevTotal.current) {
      const diff = newTotal - prevTotal.current;
      playNotificationSound();
      setFlash(true);
      clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setFlash(false), 1500);
      onNewItems?.(diff, label);
    }
    prevTotal.current = newTotal;
  }, [onNewItems]);

  return { flash, checkForNewItems };
}
