import { useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { useKeyboard } from './useKeyboard';

const PHYSICS_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;

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
  const physicsAccumulator = useRef(0);

  const checkCollision = useCallback((pos: THREE.Vector3) => {
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
          if (loadedBlocksRef.current?.has(`${x},${y},${z}`)) return true;
        }
      }
    }
    return false;
  }, [loadedBlocksRef]);

  /**
   * Handles a single 1/60s physics tick.
   * This core logic is extracted to keep cognitive complexity low.
   */
  const applyPhysicsStep = useCallback((actions: any, camera: THREE.PerspectiveCamera, controls: PointerLockControls) => {
    const isSprinting = actions.sprint && moveForward.current;
    const isFlying = actions.isFlying;

    // 1. Vertical Forces (Jump, Gravity & Flight)
    if (isFlying) {
      // Direct vertical control in flight mode
      const flySpeed = 50;
      const verticalMove = (actions.jump ? 1 : 0) - (actions.down ? 1 : 0);
      velocity.current.y += verticalMove * flySpeed * PHYSICS_STEP;
      
      // Vertical damping in flight - reduced for lighter feel
      velocity.current.y -= velocity.current.y * 5 * PHYSICS_STEP;
    } else {
      if (actions.jump && canJump.current) {
        velocity.current.y += isSprinting ? 8.8 : 8;
        canJump.current = false;
      }
      velocity.current.y -= 9.8 * 3 * PHYSICS_STEP;
    }

    // 2. Horizontal Forces (Friction & Movement)
    velocity.current.x -= velocity.current.x * 10 * PHYSICS_STEP;
    velocity.current.z -= velocity.current.z * 10 * PHYSICS_STEP;

    direction.current.z = Number(moveForward.current) - Number(moveBackward.current);
    direction.current.x = Number(moveRight.current) - Number(moveLeft.current);
    direction.current.normalize();

    // Speed calculation: Faster in flight, and MUCH faster when sprinting in flight
    let baseSpeed = 40;
    let multiplier = 1.0;

    if (isFlying) {
      baseSpeed = 60; // Faster base fly speed
      multiplier = isSprinting ? 3.0 : 1.0; // 3x speed when sprinting in air!
    } else {
      multiplier = isSprinting ? 1.3 : 1.0;
    }

    const speed = baseSpeed * multiplier;
    if (moveForward.current || moveBackward.current) velocity.current.z -= direction.current.z * speed * PHYSICS_STEP;
    if (moveLeft.current || moveRight.current) velocity.current.x -= direction.current.x * speed * PHYSICS_STEP;

    // 3. Collision Resolution (Vertical)
    const oldPosY = camera.position.y;
    camera.position.y += velocity.current.y * PHYSICS_STEP;
    if (checkCollision(camera.position)) {
      camera.position.y = oldPosY;
      if (velocity.current.y < 0) canJump.current = true;
      velocity.current.y = 0;
    }

    // 4. Collision Resolution (Horizontal)
    controls.moveRight(-velocity.current.x * PHYSICS_STEP);
    if (checkCollision(camera.position)) controls.moveRight(velocity.current.x * PHYSICS_STEP);

    controls.moveForward(-velocity.current.z * PHYSICS_STEP);
    if (checkCollision(camera.position)) controls.moveForward(velocity.current.z * PHYSICS_STEP);
  }, [checkCollision]);

  const update = useCallback((delta: number, camera: THREE.PerspectiveCamera, controls: PointerLockControls) => {
    if (!controls.isLocked) return;

    // Sync input refs
    const actions = actionsRef.current;
    moveForward.current = actions.moveForward;
    moveBackward.current = actions.moveBackward;
    moveLeft.current = actions.moveLeft;
    moveRight.current = actions.moveRight;
    isSprintingRef.current = actions.sprint && actions.moveForward;

    // Sub-stepping simulation
    physicsAccumulator.current += delta;
    let substeps = 0;
    while (physicsAccumulator.current >= PHYSICS_STEP && substeps < MAX_SUBSTEPS) {
      applyPhysicsStep(actions, camera, controls);
      physicsAccumulator.current -= PHYSICS_STEP;
      substeps++;
    }

    // Void check
    if (camera.position.y < -20) {
      camera.position.set(0, 30, 0);
      velocity.current.set(0, 0, 0);
    }
  }, [actionsRef, applyPhysicsStep]);

  return useMemo(() => ({
    moveForward, moveBackward, moveLeft, moveRight,
    canJump, isSprinting: isSprintingRef,
    velocity, update
  }), [update]);
};
