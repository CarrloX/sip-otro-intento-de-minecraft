import { useEffect } from 'react';
import { useMinecraft } from '../../hooks/useMinecraft';
import './GameCanvas.css';

interface GameCanvasProps {
  currentBlockType: number;
  targetFps: number;
  onStatusChange: (status: { isLocked: boolean; lockControls: () => void; fps: number }) => void;
}

const GameCanvas = ({ currentBlockType, targetFps, onStatusChange }: GameCanvasProps) => {
  const { mountRef, isLocked, lockControls, fps } = useMinecraft(currentBlockType, targetFps);

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
