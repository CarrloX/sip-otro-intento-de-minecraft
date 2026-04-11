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
  });

  const actionsRef = useRef(actions);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = actionMap[event.code] || actionMap[event.key.toLowerCase()];
      if (action) {
        setActions((prev) => {
          const next = { ...prev, [action]: true };
          actionsRef.current = next;
          return next;
        });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const action = actionMap[event.code] || actionMap[event.key.toLowerCase()];
      if (action) {
        setActions((prev) => {
          const next = { ...prev, [action]: false };
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
