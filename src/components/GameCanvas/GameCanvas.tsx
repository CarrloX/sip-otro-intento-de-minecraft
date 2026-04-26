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
  worldId: string;
  isMenuOpen: boolean;
  initialPosition?: {x: number, y: number, z: number};
  initialRotation?: {x: number, y: number};
  initialWorldTime?: number;
  isConsoleOpen?: boolean;
  onWorldReady: () => void;
  onStatusChange: (status: { isLocked: boolean; lockControls: () => void; fps: number; position?: {x: number, y: number, z: number}; rotation?: {x: number, y: number}; worldTime?: number }) => void;
}

const GameCanvas = ({ currentBlockType, targetFps, renderDistance, autoJump, fancyLeaves, showClouds, enableShadows, brightness, seed, worldId, isMenuOpen, isConsoleOpen = false, onWorldReady, initialPosition, initialRotation, initialWorldTime, onStatusChange }: GameCanvasProps) => {
  const { mountRef, isLocked, lockControls, fps, cameraPosition, cameraRotation, currentWorldTime, handleMobileLook, handleMobileInteract } = useMinecraft({
    currentBlockType,
    targetFps,
    renderDistance,
    autoJump,
    fancyLeaves,
    showClouds,
    enableShadows,
    brightness,
    seed,
    worldId,
    initialPosition,
    initialRotation,
    initialWorldTime,
    onWorldReady
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (globalThis.window !== undefined && 'ontouchstart' in globalThis));
  }, []);

  useEffect(() => {
    onStatusChange({ isLocked, lockControls, fps, position: cameraPosition, rotation: cameraRotation, worldTime: currentWorldTime });
  }, [isLocked, lockControls, fps, cameraPosition, cameraRotation, currentWorldTime, onStatusChange]);

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
