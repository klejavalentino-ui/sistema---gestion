import { create } from 'zustand';

export interface ExtraService {
  id: string;
  name: string;
  cost: number;
}

export interface Product {
  id: number;
  baseSku: string;
  sku: string;
  name: string;
  category: string;
  size: string;
  color: string;
  stock: number;
  cost: number;
  baseCost: number;
  margin: number;
  estampadoId?: string;
  packagingId?: string;
  bordadoId?: string;
}

export interface SaleItem {
  product: Product;
  size: string;
  quantity: number;
}

export interface Sale {
  id: string;
  date: Date;
  total: number;
  method: string;
  items: SaleItem[];
}

export interface StockEntry {
  id: string;
  date: Date;
  productName: string;
  totalQuantity: number;
  baseCost?: number;
  margin?: number;
}

export interface MarketingExpense {
  id: string;
  date: Date;
  type?: 'influencer' | 'ad';
  influencer?: string;
  influencerId?: string;
  productSku?: string;
  productName?: string;
  quantity?: number;
  unitCost?: number;
  platform?: string;
  campaignName?: string;
  totalCost: number;
}

export interface Influencer {
  id: string;
  name: string;
  phone?: string;
  instagram?: string;
  address?: string;
  notes?: string;
}

export interface AccountTransaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  payment: number;
}

export interface CashTransaction {
  id: string;
  date: Date;
  description: string;
  type: 'income' | 'expense';
  amount: number;
}

export interface FixedCost {
  id: string | number;
  concept: string;
  period: string;
  category: string;
  amount: number;
  isPaid?: boolean;
}

export interface CurrentAccount {
  id: string;
  entityName: string; // Used mostly as display name or key if not using supplier id directly
  supplierId?: number; // Optional reference to a supplier
  type: 'proveedor' | 'cliente';
  phone?: string;
  address?: string;
  transactions: AccountTransaction[];
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  categories: string[];
  products: string[];
}

interface AppState {
  estampados: ExtraService[];
  packagings: ExtraService[];
  bordados: ExtraService[];
  products: Product[];
  categories: string[];
  sales: Sale[];
  stockHistory: StockEntry[];
  marketingExpenses: MarketingExpense[];
  currentAccounts: CurrentAccount[];
  suppliers: Supplier[];
  cashTransactions: CashTransaction[];
  influencers: Influencer[];
  fixedCosts: FixedCost[];
  addFixedCost: (cost: Omit<FixedCost, 'id'>) => void;
  deleteFixedCost: (id: string | number) => void;
  updateFixedCost: (id: string | number, param: Partial<FixedCost>) => void;
  addCashTransaction: (transaction: Omit<CashTransaction, 'id' | 'date'>) => void;
  updateEstampado: (id: string, cost: number) => void;
  updatePackaging: (id: string, cost: number) => void;
  updateBordado: (id: string, cost: number) => void;
  setProducts: (products: Product[]) => void;
  addSale: (sale: Sale) => void;
  addMarketingExpense: (expense: Omit<MarketingExpense, 'id' | 'date' | 'totalCost'> & { totalCost?: number; date?: Date }) => void;
  addCurrentAccount: (account: Partial<CurrentAccount> & Pick<CurrentAccount, 'entityName' | 'type'>) => void;
  updateCurrentAccount: (id: string, account: Partial<CurrentAccount>) => void;
  addAccountTransaction: (accountId: string, transaction: Omit<AccountTransaction, 'id' | 'date'>) => void;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (id: number, supplier: Partial<Supplier>) => void;
  deleteSupplier: (id: number) => void;
  addInfluencer: (influencer: Omit<Influencer, 'id'>) => void;
  updateInfluencer: (id: string, influencer: Partial<Influencer>) => void;
  deleteInfluencer: (id: string) => void;
  addCategory: (category: string, baseSkus?: string[]) => void;
  updateCategory: (oldCategory: string, newCategory: string, baseSkus?: string[]) => void;
  deleteCategory: (category: string) => void;
  updateProductStock: (baseSku: string, quantities: Record<string, number>, newBaseCost?: number, newMargin?: number, entryDate?: string, estampadoId?: string | null, packagingId?: string | null, bordadoId?: string | null) => void;
}

const initialInventory: Product[] = [
  { id: 1, baseSku: 'REM-OVR-BAS', sku: 'REM-OVR-BAS-L', name: 'Remera Oversize Básica Minorista', category: 'Remeras', size: 'L', color: 'Negro', stock: 24, cost: 6000, baseCost: 6000, margin: 40 },
  { id: 2, baseSku: 'REM-OVR-PER', sku: 'REM-OVR-PER-M', name: 'Remera Oversize Personalizada Mayorista', category: 'Remeras', size: 'M', color: 'Blanco', stock: 15, cost: 7500, baseCost: 6000, estampadoId: 'est-mayorista', margin: 30 },
  { id: 3, baseSku: 'BUZ-BOX-BAS', sku: 'BUZ-BOX-BAS-XL', name: 'Buzo Boxy Fit Básico Minorista', category: 'Buzos', size: 'XL', color: 'Gris Melange', stock: 8, cost: 14000, baseCost: 14000, margin: 40 },
  { id: 4, baseSku: 'BUZ-BOX-PER', sku: 'BUZ-BOX-PER-L', name: 'Buzo Boxy Fit Personalizado Mayorista', category: 'Buzos', size: 'L', color: 'Negro', stock: 5, cost: 15500, baseCost: 14000, estampadoId: 'est-mayorista', margin: 30 },
  { id: 5, baseSku: 'GOR-TRK-LOG', sku: 'GOR-TRK-LOG-U', name: 'Gorra Trucker Logo Minorista', category: 'Accesorios', size: 'Único', color: 'Rojo/Blanco', stock: 12, cost: 3500, baseCost: 3000, estampadoId: 'est-minorista', margin: 40 },
  { id: 6, baseSku: 'TOT-BAG-EST', sku: 'TOT-BAG-EST-U', name: 'Tote Bag Estampada Minorista', category: 'Accesorios', size: 'Único', color: 'Crudo', stock: 20, cost: 2500, baseCost: 2000, estampadoId: 'est-minorista', margin: 40 },
  { id: 7, baseSku: 'CAM-CUE-CLA', sku: 'CAM-CUE-CLA-L', name: 'Campera de Cuero Clásica Minorista', category: 'Camperas', size: 'L', color: 'Negro', stock: 10, cost: 45000, baseCost: 45000, margin: 40 },
  { id: 8, baseSku: 'CAM-CUE-BIK', sku: 'CAM-CUE-BIK-M', name: 'Campera de Cuero Biker Mayorista', category: 'Camperas', size: 'M', color: 'Negro', stock: 5, cost: 55000, baseCost: 55000, margin: 30 },
  { id: 9, baseSku: 'MUS-BAS-ALG', sku: 'MUS-BAS-ALG-M', name: 'Musculosa Básica de Algodón Minorista', category: 'Musculosas', size: 'M', color: 'Blanco', stock: 30, cost: 4000, baseCost: 4000, margin: 40 },
  { id: 10, baseSku: 'MUS-DEP-DRY', sku: 'MUS-DEP-DRY-L', name: 'Musculosa Deportiva Dry-Fit Minorista', category: 'Musculosas', size: 'L', color: 'Negro', stock: 25, cost: 5500, baseCost: 5500, margin: 40 },
];

export const useAppStore = create<AppState>((set) => ({
  estampados: [
    { id: 'est-minorista', name: 'Minorista', cost: 500 },
    { id: 'est-mayorista', name: 'Mayorista', cost: 300 },
  ],
  packagings: [
    { id: 'pack-bolsa-chica', name: 'Bolsa Chica', cost: 100 },
    { id: 'pack-bolsa-mediana', name: 'Bolsa Mediana', cost: 200 },
    { id: 'pack-bolsa-grande', name: 'Bolsa Grande', cost: 300 },
  ],
  bordados: [
    { id: 'bor-basico', name: 'Bordado Básico', cost: 1000 },
    { id: 'bor-medio', name: 'Bordado Medio', cost: 2000 },
    { id: 'bor-complejo', name: 'Bordado Complejo', cost: 3000 },
  ],
  categories: ['Remeras', 'Musculosas', 'Buzos', 'Camperas', 'Accesorios'],
  products: initialInventory,
  sales: [],
  stockHistory: [],
  marketingExpenses: [],
  currentAccounts: [
    {
      id: 'acc-cli-1',
      entityName: 'Tienda Urbana Central',
      type: 'cliente',
      phone: '11 4455-6677',
      address: 'Av. San Martín 1500',
      transactions: [
        { id: 't1', date: new Date(Date.now() - 15 * 86400000), description: 'Venta Mayorista (50 Remeras)', amount: 150000, payment: 50000 },
        { id: 't2', date: new Date(Date.now() - 5 * 86400000), description: 'Pago parcial', amount: 0, payment: 30000 }
      ]
    },
    {
      id: 'acc-cli-2',
      entityName: 'Martín Gómez (Revendedor)',
      type: 'cliente',
      phone: '11 2233-4455',
      address: 'Calle Olavarría 240',
      transactions: [
        { id: 't3', date: new Date(Date.now() - 2 * 86400000), description: 'Buzos Boxy Fit', amount: 45000, payment: 0 }
      ]
    },
    {
      id: 'acc-cli-3',
      entityName: 'Boutique Elegance',
      type: 'cliente',
      phone: '11 8899-0011',
      address: 'Florida 600',
      transactions: [
        { id: 't4', date: new Date(Date.now() - 30 * 86400000), description: 'Camperas de Cuero', amount: 250000, payment: 100000 }
      ]
    }
  ],
  cashTransactions: [],
  influencers: [
    { id: '1', name: 'Juan Perez', instagram: '@juanperez', phone: '11 1234-5678' }
  ],
  suppliers: [
    { id: 1, name: 'Textil Buenos Aires', phone: '11 4567-8901', categories: ['REMERAS', 'BUZOS'], products: ['Remera Oversize Básica', 'Buzo Hoodie Heavyweight'] },
    { id: 2, name: 'Gorras Arg', phone: '11 2345-6789', categories: ['GORRAS', 'ACCESORIOS'], products: ['Gorra Trucker Mazo'] },
    { id: 3, name: 'Cueros del Sur', phone: '11 3456-7890', categories: ['CAMPERAS DE CUERO'], products: ['Campera Cuero Biker'] },
    { id: 4, name: 'Tejidos Norte', phone: '351 456-7890', categories: ['ACCESORIOS DE INVIERNO'], products: ['Bufanda Tejida'] },
  ],
  updateEstampado: (id, cost) => set((state) => ({
    estampados: state.estampados.map(e => e.id === id ? { ...e, cost } : e)
  })),
  updatePackaging: (id, cost) => set((state) => ({
    packagings: state.packagings.map(p => p.id === id ? { ...p, cost } : p)
  })),
  updateBordado: (id, cost) => set((state) => ({
    bordados: state.bordados.map(b => b.id === id ? { ...b, cost } : b)
  })),
  setProducts: (products) => set({ products }),
  addSale: (sale) => set((state) => {
    // Decrease stock for each item sold
    const updatedProducts = [...state.products];
    sale.items.forEach(item => {
      const productIndex = updatedProducts.findIndex(p => p.id === item.product.id);
      if (productIndex !== -1) {
        updatedProducts[productIndex] = {
          ...updatedProducts[productIndex],
          stock: Math.max(0, updatedProducts[productIndex].stock - item.quantity)
        };
      }
    });

    return {
      sales: [sale, ...state.sales],
      products: updatedProducts
    };
  }),
  addMarketingExpense: (expense) => set((state) => {
    const updatedProducts = [...state.products];
    if (expense.productSku && expense.quantity) {
      const productIndex = updatedProducts.findIndex(p => p.sku === expense.productSku);
      if (productIndex !== -1) {
        updatedProducts[productIndex] = {
          ...updatedProducts[productIndex],
          stock: Math.max(0, updatedProducts[productIndex].stock - expense.quantity)
        };
      }
    }

    const calculatedTotalCost = expense.totalCost !== undefined 
      ? expense.totalCost 
      : ((expense.unitCost || 0) * (expense.quantity || 0));

    const newExpense: MarketingExpense = {
      ...expense,
      id: Date.now().toString(),
      date: expense.date || new Date(),
      totalCost: calculatedTotalCost
    };

    return {
      products: updatedProducts,
      marketingExpenses: [newExpense, ...state.marketingExpenses]
    };
  }),
  fixedCosts: [
    { id: 1, concept: 'Luz', period: 'Febrero', category: 'Servicios', amount: 45000 },
    { id: 2, concept: 'Sueldo Empleada', period: '1ª Quincena Febrero', category: 'Personal', amount: 180000 },
    { id: 3, concept: 'Internet', period: 'Marzo', category: 'Servicios', amount: 12000 },
  ],
  addFixedCost: (cost) => set((state) => ({
    fixedCosts: [{ ...cost, id: Date.now() }, ...state.fixedCosts]
  })),
  deleteFixedCost: (id) => set((state) => ({
    fixedCosts: state.fixedCosts.filter(c => c.id !== id)
  })),
  updateFixedCost: (id, param) => set((state) => ({
    fixedCosts: state.fixedCosts.map(c => c.id === id ? { ...c, ...param } : c)
  })),
  addCashTransaction: (transaction) => set((state) => ({
    cashTransactions: [{ ...transaction, id: Date.now().toString(), date: new Date() }, ...state.cashTransactions]
  })),
  addCurrentAccount: (account) => set((state) => ({
    currentAccounts: [{ ...account, id: account.id || Date.now().toString(), transactions: account.transactions || [] }, ...state.currentAccounts]
  })),
  updateCurrentAccount: (id, account) => set((state) => ({
    currentAccounts: state.currentAccounts.map(acc => acc.id === id ? { ...acc, ...account } : acc)
  })),
  addAccountTransaction: (accountId, transaction) => set((state) => ({
    currentAccounts: state.currentAccounts.map(acc => {
      if (acc.id === accountId) {
        return {
          ...acc,
          transactions: [...acc.transactions, { ...transaction, id: Date.now().toString() + Math.random(), date: new Date() }]
        };
      }
      return acc;
    })
  })),
  addSupplier: (supplier) => set((state) => ({
    suppliers: [{ ...supplier, id: Date.now() }, ...state.suppliers]
  })),
  updateSupplier: (id, supplier) => set((state) => ({
    suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...supplier } : s)
  })),
  deleteSupplier: (id) => set((state) => ({
    suppliers: state.suppliers.filter(s => s.id !== id)
  })),
  addInfluencer: (influencer) => set((state) => ({
    influencers: [{ ...influencer, id: Date.now().toString() }, ...state.influencers]
  })),
  updateInfluencer: (id, influencer) => set((state) => ({
    influencers: state.influencers.map(inf => inf.id === id ? { ...inf, ...influencer } : inf)
  })),
  deleteInfluencer: (id) => set((state) => ({
    influencers: state.influencers.filter(inf => inf.id !== id)
  })),
  addCategory: (category, baseSkus = []) => set((state) => {
    if (state.categories.includes(category)) return state;
    const newProducts = state.products.map(p => 
      baseSkus.includes(p.baseSku) ? { ...p, category } : p
    );
    return {
      categories: [...state.categories, category],
      products: newProducts
    };
  }),
  updateCategory: (oldCategory, newCategory, baseSkus) => set((state) => {
    const newCategories = state.categories.map(c => c === oldCategory ? newCategory : c);
    const newProducts = state.products.map(p => {
      if (baseSkus) {
        if (baseSkus.includes(p.baseSku)) {
          return { ...p, category: newCategory };
        } else if (p.category === oldCategory) {
          return { ...p, category: '' };
        }
      } else {
        if (p.category === oldCategory) {
          return { ...p, category: newCategory };
        }
      }
      return p;
    });
    return {
      categories: newCategories,
      products: newProducts
    };
  }),
  deleteCategory: (category) => set((state) => ({
    categories: state.categories.filter(c => c !== category)
  })),
  updateProductStock: (baseSku, quantities, newBaseCost, newMargin, entryDate, newEstampadoId, newPackagingId, newBordadoId) => set((state) => {
    const referenceProduct = state.products.find(p => p.baseSku === baseSku);
    if (!referenceProduct) return state;

    const finalBaseCost = newBaseCost !== undefined ? newBaseCost : referenceProduct.baseCost;
    const finalMargin = newMargin !== undefined ? newMargin : referenceProduct.margin;
    
    const finalEstampadoId = newEstampadoId !== undefined ? (newEstampadoId === null ? undefined : newEstampadoId) : referenceProduct.estampadoId;
    const finalPackagingId = newPackagingId !== undefined ? (newPackagingId === null ? undefined : newPackagingId) : referenceProduct.packagingId;
    const finalBordadoId = newBordadoId !== undefined ? (newBordadoId === null ? undefined : newBordadoId) : referenceProduct.bordadoId;

    // Calculate total cost based on the new or existing base cost and extras
    const estCost = finalEstampadoId ? (state.estampados.find(e => e.id === finalEstampadoId)?.cost || 0) : 0;
    const packCost = finalPackagingId ? (state.packagings.find(pk => pk.id === finalPackagingId)?.cost || 0) : 0;
    const bordCost = finalBordadoId ? (state.bordados.find(b => b.id === finalBordadoId)?.cost || 0) : 0;
    const finalTotalCost = finalBaseCost + estCost + packCost + bordCost;

    let updatedProducts = state.products.map(p => {
      if (p.baseSku === baseSku) {
        let updatedProduct = { ...p };
        
        if (quantities[p.size] !== undefined && quantities[p.size] > 0) {
          updatedProduct.stock += quantities[p.size];
        }

        updatedProduct.baseCost = finalBaseCost;
        updatedProduct.margin = finalMargin;
        updatedProduct.cost = finalTotalCost;
        if (newEstampadoId !== undefined) updatedProduct.estampadoId = newEstampadoId === null ? undefined : newEstampadoId;
        if (newPackagingId !== undefined) updatedProduct.packagingId = newPackagingId === null ? undefined : newPackagingId;
        if (newBordadoId !== undefined) updatedProduct.bordadoId = newBordadoId === null ? undefined : newBordadoId;

        return updatedProduct;
      }
      return p;
    });

    const existingSizes = new Set(updatedProducts.filter(p => p.baseSku === baseSku).map(p => p.size));
    const newVariants = [];
    
    for (const [size, qty] of Object.entries(quantities)) {
      if (qty > 0 && !existingSizes.has(size)) {
        newVariants.push({
          ...referenceProduct,
          id: Date.now() + Math.random(),
          size: size,
          sku: `${baseSku}-${size}`,
          stock: qty,
          baseCost: finalBaseCost,
          margin: finalMargin,
          cost: finalTotalCost,
        });
      }
    }

    const totalQtyAdded = Object.values(quantities).reduce((acc, current) => acc + current, 0);

    const actualDate = entryDate ? new Date(`${entryDate}T00:00:00`) : new Date();

    const newStockEntry: StockEntry = {
      id: Date.now().toString(),
      date: actualDate,
      productName: referenceProduct.name,
      totalQuantity: totalQtyAdded,
      baseCost: newBaseCost,
      margin: newMargin,
    };

    return { 
      products: [...newVariants, ...updatedProducts],
      stockHistory: [newStockEntry, ...state.stockHistory] 
    };
  }),
}));
