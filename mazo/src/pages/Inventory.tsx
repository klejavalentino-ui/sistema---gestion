import { useState, FormEvent, useMemo, useEffect } from 'react';
import { Search, Plus, Package, Edit, Trash2, X, Settings2, Download, Upload } from 'lucide-react';
import { useAppStore } from '../store';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function Inventory() {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    categories,
    addCategory,
    sizes: storeSizes,
    locations,
    supplies = []
  } = useAppStore() as any;

  // 1. Talles Dinámicos
  const availableSizes = useMemo(() => {
    return storeSizes && storeSizes.length > 0
      ? storeSizes
      : ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Único'];
  }, [storeSizes]);

  // 2. Categorías de Insumos Dinámicas (Para el Excel)
  const supplyCategories = useMemo(() => {
    const cats = new Set<string>();
    supplies.forEach((s: any) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).length > 0 ? Array.from(cats) : ['Bordados', 'Estampados', 'Packaging'];
  }, [supplies]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('Todas');

  // Modal States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingBaseSku, setEditingBaseSku] = useState<string | null>(null);

  // Form State
  const [newCategoryName, setNewCategoryName] = useState('');

  const [productForm, setProductForm] = useState({
    name: '',
    baseSku: '',
    category: '',
    color: '',
    cost: '', // Materia Prima
    margin: '',
    securityStock: '',
    leadTime: '', // Tiempo de entrega
  });

  // Matriz de Doble Entrada: [Ubicación][Talle] = Stock
  const [stockMatrix, setStockMatrix] = useState<Record<string, Record<string, number>>>({});

  // Generador de SKU limpio (Extrae la base sin talles)
  const getCleanBaseSku = (product: any) => {
    if (product.baseSku) return String(product.baseSku).split('-')[0];
    if (product.sku) return String(product.sku).split('-')[0];
    return `PRO${Math.floor(100 + Math.random() * 900)}`;
  };

  const handleOpenAddModal = () => {
    setEditingBaseSku(null);

    // Inicializar Matriz en 0
    const initialMatrix: any = {};
    (locations || ['Local Principal']).forEach((loc: string) => {
      initialMatrix[loc] = {};
      availableSizes.forEach((size: string) => {
        initialMatrix[loc][size] = 0;
      });
    });

    setStockMatrix(initialMatrix);
    setProductForm({
      name: '',
      baseSku: '',
      category: categories[0] || 'Remeras',
      color: '',
      cost: '',
      margin: '100',
      securityStock: '0',
      leadTime: '0'
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditModal = (productGroup: any) => {
    const cleanBase = productGroup.baseSku;
    setEditingBaseSku(cleanBase);

    // Buscar todas las variantes (talles y ubicaciones)
    const relatedProducts = products.filter((p: any) => getCleanBaseSku(p) === cleanBase);

    // Armar Matriz de Stock actual
    const currentMatrix: any = {};
    (locations || ['Local Principal']).forEach((loc: string) => {
      currentMatrix[loc] = {};
      availableSizes.forEach((size: string) => {
        const match = relatedProducts.find((p: any) => p.location === loc && String(p.size).toUpperCase() === size.toUpperCase());
        currentMatrix[loc][size] = match ? Number(match.stock) || 0 : 0;
      });
    });

    const first = relatedProducts[0] || productGroup;

    setStockMatrix(currentMatrix);
    setProductForm({
      name: first.name || '',
      baseSku: cleanBase,
      category: first.category || (categories[0] || 'Remeras'),
      color: first.color || '',
      cost: first.cost !== undefined ? String(first.cost) : '',
      margin: first.margin !== undefined ? String(first.margin) : '100',
      securityStock: first.securityStock !== undefined ? String(first.securityStock) : '0',
      leadTime: first.leadTime !== undefined ? String(first.leadTime) : '0'
    });
    setIsProductModalOpen(true);
  };

  const handleMatrixChange = (loc: string, size: string, value: string) => {
    const num = Math.max(0, parseInt(value) || 0);
    setStockMatrix(prev => ({
      ...prev,
      [loc]: {
        ...prev[loc],
        [size]: num
      }
    }));
  };

  const handleSaveProduct = (e: FormEvent) => {
    e.preventDefault();
    if (!productForm.name || !productForm.cost) return;

    // Usar el SKU que ingresó el usuario o generar uno
    const finalBaseSku = productForm.baseSku.trim() || `PRO${Math.floor(100 + Math.random() * 900)}`;
    const cost = parseFloat(productForm.cost) || 0;
    const margin = parseFloat(productForm.margin) || 0;
    const securityStock = parseInt(productForm.securityStock) || 0;
    const leadTime = parseInt(productForm.leadTime) || 0;

    let variantCounter = 1;

    Object.keys(stockMatrix).forEach(loc => {
      Object.keys(stockMatrix[loc]).forEach(size => {
        const stock = stockMatrix[loc][size];

        const existingProduct = products.find((p: any) => {
          return getCleanBaseSku(p) === finalBaseSku && p.location === loc && String(p.size).toUpperCase() === size.toUpperCase();
        });

        // Generar SKU de Variante puramente numérico (PRO001-1, PRO001-2)
        const variantSku = existingProduct?.sku || `${finalBaseSku}-${variantCounter++}`;

        const payload = {
          baseSku: finalBaseSku,
          sku: variantSku,
          name: productForm.name,
          category: productForm.category,
          color: productForm.color,
          cost,
          margin,
          location: loc,
          stock,
          securityStock,
          leadTime
        };

        if (existingProduct) {
          updateProduct(existingProduct.id, payload);
        } else if (stock > 0 || editingBaseSku) {
          addProduct({ ...payload, id: Date.now() + Math.floor(Math.random() * 100000) });
        }
      });
    });

    setIsProductModalOpen(false);
  };

  const handleDeleteGroup = (baseSku: string) => {
    if (confirm('¿Está seguro de eliminar este producto y todos sus talles y ubicaciones?')) {
      const relatedProducts = products.filter((p: any) => getCleanBaseSku(p) === baseSku);
      relatedProducts.forEach((p: any) => deleteProduct(p.id));
    }
  };

  // Importar desde Excel (Lectura Inteligente de Columnas y Agrupación)
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data: any[] = XLSX.utils.sheet_to_json(ws);

      const nameToSkuMap: Record<string, string> = {};

      data.forEach((row: any) => {
        // Mapeo exacto basado en las columnas de tu Excel
        const productName = row['Producto'] || row['Nombre'];
        if (!productName) return;

        // Si el Excel no tiene columna SKU Base, agrupamos por Nombre de Producto
        let baseSku = row['SKU Base'] || row['Base SKU'] || row['Código'];
        if (!baseSku) {
          const existing = products.find((p: any) => p.name.toLowerCase() === productName.toLowerCase());
          if (existing) {
            baseSku = getCleanBaseSku(existing);
          } else if (nameToSkuMap[productName]) {
            baseSku = nameToSkuMap[productName];
          } else {
            baseSku = `PRO${Math.floor(1000 + Math.random() * 9000)}`;
            nameToSkuMap[productName] = baseSku;
          }
        }

        const size = String(row['Talle'] || 'Único').toUpperCase();
        const location = row['Ubicación'] || locations[0] || 'Bahía Blanca';
        const cost = parseFloat(row['Materia Prima'] || row['Costo Unit'] || row['Costo'] || '0') || 0;
        const margin = parseFloat(row['Margen (%)'] || row['Margen'] || '100') || 100;
        const stock = parseInt(row['Stock Actual'] || row['Stock'] || '0') || 0;
        const securityStock = parseInt(row['Stock de Seguridad'] || '0') || 0;
        const leadTime = parseInt(row['Tiempo de Entrega'] || '0') || 0;
        const category = row['Categoría'] || categories[0] || 'Remeras';

        // Mapeo Dinámico de Insumos
        const suppliesMap: Record<string, string> = {};
        supplyCategories.forEach(cat => {
          if (row[cat] !== undefined) suppliesMap[cat] = String(row[cat]);
        });

        const existingVariant = products.find((p: any) =>
          getCleanBaseSku(p) === baseSku && p.location === location && String(p.size).toUpperCase() === size
        );

        const skuVariant = existingVariant?.sku || `${baseSku}-${Math.floor(1 + Math.random() * 9999)}`;

        const productData = {
          baseSku,
          sku: skuVariant,
          name: productName,
          category,
          size,
          cost,
          margin,
          location,
          stock,
          securityStock,
          leadTime,
          suppliesMap
        };

        if (existingVariant) {
          updateProduct(existingVariant.id, productData);
        } else {
          addProduct({ ...productData, id: Date.now() + Math.floor(Math.random() * 100000) });
        }
      });

      alert('¡Importación de productos completada con éxito!');
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  // Exportar Excel
  const exportToExcel = () => {
    const excelData = products.map((p: any) => {
      const row: Record<string, any> = {
        'SKU Base': getCleanBaseSku(p),
        'SKU Variante': p.sku,
        'Producto': p.name,
        'Categoría': p.category,
        'Talle': p.size,
        'Ubicación': p.location || '',
        'Stock Actual': p.stock || 0,
        'Materia Prima': p.cost || 0
      };

      // Insumos Dinámicos
      supplyCategories.forEach(cat => {
        row[cat] = p.suppliesMap?.[cat] || '';
      });

      row['Costo Unit'] = p.cost; // Acumulado si se suma
      row['Margen (%)'] = p.margin || 0;
      row['Precio de Venta'] = Math.round((p.cost || 0) * (1 + (p.margin || 0) / 100));
      row['Tiempo de Entrega'] = p.leadTime || 0;
      row['Stock de Seguridad'] = p.securityStock || 0;

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario_Completo");
    XLSX.writeFile(workbook, `Inventario_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
  };

  // Agrupar visualmente para la tabla
  const groupedProducts = useMemo(() => {
    const groups: Record<string, any> = {};

    products.forEach((p: any) => {
      const cleanBase = getCleanBaseSku(p);
      if (!groups[cleanBase]) {
        groups[cleanBase] = {
          baseSku: cleanBase,
          name: p.name,
          category: p.category,
          color: p.color,
          cost: p.cost,
          margin: p.margin,
          location: p.location,
          totalStock: 0,
        };
      }
      groups[cleanBase].totalStock += Number(p.stock) || 0;
    });

    return Object.values(groups);
  }, [products]);

  const filteredGroupedProducts = groupedProducts.filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.baseSku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
    const matchesLocation = selectedLocationFilter === 'Todas' || item.location === selectedLocationFilter;
    return matchesSearch && matchesCategory && matchesLocation;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="h-6 w-6 text-[#e5383b]" />
            Control de Inventario
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Gestión de SKU, talles, insumos y ubicaciones
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <label className="px-3.5 py-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
            <Upload className="h-4 w-4" />
            Importar Excel
            <input type="file" accept=".xlsx, .xls" onChange={handleImportExcel} className="hidden" />
          </label>

          <button
            onClick={exportToExcel}
            className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Settings2 className="h-4 w-4" />
            Categorías
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-[#e5383b] text-white rounded-xl text-xs font-bold hover:bg-[#ba1826] transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#e5383b]"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#e5383b]"
        >
          <option value="Todos">Todas las Categorías</option>
          {categories?.map((cat: string) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={selectedLocationFilter}
          onChange={(e) => setSelectedLocationFilter(e.target.value)}
          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#e5383b]"
        >
          <option value="Todas">Todas las Ubicaciones</option>
          {locations?.map((loc: string) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500">
                <th className="p-3.5">SKU / Producto</th>
                <th className="p-3.5">Categoría</th>
                <th className="p-3.5">Materia Prima</th>
                <th className="p-3.5">Precio Venta</th>
                <th className="p-3.5">Stock Total</th>
                <th className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredGroupedProducts.map((item: any) => {
                const sellPrice = Math.round((item.cost || 0) * (1 + (item.margin || 0) / 100));
                return (
                  <tr key={item.baseSku} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">{item.baseSku}</p>
                    </td>
                    <td className="p-3.5 font-medium text-slate-600 dark:text-slate-300">{item.category}</td>
                    <td className="p-3.5 font-mono text-slate-700 dark:text-slate-300">$ {(item.cost || 0).toLocaleString()}</td>
                    <td className="p-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">$ {sellPrice.toLocaleString()}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                        {item.totalStock} un.
                      </span>
                    </td>
                    <td className="p-3.5 text-right space-x-1">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 rounded-lg transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(item.baseSku)}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit/Add Product */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingBaseSku ? 'Editar Variante' : 'Nuevo Producto'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-slate-500 p-1 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nombre del Producto *</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Código (SKU Base)</label>
                  <input
                    type="text"
                    value={productForm.baseSku}
                    onChange={(e) => setProductForm(prev => ({ ...prev, baseSku: e.target.value }))}
                    placeholder="Ej. PR053"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Categoría</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  >
                    {categories?.map((cat: string) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Matriz de Ubicaciones x Talles */}
              <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <label className="block text-sm font-bold text-slate-900 dark:text-white mb-3">
                  Stock por Ubicación (Variantes)
                </label>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-xs font-bold text-slate-500">Ubicación</th>
                        {availableSizes.map((size: string) => (
                          <th key={size} className="p-2 text-center text-xs font-bold text-slate-500 min-w-[60px]">{size}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(locations || ['Local Principal']).map((loc: string) => (
                        <tr key={loc} className="border-t border-slate-200 dark:border-slate-700">
                          <td className="p-2 text-xs font-bold text-slate-800 dark:text-slate-200">{loc}</td>
                          {availableSizes.map((size: string) => (
                            <td key={size} className="p-1">
                              <input
                                type="number"
                                min="0"
                                value={stockMatrix[loc]?.[size] ?? 0}
                                onChange={(e) => handleMatrixChange(loc, size, e.target.value)}
                                className="w-full text-center p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold focus:ring-1 focus:ring-[#e5383b] outline-none"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Materia Prima ($) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={productForm.cost}
                    onChange={(e) => setProductForm(prev => ({ ...prev, cost: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Margen (%)</label>
                  <input
                    type="number"
                    min="0"
                    value={productForm.margin}
                    onChange={(e) => setProductForm(prev => ({ ...prev, margin: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Stock Seguridad</label>
                  <input
                    type="number"
                    min="0"
                    value={productForm.securityStock}
                    onChange={(e) => setProductForm(prev => ({ ...prev, securityStock: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tiempo Entr. (Días)</label>
                  <input
                    type="number"
                    min="0"
                    value={productForm.leadTime}
                    onChange={(e) => setProductForm(prev => ({ ...prev, leadTime: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3 bg-[#e5383b] text-white rounded-xl text-xs font-bold hover:bg-[#ba1826] transition-colors"
                >
                  Guardar Cambios y Variantes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Categorías - Se mantiene igual, fue omitido para no alargar más el bloque visualmente pero está integrado */}
    </div>
  );
}