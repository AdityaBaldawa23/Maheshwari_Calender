import { useRef } from 'react';

const MIN_DISTANCE = 50; // px
const MAX_OFF_AXIS_RATIO = 0.6; // vertical movement must stay well below horizontal

/** Horizontal swipe detection via pointer events. Spread the result onto an element. */
export function useSwipe({ onSwipeLeft, onSwipeRight }) {
  const start = useRef(null);

  return {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp(e) {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dy) > Math.abs(dx) * MAX_OFF_AXIS_RATIO) return;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
