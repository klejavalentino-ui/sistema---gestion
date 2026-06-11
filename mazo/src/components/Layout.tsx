import { useState, useMemo, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Receipt,
  Truck,
  Settings,
  Share2,
  Wallet,
  Banknote,
  CreditCard,
  Coins,
  Bell,
  AlertCircle,
  X,
  Menu
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAppStore } from '../store';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navigation = [
  { name: 'Ventas', href: '/', icon: ShoppingCart },
  { name: 'Inventario', href: '/inventory', icon: Package },
  { name: 'Compras', href: '/suppliers', icon: Truck },
  { name: 'Adicionales', href: '/services', icon: Settings },
  { name: 'Cuentas a Pagar', href: '/supplier-accounts', icon: CreditCard },
  { name: 'Cobranzas', href: '/collections', icon: Coins },
  { name: 'Caja', href: '/cash', icon: Banknote },
  { name: 'Gastos Mensuales', href: '/costs', icon: Receipt },
  { name: 'Marketing', href: '/marketing', icon: Share2 },
  { name: 'Panel', href: '/panel', icon: LayoutDashboard },
];

export default function Layout() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const { products, currentAccounts, suppliers, sales } = useAppStore();

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
        ...p,
        minStock: minStock
      };
    }).filter(p => p.stock <= p.minStock);
  }, [products, sales]);

  const calculateBalance = (transactions: any[]) => {
    return transactions.reduce((acc, tx) => acc + (tx.amount || 0) - (tx.payment || 0), 0);
  };

  const totalOwed = useMemo(() => {
    return suppliers.reduce((sum, sup) => {
      const acc = currentAccounts.find(a => a.supplierId === sup.id);
      const balance = acc ? calculateBalance(acc.transactions) : 0;
      return sum + (balance > 0 ? balance : 0);
    }, 0);
  }, [suppliers, currentAccounts]);

  const totalReceivables = useMemo(() => {
    return currentAccounts
      .filter(acc => acc.type === 'cliente')
      .reduce((sum, acc) => {
         const balance = calculateBalance(acc.transactions);
         return sum + (balance > 0 ? balance : 0);
      }, 0);
  }, [currentAccounts]);

  const showStockNotif = lowStockItems.length > 0 && !dismissedNotifs.includes('stock');
  const showOwedNotif = totalOwed > 0 && !dismissedNotifs.includes('owed');
  const showReceivablesNotif = totalReceivables > 0 && !dismissedNotifs.includes('receivables');

  const notificationCount = (showStockNotif ? 1 : 0) + (showOwedNotif ? 1 : 0) + (showReceivablesNotif ? 1 : 0);

  const handleDismiss = (e: any, type: string) => {
    e.stopPropagation();
    setDismissedNotifs([...dismissedNotifs, type]);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 font-sans text-slate-100 transition-colors duration-200">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-20 flex flex-col items-center justify-center border-b border-slate-800 pt-3 pb-1 relative">
          {/* Close button for mobile */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden absolute top-3 right-3 p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
          
          {/* Mazo Logo Replica */}
          <span className="text-[9px] font-bold text-[#e5383b] tracking-wide leading-none mb-0.5">hecho en Argentina</span>
          <span className="text-4xl font-black text-[#e5383b] tracking-tighter leading-none">mazo.</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-hide">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-[#e5383b]/20 text-[#e5383b]'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                )
              }
            >
              <item.icon className="mr-2.5 h-4 w-4 flex-shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 lg:px-8 transition-colors duration-200">
          <div className="flex items-center">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden mr-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-semibold text-slate-100 hidden sm:block">
              Sistema de Gestión
            </h1>
          </div>
          <div className="flex items-center space-x-4 relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-full transition-colors"
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e5383b] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#e5383b]"></span>
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-slate-400" />
                    Notificaciones
                  </h3>
                </div>
                <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
                  {notificationCount === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No tienes notificaciones pendientes.
                    </div>
                  ) : (
                    <>
                      {showStockNotif && (
                        <div 
                          onClick={() => { setShowNotifications(false); navigate('/inventory'); }}
                          className="p-4 hover:bg-slate-800/50 cursor-pointer transition-colors group flex items-start gap-3 relative"
                        >
                          <div className="mt-0.5 p-2 rounded-lg bg-orange-500/10 text-orange-500 shrink-0 h-fit transition-colors group-hover:bg-orange-500 group-hover:text-white">
                            <AlertCircle className="w-4 h-4" />
                          </div>
                          <div className="flex-1 pr-6">
                            <p className="text-sm font-bold text-slate-200">Stock Crítico</p>
                            <p className="text-xs text-slate-400 mt-1">
                              Tienes <span className="text-orange-400 font-bold">{lowStockItems.length}</span> productos en stock crítico que requieren reposición.
                            </p>
                          </div>
                          <button 
                            onClick={(e) => handleDismiss(e, 'stock')}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      
                      {showOwedNotif && (
                        <div 
                          onClick={() => { setShowNotifications(false); navigate('/supplier-accounts'); }}
                          className="p-4 hover:bg-slate-800/50 cursor-pointer transition-colors group flex items-start gap-3 relative"
                        >
                          <div className="mt-0.5 p-2 rounded-lg bg-rose-500/10 text-rose-500 shrink-0 h-fit transition-colors group-hover:bg-rose-500 group-hover:text-white">
                            <CreditCard className="w-4 h-4" />
                          </div>
                          <div className="flex-1 pr-6">
                            <p className="text-sm font-bold text-slate-200">Cuentas a Pagar</p>
                            <p className="text-xs text-slate-400 mt-1">
                              Tienes deuda con proveedores por un total de <span className="text-rose-400 font-bold">${totalOwed.toLocaleString('es-AR')}</span>.
                            </p>
                          </div>
                          <button 
                            onClick={(e) => handleDismiss(e, 'owed')}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {showReceivablesNotif && (
                        <div 
                          onClick={() => { setShowNotifications(false); navigate('/collections'); }}
                          className="p-4 hover:bg-slate-800/50 cursor-pointer transition-colors group flex items-start gap-3 relative"
                        >
                          <div className="mt-0.5 p-2 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 h-fit transition-colors group-hover:bg-emerald-500 group-hover:text-white">
                            <Coins className="w-4 h-4" />
                          </div>
                          <div className="flex-1 pr-6">
                            <p className="text-sm font-bold text-slate-200">Cobranzas Pendientes</p>
                            <p className="text-xs text-slate-400 mt-1">
                              Tienes saldo a cobrar a clientes por un total de <span className="text-emerald-400 font-bold">${totalReceivables.toLocaleString('es-AR')}</span>.
                            </p>
                          </div>
                          <button 
                            onClick={(e) => handleDismiss(e, 'receivables')}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-950 transition-colors duration-200 scrollbar-hide">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
