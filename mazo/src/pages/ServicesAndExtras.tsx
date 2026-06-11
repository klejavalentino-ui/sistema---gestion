import { useState } from 'react';
import { Save, Tag, Package as PackageIcon, Scissors } from 'lucide-react';
import { useAppStore } from '../store';

export default function ServicesAndExtras() {
  const { estampados, packagings, bordados, updateEstampado, updatePackaging, updateBordado } = useAppStore();
  
  const [localEstampados, setLocalEstampados] = useState(estampados);
  const [localPackagings, setLocalPackagings] = useState(packagings);
  const [localBordados, setLocalBordados] = useState(bordados);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    localEstampados.forEach(e => updateEstampado(e.id, e.cost));
    localPackagings.forEach(p => updatePackaging(p.id, p.cost));
    localBordados.forEach(b => updateBordado(b.id, b.cost));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Adicionales</h2>
          <p className="text-slate-400 mt-1">Configura los costos de estampado y packaging</p>
        </div>
        <button 
          onClick={handleSave}
          className="flex items-center px-4 py-2 bg-[#e5383b] text-white rounded-lg hover:bg-[#ba1826] transition-colors font-medium"
        >
          <Save className="h-5 w-5 mr-2" />
          {isSaved ? 'Guardado!' : 'Guardar Cambios'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Estampado */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Tag className="h-5 w-5 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Estampado</h3>
          </div>
          <div className="p-6 space-y-4">
            {localEstampados.map((est, idx) => (
              <div key={est.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <h4 className="font-medium text-white">{est.name}</h4>
                  <p className="text-sm text-slate-500">Costo por unidad</p>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-500">$</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={est.cost ? new Intl.NumberFormat('es-AR').format(est.cost) : ''}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/\D/g, '');
                      const newCost = rawValue ? parseInt(rawValue, 10) : 0;
                      const newEsts = [...localEstampados];
                      newEsts[idx].cost = newCost;
                      setLocalEstampados(newEsts);
                    }}
                    className="pl-8 pr-4 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] w-full sm:w-32 text-right"
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Packaging */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <PackageIcon className="h-5 w-5 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Packaging</h3>
          </div>
          <div className="p-6 space-y-4">
            {localPackagings.map((pack, idx) => (
              <div key={pack.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <h4 className="font-medium text-white">{pack.name}</h4>
                  <p className="text-sm text-slate-500">Costo por unidad</p>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-500">$</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pack.cost ? new Intl.NumberFormat('es-AR').format(pack.cost) : ''}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/\D/g, '');
                      const newCost = rawValue ? parseInt(rawValue, 10) : 0;
                      const newPacks = [...localPackagings];
                      newPacks[idx].cost = newCost;
                      setLocalPackagings(newPacks);
                    }}
                    className="pl-8 pr-4 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] w-full sm:w-32 text-right"
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bordados */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Scissors className="h-5 w-5 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Bordados</h3>
          </div>
          <div className="p-6 space-y-4">
            {localBordados.map((bor, idx) => (
              <div key={bor.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <h4 className="font-medium text-white">{bor.name}</h4>
                  <p className="text-sm text-slate-500">Costo por unidad</p>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-500">$</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bor.cost ? new Intl.NumberFormat('es-AR').format(bor.cost) : ''}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/\D/g, '');
                      const newCost = rawValue ? parseInt(rawValue, 10) : 0;
                      const newBors = [...localBordados];
                      newBors[idx].cost = newCost;
                      setLocalBordados(newBors);
                    }}
                    className="pl-8 pr-4 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-[#e5383b] focus:border-[#e5383b] w-full sm:w-32 text-right"
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
