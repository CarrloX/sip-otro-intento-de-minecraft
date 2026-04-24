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
  seed: number;
  isMenuOpen: boolean;
  onWorldReady: () => void;
  onStatusChange: (status: { isLocked: boolean; lockControls: () => void; fps: number }) => void;
}

const GameCanvas = ({ currentBlockType, targetFps, renderDistance, autoJump, fancyLeaves, showClouds, seed, isMenuOpen, onWorldReady, onStatusChange }: GameCanvasProps) => {
  const { mountRef, isLocked, lockControls, fps, handleMobileLook, handleMobileInteract } = useMinecraft(currentBlockType, targetFps, renderDistance, autoJump, fancyLeaves, showClouds, seed, onWorldReady);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window));
  }, []);

  useEffect(() => {
    onStatusChange({ isLocked, lockControls, fps });
  }, [isLocked, lockControls, fps, onStatusChange]);

  return (
    <>
      <div 
        ref={mountRef} 
        className="game-mount" 
        onClick={() => {
          if (!isLocked && !isMobile) lockControls();
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
