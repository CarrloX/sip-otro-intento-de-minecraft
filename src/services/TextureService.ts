import * as THREE from 'three';

export const generateAtlas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 96; // 6 textures * 16px
  canvas.height = 16;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get 2D context');

  const types = ['dirt', 'grass_top', 'stone', 'wood_side', 'wood_top', 'leaves'];
  
  types.forEach((type, index) => {
    const imageData = context.createImageData(16, 16);
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
      
      if (type === 'wood_side' && (i / 4) % 16 % 4 === 0) {
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
    
    context.putImageData(imageData, index * 16, 0);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const createUnifiedMaterial = () => {
  const atlasTexture = generateAtlas();
  
  const material = new THREE.MeshLambertMaterial({ 
     map: atlasTexture,
  });

  // GLSL Shader Injection to read InstancedBufferAttribute and shift UVs
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      attribute float aBlockType;
      varying float vBlockType;
      varying vec3 vLocalNormal;
      `
    ).replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vBlockType = aBlockType;
      vLocalNormal = normal; // Unmodified local face normal for directional detection
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      varying float vBlockType;
      varying vec3 vLocalNormal;
      `
    ).replace(
      '#include <map_fragment>',
      `
      #ifdef USE_MAP
        // Atlas has 6 textures. Each takes 1/6th of horizontal width.
        float blockType = floor(vBlockType + 0.5);
        float texIndex = 0.0;
        
        // Block Types:
        // 1: Grass (Top 1, Side 0, Bottom 0)
        // 2: Dirt (All 0)
        // 3: Stone (All 2)
        // 4: Wood (Top/Bot 4, Side 3)
        // 5: Leaves (All 5)
        
        if (blockType == 1.0) {
           if (vLocalNormal.y > 0.5) texIndex = 1.0;
           else texIndex = 0.0;
        } else if (blockType == 2.0) {
           texIndex = 0.0;
        } else if (blockType == 3.0) {
           texIndex = 2.0;
        } else if (blockType == 4.0) {
           if (abs(vLocalNormal.y) > 0.5) texIndex = 4.0;
           else texIndex = 3.0;
        } else if (blockType == 5.0) {
           texIndex = 5.0;
        }
        
        // Calulate atlas-mapped UVs. Width is divided by 6
        vec2 atlasUv = vec2((vMapUv.x + texIndex) / 6.0, vMapUv.y);
        
        vec4 sampledDiffuseColor = texture2D( map, atlasUv );
        #ifdef DECODE_VIDEO_TEXTURE
          sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
        #endif
        diffuseColor *= sampledDiffuseColor;
      #endif
      `
    );

    return shader;
  };

  return material;
};

// Keeping the original returned shape so the rest of the app doesn't break, 
// simply point every ID index to our Unified Material Canvas.
export const createMaterials = () => {
  const unifiedMaterial = createUnifiedMaterial();
  const materials: Record<number, THREE.Material | THREE.Material[]> = {};
  materials[1] = unifiedMaterial;
  materials[2] = unifiedMaterial;
  materials[3] = unifiedMaterial;
  materials[4] = unifiedMaterial;
  materials[5] = unifiedMaterial;
  return materials;
};
