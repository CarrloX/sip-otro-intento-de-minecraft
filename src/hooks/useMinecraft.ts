import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export const useMinecraft = (currentBlockType: number) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  
  // Ref para el tipo de bloque actual para evitar re-ejecutar el useEffect
  const currentBlockTypeRef = useRef(currentBlockType);
  useEffect(() => {
    currentBlockTypeRef.current = currentBlockType;
  }, [currentBlockType]);
  
  // Three.js Refs
  const sceneRef = useRef<THREE.Scene>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>(null);
  const controlsRef = useRef<PointerLockControls>(null);
  const objectsRef = useRef<THREE.Mesh[]>([]);
  const worldBlocksRef = useRef<Map<string, THREE.Mesh>>(new Map());
  
  // Physics & Movement Refs
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);
  const canJump = useRef(false);
  const prevTime = useRef(performance.now());
  
  // Materials Ref
  const materialsRef = useRef<Record<number, THREE.Material | THREE.Material[]>>({});
  const blockGeometry = useRef(new THREE.BoxGeometry(1, 1, 1));

  // Texture Generation (Canvas)
  const generateTexture = (width: number, height: number, type: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const imageData = context.createImageData(width, height);
    const data = imageData.data;

    let r_base = 0, g_base = 0, b_base = 0, variance = 0;

    if (type === 'grass_top') { r_base = 65; g_base = 152; b_base = 49; variance = 15; }
    else if (type === 'dirt') { r_base = 121; g_base = 85; b_base = 58; variance = 10; }
    else if (type === 'stone') { r_base = 128; g_base = 128; b_base = 128; variance = 20; }
    else if (type === 'wood_side') { r_base = 106; g_base = 75; b_base = 53; variance = 10; }
    else if (type === 'wood_top') { r_base = 160; g_base = 130; b_base = 90; variance = 5; }
    else if (type === 'leaves') { r_base = 59; g_base = 122; b_base = 45; variance = 20; }

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * variance;
      let modR = r_base + noise, modG = g_base + noise, modB = b_base + noise;
      
      if (type === 'wood_side' && (i / 4) % width % 4 === 0) {
        modR -= 15; modG -= 15; modB -= 15;
      }
      if (type === 'leaves' && Math.random() < 0.2) {
        modR *= 0.5; modG *= 0.5; modB *= 0.5;
      }

      data[i] = Math.min(255, Math.max(0, modR));
      data[i + 1] = Math.min(255, Math.max(0, modG));
      data[i + 2] = Math.min(255, Math.max(0, modB));
      data[i + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const createMaterials = () => {
    const texGrassTop = generateTexture(16, 16, 'grass_top');
    const texDirt = generateTexture(16, 16, 'dirt');
    const texStone = generateTexture(16, 16, 'stone');
    const texWoodSide = generateTexture(16, 16, 'wood_side');
    const texWoodTop = generateTexture(16, 16, 'wood_top');
    const texLeaves = generateTexture(16, 16, 'leaves');

    materialsRef.current[1] = [
      new THREE.MeshLambertMaterial({ map: texDirt }),
      new THREE.MeshLambertMaterial({ map: texDirt }),
      new THREE.MeshLambertMaterial({ map: texGrassTop }),
      new THREE.MeshLambertMaterial({ map: texDirt }),
      new THREE.MeshLambertMaterial({ map: texDirt }),
      new THREE.MeshLambertMaterial({ map: texDirt })
    ];
    materialsRef.current[2] = new THREE.MeshLambertMaterial({ map: texDirt });
    materialsRef.current[3] = new THREE.MeshLambertMaterial({ map: texStone });
    materialsRef.current[4] = [
      new THREE.MeshLambertMaterial({ map: texWoodSide }),
      new THREE.MeshLambertMaterial({ map: texWoodSide }),
      new THREE.MeshLambertMaterial({ map: texWoodTop }),
      new THREE.MeshLambertMaterial({ map: texWoodTop }),
      new THREE.MeshLambertMaterial({ map: texWoodSide }),
      new THREE.MeshLambertMaterial({ map: texWoodSide })
    ];
    materialsRef.current[5] = new THREE.MeshLambertMaterial({ map: texLeaves });
  };

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

  const generateTree = useCallback((x: number, y: number, z: number) => {
    const height = 4;
    for (let i = 0; i < height; i++) {
      addBlock(x, y + i, z, 4);
    }
    for (let hx = x - 2; hx <= x + 2; hx++) {
      for (let hz = z - 2; hz <= z + 2; hz++) {
        for (let hy = y + height - 2; hy <= y + height + 1; hy++) {
          if (Math.abs(hx - x) === 2 && Math.abs(hz - z) === 2 && hy === y + height + 1) continue;
          if (!worldBlocksRef.current.has(`${hx},${hy},${hz}`)) {
            addBlock(hx, hy, hz, 5);
          }
        }
      }
    }
  }, [addBlock]);

  const generateWorld = useCallback(() => {
    const worldSize = 30;
    const noise = (x: number, z: number) => {
      return Math.floor(Math.sin(x * 0.1) * 2 + Math.cos(z * 0.1) * 2);
    };

    for (let x = -worldSize / 2; x < worldSize / 2; x++) {
      for (let z = -worldSize / 2; z < worldSize / 2; z++) {
        const surfaceY = noise(x, z);
        for (let y = surfaceY; y >= surfaceY - 4; y--) {
          let type = 3;
          if (y === surfaceY) type = 1;
          else if (y > surfaceY - 3) type = 2;
          addBlock(x, y, z, type);
        }
        if (Math.random() < 0.03 && x > -worldSize / 2 + 2 && x < worldSize / 2 - 2 && z > -worldSize / 2 + 2 && z < worldSize / 2 - 2) {
          generateTree(x, surfaceY + 1, z);
        }
      }
    }
  }, [addBlock, generateTree]);

  const removeBlock = (mesh: THREE.Mesh) => {
    sceneRef.current?.remove(mesh);
    const index = objectsRef.current.indexOf(mesh);
    if (index > -1) objectsRef.current.splice(index, 1);
    worldBlocksRef.current.delete(mesh.userData.key);
  };

  const checkCollision = (pos: THREE.Vector3) => {
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
  };

  // Interaction Ref
  const raycaster = useRef(new THREE.Raycaster());

  const onMouseDownRef = useRef((event: MouseEvent) => {});

  useEffect(() => {
    onMouseDownRef.current = (event: MouseEvent) => {
      if (!controlsRef.current?.isLocked) return;

      raycaster.current.setFromCamera(new THREE.Vector2(0, 0), cameraRef.current!);
      const intersects = raycaster.current.intersectObjects(objectsRef.current, false).filter(i => i.distance < 5);

      if (intersects.length > 0) {
        const intersect = intersects[0];
        if (event.button === 0) {
          removeBlock(intersect.object as THREE.Mesh);
        } else if (event.button === 2) {
          const pos = intersect.object.position.clone().add(intersect.face!.normal);
          const pPos = cameraRef.current!.position;
          if (Math.abs(pos.x - pPos.x) < 0.8 && Math.abs(pos.z - pPos.z) < 0.8 && (pos.y >= pPos.y - 1.5 && pos.y <= pPos.y + 0.5)) {
            return;
          }
          addBlock(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z), currentBlockTypeRef.current);
        }
      }
    };
  }, [addBlock]);

  const lockControls = () => {
    controlsRef.current?.lock();
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // Init Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 50);
    sceneRef.current = scene;

    // Init Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.y = 30;
    cameraRef.current = camera;

    // Init Lights
    const ambientLight = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);
    ambientLight.position.set(0.5, 1, 0.75);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Init Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
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
    createMaterials();
    generateWorld();

    // Event Listeners
    const onKeyDown = (event: KeyboardEvent) => {
      const code = event.code;
      const key = event.key.toLowerCase();
      if (code === 'KeyW' || code === 'ArrowUp' || key === 'w') moveForward.current = true;
      if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a') moveLeft.current = true;
      if (code === 'KeyS' || code === 'ArrowDown' || key === 's') moveBackward.current = true;
      if (code === 'KeyD' || code === 'ArrowRight' || key === 'd') moveRight.current = true;
      if (code === 'Space' || key === ' ') {
        if (canJump.current) velocity.current.y += 8;
        canJump.current = false;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const code = event.code;
      const key = event.key.toLowerCase();
      if (code === 'KeyW' || code === 'ArrowUp' || key === 'w') moveForward.current = false;
      if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a') moveLeft.current = false;
      if (code === 'KeyS' || code === 'ArrowDown' || key === 's') moveBackward.current = false;
      if (code === 'KeyD' || code === 'ArrowRight' || key === 'd') moveRight.current = false;
    };

    const handleMouseDown = (e: MouseEvent) => onMouseDownRef.current(e);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', handleMouseDown);

    // Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = performance.now();

      if (controls.isLocked) {
        const delta = Math.min((time - prevTime.current) / 1000, 0.1);
        velocity.current.x -= velocity.current.x * 10.0 * delta;
        velocity.current.z -= velocity.current.z * 10.0 * delta;
        velocity.current.y -= 9.8 * 3.0 * delta;

        direction.current.z = Number(moveForward.current) - Number(moveBackward.current);
        direction.current.x = Number(moveRight.current) - Number(moveLeft.current);
        direction.current.normalize();

        const speed = 40.0;
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
      }
      prevTime.current = time;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousedown', handleMouseDown);
      controls.removeEventListener('lock', onLock);
      controls.removeEventListener('unlock', onUnlock);
      renderer.dispose();
      
      if (renderer.domElement.parentNode === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
      
      worldBlocksRef.current.clear();
      objectsRef.current = [];
    };
  }, [generateWorld]);

  return { mountRef, isLocked, lockControls };
};
