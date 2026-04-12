const DB_NAME = 'MinecraftCloneDB';
const STORE_NAME = 'worldData';
const DB_VERSION = 1;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export const saveBlock = async (db: IDBDatabase, key: string, type: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(type, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const loadAllBlocks = async (db: IDBDatabase): Promise<Map<string, number>> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    const keysRequest = store.getAllKeys();

    let data: any[] = [];
    let keys: IDBValidKey[] = [];

    request.onsuccess = () => {
      data = request.result;
      if (keys.length > 0 || data.length === 0) {
        const result = new Map<string, number>();
        keys.forEach((key, i) => result.set(key as string, data[i]));
        resolve(result);
      }
    };

    keysRequest.onsuccess = () => {
      keys = keysRequest.result;
      if (data.length > 0 || keys.length === 0) {
        const result = new Map<string, number>();
        keys.forEach((key, i) => result.set(key as string, data[i]));
        resolve(result);
      }
    };

    request.onerror = () => reject(request.error);
    keysRequest.onerror = () => reject(keysRequest.error);
  });
};
