import React, { useEffect, useRef, useState } from 'react';
import './MobileControls.css';

interface MobileControlsProps {
  onLook: (movementX: number, movementY: number) => void;
  onInteract: () => void;
  onPlace: () => void; // Extra feature: Two finger tap to place, or separate button
}

export const simulateKey = (key: string, type: 'keydown' | 'keyup') => {
  globalThis.dispatchEvent(new KeyboardEvent(type, { code: key, key: key }));
};

const MobileControls: React.FC<MobileControlsProps> = ({ onLook, onInteract, onPlace }) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const touchLeftId = useRef<number | null>(null);
  const touchRightId = useRef<number | null>(null);
  
  const joyStart = useRef({ x: 0, y: 0 });
  const rightStart = useRef({ x: 0, y: 0, time: 0 });
  const lastLook = useRef({ x: 0, y: 0 });

  const [joyPos, setJoyPos] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const [joyCenter, setJoyCenter] = useState({ x: 0, y: 0 });

  const keysState = useRef({ w: false, a: false, s: false, d: false });

  const updateKeys = (dx: number, dy: number) => {
    const threshold = 20; // pixels
    const newKeys = {
      w: dy < -threshold,
      s: dy > threshold,
      a: dx < -threshold,
      d: dx > threshold
    };

    if (newKeys.w !== keysState.current.w) simulateKey('KeyW', newKeys.w ? 'keydown' : 'keyup');
    if (newKeys.s !== keysState.current.s) simulateKey('KeyS', newKeys.s ? 'keydown' : 'keyup');
    if (newKeys.a !== keysState.current.a) simulateKey('KeyA', newKeys.a ? 'keydown' : 'keyup');
    if (newKeys.d !== keysState.current.d) simulateKey('KeyD', newKeys.d ? 'keydown' : 'keyup');

    keysState.current = newKeys;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const halfWidth = window.innerWidth / 2;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < halfWidth && touchLeftId.current === null) {
        // Left side: Joystick
        touchLeftId.current = touch.identifier;
        joyStart.current = { x: touch.clientX, y: touch.clientY };
        setJoyCenter({ x: touch.clientX, y: touch.clientY });
        setJoyPos({ x: 0, y: 0 });
        setJoyActive(true);
      } else if (touch.clientX >= halfWidth && touchRightId.current === null) {
        // Right side: Look
        // Ignore if touching a button
        if ((touch.target as HTMLElement).tagName.toLowerCase() === 'button') continue;
        
        touchRightId.current = touch.identifier;
        rightStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        lastLook.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      if (touch.identifier === touchLeftId.current) {
        let dx = touch.clientX - joyStart.current.x;
        let dy = touch.clientY - joyStart.current.y;
        
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 50;
        
        if (distance > maxDist) {
          dx = (dx / distance) * maxDist;
          dy = (dy / distance) * maxDist;
        }
        
        setJoyPos({ x: dx, y: dy });
        updateKeys(dx, dy);
      } else if (touch.identifier === touchRightId.current) {
        const dx = touch.clientX - lastLook.current.x;
        const dy = touch.clientY - lastLook.current.y;
        lastLook.current = { x: touch.clientX, y: touch.clientY };
        onLook(dx, dy);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      if (touch.identifier === touchLeftId.current) {
        touchLeftId.current = null;
        setJoyActive(false);
        updateKeys(0, 0);
      } else if (touch.identifier === touchRightId.current) {
        touchRightId.current = null;
        
        // Tap to interact
        const dx = touch.clientX - rightStart.current.x;
        const dy = touch.clientY - rightStart.current.y;
        const dt = Date.now() - rightStart.current.time;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
          onInteract();
        }
      }
    }
  };

  return (
    <div 
      className="mobile-controls-layer"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      {joyActive && (
        <div 
          className="mobile-joystick-base" 
          style={{ left: joyCenter.x, top: joyCenter.y }}
        >
          <div 
            className="mobile-joystick-knob" 
            style={{ transform: `translate(${joyPos.x}px, ${joyPos.y}px)` }}
          />
        </div>
      )}

      <button 
         className="mobile-btn pause-btn"
         style={{ position: 'absolute', top: 20, right: 20 }}
         onTouchStart={(e) => { e.stopPropagation(); simulateKey('Escape', 'keydown'); simulateKey('Escape', 'keyup'); }}
      >
        ||
      </button>

      <div className="mobile-buttons-container">
         <button 
           className="mobile-btn jump-btn"
           onTouchStart={(e) => { e.stopPropagation(); simulateKey('Space', 'keydown'); }}
           onTouchEnd={(e) => { e.stopPropagation(); simulateKey('Space', 'keyup'); }}
           onTouchCancel={(e) => { e.stopPropagation(); simulateKey('Space', 'keyup'); }}
         >
           JUMP
         </button>
         <button 
           className="mobile-btn sprint-btn"
           onTouchStart={(e) => { e.stopPropagation(); simulateKey('ControlLeft', 'keydown'); simulateKey('KeyW', 'keydown'); }}
           onTouchEnd={(e) => { e.stopPropagation(); simulateKey('ControlLeft', 'keyup'); simulateKey('KeyW', 'keyup'); }}
           onTouchCancel={(e) => { e.stopPropagation(); simulateKey('ControlLeft', 'keyup'); simulateKey('KeyW', 'keyup'); }}
         >
           SPRINT
         </button>
         <button 
           className="mobile-btn place-btn"
           onTouchStart={(e) => { e.stopPropagation(); onPlace(); }}
         >
           PLACE
         </button>
      </div>
      
      <div className="mobile-crosshair">+</div>
    </div>
  );
};

export default MobileControls;
