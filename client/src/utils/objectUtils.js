/**
 * Deep comparison of two objects/values
 * Used for memoization to prevent unnecessary re-renders
 */
export const deepEqual = (a, b) => {
  if (a === b) return true;
  
  if (a == null || b == null) return a === b;
  
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    
    const valA = a[key];
    const valB = b[key];

    if (typeof valA === 'bigint' && typeof valB === 'bigint') {
      if (valA !== valB) return false;
      continue;
    }

    if (Array.isArray(valA) && Array.isArray(valB)) {
      if (valA.length !== valB.length) return false;
      for (let i = 0; i < valA.length; i++) {
        if (!deepEqual(valA[i], valB[i])) return false;
      }
      continue;
    }

    if (typeof valA === 'object' && typeof valB === 'object' && valA !== null && valB !== null) {
      if (!deepEqual(valA, valB)) return false;
      continue;
    }
    
    if (valA !== valB) return false;
  }
  
  return true;
};

