import React from 'react';
import './OptionsMenu.css';

interface OptionsMenuProps {
  isVisible: boolean;
  targetFps: number;
  onFpsChange: (fps: number) => void;
  onClose: () => void;
}

const OptionsMenu: React.FC<OptionsMenuProps> = ({ isVisible, targetFps, onFpsChange, onClose }) => {
  if (!isVisible) return null;

  return (
    <div className="options-overlay">
      <div className="options-menu">
        <h2 className="options-title">OPTIONS</h2>
        
        <div className="options-section">
          <div className="option-row">
            <span className="option-label">Max FPS: {targetFps === 144 ? 'Unlimited' : targetFps}</span>
            <input 
              type="range" 
              min="10" 
              max="144" 
              step="1" 
              value={targetFps} 
              onChange={(e) => onFpsChange(Number(e.target.value))}
              className="option-slider"
              aria-label="Max FPS"
              title="Ajustar límite de FPS"
            />
          </div>
        </div>

        <button className="back-button" onClick={onClose}>
          BACK TO GAME
        </button>
      </div>
    </div>
  );
};

export default OptionsMenu;
