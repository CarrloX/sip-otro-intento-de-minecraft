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

    if (newType !== -1 && newType !== currentBlockType) {
      setCurrentBlockType(newType);
      onBlockChange(newType);
    }
  }, [actions, onBlockChange, currentBlockType]);

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
