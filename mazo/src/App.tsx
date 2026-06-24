/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Sales from './pages/Sales';
import Panel from './pages/Panel';
import FixedCosts from './pages/FixedCosts';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import ServicesAndExtras from './pages/ServicesAndExtras';
import Marketing from './pages/Marketing';
import SupplierDebt from './pages/SupplierDebt';
import Collections from './pages/Collections';
import Cash from './pages/Cash';
import Integrations from './pages/Integrations';

// Placeholder components for other routes
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex h-full items-center justify-center bg-slate-900 rounded-xl border border-slate-800 border-dashed">
    <div className="text-center">
      <h2 className="text-xl font-semibold text-slate-300">{title}</h2>
      <p className="text-slate-500 mt-2">Módulo en desarrollo</p>
    </div>
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Sales />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="costs" element={<FixedCosts />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="supplier-accounts" element={<SupplierDebt />} />
            <Route path="collections" element={<Collections />} />
            <Route path="cash" element={<Cash />} />
            <Route path="services" element={<ServicesAndExtras />} />
            <Route path="panel" element={<Panel />} />
            <Route path="integrations" element={<Integrations />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
