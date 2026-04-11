import React from 'react';
import './OptionsMenu.css';

interface OptionsMenuProps {
  isVisible: boolean;
  targetFps: number;
  onFpsChange: (fps: number) => void;
  renderDistance: number;
  onRenderDistanceChange: (distance: number) => void;
  autoJump: boolean;
  onAutoJumpChange: (autoJump: boolean) => void;
  onClose: () => void;
}

const OptionsMenu: React.FC<OptionsMenuProps> = ({ isVisible, targetFps, onFpsChange, renderDistance, onRenderDistanceChange, autoJump, onAutoJumpChange, onClose }) => {
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
          <div className="option-row">
            <span className="option-label">Render Distance: {renderDistance}</span>
            <input 
              type="range" 
              min="2" 
              max="32" 
              step="1" 
              value={renderDistance} 
              onChange={(e) => onRenderDistanceChange(Number(e.target.value))}
              className="option-slider"
              aria-label="Render Distance"
              title="Ajustar distancia de chunks"
            />
          </div>
          <div className="option-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="option-label">Auto Jump</span>
            <input 
              type="checkbox" 
              checked={autoJump} 
              onChange={(e) => onAutoJumpChange(e.target.checked)}
              className="option-checkbox"
              aria-label="Auto Jump"
              title="Activar o desactivar el salto automático"
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
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
