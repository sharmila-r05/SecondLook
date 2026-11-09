"use client";

import { useLayoutEffect } from "react";

// Rosa's tap, remembered until the step it brings in has mounted. Only a step that arrives from her tap stitches in
// and takes focus; opening or reloading the page shows it still and leaves focus where the browser puts it.
let tappedAt = 0;

export function noteTap(): void {
  tappedAt = Date.now();
}

function takeTap(): boolean {
  const recent = Date.now() - tappedAt < 30_000;
  tappedAt = 0;
  return recent;
}

/**
 * Marks the step with id `step` as just arrived, before it paints: its block settles in and its thread runs round
 * once. Focus moves to the element with id `focus`, so it isn't dropped to the page when the button she tapped goes.
 */
export function Arrived({ step, focus }: { step: string; focus: string }) {
  useLayoutEffect(() => {
    if (!takeTap()) return;
    document.getElementById(step)?.setAttribute("data-arrive", "");
    document.getElementById(focus)?.focus();
  }, [step, focus]);
  return null;
}
