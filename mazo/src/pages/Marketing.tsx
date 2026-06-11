import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { Share2, Plus, X, Users, Edit, Trash2, Instagram, Phone, MapPin } from 'lucide-react';

export default function Marketing() {
  const { products, marketingExpenses, influencers, addMarketingExpense, addInfluencer, updateInfluencer, deleteInfluencer, addCashTransaction, addFixedCost } = useAppStore();
  
  const [activeTab, setActiveTab] = useState<'entregas' | 'influencers' | 'ads'>('entregas');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);
  const [isInfluencerModalOpen, setIsInfluencerModalOpen] = useState(false);
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null);

  // Entrega form
  const [influencerFormId, setInfluencerFormId] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');

  // Ad form
  const [adPlatform, setAdPlatform] = useState('');
  const [adCampaign, setAdCampaign] = useState('');
  const [adCost, setAdCost] = useState<string>('');
  const [adDate, setAdDate] = useState<string>('');

  // Influencer form
  const [infName, setInfName] = useState('');
  const [infInsta, setInfInsta] = useState('');
  const [infPhone, setInfPhone] = useState('');
  const [infAddress, setInfAddress] = useState('');
  const [infNotes, setInfNotes] = useState('');

  const availableProducts = products.filter(p => p.stock > 0);

  const influencerExpenses = useMemo(() => {
    return marketingExpenses.filter(e => e.type !== 'ad');
  }, [marketingExpenses]);

  const adExpenses = useMemo(() => {
    return marketingExpenses.filter(e => e.type === 'ad');
  }, [marketingExpenses]);

  const totalMarketingCost = useMemo(() => {
    return influencerExpenses.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
  }, [influencerExpenses]);

  const costsByInfluencer = useMemo(() => {
    const map = new Map<string, { total: number; qty: number }>();
    influencerExpenses.forEach(exp => {
      const influencerName = exp.influencer || 'Desconocido';
      const current = map.get(influencerName) || { total: 0, qty: 0 };
      map.set(influencerName, { 
        total: current.total + exp.totalCost, 
        qty: current.qty + (exp.quantity || 0)
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [influencerExpenses]);

  const totalAdsCost = useMemo(() => {
    return adExpenses.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
  }, [adExpenses]);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!influencerFormId || !selectedSku || !quantity) return;

    const qty = Number(quantity);
    if (qty <= 0) return;

    const product = products.find(p => p.sku === selectedSku);
    if (!product) return;

    if (qty > product.stock) {
      alert(`No hay stock suficiente. Stock actual: ${product.stock}`);
      return;
    }

    const influencerObj = influencers.find(inf => inf.id === influencerFormId);
    if (!influencerObj) return;

    addMarketingExpense({
      influencer: influencerObj.name,
      influencerId: influencerObj.id,
      productSku: product.sku,
      productName: `${product.name} (${product.size})`,
      quantity: qty,
      unitCost: product.cost,
    });

    const currentMonth = new Date().toLocaleString('es-ES', { month: 'long' });
    const formattedMonth = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);
    addFixedCost({
      concept: `Comercialización - Entrega a ${influencerObj.name}`,
      period: formattedMonth,
      category: 'Marketing',
      amount: product.cost * qty
    });

    setInfluencerFormId('');
    setSelectedSku('');
    setQuantity('');
    setIsModalOpen(false);
  };

  const handleOpenInfluencerModal = (inf?: any) => {
    if (inf) {
      setSelectedInfluencerId(inf.id);
      setInfName(inf.name);
      setInfInsta(inf.instagram || '');
      setInfPhone(inf.phone || '');
      setInfAddress(inf.address || '');
      setInfNotes(inf.notes || '');
    } else {
      setSelectedInfluencerId(null);
      setInfName('');
      setInfInsta('');
      setInfPhone('');
      setInfAddress('');
      setInfNotes('');
    }
    setIsInfluencerModalOpen(true);
  };

  const handleSaveInfluencer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!infName) return;

    const payload = {
      name: infName,
      instagram: infInsta,
      phone: infPhone,
      address: infAddress,
      notes: infNotes,
    };

    if (selectedInfluencerId) {
      updateInfluencer(selectedInfluencerId, payload);
    } else {
      addInfluencer(payload);
    }
    setIsInfluencerModalOpen(false);
  };

  const handleAddAd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adPlatform || !adCampaign || !adCost) return;

    const cost = Number(adCost.replace(/\./g, ''));
    if (cost <= 0) return;

    const dateStr = adDate ? new Date(`${adDate}T12:00:00`) : new Date();

    addMarketingExpense({
      type: 'ad',
      platform: adPlatform,
      campaignName: adCampaign,
      totalCost: cost,
      date: dateStr
    });

    addCashTransaction({
      description: `Publicidad - ${adPlatform} (${adCampaign})`,
      amount: cost,
      type: 'expense'
    });

    const monthStr = dateStr.toLocaleDateString('es-ES', { month: 'long' });
    const formattedMonth = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
    addFixedCost({
      concept: `Publicidad - ${adPlatform} (${adCampaign})`,
      period: formattedMonth,
      category: 'Marketing',
      amount: cost,
      isPaid: true
    });

    setAdPlatform('');
    setAdCampaign('');
    setAdCost('');
    setAdDate('');
    setIsAdModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Share2 className="h-6 w-6 text-[#e5383b]" />
            Marketing
          </h2>
          <p className="text-sm text-slate-400 mt-1">Gestión de publicidad y productos para influencers.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'entregas' ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-[#e5383b] hover:bg-[#ba1826] text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="h-5 w-5" />
              Registrar Entrega
            </button>
          ) : activeTab === 'influencers' ? (
            <button
              onClick={() => handleOpenInfluencerModal()}
              className="bg-[#e5383b] hover:bg-[#ba1826] text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="h-5 w-5" />
              Nuevo Influencer
            </button>
          ) : (
            <button
              onClick={() => setIsAdModalOpen(true)}
              className="bg-[#e5383b] hover:bg-[#ba1826] text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="h-5 w-5" />
              Nueva Campaña
            </button>
          )}
        </div>
      </div>

      <div className="flex space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('entregas')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'entregas'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          Resumen y Entregas
        </button>
        <button
          onClick={() => setActiveTab('influencers')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            activeTab === 'influencers'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Users className="w-4 h-4" />
          Contactos Influencers
        </button>
        <button
          onClick={() => setActiveTab('ads')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            activeTab === 'ads'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          Campañas Publicidad
        </button>
      </div>

      {activeTab === 'entregas' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Inversión Total en Influencers</h3>
            <div className="p-2 bg-rose-500/10 rounded-lg">
              <Share2 className="h-5 w-5 text-[#e5383b]" />
            </div>
          </div>
          <p className="mt-4 text-4xl font-bold text-white">${totalMarketingCost.toLocaleString()}</p>
          <p className="mt-2 text-xs text-slate-500 line-clamp-2">Productos entregados: {influencerExpenses.reduce((acc, curr) => acc + (curr.quantity || 0), 0)}</p>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm flex flex-col max-h-96">
          <h3 className="text-sm font-medium text-slate-400 p-6 border-b border-slate-800">Costo por Influencer</h3>
          <div className="p-6 overflow-y-auto w-full">
            <div className="space-y-4">
              {costsByInfluencer.length === 0 ? (
                <p className="text-slate-500 text-sm h-full flex items-center justify-center">No hay registros de influencers.</p>
              ) : (
                costsByInfluencer.map(([name, data]) => (
                  <div key={name} className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <div>
                      <p className="text-sm font-medium text-white">@{name.replace('@', '')}</p>
                      <p className="text-xs text-slate-500">{data.qty} productos</p>
                    </div>
                    <span className="text-[#e5383b] font-semibold text-sm">
                      ${data.total.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h3 className="text-base font-bold text-white">Historial de Entregas</h3>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-950/50">
              <tr>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Influencer</th>
                <th className="px-6 py-4 font-medium">Producto</th>
                <th className="px-6 py-4 font-medium">Cant.</th>
                <th className="px-6 py-4 font-medium">Costo Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {influencerExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Aún no se ha entregado ropa a influencers.
                  </td>
                </tr>
              ) : (
                influencerExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-800/20">
                    <td className="px-6 py-4 text-slate-300">
                      {new Date(expense.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        @{expense.influencer?.replace('@', '')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{expense.productName}</td>
                    <td className="px-6 py-4 text-slate-300">{expense.quantity}</td>
                    <td className="px-6 py-4 font-medium text-[#e5383b]">
                      ${expense.totalCost.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeTab === 'ads' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-400">Inversión Total en Publicidad</h3>
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Share2 className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
              <p className="mt-4 text-4xl font-bold text-white">${totalAdsCost.toLocaleString()}</p>
              <p className="mt-2 text-xs text-slate-500 line-clamp-2">Inversión acumulada en todos los canales</p>
            </div>
            
            <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm flex flex-col max-h-96">
              <h3 className="text-sm font-medium text-slate-400 p-6 border-b border-slate-800">Costo por Plataforma</h3>
              <div className="p-6 overflow-y-auto w-full">
                <div className="space-y-4">
                  {adExpenses.length === 0 ? (
                    <p className="text-slate-500 text-sm h-full flex items-center justify-center">No hay registros de publicidad.</p>
                  ) : (
                    Array.from(adExpenses.reduce((acc, curr) => {
                      acc.set(curr.platform || 'General', (acc.get(curr.platform || 'General') || 0) + curr.totalCost);
                      return acc;
                    }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).map(([platform, total]) => (
                      <div key={platform} className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <p className="text-sm font-medium text-white">{platform}</p>
                        <span className="text-emerald-500 font-semibold text-sm">
                          ${total.toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Historial de Campañas</h3>
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950/50">
                  <tr>
                    <th className="px-6 py-4 font-medium">Fecha</th>
                    <th className="px-6 py-4 font-medium">Plataforma</th>
                    <th className="px-6 py-4 font-medium">Campaña</th>
                    <th className="px-6 py-4 font-medium">Inversión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {adExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        Aún no se ha registrado inversión en publicidad.
                      </td>
                    </tr>
                  ) : (
                    adExpenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-800/20">
                        <td className="px-6 py-4 text-slate-300">
                          {new Date(expense.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 font-medium text-white">{expense.platform}</td>
                        <td className="px-6 py-4 text-slate-300">{expense.campaignName}</td>
                        <td className="px-6 py-4 font-medium text-emerald-400">
                          ${expense.totalCost.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'influencers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {influencers.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-slate-900 border border-slate-800 rounded-xl">
              <Users className="h-10 w-10 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">No hay influencers registrados.</p>
            </div>
          ) : (
            influencers.map(inf => (
              <div key={inf.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm relative group">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-white">{inf.name}</h3>
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenInfluencerModal(inf)} className="p-1.5 text-slate-400 hover:text-emerald-400 bg-slate-800/50 hover:bg-slate-800 rounded-md transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteInfluencer(inf.id)} className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/50 hover:bg-slate-800 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {inf.instagram && (
                    <div className="flex items-center text-sm text-slate-300">
                      <Instagram className="h-4 w-4 mr-2 text-pink-500" />
                      {inf.instagram}
                    </div>
                  )}
                  {inf.phone && (
                    <div className="flex items-center text-sm text-slate-300">
                      <Phone className="h-4 w-4 mr-2 text-emerald-500" />
                      {inf.phone}
                    </div>
                  )}
                  {inf.address && (
                    <div className="flex items-start text-sm text-slate-300">
                      <MapPin className="h-4 w-4 mr-2 mt-0.5 text-orange-500 flex-shrink-0" />
                      <span>{inf.address}</span>
                    </div>
                  )}
                  {inf.notes && (
                    <div className="mt-4 pt-4 border-t border-slate-800 text-sm xl:min-h-16">
                      <p className="text-slate-400 line-clamp-2">{inf.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
            
            <div className="flex-1">
              <div className="flex justify-between items-center p-4 border-b border-slate-800">
                <h3 className="text-lg font-semibold text-white">Registrar Entrega</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors md:hidden">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleAddExpense} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Influencer</label>
                  <select
                    required
                    value={influencerFormId}
                    onChange={(e) => setInfluencerFormId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  >
                    <option value="">Seleccionar Influencer...</option>
                    {influencers.map(inf => (
                      <option key={inf.id} value={inf.id}>{inf.name} {inf.instagram ? `(${inf.instagram})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Producto</label>
                  <select
                    required
                    value={selectedSku}
                    onChange={(e) => setSelectedSku(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  >
                    <option value="">Seleccionar producto</option>
                    {availableProducts.map(p => (
                      <option key={p.sku} value={p.sku}>
                        {p.name} ({p.size}) - Stock: {p.stock}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium bg-[#e5383b] hover:bg-[#ba1826] text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    Confirmar Entrega
                  </button>
                </div>
              </form>
            </div>

            <div className="w-full md:w-64 bg-slate-950 border-t md:border-t-0 md:border-l border-slate-800 p-4 flex flex-col relative">
              <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors hidden md:block">
                <X className="w-5 h-5" />
              </button>
              <h4 className="text-sm font-medium text-slate-400 mb-4 pt-1 md:pt-0">Sugerencias</h4>
              <div className="flex flex-col gap-2 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    handleOpenInfluencerModal();
                  }}
                  className="text-left px-3 py-2 text-sm text-[#e5383b] hover:bg-slate-800 hover:text-[#ba1826] rounded-lg transition-colors border border-slate-800 hover:border-slate-700 bg-slate-900/50 flex items-center justify-center gap-2 font-medium"
                >
                  <Plus className="w-4 h-4" /> Registrar Influencer
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {isInfluencerModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">{selectedInfluencerId ? 'Editar' : 'Nuevo'} Influencer</h3>
              <button onClick={() => setIsInfluencerModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveInfluencer} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Nombre / Apodo</label>
                <input
                  type="text"
                  required
                  value={infName}
                  onChange={(e) => setInfName(e.target.value)}
                  placeholder="ej: Dillom"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Instagram (@)</label>
                  <input
                    type="text"
                    value={infInsta}
                    onChange={(e) => setInfInsta(e.target.value)}
                    placeholder="ej: @dillom"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Celular</label>
                  <input
                    type="text"
                    value={infPhone}
                    onChange={(e) => setInfPhone(e.target.value)}
                    placeholder="ej: 11 1234-5678"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Dirección de Entrega</label>
                <input
                  type="text"
                  value={infAddress}
                  onChange={(e) => setInfAddress(e.target.value)}
                  placeholder="ej: Av. Libertador 1234, CABA"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Notas / Acuerdos</label>
                <textarea
                  rows={3}
                  value={infNotes}
                  onChange={(e) => setInfNotes(e.target.value)}
                  placeholder="ej: 2 historias + 1 post. Talle L de remera."
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsInfluencerModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-[#e5383b] hover:bg-[#ba1826] text-white rounded-lg transition-colors"
                >
                  {selectedInfluencerId ? 'Guardar Cambios' : 'Registrar Influencer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Registrar Inversión en Ads</h3>
              <button onClick={() => setIsAdModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddAd} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Plataforma</label>
                <select
                  required
                  value={adPlatform}
                  onChange={(e) => setAdPlatform(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                >
                  <option value="">Seleccionar plataforma...</option>
                  <option value="Instagram Ads">Instagram Ads</option>
                  <option value="Facebook Ads">Facebook Ads</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="TikTok Ads">TikTok Ads</option>
                  <option value="Otra">Otra</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Nombre de Campaña / Promoción</label>
                <input
                  type="text"
                  required
                  value={adCampaign}
                  onChange={(e) => setAdCampaign(e.target.value)}
                  placeholder="ej: Hot Sale 2024"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Fecha</label>
                <input
                  type="date"
                  required
                  value={adDate}
                  onChange={(e) => setAdDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Monto Invertido ($)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-500">$</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={adCost}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      if (raw) {
                        setAdCost(new Intl.NumberFormat('es-AR').format(Number(raw)));
                      } else {
                        setAdCost('');
                      }
                    }}
                    className="w-full pl-8 bg-slate-950 border border-slate-700 text-white text-sm rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] block p-2.5"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-[#e5383b] hover:bg-[#ba1826] text-white rounded-lg transition-colors"
                >
                  Registrar Inversión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
