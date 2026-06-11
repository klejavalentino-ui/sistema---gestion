import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { CreditCard, Search, Plus, TrendingDown, TrendingUp, X, Download, Phone, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function SupplierDebt() {
  const { currentAccounts, suppliers, products, addCurrentAccount, addAccountTransaction, addCashTransaction } = useAppStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState('');
  const [editAccountPhone, setEditAccountPhone] = useState('');
  const [editAccountAddress, setEditAccountAddress] = useState('');
  
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const handleEditAccount = (account: any) => {
    setEditingAccountId(account.id);
    setEditAccountName(account.entityName);
    setEditAccountPhone(account.phone || '');
    setEditAccountAddress(account.address || '');
    setIsEditingAccount(true);
  };

  const handleSaveEditAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccountId || !editAccountName) return;
    useAppStore.getState().updateCurrentAccount(editingAccountId, {
      entityName: editAccountName,
      phone: editAccountPhone,
      address: editAccountAddress
    });
    setIsEditingAccount(false);
    setEditingAccountId(null);
  };
  
  // Transaction Form fields
  const [txProductId, setTxProductId] = useState<string>('');
  const [txDesc, setTxDesc] = useState('');
  const [rawTxAmount, setRawTxAmount] = useState<string>(''); // Deuda
  const [rawTxPayment, setRawTxPayment] = useState<string>(''); // Pago

  // Handle formatted numeric input
  const formatAmount = (val: string) => {
    let rawValue = val.replace(/[^0-9]/g, '');
    if (rawValue) {
      return '$' + Number(rawValue).toLocaleString('es-AR');
    }
    return '';
  };

  const getNumericAmount = (formatted: string) => {
    return Number(formatted.replace(/[^0-9]/g, ''));
  };

  const calculateBalance = (transactions: any[]) => {
    return transactions.reduce((acc, tx) => acc + (tx.amount || 0) - (tx.payment || 0), 0);
  };

  // Build the list of accounts
  const displayAccounts = useMemo(() => {
    return suppliers.map(supplier => {
      // Find if any transactions exist for this supplier in currentAccounts
      const acc = currentAccounts.find(a => a.supplierId === supplier.id);
      return {
        id: acc ? acc.id : `new-sup-${supplier.id}`, // temp ID if not initialized
        supplierId: supplier.id,
        entityName: supplier.name,
        phone: supplier.phone,
        type: 'proveedor',
        transactions: acc ? acc.transactions : []
      };
    }).filter(acc => acc.entityName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [suppliers, currentAccounts, searchTerm]);


  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = getNumericAmount(rawTxAmount);
    const numericPayment = getNumericAmount(rawTxPayment);
    if (!selectedAccountId || (numericAmount === 0 && numericPayment === 0)) return;

    let targetAccountId = selectedAccountId;
    let description = '';

    const selectedProd = products.find(p => p.baseSku === txProductId);
    if (selectedProd) {
      description = selectedProd.name;
    } else {
      description = numericAmount > 0 ? 'Otro/Variedad' : 'Pago de Saldo';
    }

    // if targetAccountId is starts with new-sup, we need to create the account for the supplier first
    if (targetAccountId.startsWith('new-sup-')) {
      const supId = Number(targetAccountId.split('-')[2]);
      const supplier = suppliers.find(s => s.id === supId);
      if (supplier) {
        const newId = Date.now().toString();
        targetAccountId = newId;
        useAppStore.setState(state => ({
          currentAccounts: [{
            id: newId,
            entityName: supplier.name,
            supplierId: supId,
            type: 'proveedor',
            transactions: []
          }, ...state.currentAccounts]
        }));
      }
    }

    addAccountTransaction(targetAccountId, {
      description: description || 'Movimiento',
      amount: numericAmount,
      payment: numericPayment,
    });

    if (numericPayment > 0) {
      const entityName = currentAccounts.find(a => a.id === targetAccountId)?.entityName || suppliers.find(s => s.id === Number(targetAccountId.split('-')[2]))?.name || 'Entidad';
      addCashTransaction({
        description: `Pago a C.C. - ${entityName}`,
        type: 'expense',
        amount: numericPayment
      });
    }

    setTxProductId('');
    setTxDesc('');
    setRawTxAmount('');
    setRawTxPayment('');
    setIsTransactionModalOpen(false);
    setSelectedAccountId(null);
  };

  const totalOwed = useMemo(() => {
    return suppliers.reduce((sum, sup) => {
      const acc = currentAccounts.find(a => a.supplierId === sup.id);
      return sum + (acc ? calculateBalance(acc.transactions) : 0);
    }, 0);
  }, [suppliers, currentAccounts]);

  const exportToExcel = () => {
    const data: any[] = [];
    displayAccounts.forEach(acc => {
      const balance = calculateBalance(acc.transactions);
      data.push({
        Entidad: acc.entityName,
        Tipo: 'Proveedor',
        Contacto: acc.phone || 'N/A',
        Saldo: balance
      });
      // Add transactions details
      const txs = [...acc.transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      txs.forEach(tx => {
         data.push({
           Entidad: `  -> ${new Date(tx.date).toLocaleDateString()}`,
           Tipo: tx.description,
           Contacto: '',
           Saldo: (tx.amount || 0) > 0 ? `+${tx.amount}` : `-${tx.payment}`
         });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Deuda_Proveedores");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `deuda_proveedores_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-[#e5383b]" />
            Cuentas a Pagar
          </h2>
          <p className="text-sm text-slate-400 mt-1">Gestión de saldos con proveedores.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm border border-slate-700"
          >
            <Download className="h-5 w-5" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col relative group">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Deuda Total (Proveedores)</h3>
            <div className="p-2 rounded-lg bg-orange-500/20">
              <TrendingDown className="h-5 w-5 text-orange-500" />
            </div>
          </div>
          <p className="mt-4 text-4xl font-bold text-white">${totalOwed.toLocaleString('es-AR')}</p>
          <div className="absolute inset-x-0 bottom-0 h-1 transition-colors bg-orange-500" />
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block pl-10 p-2"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-800/50">
          {displayAccounts.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No hay cuentas corrientes registradas en esta sección (agregar proveedores desde la pestaña Proveedores).
            </div>
          ) : (
            displayAccounts.map(account => {
              const balance = calculateBalance(account.transactions || []);
              const txs = [...(account.transactions || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              
              return (
                <div key={account.id} className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{account.entityName}</h3>
                        <button onClick={() => handleEditAccount(account)} className="text-slate-400 hover:text-white transition-colors">
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                      {(account.phone || account.address) && (
                         <div className="flex flex-col text-sm text-slate-400 mt-1 gap-1">
                          {account.phone && (
                            <div className="flex items-center">
                              <Phone className="h-3 w-3 mr-1.5" />
                              {account.phone}
                            </div>
                          )}
                          {account.address && (
                            <div className="flex items-center">
                              <span className="text-xs mr-1.5">📍</span>
                              {account.address}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-400 font-medium tracking-wide uppercase">Saldo Total</p>
                      <p className={`text-xl font-bold ${balance > 0 ? 'text-orange-500' : 'text-slate-300'}`}>
                        ${balance.toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm text-left border border-slate-800 rounded-lg overflow-hidden">
                      <thead className="text-xs text-slate-400 uppercase bg-slate-950/50">
                        <tr>
                          <th className="px-4 py-3 font-medium">Fecha</th>
                          <th className="px-4 py-3 font-medium">Producto / Concepto</th>
                          <th className="px-4 py-3 font-medium text-right">Monto</th>
                          <th className="px-4 py-3 font-medium text-right">Pago</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {txs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-4 text-center text-slate-500 text-xs">
                              Sin movimientos
                            </td>
                          </tr>
                        ) : (
                          txs.map(tx => (
                            <tr key={tx.id} className="hover:bg-slate-800/30">
                              <td className="px-4 py-3 text-slate-300">{new Date(tx.date).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-slate-300">{tx.description}</td>
                              <td className="px-4 py-3 text-right font-medium text-slate-300 hover:text-white transition-colors">
                                {tx.amount > 0 ? `$${tx.amount.toLocaleString('es-AR')}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-emerald-400">
                                {tx.payment > 0 ? `$${tx.payment.toLocaleString('es-AR')}` : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-4 flex justify-end gap-3">
                    {balance > 0 && (
                      <button
                        onClick={() => {
                          setSelectedAccountId(account.id);
                          setTxDesc('Pago de Saldo');
                          setRawTxPayment(balance.toString());
                          setIsTransactionModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-sm font-medium rounded-lg transition-colors border border-emerald-500/30 font-bold"
                      >
                        Saldar Deuda
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedAccountId(account.id);
                        setIsTransactionModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors border border-slate-700"
                    >
                      Añadir Movimiento
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isEditingAccount && editingAccountId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Editar Proveedor</h3>
              <button onClick={() => { setIsEditingAccount(false); setEditingAccountId(null); }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEditAccount} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Nombre o Razón Social</label>
                <input
                  type="text"
                  required
                  value={editAccountName}
                  onChange={(e) => setEditAccountName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Teléfono / Celular (Opcional)</label>
                <input
                  type="text"
                  value={editAccountPhone}
                  onChange={(e) => setEditAccountPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  placeholder="Ej. +54 9 11 1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Dirección (Opcional)</label>
                <input
                  type="text"
                  value={editAccountAddress}
                  onChange={(e) => setEditAccountAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  placeholder="Ej. Av. Siempre Viva 123"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsEditingAccount(false); setEditingAccountId(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-[#e5383b] hover:bg-[#ba1826] text-white rounded-lg transition-colors"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTransactionModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Nuevo Movimiento</h3>
              <button onClick={() => {
                setIsTransactionModalOpen(false);
                setRawTxAmount('');
                setRawTxPayment('');
                setTxDesc('');
                setTxProductId('');
              }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddTransaction} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Producto Entrante</label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  value={txProductId}
                  onChange={(e) => setTxProductId(e.target.value)}
                >
                   <option value="">Selecciona un producto / otro...</option>
                   {products.map(p => (
                     <option key={p.baseSku} value={p.baseSku}>{p.name}</option>
                   ))}
                   <option value="otro">Otro (varios, accesorios, etc)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Monto Factura/Deuda ($)</label>
                  <input
                    type="text"
                    value={rawTxAmount}
                    onChange={(e) => setRawTxAmount(formatAmount(e.target.value))}
                    placeholder="$ 0.00"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Monto Pagado ($)</label>
                  <input
                    type="text"
                    value={rawTxPayment}
                    onChange={(e) => setRawTxPayment(formatAmount(e.target.value))}
                    placeholder="$ 0.00"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                  />
                  <p className="text-xs text-slate-500 mt-1">*Egreso de caja</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsTransactionModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-[#e5383b] hover:bg-[#ba1826] text-white rounded-lg transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
