import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { Banknote, Plus, ArrowUpRight, ArrowDownRight, Search, Download, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function Cash() {
  const { cashTransactions, addCashTransaction } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [txDesc, setTxDesc] = useState('');
  const [rawTxAmount, setRawTxAmount] = useState<string>('');

  const currentBalance = useMemo(() => {
    return cashTransactions.reduce((acc, tx) => {
      return tx.type === 'income' ? acc + tx.amount : acc - tx.amount;
    }, 0);
  }, [cashTransactions]);

  const filteredTransactions = useMemo(() => {
    return cashTransactions.filter(tx =>
      tx.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [cashTransactions, searchTerm]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value.replace(/[^0-9]/g, '');
    if (rawValue) {
      setRawTxAmount('$' + Number(rawValue).toLocaleString('es-AR'));
    } else {
      setRawTxAmount('');
    }
  };

  const getNumericAmount = (formatted: string) => {
    return Number(formatted.replace(/[^0-9]/g, ''));
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = getNumericAmount(rawTxAmount);
    if (!txDesc || !numericAmount) return;

    addCashTransaction({
      description: txDesc,
      type: txType,
      amount: numericAmount
    });

    setTxDesc('');
    setRawTxAmount('');
    setIsTxModalOpen(false);
  };

  const exportToExcel = () => {
    const data = filteredTransactions.map(tx => ({
      'Fecha': new Date(tx.date).toLocaleDateString(),
      'Concepto': tx.description,
      'Tipo': tx.type === 'income' ? 'Ingreso' : 'Egreso',
      'Monto': tx.amount,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Caja");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `caja_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Banknote className="h-6 w-6 text-emerald-500" />
            Caja
          </h2>
          <p className="text-sm text-slate-400 mt-1">Gestión de ingresos y egresos en efectivo.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm border border-slate-700"
          >
            <Download className="h-5 w-5" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
          <button
            onClick={() => setIsTxModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="h-5 w-5" />
            Nuevo Movimiento
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col relative w-full md:w-1/3">
        <h3 className="text-sm font-medium text-slate-400">Saldo en Caja</h3>
        <p className={`mt-4 text-4xl font-bold ${currentBalance >= 0 ? 'text-white' : 'text-rose-500'}`}>
          ${currentBalance.toLocaleString('es-AR')}
        </p>
        <div className={`absolute inset-x-0 bottom-0 h-1 transition-colors ${currentBalance >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Buscar movimiento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block pl-10 p-2"
            />
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-slate-400 uppercase bg-slate-950/50">
              <tr>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Fecha</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Concepto</th>
                <th className="px-6 py-4 font-medium text-right border-b border-slate-800">Ingreso</th>
                <th className="px-6 py-4 font-medium text-right border-b border-slate-800">Egreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No hay movimientos registrados
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">
                      {tx.description}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {tx.type === 'income' ? (
                        <span className="text-emerald-400 flex justify-end gap-1 font-semibold">
                          + ${tx.amount.toLocaleString('es-AR')}
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {tx.type === 'expense' ? (
                        <span className="text-rose-400 flex justify-end gap-1 font-semibold">
                          - ${tx.amount.toLocaleString('es-AR')}
                          <ArrowDownRight className="h-4 w-4" />
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isTxModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Nuevo Movimiento de Caja</h3>
              <button onClick={() => setIsTxModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddTransaction} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType('income')}
                    className={`py-2 px-4 text-sm font-medium rounded-lg border flex justify-center items-center gap-2 ${txType === 'income' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    Ingreso <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('expense')}
                    className={`py-2 px-4 text-sm font-medium rounded-lg border flex justify-center items-center gap-2 ${txType === 'expense' ? 'bg-rose-500/20 border-rose-500 text-rose-500' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    Egreso <ArrowDownRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Concepto</label>
                <input
                  type="text"
                  required
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder={txType === 'income' ? 'ej: Venta remera' : 'ej: Pago envíos'}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Monto ($)</label>
                <input
                  type="text"
                  required
                  value={rawTxAmount}
                  onChange={handleAmountChange}
                  placeholder="$ 0.00"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                    txType === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
