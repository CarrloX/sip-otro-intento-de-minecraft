import * as THREE from 'three';
import { commandService } from './CommandService';
import { simulateRandomTicks } from './SimulationService';

interface CommandContext {
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  setWorldTime: (time: number) => void;
  getWorldTime: () => number;
  lastFpsUpdate: React.MutableRefObject<number>;
  onStatusChangeRef: React.MutableRefObject<((status: any) => void) | undefined>;
  world: {
    chunksDataRef: React.MutableRefObject<Map<string, Uint8Array>>;
    addBlock: (x: number, y: number, z: number, type: number) => void;
  };
  TIME_SPEED: number;
}

export const registerGameCommands = (ctx: CommandContext) => {
  const { cameraRef, setWorldTime, getWorldTime, lastFpsUpdate, onStatusChangeRef, world, TIME_SPEED } = ctx;

  const forceSync = (newTime: number) => {
    lastFpsUpdate.current = 0;
    if (cameraRef.current && onStatusChangeRef.current) {
      onStatusChangeRef.current({
        position: { x: cameraRef.current.position.x, y: cameraRef.current.position.y, z: cameraRef.current.position.z },
        rotation: { x: cameraRef.current.rotation.x, y: cameraRef.current.rotation.y },
        worldTime: newTime
      });
    }
  };

  commandService.register('/time', (action?: string, value?: string) => {
    if (action === 'set') {
      if (value === 'day') {
        const newTime = Math.PI / 4;
        setWorldTime(newTime);
        forceSync(newTime);
        return 'Time set to day';
      } else if (value === 'night') {
        const newTime = Math.PI + Math.PI / 4;
        setWorldTime(newTime);
        forceSync(newTime);
        return 'Time set to night';
      }
      return 'Usage: /time set <day|night>';
    }
    return 'Usage: /time set <day|night>';
  });

  commandService.register('/tp', (x?: string, y?: string, z?: string) => {
    if (x !== undefined && y !== undefined && z !== undefined) {
      const px = Number.parseFloat(x);
      const py = Number.parseFloat(y);
      const pz = Number.parseFloat(z);
      if (!Number.isNaN(px) && !Number.isNaN(py) && !Number.isNaN(pz)) {
        if (cameraRef.current) {
          cameraRef.current.position.set(px, py, pz);
        }
        forceSync(getWorldTime());
        return `Teleported to ${px} ${py} ${pz}`;
      }
    }
    return 'Usage: /tp <x> <y> <z>';
  });

  commandService.register('/tick', (action?: string, value?: string) => {
    if (action === 'advance') {
      const steps = Number.parseInt(value || '100');
      if (!Number.isNaN(steps) && steps > 0) {
        const loadedChunks = Array.from(world.chunksDataRef.current.keys());
        simulateRandomTicks(loadedChunks, world.chunksDataRef.current, world.addBlock, steps);

        // Advance the visual time of day (1 tick = 0.05 seconds of delta time)
        const newTime = getWorldTime() + steps * 0.05 * TIME_SPEED;
        setWorldTime(newTime);
        forceSync(newTime);

        return `Advanced simulation by ${steps} ticks.`;
      }
      return 'Usage: /tick advance <amount>';
    }
    return 'Usage: /tick advance <amount>';
  });

  return () => {
    commandService.unregister('/time');
    commandService.unregister('/tp');
    commandService.unregister('/tick');
  };
};
