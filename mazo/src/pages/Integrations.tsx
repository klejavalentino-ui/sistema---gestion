import React, { useEffect, useState } from 'react';
import { useIntegrationsStore } from '../store/integrations';

export default function Integrations() {
  const { integrations, loading, error, fetchIntegrations, saveIntegration } = useIntegrationsStore();
  const [apiKey, setApiKey] = useState('');
  const [activeTab, setActiveTab] = useState<'arca' | 'tiendanube'>('arca');

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveIntegration(activeTab, { apiKey });
      alert('Integración guardada con éxito.');
      setApiKey('');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const isConfigured = (id: string) => !!integrations[id]?.configured;

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold mb-6">Integraciones Especiales (Multi-tenant)</h1>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lado Izquierdo: Selección de integraciones */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">Módulos Disponibles</h2>
          
          <button
            onClick={() => setActiveTab('arca')}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              activeTab === 'arca'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : 'bg-slate-900/50 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <div className="font-semibold">Facturación ARCA</div>
            <div className="text-xs text-slate-400 mt-1">
              Estado: {isConfigured('arca') ? '🟢 Conectado' : '🔴 Sin Configurar'}
            </div>
          </button>

          <button
            onClick={() => setActiveTab('tiendanube')}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              activeTab === 'tiendanube'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : 'bg-slate-900/50 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <div className="font-semibold">Tiendanube Sync</div>
            <div className="text-xs text-slate-400 mt-1">
              Estado: {isConfigured('tiendanube') ? '🟢 Conectado' : '🔴 Sin Configurar'}
            </div>
          </button>
        </div>

        {/* Lado Derecho: Formulario y Renderizado Condicional */}
        <div className="md:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            Configurar {activeTab === 'arca' ? 'Facturación ARCA' : 'Tiendanube Sync'}
          </h2>

          {loading ? (
            <div className="text-slate-400">Procesando...</div>
          ) : isConfigured(activeTab) ? (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-lg">
                ¡Esta integración está activa y configurada de forma aislada en tu perfil de usuario!
              </div>
              <div className="text-sm text-slate-300">
                <span className="font-semibold">API Key guardada:</span> ****
                {integrations[activeTab]?.apiKey?.slice(-4) || '****'}
              </div>
              <button
                onClick={() => {
                  if (window.confirm('¿Desea reconfigurar las credenciales?')) {
                    saveIntegration(activeTab, { apiKey: '' });
                  }
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                Desconectar o Modificar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <p className="text-sm text-slate-400">
                Ingresá tus credenciales específicas. Estos datos se guardarán cifrados y aislados en tu propia base de datos.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">API Key / Token de Acceso</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                  placeholder="Ingrese el token privado..."
                  required
                />
              </div>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                Guardar Configuración
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
