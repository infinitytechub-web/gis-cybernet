import { useRef, useCallback } from "react";

/** Plays a short notification chime using the Web Audio API. */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);        // A5
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08); // ~C#6
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // silently ignore if AudioContext unavailable
  }
}

/**
 * Detects when a total count increases and triggers a visual flash + sound.
 * Returns { flash, checkForNewItems }
 *  - flash: boolean — true for a short period after new items detected
 *  - checkForNewItems(newTotal): call whenever data updates
 */
export function useNewItemAlert() {
  const prevTotal = useRef<number | null>(null);
  const flashRef = useRef(false);
  const flashTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [flash, setFlash] = useState(false);

  const checkForNewItems = useCallback((newTotal: number) => {
    if (prevTotal.current !== null && newTotal > prevTotal.current) {
      playNotificationSound();
      setFlash(true);
      clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setFlash(false), 1500);
    }
    prevTotal.current = newTotal;
  }, []);

  return { flash, checkForNewItems };
}

import { useState } from "react";
