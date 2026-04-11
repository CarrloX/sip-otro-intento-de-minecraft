import { useEffect } from 'react';
import { useMinecraft } from '../../hooks/useMinecraft';
import './GameCanvas.css';

interface GameCanvasProps {
  currentBlockType: number;
  onStatusChange: (status: { isLocked: boolean; lockControls: () => void }) => void;
}

const GameCanvas = ({ currentBlockType, onStatusChange }: GameCanvasProps) => {
  const { mountRef, isLocked, lockControls } = useMinecraft(currentBlockType);

  useEffect(() => {
    onStatusChange({ isLocked, lockControls });
  }, [isLocked, lockControls, onStatusChange]);

  return (
    <div 
      ref={mountRef} 
      className="game-mount" 
    />
  );
};

export default GameCanvas;
