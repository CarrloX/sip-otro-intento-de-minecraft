import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { SelectionResult } from '../services/SelectionService';

/** Block type ID for the base wood log (Y-axis / vertical) */
const LOG_BLOCK_TYPE = 4;
/** Log oriented along the X axis (east/west) */
const LOG_X_TYPE = 8;
/** Log oriented along the Z axis (north/south) */
const LOG_Z_TYPE = 9;

/**
 * Resolves the actual block type to place.
 * For wood logs (type 4), the orientation depends on where the player is looking:
 *  - Looking mostly up/down  → Y-axis log (type 4, vertical)
 *  - Looking mostly east/west → X-axis log (type 8)
 *  - Looking mostly north/south → Z-axis log (type 9)
 */
const resolveBlockType = (type: number, camera: THREE.PerspectiveCamera): number => {
  if (type !== LOG_BLOCK_TYPE) return type;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const absX = Math.abs(dir.x);
  const absY = Math.abs(dir.y);
  const absZ = Math.abs(dir.z);

  // If player looks steeply up or down, place a vertical log
  if (absY > absX && absY > absZ) return LOG_BLOCK_TYPE;
  // If horizontal component is bigger along X, place an X-axis log
  if (absX >= absZ) return LOG_X_TYPE;
  // Otherwise place a Z-axis log
  return LOG_Z_TYPE;
};

export const useInteraction = (
  _objectsRef: React.RefObject<THREE.Object3D[]>,
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>,
  controlsRef: React.RefObject<PointerLockControls | null>,
  addBlockFn: (x: number, y: number, z: number, type: number) => void,
  removeBlockFn: (x: number, y: number, z: number) => void,
  currentBlockTypeRef: React.RefObject<number>,
  hoveredBlockRef: React.RefObject<SelectionResult | null>
) => {
  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!controlsRef.current?.isLocked || !cameraRef.current || !hoveredBlockRef.current) return;

    const intersect = hoveredBlockRef.current;
    
    if (event.button === 0) {
      removeBlockFn(intersect.blockPosition.x, intersect.blockPosition.y, intersect.blockPosition.z);
    } else if (event.button === 2 && intersect.face) {
      const pos = intersect.blockPosition.clone().add(intersect.face.normal);
      const pPos = cameraRef.current.position;
      
      // Prevent placing block inside player's body
      // We use a safe margin around the player center
      if (
        Math.abs(pos.x - pPos.x) < 0.8 &&
        Math.abs(pos.z - pPos.z) < 0.8 &&
        pos.y >= pPos.y - 1.6 &&
        pos.y <= pPos.y + 0.5
      ) {
        return;
      }

      const blockType = resolveBlockType(currentBlockTypeRef.current, cameraRef.current);
      
      addBlockFn(
        Math.round(pos.x),
        Math.round(pos.y),
        Math.round(pos.z),
        blockType
      );
    }
  }, [cameraRef, controlsRef, addBlockFn, removeBlockFn, currentBlockTypeRef, hoveredBlockRef]);

  return useMemo(() => ({ handleMouseDown }), [handleMouseDown]);
};
