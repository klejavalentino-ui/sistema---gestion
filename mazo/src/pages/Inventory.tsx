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

  // Lista de talles dinámica desde el Store
  const availableSizes = useMemo(() => {
    return storeSizes && storeSizes.length > 0 
      ? storeSizes 
      : ['S', 'M', 'L', 'XL', 'XXL'];
  }, [storeSizes]);

  // Lista de categorías únicas de Insumos para dinámicamente armar columnas del Excel
  const supplyCategories = useMemo(() => {
    const cats = new Set<string>();
    supplies.forEach((s: any) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats);
  }, [supplies]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('Todas');

  // Modal States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingBaseSku, setEditingBaseSku] = useState<string | null>(null);

  // Category Form State
  const [newCategoryName, setNewCategoryName] = useState('');

  // Product Form State
  const [productForm, setProductForm] = useState({
    name: '',
    category: '',
    color: '',
    cost: '',
    margin: '',
    location: '',
    sizes: {} as Record<string, number>
  });

  // Inicializar categoría y ubicación por defecto
  useEffect(() => {
    if (categories && categories.length > 0 && !productForm.category) {
      setProductForm(prev => ({ ...prev, category: categories[0] }));
    }
    if (locations && locations.length > 0 && !productForm.location) {
      setProductForm(prev => ({ ...prev, location: locations[0] }));
    }
  }, [categories, locations]);

  // Función para obtener baseSku limpio
  const getCleanBaseSku = (product: any) => {
    if (product.baseSku) {
      return String(product.baseSku).split('-')[0];
    }
    if (product.sku) {
      return String(product.sku).split('-')[0];
    }
    return `PRO001`;
  };

  const handleOpenAddModal = () => {
    setEditingBaseSku(null);
    const initialSizes: Record<string, number> = {};
    availableSizes.forEach((size: string) => {
      initialSizes[size] = 0;
    });

    setProductForm({
      name: '',
      category: categories[0] || 'Remeras',
      color: '',
      cost: '',
      margin: '100',
      location: locations[0] || 'Bahía Blanca',
      sizes: initialSizes
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditModal = (productGroup: any) => {
    const cleanBase = productGroup.baseSku;
    setEditingBaseSku(cleanBase);
    
    // Buscar todas las variantes asociadas a este producto base
    const relatedProducts = products.filter((p: any) => {
      return p.baseSku === cleanBase || getCleanBaseSku(p) === cleanBase;
    });
    
    const sizesStock: Record<string, number> = {};
    availableSizes.forEach((size: string) => {
      const match = relatedProducts.find((p: any) => String(p.size).toUpperCase() === String(size).toUpperCase());
      sizesStock[size] = match ? Number(match.stock) || 0 : 0;
    });

    const firstItem = relatedProducts[0] || productGroup;

    setProductForm({
      name: firstItem.name || '',
      category: firstItem.category || (categories[0] || 'Remeras'),
      color: firstItem.color || '',
      cost: firstItem.cost !== undefined ? String(firstItem.cost) : '',
      margin: firstItem.margin !== undefined ? String(firstItem.margin) : '100',
      location: firstItem.location || (locations[0] || 'Bahía Blanca'),
      sizes: sizesStock
    });
    setIsProductModalOpen(true);
  };

  const handleSizeStockChange = (size: string, value: string) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    setProductForm(prev => ({
      ...prev,
      sizes: {
        ...prev.sizes,
        [size]: numValue
      }
    }));
  };

  const handleSaveProduct = (e: FormEvent) => {
    e.preventDefault();
    if (!productForm.name || !productForm.cost) return;

    // Asignación de SKU base limpio (PRO001, PRO002...)
    const baseSku = editingBaseSku || `PRO${Math.floor(100 + Math.random() * 900)}`;
    const cost = parseFloat(productForm.cost) || 0;
    const margin = parseFloat(productForm.margin) || 0;

    let variantIndex = 1;

    Object.entries(productForm.sizes).forEach(([size, stock]) => {
      const existingProduct = products.find((p: any) => {
        const pBase = getCleanBaseSku(p);
        return (pBase === baseSku || p.baseSku === baseSku) && String(p.size).toUpperCase() === String(size).toUpperCase();
      });

      // Formato de SKU numérico sin letras de talle: PRO001-1, PRO001-2, etc.
      const variantSku = `${baseSku}-${variantIndex}`;
      variantIndex++;

      if (existingProduct) {
        updateProduct(existingProduct.id, {
          baseSku: baseSku,
          sku: variantSku,
          name: productForm.name,
          category: productForm.category,
          color: productForm.color,
          cost,
          margin,
          location: productForm.location,
          stock: Number(stock)
        });
      } else if (stock > 0 || editingBaseSku) {
        addProduct({
          id: Date.now() + Math.floor(Math.random() * 10000),
          baseSku: baseSku,
          sku: variantSku,
          name: productForm.name,
          category: productForm.category,
          size,
          color: productForm.color,
          cost,
          margin,
          location: productForm.location,
          stock: Number(stock)
        });
      }
    });

    setIsProductModalOpen(false);
  };

  const handleDeleteGroup = (baseSku: string) => {
    if (confirm('¿Está seguro de eliminar este producto y todos sus talles?')) {
      const relatedProducts = products.filter((p: any) => {
        return p.baseSku === baseSku || getCleanBaseSku(p) === baseSku;
      });
      relatedProducts.forEach((p: any) => deleteProduct(p.id));
    }
  };

  const handleAddCategory = (e: FormEvent) => {
    e.preventDefault();
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim());
      setNewCategoryName('');
      setIsCategoryModalOpen(false);
    }
  };

  // Agrupar productos de forma limpia por baseSku
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
          sizes: {}
        };
      }
      groups[cleanBase].totalStock += Number(p.stock) || 0;
      groups[cleanBase].sizes[p.size] = Number(p.stock) || 0;
    });

    return Object.values(groups);
  }, [products]);

  const filteredGroupedProducts = groupedProducts.filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.baseSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.color && item.color.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
    const matchesLocation = selectedLocationFilter === 'Todas' || item.location === selectedLocationFilter;

    return matchesSearch && matchesCategory && matchesLocation;
  });

  // Exportar a Excel agregando dinámicamente columnas para cada Categoría de Insumo
  const exportToExcel = () => {
    const excelData = products.map((p: any) => {
      const row: Record<string, any> = {
        'SKU Base': getCleanBaseSku(p),
        'SKU Variante': p.sku,
        'Producto': p.name,
        'Categoría': p.category,
        'Color': p.color || '',
        'Talle': p.size,
        'Ubicación': p.location || '',
        'Costo': p.cost || 0,
        'Margen %': p.margin || 0,
        'Precio Venta': Math.round((p.cost || 0) * (1 + (p.margin || 0) / 100)),
        'Stock': p.stock || 0
      };

      // Agregar columnas adicionales dinámicas para Categorías de Insumos
      supplyCategories.forEach(cat => {
        row[cat] = p.suppliesMap?.[cat] || '';
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `Inventario_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
  };

  // Importar desde Excel reconociendo exactamente por Nombre de Columna
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

      data.forEach((row: any) => {
        // Mapeo directo por encabezado exacto
        const productName = row['Producto'] || row['Nombre'] || row['PRODUCTO'];
        if (!productName) return;

        const baseSku = row['SKU Base'] || row['SKU BASE'] || row['Base SKU'] || `PRO${Math.floor(100 + Math.random() * 900)}`;
        const size = String(row['Talle'] || row['TALLE'] || 'Único').toUpperCase();
        const skuVariant = row['SKU Variante'] || `${baseSku}-${Math.floor(1 + Math.random() * 99)}`;
        const cost = parseFloat(row['Costo'] || row['COSTO'] || '0') || 0;
        const margin = parseFloat(row['Margen %'] || row['MARGEN %'] || '100') || 100;
        const stock = parseInt(row['Stock'] || row['STOCK'] || '0') || 0;
        const category = row['Categoría'] || row['CATEGORIA'] || categories[0] || 'Remeras';
        const color = row['Color'] || row['COLOR'] || '';
        const location = row['Ubicación'] || row['UBICACION'] || locations[0] || 'Bahía Blanca';

        // Mapear campos dinámicos de Insumos presentes en la fila
        const suppliesMap: Record<string, string> = {};
        supplyCategories.forEach(cat => {
          if (row[cat] !== undefined) {
            suppliesMap[cat] = String(row[cat]);
          }
        });

        // Verificar si existe el producto para actualizar o agregar
        const existing = products.find((p: any) => 
          (p.sku === skuVariant) || (getCleanBaseSku(p) === baseSku && String(p.size).toUpperCase() === size)
        );

        if (existing) {
          updateProduct(existing.id, {
            baseSku,
            sku: skuVariant,
            name: productName,
            category,
            size,
            color,
            cost,
            margin,
            location,
            stock,
            suppliesMap
          });
        } else {
          addProduct({
            id: Date.now() + Math.floor(Math.random() * 100000),
            baseSku,
            sku: skuVariant,
            name: productName,
            category,
            size,
            color,
            cost,
            margin,
            location,
            stock,
            suppliesMap
          });
        }
      });

      alert('¡Importación de productos completada con éxito!');
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

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
            Gestión unificada de productos, talles y existencias
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
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, SKU o color..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#e5383b]"
          />
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#e5383b]"
        >
          <option value="Todos">Todas las Categorías</option>
          {categories?.map((cat: string) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Location Filter */}
        <select
          value={selectedLocationFilter}
          onChange={(e) => setSelectedLocationFilter(e.target.value)}
          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#e5383b]"
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
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400">
                <th className="p-3.5">Producto</th>
                <th className="p-3.5">Categoría</th>
                <th className="p-3.5">Color</th>
                <th className="p-3.5">Ubicación</th>
                <th className="p-3.5">Costo Unit.</th>
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
                    <td className="p-3.5 font-medium text-slate-600 dark:text-slate-300">{item.color || 'N/A'}</td>
                    <td className="p-3.5 font-medium text-slate-600 dark:text-slate-300">{item.location || 'Bahía Blanca'}</td>
                    <td className="p-3.5 font-mono text-slate-700 dark:text-slate-300">$ {(item.cost || 0).toLocaleString()}</td>
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">$ {sellPrice.toLocaleString()}</td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                        item.totalStock > 5 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' 
                          : item.totalStock > 0 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400' 
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400'
                      }`}>
                        {item.totalStock} un.
                      </span>
                    </td>
                    <td className="p-3.5 text-right space-x-1">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors"
                        title="Editar Producto y Talles"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(item.baseSku)}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Eliminar Producto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredGroupedProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No se encontraron productos en el inventario.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit Product */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingBaseSku ? 'Editar Producto y Talles' : 'Nuevo Producto'}
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
                  placeholder="Ej. Remera Regular Blanco Premium"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Color</label>
                  <input
                    type="text"
                    value={productForm.color}
                    onChange={(e) => setProductForm(prev => ({ ...prev, color: e.target.value }))}
                    placeholder="Ej. Blanco"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Costo Unit. ($) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={productForm.cost}
                    onChange={(e) => setProductForm(prev => ({ ...prev, cost: e.target.value }))}
                    placeholder="10000"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Margen Ganancia (%)</label>
                  <input
                    type="number"
                    min="0"
                    value={productForm.margin}
                    onChange={(e) => setProductForm(prev => ({ ...prev, margin: e.target.value }))}
                    placeholder="100"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ubicación</label>
                  <select
                    value={productForm.location}
                    onChange={(e) => setProductForm(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none"
                  >
                    {locations?.map((loc: string) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sección de Stock por Talles */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  Stock por Talles ({availableSizes.join(', ')})
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {availableSizes.map((size: string) => (
                    <div key={size} className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                      <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">{size}</span>
                      <input
                        type="number"
                        min="0"
                        value={productForm.sizes[size] ?? 0}
                        onChange={(e) => handleSizeStockChange(size, e.target.value)}
                        className="w-full text-center p-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold focus:ring-1 focus:ring-[#e5383b] outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#e5383b] text-white rounded-xl text-xs font-bold hover:bg-[#ba1826] transition-colors"
                >
                  {editingBaseSku ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Categorías */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Gestionar Categorías</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-500 p-1 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nueva categoría..."
                  className="flex-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-[#e5383b] text-white rounded-xl text-xs font-bold hover:bg-[#ba1826]"
                >
                  Agregar
                </button>
              </form>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {categories?.map((cat: string) => (
                  <div key={cat} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {cat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}