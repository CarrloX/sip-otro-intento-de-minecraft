import * as THREE from 'three';

const TEXTURE_PARAMS: Record<string, { r: number, g: number, b: number, v: number }> = {
    'dirt': { r: 121, g: 85, b: 58, v: 10 },
    'grass_top': { r: 65, g: 152, b: 49, v: 15 },
    'stone': { r: 120, g: 122, b: 125, v: 15 },
    'wood_side': { r: 100, g: 70, b: 50, v: 15 },
    'wood_top': { r: 175, g: 150, b: 110, v: 10 },
    'leaves': { r: 59, g: 122, b: 45, v: 20 },
    'grass_side': { r: 121, g: 85, b: 58, v: 10 },
    'sand': { r: 219, g: 209, b: 160, v: 8 }
};

const getDirtPixel = (x: number, y: number, noiseGrid: Float32Array, r: number, g: number, b: number) => {
    const n1 = noiseGrid[y * 16 + x] * 2 - 1;
    const n2 = noiseGrid[Math.floor(y / 2) * 16 + Math.floor(x / 2)] * 2 - 1;
    const noise = noiseGrid[y * 16 + x];
    const dirtVar = n1 * 6 + n2 * 12;
    let modR = r + dirtVar;
    let modG = g + dirtVar;
    let modB = b + dirtVar;
    if (noise > 0.92) { modR += 25; modG += 25; modB += 25; }
    if (noise < 0.08) { modR -= 25; modG -= 25; modB -= 25; }
    return { r: modR, g: modG, b: modB, a: 255 };
};

const getGrassTopPixel = (x: number, y: number, noiseGrid: Float32Array, r: number, g: number, b: number) => {
    const noise = noiseGrid[y * 16 + x];
    const n1 = noise * 2 - 1;
    const n2 = noiseGrid[Math.floor(y / 2) * 16 + Math.floor(x / 2)] * 2 - 1;
    const streak = Math.sin(x * 1.5 + y * 2) * 8;
    const grassVar = n1 * 5 + n2 * 10 + streak;
    let modR = r + grassVar;
    let modG = g + grassVar;
    let modB = b + grassVar;
    if (noise > 0.85) { modR += 15; modG += 25; modB += 10; }
    if (noise < 0.15) { modR -= 15; modG -= 20; modB -= 10; }
    return { r: modR, g: modG, b: modB, a: 255 };
};

const getGrassSidePixel = (x: number, y: number, noiseGrid: Float32Array, r: number, g: number, b: number) => {
    const grassDepth = 3 + Math.floor(noiseGrid[x] * 3);
    if (y <= grassDepth) {
        const p = TEXTURE_PARAMS['grass_top'];
        const pixel = getGrassTopPixel(x, y, noiseGrid, p.r, p.g, p.b);
        if (y === grassDepth) {
            pixel.r -= 30; pixel.g -= 30; pixel.b -= 30;
        }
        return pixel;
    }
    return getDirtPixel(x, y, noiseGrid, r, g, b);
};

const getWoodSidePixel = (x: number, y: number, noiseGrid: Float32Array, r: number, g: number, b: number, v: number) => {
    const noise = noiseGrid[y * 16 + x];
    const n = (noise - 0.5) * v;
    
    // Vertical grooves/crevices
    const column = x % 4;
    const groove = (column === 0 || column === 3) ? -15 : 0;
    const verticalGrain = Math.sin(y * 0.8) * 5;
    
    let modR = r + n + groove + verticalGrain;
    let modG = g + n + groove + verticalGrain;
    let modB = b + n + groove + verticalGrain;
    
    // Random darker spots for "bark texture"
    if (noise > 0.8) { modR -= 10; modG -= 10; modB -= 10; }
    
    return { r: modR, g: modG, b: modB, a: 255 };
};

const getWoodTopPixel = (x: number, y: number, noiseGrid: Float32Array, r: number, g: number, b: number, v: number) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const dist = Math.hypot(dx, dy);
    const noise = noiseGrid[y * 16 + x];
    
    // Bark border
    if (dist > 6.5) {
        const side = TEXTURE_PARAMS['wood_side'];
        return getWoodSidePixel(x, y, noiseGrid, side.r, side.g, side.b, side.v);
    }
    
    // Concentric rings
    const ring = Math.floor(dist / 1.8);
    const ringVar = (ring % 2 === 0) ? 0 : -15;
    const fineGrain = Math.sin(dist * 5) * 5;
    
    let modR = r + ringVar + fineGrain + (noise - 0.5) * v;
    let modG = g + ringVar + fineGrain + (noise - 0.5) * v;
    let modB = b + ringVar + fineGrain + (noise - 0.5) * v;
    
    // Slight darkening towards the center
    const centerDarkness = (1 - dist / 8) * -10;
    modR += centerDarkness; modG += centerDarkness; modB += centerDarkness;

    return { r: modR, g: modG, b: modB, a: 255 };
};

const getStonePixel = (x: number, y: number, noiseGrid: Float32Array, r: number, g: number, b: number) => {
    const noise = noiseGrid[y * 16 + x];
    const n1 = noise;
    // Use neighboring pixels for smoother transitions (larger "clumps")
    const n2 = noiseGrid[Math.floor(y / 2) * 16 + Math.floor(x / 2)];
    const n3 = noiseGrid[Math.floor(y / 4) * 16 + Math.floor(x / 4)];
    
    // Base variation
    const variation = (n1 * 5) + (n2 * 15) + (n3 * 10) - 15;
    
    let modR = r + variation;
    let modG = g + variation;
    let modB = b + variation;
    
    // Simulate "cracks" or edges
    if (n1 > 0.8 && n2 < 0.3) {
        modR -= 20; modG -= 20; modB -= 20;
    }
    // Lighter highlights
    if (n1 < 0.1) {
        modR += 10; modG += 10; modB += 10;
    }
    
    return { r: modR, g: modG, b: modB, a: 255 };
};

const getGenericPixel = (type: string, x: number, y: number, noiseGrid: Float32Array, params: { r: number, g: number, b: number, v: number }) => {
    const { r, g, b, v } = params;
    const noise = noiseGrid[y * 16 + x];
    const n = (noise - 0.5) * v;
    let modR = r + n;
    let modG = g + n;
    let modB = b + n;
    let alpha = 255;
    if (type === 'leaves') {
        if (noise < 0.3) alpha = 0;
        else if (noise < 0.5) { modR *= 0.5; modG *= 0.5; modB *= 0.5; }
    }
    return { r: modR, g: modG, b: modB, a: alpha };
};

export const generateAtlas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128; // 8 textures * 16px
  canvas.height = 16;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get 2D context');

  const types = ['dirt', 'grass_top', 'stone', 'wood_side', 'wood_top', 'leaves', 'grass_side', 'sand'];
  
  types.forEach((type, index) => {
    const imageData = context.createImageData(16, 16);
    const data = imageData.data;
    const params = TEXTURE_PARAMS[type] || TEXTURE_PARAMS['dirt'];
    const noiseGrid = new Float32Array(256);
    for(let k=0; k<256; k++) noiseGrid[k] = Math.random();

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let pixel: { r: number, g: number, b: number, a: number };
        
        if (type === 'dirt') {
          pixel = getDirtPixel(x, y, noiseGrid, params.r, params.g, params.b);
        } else if (type === 'grass_top') {
          pixel = getGrassTopPixel(x, y, noiseGrid, params.r, params.g, params.b);
        } else if (type === 'grass_side') {
          pixel = getGrassSidePixel(x, y, noiseGrid, params.r, params.g, params.b);
        } else if (type === 'stone') {
          pixel = getStonePixel(x, y, noiseGrid, params.r, params.g, params.b);
        } else if (type === 'wood_side') {
          pixel = getWoodSidePixel(x, y, noiseGrid, params.r, params.g, params.b, params.v);
        } else if (type === 'wood_top') {
          pixel = getWoodTopPixel(x, y, noiseGrid, params.r, params.g, params.b, params.v);
        } else {
          pixel = getGenericPixel(type, x, y, noiseGrid, params);
        }

        const i = (y * 16 + x) * 4;
        data[i] = Math.min(255, Math.max(0, pixel.r));
        data[i + 1] = Math.min(255, Math.max(0, pixel.g));
        data[i + 2] = Math.min(255, Math.max(0, pixel.b));
        data[i + 3] = pixel.a;
      }
    }
    
    context.putImageData(imageData, index * 16, 0);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const createUnifiedMaterial = () => {
  const atlasTexture = generateAtlas();
  
  // Al usar Geometria Voxel pura con UVs explícitas, ya no necesitamos hackear shaders de GPU
  const material = new THREE.MeshLambertMaterial({ 
     map: atlasTexture,
     vertexColors: true, // Enable per-vertex tinting for light levels
     alphaTest: 0.5, // Enables cutout transparency for Fancy Leaves without depth-sorting bugs
     transparent: false // Key: keep this false so Z-Buffer depth writes natively!
  });

  return material;
};

// Return Record with all IDs pointing to isolated material for backwards compatibility in GameCanvas
export const createMaterials = () => {
  const unifiedMaterial = createUnifiedMaterial();
  const materials: Record<number, THREE.Material | THREE.Material[]> = {};
  materials[1] = unifiedMaterial;
  materials[2] = unifiedMaterial;
  materials[3] = unifiedMaterial;
  materials[4] = unifiedMaterial;
  materials[5] = unifiedMaterial;
  materials[6] = unifiedMaterial;
  materials[8] = unifiedMaterial; // Log X-axis
  materials[9] = unifiedMaterial; // Log Z-axis
  return materials;
};

export const createCloudMaterial = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64; 
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
     const imgData = ctx.createImageData(64, 64);
     const d = imgData.data;
     // Generate noise grids for seamless wrapping fractal value noise
     const grid16 = Array.from({length: 4 * 4}, () => Math.random());
     const grid8 =  Array.from({length: 8 * 8}, () => Math.random());
     const grid4 =  Array.from({length: 16 * 16}, () => Math.random());

     for (let x = 0; x < 64; x++) {
         for (let y = 0; y < 64; y++) {
             // Sample the noise layers (Nearest neighbor for blockiness)
             const v16 = grid16[Math.floor(x / 16) + Math.floor(y / 16) * 4];
             const v8  = grid8[Math.floor(x / 8) + Math.floor(y / 8) * 8];
             const v4  = grid4[Math.floor(x / 4) + Math.floor(y / 4) * 16];
             
             // Blend layers
             const noise = (v16 * 1 + v8 * 0.5 + v4 * 0.25) / 1.75;
             
             const i = (x + y * 64) * 4;
             // Cutoff threshold to create isolated islands and fluffy clusters
             if (noise > 0.55) {
                 d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 230; // Solid white
             } else {
                 d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 0;   // Transparent sky
             }
         }
     }
     ctx.putImageData(imgData, 0, 0);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  
  // The sky plane is 2048x2048. The texture is 64x64.
  // Repeating 32 times makes 1 texture pixel = 1 world unit (block)
  texture.repeat.set(32, 32);
  texture.generateMipmaps = false;
  
  const material = new THREE.MeshBasicMaterial({
     map: texture,
     transparent: true,
     alphaTest: 0.1,
     depthWrite: false, // Clouds shouldn't interfere with chunk Z-buffer deeply
     fog: true, // Clouds should fade in fog!
     side: THREE.DoubleSide
  });
  return material;
};
