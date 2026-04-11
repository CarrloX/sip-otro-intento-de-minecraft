import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { SelectionResult } from '../services/SelectionService';

export const useInteraction = (
  _objectsRef: React.RefObject<THREE.Mesh[]>,
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>,
  controlsRef: React.RefObject<PointerLockControls | null>,
  addBlockFn: (x: number, y: number, z: number, type: number) => void,
  removeBlockFn: (mesh: THREE.Mesh) => void,
  currentBlockTypeRef: React.RefObject<number>,
  hoveredBlockRef: React.RefObject<SelectionResult | null>
) => {
  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!controlsRef.current?.isLocked || !cameraRef.current || !hoveredBlockRef.current) return;

    const intersect = hoveredBlockRef.current;
    
    if (event.button === 0) {
      removeBlockFn(intersect.object);
    } else if (event.button === 2 && intersect.face) {
      const pos = intersect.object.position.clone().add(intersect.face.normal);
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
      
      addBlockFn(
        Math.round(pos.x),
        Math.round(pos.y),
        Math.round(pos.z),
        currentBlockTypeRef.current
      );
    }
  }, [cameraRef, controlsRef, addBlockFn, removeBlockFn, currentBlockTypeRef, hoveredBlockRef]);

  return useMemo(() => ({ handleMouseDown }), [handleMouseDown]);
};
