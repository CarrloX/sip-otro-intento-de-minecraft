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
  fancyLeaves: boolean;
  onFancyLeavesChange: (fancyLeaves: boolean) => void;
  showClouds: boolean;
  onShowCloudsChange: (showClouds: boolean) => void;
  enableShadows: boolean;
  onEnableShadowsChange: (enableShadows: boolean) => void;
  brightness: number;
  onBrightnessChange: (brightness: number) => void;
  onClose: () => void;
  onQuitToTitle: () => void;
}

const OptionsMenu: React.FC<OptionsMenuProps> = ({ isVisible, targetFps, onFpsChange, renderDistance, onRenderDistanceChange, autoJump, onAutoJumpChange, fancyLeaves, onFancyLeavesChange, showClouds, onShowCloudsChange, enableShadows, onEnableShadowsChange, brightness, onBrightnessChange, onClose, onQuitToTitle }) => {
  const [cooldown, setCooldown] = React.useState(false);

  React.useEffect(() => {
    if (isVisible) {
      setCooldown(true);
      const timer = setTimeout(() => setCooldown(false), 1250);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

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
          <div className="option-row">
            <span className="option-label">Brightness: {brightness}%</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              step="1" 
              value={brightness} 
              onChange={(e) => onBrightnessChange(Number(e.target.value))}
              className="option-slider"
              aria-label="Brightness"
              title="Ajustar brillo del juego"
            />
          </div>
          <div className="option-row horizontal">
            <span className="option-label">Auto Jump</span>
            <input 
              type="checkbox" 
              checked={autoJump} 
              onChange={(e) => onAutoJumpChange(e.target.checked)}
              className="option-checkbox"
              aria-label="Auto Jump"
              title="Activar o desactivar el salto automático"
            />
          </div>
          <div className="option-row horizontal spaced">
            <span className="option-label">Fancy Leaves</span>
            <input 
              type="checkbox" 
              checked={fancyLeaves} 
              onChange={(e) => onFancyLeavesChange(e.target.checked)}
              className="option-checkbox"
              aria-label="Fancy Leaves"
              title="Activar o desactivar follaje semitransparente"
            />
          </div>
          <div className="option-row horizontal spaced">
            <span className="option-label">Show Clouds</span>
            <input 
              type="checkbox" 
              checked={showClouds} 
              onChange={(e) => onShowCloudsChange(e.target.checked)}
              className="option-checkbox"
              aria-label="Show Clouds"
              title="Activar o desactivar nubes 3D"
            />
          </div>
          <div className="option-row horizontal spaced">
            <span className="option-label">Shadows</span>
            <input 
              type="checkbox" 
              checked={enableShadows} 
              onChange={(e) => onEnableShadowsChange(e.target.checked)}
              className="option-checkbox"
              aria-label="Shadows"
              title="Activar o desactivar las sombras"
            />
          </div>
        </div>

        <button 
          className="back-button" 
          onClick={onClose}
          disabled={cooldown}
        >
          {cooldown ? 'PLEASE WAIT...' : 'BACK TO GAME'}
        </button>

        <button 
          className="quit-button" 
          onClick={onQuitToTitle}
        >
          SAVE & QUIT TO TITLE
        </button>
      </div>
    </div>
  );
};

export default OptionsMenu;
