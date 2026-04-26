import * as THREE from 'three';


export interface LightingSystem {
  ambientLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  sunMesh: THREE.Mesh;
  moonLight: THREE.DirectionalLight;
  moonMesh: THREE.Mesh;
  cloudGroup: THREE.Group;
  starsPoints: THREE.Points;
}

const colorKeyframes = [
  { angle: 0, color: new THREE.Color(0xffd59e) }, // Sunrise
  { angle: Math.PI / 4, color: new THREE.Color(0x87ceeb) }, // Morning
  { angle: Math.PI / 2, color: new THREE.Color(0x87ceeb) }, // Noon
  { angle: (3 * Math.PI) / 4, color: new THREE.Color(0x87ceeb) }, // Afternoon
  { angle: Math.PI, color: new THREE.Color(0xfd5e53) }, // Sunset
  { angle: (5 * Math.PI) / 4, color: new THREE.Color(0x050510) }, // Evening
  { angle: (3 * Math.PI) / 2, color: new THREE.Color(0x020205) }, // Midnight
  { angle: (7 * Math.PI) / 4, color: new THREE.Color(0x050510) }, // Late Night
  { angle: 2 * Math.PI, color: new THREE.Color(0xffd59e) } // Wrap Sunrise
];

const getSkyColor = (theta: number) => {
  let normalizedTheta = theta % (2 * Math.PI);
  if (normalizedTheta < 0) normalizedTheta += 2 * Math.PI;

  for (let i = 0; i < colorKeyframes.length - 1; i++) {
    const k1 = colorKeyframes[i];
    const k2 = colorKeyframes[i + 1];
    if (normalizedTheta >= k1.angle && normalizedTheta <= k2.angle) {
      const t = (normalizedTheta - k1.angle) / (k2.angle - k1.angle);
      return k1.color.clone().lerp(k2.color, t);
    }
  }
  return colorKeyframes[0].color.clone();
};

export const updateFog = (scene: THREE.Scene, renderDistance: number) => {
  const CHUNK_SIZE = 16;
  const fogNear = renderDistance * CHUNK_SIZE * 0.4;
  const fogFar = renderDistance * CHUNK_SIZE * 1;
  
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = Math.max(10, fogNear);
    scene.fog.far = Math.max(32, fogFar);
  } else {
    scene.fog = new THREE.Fog(0x87CEEB, Math.max(10, fogNear), Math.max(32, fogFar));
  }
};

const setupSun = (scene: THREE.Scene) => {
  const sunLight = new THREE.DirectionalLight(0xffffee, 1.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048; 
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 600; // Extend shadow render distance to 600 to match orbitRadius (450)
  
  const shadowCamSize = 64; // High span to cover the playing area
  sunLight.shadow.camera.left = -shadowCamSize;
  sunLight.shadow.camera.right = shadowCamSize;
  sunLight.shadow.camera.top = shadowCamSize;
  sunLight.shadow.camera.bottom = -shadowCamSize;
  sunLight.shadow.bias = -0.0005; 
  scene.add(sunLight);
  scene.add(sunLight.target); 

  const sunGeo = new THREE.BoxGeometry(40, 40, 40);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee, fog: false });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);
  
  return { sunLight, sunMesh };
};

const setupMoon = (scene: THREE.Scene) => {
  const moonLight = new THREE.DirectionalLight(0xaaaaee, 0.2); 
  moonLight.castShadow = false; // Toggled dynamically
  moonLight.shadow.mapSize.width = 2048; 
  moonLight.shadow.mapSize.height = 2048;
  moonLight.shadow.camera.near = 0.5;
  moonLight.shadow.camera.far = 600; 
  
  const shadowCamSize = 64; 
  moonLight.shadow.camera.left = -shadowCamSize;
  moonLight.shadow.camera.right = shadowCamSize;
  moonLight.shadow.camera.top = shadowCamSize;
  moonLight.shadow.camera.bottom = -shadowCamSize;
  moonLight.shadow.bias = -0.0005; 
  scene.add(moonLight);
  scene.add(moonLight.target);

  const moonGeo = new THREE.BoxGeometry(32, 32, 32);
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xaaaaee, fog: false });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  scene.add(moonMesh);
  
  return { moonLight, moonMesh };
};

const setupStars = (scene: THREE.Scene) => {
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 1500;
  const positions = new Float32Array(starsCount * 3);
  
  const radius = 400; // Just inside the Far plane
  for (let i = 0; i < starsCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.0, // Invisible by default
    fog: false // Not affected by fog
  });
  
  const starsPoints = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starsPoints);
  
  return starsPoints;
};

const fillMapRectangles = (
    map: Uint8Array, 
    W: number, 
    params: { count: number, wBase: number, wRand: number, hBase: number, hRand: number, val: number }
) => {
    const { count, wBase, wRand, hBase, hRand, val } = params;
    for (let i = 0; i < count; i++) {
        const w = wBase + Math.floor(Math.random() * wRand);
        const h = hBase + Math.floor(Math.random() * hRand);
        const px = Math.floor(Math.random() * W);
        const py = Math.floor(Math.random() * W);
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                map[((px + x) % W) + ((py + y) % W) * W] = val;
            }
        }
    }
};

const generateCloudMap = (W: number) => {
    const map = new Uint8Array(W * W);
    fillMapRectangles(map, W, { count: 400, wBase: 3, wRand: 6, hBase: 3, hRand: 6, val: 1 });
    fillMapRectangles(map, W, { count: 150, wBase: 4, wRand: 8, hBase: 4, hRand: 8, val: 0 });
    return map;
};

const pushFace = (
    px: number, py: number, pz: number, 
    shade: number, type: string,
    config: { SCALE: number, T: number },
    geo: { positions: number[], indices: number[], colors: number[], vCount: number }
) => {
    const { SCALE, T } = config;
    let r = shade, g = shade, b = shade;
    if (type === 'back') {
        geo.positions.push(px+SCALE, py, pz,  px, py, pz,  px, py+T, pz,  px+SCALE, py+T, pz);
    } else if (type === 'front') {
        geo.positions.push(px, py, pz+SCALE,  px+SCALE, py, pz+SCALE,  px+SCALE, py+T, pz+SCALE,  px, py+T, pz+SCALE);
    } else if (type === 'left') {
        geo.positions.push(px, py, pz,  px, py, pz+SCALE,  px, py+T, pz+SCALE,  px, py+T, pz);
    } else if (type === 'right') {
        geo.positions.push(px+SCALE, py, pz+SCALE,  px+SCALE, py, pz,  px+SCALE, py+T, pz,  px+SCALE, py+T, pz+SCALE);
    } else if (type === 'top') {
        geo.positions.push(px, py+T, pz+SCALE,  px+SCALE, py+T, pz+SCALE,  px+SCALE, py+T, pz,  px, py+T, pz);
    } else if (type === 'bottom') {
        geo.positions.push(px, py, pz,  px+SCALE, py, pz,  px+SCALE, py, pz+SCALE,  px, py, pz+SCALE);
    }

    geo.colors.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
    geo.indices.push(geo.vCount, geo.vCount+1, geo.vCount+2, geo.vCount, geo.vCount+2, geo.vCount+3);
    geo.vCount += 4;
};

const processCloudCell = (
    x: number, 
    z: number, 
    W: number, 
    config: { SCALE: number, T: number },
    map: Uint8Array,
    geo: { positions: number[], indices: number[], colors: number[], vCount: number }
) => {
    const { SCALE, T } = config;
    const getC = (cx: number, cy: number) => map[((cx + W) % W) + ((cy + W) % W) * W];
    
    if (getC(x, z)) {
        const px = x * SCALE - (W * SCALE) / 2;
        const pz = z * SCALE - (W * SCALE) / 2;
        const py = 0;
        
        if (!getC(x, z - 1)) pushFace(px, py, pz, 0.8, 'back', { SCALE, T }, geo);
        if (!getC(x, z + 1)) pushFace(px, py, pz, 0.8, 'front', { SCALE, T }, geo);
        if (!getC(x - 1, z)) pushFace(px, py, pz, 0.8, 'left', { SCALE, T }, geo);
        if (!getC(x + 1, z)) pushFace(px, py, pz, 0.8, 'right', { SCALE, T }, geo);
        pushFace(px, py, pz, 1, 'top', { SCALE, T }, geo);
        pushFace(px, py, pz, 0.7, 'bottom', { SCALE, T }, geo);
    }
};

const buildCloudGeometry = (map: Uint8Array, W: number, SCALE: number, T: number) => {
    const geo = {
        positions: [] as number[],
        indices: [] as number[],
        colors: [] as number[],
        vCount: 0
    };
  
    const config = { SCALE, T };
    for (let x = 0; x < W; x++) {
        for (let z = 0; z < W; z++) {
            processCloudCell(x, z, W, config, map, geo);
        }
    }
    
    const cloudGeo = new THREE.BufferGeometry();
    cloudGeo.setAttribute('position', new THREE.Float32BufferAttribute(geo.positions, 3));
    cloudGeo.setAttribute('color', new THREE.Float32BufferAttribute(geo.colors, 3));
    cloudGeo.setIndex(geo.indices);
    return cloudGeo;
};

const setupClouds = (scene: THREE.Scene) => {
    const W = 128; // Grid size
    const SCALE = 8;
    const T = 4;
    
    const map = generateCloudMap(W);
    const cloudGeo = buildCloudGeometry(map, W, SCALE, T);
  
    const cloudMaterial: any = new THREE.MeshBasicMaterial({
       color: 0xffffff,
       vertexColors: true,
       transparent: true,
       opacity: 0.85,
       depthWrite: false,
       fog: false // Keep false: we handle our own cloud-line fog
    });
  
    // Independent Cloud Fog: Fade clouds to transparency at the edge of the 32-chunk view (512 units)
    cloudMaterial.onBeforeCompile = (shader: any) => {
      shader.uniforms.uCloudFogNear = { value: 250 };
      shader.uniforms.uCloudFogFar = { value: 480 };
      shader.vertexShader = `
        varying float vCloudDist;
        ${shader.vertexShader}
      `.replace(
        '#include <project_vertex>',
        `
        #include <project_vertex>
        vCloudDist = length(mvPosition.xyz);
        `
      );
      shader.fragmentShader = `
        uniform float uCloudFogNear;
        uniform float uCloudFogFar;
        varying float vCloudDist;
        ${shader.fragmentShader}
      `.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        float cloudFogFactor = smoothstep(uCloudFogNear, uCloudFogFar, vCloudDist);
        gl_FragColor.a *= (1.0 - cloudFogFactor);
        `
      );
    };
  
    const cloudGroup = new THREE.Group();
    const W_WORLD = W * SCALE;
    const m1 = new THREE.Mesh(cloudGeo, cloudMaterial); m1.position.set(0, 0, 0); m1.frustumCulled = false;
    const m2 = new THREE.Mesh(cloudGeo, cloudMaterial); m2.position.set(W_WORLD, 0, 0); m2.frustumCulled = false;
    const m3 = new THREE.Mesh(cloudGeo, cloudMaterial); m3.position.set(0, 0, W_WORLD); m3.frustumCulled = false;
    const m4 = new THREE.Mesh(cloudGeo, cloudMaterial); m4.position.set(W_WORLD, 0, W_WORLD); m4.frustumCulled = false;
    
    cloudGroup.add(m1, m2, m3, m4);
    scene.add(cloudGroup);
    
    return cloudGroup;
};

export const setupLighting = (scene: THREE.Scene, initialRenderDistance: number = 2): LightingSystem => {
  scene.background = new THREE.Color(0x87ceeb);
  updateFog(scene, initialRenderDistance);

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x555566, 0.6);
  ambientLight.position.set(0, 1, 0);
  scene.add(ambientLight);

  const { sunLight, sunMesh } = setupSun(scene);
  const { moonLight, moonMesh } = setupMoon(scene);
  const cloudGroup = setupClouds(scene);
  const starsPoints = setupStars(scene);

  return { ambientLight, sunLight, sunMesh, moonLight, moonMesh, cloudGroup, starsPoints };
};

export const updateLighting = (
  scene: THREE.Scene,
  system: LightingSystem,
  time: number,
  playerPosition: THREE.Vector3
) => {
  // Push the sun and moon far beyond the clouds (130) and terrain. 
  // The camera Far plane is forced to 512 in useMinecraft.ts to support this.
  const orbitRadius = 450; 

  const sunX = Math.cos(time) * orbitRadius;
  const sunY = Math.sin(time) * orbitRadius;
  
  system.sunLight.position.set(playerPosition.x + sunX, playerPosition.y + sunY, playerPosition.z);
  system.sunLight.target.position.copy(playerPosition);
  system.sunMesh.position.copy(system.sunLight.position);
  system.sunMesh.lookAt(playerPosition);

  const moonX = Math.cos(time + Math.PI) * orbitRadius;
  const moonY = Math.sin(time + Math.PI) * orbitRadius;
  
  system.moonLight.position.set(playerPosition.x + moonX, playerPosition.y + moonY, playerPosition.z);
  system.moonLight.target.position.copy(playerPosition);
  system.moonMesh.position.copy(system.moonLight.position);
  system.moonMesh.lookAt(playerPosition);

  const skyColor = getSkyColor(time);
  scene.background = skyColor;
  if (scene.fog) {
      scene.fog.color = skyColor;
  }
  
  const isDay = Math.sin(time) > 0;
  system.sunLight.intensity = isDay ? Math.min(1.2, Math.sin(time) * 1.5) : 0;
  system.moonLight.intensity = isDay ? 0 : Math.min(0.35, Math.abs(Math.sin(time)) * 0.5);
  
  const minAmbient = 0.12;
  const maxAmbient = 0.6;
  system.ambientLight.intensity = isDay 
      ? minAmbient + (maxAmbient - minAmbient) * Math.sin(time)
      : minAmbient;

  if (isDay) {
      if (!system.sunLight.castShadow) system.sunLight.castShadow = true;
      if (system.moonLight.castShadow) system.moonLight.castShadow = false;
      system.sunLight.shadow.camera.updateProjectionMatrix();
  } else {
      if (system.sunLight.castShadow) system.sunLight.castShadow = false;
      if (!system.moonLight.castShadow) system.moonLight.castShadow = true;
      system.moonLight.shadow.camera.updateProjectionMatrix();
  }

  // === Update Stars ===
  if (system.starsPoints) {
      const starOpacity = isDay ? 0 : Math.min(1.0, Math.abs(Math.sin(time)) * 2.0);
      (system.starsPoints.material as THREE.PointsMaterial).opacity = starOpacity;
      
      // Center stars on player and rotate them with time
      system.starsPoints.position.copy(playerPosition);
      // Offset the rotation so stars don't align perfectly with the sun/moon in a weird way,
      // and make them rotate much slower as requested.
      system.starsPoints.rotation.z = time * 0.05; 
  }

  // === Update Clouds ===
  const W_WORLD = 128 * 8; // W (128) * SCALE (8)
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  
  let cloudColor: THREE.Color;
  if (isDay) {
      // Lerp towards white at noon, use sky color at sunrise/sunset
      cloudColor = skyColor.clone().lerp(new THREE.Color(0xffffff), Math.sin(time));
  } else {
      // Lerp towards a dark bluish-gray at midnight
      cloudColor = skyColor.clone().lerp(new THREE.Color(0x1a1a2e), -Math.sin(time));
  }

  system.cloudGroup.children.forEach((mesh: any) => {
      if (mesh.material && mesh.material.color) {
          mesh.material.color.copy(cloudColor);
      }
  });
  
  // Drift slowly towards positive X and Z
  const scrollBaseX = playerPosition.x - time * 6; 
  const scrollBaseZ = playerPosition.z - time * 3;
  
  // We snap the group's "origin" relative to the W_WORLD grid anchored behind the player's view
  // so the player is always inside the safe center of the four duplicating cloud meshes.
  const anchorX = playerPosition.x - mod(scrollBaseX, W_WORLD);
  const anchorZ = playerPosition.z - mod(scrollBaseZ, W_WORLD);
  
  system.cloudGroup.position.set(anchorX, 130, anchorZ);
};
