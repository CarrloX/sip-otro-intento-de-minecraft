import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createMaterials } from '../services/TextureService';
import { generateWorld, generateTree } from '../services/WorldService';
import { setupLighting } from '../services/LightingService';
import { createHighlighter, updateSelection } from '../services/SelectionService';
import type { SelectionResult } from '../services/SelectionService';
import { usePlayer } from './usePlayer';
import { useInteraction } from './useInteraction';

export const useMinecraft = (currentBlockType: number) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  
  const currentBlockTypeRef = useRef(currentBlockType);
  useEffect(() => {
    currentBlockTypeRef.current = currentBlockType;
  }, [currentBlockType]);
  
  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const objectsRef = useRef<THREE.Mesh[]>([]);
  const worldBlocksRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const hoveredBlockRef = useRef<SelectionResult | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  
  // Services & State
  const materialsRef = useRef<Record<number, THREE.Material | THREE.Material[]>>({});
  const blockGeometry = useRef(new THREE.BoxGeometry(1, 1, 1));
  const prevTime = useRef(performance.now());

  // Initialize Custom Hooks
  const player = usePlayer(worldBlocksRef);
  
  const addBlock = useCallback((x: number, y: number, z: number, type: number) => {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    if (worldBlocksRef.current.has(key)) return;

    const material = materialsRef.current[type];
    const mesh = new THREE.Mesh(blockGeometry.current, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type, key };

    sceneRef.current?.add(mesh);
    objectsRef.current.push(mesh);
    worldBlocksRef.current.set(key, mesh);
  }, []);

  const removeBlock = useCallback((mesh: THREE.Mesh) => {
    sceneRef.current?.remove(mesh);
    const index = objectsRef.current.indexOf(mesh);
    if (index > -1) objectsRef.current.splice(index, 1);
    worldBlocksRef.current.delete(mesh.userData.key);
  }, []);

  const interaction = useInteraction(
    objectsRef,
    cameraRef,
    controlsRef,
    addBlock,
    removeBlock,
    currentBlockTypeRef,
    hoveredBlockRef
  );

  const lockControls = () => {
    controlsRef.current?.lock();
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // Init Scene
    const scene = new THREE.Scene();
    setupLighting(scene);
    sceneRef.current = scene;

    // Init Camera
    const camera = new THREE.PerspectiveCamera(75, globalThis.innerWidth / globalThis.innerHeight, 0.1, 100);
    camera.position.y = 30;
    cameraRef.current = camera;


    // Init Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(globalThis.devicePixelRatio);
    renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
    renderer.shadowMap.enabled = true;
    mountNode.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Init Controls
    const controls = new PointerLockControls(camera, document.body);
    scene.add(controls.object);
    controlsRef.current = controls;

    const onLock = () => setIsLocked(true);
    const onUnlock = () => setIsLocked(false);
    controls.addEventListener('lock', onLock);
    controls.addEventListener('unlock', onUnlock);

    // World & Materials
    materialsRef.current = createMaterials();
    
    const treeGen = (x: number, y: number, z: number) => 
      generateTree(x, y, z, addBlock, worldBlocksRef.current);
    
    generateWorld(30, addBlock, treeGen);

    // Event Listeners
    // Event Listeners (Keyboard handled by usePlayer)

    // Highlighter
    const highlighter = createHighlighter();
    scene.add(highlighter);

    const handleMouseDown = (e: MouseEvent) => interaction.handleMouseDown(e);

    document.addEventListener('mousedown', handleMouseDown);

    // Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = performance.now();
      const delta = Math.min((time - prevTime.current) / 1000, 0.1);

      if (controls.isLocked) {
        player.update(delta, camera, controls);
        hoveredBlockRef.current = updateSelection(
          raycasterRef.current,
          camera,
          objectsRef.current,
          highlighter
        );
      } else {
        highlighter.visible = false;
        hoveredBlockRef.current = null;
      }
      
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

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      globalThis.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', handleMouseDown);
      controls.removeEventListener('lock', onLock);
      controls.removeEventListener('unlock', onUnlock);
      renderer.dispose();
      
      renderer.domElement.remove();
      
      worldBlocksRef.current.clear();
      objectsRef.current = [];
    };
  }, [addBlock, interaction, player]);

  return { mountRef, isLocked, lockControls };
};
