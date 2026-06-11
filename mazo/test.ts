import { useAppStore } from './src/store/index.js';

console.log("Initial stock for L:", useAppStore.getState().products.find(p => p.sku === 'REM-OVR-BAS-L').stock);

useAppStore.getState().updateProductStock('REM-OVR-BAS', { 'L': 10 }, 6500, 55);

const updated = useAppStore.getState().products.find(p => p.sku === 'REM-OVR-BAS-L');
console.log("Updated stock for L:", updated.stock);
console.log("Updated cost:", updated.baseCost, updated.cost, updated.margin);
