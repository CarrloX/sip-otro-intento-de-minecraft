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
  autoJump: boolean;
  onAutoJumpChange: (autoJump: boolean) => void;
  fancyLeaves: boolean;
  onFancyLeavesChange: (fancyLeaves: boolean) => void;
  onMenuToggle: () => void;
}

const Hud = ({ isLocked, fps, onBlockChange, isMenuOpen, targetFps, onFpsChange, renderDistance, onRenderDistanceChange, autoJump, onAutoJumpChange, fancyLeaves, onFancyLeavesChange, onMenuToggle }: HudProps) => {
  return (
    <div id="ui-layer">
      <div className="debug-info">
        <div>Minecraft 1.0.0 (Custom Engine)</div>
        <div>{Math.round(fps)} fps</div>
        <br/>
        <div id="debug-xyz">XYZ: 0.000 / 0.000 / 0.000</div>
        <div id="debug-block">Block: 0 0 0</div>
        <div id="debug-chunk">Chunk: 0 0 0</div>
        <div id="debug-facing">Facing: Unknown</div>
      </div>
      <Crosshair isVisible={isLocked && !isMenuOpen} />
      <Hotbar isVisible={isLocked && !isMenuOpen} onBlockChange={onBlockChange} />
      
      <OptionsMenu 
        isVisible={isMenuOpen}
        targetFps={targetFps}
        onFpsChange={onFpsChange}
        renderDistance={renderDistance}
        onRenderDistanceChange={onRenderDistanceChange}
        autoJump={autoJump}
        onAutoJumpChange={onAutoJumpChange}
        fancyLeaves={fancyLeaves}
        onFancyLeavesChange={onFancyLeavesChange}
        onClose={onMenuToggle}
      />
    </div>
  );
};

export default Hud;
