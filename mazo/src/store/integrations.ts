import { create } from 'zustand';
import { apiRequest } from '../lib/api';

export interface IntegrationConfig {
  id: string;
  configured: boolean;
  apiKey?: string;
  apiUrl?: string;
  additionalParams?: Record<string, any>;
  updatedAt?: number;
}

interface IntegrationsState {
  integrations: Record<string, IntegrationConfig>;
  loading: boolean;
  error: string | null;
  fetchIntegrations: () => Promise<void>;
  saveIntegration: (id: string, config: Omit<IntegrationConfig, 'configured'>) => Promise<void>;
}

export const useIntegrationsStore = create<IntegrationsState>((set) => ({
  integrations: {},
  loading: false,
  error: null,
  
  fetchIntegrations: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<Record<string, IntegrationConfig>>('/api/integrations');
      set({ integrations: data, loading: false });
    } catch (err: any) {
      set({ error: err.message || 'Error al obtener integraciones', loading: false });
    }
  },
  
  saveIntegration: async (id, config) => {
    set({ loading: true, error: null });
    try {
      const payload = { ...config, id, configured: true, updatedAt: Date.now() };
      const saved = await apiRequest<IntegrationConfig>(`/api/integrations/${id}`, 'POST', payload);
      set((state) => ({
        integrations: {
          ...state.integrations,
          [id]: saved
        },
        loading: false
      }));
    } catch (err: any) {
      set({ error: err.message || 'Error al guardar la integración', loading: false });
      throw err;
    }
  }
}));
