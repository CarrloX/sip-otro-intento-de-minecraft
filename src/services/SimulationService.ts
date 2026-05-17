import { getGlobalBlockType, CHUNK_SIZE, Y_MAX, Y_MIN } from './WorldService';

// A registry of block behaviors for random ticks
// chunksData is the map of loaded chunks.
// modifyBlock is a callback to change a block in the world.
type TickBehavior = (
    x: number, 
    y: number, 
    z: number, 
    chunksData: Map<string, Uint8Array>, 
    modifyBlock: (x: number, y: number, z: number, type: number) => void
) => void;

const tickBehaviors = new Map<number, TickBehavior>();

// ---------------------------------------------------------
// Register Block Behaviors
// ---------------------------------------------------------

// Dirt (ID: 2) -> Grass (ID: 1) Spread
tickBehaviors.set(2, (x, y, z, chunksData, modifyBlock) => {
    // Dirt can become Grass if exposed to light/sky (simplified as air block above)
    const above = getGlobalBlockType(x, y + 1, z, chunksData);
    if (above !== 0) return;

    // Check adjacent neighbors (3x3x3 area, but let's stick to a simple cross check to save CPU)
    const neighbors = [
        [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
        [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1],
        [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]
    ];

    let hasGrass = false;
    for (const [dx, dy, dz] of neighbors) {
        if (getGlobalBlockType(x + dx, y + dy, z + dz, chunksData) === 1) {
            hasGrass = true;
            break;
        }
    }

    if (hasGrass) {
        // Random chance to spread grass when ticked
        if (Math.random() < 0.25) {
            modifyBlock(x, y, z, 1); // Change Dirt to Grass
        }
    }
});

// Grass (ID: 1) -> Dirt (ID: 2) Decay (if covered)
tickBehaviors.set(1, (x, y, z, chunksData, modifyBlock) => {
    // If a solid block is placed above grass, it dies and turns back to dirt
    const above = getGlobalBlockType(x, y + 1, z, chunksData);
    if (above !== 0 && above !== 5) { // If it's not air and not leaves
        modifyBlock(x, y, z, 2); // Change Grass to Dirt
    }
});

// ---------------------------------------------------------
// Engine Tick Runner
// ---------------------------------------------------------

export const simulateRandomTicks = (
    loadedChunks: string[],
    chunksData: Map<string, Uint8Array>,
    modifyBlock: (x: number, y: number, z: number, type: number) => void,
    tickMultiplier: number = 1
) => {
    // In Minecraft, random ticks happen on 3 random blocks per 16x16x16 sub-chunk.
    // Our chunks are 16x16x320 (height). That's 20 sub-chunks. 
    // 3 * 20 = 60 ticks per chunk per tick.
    const TICKS_PER_CHUNK = 60 * tickMultiplier; 
    const Y_HEIGHT = Y_MAX - Y_MIN + 1; // 320
    
    for (let c = 0; c < loadedChunks.length; c++) {
        const chunkId = loadedChunks[c];
        const chunkData = chunksData.get(chunkId);
        if (!chunkData) continue;

        const commaIdx = chunkId.indexOf(',');
        const cx = parseInt(chunkId.substring(0, commaIdx)) * CHUNK_SIZE;
        const cz = parseInt(chunkId.substring(commaIdx + 1)) * CHUNK_SIZE;

        for (let i = 0; i < TICKS_PER_CHUNK; i++) {
            // Highly optimized random integer selection (Bitwise OR 0 is faster than Math.floor)
            const lx = (Math.random() * 16) | 0;
            const lz = (Math.random() * 16) | 0;
            const indexY = (Math.random() * Y_HEIGHT) | 0;

            const idx = lx + (lz * 16) + (indexY * 256);
            const blockType = chunkData[idx];
            
            // Fast exit: Ignore Air (0) and common inert blocks like Stone (3) to save Map lookups
            if (blockType !== 0 && blockType !== 3) {
                const behavior = tickBehaviors.get(blockType);
                if (behavior) {
                    const globalY = indexY + Y_MIN;
                    behavior(cx + lx, globalY, cz + lz, chunksData, modifyBlock);
                }
            }
        }
    }
};
