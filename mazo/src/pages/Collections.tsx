import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { Coins, Wallet, Search, Plus, TrendingUp, X, Download, Phone, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function Collections() {
  const { currentAccounts, addCurrentAccount, addAccountTransaction, addCashTransaction } = useAppStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountPhone, setNewAccountPhone] = useState('');
  const [newAccountAddress, setNewAccountAddress] = useState('');
  
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState('');
  const [editAccountPhone, setEditAccountPhone] = useState('');
  const [editAccountAddress, setEditAccountAddress] = useState('');
  
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isQuickPayModalOpen, setIsQuickPayModalOpen] = useState(false);
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
    return currentAccounts
      .filter(acc => acc.type === 'cliente' && acc.entityName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [currentAccounts, searchTerm]);

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName) return;
    addCurrentAccount({ 
      entityName: newAccountName, 
      type: 'cliente',
      phone: newAccountPhone,
      address: newAccountAddress
    });
    setNewAccountName('');
    setNewAccountPhone('');
    setNewAccountAddress('');
    setIsNewAccountModalOpen(false);
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = getNumericAmount(rawTxAmount);
    const numericPayment = getNumericAmount(rawTxPayment);
    if (!selectedAccountId || (numericAmount === 0 && numericPayment === 0)) return;

    let targetAccountId = selectedAccountId;
    let description = txDesc || (numericPayment > 0 ? 'Cobro de Saldo' : 'Deuda');

    addAccountTransaction(targetAccountId, {
      description: description || 'Movimiento',
      amount: numericAmount,
      payment: numericPayment,
    });

    if (numericPayment > 0) {
      const entityName = currentAccounts.find(a => a.id === targetAccountId)?.entityName || 'Cliente';
      addCashTransaction({
        description: `Cobro a C.C. - ${entityName}`,
        type: 'income',
        amount: numericPayment
      });
    }

    setTxDesc('');
    setRawTxAmount('');
    setRawTxPayment('');
    setIsTransactionModalOpen(false);
    setSelectedAccountId(null);
  };

  const handleQuickPay = (e: React.FormEvent) => {
    e.preventDefault();
    const numericPayment = getNumericAmount(rawTxPayment);
    if (!selectedAccountId || numericPayment === 0) return;

    addAccountTransaction(selectedAccountId, {
      description: 'Cobro de Saldo',
      amount: 0,
      payment: numericPayment,
    });

    const entityName = currentAccounts.find(a => a.id === selectedAccountId)?.entityName || 'Cliente';
    addCashTransaction({
      description: `Cobro a C.C. - ${entityName}`,
      type: 'income',
      amount: numericPayment
    });

    setRawTxPayment('');
    setIsQuickPayModalOpen(false);
    setSelectedAccountId(null);
  };

  const totalReceivables = useMemo(() => {
    return currentAccounts
      .filter(acc => acc.type === 'cliente')
      .reduce((sum, acc) => sum + calculateBalance(acc.transactions), 0);
  }, [currentAccounts]);

  const exportToExcel = () => {
    const data: any[] = [];
    displayAccounts.forEach(acc => {
      const balance = calculateBalance(acc.transactions);
      data.push({
        Entidad: acc.entityName,
        Tipo: 'Cliente',
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cobranzas");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `cobranzas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Coins className="h-6 w-6 text-[#e5383b]" />
            Cobranzas
          </h2>
          <p className="text-sm text-slate-400 mt-1">Gestión de saldos a cobrar de clientes.</p>
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
            onClick={() => setIsNewAccountModalOpen(true)}
            className="bg-[#e5383b] hover:bg-[#ba1826] text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="h-5 w-5" />
            Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col relative group">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">A Cobrar (Clientes)</h3>
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <p className="mt-4 text-4xl font-bold text-white">${totalReceivables.toLocaleString('es-AR')}</p>
          <div className="absolute inset-x-0 bottom-0 h-1 transition-colors bg-emerald-500" />
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
              No hay clientes registrados con cuenta corriente.
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
                      <p className={`text-xl font-bold ${balance > 0 ? 'text-emerald-500' : 'text-slate-300'}`}>
                        ${balance.toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm text-left border border-slate-800 rounded-lg overflow-hidden">
                      <thead className="text-xs text-slate-400 uppercase bg-slate-950/50">
                        <tr>
                          <th className="px-4 py-3 font-medium">Fecha</th>
                          <th className="px-4 py-3 font-medium">Concepto</th>
                          <th className="px-4 py-3 font-medium text-right">Deuda</th>
                          <th className="px-4 py-3 font-medium text-right">Cobro</th>
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
                          setRawTxPayment(balance.toString());
                          setIsQuickPayModalOpen(true);
                        }}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                      >
                        Cobrar Deuda
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedAccountId(account.id);
                        setIsTransactionModalOpen(true);
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors border border-slate-700 shadow-sm"
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
              <h3 className="text-lg font-semibold text-white">Editar Cliente</h3>
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

      {isNewAccountModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Nuevo Cliente</h3>
              <button onClick={() => setIsNewAccountModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateAccount} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Nombre o Razón Social</label>
                <input
                  type="text"
                  required
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Teléfono / Celular (Opcional)</label>
                <input
                  type="text"
                  value={newAccountPhone}
                  onChange={(e) => setNewAccountPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  placeholder="Ej. +54 9 11 1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Dirección (Opcional)</label>
                <input
                  type="text"
                  value={newAccountAddress}
                  onChange={(e) => setNewAccountAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  placeholder="Ej. Av. Siempre Viva 123"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-[#e5383b] hover:bg-[#ba1826] text-white rounded-lg transition-colors"
                >
                  Crear Cuenta
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
              }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddTransaction} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Concepto / Venta</label>
                <input
                  type="text"
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder="ej: Venta de mercadería (Opcional)"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Deuda Generada ($)</label>
                  <input
                    type="text"
                    value={rawTxAmount}
                    onChange={(e) => setRawTxAmount(formatAmount(e.target.value))}
                    placeholder="$ 0.00"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Monto Cobrado ($)</label>
                  <input
                    type="text"
                    value={rawTxPayment}
                    onChange={(e) => setRawTxPayment(formatAmount(e.target.value))}
                    placeholder="$ 0.00"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                  />
                  <p className="text-xs text-slate-500 mt-1">*Ingreso a caja</p>
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

      {isQuickPayModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-emerald-500/10">
              <h3 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Cobrar Deuda
              </h3>
              <button onClick={() => {
                setIsQuickPayModalOpen(false);
                setRawTxPayment('');
              }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleQuickPay} className="p-5 space-y-4">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
                  <Coins className="h-8 w-8 text-emerald-500" />
                </div>
                <p className="text-slate-400 text-sm">Estás a punto de cobrar una deuda de cobranzas. Por defecto se completará el total de la deuda para cancelarla.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Ingresa el monto cobrado ($)</label>
                <input
                  type="text"
                  value={rawTxPayment}
                  onChange={(e) => setRawTxPayment(formatAmount(e.target.value))}
                  placeholder="$ 0.00"
                  className="w-full bg-slate-950 border border-emerald-500/50 text-white text-xl text-center rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-4 font-bold"
                  autoFocus
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsQuickPayModalOpen(false)}
                  className="flex-1 px-4 py-3 text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
                >
                  Cobrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
