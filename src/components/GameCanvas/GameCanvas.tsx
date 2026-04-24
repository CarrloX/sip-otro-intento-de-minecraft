import { useEffect } from 'react';
import { useMinecraft } from '../../hooks/useMinecraft';
import './GameCanvas.css';

interface GameCanvasProps {
  currentBlockType: number;
  targetFps: number;
  renderDistance: number;
  autoJump: boolean;
  fancyLeaves: boolean;
  showClouds: boolean;
  seed: number;
  onWorldReady: () => void;
  onStatusChange: (status: { isLocked: boolean; lockControls: () => void; fps: number }) => void;
}

const GameCanvas = ({ currentBlockType, targetFps, renderDistance, autoJump, fancyLeaves, showClouds, seed, onWorldReady, onStatusChange }: GameCanvasProps) => {
  const { mountRef, isLocked, lockControls, fps } = useMinecraft(currentBlockType, targetFps, renderDistance, autoJump, fancyLeaves, showClouds, seed, onWorldReady);

  useEffect(() => {
    onStatusChange({ isLocked, lockControls, fps });
  }, [isLocked, lockControls, fps, onStatusChange]);

  return (
    <div 
      ref={mountRef} 
      className="game-mount" 
      onClick={() => {
        if (!isLocked) lockControls();
      }}
    />
  );
};

export default GameCanvas;
