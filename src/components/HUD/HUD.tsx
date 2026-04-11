import Hotbar from './Hotbar/Hotbar';
import Crosshair from './Crosshair/Crosshair';
import OptionsMenu from './OptionsMenu/OptionsMenu';
import './HUD.css';

interface HudProps {
  isLocked: boolean;
  fps: number;
  onBlockChange: (type: number) => void;
  isMenuOpen: boolean;
  targetFps: number;
  onFpsChange: (fps: number) => void;
  renderDistance: number;
  onRenderDistanceChange: (distance: number) => void;
  onMenuToggle: () => void;
}

const Hud = ({ isLocked, fps, onBlockChange, isMenuOpen, targetFps, onFpsChange, renderDistance, onRenderDistanceChange, onMenuToggle }: HudProps) => {
  return (
    <div id="ui-layer">
      <div className="fps-counter">FPS: {fps}</div>
      <Crosshair isVisible={isLocked && !isMenuOpen} />
      <Hotbar isVisible={isLocked && !isMenuOpen} onBlockChange={onBlockChange} />
      
      <OptionsMenu 
        isVisible={isMenuOpen}
        targetFps={targetFps}
        onFpsChange={onFpsChange}
        renderDistance={renderDistance}
        onRenderDistanceChange={onRenderDistanceChange}
        onClose={onMenuToggle}
      />
    </div>
  );
};

export default Hud;
