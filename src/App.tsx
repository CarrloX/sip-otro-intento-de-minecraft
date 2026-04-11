import { useState, useCallback } from 'react';
import './App.css';
import GameCanvas from './components/GameCanvas/GameCanvas';
import HUD from './components/HUD/HUD';
import Blocker from './components/Blocker/Blocker';

function App() {
  const [currentBlockType, setCurrentBlockType] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const [lockControls, setLockControls] = useState<() => void>(() => () => {});

  const handleStatusChange = useCallback((status: { isLocked: boolean; lockControls: () => void; fps: number }) => {
    setIsLocked(status.isLocked);
    setLockControls(() => status.lockControls);
    setFps(status.fps);
  }, []);

  return (
    <div className="app-container">
      <GameCanvas 
        currentBlockType={currentBlockType} 
        onStatusChange={handleStatusChange} 
      />

      <HUD 
        isLocked={isLocked} 
        fps={fps}
        onBlockChange={setCurrentBlockType} 
      />

      <Blocker isVisible={!isLocked} onLock={lockControls} />
    </div>
  );
}

export default App;
