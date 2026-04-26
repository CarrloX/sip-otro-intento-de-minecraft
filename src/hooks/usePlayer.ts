import { useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { useKeyboard } from './useKeyboard';
import { getGlobalBlockType } from '../services/WorldService';

const PHYSICS_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;

export const usePlayer = (chunksDataRef: React.RefObject<Map<string, Uint8Array>>, autoJumpEnabledRef: React.RefObject<boolean>) => {
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
  const eyeHeight = useRef(1.6);

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    const PLAYER_WIDTH = 0.29;
    const HEAD_BUFFER = 0.2;

    const minX = Math.round(pos.x - PLAYER_WIDTH);
    const maxX = Math.round(pos.x + PLAYER_WIDTH);
    const minY = Math.round(pos.y - eyeHeight.current);
    const maxY = Math.round(pos.y + HEAD_BUFFER);
    const minZ = Math.round(pos.z - PLAYER_WIDTH);
    const maxZ = Math.round(pos.z + PLAYER_WIDTH);

    if (!chunksDataRef.current) return false;

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const type = getGlobalBlockType(x, y, z, chunksDataRef.current);
          if (type !== 0) return true; // Solid (non-air)
        }
      }
    }
    return false;
  }, [chunksDataRef]);

  const applyVerticalForces = useCallback((actions: Record<string, boolean>, isSprinting: boolean, isFlying: boolean) => {
    if (isFlying) {
      const flySpeed = 50;
      const verticalMove = (actions.jump ? 1 : 0) - (actions.down ? 1 : 0);
      velocity.current.y += verticalMove * flySpeed * PHYSICS_STEP;
      velocity.current.y -= velocity.current.y * 5 * PHYSICS_STEP;
    } else {
      if (actions.jump && canJump.current) {
        velocity.current.y += isSprinting ? 8.8 : 8;
        canJump.current = false;
      }
      velocity.current.y -= 9.8 * 3 * PHYSICS_STEP;
    }
  }, []);

  const resolveCrouching = useCallback((actions: Record<string, boolean>, camera: THREE.PerspectiveCamera, isFlying: boolean) => {
      const isCrouching = actions.down && !isFlying;
      const targetEyeHeight = isCrouching ? 1.2 : 1.6;
      
      if (Math.abs(eyeHeight.current - targetEyeHeight) > 0.01) {
          const diff = targetEyeHeight - eyeHeight.current;
          const step = Math.sign(diff) * Math.min(Math.abs(diff), PHYSICS_STEP * 6);
          
          if (step > 0) {
              const testPos = camera.position.clone();
              testPos.y += step;
              const oldEye = eyeHeight.current;
              eyeHeight.current += step;
              if (checkCollision(testPos)) {
                  eyeHeight.current = oldEye;
              } else {
                  camera.position.y += step;
              }
          } else {
              camera.position.y += step;
              eyeHeight.current += step;
          }
      }
  }, [checkCollision]);

  const applyHorizontalForces = useCallback((isSprinting: boolean, isFlying: boolean, isCrouching: boolean) => {
    velocity.current.x -= velocity.current.x * 10 * PHYSICS_STEP;
    velocity.current.z -= velocity.current.z * 10 * PHYSICS_STEP;

    direction.current.z = Number(moveForward.current) - Number(moveBackward.current);
    direction.current.x = Number(moveRight.current) - Number(moveLeft.current);
    direction.current.normalize();

    let baseSpeed = 40;
    let multiplier = 1;

    if (isFlying) {
      baseSpeed = 60;
      multiplier = isSprinting ? 3 : 1;
    } else {
      multiplier = isSprinting ? 1.3 : (isCrouching ? 0.35 : 1);
    }

    const speed = baseSpeed * multiplier;
    if (moveForward.current || moveBackward.current) velocity.current.z -= direction.current.z * speed * PHYSICS_STEP;
    if (moveLeft.current || moveRight.current) velocity.current.x -= direction.current.x * speed * PHYSICS_STEP;
  }, []);

  const resolveVerticalCollision = useCallback((camera: THREE.PerspectiveCamera) => {
    const oldPosY = camera.position.y;
    camera.position.y += velocity.current.y * PHYSICS_STEP;
    
    if (checkCollision(camera.position)) {
      camera.position.y = oldPosY;
      if (velocity.current.y < 0) canJump.current = true;
      velocity.current.y = 0;
    }
  }, [checkCollision]);

  const resolveHorizontalCollision = useCallback((camera: THREE.PerspectiveCamera, controls: PointerLockControls, isCrouching: boolean) => {
    const moveX = -velocity.current.x * PHYSICS_STEP;
    const moveZ = -velocity.current.z * PHYSICS_STEP;
    
    // Guardar posicion original
    const originalPos = camera.position.clone();
    
    // Calcular posicion objetivo a partir del movimiento local de la camara
    controls.moveRight(moveX);
    controls.moveForward(moveZ);
    const targetPos = camera.position.clone();
    
    // Obtener los deltas globales
    const deltaX = targetPos.x - originalPos.x;
    const deltaZ = targetPos.z - originalPos.z;

    // Resetear a la posicion original
    camera.position.copy(originalPos);

    // Mover y probar en el eje X global independientemente
    camera.position.x += deltaX;
    let collidedX = false;
    if (checkCollision(camera.position)) {
      camera.position.x = originalPos.x;
      collidedX = true;
    } else if (isCrouching && canJump.current) {
      const testPos = camera.position.clone();
      testPos.y -= 0.2;
      if (!checkCollision(testPos)) {
         camera.position.x = originalPos.x;
         collidedX = true;
      }
    }

    // Mover y probar en el eje Z global independientemente
    camera.position.z += deltaZ;
    let collidedZ = false;
    if (checkCollision(camera.position)) {
      camera.position.z = originalPos.z;
      collidedZ = true;
    } else if (isCrouching && canJump.current) {
      const testPos = camera.position.clone();
      testPos.y -= 0.2;
      if (!checkCollision(testPos)) {
         camera.position.z = originalPos.z;
         collidedZ = true;
      }
    }

    // Lógica de Salto Automático
    if ((collidedX || collidedZ) && autoJumpEnabledRef?.current && moveForward.current && canJump.current && !isCrouching) {
        const testPos = camera.position.clone();
        // Intentar ver si moviéndonos en la dirección bloqueada y subiendo, hay espacio libre
        if (collidedX) testPos.x += deltaX;
        if (collidedZ) testPos.z += deltaZ;
        testPos.y += 1.2; // Altura mínima para superar 1 bloque

        if (!checkCollision(testPos)) {
            // El bloque de arriba está libre, realizar salto automático
            velocity.current.y += isSprintingRef.current ? 8.8 : 8;
            canJump.current = false;
        }
    }
  }, [checkCollision, autoJumpEnabledRef]);

  /**
   * Handles a single 1/60s physics tick.
   * Cognitive Complexity now reduced below threshold
   */
  const applyPhysicsStep = useCallback((actions: Record<string, boolean>, camera: THREE.PerspectiveCamera, controls: PointerLockControls) => {
    const isFlying = actions.isFlying;
    const isCrouching = actions.down && !isFlying;
    const isSprinting = actions.sprint && moveForward.current && !isCrouching;

    resolveCrouching(actions, camera, isFlying);
    applyVerticalForces(actions, isSprinting, isFlying);
    applyHorizontalForces(isSprinting, isFlying, isCrouching);
    resolveVerticalCollision(camera);
    resolveHorizontalCollision(camera, controls, isCrouching);
  }, [applyVerticalForces, applyHorizontalForces, resolveVerticalCollision, resolveHorizontalCollision, resolveCrouching]);

  const update = useCallback((delta: number, camera: THREE.PerspectiveCamera, controls: PointerLockControls) => {
    if (!controls.isLocked) return;

    // Sync input refs
    const actions = actionsRef.current;
    moveForward.current = actions.moveForward;
    moveBackward.current = actions.moveBackward;
    moveLeft.current = actions.moveLeft;
    moveRight.current = actions.moveRight;
    isSprintingRef.current = actions.sprint && actions.moveForward && !(actions.down && !actions.isFlying);

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