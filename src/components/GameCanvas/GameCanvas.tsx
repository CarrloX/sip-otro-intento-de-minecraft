import { useEffect, useState } from 'react';
import { useMinecraft } from '../../hooks/useMinecraft';
import MobileControls from '../MobileControls/MobileControls';
import './GameCanvas.css';

interface GameCanvasProps {
  currentBlockType: number;
  targetFps: number;
  renderDistance: number;
  autoJump: boolean;
  fancyLeaves: boolean;
  showClouds: boolean;
  enableShadows: boolean;
  brightness: number;
  seed: number;
  isMenuOpen: boolean;
  isConsoleOpen?: boolean;
  onWorldReady: () => void;
  onStatusChange: (status: { isLocked: boolean; lockControls: () => void; fps: number }) => void;
}

const GameCanvas = ({ currentBlockType, targetFps, renderDistance, autoJump, fancyLeaves, showClouds, enableShadows, brightness, seed, isMenuOpen, isConsoleOpen = false, onWorldReady, onStatusChange }: GameCanvasProps) => {
  const { mountRef, isLocked, lockControls, fps, handleMobileLook, handleMobileInteract } = useMinecraft({
    currentBlockType,
    targetFps,
    renderDistance,
    autoJump,
    fancyLeaves,
    showClouds,
    enableShadows,
    brightness,
    seed,
    onWorldReady
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (globalThis.window !== undefined && 'ontouchstart' in globalThis));
  }, []);

  useEffect(() => {
    onStatusChange({ isLocked, lockControls, fps });
  }, [isLocked, lockControls, fps, onStatusChange]);

  return (
    <>
      <button 
        ref={mountRef} 
        className="game-mount" 
        type="button"
        aria-label="Start Game"
        onClick={() => {
          if (!isLocked && !isMobile && !isMenuOpen && !isConsoleOpen) lockControls();
        }}
      />
      {isMobile && !isMenuOpen && (
        <MobileControls 
          onLook={handleMobileLook} 
          onInteract={() => handleMobileInteract(false)}
          onPlace={() => handleMobileInteract(true)} 
        />
      )}
    </>
  );
};

export default GameCanvas;
