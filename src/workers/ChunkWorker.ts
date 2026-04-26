import { CHUNK_SIZE, Y_MIN, Y_MAX, CHUNK_VOLUME, getBlockIndex, noise, pseudoRandom, getTerrainType, setGlobalSeed } from '../services/WorldService';

const ATLAS_COLS = 7;
const getTexIndex = (blockType: number, face: string): number => {
  if (blockType === 1) { // Grass
    if (face === 'top') return 1;
    if (face === 'bottom') return 0;
    return 6; // Sides
  }
  if (blockType === 2) return 0; // Dirt
  if (blockType === 3) return 2; // Stone
  if (blockType === 4) { // Wood
    if (face === 'top' || face === 'bottom') return 4;
    return 3;
  }
  if (blockType === 5) return 5; // Leaves
  return 0;
};

export const PAD = 15;
export const STRIDE = CHUNK_SIZE + PAD * 2;
export const PADDED_VOLUME = STRIDE * STRIDE * (Y_MAX - Y_MIN + 1);

const getPaddedIndex = (lx: number, y: number, lz: number) => {
    const px = lx + PAD;
    const pz = lz + PAD;
    const py = y - Y_MIN;
    if (px < 0 || px >= STRIDE || pz < 0 || pz >= STRIDE || py < 0 || py >= (Y_MAX - Y_MIN + 1)) return -1;
    return px + (pz * STRIDE) + (py * STRIDE * STRIDE);
};

class ChunkBuilder {
  private readonly paddedChunkData: Uint8Array;
  private readonly chunkData: Uint8Array;
  private readonly heightMap: Int16Array;
  private readonly lightMap: Uint8Array;
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];
  private readonly colors: number[] = [];

  private readonly lodLeft: number;
  private readonly lodRight: number;
  private readonly lodTop: number;
  private readonly lodBottom: number;
  private readonly effectiveFancyLeaves: boolean;

  private readonly cx: number;
  private readonly cz: number;
  private readonly lodLevel: number;
  private readonly userModsArray: any[];
  private readonly taskId: number;

  constructor(
    cx: number,
    cz: number,
    lodLevel: number,
    userModsArray: any[],
    taskId: number,
    fancyLeaves: boolean,
    neighborLODs: any
  ) {
    this.cx = cx;
    this.cz = cz;
    this.lodLevel = lodLevel;
    this.userModsArray = userModsArray;
    this.taskId = taskId;
    this.paddedChunkData = new Uint8Array(PADDED_VOLUME);
    this.chunkData = new Uint8Array(CHUNK_VOLUME);
    this.heightMap = new Int16Array(STRIDE * STRIDE);
    this.lightMap = new Uint8Array(PADDED_VOLUME);

    const { lodLeft, lodRight, lodTop, lodBottom } = neighborLODs || { lodLeft: lodLevel, lodRight: lodLevel, lodTop: lodLevel, lodBottom: lodLevel };
    this.lodLeft = lodLeft;
    this.lodRight = lodRight;
    this.lodTop = lodTop;
    this.lodBottom = lodBottom;
    this.effectiveFancyLeaves = lodLevel === 0 ? fancyLeaves : false;
  }

  public build() {
    const startX = this.cx * CHUNK_SIZE;
    const startZ = this.cz * CHUNK_SIZE;
    const worldData = new Map<string, number>(this.userModsArray);
    
    this.generatePaddedTerrain(startX, startZ);
    this.generatePaddedTrees(startX, startZ);
    this.applyUserMods(startX, startZ, worldData);
    this.extractCoreChunkData();
    this.calculateHeightMap();
    this.propagateLight();
    this.generateMesh();
    
    const posArray = new Float32Array(this.positions);
    const normArray = new Float32Array(this.normals);
    const uvArray = new Float32Array(this.uvs);
    const indArray = new Uint32Array(this.indices);
    const colorArray = new Float32Array(this.colors);
    
    const response = {
       cx: this.cx, cz: this.cz, lodLevel: this.lodLevel,
       taskId: this.taskId
    };
    
    return {
       response,
       chunkData: this.chunkData,
       posArray, normArray, uvArray, indArray, colorArray
    };
  }

  private generatePaddedTerrain(startX: number, startZ: number) {
      for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
        for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
          const gx = startX + lx;
          const gz = startZ + lz;
          const surfaceY = noise(gx, gz);
          
          const depth = 64; 
          for (let y = surfaceY; y >= surfaceY - depth; y--) {
            const idx = getPaddedIndex(lx, y, lz);
            if (idx !== -1) {
                this.paddedChunkData[idx] = getTerrainType(y, surfaceY);
            }
          }
        }
      }
  }

  private generateLeafBlock(hx: number, hy: number, hz: number, lx: number, lz: number, topY: number) {
      const dist = Math.abs(hx - lx) + Math.abs(hz - lz);
      if (dist === 4 && hy === topY) return;
      
      const idx = getPaddedIndex(hx, hy, hz);
      if (idx !== -1 && (this.paddedChunkData[idx] === 0 || this.paddedChunkData[idx] === 5)) {
          this.paddedChunkData[idx] = 5;
      }
  }

  private generateTreeLeaves(lx: number, y: number, lz: number, height: number) {
      const topY = y + height + 1;
      for (let hx = lx - 2; hx <= lx + 2; hx++) {
          for (let hz = lz - 2; hz <= lz + 2; hz++) {
              for (let hy = y + height - 2; hy <= topY; hy++) {
                  this.generateLeafBlock(hx, hy, hz, lx, lz, topY);
              }
          }
      }
  }

  private generateTreeTrunk(lx: number, y: number, lz: number, height: number) {
      for (let i = 0; i < height; i++) {
          const idx = getPaddedIndex(lx, y + i, lz);
          if (idx !== -1) this.paddedChunkData[idx] = 4;
      }
  }

  private generatePaddedTrees(startX: number, startZ: number) {
      const TREE_OVERLAP = 2;
      for (let lx = -PAD - TREE_OVERLAP; lx < CHUNK_SIZE + PAD + TREE_OVERLAP; lx++) {
        for (let lz = -PAD - TREE_OVERLAP; lz < CHUNK_SIZE + PAD + TREE_OVERLAP; lz++) {
          const gx = startX + lx;
          const gz = startZ + lz;
          
          if (pseudoRandom(gx, gz) < 0.02) {
            const surfaceY = noise(gx, gz);
            const y = surfaceY + 1;
            const height = 4;
            
            this.generateTreeTrunk(lx, y, lz, height);
            this.generateTreeLeaves(lx, y, lz, height);
          }
        }
      }
  }

  private applyUserMods(startX: number, startZ: number, worldData: Map<string, number>) {
      worldData.forEach((type, key) => {
        const [gx, gy, gz] = key.split(',').map(Number);
        const lx = gx - startX;
        const lz = gz - startZ;
        const idx = getPaddedIndex(lx, gy, lz);
        
        if (idx !== -1) {
          if (type === 0) {
              this.paddedChunkData[idx] = 0; 
          } else {
              this.paddedChunkData[idx] = type;
          }
        }
      });
  }

  private extractCoreChunkData() {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              for (let y = Y_MIN; y <= Y_MAX; y++) {
                  const pIdx = getPaddedIndex(lx, y, lz);
                  const cIdx = getBlockIndex(lx, y, lz);
                  this.chunkData[cIdx] = this.paddedChunkData[pIdx];
              }
          }
      }
  }

  private getBlock(lx: number, y: number, lz: number) {
    const idx = getPaddedIndex(lx, y, lz);
    return idx === -1 ? 0 : this.paddedChunkData[idx];
  }

  private isTransparent(type: number) {
      return type === 0 || type === 5;
  }

  private isSolid(lx: number, y: number, lz: number) {
      const type = this.getBlock(lx, y, lz);
      if (this.effectiveFancyLeaves) return type !== 0 && type !== 5;
      return type !== 0; 
  }

  private calculateHeightMap() {
      this.heightMap.fill(Y_MIN - 1);
      for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
          for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
              const px = lx + PAD;
              const pz = lz + PAD;
              for (let y = Y_MAX; y >= Y_MIN; y--) {
                  const b = this.getBlock(lx, y, lz);
                  if (b !== 0) {
                      this.heightMap[px + pz * STRIDE] = y;
                      break;
                  }
              }
          }
      }
  }

  private initializeLightQueue(queue: number[]) {
      for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
          for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
              const px = lx + PAD;
              const pz = lz + PAD;
              const surfaceY = this.heightMap[px + pz * STRIDE];
              for (let y = Y_MAX; y >= Math.max(Y_MIN, surfaceY - 2); y--) {
                  const idx = getPaddedIndex(lx, y, lz);
                  if (idx !== -1 && this.isTransparent(this.paddedChunkData[idx])) {
                      this.lightMap[idx] = 15;
                      queue.push(lx, y, lz, 15);
                  }
              }
          }
      }
  }

  private evaluateLightNeighbor(nx: number, ny: number, nz: number, dy: number, l: number, queue: number[]) {
      const nIdx = getPaddedIndex(nx, ny, nz);
      if (nIdx !== -1 && this.isTransparent(this.paddedChunkData[nIdx])) {
          const currentL = this.lightMap[nIdx];
          const diffuser = this.paddedChunkData[nIdx] === 5 ? 2 : 1; 
          const nextL = (dy === -1 && l === 15) ? 15 : l - diffuser;
          if (nextL > currentL) {
              this.lightMap[nIdx] = nextL;
              queue.push(nx, ny, nz, nextL);
          }
      }
  }

  private processLightNode(lx: number, y: number, lz: number, l: number, queue: number[], dirs: number[][]) {
      if (l <= 1) return;
      for (const [dx, dy, dz] of dirs) {
          this.evaluateLightNeighbor(lx + dx, y + dy, lz + dz, dy, l, queue);
      }
  }

  private processLightQueue(queue: number[]) {
      let head = 0;
      const dirs = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];
      while (head < queue.length) {
          const lx = queue[head++];
          const y = queue[head++];
          const lz = queue[head++];
          const l = queue[head++];
          this.processLightNode(lx, y, lz, l, queue, dirs);
      }
  }

  private propagateLight() {
      const queue: number[] = [];
      this.initializeLightQueue(queue);
      this.processLightQueue(queue);
  }

  private getLightLevel(lx: number, y: number, lz: number) {
      const idx = getPaddedIndex(lx, y, lz);
      return idx === -1 ? 3 : (this.lightMap[idx] || 3);
  }

  private vertexAO(s1: boolean, s2: boolean, c: boolean) {
      if (s1 && s2) return 0;
      return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
  }
  
  private getAoMultiplier(ao: number) {
      return 0.5 + (ao / 3) * 0.5;
  }

  private pushQuadWithAO(lx: number, y: number, lz: number, blockType: number, face: string) {
      let step = 4;
      let offset = 1.5;
      if (this.lodLevel === 0) {
          step = 1;
          offset = 0;
      } else if (this.lodLevel === 1) {
          step = 2;
          offset = 0.5;
      }
      
      const h = step * 0.5;
      const gx = this.cx * CHUNK_SIZE + lx + offset;
      const gy = y + offset;
      const gz = this.cz * CHUNK_SIZE + lz + offset;

      const texIndex = getTexIndex(blockType, face);
      const u0 = texIndex / ATLAS_COLS, u1 = (texIndex + 1) / ATLAS_COLS;
      const v0 = 0, v1 = 1;
      const baseIndex = this.positions.length / 3;

      let fx = lx, fy = y, fz = lz;
      if (face === 'top') fy++; else if (face === 'bottom') fy--;
      else if (face === 'right') fx++; else if (face === 'left') fx--;
      else if (face === 'front') fz++; else if (face === 'back') fz--;

      const light = this.getLightLevel(fx, fy, fz);
      const l = 0.05 + (light / 15) * 0.95;
      let ao0=3, ao1=3, ao2=3, ao3=3;

      switch(face) {
          case 'top':
              ao0 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx-1,fy,fz+1));
              ao1 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx+1,fy,fz+1));
              ao2 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx+1,fy,fz-1));
              ao3 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx-1,fy,fz-1));
              this.positions.push(gx-h, gy+h, gz+h,  gx+h, gy+h, gz+h,  gx+h, gy+h, gz-h,  gx-h, gy+h, gz-h);
              this.normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
              this.uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'bottom': 
              ao0 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx-1,fy,fz-1));
              ao1 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx+1,fy,fz-1));
              ao2 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx+1,fy,fz+1));
              ao3 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx-1,fy,fz+1));
              this.positions.push(gx-h, gy-h, gz-h,  gx+h, gy-h, gz-h,  gx+h, gy-h, gz+h,  gx-h, gy-h, gz+h);
              this.normals.push(0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0);
              this.uvs.push(u0,v1, u1,v1, u1,v0, u0,v0); 
              break;
          case 'right': 
              ao0 = this.vertexAO(this.isSolid(fx,fy-1,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx,fy-1,fz+1));
              ao1 = this.vertexAO(this.isSolid(fx,fy-1,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx,fy-1,fz-1));
              ao2 = this.vertexAO(this.isSolid(fx,fy+1,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx,fy+1,fz-1));
              ao3 = this.vertexAO(this.isSolid(fx,fy+1,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx,fy+1,fz+1));
              this.positions.push(gx+h, gy-h, gz+h,  gx+h, gy-h, gz-h,  gx+h, gy+h, gz-h,  gx+h, gy+h, gz+h);
              this.normals.push(1,0,0, 1,0,0, 1,0,0, 1,0,0);
              this.uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'left': 
              ao0 = this.vertexAO(this.isSolid(fx,fy-1,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx,fy-1,fz-1));
              ao1 = this.vertexAO(this.isSolid(fx,fy-1,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx,fy-1,fz+1));
              ao2 = this.vertexAO(this.isSolid(fx,fy+1,fz), this.isSolid(fx,fy,fz+1), this.isSolid(fx,fy+1,fz+1));
              ao3 = this.vertexAO(this.isSolid(fx,fy+1,fz), this.isSolid(fx,fy,fz-1), this.isSolid(fx,fy+1,fz-1));
              this.positions.push(gx-h, gy-h, gz-h,  gx-h, gy-h, gz+h,  gx-h, gy+h, gz+h,  gx-h, gy+h, gz-h);
              this.normals.push(-1,0,0, -1,0,0, -1,0,0, -1,0,0);
              this.uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'front':  
              ao0 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy-1,fz), this.isSolid(fx-1,fy-1,fz));
              ao1 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy-1,fz), this.isSolid(fx+1,fy-1,fz));
              ao2 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy+1,fz), this.isSolid(fx+1,fy+1,fz));
              ao3 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy+1,fz), this.isSolid(fx-1,fy+1,fz));
              this.positions.push(gx-h, gy-h, gz+h,  gx+h, gy-h, gz+h,  gx+h, gy+h, gz+h,  gx-h, gy+h, gz+h);
              this.normals.push(0,0,1, 0,0,1, 0,0,1, 0,0,1);
              this.uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
          case 'back':   
              ao0 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy-1,fz), this.isSolid(fx+1,fy-1,fz));
              ao1 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy-1,fz), this.isSolid(fx-1,fy-1,fz));
              ao2 = this.vertexAO(this.isSolid(fx-1,fy,fz), this.isSolid(fx,fy+1,fz), this.isSolid(fx-1,fy+1,fz));
              ao3 = this.vertexAO(this.isSolid(fx+1,fy,fz), this.isSolid(fx,fy+1,fz), this.isSolid(fx+1,fy+1,fz));
              this.positions.push(gx+h, gy-h, gz-h,  gx-h, gy-h, gz-h,  gx-h, gy+h, gz-h,  gx+h, gy+h, gz-h);
              this.normals.push(0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1);
              this.uvs.push(u0,v0, u1,v0, u1,v1, u0,v1);
              break;
      }

      const m0 = l * this.getAoMultiplier(ao0);
      const m1 = l * this.getAoMultiplier(ao1);
      const m2 = l * this.getAoMultiplier(ao2);
      const m3 = l * this.getAoMultiplier(ao3);

      this.colors.push(m0, m0, m0,  m1, m1, m1,  m2, m2, m2,  m3, m3, m3);

      this.indices.push(
          baseIndex + 0, baseIndex + 1, baseIndex + 2,
          baseIndex + 0, baseIndex + 2, baseIndex + 3
      );
  }

  private getLodVolumePrimaryType(lx: number, y: number, lz: number, step: number) {
    let hasLeaves = false;
    const volume = step * step * step;
    
    for (let i = 0; i < volume; i++) {
        const dy = Math.floor(i / (step * step));
        const rem = i % (step * step);
        const dx = Math.floor(rem / step);
        const dz = rem % step;
        
        const type = this.getBlock(lx + dx, y + (step - 1 - dy), lz + dz);
        if (type !== 0 && type !== 5) return type; 
        if (type === 5) hasLeaves = true;
    }
    
    return hasLeaves ? 5 : 0;
  }

  private shouldRenderFace(myType: number, neighborType: number, dir: string, lx: number, lz: number) {
      if (dir === 'left' && lx === 0 && this.lodLeft !== this.lodLevel) return true;
      if (dir === 'right' && lx === CHUNK_SIZE - 1 && this.lodRight !== this.lodLevel) return true;
      if (dir === 'back' && lz === 0 && this.lodTop !== this.lodLevel) return true;
      if (dir === 'front' && lz === CHUNK_SIZE - 1 && this.lodBottom !== this.lodLevel) return true;

      const isNeighborTransparent = neighborType === 0 || neighborType === 5;
      if (!isNeighborTransparent) return false;
      if (!this.effectiveFancyLeaves && myType === 5 && neighborType === 5) return false;
      return true;
  }

  private shouldRenderFaceLOD(myType: number, neighborType: number, dir: string, lx: number, lz: number, step: number) {
     if (dir === 'left' && lx === 0 && this.lodLeft !== this.lodLevel) return true;
     if (dir === 'right' && lx === CHUNK_SIZE - step && this.lodRight !== this.lodLevel) return true;
     if (dir === 'back' && lz === 0 && this.lodTop !== this.lodLevel) return true;
     if (dir === 'front' && lz === CHUNK_SIZE - step && this.lodBottom !== this.lodLevel) return true;

     if (neighborType === 0) return true;
     if (myType === 5 && neighborType === 5) return false;
     if (myType !== 5 && neighborType === 5) return true;
     
     return false; 
  }

  private processHighDetailFaces(lx: number, y: number, lz: number, type: number) {
       if (this.shouldRenderFace(type, this.getBlock(lx,y+1,lz), 'top', lx, lz)) this.pushQuadWithAO(lx, y, lz, type, 'top');
       if (this.shouldRenderFace(type, this.getBlock(lx,y-1,lz), 'bottom', lx, lz)) this.pushQuadWithAO(lx, y, lz, type, 'bottom');
       if (this.shouldRenderFace(type, this.getBlock(lx-1,y,lz), 'left', lx, lz)) this.pushQuadWithAO(lx, y, lz, type, 'left');
       if (this.shouldRenderFace(type, this.getBlock(lx+1,y,lz), 'right', lx, lz)) this.pushQuadWithAO(lx, y, lz, type, 'right');
       if (this.shouldRenderFace(type, this.getBlock(lx,y,lz+1), 'front', lx, lz)) this.pushQuadWithAO(lx, y, lz, type, 'front');
       if (this.shouldRenderFace(type, this.getBlock(lx,y,lz-1), 'back', lx, lz)) this.pushQuadWithAO(lx, y, lz, type, 'back');
  }

  private generateHighDetailMesh() {
      for(let lx = 0; lx < CHUNK_SIZE; lx++) {
         for(let lz = 0; lz < CHUNK_SIZE; lz++) {
            for(let y = Y_MAX; y >= Y_MIN; y--) {
               const type = this.getBlock(lx, y, lz);
               if (type === 0) continue;
               this.processHighDetailFaces(lx, y, lz, type);
            }
         }
      }
  }

  private processLODFaces(lx: number, y: number, lz: number, type: number, step: number) {
       if (this.shouldRenderFaceLOD(type, this.getLodVolumePrimaryType(lx, y+step, lz, step), 'top', lx, lz, step)) this.pushQuadWithAO(lx, y, lz, type, 'top');
       if (this.shouldRenderFaceLOD(type, this.getLodVolumePrimaryType(lx, y-step, lz, step), 'bottom', lx, lz, step)) this.pushQuadWithAO(lx, y, lz, type, 'bottom');
       if (this.shouldRenderFaceLOD(type, this.getLodVolumePrimaryType(lx-step, y, lz, step), 'left', lx, lz, step)) this.pushQuadWithAO(lx, y, lz, type, 'left');
       if (this.shouldRenderFaceLOD(type, this.getLodVolumePrimaryType(lx+step, y, lz, step), 'right', lx, lz, step)) this.pushQuadWithAO(lx, y, lz, type, 'right');
       if (this.shouldRenderFaceLOD(type, this.getLodVolumePrimaryType(lx, y, lz+step, step), 'front', lx, lz, step)) this.pushQuadWithAO(lx, y, lz, type, 'front');
       if (this.shouldRenderFaceLOD(type, this.getLodVolumePrimaryType(lx, y, lz-step, step), 'back', lx, lz, step)) this.pushQuadWithAO(lx, y, lz, type, 'back');
  }

  private generateLODMesh(step: number) {
      for(let lx = 0; lx < CHUNK_SIZE; lx+=step) {
         for(let lz = 0; lz < CHUNK_SIZE; lz+=step) {
            for(let y = Y_MAX; y >= Y_MIN; y-=step) {
               const type = this.getLodVolumePrimaryType(lx, y, lz, step);
               if (type === 0) continue;
               this.processLODFaces(lx, y, lz, type, step);
            }
         }
      }
  }

  private generateMesh() {
      let step = 4;
      if (this.lodLevel === 0) {
          step = 1;
      } else if (this.lodLevel === 1) {
          step = 2;
      }

      if (this.lodLevel === 0) {
          this.generateHighDetailMesh();
      } else {
          this.generateLODMesh(step);
      }
  }
}

globalThis.onmessage = (e) => {
  const { cx, cz, lodLevel, userModsArray, taskId, fancyLeaves, neighborLODs, seed } = e.data;
  
  if (seed !== undefined) {
      setGlobalSeed(seed);
  }

  const builder = new ChunkBuilder(cx, cz, lodLevel, userModsArray, taskId, fancyLeaves, neighborLODs);
  const result = builder.build();

  globalThis.postMessage(result, { 
      transfer: [
          result.chunkData.buffer, 
          result.posArray.buffer, 
          result.normArray.buffer, 
          result.uvArray.buffer, 
          result.indArray.buffer, 
          result.colorArray.buffer
      ] 
  });
};
