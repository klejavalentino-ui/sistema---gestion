import { useState, FormEvent, ChangeEvent } from 'react';
import { Plus, Receipt, Trash2, Calendar, Zap, Users, Landmark, Wrench, CreditCard, MoreHorizontal, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const CATEGORIES = ['Servicios', 'Personal', 'Impuestos', 'Mantenimiento', 'Deuda', 'Otros'];

const SUBCATEGORIES: Record<string, string[]> = {
  Servicios: ['Luz', 'Agua', 'Gas', 'Internet', 'Teléfono', 'Electricidad', 'Alquiler'],
  Personal: ['Sueldos', 'Diseñador'],
  Impuestos: ['Monotributo', 'Ingresos Brutos', 'Tasa Municipal', 'Contador'],
  Mantenimiento: ['Limpieza', 'Reparaciones', 'Art. Oficina'],
  Deuda: ['Préstamo', 'Tarjeta de Crédito', 'Plan de Pago'],
  Otros: ['Varios', 'Seguro', 'Suscripciones']
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const initialCosts = [
  { id: 1, concept: 'Luz', period: 'Febrero', category: 'Servicios', amount: 45000 },
  { id: 2, concept: 'Sueldo Empleada', period: '1ª Quincena Febrero', category: 'Personal', amount: 180000 },
  { id: 3, concept: 'Internet', period: 'Marzo', category: 'Servicios', amount: 12000 },
];

import { useAppStore } from '../store';

export default function FixedCosts() {
  const { fixedCosts: costs, addFixedCost, deleteFixedCost } = useAppStore();
  
  // Form State
  const [category, setCategory] = useState('Servicios');
  const [concept, setConcept] = useState('Luz');
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [viewMonth, setViewMonth] = useState(MONTHS[new Date().getMonth()]);
  const [periodType, setPeriodType] = useState('MENSUAL');
  const [quincena, setQuincena] = useState('1ª');
  const [semana, setSemana] = useState('1');
  const [amount, setAmount] = useState('');

  const currentMonthCosts = costs.filter(cost => cost.period.includes(viewMonth));

  const totalCosts = currentMonthCosts.reduce((sum, cost) => sum + cost.amount, 0);

  // Calculate distribution for the chart
  const categoryTotals: Record<string, number> = currentMonthCosts.reduce((acc: Record<string, number>, cost) => {
    acc[cost.category] = (acc[cost.category] || 0) + cost.amount;
    return acc;
  }, {});

  const topCategory = (Object.entries(categoryTotals) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Servicios';

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    if (!rawValue) {
      setAmount('');
      return;
    }
    const formatted = new Intl.NumberFormat('es-AR').format(parseInt(rawValue, 10));
    setAmount(formatted);
  };

  const handleAddExpense = (e: FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount.replace(/\./g, ''));
    if (!numericAmount || !concept) return;

    let finalPeriod = month;
    if (periodType === 'QUINCENAL') finalPeriod = `${quincena} Quincena ${month}`;
    if (periodType === 'SEMANAL') finalPeriod = `Semana ${semana} ${month}`;

    const newExpense = {
      concept,
      period: finalPeriod,
      category,
      amount: numericAmount
    };

    addFixedCost(newExpense);
    setAmount('');
  };

  const handleDelete = (id: number | string) => {
    deleteFixedCost(id);
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Servicios': return <Zap className="h-4 w-4" />;
      case 'Personal': return <Users className="h-4 w-4" />;
      case 'Impuestos': return <Landmark className="h-4 w-4" />;
      case 'Mantenimiento': return <Wrench className="h-4 w-4" />;
      case 'Deuda': return <CreditCard className="h-4 w-4" />;
      default: return <MoreHorizontal className="h-4 w-4" />;
    }
  };

  // SVG Donut Chart calculations
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  const exportToExcel = () => {
    const wsData = currentMonthCosts.map(cost => ({
      Concepto: cost.concept,
      Periodo: cost.period,
      Categoria: cost.category,
      Monto: cost.amount
    }));
    
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos Mensuales");
    
    XLSX.writeFile(wb, `Gastos_Mensuales_${viewMonth}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Gastos Mensuales</h2>
          <p className="text-slate-400 text-sm mt-1">Administración de gastos operativos y pagos fijos.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportToExcel}
            className="flex items-center font-medium text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm h-full"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Exportar XLS
          </button>
          <select 
            value={viewMonth}
            onChange={(e) => setViewMonth(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] p-2"
          >
            {MONTHS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Gastos Mensuales ({viewMonth})</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">
                $ {totalCosts.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm h-fit">
          <div className="flex items-center gap-2 mb-6">
            <Plus className="h-5 w-5 text-[#e5383b]" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Registrar Gasto</h3>
          </div>

          <form onSubmit={handleAddExpense} className="space-y-6">
            {/* Categoría */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Categoría</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCategory(cat);
                      setConcept(SUBCATEGORIES[cat][0]);
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm font-medium transition-colors ${
                      category === cat 
                        ? 'border-[#e5383b] bg-rose-50 dark:bg-rose-500/10 text-[#e5383b]' 
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 ${category === cat ? 'border-[#e5383b] bg-[#e5383b]' : 'border-slate-300 dark:border-slate-600 bg-transparent'}`} />
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Seleccionar Servicio/Concepto */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                Seleccionar {category === 'Personal' ? 'Concepto' : 'Servicio'}
              </label>
              <div className="flex flex-wrap gap-2">
                {SUBCATEGORIES[category].map(sub => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setConcept(sub)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      concept === sub
                        ? 'border-slate-800 dark:border-slate-200 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            {/* Período de Pago */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Período de Pago</span>
              </div>
              
              <select 
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 font-medium"
              >
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>

              <div className="grid grid-cols-3 gap-2">
                {['MENSUAL', 'QUINCENAL', 'SEMANAL'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPeriodType(type)}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-colors ${
                      periodType === type
                        ? 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-[#e5383b]'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {periodType === 'QUINCENAL' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['1ª', '2ª'].map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuincena(q)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                        quincena === q
                          ? 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-[#e5383b]'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {q} Quincena
                    </button>
                  ))}
                </div>
              )}

              {periodType === 'SEMANAL' && (
                <div className="grid grid-cols-5 gap-1 mt-2">
                  {['1', '2', '3', '4', '5'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSemana(s)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                        semana === s
                          ? 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-[#e5383b]'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Sem {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="text-center pt-2">
                <span className="text-sm font-bold text-[#e5383b]">
                  {periodType === 'MENSUAL' ? month : periodType === 'QUINCENAL' ? `${quincena} Quincena ${month}` : `Semana ${semana} ${month}`}
                </span>
              </div>
            </div>

            {/* Monto */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Monto ($)</label>
              <input 
                type="text" 
                inputMode="numeric"
                required
                value={amount}
                onChange={handleAmountChange}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-lg font-bold rounded-xl focus:ring-[#e5383b] focus:border-[#e5383b] block p-3 placeholder-slate-400 dark:placeholder-slate-600" 
                placeholder="0"
              />
            </div>

            <button 
              type="submit"
              className="w-full py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors font-bold text-sm"
            >
              Agregar Gasto
            </button>
          </form>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Chart Box */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm flex flex-col sm:flex-row items-center justify-center gap-12">
            <div className="relative w-48 h-48">
              <svg viewBox="0 0 160 160" className="w-full h-full transform -rotate-90">
                {totalCosts === 0 ? (
                  <circle
                    cx="80" cy="80" r={radius}
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="20"
                    className="text-slate-100 dark:text-slate-800"
                  />
                ) : (
                  (Object.entries(categoryTotals) as [string, number][]).map(([cat, amt], index) => {
                    const percentage = amt / totalCosts;
                    const strokeDasharray = `${percentage * circumference} ${circumference}`;
                    const strokeDashoffset = -currentOffset;
                    currentOffset += percentage * circumference;
                    
                    const isTop = cat === topCategory;
                    const color = isTop ? '#e5383b' : `hsl(215, 25%, ${40 + index * 10}%)`;

                    return (
                      <circle
                        key={cat}
                        cx="80" cy="80" r={radius}
                        fill="transparent"
                        stroke={color}
                        strokeWidth="20"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-500 ease-out"
                      />
                    );
                  })
                )}
              </svg>
              {/* Inner white circle to make it a donut */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-full"></div>
              </div>
            </div>

            <div className="max-w-xs text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-[#e5383b]"></div>
                <span className="text-[#e5383b] font-bold">{topCategory}</span>
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Distribución</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                La mayor parte de tus costos fijos provienen de <strong className="text-slate-700 dark:text-slate-300">{topCategory}</strong>.
              </p>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-slate-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Historial de Gastos</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Concepto</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Categoría</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Monto</th>
                    <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {costs.map((cost) => (
                    <tr key={cost.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{cost.concept}</div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 w-fit px-2 py-0.5 rounded-md">
                          <Calendar className="h-3 w-3" />
                          {cost.period}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 w-fit px-2.5 py-1 rounded-lg">
                          {getCategoryIcon(cost.category)}
                          {cost.category}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-[#e5383b]">
                          - $ {cost.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => handleDelete(cost.id)}
                          className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-500 transition-colors p-1"
                        >
                          <Trash2 className="h-4 w-4 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {costs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                        No hay gastos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
