import { useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export const useInteraction = (
  objectsRef: React.RefObject<THREE.Mesh[]>,
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>,
  controlsRef: React.RefObject<PointerLockControls | null>,
  addBlockFn: (x: number, y: number, z: number, type: number) => void,
  removeBlockFn: (mesh: THREE.Mesh) => void,
  currentBlockTypeRef: React.RefObject<number>
) => {
  const raycaster = useRef(new THREE.Raycaster());

  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!controlsRef.current?.isLocked || !cameraRef.current) return;

    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), cameraRef.current);
    const intersects = raycaster.current
      .intersectObjects(objectsRef.current, false)
      .filter((i) => i.distance < 5);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      if (event.button === 0) {
        removeBlockFn(intersect.object as THREE.Mesh);
      } else if (event.button === 2) {
        const pos = intersect.object.position.clone().add(intersect.face!.normal);
        const pPos = cameraRef.current.position;
        
        // Prevent placing block inside player's body
        if (
          Math.abs(pos.x - pPos.x) < 0.8 &&
          Math.abs(pos.z - pPos.z) < 0.8 &&
          pos.y >= pPos.y - 1.5 &&
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
    }
  }, [cameraRef, controlsRef, objectsRef, addBlockFn, removeBlockFn, currentBlockTypeRef]);

  return useMemo(() => ({ handleMouseDown }), [handleMouseDown]);
};
