/** Preserve the clicked control until Chrome has dispatched its activation event. */
export function guardInteractions(onReleased: () => void) {
  const pointers = new Set<number>();
  const keys = new Set<string>();
  const interactive = (target: EventTarget | null) =>
    target instanceof Element && target.closest('button,input,select,textarea,summary,label,a');
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (interactive(event.target)) pointers.add(event.pointerId);
    },
    true,
  );
  const release = (event: PointerEvent) =>
    setTimeout(() => {
      pointers.delete(event.pointerId);
      onReleased();
    }, 0);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener(
    'keydown',
    (event) => {
      if (['Space', 'Enter'].includes(event.code) && interactive(event.target))
        keys.add(event.code);
    },
    true,
  );
  document.addEventListener(
    'keyup',
    (event) => {
      if (keys.has(event.code))
        setTimeout(() => {
          keys.delete(event.code);
          onReleased();
        }, 0);
    },
    true,
  );
  window.addEventListener('blur', () => {
    pointers.clear();
    keys.clear();
  });
  return { isHeld: () => pointers.size > 0 || keys.size > 0 };
}
