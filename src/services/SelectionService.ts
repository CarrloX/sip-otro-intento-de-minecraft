import * as THREE from 'three';
import { getGlobalBlockType } from './WorldService';

export interface SelectionResult {
  blockPosition: THREE.Vector3;
  face: { normal: THREE.Vector3 } | null;
  distance: number;
}

export const createHighlighter = () => {
  const geometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
  );
  line.visible = false;
  return line;
};

/**
 * Core DDA Algorithm implementation
 */
const performVoxelTraversal = (
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  chunksData: Map<string, Uint8Array>,
  maxDistance: number
) => {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = direction.x > 0 ? 1 : -1;
  const stepY = direction.y > 0 ? 1 : -1;
  const stepZ = direction.z > 0 ? 1 : -1;

  const tDeltaX = Math.abs(1 / direction.x);
  const tDeltaY = Math.abs(1 / direction.y);
  const tDeltaZ = Math.abs(1 / direction.z);

  let tMaxX = (stepX > 0 ? (Math.floor(origin.x) + 1 - origin.x) : (origin.x - Math.floor(origin.x))) * tDeltaX;
  let tMaxY = (stepY > 0 ? (Math.floor(origin.y) + 1 - origin.y) : (origin.y - Math.floor(origin.y))) * tDeltaY;
  let tMaxZ = (stepZ > 0 ? (Math.floor(origin.z) + 1 - origin.z) : (origin.z - Math.floor(origin.z))) * tDeltaZ;

  let normal = new THREE.Vector3();
  let distance = 0;

  while (distance < maxDistance) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      distance = tMaxX;
      tMaxX += tDeltaX;
      normal.set(-stepX, 0, 0);
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      distance = tMaxY;
      tMaxY += tDeltaY;
      normal.set(0, -stepY, 0);
    } else {
      z += stepZ;
      distance = tMaxZ;
      tMaxZ += tDeltaZ;
      normal.set(0, 0, -stepZ);
    }

    const type = getGlobalBlockType(x, y, z, chunksData);
    if (type !== 0) { // Solid block
      return { hit: true, blockPosition: new THREE.Vector3(x, y, z), normal, distance };
    }
  }

  return { hit: false };
};

export const updateSelection = (
  camera: THREE.PerspectiveCamera,
  chunksData: Map<string, Uint8Array>,
  highlighter: THREE.LineSegments,
  maxDistance: number = 5
): SelectionResult | null => {
  const origin = new THREE.Vector3().copy(camera.position).addScalar(0.5);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

  const result = performVoxelTraversal(origin, direction, chunksData, maxDistance);

  if (result.hit && result.blockPosition && result.normal) {
    highlighter.position.copy(result.blockPosition);
    highlighter.visible = true;

    return {
      blockPosition: result.blockPosition,
      face: { normal: result.normal },
      distance: result.distance || 0
    };
  }

  highlighter.visible = false;
  return null;
};
