import { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboard } from './hooks/useKeyboard';
import './App.css';
import GameCanvas from './components/GameCanvas/GameCanvas';
import Hud from './components/HUD/HUD';
import StartScreen from './components/StartScreen/StartScreen';
import Console from './components/Console/Console';
import { initDB, clearDB } from './services/StorageService';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (globalThis.window !== undefined && 'ontouchstart' in globalThis);

function App() {
  const [gameState, setGameState] = useState<'start' | 'loading' | 'playing'>('start');
  const [seed, setSeed] = useState<number>(0);
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const [targetFps, setTargetFps] = useState(144);
  const [renderDistance, setRenderDistance] = useState(isMobile ? 6 : 12);
  const [autoJump, setAutoJump] = useState(true);
  const [fancyLeaves, setFancyLeaves] = useState(!isMobile);
  const [showClouds, setShowClouds] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(true); // Start with menu open
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [lockControls, setLockControls] = useState<() => void>(() => () => {});

  const { actions } = useKeyboard();

  const wasLockedRef = useRef(false);
  const isConsoleOpenRef = useRef(false);
  const ignoreNextUnlockRef = useRef(false);

  const justClosedConsoleRef = useRef(false);

  const handleStatusChange = useCallback((status: { isLocked: boolean; lockControls: () => void; fps: number }) => {
    setIsLocked(status.isLocked);
    setLockControls(() => status.lockControls);
    setFps(status.fps);
    
    // Auto-open menu if game transitions from locked to unlocked (e.g. via ESC key)
    if (!status.isLocked && wasLockedRef.current) {
      if (ignoreNextUnlockRef.current) {
        ignoreNextUnlockRef.current = false;
      } else {
        setIsMenuOpen(true);
      }
    }
    
    wasLockedRef.current = status.isLocked;
  }, []);

  const toggleMenu = useCallback(() => {
    if (isMenuOpen) {
      lockControls();
    } else {
      document.exitPointerLock?.();
    }
    setIsMenuOpen(!isMenuOpen);
  }, [isMenuOpen, lockControls]);

  const lastMenuAction = useRef(false);
  const lastChatAction = useRef(false);

  useEffect(() => {
    // Detect key down transition for menu
    if (actions.menu && !lastMenuAction.current) {
      if (isConsoleOpenRef.current) {
        // If console is open but unfocused, Escape should close it, not open the menu
        isConsoleOpenRef.current = false;
        justClosedConsoleRef.current = true;
        setTimeout(() => { justClosedConsoleRef.current = false; }, 200);
        setIsConsoleOpen(false);
        lockControls();
      } else if (!justClosedConsoleRef.current) {
        toggleMenu();
      }
    }
    lastMenuAction.current = actions.menu;

    // Detect key down transition for chat
    if (actions.chat && !lastChatAction.current && gameState === 'playing' && !isConsoleOpenRef.current && !isMenuOpen) {
      isConsoleOpenRef.current = true;
      ignoreNextUnlockRef.current = true;
      setIsConsoleOpen(true);
      document.exitPointerLock?.();
    }
    lastChatAction.current = actions.chat;
  }, [actions.menu, actions.chat, toggleMenu, gameState, isMenuOpen]);

  const handleCommand = (cmd: string) => {
    const parts = cmd.trim().split(' ');
    const base = parts[0].toLowerCase();
    
    if (base === '/time' && parts[1] === 'set') {
      return `Time commands are not fully implemented yet.`;
    }
    if (base === '/tp') {
      return `Teleported to ${parts[1]} ${parts[2]} ${parts[3]}`;
    }
    if (base === '/seed') {
      return `Seed: ${seed}`;
    }
    if (base === '/help') {
      return `Available commands: /seed, /time set <day|night>, /tp <x> <y> <z>`;
    }
    if (base.startsWith('/')) {
      return `Error: Unknown command. Type /help for help.`;
    }
    return `[You]: ${cmd}`;
  };

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
            isMenuOpen={isMenuOpen}
            isConsoleOpen={isConsoleOpen}
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
            <>
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
              <Console 
                isOpen={isConsoleOpen} 
                onClose={() => {
                  isConsoleOpenRef.current = false;
                  justClosedConsoleRef.current = true;
                  setTimeout(() => {
                    justClosedConsoleRef.current = false;
                  }, 200);
                  setIsConsoleOpen(false);
                  lockControls();
                }} 
                onCommand={handleCommand}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
