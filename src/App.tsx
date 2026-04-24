import { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboard } from './hooks/useKeyboard';
import './App.css';
import GameCanvas from './components/GameCanvas/GameCanvas';
import Hud from './components/HUD/HUD';
import StartScreen from './components/StartScreen/StartScreen';
import { initDB, clearDB } from './services/StorageService';

function App() {
  const [gameState, setGameState] = useState<'start' | 'loading' | 'playing'>('start');
  const [seed, setSeed] = useState<number>(0);
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const [targetFps, setTargetFps] = useState(144);
  const [renderDistance, setRenderDistance] = useState(12);
  const [autoJump, setAutoJump] = useState(true);
  const [fancyLeaves, setFancyLeaves] = useState(true);
  const [showClouds, setShowClouds] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(true); // Start with menu open
  const [lockControls, setLockControls] = useState<() => void>(() => () => {});

  const { actions } = useKeyboard();

  const wasLockedRef = useRef(false);

  const handleStatusChange = useCallback((status: { isLocked: boolean; lockControls: () => void; fps: number }) => {
    setIsLocked(status.isLocked);
    setLockControls(() => status.lockControls);
    setFps(status.fps);
    
    // Auto-open menu if game transitions from locked to unlocked (e.g. via ESC key)
    if (!status.isLocked && wasLockedRef.current) {
      setIsMenuOpen(true);
    }
    
    wasLockedRef.current = status.isLocked;
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

  const handleCreateWorld = (newSeed: number) => {
    // Request pointer lock synchronously on user click
    document.body.requestPointerLock?.();
    
    setIsMenuOpen(false);
    
    // Run async DB clear and state update
    (async () => {
      try {
        const db = await initDB();
        await clearDB(db);
      } catch (e) {
        console.error("Failed to clear DB on new world creation", e);
      }
      
      setSeed(newSeed);
      setGameState('loading');
    })();
  };

  return (
    <div className="app-container">
      {gameState === 'start' && (
        <StartScreen onCreateWorld={handleCreateWorld} />
      )}

      {(gameState === 'loading' || gameState === 'playing') && (
        <>
          <GameCanvas 
            currentBlockType={currentBlockType} 
            targetFps={targetFps}
            renderDistance={renderDistance}
            autoJump={autoJump}
            fancyLeaves={fancyLeaves}
            showClouds={showClouds}
            seed={seed}
            onWorldReady={() => setGameState('playing')}
            onStatusChange={handleStatusChange} 
          />

          {gameState === 'loading' && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <h2>Generating World...</h2>
            </div>
          )}

          {gameState === 'playing' && (
            <Hud 
              isLocked={isLocked} 
              fps={fps}
              onBlockChange={setCurrentBlockType}
              isMenuOpen={isMenuOpen}
              targetFps={targetFps}
              onFpsChange={setTargetFps}
              renderDistance={renderDistance}
              onRenderDistanceChange={setRenderDistance}
              autoJump={autoJump}
              onAutoJumpChange={setAutoJump}
              fancyLeaves={fancyLeaves}
              onFancyLeavesChange={setFancyLeaves}
              showClouds={showClouds}
              onShowCloudsChange={setShowClouds}
              onMenuToggle={toggleMenu}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
