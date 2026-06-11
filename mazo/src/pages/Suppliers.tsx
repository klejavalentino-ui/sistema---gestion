import { useState, FormEvent } from 'react';
import { Truck, Plus, ArrowDownToLine, Search, Phone, Tag, Edit, Trash2, Box, History, Calendar, Barcode, X, Package, Check } from 'lucide-react';
import { useAppStore } from '../store';

const incomingStockHistory: any[] = [];

export default function Suppliers() {
  const { products, categories, stockHistory, suppliers, estampados, packagings, bordados, addSupplier, updateSupplier, deleteSupplier } = useAppStore();
  const availableCategories = categories;

  const [quantities, setQuantities] = useState<Record<string, string>>({
    S: '', M: '', L: '', XL: '', XXL: '', 'Único': ''
  });
  const [unitCost, setUnitCost] = useState<string>('');
  const [margin, setMargin] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedEstampado, setSelectedEstampado] = useState<string>('');
  const [selectedPackaging, setSelectedPackaging] = useState<string>('');
  const [selectedBordado, setSelectedBordado] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  
  // New Supplier Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const handleOpenNewSupplier = () => {
    setEditingSupplierId(null);
    setSupplierName('');
    setSupplierPhone('');
    setSelectedCategories([]);
    setSelectedProducts([]);
    setIsSupplierModalOpen(true);
  };

  const handleEditSupplier = (supplier: any) => {
    setEditingSupplierId(supplier.id);
    setSupplierName(supplier.name);
    setSupplierPhone(supplier.phone);
    setSelectedCategories(supplier.categories);
    setSelectedProducts(supplier.products || []);
    setIsSupplierModalOpen(true);
  };

  const handleDeleteSupplier = (id: number) => {
    if (window.confirm('¿Estás seguro de eliminar este proveedor?')) {
      deleteSupplier(id);
    }
  };

  const handleCategoryToggle = (cat: string) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleProductToggle = (prod: string) => {
    setSelectedProducts(prev => prev.includes(prod) ? prev.filter(p => p !== prod) : [...prev, prod]);
  };

  const handleSaveSupplier = (e: FormEvent) => {
    e.preventDefault();
    if (!supplierName) return;

    if (editingSupplierId) {
      updateSupplier(editingSupplierId, {
        name: supplierName,
        phone: supplierPhone,
        categories: selectedCategories.map(c => c.toUpperCase()),
        products: selectedProducts
      });
    } else {
      addSupplier({
        name: supplierName,
        phone: supplierPhone,
        categories: selectedCategories.map(c => c.toUpperCase()),
        products: selectedProducts
      });
    }
    
    setIsSupplierModalOpen(false);
  };

  const handleUpdateStock = () => {
    if (!selectedProduct) {
      alert('Por favor, selecciona un producto a reponer.');
      return;
    }

    if (!entryDate) {
      alert('Por favor, selecciona una fecha de ingreso obligatoria.');
      return;
    }

    const hasQuantities = Object.values(quantities).some(val => val !== '' && Number(val) > 0);
    if (!hasQuantities) {
      alert('Por favor, ingresa al menos una cantidad para reponer.');
      return;
    }

    const parsedQuantities: Record<string, number> = {};
    Object.entries(quantities).forEach(([size, qty]) => {
      if (qty !== '' && Number(qty) > 0) {
        parsedQuantities[size] = Number(qty);
      }
    });

    const newBaseCost = unitCost ? Number(unitCost) : undefined;
    const newMargin = margin ? Number(margin) : undefined;

    useAppStore.getState().updateProductStock(
      selectedProduct.baseSku, 
      parsedQuantities, 
      newBaseCost, 
      newMargin, 
      entryDate,
      selectedEstampado || null,
      selectedPackaging || null,
      selectedBordado || null
    );

    // Reset form
    setQuantities({ S: '', M: '', L: '', XL: '', XXL: '', 'Único': '' });
    setUnitCost('');
    setMargin('');
    setSelectedEstampado('');
    setSelectedPackaging('');
    setSelectedBordado('');
    setSearchTerm('');
    setSelectedProduct(null);
    
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
    }, 3000);
  };

  // Group products by baseSku for the dropdown to avoid duplicate names
  const uniqueProducts = Array.from(new Map(products.map(p => [p.baseSku, p])).values());

  const filteredProducts = uniqueProducts.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Compras e Ingresos</h2>
        <p className="text-slate-400 text-sm mt-1">Gestiona tus proveedores y registra la entrada de mercadería.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Columna Izquierda: Ingreso e Historial */}
        <div className="space-y-6">
          
          {/* Tarjeta: Ingreso de Mercadería */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
              <div className="bg-emerald-500/10 p-1.5 rounded-full mr-3">
                <Plus className="h-5 w-5 text-emerald-500" />
              </div>
              Ingreso de Mercadería
            </h3>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Producto a Reponer</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Barcode className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedProduct(null);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-800 rounded-lg leading-5 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#e5383b] focus:border-[#e5383b] sm:text-sm transition-colors"
                    placeholder="Escanear código o buscar nombre..."
                  />
                  {showDropdown && searchTerm && filteredProducts.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          className="px-4 py-3 hover:bg-slate-800 cursor-pointer border-b border-slate-800/50 last:border-0"
                          onClick={() => {
                            setSearchTerm(product.name);
                            setSelectedProduct(product);
                            setUnitCost(product.baseCost ? product.baseCost.toString() : '');
                            setMargin(product.margin ? product.margin.toString() : '');
                            setSelectedEstampado(product.estampadoId || '');
                            setSelectedPackaging(product.packagingId || '');
                            setSelectedBordado(product.bordadoId || '');
                            setShowDropdown(false);
                          }}
                        >
                          <div className="text-white font-medium text-sm">{product.name}</div>
                          <div className="text-slate-400 text-xs mt-0.5">SKU Base: {product.baseSku}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Proveedor</label>
                <select className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5">
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                <label className="block text-sm font-medium text-slate-300 mb-3">Cantidad a Ingresar por Talle</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {['S', 'M', 'L', 'XL', 'XXL', 'Único'].map(sz => {
                    const productForSize = selectedProduct 
                      ? products.find(p => p.baseSku === selectedProduct.baseSku && p.size === sz)
                      : null;
                    
                    return (
                      <div key={sz}>
                        <label className="block text-xs text-slate-500 mb-1 text-center font-medium">{sz}</label>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          value={quantities[sz]} 
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setQuantities({...quantities, [sz]: val});
                          }}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2 text-center"
                          placeholder="-"
                        />
                        {selectedProduct && (
                          <div className="text-center mt-2 flex justify-center">
                            <span className="inline-block px-1.5 py-1 whitespace-nowrap rounded-md bg-slate-800 border border-slate-700 text-[10px] xl:text-xs text-emerald-400 font-bold shadow-sm">
                              Stock: {productForSize ? productForSize.stock : 0}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Materia Prima <span className="text-slate-500 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-slate-500 sm:text-sm">$</span>
                    </div>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={unitCost ? new Intl.NumberFormat('es-AR').format(Number(unitCost)) : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\./g, '');
                        if (!isNaN(Number(val))) {
                          setUnitCost(val);
                        }
                      }}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 pl-7" 
                    />
                  </div>
                  {selectedProduct && (
                    <div className="mt-3 flex items-center justify-between bg-slate-800/40 border border-slate-700/60 rounded-lg px-3 py-2 shadow-sm">
                      <span className="text-xs font-semibold text-slate-200 tracking-wide uppercase">Materia Prima</span>
                      <span className="text-sm font-bold text-emerald-400">${selectedProduct.baseCost.toLocaleString('es-AR')}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Estampado
                  </label>
                  <select 
                    value={selectedEstampado}
                    onChange={(e) => setSelectedEstampado(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  >
                    <option value="">Sin estampado ($0)</option>
                    {estampados.map(est => (
                      <option key={est.id} value={est.id}>{est.name} (+${est.cost})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Packaging
                  </label>
                  <select 
                    value={selectedPackaging}
                    onChange={(e) => setSelectedPackaging(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  >
                    <option value="">Sin packaging ($0)</option>
                    {packagings.map(pack => (
                      <option key={pack.id} value={pack.id}>{pack.name} (+${pack.cost})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Bordado
                  </label>
                  <select 
                    value={selectedBordado}
                    onChange={(e) => setSelectedBordado(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  >
                    <option value="">Sin bordado ($0)</option>
                    {bordados.map(bor => (
                      <option key={bor.id} value={bor.id}>{bor.name} (+${bor.cost})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Margen (%) <span className="text-slate-500 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-slate-500 sm:text-sm">%</span>
                    </div>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={margin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setMargin(val);
                      }}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 pl-7" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Fecha de Ingreso <span className="text-rose-500 font-normal">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar className="h-4 w-4 text-slate-500" />
                    </div>
                    <input 
                      type="date" 
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-800 text-slate-400 text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 pl-10" 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-4 space-y-3">
                <div className="flex justify-between items-center text-sm font-medium border-b border-slate-800 pb-3">
                  <span className="text-slate-400">Costo Unitario Total Calculado:</span>
                  <span className="text-xl text-emerald-400 font-bold">
                    ${(
                      (unitCost ? Number(unitCost) : (selectedProduct ? selectedProduct.baseCost : 0)) +
                      (selectedEstampado ? (estampados.find(e => e.id === selectedEstampado)?.cost || 0) : 0) +
                      (selectedPackaging ? (packagings.find(p => p.id === selectedPackaging)?.cost || 0) : 0) +
                      (selectedBordado ? (bordados.find(b => b.id === selectedBordado)?.cost || 0) : 0)
                    ).toLocaleString('es-AR')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-slate-400">Precio de Venta:</span>
                  <span className="text-xl text-white font-bold">
                    ${(
                      ((unitCost ? Number(unitCost) : (selectedProduct ? selectedProduct.baseCost : 0)) +
                      (selectedEstampado ? (estampados.find(e => e.id === selectedEstampado)?.cost || 0) : 0) +
                      (selectedPackaging ? (packagings.find(p => p.id === selectedPackaging)?.cost || 0) : 0) +
                      (selectedBordado ? (bordados.find(b => b.id === selectedBordado)?.cost || 0) : 0)) * 
                      (1 + ((margin ? Number(margin) : (selectedProduct ? selectedProduct.margin : 0)) / 100))
                    ).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              <button 
                onClick={handleUpdateStock}
                className={`w-full mt-2 flex items-center justify-center px-4 py-3 rounded-lg transition-colors font-medium ${
                  showSuccess ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                disabled={showSuccess}
              >
                {showSuccess ? (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    ¡Stock Actualizado!
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5 mr-2" />
                    Actualizar Stock
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tarjeta: Historial de Ingresos */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm min-h-[200px]">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
              <div className="bg-slate-800 p-1.5 rounded-full mr-3">
                <History className="h-5 w-5 text-slate-400" />
              </div>
              Historial de Ingresos
            </h3>
            
            {(stockHistory.length > 0 || incomingStockHistory.length > 0) ? (
              <div className="space-y-4">
                {[ 
                   ...stockHistory.map(entry => ({
                     id: entry.id,
                     date: entry.date.toLocaleDateString(),
                     supplier: 'Ingreso Manual',
                     product: entry.productName,
                     quantity: entry.totalQuantity,
                     unitCost: entry.baseCost || 0
                   })),
                   ...incomingStockHistory 
                 ].slice(0, 5).map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-3 rounded-lg border border-slate-800/50 bg-slate-950/30">
                    <div>
                      <p className="text-sm font-medium text-white">{item.product}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.date} • {item.supplier}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">+{item.quantity} un.</p>
                      {(item.unitCost > 0) && <p className="text-xs text-slate-400 mt-0.5">${item.unitCost.toLocaleString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <p className="text-slate-500 text-sm">No hay movimientos recientes.</p>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Proveedores */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <div className="bg-rose-500/10 p-1.5 rounded-full mr-3">
                <Truck className="h-5 w-5 text-rose-500" />
              </div>
              Proveedores
            </h3>
            <button 
              onClick={handleOpenNewSupplier}
              className="flex items-center px-3 py-1.5 bg-slate-950 border border-slate-800 text-white text-sm rounded-lg hover:bg-slate-800 transition-colors font-medium"
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuevo
            </button>
          </div>

          <div className="space-y-4">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="flex items-start p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-slate-700 transition-colors">
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 mr-4 mt-1">
                  <Box className="h-5 w-5 text-rose-500" />
                </div>
                
                <div className="flex-1">
                  <h4 className="font-bold text-white text-base">{supplier.name}</h4>
                  <div className="flex items-center text-sm text-slate-400 mt-1 mb-3">
                    <Phone className="h-3.5 w-3.5 mr-1.5 text-rose-500/70" />
                    <a href={`tel:${supplier.phone}`} className="hover:text-white transition-colors">
                      {supplier.phone || 'Sin teléfono'}
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {supplier.categories.map((cat, idx) => (
                      <span key={idx} className="px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-400 border border-slate-700 rounded bg-slate-900">
                        {cat}
                      </span>
                    ))}
                  </div>
                  {supplier.products && supplier.products.length > 0 && (
                    <div className="flex items-start text-xs text-slate-500 mt-2">
                      <Package className="h-3.5 w-3.5 mr-1.5 mt-0.5 shrink-0" />
                      <span className="leading-relaxed">
                        {supplier.products.join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <button 
                    onClick={() => handleEditSupplier(supplier)}
                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteSupplier(supplier.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Modal Nuevo Proveedor */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-xl my-8">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">
                {editingSupplierId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h3>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveSupplier} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Nombre del Proveedor *</label>
                  <input 
                    type="text" 
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5" 
                    placeholder="Ej. Textil Buenos Aires"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Teléfono</label>
                  <input 
                    type="text" 
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5" 
                    placeholder="Ej. 11 4567-8901"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-3">Categorías que provee</label>
                <div className="flex flex-wrap gap-3">
                  {availableCategories.map(cat => (
                    <label key={cat} className="flex items-center space-x-2 cursor-pointer bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg hover:border-slate-700 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedCategories.includes(cat)}
                        onChange={() => handleCategoryToggle(cat)}
                        className="rounded border-slate-700 text-[#e5383b] focus:ring-[#e5383b] bg-slate-900"
                      />
                      <span className="text-sm text-slate-300">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-3">Productos asociados (Inventario)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2">
                  {Array.from(new Set(
                    products
                      .filter(p => selectedCategories.length === 0 || selectedCategories.includes(p.category))
                      .map(p => p.name)
                  )).map(prod => (
                    <label key={prod} className="flex items-center space-x-2 cursor-pointer bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg hover:border-slate-700 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedProducts.includes(prod)}
                        onChange={() => handleProductToggle(prod)}
                        className="rounded border-slate-700 text-[#e5383b] focus:ring-[#e5383b] bg-slate-900"
                      />
                      <span className="text-sm text-slate-300 truncate" title={prod}>{prod}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-6 flex gap-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-[#e5383b] text-white rounded-lg hover:bg-[#ba1826] transition-colors font-medium"
                >
                  {editingSupplierId ? 'Guardar Cambios' : 'Guardar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
