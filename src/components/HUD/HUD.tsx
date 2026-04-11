import Hotbar from './Hotbar/Hotbar';
import Crosshair from './Crosshair/Crosshair';
import './HUD.css';

interface HUDProps {
  isLocked: boolean;
  onBlockChange: (type: number) => void;
}

const HUD = ({ isLocked, onBlockChange }: HUDProps) => {
  return (
    <div id="ui-layer">
      <Crosshair isVisible={isLocked} />
      <Hotbar isVisible={isLocked} onBlockChange={onBlockChange} />
    </div>
  );
};

export default HUD;
