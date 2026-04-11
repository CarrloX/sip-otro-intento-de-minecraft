import { useState, useEffect } from 'react';
import './Hotbar.css';

interface HotbarProps {
  onBlockChange: (type: number) => void;
  isVisible: boolean;
}

const Hotbar = ({ onBlockChange, isVisible }: HotbarProps) => {
  const [currentBlockType, setCurrentBlockType] = useState(1);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const code = event.code;
      
      let newType = -1;
      if (code === 'Digit1' || key === '1') newType = 1;
      else if (code === 'Digit2' || key === '2') newType = 2;
      else if (code === 'Digit3' || key === '3') newType = 3;
      else if (code === 'Digit4' || key === '4') newType = 4;
      else if (code === 'Digit5' || key === '5') newType = 5;

      if (newType !== -1) {
        setCurrentBlockType(newType);
        onBlockChange(newType);
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [onBlockChange]);

  if (!isVisible) return null;

  return (
    <div className="hotbar" id="hotbar">
      {[1, 2, 3, 4, 5].map((num) => (
        <div
          key={num}
          className={`slot ${currentBlockType === num ? 'active' : ''}`}
          id={`slot-${num}`}
          title={`${num} - Bloque`}
        ></div>
      ))}
    </div>
  );
};

export default Hotbar;
