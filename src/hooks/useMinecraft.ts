import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createMaterials } from '../services/TextureService';
import { setupLighting, updateFog, updateLighting } from '../services/LightingService';
import { createHighlighter, updateSelection } from '../services/SelectionService';
import type { SelectionResult } from '../services/SelectionService';
import { usePlayer } from './usePlayer';
import { useInteraction } from './useInteraction';
import { useWorld } from './useWorld';
import { commandService } from '../services/CommandService';
import { getGlobalBlockType, Y_MIN, Y_MAX } from '../services/WorldService';

const updateDebugUI = (camera: THREE.PerspectiveCamera) => {
  const posX = camera.position.x;
  const posY = camera.position.y;
  const posZ = camera.position.z;
  
  const xyzEl = document.getElementById('debug-xyz');
  if (xyzEl) xyzEl.innerText = `XYZ: ${posX.toFixed(3)} / ${posY.toFixed(5)} / ${posZ.toFixed(3)}`;

  const blockEl = document.getElementById('debug-block');
  if (blockEl) blockEl.innerText = `Block: ${Math.floor(posX)} ${Math.floor(posY)} ${Math.floor(posZ)}`;

  const chunkX = Math.floor(posX / 16);
  const chunkY = Math.floor(posY / 16);
  const chunkZ = Math.floor(posZ / 16);
  const chunkRx = Math.floor(posX) & 15;
  const chunkRy = Math.floor(posY) & 15;
  const chunkRz = Math.floor(posZ) & 15;
  const chunkEl = document.getElementById('debug-chunk');
  if (chunkEl) chunkEl.innerText = `Chunk: ${chunkRx} ${chunkRy} ${chunkRz} in ${chunkX} ${chunkY} ${chunkZ}`;

  const facingEl = document.getElementById('debug-facing');
  if (facingEl) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      let facing: string;
      if (Math.abs(dir.x) > Math.abs(dir.z)) {
          facing = dir.x > 0 ? "east (Towards positive X)" : "west (Towards negative X)";
      } else if (dir.z > 0) {
          facing = "south (Towards positive Z)";
      } else {
          facing = "north (Towards negative Z)";
      }
      facingEl.innerText = `Facing: ${facing}`;
  }
};

export interface MinecraftOptions {
  currentBlockType: number;
  targetFps?: number;
  renderDistance?: number;
  autoJump?: boolean;
  fancyLeaves?: boolean;
  showClouds?: boolean;
  enableShadows?: boolean;
  brightness?: number;
  seed?: number;
  onWorldReady?: () => void;
}

export const useMinecraft = ({
  currentBlockType,
  targetFps = 144,
  renderDistance = 12,
  autoJump = true,
  fancyLeaves = true,
  showClouds = true,
  enableShadows = true,
  brightness = 50,
  seed = 0,
  onWorldReady
}: MinecraftOptions) => {
  const mountRef = useRef<HTMLButtonElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef<number>(0);
  
  const currentBlockTypeRef = useRef(currentBlockType);
  const targetFpsRef = useRef(targetFps);

  useEffect(() => {
    currentBlockTypeRef.current = currentBlockType;
  }, [currentBlockType]);

  useEffect(() => {
    targetFpsRef.current = targetFps;
  }, [targetFps]);
  
  const renderDistanceRef = useRef(renderDistance);
  useEffect(() => {
    renderDistanceRef.current = renderDistance;
    if (sceneRef.current) {
      updateFog(sceneRef.current, renderDistance);
    }
    if (cameraRef.current) {
      const CHUNK_SIZE = 16;
      // Force Far Plane to at least 32 chunks (512 units) to guarantee cloud visibility
      cameraRef.current.far = Math.max(512, renderDistance * CHUNK_SIZE * 2);
      cameraRef.current.updateProjectionMatrix();
    }
  }, [renderDistance]);
  
  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const hoveredBlockRef = useRef<SelectionResult | null>(null);
  const lightingSystemRef = useRef<any>(null);
  
  // Shared Configuration
  const materialsRef = useRef<Record<number, THREE.Material | THREE.Material[]>>({});
  const blockGeometryRef = useRef(new THREE.BoxGeometry(1, 1, 1));
  const prevTime = useRef<number>(0);
  const lastRenderTime = useRef<number>(0);

  // Initialize World Hook (Manages Chunks and Blocks)
  const fancyLeavesRef = useRef(fancyLeaves);
  useEffect(() => { fancyLeavesRef.current = fancyLeaves; }, [fancyLeaves]);

  useEffect(() => {
    if (lightingSystemRef.current) {
      lightingSystemRef.current.cloudGroup.visible = showClouds;
    }
  }, [showClouds]);

  useEffect(() => {
    if (rendererRef.current && sceneRef.current) {
      rendererRef.current.shadowMap.enabled = enableShadows;
      sceneRef.current.traverse((child: any) => {
        if (child.material) {
          child.material.needsUpdate = true;
        }
      });
    }
  }, [enableShadows]);
  
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.toneMapping = THREE.LinearToneMapping;
      rendererRef.current.toneMappingExposure = brightness / 50;
    }
  }, [brightness]);
  
  const seedRef = useRef(seed);
  useEffect(() => { seedRef.current = seed; }, [seed]);

  const isWorldReadyRef = useRef(false);
  const handleWorldReady = useCallback((chunksData: Map<string, Uint8Array>) => {
    if (!isWorldReadyRef.current && cameraRef.current) {
        const px = Math.floor(cameraRef.current.position.x);
        const pz = Math.floor(cameraRef.current.position.z);
        
        let safeY = 30; // Default fallback
        
        // Find the highest solid block that has at least 2 blocks of air above it
        for (let y = Y_MAX - 2; y >= Y_MIN; y--) {
            const block = getGlobalBlockType(px, y, pz, chunksData);
            if (block !== 0) { // Found a solid block
                const above1 = getGlobalBlockType(px, y + 1, pz, chunksData);
                const above2 = getGlobalBlockType(px, y + 2, pz, chunksData);
                
                // If there's enough head room (at least 2 blocks of air)
                if (above1 === 0 && above2 === 0) {
                    safeY = y + 2.2;
                    break;
                }
            }
        }
        
        cameraRef.current.position.y = safeY;
    }
    isWorldReadyRef.current = true;
    onWorldReady?.();
  }, [onWorldReady]);

  const world = useWorld(sceneRef, materialsRef, blockGeometryRef, renderDistanceRef, fancyLeavesRef, seedRef, handleWorldReady);

  const autoJumpRef = useRef(autoJump);
  useEffect(() => {
    autoJumpRef.current = autoJump;
  }, [autoJump]);

  const player = usePlayer(world.chunksDataRef, autoJumpRef);
  
  const interaction = useInteraction(
    world.objectsRef,
    cameraRef,
    controlsRef,
    world.addBlock,
    world.removeBlock,
    currentBlockTypeRef,
    hoveredBlockRef
  );

  const lockControls = useCallback(() => {
    controlsRef.current?.lock();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/immutability
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // 1. Init Scene & Lighting
    const scene = new THREE.Scene();
    const lightingSystem = setupLighting(scene, renderDistanceRef.current);
    lightingSystem.cloudGroup.visible = showClouds;
    lightingSystemRef.current = lightingSystem;
    sceneRef.current = scene;
    let worldTime = Math.PI / 4; // Start at Morning (+0.78 rad)
    const TIME_SPEED = 0.005; // Velocidad del ciclo de día (aprox. 20 min por ciclo)

    // 2. Init Camera
    const initialFar = Math.max(512, renderDistanceRef.current * 16 * 2);
    const camera = new THREE.PerspectiveCamera(75, globalThis.innerWidth / globalThis.innerHeight, 0.1, initialFar);
    camera.position.y = 30;
    cameraRef.current = camera;

    // 3. Init Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(globalThis.devicePixelRatio);
    renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
    renderer.shadowMap.enabled = enableShadows;
    renderer.shadowMap.type = THREE.PCFShadowMap; 
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = brightness / 50;
    mountNode.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Init Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    scene.add(controls.object);
    controlsRef.current = controls;

    const onLock = () => setIsLocked(true);
    const onUnlock = () => setIsLocked(false);
    controls.addEventListener('lock', onLock);
    controls.addEventListener('unlock', onUnlock);

    // If pointer is already locked (e.g. from StartScreen click), sync state
    if (document.pointerLockElement === document.body || document.pointerLockElement === renderer.domElement) {
      controls.isLocked = true;
      setIsLocked(true);
    }

    // 5. Shared Resources
    materialsRef.current = createMaterials();

    // 6. Highlighter & Interactions
    const highlighter = createHighlighter();
    scene.add(highlighter);

    commandService.register('/time', (action?: string, value?: string) => {
        if (action === 'set') {
            if (value === 'day') {
                worldTime = Math.PI / 4;
                return 'Time set to day';
            } else if (value === 'night') {
                worldTime = Math.PI + Math.PI / 4;
                return 'Time set to night';
            }
            return 'Usage: /time set <day|night>';
        }
        return 'Usage: /time set <day|night>';
    });

    commandService.register('/tp', (x?: string, y?: string, z?: string) => {
        if (x !== undefined && y !== undefined && z !== undefined) {
            const px = Number.parseFloat(x);
            const py = Number.parseFloat(y);
            const pz = Number.parseFloat(z);
            if (!Number.isNaN(px) && !Number.isNaN(py) && !Number.isNaN(pz)) {
                camera.position.set(px, py, pz);
                return `Teleported to ${px} ${py} ${pz}`;
            }
        }
        return 'Usage: /tp <x> <y> <z>';
    });

    const handleMouseDown = (e: MouseEvent) => interaction.handleMouseDown(e);
    document.addEventListener('mousedown', handleMouseDown);

    // Initialize timing references once on mount
    lastFpsUpdate.current = performance.now();
    prevTime.current = performance.now();
    lastRenderTime.current = performance.now();

    // 7. Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = performance.now();
      
      // FPS Capping Logic
      const interval = 1000 / targetFpsRef.current;
      const elapsed = time - lastRenderTime.current;
      
      if (elapsed < interval) return;
      
      // Update lastRenderTime to the start of this frame (with drift compensation)
      lastRenderTime.current = time - (elapsed % interval);

      const delta = Math.min((time - prevTime.current) / 1000, 0.1);

      // FPS Tracking (For UI display)
      frameCount.current++;
      if (time - lastFpsUpdate.current > 1000) {
        setFps(Math.round((frameCount.current * 1000) / (time - lastFpsUpdate.current)));
        frameCount.current = 0;
        lastFpsUpdate.current = time;
      }

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in globalThis);
      
      if (controls.isLocked || isMobile) {
        // Delegate updates to specialized hooks
        if (isWorldReadyRef.current) {
          player.update(delta, camera, controls);
        }
        
        // Update Debug Coordinates
        updateDebugUI(camera);

        hoveredBlockRef.current = updateSelection(
          camera,
          world.chunksDataRef.current,
          highlighter
        );

        // Standard FOV = 75, Sprinting FOV = 85
        const targetFov = player.isSprinting.current ? 85 : 75;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
          camera.fov += (targetFov - camera.fov) * delta * 8;
          camera.updateProjectionMatrix();
        }
      } else {
        highlighter.visible = false;
        hoveredBlockRef.current = null;
      }
      
      // Manage chunks and update time/lighting even when unlocked/paused
      world.manageChunks(camera.position);
      worldTime += delta * TIME_SPEED;
      updateLighting(scene, lightingSystem, worldTime, camera.position);
      
      prevTime.current = time;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = globalThis.innerWidth / globalThis.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
    };
    globalThis.addEventListener('resize', onResize);

    // 8. Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      globalThis.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', handleMouseDown);
      controls.removeEventListener('lock', onLock);
      controls.removeEventListener('unlock', onUnlock);
      commandService.unregister('/time');
      commandService.unregister('/tp');
      renderer.dispose();
      renderer.domElement.remove();
      world.chunksDataRef.current.clear();
      world.objectsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMobileLook = useCallback((movementX: number, movementY: number) => {
    if (!cameraRef.current) return;
    const camera = cameraRef.current;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= movementX * 0.005;
    euler.x -= movementY * 0.005;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    camera.quaternion.setFromEuler(euler);
  }, []);

  const handleMobileInteract = useCallback((isPlace: boolean = false) => {
    // We create a minimal MouseEvent-like object that satisfies handleMouseDown
    interaction.handleMouseDown({ button: isPlace ? 2 : 0 } as unknown as MouseEvent);
  }, [interaction]);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in globalThis);

  return { mountRef, isLocked: isLocked || isMobile, lockControls, fps, handleMobileLook, handleMobileInteract };
};
