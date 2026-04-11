import { useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export const usePlayer = (worldBlocksRef: React.RefObject<Map<string, THREE.Mesh>>) => {
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);
  const canJump = useRef(false);

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    const padding = 0.3;
    const height = 1.5;

    const minX = Math.floor(pos.x - padding);
    const maxX = Math.floor(pos.x + padding);
    const minY = Math.floor(pos.y - height);
    const maxY = Math.floor(pos.y + 0.2);
    const minZ = Math.floor(pos.z - padding);
    const maxZ = Math.floor(pos.z + padding);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (worldBlocksRef.current.has(`${x},${y},${z}`)) {
            return true;
          }
        }
      }
    }
    return false;
  }, [worldBlocksRef]);

  const update = useCallback((delta: number, camera: THREE.PerspectiveCamera, controls: PointerLockControls) => {
    if (!controls.isLocked) return;

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
