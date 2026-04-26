const DB_NAME = 'MinecraftCloneDB';
const WORLDS_STORE = 'worlds';
const BLOCKS_STORE = 'blocks';
const DB_VERSION = 2; // Incremented version to add the new store

export interface WorldMetadata {
    id: string;
    name: string;
    seed: number;
    lastPlayed: number;
    createdAt: number;
    playerPosition?: { x: number; y: number; z: number };
    playerRotation?: { x: number; y: number };
    worldTime?: number;
}

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Migration from v1 or fresh install
      if (!db.objectStoreNames.contains(WORLDS_STORE)) {
        db.createObjectStore(WORLDS_STORE, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(BLOCKS_STORE)) {
        db.createObjectStore(BLOCKS_STORE);
      }

      // If we are migrating from v1, we might need to handle the old 'worldData' store
      if (db.objectStoreNames.contains('worldData')) {
        // We could move data here, but for simplicity in a clone we might just clear or ignore
        // In a real app we'd migrate blocks to the new 'blocks' store under a 'default' world ID
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error;
      reject(new Error(error?.message || 'Failed to open database'));
    };
  });
};

// --- World Metadata Management ---

export const getAllWorlds = async (db: IDBDatabase): Promise<WorldMetadata[]> => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([WORLDS_STORE], 'readonly');
        const store = transaction.objectStore(WORLDS_STORE);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to get worlds'));
    });
};

export const createWorld = async (db: IDBDatabase, name: string, seed: number): Promise<WorldMetadata> => {
    const world: WorldMetadata = {
        id: crypto.randomUUID(),
        name,
        seed,
        lastPlayed: Date.now(),
        createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([WORLDS_STORE], 'readwrite');
        const store = transaction.objectStore(WORLDS_STORE);
        const request = store.add(world);

        request.onsuccess = () => resolve(world);
        request.onerror = () => reject(new Error('Failed to create world'));
    });
};

export const updateWorldLastPlayed = (db: IDBDatabase, id: string, playerPosition?: { x: number, y: number, z: number }, playerRotation?: { x: number, y: number }, worldTime?: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORLDS_STORE, 'readwrite');
        const store = transaction.objectStore(WORLDS_STORE);
        const request = store.get(id);

        request.onsuccess = () => {
            const world = request.result as WorldMetadata;
            if (world) {
                world.lastPlayed = Date.now();
                if (playerPosition) {
                    world.playerPosition = playerPosition;
                }
                if (playerRotation) {
                    world.playerRotation = playerRotation;
                }
                if (worldTime !== undefined) {
                    world.worldTime = worldTime;
                }
                store.put(world);
            }
            resolve();
        };

        request.onerror = () => reject(request.error);
    });
};

export const deleteWorld = async (db: IDBDatabase, worldId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([WORLDS_STORE, BLOCKS_STORE], 'readwrite');
        
        // Delete metadata
        transaction.objectStore(WORLDS_STORE).delete(worldId);
        
        // Delete blocks (this is expensive in IndexedDB without an index)
        // Ideally we'd use an index on worldId, but for now we'll just clear the blocks store 
        // OR better: use keys like `worldId:x,y,z` and iterate
        const blockStore = transaction.objectStore(BLOCKS_STORE);
        const cursorRequest = blockStore.openCursor(IDBKeyRange.bound(`${worldId}:`, `${worldId}:\uffff`));
        
        cursorRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve();
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Failed to delete world'));
    });
};

// --- Block Management ---

export const saveBlock = async (db: IDBDatabase, worldId: string, posKey: string, type: number): Promise<void> => {
  const compositeKey = `${worldId}:${posKey}`;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BLOCKS_STORE], 'readwrite');
    const store = transaction.objectStore(BLOCKS_STORE);
    const request = store.put(type, compositeKey);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message || 'Failed to save block'));
  });
};

export const loadAllBlocks = async (db: IDBDatabase, worldId: string): Promise<Map<string, number>> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BLOCKS_STORE], 'readonly');
    const store = transaction.objectStore(BLOCKS_STORE);
    
    // Only get keys starting with worldId
    const range = IDBKeyRange.bound(`${worldId}:`, `${worldId}:\uffff`);
    const request = store.getAll(range);
    const keysRequest = store.getAllKeys(range);

    let data: any[] = [];
    let keys: IDBValidKey[] = [];

    request.onsuccess = () => {
      data = request.result;
      if (keys.length > 0 || data.length === 0) {
        const result = new Map<string, number>();
        keys.forEach((key, i) => {
            const actualKey = (key as string).split(':')[1];
            result.set(actualKey, data[i]);
        });
        resolve(result);
      }
    };

    keysRequest.onsuccess = () => {
      keys = keysRequest.result;
      if (data.length > 0 || keys.length === 0) {
        const result = new Map<string, number>();
        keys.forEach((key, i) => {
            const actualKey = (key as string).split(':')[1];
            result.set(actualKey, data[i]);
        });
        resolve(result);
      }
    };

    request.onerror = () => reject(new Error(request.error?.message || 'Failed to load blocks'));
    keysRequest.onerror = () => reject(new Error(keysRequest.error?.message || 'Failed to load keys'));
  });
};

// For backwards compatibility or total wipe
export const clearDB = async (db: IDBDatabase): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WORLDS_STORE, BLOCKS_STORE], 'readwrite');
    transaction.objectStore(WORLDS_STORE).clear();
    transaction.objectStore(BLOCKS_STORE).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to clear database'));
  });
};
