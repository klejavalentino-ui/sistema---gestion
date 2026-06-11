import { useState } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, Barcode, History, CheckCircle2, X, Banknote, CreditCard, Smartphone, Check, FileSpreadsheet, Calendar, AlertCircle, TrendingDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store';

export default function Sales() {
  const { products, sales: salesHistory, addSale, categories, addCurrentAccount, addAccountTransaction, currentAccounts, addCashTransaction } = useAppStore();
  const [cart, setCart] = useState<Array<{product: any, size: string, quantity: number}>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedProductForSize, setSelectedProductForSize] = useState<any>(null);
  
  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Checkout Modal State
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'method' | 'finance' | 'success'>('method');
  
  // Finance Modal State
  const [financePaidAmount, setFinancePaidAmount] = useState<string>('');
  const [financeClientName, setFinanceClientName] = useState('');
  const [financeClientPhone, setFinanceClientPhone] = useState('');
  const [financeClientAddress, setFinanceClientAddress] = useState('');

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleProductClick = (product: any) => {
    if (product.stock <= 0) {
      showToast('Producto sin stock disponible.');
      return;
    }
    
    // Group products by baseSku to find all available sizes
    const relatedProducts = products.filter(p => p.baseSku === product.baseSku);
    const availableSizes = relatedProducts.filter(p => p.stock > 0).map(p => p.size);

    if (availableSizes.length > 1) {
      setSelectedProductForSize({ ...product, sizes: availableSizes });
    } else if (availableSizes.length === 1) {
      addToCart(relatedProducts.find(p => p.size === availableSizes[0]), availableSizes[0]);
    } else {
      showToast('No hay stock disponible en ningún talle.');
    }
  };

  const handleSizeSelect = (size: string) => {
    const specificProduct = products.find(p => p.baseSku === selectedProductForSize.baseSku && p.size === size);
    if (specificProduct) {
      addToCart(specificProduct, size);
    }
    setSelectedProductForSize(null);
  };

  const addToCart = (product: any, size: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id && item.size === size);
      
      if (existing) {
        const newQuantity = (Number(existing.quantity) || 0) + 1;
        if (newQuantity > product.stock) {
          showToast(`Solo hay ${product.stock} unidades disponibles en stock.`);
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id && item.size === size
            ? { ...item, quantity: newQuantity }
            : item
        );
      }
      
      if (product.stock < 1) {
        showToast('Producto sin stock disponible.');
        return prev;
      }
      
      return [...prev, { product, size, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: number, size: string) => {
    setCart(prev => prev.filter(item => !(item.product.id === productId && item.size === size)));
  };

  const updateQuantity = (productId: number, size: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId && item.size === size) {
        const newQuantity = Math.max(1, (Number(item.quantity) || 0) + delta);
        if (newQuantity > item.product.stock) {
          showToast(`Solo hay ${item.product.stock} unidades disponibles en stock.`);
          return item;
        }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const setExactQuantity = (productId: number, size: string, value: string) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId && item.size === size) {
        if (value === '') {
          return { ...item, quantity: '' as any };
        }
        const num = parseInt(value);
        const newQuantity = isNaN(num) ? 1 : Math.max(1, num);
        
        if (newQuantity > item.product.stock) {
          showToast(`Solo hay ${item.product.stock} unidades disponibles en stock.`);
          return { ...item, quantity: item.product.stock };
        }
        
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const total = cart.reduce((sum, item) => sum + ((item.product.cost * (1 + item.product.margin / 100)) * (Number(item.quantity) || 0)), 0);
  const totalUnits = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  const handleCobrarClick = () => {
    setCheckoutStep('method');
    setIsCheckoutModalOpen(true);
  };

  const handlePaymentSelect = (method: string) => {
    if (method === 'Financiado') {
      setCheckoutStep('finance');
      setFinancePaidAmount('');
      setFinanceClientName('');
      setFinanceClientPhone('');
      setFinanceClientAddress('');
      return;
    }
    
    const saleId = `V-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Add to history
    const newSale = {
      id: saleId,
      date: new Date(),
      total: total,
      method: method,
      items: cart.map(item => ({ ...item, quantity: Number(item.quantity) || 1 }))
    };
    
    addSale(newSale);

    if (method === 'Efectivo' || method === 'Transferencia') {
      addCashTransaction({
        description: `Venta ${method} - ${saleId}`,
        type: 'income',
        amount: total
      });
    }

    setCheckoutStep('success');
    
    setTimeout(() => {
      setIsCheckoutModalOpen(false);
      setCart([]);
    }, 1000);
  };

  const handleConfirmFinance = () => {
    if (!financeClientName.trim()) {
      showToast('Debe ingresar el nombre del cliente');
      return;
    }

    const paidAmount = Number(financePaidAmount.replace(/[^0-9]/g, '')) || 0;
    const debtAmount = total - paidAmount;

    if (debtAmount <= 0) {
      showToast('El saldo en Cta. corriente debe ser mayor a 0');
      return;
    }

    // Attempt to find existing current account for this client
    let accountId = currentAccounts.find(a => a.entityName.toLowerCase() === financeClientName.trim().toLowerCase() && a.type === 'cliente')?.id;

    if (!accountId) {
      accountId = `CACC-${Date.now()}`;
      addCurrentAccount({
        id: accountId,
        entityName: financeClientName.trim(),
        type: 'cliente',
        phone: financeClientPhone.trim(),
        address: financeClientAddress.trim()
      });
    }

    const saleId = `V-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    addAccountTransaction(accountId, {
      description: 'Venta Cta. corriente ' + saleId,
      amount: debtAmount,
      payment: 0
    });

    const newSale = {
      id: saleId,
      date: new Date(),
      total: total,
      method: `Cta. corriente (${paidAmount > 0 ? '$'+paidAmount+' Pagado' : 'Total'})`,
      items: cart.map(item => ({ ...item, quantity: Number(item.quantity) || 1 }))
    };
    
    addSale(newSale);

    if (paidAmount > 0) {
      addCashTransaction({
        description: `Venta Cta. corriente (Pago Inicial) - ${saleId}`,
        type: 'income',
        amount: paidAmount
      });
    }

    setCheckoutStep('success');
    
    setTimeout(() => {
      setIsCheckoutModalOpen(false);
      setCart([]);
    }, 1000);
  };


  const handleExportHistory = () => {
    // Format for Excel - ALL history without restrictions
    const excelData = salesHistory.flatMap(sale => 
      sale.items.map(item => {
        const price = item.product.cost * (1 + item.product.margin / 100);
        const estimatedCost = item.product.cost;
        const resultadoOperativo = (price - estimatedCost) * item.quantity;

        return {
          'ID Venta': sale.id,
          'Fecha': new Date(sale.date).toLocaleDateString(),
          'Hora': new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          'Método de Pago': sale.method,
          'Producto': item.product.name,
          'Categoría': item.product.category,
          'Talle': item.size,
          'Color': item.product.color,
          'Cantidad': item.quantity,
          'Precio Unitario': price,
          'Resultado Operativo': resultadoOperativo,
          'Total Venta': sale.total
        };
      })
    );

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial_Ventas");
    XLSX.writeFile(wb, `Historial_Ventas_Completo_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
  };

  // Deduplicate products for display (show one card per baseSku)
  const uniqueProducts = Array.from(new Map(products.map(p => [p.baseSku, p])).values());

  const filteredProducts = uniqueProducts.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.baseSku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="lg:h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6 relative">
      {/* Left Side: Products Grid */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950/50 rounded-xl overflow-hidden min-h-[500px]">
        <div className="p-3 pb-1">
          {/* Top Bar: Search and Actions */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#e5383b] focus:border-transparent text-xs transition-colors shadow-sm"
                placeholder="Buscar producto o escanear código..."
              />
            </div>
            <button 
              onClick={handleExportHistory}
              className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors flex items-center font-medium text-xs shadow-sm"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              Exportar
            </button>
          </div>

          {/* Categories */}
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-hide">
            {['Todos', ...categories].map(cat => (
              <button 
                key={cat} 
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat 
                    ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-3 pt-0 scrollbar-hide">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                onClick={() => handleProductClick(product)}
                className="group cursor-pointer border border-slate-200 dark:border-slate-800 rounded-lg p-2 hover:border-[#e5383b] dark:hover:border-[#e5383b] transition-colors bg-white dark:bg-slate-900 flex flex-col justify-between h-full min-h-[90px] relative shadow-sm"
              >
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs leading-tight pr-5 line-clamp-2">{product.name}</h3>
                  <p className="text-[9px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase mt-0.5 truncate">{product.category}</p>
                </div>
                <div className="flex justify-between items-end mt-1.5">
                  <p className="text-xs font-black text-slate-900 dark:text-white truncate pr-1">$ {Math.round(product.cost * (1 + product.margin / 100)).toLocaleString()}</p>
                  <button className="h-5 w-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-[#e5383b] group-hover:text-white transition-colors flex-shrink-0">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 dark:text-slate-400">
                No se encontraron productos que coincidan con la búsqueda.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side: Cart / Ticket */}
      <div className="w-full lg:w-80 flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-shrink-0 lg:h-auto min-h-[300px]">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center">
            <div className="bg-rose-100 dark:bg-rose-500/10 p-1 rounded-md mr-2 text-rose-500">
              <ShoppingCart className="h-3.5 w-3.5" />
            </div>
            Carrito Actual
          </h2>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded">
            {cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)} items
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 bg-white dark:bg-slate-900">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <p className="text-xs font-medium">El carrito está vacío</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={`${item.product.id}-${item.size}`} className="flex gap-2 items-center bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white leading-tight">{item.product.name}</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.size} | {item.product.color}</p>
                    <p className="text-xs font-black text-slate-900 dark:text-white mt-0.5">$ {Math.round(item.product.cost * (1 + item.product.margin / 100)).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <button onClick={() => removeFromCart(item.product.id, item.size)} className="text-slate-400 hover:text-rose-500 transition-colors p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded p-0.5 border border-slate-100 dark:border-slate-700">
                        <button onClick={() => updateQuantity(item.product.id, item.size, -1)} className="p-0.5 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors">
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => setExactQuantity(item.product.id, item.size, e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value === '' || parseInt(e.target.value) < 1) {
                              setExactQuantity(item.product.id, item.size, '1');
                            }
                          }}
                          className="w-8 text-center text-xs font-bold text-slate-900 dark:text-white bg-transparent border-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button onClick={() => updateQuantity(item.product.id, item.size, 1)} className="p-0.5 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                        Stock: {item.product.stock}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-end mb-3">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total a cobrar</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white">$ {total.toLocaleString()}</span>
          </div>
          
          <button 
            onClick={handleCobrarClick}
            disabled={cart.length === 0}
            className="w-full flex items-center justify-center py-2.5 px-3 rounded-lg text-xs font-bold transition-colors disabled:bg-slate-300 disabled:text-white disabled:cursor-not-allowed bg-[#e5383b] text-white hover:bg-[#ba1826] dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
          >
            <span className="flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              COBRAR
            </span>
          </button>
        </div>
      </div>

      {/* Checkout Modal */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative animate-in fade-in zoom-in duration-200">
            {checkoutStep === 'method' ? (
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Método de Pago</h3>
                  <button onClick={() => setIsCheckoutModalOpen(false)} className="text-slate-400 hover:text-slate-500 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total a cobrar</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">$ {total.toLocaleString()}</p>
                </div>

                <div className="space-y-3">
                  <button onClick={() => handlePaymentSelect('Efectivo')} className="w-full flex items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#e5383b] dark:hover:border-[#e5383b] hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all group">
                    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-900 transition-colors mr-4">
                      <Banknote className="h-6 w-6 text-slate-700 dark:text-slate-300 group-hover:text-[#e5383b]" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-900 dark:text-white">Efectivo</p>
                    </div>
                  </button>
                  <button onClick={() => handlePaymentSelect('Tarjeta')} className="w-full flex items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#e5383b] dark:hover:border-[#e5383b] hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all group">
                    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-900 transition-colors mr-4">
                      <CreditCard className="h-6 w-6 text-slate-700 dark:text-slate-300 group-hover:text-[#e5383b]" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-900 dark:text-white">Tarjeta / Débito</p>
                    </div>
                  </button>
                  <button onClick={() => handlePaymentSelect('Transferencia')} className="w-full flex items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#e5383b] dark:hover:border-[#e5383b] hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all group">
                    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-900 transition-colors mr-4">
                      <Smartphone className="h-6 w-6 text-slate-700 dark:text-slate-300 group-hover:text-[#e5383b]" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-900 dark:text-white">Transferencia</p>
                    </div>
                  </button>
                  <button onClick={() => handlePaymentSelect('Financiado')} className="w-full flex items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#e5383b] dark:hover:border-[#e5383b] hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all group">
                    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-900 transition-colors mr-4">
                      <TrendingDown className="h-6 w-6 text-slate-700 dark:text-slate-300 group-hover:text-[#e5383b]" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-900 dark:text-white">Cobranzas</p>
                    </div>
                  </button>
                </div>
              </div>
            ) : checkoutStep === 'finance' ? (
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cobranzas</h3>
                  <button onClick={() => setIsCheckoutModalOpen(false)} className="text-slate-400 hover:text-slate-500 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl flex justify-between items-center">
                  <div className="text-left">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Unidades Físicas</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalUnits}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total de la Venta</p>
                    <p className="text-3xl font-black text-[#e5383b]">$ {total.toLocaleString('es-AR')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre del Cliente / Entidad *</label>
                    <input 
                      type="text"
                      list="client-options"
                      value={financeClientName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFinanceClientName(val);
                        const existingAccount = currentAccounts.find(a => a.type === 'cliente' && a.entityName.toLowerCase() === val.toLowerCase());
                        if (existingAccount) {
                          if (existingAccount.phone) setFinanceClientPhone(existingAccount.phone);
                          if (existingAccount.address) setFinanceClientAddress(existingAccount.address);
                        }
                      }}
                      placeholder="Ej. Juan Pérez, Local Mayorista"
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#e5383b]"
                    />
                    <datalist id="client-options">
                      {currentAccounts.filter(a => a.type === 'cliente').map(acc => (
                        <option key={acc.id} value={acc.entityName} />
                      ))}
                    </datalist>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Teléfono (Opcional)</label>
                      <input 
                        type="text"
                        value={financeClientPhone}
                        onChange={(e) => setFinanceClientPhone(e.target.value)}
                        placeholder="Ej. 11 1234-5678"
                        className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#e5383b]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dirección (Opcional)</label>
                      <input 
                        type="text"
                        value={financeClientAddress}
                        onChange={(e) => setFinanceClientAddress(e.target.value)}
                        placeholder="Ej. Av. Siempreviva 123"
                        className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#e5383b]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monto Pagado (Dejar en 0 si es todo a deuda)</label>
                    <input 
                      type="text"
                      value={financePaidAmount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const paidAmt = Number(raw) || 0;
                        if (paidAmt > total) {
                          showToast(`El monto pagado no puede ser mayor al total ($${total.toLocaleString('es-AR')})`);
                          return;
                        }
                        setFinancePaidAmount(raw ? '$ ' + paidAmt.toLocaleString('es-AR') : '');
                      }}
                      placeholder="$ 0"
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#e5383b]"
                    />
                  </div>
                  <div className="flex justify-between items-center py-3 px-4 bg-rose-50 dark:bg-rose-500/10 rounded-xl mt-4">
                    <span className="text-sm font-bold text-rose-500">Saldo a Cobrar (Deuda):</span>
                    <span className="text-xl font-black text-rose-600">
                      $ {Math.max(0, total - (Number(financePaidAmount.replace(/[^0-9]/g, '')) || 0)).toLocaleString()}
                    </span>
                  </div>

                  <button 
                    onClick={handleConfirmFinance}
                    className="w-full mt-4 flex items-center justify-center py-3 px-4 rounded-xl font-bold bg-[#e5383b] text-white hover:bg-[#ba1826] transition-colors"
                  >
                    Confirmar Venta en Cobranzas
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 flex flex-col items-center justify-center text-center bg-slate-800 dark:bg-slate-900 min-h-[350px]">
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-green-500 blur-xl opacity-40 rounded-full"></div>
                  <div className="relative bg-green-500 text-white p-5 rounded-full shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                    <Check className="h-14 w-14" strokeWidth={3} />
                  </div>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tight">¡Venta Registrada!</h3>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-700 dark:text-slate-300">
                  <History className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Historial de Ventas</h2>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleExportHistory}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-xl font-bold text-sm transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar
                </button>
                <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-500 bg-slate-100 dark:bg-slate-800 p-2 rounded-xl transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white dark:bg-slate-900">
              {salesHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  <History className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-sm font-medium">No hay ventas registradas</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {salesHistory.map((sale) => (
                    <div key={sale.id} className="border-b border-slate-100 dark:border-slate-800 pb-6 last:border-0 last:pb-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xl font-black text-slate-900 dark:text-white">
                          $ {sale.total.toLocaleString()}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                          sale.method === 'Efectivo' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                          sale.method === 'Tarjeta' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                          'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
                        }`}>
                          {sale.method}
                        </span>
                      </div>
                      <div className="flex items-center text-xs text-slate-400 dark:text-slate-500 mb-3 font-medium">
                        <Calendar className="h-3.5 w-3.5 mr-1.5" />
                        {new Date(sale.date).toLocaleDateString()} • {new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-2">
                        {sale.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 dark:text-slate-300">
                              {item.quantity} un x {item.product.name} ({item.size})
                            </span>
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              $ {Math.round(item.quantity * (item.product.cost * (1 + item.product.margin / 100))).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Size Selection Modal */}
      {selectedProductForSize && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Seleccionar Talle</h3>
                <button onClick={() => setSelectedProductForSize(null)} className="text-slate-400 hover:text-slate-500 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="mb-6">
                <p className="font-medium text-slate-800 dark:text-white">{selectedProductForSize.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedProductForSize.color}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {selectedProductForSize.sizes.map((size: string) => (
                  <button
                    key={size}
                    onClick={() => handleSizeSelect(size)}
                    className="py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-[#e5383b] dark:hover:border-[#e5383b] hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-800 dark:border-slate-200">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            <p className="font-medium text-sm">{toastMessage}</p>
            <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white dark:hover:text-slate-900 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
