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
    addCategory,
    settings,
    fetchSettings
  } = useAppStore() as any;

  // 1. CARGA SEGURA Y ESTRICTA DE CONFIGURACIONES
  useEffect(() => {
    if (fetchSettings) fetchSettings();
  }, [fetchSettings]);

  const availableSizes = settings?.sizes?.length > 0 ? settings.sizes : ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Único'];
  const availableLocations = settings?.locations?.length > 0 ? settings.locations : ['Local Principal'];
  const categories = settings?.categories?.length > 0 ? settings.categories : ['Remeras'];

  // Categorías de Insumos Dinámicas (Para el Excel)
  const supplyCategories = useMemo(() => {
    const cats = new Set<string>();
    if (settings?.supplies) {
      settings.supplies.forEach((s: any) => {
        if (s.category) cats.add(s.category);
      });
    }
    return Array.from(cats).length > 0 ? Array.from(cats) : ['Bordados', 'Estampados', 'Packaging'];
  }, [settings?.supplies]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('Todas');

  // Modales
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Agrupador estricto para edición
  const [editingProductGroup, setEditingProductGroup] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');

  const [productForm, setProductForm] = useState({
    name: '',
    baseSku: '',
    category: '',
    color: '',
    cost: '', // Materia Prima
    margin: '',
    securityStock: '',
    leadTime: '',
  });

  // Lista de ubicaciones dinámicas activas en la matriz del modal
  const [modalLocations, setModalLocations] = useState<string[]>([]);
  // Matriz de Doble Entrada: [Ubicación][Talle] = Stock
  const [stockMatrix, setStockMatrix] = useState<Record<string, Record<string, number>>>({});

  // 2. AGRUPAMIENTO ESTRICTO DE PRODUCTOS POR NOMBRE
  const groupedProducts = useMemo(() => {
    const groups: Record<string, any> = {};

    products.forEach((p: any) => {
      // Regla de Oro: El Nombre es el identificador del grupo
      const groupKey = p.name.trim().toLowerCase();

      if (!groups[groupKey]) {
        // Limpiamos el Base SKU de letras de talles viejos
        let cleanBase = p.baseSku || p.sku || `PRO${Math.floor(100 + Math.random() * 900)}`;
        cleanBase = cleanBase.replace(/-(XS|S|M|L|XL|XXL|XXXL|UNICO|ÚNICO|[0-9]+)$/i, '');

        groups[groupKey] = {
          baseSku: cleanBase,
          name: p.name.trim(),
          category: p.category || '',
          color: p.color || '',
          cost: p.cost || 0,
          margin: p.margin || 0,
          totalStock: 0,
          variants: [] // Guardamos TODAS las variantes para que el lápiz las lea
        };
      }
      groups[groupKey].totalStock += Number(p.stock) || 0;
      groups[groupKey].variants.push(p);
    });

    return Object.values(groups);
  }, [products]);

  const filteredGroupedProducts = groupedProducts.filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.baseSku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || item.category === selectedCategory;

    // Filtro de ubicación revisa si ALGUNA variante tiene esa ubicación
    const matchesLocation = selectedLocationFilter === 'Todas' ||
      item.variants.some((v: any) => v.location === selectedLocationFilter && v.stock > 0);

    return matchesSearch && matchesCategory && matchesLocation;
  });

  const handleOpenAddModal = () => {
    setEditingProductGroup(null);
    setModalLocations(availableLocations);

    // Inicializar Matriz en 0 con las ubicaciones reales de la configuración
    const initialMatrix: any = {};
    availableLocations.forEach((loc: string) => {
      initialMatrix[loc] = {};
      availableSizes.forEach((size: string) => {
        initialMatrix[loc][size] = 0;
      });
    });

    setStockMatrix(initialMatrix);
    setProductForm({
      name: '',
      baseSku: `PRO${Math.floor(100 + Math.random() * 900)}`,
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
    setEditingProductGroup(productGroup.name.trim().toLowerCase());
    const relatedProducts = productGroup.variants;

    // Recopilar ubicaciones reales donde hay stock + las de la configuración
    const activeLocationsSet = new Set<string>();
    availableLocations.forEach((l: string) => activeLocationsSet.add(l));
    relatedProducts.forEach((p: any) => {
      if (p.location) activeLocationsSet.add(p.location);
    });

    const allLocations = Array.from(activeLocationsSet);
    setModalLocations(allLocations);

    // Reconstruir Matriz EXACTA de Stock para que cuadre perfectamente con el total
    const currentMatrix: any = {};
    allLocations.forEach((loc: string) => {
      currentMatrix[loc] = {};
      availableSizes.forEach((size: string) => {
        const match = relatedProducts.find((p: any) =>
          (p.location || 'Local Principal').trim().toLowerCase() === loc.trim().toLowerCase() &&
          String(p.size || 'Único').trim().toUpperCase() === size.trim().toUpperCase()
        );
        currentMatrix[loc][size] = match ? Number(match.stock) || 0 : 0;
      });
    });

    setStockMatrix(currentMatrix);
    setProductForm({
      name: productGroup.name || '',
      baseSku: productGroup.baseSku,
      category: productGroup.category || (categories[0] || 'Remeras'),
      color: productGroup.color || '',
      cost: productGroup.cost !== undefined ? String(productGroup.cost) : '',
      margin: productGroup.margin !== undefined ? String(productGroup.margin) : '100',
      securityStock: relatedProducts[0]?.securityStock !== undefined ? String(relatedProducts[0].securityStock) : '0',
      leadTime: relatedProducts[0]?.leadTime !== undefined ? String(relatedProducts[0].leadTime) : '0'
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

    // SKU Base Libre de Talles
    const finalBaseSku = productForm.baseSku.trim() || `PRO${Math.floor(100 + Math.random() * 900)}`;
    const cost = parseFloat(productForm.cost) || 0;
    const margin = parseFloat(productForm.margin) || 0;
    const securityStock = parseInt(productForm.securityStock) || 0;
    const leadTime = parseInt(productForm.leadTime) || 0;

    let variantCounter = 1; // Para que el SKU sea PRO001-1, PRO001-2

    const groupKey = productForm.name.trim().toLowerCase();
    const existingGroup = groupedProducts.find(g => g.name.trim().toLowerCase() === groupKey);
    const relatedProducts = existingGroup ? existingGroup.variants : [];

    Object.keys(stockMatrix).forEach(loc => {
      Object.keys(stockMatrix[loc]).forEach(size => {
        const stock = stockMatrix[loc][size];

        const existingVariant = relatedProducts.find((p: any) =>
          (p.location || 'Local Principal').trim().toLowerCase() === loc.trim().toLowerCase() &&
          String(p.size || 'Único').trim().toUpperCase() === size.trim().toUpperCase()
        );

        // Generar SKU puramente Numérico
        const variantSku = `${finalBaseSku}-${variantCounter++}`;

        const payload = {
          baseSku: finalBaseSku,
          sku: variantSku,
          name: productForm.name.trim(),
          category: productForm.category,
          size: size,
          color: productForm.color.trim(),
          cost,
          margin,
          location: loc,
          stock: Number(stock),
          securityStock,
          leadTime
        };

        if (existingVariant) {
          updateProduct(existingVariant.id, payload);
        } else if (stock > 0 || editingProductGroup) {
          addProduct({ ...payload, id: Date.now() + Math.floor(Math.random() * 1000000) });
        }
      });
    });

    setIsProductModalOpen(false);
  };

  const handleDeleteGroup = (groupName: string) => {
    if (confirm('¿Está seguro de eliminar este producto y TODAS sus variantes/talles?')) {
      const groupKey = groupName.trim().toLowerCase();
      const existingGroup = groupedProducts.find(g => g.name.trim().toLowerCase() === groupKey);
      if (existingGroup) {
        existingGroup.variants.forEach((p: any) => deleteProduct(p.id));
      }
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

  // 3. IMPORTACIÓN INTELIGENTE (Lee encabezados exactos del Excel)
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
        const productName = row['Producto'] || row['Nombre'] || row['PRODUCTO'] || row['Nombre del Producto'];
        if (!productName) return;

        // Búsqueda inteligente del producto en sistema para no duplicar
        const groupKey = productName.trim().toLowerCase();
        const existingGroup = groupedProducts.find(g => g.name.trim().toLowerCase() === groupKey);

        let baseSku = row['SKU Base'] || row['Base SKU'] || row['Código'] || row['SKU BASE'];
        if (!baseSku) {
          if (existingGroup) {
            baseSku = existingGroup.baseSku;
          } else if (nameToSkuMap[productName]) {
            baseSku = nameToSkuMap[productName];
          } else {
            baseSku = `PRO${Math.floor(1000 + Math.random() * 9000)}`;
            nameToSkuMap[productName] = baseSku;
          }
        }

        // Limpiar el SKU Base de cualquier talle viejo del excel
        baseSku = baseSku.replace(/-(XS|S|M|L|XL|XXL|XXXL|UNICO|ÚNICO|[0-9]+)$/i, '');

        const size = String(row['Talle'] || row['TALLE'] || 'Único').trim().toUpperCase();
        const location = String(row['Ubicación'] || row['UBICACION'] || availableLocations[0] || 'Local Principal').trim();
        const cost = parseFloat(row['Materia Prima'] || row['Costo Unit'] || row['Costo'] || '0') || 0;
        const margin = parseFloat(row['Margen (%)'] || row['Margen %'] || row['Margen'] || '100') || 100;
        const stock = parseInt(row['Stock Actual'] || row['Stock'] || '0') || 0;
        const securityStock = parseInt(row['Stock de Seguridad'] || '0') || 0;
        const leadTime = parseInt(row['Tiempo de Entrega'] || '0') || 0;
        const category = row['Categoría'] || row['Categoria'] || categories[0] || 'Remeras';

        // Mapeo Dinámico de Insumos (Busca textualmente las cabeceras)
        const suppliesMap: Record<string, string> = {};
        supplyCategories.forEach(cat => {
          if (row[cat] !== undefined) suppliesMap[cat] = String(row[cat]);
        });

        const relatedProducts = existingGroup ? existingGroup.variants : [];
        const existingVariant = relatedProducts.find((p: any) =>
          (p.location || 'Local Principal').trim().toLowerCase() === location.toLowerCase() &&
          String(p.size || 'Único').trim().toUpperCase() === size
        );

        const skuVariant = existingVariant?.sku || `${baseSku}-${Math.floor(10 + Math.random() * 89)}`;

        const productData = {
          baseSku,
          sku: skuVariant,
          name: productName.trim(),
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
          addProduct({ ...productData, id: Date.now() + Math.floor(Math.random() * 1000000) });
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
        'SKU Base': p.baseSku || '',
        'SKU Variante': p.sku || '',
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

  return (
    <div className="space-y-6">
      {/* Barra de Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="h-6 w-6 text-[#e5383b]" />
            Control de Inventario
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Gestión unificada de SKU, talles, insumos y ubicaciones
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

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#e5383b] outline-none"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#e5383b] outline-none"
        >
          <option value="Todos">Todas las Categorías</option>
          {categories?.map((cat: string) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={selectedLocationFilter}
          onChange={(e) => setSelectedLocationFilter(e.target.value)}
          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#e5383b] outline-none"
        >
          <option value="Todas">Todas las Ubicaciones</option>
          {availableLocations?.map((loc: string) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Tabla Principal */}
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
                  <tr key={item.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                      <p className="text-[10px] font-mono font-semibold text-slate-400">{item.baseSku}</p>
                    </td>
                    <td className="p-3.5 font-medium text-slate-600 dark:text-slate-300">{item.category}</td>
                    <td className="p-3.5 font-mono text-slate-700 dark:text-slate-300">$ {(item.cost || 0).toLocaleString()}</td>
                    <td className="p-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">$ {sellPrice.toLocaleString()}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400">
                        {item.totalStock} un.
                      </span>
                    </td>
                    <td className="p-3.5 text-right space-x-1">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 rounded-lg transition-colors"
                        title="Editar Producto y Stock"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(item.name)}
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
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No se encontraron productos en el inventario.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Editar/Agregar Producto */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingProductGroup ? 'Editar Producto Completo' : 'Nuevo Producto'}
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
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código (SKU Base - Editable) *
                  </label>
                  <input
                    type="text"
                    required
                    value={productForm.baseSku}
                    onChange={(e) => setProductForm(prev => ({
                      ...prev,
                      baseSku: e.target.value.toUpperCase()
                    }))}
                    placeholder="Ej. PRO014"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#e5383b] outline-none uppercase font-mono font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    El sistema limpiará automáticamente letras de talles.
                  </p>
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

              {/* Matriz Completa de Ubicaciones x Talles */}
              <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white">
                    Stock por Ubicación y Talle
                  </label>
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-500/20">
                    Suma en pantalla: {
                      Object.values(stockMatrix).reduce((accLoc, sizeObj) => {
                        return accLoc + Object.values(sizeObj).reduce((accSize, val) => accSize + (Number(val) || 0), 0);
                      }, 0)
                    } un.
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-[11px] font-bold text-slate-500">Ubicación</th>
                        {availableSizes.map((size: string) => (
                          <th key={size} className="p-2 text-center text-[11px] font-bold text-slate-500 min-w-[55px]">{size}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {modalLocations.map((loc: string) => (
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
                  className="w-full py-3 bg-[#e5383b] text-white rounded-xl text-xs font-bold hover:bg-[#ba1826] transition-colors shadow-md"
                >
                  Guardar Cambios y Actualizar Unidades
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