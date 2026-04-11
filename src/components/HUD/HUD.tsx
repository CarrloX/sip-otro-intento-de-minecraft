import Hotbar from './Hotbar/Hotbar';
import Crosshair from './Crosshair/Crosshair';
import './HUD.css';

interface HUDProps {
  isLocked: boolean;
  fps: number;
  onBlockChange: (type: number) => void;
}

const HUD = ({ isLocked, fps, onBlockChange }: HUDProps) => {
  return (
    <div id="ui-layer">
      <div className="fps-counter">FPS: {fps}</div>
      <Crosshair isVisible={isLocked} />
      <Hotbar isVisible={isLocked} onBlockChange={onBlockChange} />
    </div>
  );
};

export default HUD;
