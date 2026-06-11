import { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  DollarSign,
  Wallet,
  Download,
  X,
  CheckCircle2,
  Activity,
  CreditCard
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store';

const COLORS = ['#e5383b', '#ca6702', '#0a9396', '#005f73', '#e9d8a6'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function Panel() {
  const { products, sales, fixedCosts: costs, updateFixedCost } = useAppStore();
  const currentMonthIndex = new Date().getMonth();
  const [dashboardMonth, setDashboardMonth] = useState<string>(MONTHS[currentMonthIndex]);
  const [period, setPeriod] = useState('hoy');
  const [showCostsModal, setShowCostsModal] = useState(false);
  
  // Calculate real data from store
  const lowStockItems = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentSales = sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
    
    const salesByProduct = new Map<number, number>();
    recentSales.forEach(sale => {
      sale.items.forEach(item => {
        const pId = item.product.id;
        salesByProduct.set(pId, (salesByProduct.get(pId) || 0) + item.quantity);
      });
    });

    const TE = 15;

    return products.map(p => {
      const soldIn30Days = salesByProduct.get(p.id) || 0;
      const vmd = soldIn30Days / 30;
      
      let ssDays = 7;
      if (soldIn30Days >= 30 && soldIn30Days <= 90) ssDays = 10;
      else if (soldIn30Days > 90) ssDays = 15;
      
      const ss = vmd * ssDays;
      const pp = Math.ceil((vmd * TE) + ss);
      const minStock = pp === 0 ? 5 : pp;
      
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        minStock: minStock
      };
    }).filter(p => p.stock <= p.minStock);
  }, [products, sales]);

  const filteredSales = useMemo(() => {
    const now = new Date();
    return sales.filter(sale => {
      const saleDate = new Date(sale.date);
      if (period === 'hoy') {
        return saleDate.toDateString() === now.toDateString();
      }
      if (period === 'semana') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return saleDate >= sevenDaysAgo;
      }
      if (period === 'mes') {
        return MONTHS[saleDate.getMonth()] === dashboardMonth;
      }
      return true;
    });
  }, [sales, period, dashboardMonth]);

  const totalSalesValue = useMemo(() => {
    return filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  }, [filteredSales]);

  const totalOperativo = useMemo(() => {
    return filteredSales.reduce((sum, sale) => {
      const saleCost = sale.items.reduce((itemSum, item) => {
        const itemCost = item.product.cost || 0;
        return itemSum + (itemCost * item.quantity);
      }, 0);
      return sum + (sale.total - saleCost);
    }, 0);
  }, [filteredSales]);

  const totalItemsSold = useMemo(() => {
    return filteredSales.reduce((sum, sale) => {
      return sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
    }, 0);
  }, [filteredSales]);

  const averageTicket = useMemo(() => {
    if (filteredSales.length === 0) return 0;
    return totalSalesValue / filteredSales.length;
  }, [filteredSales, totalSalesValue]);

  const categoryData = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    sales.forEach(sale => {
      sale.items.forEach(item => {
        categoryCounts[item.product.category] = (categoryCounts[item.product.category] || 0) + item.quantity;
      });
    });
    return Object.entries(categoryCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [sales]);

  const salesDataWeek = useMemo(() => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weekData = days.map(name => ({ name, ventas: 0 }));
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    sales.forEach(sale => {
      const saleDate = new Date(sale.date);
      if (saleDate >= sevenDaysAgo) {
        const dayIndex = saleDate.getDay();
        weekData[dayIndex].ventas += sale.total;
      }
    });
    
    return [...weekData.slice(1), weekData[0]];
  }, [sales]);

  const salesDataMonth = useMemo(() => {
    const monthData = [
      { name: 'Sem 1', ventas: 0 },
      { name: 'Sem 2', ventas: 0 },
      { name: 'Sem 3', ventas: 0 },
      { name: 'Sem 4', ventas: 0 },
      { name: 'Sem 5', ventas: 0 },
    ];
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    sales.forEach(sale => {
      const saleDate = new Date(sale.date);
      if (saleDate >= startOfMonth) {
        const date = saleDate.getDate();
        const weekIndex = Math.min(Math.floor((date - 1) / 7), 4);
        monthData[weekIndex].ventas += sale.total;
      }
    });
    
    return monthData.filter(w => w.ventas > 0 || w.name === 'Sem 1');
  }, [sales]);

  const currentMonthCosts = costs.filter(cost => cost.period.includes(dashboardMonth));
  const totalCosts = currentMonthCosts.reduce((acc, curr) => acc + curr.amount, 0);

  const handlePayCost = (id: number | string) => {
    updateFixedCost(id, { isPaid: true });
  };

  const exportPanelToExcel = () => {
    const resumenData = [
      { Metrica: 'Ventas Totales', Valor: totalSalesValue },
      { Metrica: 'Ticket Promedio', Valor: averageTicket },
      { Metrica: 'Unidades Vendidas', Valor: totalItemsSold },
      { Metrica: 'Resultado Operativo', Valor: totalOperativo },
      { Metrica: 'Costos Mensuales', Valor: totalCosts },
      { Metrica: 'Resultado Neto', Valor: totalOperativo - totalCosts },
    ];
    const wsResumen = XLSX.utils.json_to_sheet(resumenData);
    
    const wsTopCategorias = XLSX.utils.json_to_sheet(categoryData.map(c => ({ Categoría: c.name, 'Unidades Vendidas': c.value })));
    
    const wsStock = XLSX.utils.json_to_sheet(lowStockItems.map(item => ({
      'ID': item.id,
      'Nombre': item.name,
      'SKU': item.sku,
      'Stock Actual': item.stock,
      'Punto de Pedido (PP)': item.minStock
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen General");
    XLSX.utils.book_append_sheet(wb, wsTopCategorias, "Top Categorías");
    XLSX.utils.book_append_sheet(wb, wsStock, "Stock Crítico");
    
    XLSX.writeFile(wb, `Panel_Control_${dashboardMonth}_${period}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">Panel de Control</h2>
          <button 
            onClick={exportPanelToExcel}
            className="hidden sm:flex items-center font-medium text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Descargar Reporte XLS
          </button>
        </div>
        <div className="flex items-center gap-3">
          {period === 'mes' && (
            <select
              value={dashboardMonth}
              onChange={(e) => setDashboardMonth(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 shadow-sm"
            >
              {MONTHS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-1 flex shadow-sm">
            <button 
              onClick={() => setPeriod('hoy')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${period === 'hoy' ? 'bg-[#e5383b] text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Hoy
            </button>
            <button 
              onClick={() => setPeriod('semana')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${period === 'semana' ? 'bg-[#e5383b] text-white' : 'text-slate-400 hover:text-white'}`}
            >
              7 Días
            </button>
            <button 
              onClick={() => setPeriod('mes')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${period === 'mes' ? 'bg-[#e5383b] text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Mensual
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Ventas Totales</h3>
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <div>
            <p className="mt-4 text-3xl font-bold text-white tracking-tight">${totalSalesValue.toLocaleString('es-AR')}</p>
            <p className="mt-1 text-xs text-slate-500 font-medium">Facturación bruta</p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Ticket</h3>
            <div className="p-2 rounded-lg bg-orange-500/10">
              <CreditCard className="h-5 w-5 text-orange-500" />
            </div>
          </div>
          <div>
            <p className="mt-4 text-3xl font-bold text-white tracking-tight">${averageTicket.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
            <p className="mt-1 text-xs text-slate-500 font-medium">Promedio c/venta</p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Unidades</h3>
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Package className="h-5 w-5 text-blue-500" />
            </div>
          </div>
          <div>
            <p className="mt-4 text-3xl font-bold text-white tracking-tight">{totalItemsSold}</p>
            <p className="mt-1 text-xs text-slate-500 font-medium">Despachadas</p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Operativo</h3>
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <div>
            <p className="mt-4 text-3xl font-bold text-white tracking-tight">${totalOperativo.toLocaleString('es-AR')}</p>
            <p className="mt-1 text-xs text-slate-500 font-medium">Ventas - Costo prod.</p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => setShowCostsModal(true)}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Costos Mensuales</h3>
            <div className="p-2 rounded-lg bg-rose-500/10">
              <Wallet className="h-5 w-5 text-rose-500" />
            </div>
          </div>
          <div>
            <p className="mt-4 text-3xl font-bold text-white tracking-tight">${totalCosts.toLocaleString('es-AR')}</p>
            <p className="mt-1 text-xs text-slate-500 font-medium">{dashboardMonth}</p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Resultado Neto</h3>
            <div className="p-2 rounded-lg bg-[#e5383b]/10">
              <DollarSign className="h-5 w-5 text-[#e5383b]" />
            </div>
          </div>
          <div>
            <p className="mt-4 text-3xl font-bold text-white tracking-tight">${(totalOperativo - totalCosts).toLocaleString('es-AR')}</p>
            <p className="mt-1 text-xs text-slate-500 font-medium">Op - Costos Fijos</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart: Ventas Totales */}
        <div className={`bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm ${period !== 'hoy' ? 'lg:col-span-2' : 'hidden'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-white tracking-tight">Evolución de Ventas</h3>
            <Activity className="h-5 w-5 text-slate-500" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={period === 'mes' ? salesDataMonth : salesDataWeek} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                  tickFormatter={(value) => `$${value/1000}k`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontWeight: 500 }}
                  formatter={(value: number) => [`$${value.toLocaleString('es-AR')}`, 'Ventas']}
                />
                <Line 
                  type="monotone" 
                  dataKey="ventas" 
                  stroke="#e5383b" 
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#e5383b', strokeWidth: 2, stroke: '#1e293b' }}
                  activeDot={{ r: 6, fill: '#e5383b', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: Revenue by Category */}
        <div className={`bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm ${period === 'hoy' ? 'lg:col-span-2' : 'col-span-1'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-white tracking-tight">Top Categorías</h3>
            <ShoppingCart className="h-5 w-5 text-slate-500" />
          </div>
          <div className="h-72 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} 
                  width={80}
                />
                <Tooltip 
                  cursor={{ fill: '#1e293b' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontWeight: 500 }}
                  formatter={(value: number) => [`${value} unidades`, 'Vendidas']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock List */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm lg:col-span-3">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-bold text-white tracking-tight">Stock Crítico (Bajo Mínimo)</h3>
          </div>
          {lowStockItems.length === 0 ? (
            <div className="py-8 text-center bg-slate-950/30 rounded-xl border border-slate-800/50">
              <p className="text-emerald-500 font-medium">Todo el stock está en niveles óptimos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-rose-950/20 rounded-xl border border-rose-900/30">
                  <div>
                    <p className="text-sm font-bold text-white">{item.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">SKU: {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-rose-500 leading-none">{item.stock}</p>
                    <p className="text-[10px] uppercase font-bold text-rose-500/70 mt-1">unidades</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Costos Fijos */}
      {showCostsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white tracking-tight">Gestionar Costos Fijos</h3>
              <button onClick={() => setShowCostsModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto">
              {currentMonthCosts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400 font-medium">No hay costos fijos registrados este mes.</p>
                </div>
              ) : (
                Array.from(new Set(currentMonthCosts.map(c => c.category))).map(category => (
                  <div key={category}>
                    <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">{category}</h4>
                    <div className="space-y-2">
                      {currentMonthCosts.filter(c => c.category === category).map(cost => (
                        <div key={cost.id} className="flex items-center justify-between bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                        <div>
                          <p className="text-sm font-bold text-white">{cost.concept}</p>
                          <p className="text-xs font-medium mt-0.5 text-slate-400">${cost.amount.toLocaleString('es-AR')}</p>
                        </div>
                        <button
                          onClick={() => handlePayCost(cost.id)}
                          disabled={cost.isPaid}
                          className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm ${
                            cost.isPaid 
                              ? 'bg-emerald-500/10 text-emerald-500 cursor-not-allowed border border-emerald-500/20' 
                              : 'bg-[#e5383b] hover:bg-rose-600 text-white'
                          }`}
                        >
                          {cost.isPaid ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                              Pagado
                            </>
                          ) : (
                            'Pagar'
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
