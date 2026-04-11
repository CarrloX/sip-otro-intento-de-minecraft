import { useEffect } from 'react';
import { useMinecraft } from '../../hooks/useMinecraft';
import './GameCanvas.css';

interface GameCanvasProps {
  currentBlockType: number;
  targetFps: number;
  renderDistance: number;
  autoJump: boolean;
  onStatusChange: (status: { isLocked: boolean; lockControls: () => void; fps: number }) => void;
}

const GameCanvas = ({ currentBlockType, targetFps, renderDistance, autoJump, onStatusChange }: GameCanvasProps) => {
  const { mountRef, isLocked, lockControls, fps } = useMinecraft(currentBlockType, targetFps, renderDistance, autoJump);

  useEffect(() => {
    onStatusChange({ isLocked, lockControls, fps });
  }, [isLocked, lockControls, fps, onStatusChange]);

  return (
    <div 
      ref={mountRef} 
      className="game-mount" 
    />
  );
};

export default GameCanvas;
