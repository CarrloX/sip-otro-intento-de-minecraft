import { useState, useEffect, useRef } from 'react';

const actionMap: Record<string, string> = {
  KeyW: 'moveForward',
  ArrowUp: 'moveForward',
  w: 'moveForward',
  KeyS: 'moveBackward',
  ArrowDown: 'moveBackward',
  s: 'moveBackward',
  KeyA: 'moveLeft',
  ArrowLeft: 'moveLeft',
  a: 'moveLeft',
  KeyD: 'moveRight',
  ArrowRight: 'moveRight',
  d: 'moveRight',
  Space: 'jump',
  ' ': 'jump',
  ShiftLeft: 'down',
  ShiftRight: 'down',
  Digit1: 'digit1',
  '1': 'digit1',
  Digit2: 'digit2',
  '2': 'digit2',
  Digit3: 'digit3',
  '3': 'digit3',
  Digit4: 'digit4',
  '4': 'digit4',
  Digit5: 'digit5',
  '5': 'digit5',
  KeyP: 'menu',
  p: 'menu',
  Escape: 'menu',
  ControlLeft: 'sprint',
  ControlRight: 'sprint',
};

export const useKeyboard = () => {
  const [actions, setActions] = useState({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    digit1: false,
    digit2: false,
    digit3: false,
    digit4: false,
    digit5: false,
    menu: false,
    sprint: false,
    down: false,
    isFlying: false,
  });

  const actionsRef = useRef(actions);
  const lastWRelease = useRef(0);
  const lastSpaceRelease = useRef(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      const code = event.code;
      const action = actionMap[code] || actionMap[event.key.toLowerCase()];
      
      if (action) {
        const now = performance.now();

        // Double-tap W (Sprint) is calculated from the last RELEASE of W
        if (code === 'KeyW' || event.key.toLowerCase() === 'w') {
          if (now - lastWRelease.current < 300) { // 300ms tolerance
             setActions((prev) => ({ ...prev, moveForward: true, sprint: true }));
             actionsRef.current.sprint = true;
          }
        }

        // Double-tap Space (Flight) is calculated from the last RELEASE of Space
        if (code === 'Space' || event.key === ' ') {
          if (now - lastSpaceRelease.current < 300) {
            setActions((prev) => {
              const next = { ...prev, isFlying: !prev.isFlying, jump: true };
              actionsRef.current = next;
              return next;
            });
          }
        }

        setActions((prev) => {
          const next = { ...prev, [action]: true };
          actionsRef.current = next;
          return next;
        });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const code = event.code;
      const action = actionMap[code] || actionMap[event.key.toLowerCase()];

      if (code === 'KeyW' || event.key.toLowerCase() === 'w') {
        lastWRelease.current = performance.now();
      }

      if (code === 'Space' || event.key === ' ') {
        lastSpaceRelease.current = performance.now();
      }

      if (action) {
        setActions((prev) => {
          // Special case: Don't disable sprint on key up if it's the sprint key (Ctrl)
          // it stays active until moveForward is released
          const isSprintKey = action === 'sprint';
          const next = { ...prev, [action]: isSprintKey ? prev.sprint : false };
          
          // If we stop moving forward, we must stop sprinting
          if (action === 'moveForward') {
            next.sprint = false;
          }
          
          actionsRef.current = next;
          return next;
        });
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return { actions, actionsRef };
};
