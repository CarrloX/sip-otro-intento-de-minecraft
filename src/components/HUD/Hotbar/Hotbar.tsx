import { useState, useEffect } from 'react';
import { useKeyboard } from '../../../hooks/useKeyboard';
import './Hotbar.css';

interface HotbarProps {
  onBlockChange: (type: number) => void;
  isVisible: boolean;
}

const Hotbar = ({ onBlockChange, isVisible }: HotbarProps) => {
  const { actions } = useKeyboard();
  const [currentBlockType, setCurrentBlockType] = useState(1);

  useEffect(() => {
    let newType = -1;
    if (actions.digit1) newType = 1;
    else if (actions.digit2) newType = 2;
    else if (actions.digit3) newType = 3;
    else if (actions.digit4) newType = 4;
    else if (actions.digit5) newType = 5;
    else if (actions.digit6) newType = 6;

    if (newType !== -1 && newType !== currentBlockType) {
      setCurrentBlockType(newType);
      onBlockChange(newType);
    }
  }, [actions, onBlockChange, currentBlockType]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!isVisible) return;
      
      setCurrentBlockType((prev) => {
        let next = prev + (e.deltaY > 0 ? 1 : -1);
        if (next > 6) next = 1;
        if (next < 1) next = 6;
        
        onBlockChange(next);
        return next;
      });
    };

    globalThis.addEventListener('wheel', handleWheel);
    return () => globalThis.removeEventListener('wheel', handleWheel);
  }, [isVisible, onBlockChange]);

  if (!isVisible) return null;

  return (
    <div className="hotbar" id="hotbar">
      {[1, 2, 3, 4, 5, 6].map((num) => (
        <button
          key={num}
          type="button"
          className={`slot ${currentBlockType === num ? 'active' : ''}`}
          id={`slot-${num}`}
          aria-label={`Select block ${num}`}
          title={`${num} - Bloque`}
          onClick={() => {
            setCurrentBlockType(num);
            onBlockChange(num);
          }}
        ></button>
      ))}
    </div>
  );
};

export default Hotbar;
