import { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboard } from './hooks/useKeyboard';
import './App.css';
import GameCanvas from './components/GameCanvas/GameCanvas';
import Hud from './components/HUD/HUD';

function App() {
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const [targetFps, setTargetFps] = useState(144);
  const [renderDistance, setRenderDistance] = useState(2);
  const [isMenuOpen, setIsMenuOpen] = useState(true); // Start with menu open
  const [lockControls, setLockControls] = useState<() => void>(() => () => {});

  const { actions } = useKeyboard();

  const handleStatusChange = useCallback((status: { isLocked: boolean; lockControls: () => void; fps: number }) => {
    setIsLocked(status.isLocked);
    setLockControls(() => status.lockControls);
    setFps(status.fps);
    
    // Auto-open menu if game becomes unlocked (e.g. via ESC key)
    if (!status.isLocked) {
      setIsMenuOpen(true);
    }
  }, []);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        document.exitPointerLock?.();
      } else {
        // Automatically try to relock when closing the menu with 'P'
        lockControls();
      }
      return next;
    });
  }, [lockControls]);

  const lastMenuAction = useRef(false);

  useEffect(() => {
    // Detect key down transition
    if (actions.menu && !lastMenuAction.current) {
      toggleMenu();
    }
    lastMenuAction.current = actions.menu;
  }, [actions.menu, toggleMenu]);

  return (
    <div className="app-container">
      <GameCanvas 
        currentBlockType={currentBlockType} 
        targetFps={targetFps}
        renderDistance={renderDistance}
        onStatusChange={handleStatusChange} 
      />

      <Hud 
        isLocked={isLocked} 
        fps={fps}
        onBlockChange={setCurrentBlockType}
        isMenuOpen={isMenuOpen}
        targetFps={targetFps}
        onFpsChange={setTargetFps}
        renderDistance={renderDistance}
        onRenderDistanceChange={setRenderDistance}
        onMenuToggle={toggleMenu}
      />
    </div>
  );
}

export default App;
