import { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboard } from './hooks/useKeyboard';
import './App.css';
import GameCanvas from './components/GameCanvas/GameCanvas';
import Hud from './components/HUD/HUD';
import StartScreen from './components/StartScreen/StartScreen';
import Console from './components/Console/Console';
import { initDB, createWorld, updateWorldLastPlayed } from './services/StorageService';
import { commandService } from './services/CommandService';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (globalThis.window !== undefined && 'ontouchstart' in globalThis);

function App() {
  const [gameState, setGameState] = useState<'start' | 'loading' | 'playing'>('start');
  const [currentWorldId, setCurrentWorldId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number>(0);
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const [targetFps, setTargetFps] = useState(144);
  const [renderDistance, setRenderDistance] = useState(isMobile ? 6 : 12);
  const [autoJump, setAutoJump] = useState(true);
  const [fancyLeaves, setFancyLeaves] = useState(!isMobile);
  const [showClouds, setShowClouds] = useState(true);
  const [enableShadows, setEnableShadows] = useState(true);
  const [brightness, setBrightness] = useState(50);
  const [isMenuOpen, setIsMenuOpen] = useState(true); // Start with menu open
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [lockControls, setLockControls] = useState<() => void>(() => () => {});
  const [initialPosition, setInitialPosition] = useState<{x: number, y: number, z: number} | undefined>(undefined);
  const [initialRotation, setInitialRotation] = useState<{x: number, y: number} | undefined>(undefined);
  const [initialWorldTime, setInitialWorldTime] = useState<number | undefined>(undefined);
  const currentPositionRef = useRef<{x: number, y: number, z: number} | undefined>(undefined);
  const currentRotationRef = useRef<{x: number, y: number} | undefined>(undefined);
  const currentWorldTimeRef = useRef<number | undefined>(undefined);

  const { actions } = useKeyboard();

  const wasLockedRef = useRef(false);
  const isConsoleOpenRef = useRef(false);
  const ignoreNextUnlockRef = useRef(false);

  const justClosedConsoleRef = useRef(false);

  const handleStatusChange = useCallback((status: { isLocked: boolean; lockControls: () => void; fps: number; position?: {x: number, y: number, z: number}; rotation?: {x: number, y: number}; worldTime?: number }) => {
    setIsLocked(status.isLocked);
    setLockControls(() => status.lockControls);
    setFps(status.fps);
    if (status.position) {
        currentPositionRef.current = status.position;
    }
    if (status.rotation) {
        currentRotationRef.current = status.rotation;
    }
    if (status.worldTime !== undefined) {
        currentWorldTimeRef.current = status.worldTime;
    }
    
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

  useEffect(() => {
    commandService.register('/seed', () => `Seed: ${seed}`);
    return () => {
      commandService.unregister('/seed');
    };
  }, [seed]);

  const handleCreateWorld = async (name: string, newSeed: number) => {
    if (!document.pointerLockElement) {
        try {
            document.body.requestPointerLock();
        } catch (e) {
            console.warn("Initial pointer lock request failed", e);
        }
    }
    
    // Give the browser a small "cooldown" to process the lock before we change state
    setTimeout(async () => {
        try {
          const db = await initDB();
          const newWorld = await createWorld(db, name, newSeed);
          
          setCurrentWorldId(newWorld.id);
          setSeed(newWorld.seed);
          setInitialPosition(undefined);
          setInitialRotation(undefined);
          setInitialWorldTime(undefined);
          currentPositionRef.current = undefined;
          currentRotationRef.current = undefined;
          currentWorldTimeRef.current = undefined;
          setGameState('loading');
          setIsMenuOpen(false);
        } catch (e) {
          console.error("Failed to create world", e);
        }
    }, 100);
  };

  const handleSelectWorld = async (worldId: string, worldSeed: number, playerPosition?: {x: number, y: number, z: number}, playerRotation?: {x: number, y: number}, worldTime?: number) => {
    if (!document.pointerLockElement) {
        try {
            document.body.requestPointerLock();
        } catch (e) {
            console.warn("Initial pointer lock request failed", e);
        }
    }

    // Give the browser a small "cooldown" to process the lock before we change state
    setTimeout(() => {
        setCurrentWorldId(worldId);
        setSeed(worldSeed);
        setInitialPosition(playerPosition);
        setInitialRotation(playerRotation);
        setInitialWorldTime(worldTime);
        currentPositionRef.current = playerPosition;
        currentRotationRef.current = playerRotation;
        currentWorldTimeRef.current = worldTime;
        setGameState('loading');
        setIsMenuOpen(false);
        
        // Update last played timestamp
        initDB().then(db => {
            updateWorldLastPlayed(db, worldId, playerPosition, playerRotation, worldTime).catch(console.error);
        });
    }, 100);
  };

  const handleQuitToTitle = useCallback(() => {
    // Save position, rotation and worldTime before quitting
    if (currentWorldId && (currentPositionRef.current || currentRotationRef.current || currentWorldTimeRef.current !== undefined)) {
        initDB().then(db => {
            updateWorldLastPlayed(db, currentWorldId, currentPositionRef.current, currentRotationRef.current, currentWorldTimeRef.current).catch(console.error);
        });
    }

    document.exitPointerLock?.();
    setGameState('start');
    setCurrentWorldId(null);
    setInitialPosition(undefined);
    setInitialRotation(undefined);
    setInitialWorldTime(undefined);
    setIsMenuOpen(true);
  }, [currentWorldId]);

  return (
    <div className="app-container">
      {gameState === 'start' && (
        <StartScreen 
            onCreateWorld={handleCreateWorld} 
            onSelectWorld={handleSelectWorld}
        />
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
            enableShadows={enableShadows}
            brightness={brightness}
            seed={seed}
            worldId={currentWorldId || 'default'}
            initialPosition={initialPosition}
            initialRotation={initialRotation}
            initialWorldTime={initialWorldTime}
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
                enableShadows={enableShadows}
                onEnableShadowsChange={setEnableShadows}
                brightness={brightness}
                onBrightnessChange={setBrightness}
                onMenuToggle={toggleMenu}
                onQuitToTitle={handleQuitToTitle}
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
                onCommand={(cmd) => commandService.execute(cmd)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
