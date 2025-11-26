const memoryStore = new Map();

const resolveValue = (value) =>
  typeof value === 'undefined' || value === null ? null : value;

const AsyncStorage = {
  setItem: async (key, value) => {
    memoryStore.set(key, value);
    return value;
  },
  getItem: async (key) => {
    return resolveValue(memoryStore.get(key));
  },
  removeItem: async (key) => {
    memoryStore.delete(key);
  },
  clear: async () => {
    memoryStore.clear();
  },
  getAllKeys: async () => {
    return Array.from(memoryStore.keys());
  },
  multiGet: async (keys = []) => {
    return keys.map((key) => [key, resolveValue(memoryStore.get(key))]);
  },
  multiSet: async (entries = []) => {
    entries.forEach(([key, value]) => {
      memoryStore.set(key, value);
    });
  },
  multiRemove: async (keys = []) => {
    keys.forEach((key) => memoryStore.delete(key));
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;

