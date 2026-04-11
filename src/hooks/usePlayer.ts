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
  const isSprintingRef = useRef(false);

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

  const physicsAccumulator = useRef(0);
  const PHYSICS_STEP = 1 / 60;
  const MAX_SUBSTEPS = 5;

  const update = useCallback((delta: number, camera: THREE.PerspectiveCamera, controls: PointerLockControls) => {
    if (!controls.isLocked) return;

    // Sync keyboard actions to refs (Once per frame is fine)
    const actions = actionsRef.current;
    moveForward.current = actions.moveForward;
    moveBackward.current = actions.moveBackward;
    moveLeft.current = actions.moveLeft;
    moveRight.current = actions.moveRight;

    const isSprinting = actions.sprint && moveForward.current;
    isSprintingRef.current = isSprinting;

    // Physics Sub-stepping logic
    physicsAccumulator.current += delta;
    let substeps = 0;

    while (physicsAccumulator.current >= PHYSICS_STEP && substeps < MAX_SUBSTEPS) {
      const isSprinting = actions.sprint && moveForward.current;

      // 1. Handle Jump
      if (actions.jump && canJump.current) {
        // Boost jump if sprinting (1.1x vertical force)
        const jumpForce = isSprinting ? 8.8 : 8;
        velocity.current.y += jumpForce;
        canJump.current = false;
      }

      // 2. Apply Forces (Friction & Gravity)
      velocity.current.x -= velocity.current.x * 10 * PHYSICS_STEP;
      velocity.current.z -= velocity.current.z * 10 * PHYSICS_STEP;
      velocity.current.y -= 9.8 * 3 * PHYSICS_STEP;

      // 3. Movement input
      direction.current.z = Number(moveForward.current) - Number(moveBackward.current);
      direction.current.x = Number(moveRight.current) - Number(moveLeft.current);
      direction.current.normalize();

      const speedMultiplier = isSprinting ? 1.3 : 1.0;
      const speed = 40 * speedMultiplier;
      
      if (moveForward.current || moveBackward.current) velocity.current.z -= direction.current.z * speed * PHYSICS_STEP;
      if (moveLeft.current || moveRight.current) velocity.current.x -= direction.current.x * speed * PHYSICS_STEP;

      // 4. Vertical Collision
      const oldPosY = camera.position.y;
      camera.position.y += velocity.current.y * PHYSICS_STEP;
      if (checkCollision(camera.position)) {
        camera.position.y = oldPosY;
        if (velocity.current.y < 0) canJump.current = true;
        velocity.current.y = 0;
      }

      // 5. Horizontal Collision
      controls.moveRight(-velocity.current.x * PHYSICS_STEP);
      if (checkCollision(camera.position)) {
        controls.moveRight(velocity.current.x * PHYSICS_STEP);
      }

      controls.moveForward(-velocity.current.z * PHYSICS_STEP);
      if (checkCollision(camera.position)) {
        controls.moveForward(velocity.current.z * PHYSICS_STEP);
      }

      // 6. Void check
      if (camera.position.y < -20) {
        camera.position.set(0, 30, 0);
        velocity.current.set(0, 0, 0);
      }

      physicsAccumulator.current -= PHYSICS_STEP;
      substeps++;
    }
  }, [actionsRef, checkCollision]);

  return useMemo(() => ({
    moveForward,
    moveBackward,
    moveLeft,
    moveRight,
    canJump,
    isSprinting: isSprintingRef,
    velocity,
    update
  }), [update]);
};
