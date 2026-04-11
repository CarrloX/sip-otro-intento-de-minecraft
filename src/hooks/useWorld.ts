import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE, generateChunk } from '../services/WorldService';

export const useWorld = (
  sceneRef: React.RefObject<THREE.Scene | null>,
  materialsRef: React.RefObject<Record<number, THREE.Material | THREE.Material[]>>,
  blockGeometryRef: React.RefObject<THREE.BoxGeometry>
) => {
  // World State (Option 3: Data Grid + InstancedMesh)
  const objectsRef = useRef<THREE.Object3D[]>([]); // For Raycasting
  
  // Mathematical Grid & Persistence
  const loadedBlocksRef = useRef<Map<string, number>>(new Map()); // Global grid: x,y,z -> type
  const chunkBlocksRef = useRef<Map<string, Set<string>>>(new Map()); // chunkId -> Set of x,y,z keys
  const worldDataRef = useRef<Map<string, number>>(new Map()); // 0 = air, 1-5 = blocks
  
  // Visuals
  const loadedChunksRef = useRef<Set<string>>(new Set());
  const chunkMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const playerChunkRef = useRef({ x: Infinity, z: Infinity });

  // Update the raycaster target array
  const updateRaycastObjects = useCallback(() => {
    const meshes: THREE.Object3D[] = [];
    chunkMeshesRef.current.forEach(group => {
      meshes.push(...group.children);
    });
    objectsRef.current = meshes;
  }, []);

  const buildChunkMesh = useCallback((chunkId: string) => {
    const keys = chunkBlocksRef.current.get(chunkId);
    if (!keys) return;

    const instancesPerType: Record<number, THREE.Matrix4[]> = {};
    for (let i = 1; i <= 5; i++) instancesPerType[i] = [];

    // Face Culling Logic
    keys.forEach(key => {
      const type = loadedBlocksRef.current.get(key);
      if (!type) return;

      const [x, y, z] = key.split(',').map(Number);
      
      const up = loadedBlocksRef.current.has(`${x},${y+1},${z}`);
      const down = loadedBlocksRef.current.has(`${x},${y-1},${z}`);
      const left = loadedBlocksRef.current.has(`${x-1},${y},${z}`);
      const right = loadedBlocksRef.current.has(`${x+1},${y},${z}`);
      const front = loadedBlocksRef.current.has(`${x},${y},${z+1}`);
      const back = loadedBlocksRef.current.has(`${x},${y},${z-1}`);

      // If fully surrounded, don't draw it (saves massive performance)
      if (up && down && left && right && front && back) return;

      const matrix = new THREE.Matrix4();
      matrix.setPosition(x, y, z);
      instancesPerType[type].push(matrix);
    });

    const chunkGroup = new THREE.Group();
    chunkGroup.userData = { chunkId };

    Object.entries(instancesPerType).forEach(([typeStr, matrices]) => {
      const type = Number(typeStr);
      if (matrices.length === 0) return;

      const material = materialsRef.current[type];
      if (!material) return;

      const instancedMesh = new THREE.InstancedMesh(blockGeometryRef.current, material, matrices.length);
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;
      
      for (let i = 0; i < matrices.length; i++) {
        instancedMesh.setMatrixAt(i, matrices[i]);
      }
      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.computeBoundingSphere(); // Fixes invisibility and unclickable blocks
      chunkGroup.add(instancedMesh);
    });

    const oldGroup = chunkMeshesRef.current.get(chunkId);
    if (oldGroup) {
      sceneRef.current?.remove(oldGroup);
      // For strict memory mgmt, we should dispose old meshes, but simplified for MVP.
    }

    chunkMeshesRef.current.set(chunkId, chunkGroup);
    sceneRef.current?.add(chunkGroup);
    updateRaycastObjects();
  }, [materialsRef, blockGeometryRef, sceneRef, updateRaycastObjects]);

  const addBlock = useCallback((x: number, y: number, z: number, type: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = `${Math.floor(rx / CHUNK_SIZE)},${Math.floor(rz / CHUNK_SIZE)}`;

    worldDataRef.current.set(key, type); // Persist
    loadedBlocksRef.current.set(key, type); // Update mathematical grid

    if (!chunkBlocksRef.current.has(chunkId)) {
        chunkBlocksRef.current.set(chunkId, new Set());
    }
    chunkBlocksRef.current.get(chunkId)!.add(key);

    buildChunkMesh(chunkId);
    // Note: To be perfect, we should also rebuild neighbor chunks if placed on a border,
    // but building the current chunk is enough for the MVP occlusion fix.
  }, [buildChunkMesh]);

  const removeBlock = useCallback((x: number, y: number, z: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    const chunkId = `${Math.floor(rx / CHUNK_SIZE)},${Math.floor(rz / CHUNK_SIZE)}`;

    worldDataRef.current.set(key, 0); // Persist as air
    loadedBlocksRef.current.delete(key);
    chunkBlocksRef.current.get(chunkId)?.delete(key);

    buildChunkMesh(chunkId);
  }, [buildChunkMesh]);

  const loadChunk = useCallback((cx: number, cz: number) => {
    const chunkId = `${cx},${cz}`;
    if (loadedChunksRef.current.has(chunkId)) return;
    
    // Generate data
    const generatedKeys = generateChunk(cx, cz, loadedBlocksRef.current, worldDataRef.current);
    
    // Associate new blocks with this chunk exactly as they were generated, 
    // even if they spill over the mathematical boundary (like tree leaves)
    chunkBlocksRef.current.set(chunkId, new Set(generatedKeys));

    // Build Graphics
    buildChunkMesh(chunkId);
    loadedChunksRef.current.add(chunkId);
  }, [buildChunkMesh]);

  const unloadChunk = useCallback((cx: number, cz: number) => {
    const chunkId = `${cx},${cz}`;
    if (!loadedChunksRef.current.has(chunkId)) return;

    // 1. Remove Graphics
    const group = chunkMeshesRef.current.get(chunkId);
    if (group) {
      sceneRef.current?.remove(group);
      chunkMeshesRef.current.delete(chunkId);
    }

    // 2. Clear from Mathematical Grid
    const keys = chunkBlocksRef.current.get(chunkId);
    if (keys) {
      keys.forEach(key => loadedBlocksRef.current.delete(key));
      chunkBlocksRef.current.delete(chunkId);
    }

    loadedChunksRef.current.delete(chunkId);
    updateRaycastObjects();
  }, [sceneRef, updateRaycastObjects]);

  const manageChunks = useCallback((cameraPosition: THREE.Vector3) => {
    const RENDER_DISTANCE = 2; 
    const px = Math.floor(cameraPosition.x / CHUNK_SIZE);
    const pz = Math.floor(cameraPosition.z / CHUNK_SIZE);

    if (px !== playerChunkRef.current.x || pz !== playerChunkRef.current.z || loadedChunksRef.current.size === 0) {
      playerChunkRef.current = { x: px, z: pz };
      const newActiveChunks = new Set<string>();

      for(let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++){
        for(let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++){
          const cx = px + dx;
          const cz = pz + dz;
          loadChunk(cx, cz);
          newActiveChunks.add(`${cx},${cz}`);
        }
      }

      const chunksToUnload: {x: number, z: number}[] = [];
      loadedChunksRef.current.forEach(chunkId => {
         if (!newActiveChunks.has(chunkId)) {
             const [ccx, ccz] = chunkId.split(',').map(Number);
             chunksToUnload.push({x: ccx, z: ccz});
         }
      });
      chunksToUnload.forEach(c => unloadChunk(c.x, c.z));
    }
  }, [loadChunk, unloadChunk]);

  return {
    objectsRef,
    loadedBlocksRef, // Expose mathematical grid to player physics
    addBlock,
    removeBlock,
    manageChunks
  };
};
