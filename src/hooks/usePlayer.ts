import { useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { useKeyboard } from './useKeyboard';

export const usePlayer = (loadedBlocksRef: React.RefObject<Map<string, number>>) => {
  const { actionsRef } = useKeyboard();
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);
  const canJump = useRef(false);

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    // Minecraft Dimensions: Width 0.6 (0.3 radius), Height 1.8
    // Camera is at Eye Height (approx 1.6 from feet)
    const PLAYER_WIDTH = 0.3;
    const EYE_HEIGHT = 1.6;
    const HEAD_BUFFER = 0.2;

    const minX = Math.round(pos.x - PLAYER_WIDTH);
    const maxX = Math.round(pos.x + PLAYER_WIDTH);
    const minY = Math.round(pos.y - EYE_HEIGHT);
    const maxY = Math.round(pos.y + HEAD_BUFFER);
    const minZ = Math.round(pos.z - PLAYER_WIDTH);
    const maxZ = Math.round(pos.z + PLAYER_WIDTH);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (loadedBlocksRef.current?.has(`${x},${y},${z}`)) {
            return true;
          }
        }
      }
    }
    return false;
  }, [loadedBlocksRef]);

  const update = useCallback((delta: number, camera: THREE.PerspectiveCamera, controls: PointerLockControls) => {
    if (!controls.isLocked) return;

    // Sync keyboard actions to refs
    const actions = actionsRef.current;
    moveForward.current = actions.moveForward;
    moveBackward.current = actions.moveBackward;
    moveLeft.current = actions.moveLeft;
    moveRight.current = actions.moveRight;

    // Handle Jump
    if (actions.jump && canJump.current) {
      velocity.current.y += 8;
      canJump.current = false;
    }

    velocity.current.x -= velocity.current.x * 10 * delta;
    velocity.current.z -= velocity.current.z * 10 * delta;
    velocity.current.y -= 9.8 * 3 * delta;

    direction.current.z = Number(moveForward.current) - Number(moveBackward.current);
    direction.current.x = Number(moveRight.current) - Number(moveLeft.current);
    direction.current.normalize();

    const speed = 40;
    if (moveForward.current || moveBackward.current) velocity.current.z -= direction.current.z * speed * delta;
    if (moveLeft.current || moveRight.current) velocity.current.x -= direction.current.x * speed * delta;

    const oldPosY = camera.position.y;
    camera.position.y += velocity.current.y * delta;
    if (checkCollision(camera.position)) {
      camera.position.y = oldPosY;
      if (velocity.current.y < 0) canJump.current = true;
      velocity.current.y = 0;
    }

    controls.moveRight(-velocity.current.x * delta);
    if (checkCollision(camera.position)) {
      controls.moveRight(velocity.current.x * delta);
    }

    controls.moveForward(-velocity.current.z * delta);
    if (checkCollision(camera.position)) {
      controls.moveForward(velocity.current.z * delta);
    }

    if (camera.position.y < -20) {
      camera.position.set(0, 30, 0);
      velocity.current.set(0, 0, 0);
    }
  }, [checkCollision]);

  return useMemo(() => ({
    moveForward,
    moveBackward,
    moveLeft,
    moveRight,
    canJump,
    velocity,
    update
  }), [update]);
};
