import { useState, FormEvent, useMemo, useEffect } from 'react';
import { Search, Plus, Package, Edit, Trash2, X, Settings2, Download } from 'lucide-react';
import { useAppStore } from '../store';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function Inventory() {
  const { estampados, packagings, bordados, products, categories, setProducts, addCategory, updateCategory, deleteCategory } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingBaseSku, setEditingBaseSku] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas las Categorías');

  // Form State
  const [baseSku, setBaseSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(categories[0] || '');
  const [color, setColor] = useState('');
  const [cost, setCost] = useState<number | ''>('');
  const [margin, setMargin] = useState<number | ''>('');
  const [selectedEstampado, setSelectedEstampado] = useState<string>('');
  const [selectedPackaging, setSelectedPackaging] = useState<string>('');
  const [selectedBordado, setSelectedBordado] = useState<string>('');
  const [sizeStocks, setSizeStocks] = useState<Record<string, number | ''>>({
    S: '', M: '', L: '', XL: '', XXL: '', 'Único': ''
  });

  // Category Modal State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryProducts, setNewCategoryProducts] = useState<string[]>([]);
  const [editingCategory, setEditingCategory] = useState<{old: string, new: string} | null>(null);
  const [editingCategoryProducts, setEditingCategoryProducts] = useState<string[]>([]);

  useEffect(() => {
    if (!editingBaseSku) {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('minorista') && margin !== 40) {
        setMargin(40);
      } else if (lowerName.includes('mayorista') && margin !== 30) {
        setMargin(30);
      }
    }
  }, [name, editingBaseSku]);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const baseCost = Number(cost) || 0;
  const estCost = estampados.find(e => e.id === selectedEstampado)?.cost || 0;
  const packCost = packagings.find(p => p.id === selectedPackaging)?.cost || 0;
  const bordCost = bordados.find(b => b.id === selectedBordado)?.cost || 0;
  const totalCost = baseCost + estCost + packCost + bordCost;
  const calculatedPrice = totalCost * (1 + (Number(margin) || 0) / 100);

  const handleOpenCreate = () => {
    setEditingBaseSku(null);
    setBaseSku('');
    setName('');
    setCategory(categories[0] || '');
    setColor('');
    setCost('');
    setMargin(50);
    setSelectedEstampado('');
    setSelectedPackaging('');
    setSelectedBordado('');
    setSizeStocks({ S: '', M: '', L: '', XL: '', XXL: '', 'Único': '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: any) => {
    setEditingBaseSku(product.baseSku);
    setBaseSku(product.baseSku);
    setName(product.name);
    setCategory(product.category);
    setColor(product.color);
    setCost(product.baseCost || product.cost);
    setMargin(product.margin);
    setSelectedEstampado(product.estampadoId || '');
    setSelectedPackaging(product.packagingId || '');
    setSelectedBordado(product.bordadoId || '');
    
    const relatedProducts = products.filter(p => p.baseSku === product.baseSku);
    const newSizeStocks: Record<string, number | ''> = { S: '', M: '', L: '', XL: '', XXL: '', 'Único': '' };
    relatedProducts.forEach(p => {
      newSizeStocks[p.size] = p.stock;
    });
    setSizeStocks(newSizeStocks);
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de eliminar esta variante?')) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !cost || !margin || !category) {
      alert('Por favor, complete todos los campos requeridos, incluyendo la categoría.');
      return;
    }

    const finalBaseSku = baseSku.trim() || `${category.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    let updatedProducts = [...products];
    if (editingBaseSku) {
      updatedProducts = updatedProducts.filter(p => p.baseSku !== editingBaseSku);
    }

    const newVariants: any[] = [];
    Object.entries(sizeStocks).forEach(([sz, stk]) => {
      if (stk !== '') {
        newVariants.push({
          id: Date.now() + Math.random(),
          baseSku: finalBaseSku,
          sku: `${finalBaseSku}-${sz}`,
          name,
          category,
          size: sz,
          color,
          stock: Number(stk),
          cost: totalCost, // Guardamos el costo total
          baseCost: Number(cost),
          estampadoId: selectedEstampado,
          packagingId: selectedPackaging,
          bordadoId: selectedBordado,
          margin: Number(margin)
        });
      }
    });

    if (newVariants.length === 0) {
      alert('Debes ingresar stock para al menos un talle.');
      return;
    }

    setProducts([...newVariants, ...updatedProducts]);
    setIsModalOpen(false);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas las Categorías' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const uniqueProducts = Array.from(new Map(products.map(p => [p.baseSku, p])).values());

  const exportToExcel = () => {
    const data = filteredProducts.map(item => {
      const price = item.cost * (1 + item.margin / 100);
      return {
        'SKU': item.sku,
        'Nombre': item.name,
        'Categoría': item.category,
        'Color': item.color,
        'Talle': item.size,
        'Stock': item.stock,
        'Costo Base': item.baseCost,
        'Costo Adicionales': item.cost - item.baseCost,
        'Costo Total': item.cost,
        'Margen %': item.margin,
        'Precio Venta': Math.round(price)
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Inventario</h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={exportToExcel}
            className="flex items-center px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors font-medium shadow-sm"
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar Excel
          </button>
          <button 
            onClick={handleOpenCreate}
            className="flex items-center px-4 py-2 bg-[#e5383b] text-white rounded-lg hover:bg-[#ba1826] transition-colors font-medium"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nuevo Producto
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-lg leading-5 bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#e5383b] focus:border-[#e5383b] sm:text-sm transition-colors"
              placeholder="Buscar por SKU, nombre o categoría..."
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
            >
              <option>Todas las Categorías</option>
              {categories.map(cat => (
                <option key={cat}>{cat}</option>
              ))}
            </select>
            <button 
              onClick={() => setIsCategoryModalOpen(true)}
              className="bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 p-2.5 rounded-lg transition-colors"
              title="Gestionar Categorías"
            >
              <Settings2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">SKU / Producto</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Categoría</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Variante</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Stock</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Costo Unit.</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Precio Venta</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Margen</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="bg-slate-900 divide-y divide-slate-800">
              {filteredProducts.map((item) => {
                const price = item.cost * (1 + item.margin / 100);
                
                return (
                  <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                          <Package className="h-5 w-5 text-slate-400" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-white">{item.name}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">{item.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{item.color}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Talle: {item.size}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className={`text-sm font-bold ${item.stock <= 5 ? 'text-rose-500' : 'text-white'}`}>
                        {item.stock} un.
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-400">
                      ${item.cost.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-emerald-400">
                      ${Math.round(price).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-300">
                      <span className="bg-slate-800 px-2 py-1 rounded text-xs font-medium border border-slate-700">
                        {item.margin}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => handleOpenEdit(item)} className="text-slate-400 hover:text-white transition-colors">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-rose-500 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear/Editar Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-xl my-8">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">
                {editingBaseSku ? 'Editar Producto (Todos los talles)' : 'Nuevo Producto'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-400 mb-2">Nombre del Producto</label>
                  <input 
                    type="text" 
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5" 
                    placeholder="Ej. Remera Oversize Básica"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Código (SKU Base)</label>
                  <input 
                    type="text" 
                    value={baseSku}
                    onChange={(e) => setBaseSku(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5" 
                    placeholder="Ej. REM-OVR-N (Opcional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Categoría</label>
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  >
                    <option value="" disabled>Seleccione una categoría</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Color</label>
                  <input 
                    type="text" 
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5" 
                    placeholder="Ej. Negro"
                  />
                </div>

                <div className="md:col-span-2 bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                  <label className="block text-sm font-medium text-slate-300 mb-3">Talles y Stock</label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                    {['S', 'M', 'L', 'XL', 'XXL', 'Único'].map(sz => (
                      <div key={sz}>
                        <label className="block text-xs text-slate-500 mb-1 text-center font-medium">{sz}</label>
                        <input 
                          type="number" 
                          min="0"
                          value={sizeStocks[sz]} 
                          onChange={e => setSizeStocks({...sizeStocks, [sz]: e.target.value === '' ? '' : Number(e.target.value)})}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="-"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3 text-center">Solo se guardarán los talles que tengan un valor ingresado.</p>
                </div>

                <div className="md:col-span-2 border-t border-slate-800 pt-6 mt-2">
                  <h4 className="text-sm font-medium text-white mb-4">Adicionales</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Estampado</label>
                      <select 
                        value={selectedEstampado}
                        onChange={(e) => setSelectedEstampado(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                      >
                        <option value="">Sin estampado ($0)</option>
                        {estampados.map(est => (
                          <option key={est.id} value={est.id}>{est.name} (+${est.cost})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Bordado</label>
                      <select 
                        value={selectedBordado}
                        onChange={(e) => setSelectedBordado(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                      >
                        <option value="">Sin bordado ($0)</option>
                        {bordados.map(bor => (
                          <option key={bor.id} value={bor.id}>{bor.name} (+${bor.cost})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Packaging</label>
                      <select 
                        value={selectedPackaging}
                        onChange={(e) => setSelectedPackaging(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                      >
                        <option value="">Sin packaging ($0)</option>
                        {packagings.map(pack => (
                          <option key={pack.id} value={pack.id}>{pack.name} (+${pack.cost})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 border-t border-slate-800 pt-6 mt-2">
                  <h4 className="text-sm font-medium text-white mb-4">Precios y Rentabilidad</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Materia Prima ($)</label>
                      <input 
                        type="number" 
                        required
                        value={cost}
                        onChange={(e) => setCost(e.target.value ? Number(e.target.value) : '')}
                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                        placeholder="Ej. 6000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Margen (%)</label>
                      <input 
                        type="number" 
                        required
                        value={margin}
                        onChange={(e) => setMargin(e.target.value ? Number(e.target.value) : '')}
                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                        placeholder="Ej. 150"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Precio Venta (Auto)</label>
                      <div className="w-full bg-slate-950 border border-slate-800 text-emerald-400 font-bold text-lg rounded-lg block p-2.5 flex items-center">
                        ${Math.round(calculatedPrice).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <h5 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Costo Unitario</h5>
                      <p className="text-xs text-slate-500 mt-1">Materia Prima + Adicionales</p>
                    </div>
                    <div className="text-3xl font-black text-white">
                      ${totalCost.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-[#e5383b] text-white rounded-lg hover:bg-[#ba1826] transition-colors font-medium"
                >
                  {editingBaseSku ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gestionar Categorías */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Gestionar Categorías</h3>
              <button onClick={() => { setIsCategoryModalOpen(false); setEditingCategory(null); setNewCategoryName(''); setNewCategoryProducts([]); setCategoryToDelete(null); }} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Add new category */}
              <div className="space-y-3 border-b border-slate-800 pb-6">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nueva categoría..."
                    className="flex-1 bg-slate-950 border border-slate-700 text-white text-base rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-3"
                  />
                  <button 
                    onClick={() => {
                      if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
                        addCategory(newCategoryName.trim(), newCategoryProducts);
                        setNewCategoryName('');
                        setNewCategoryProducts([]);
                      }
                    }}
                    disabled={!newCategoryName.trim() || categories.includes(newCategoryName.trim())}
                    className="bg-[#e5383b] hover:bg-[#ba1826] text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-base"
                  >
                    <Plus className="h-5 w-5" />
                    Añadir
                  </button>
                </div>
                {uniqueProducts.length > 0 && (
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <label className="block text-xs font-medium text-slate-400 mb-2">Asociar productos (opcional)</label>
                    <div className="max-h-32 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                      {uniqueProducts.map(p => (
                        <label key={p.baseSku} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                          <input 
                            type="checkbox" 
                            checked={newCategoryProducts.includes(p.baseSku)}
                            onChange={(e) => {
                              if (e.target.checked) setNewCategoryProducts([...newCategoryProducts, p.baseSku]);
                              else setNewCategoryProducts(newCategoryProducts.filter(sku => sku !== p.baseSku));
                            }}
                            className="rounded bg-slate-900 border-slate-700 text-[#e5383b] focus:ring-[#e5383b]"
                          />
                          <span className="truncate">{p.name}</span>
                          <span className="text-slate-500 text-xs ml-auto shrink-0">({p.category || 'Sin categoría'})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* List categories */}
              <div className="space-y-3 max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {categories.map(cat => (
                  <div key={cat} className="flex flex-col sm:flex-row sm:items-start justify-between bg-slate-950 border border-slate-800 p-3 rounded-lg gap-3">
                    {editingCategory?.old === cat ? (
                      <div className="flex-1 space-y-3 w-full">
                        <input 
                          type="text"
                          value={editingCategory.new}
                          onChange={(e) => setEditingCategory({ ...editingCategory, new: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded focus:ring-[#e5383b] focus:border-[#e5383b] px-3 py-2"
                          autoFocus
                        />
                        {uniqueProducts.length > 0 && (
                          <div className="bg-slate-900 p-3 rounded border border-slate-700">
                            <label className="block text-xs font-medium text-slate-400 mb-2">Productos asociados</label>
                            <div className="max-h-32 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                              {uniqueProducts.map(p => (
                                <label key={p.baseSku} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                                  <input 
                                    type="checkbox" 
                                    checked={editingCategoryProducts.includes(p.baseSku)}
                                    onChange={(e) => {
                                      if (e.target.checked) setEditingCategoryProducts([...editingCategoryProducts, p.baseSku]);
                                      else setEditingCategoryProducts(editingCategoryProducts.filter(sku => sku !== p.baseSku));
                                    }}
                                    className="rounded bg-slate-800 border-slate-600 text-[#e5383b] focus:ring-[#e5383b]"
                                  />
                                  <span className="truncate">{p.name}</span>
                                  <span className="text-slate-500 text-xs ml-auto shrink-0">({p.category || 'Sin categoría'})</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2 justify-end mt-2">
                          <button 
                            onClick={() => {
                              if (editingCategory.new.trim()) {
                                if (editingCategory.new.trim() !== cat && categories.includes(editingCategory.new.trim())) {
                                  alert('La categoría ya existe');
                                  return;
                                }
                                updateCategory(cat, editingCategory.new.trim(), editingCategoryProducts);
                                if (selectedCategory === cat) setSelectedCategory(editingCategory.new.trim());
                                setEditingCategory(null);
                              }
                            }}
                            className="text-emerald-400 hover:text-emerald-300 text-xs font-medium px-3 py-1.5 bg-emerald-400/10 rounded transition-colors"
                          >
                            Guardar
                          </button>
                          <button 
                            onClick={() => setEditingCategory(null)}
                            className="text-slate-400 hover:text-slate-300 text-xs font-medium px-3 py-1.5 bg-slate-800 rounded transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="text-slate-300 text-sm font-medium mt-1">{cat}</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setEditingCategory({ old: cat, new: cat });
                              setEditingCategoryProducts(uniqueProducts.filter(p => p.category === cat).map(p => p.baseSku));
                            }}
                            className="text-slate-400 hover:text-white transition-colors p-1"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => setCategoryToDelete(cat)}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="text-center text-slate-500 py-4 text-sm">
                    No hay categorías creadas
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">Eliminar Categoría</h3>
            <p className="text-slate-400 text-sm mb-6">
              ¿Estás seguro de eliminar la categoría <span className="font-semibold text-white">"{categoryToDelete}"</span>? 
              Los productos asociados mantendrán la categoría pero no aparecerá en la lista.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setCategoryToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  deleteCategory(categoryToDelete);
                  if (selectedCategory === categoryToDelete) setSelectedCategory('Todas las Categorías');
                  setCategoryToDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
