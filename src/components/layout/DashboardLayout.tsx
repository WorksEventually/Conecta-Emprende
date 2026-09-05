import { Outlet, Link, useLocation } from 'react-router-dom';
import { MessageSquare, User } from 'lucide-react';

export default function DashboardLayout() {
  const location = useLocation();
  
  const navItems = [
    { name: 'Perfil', path: '/dashboard/perfil', icon: User },
    { name: 'Cotizaciones', path: '/dashboard/cotizaciones', icon: MessageSquare },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen h-[100dvh] w-full bg-[#F8F9FA] overflow-hidden">
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-[rgba(26,60,110,0.18)] shrink-0 flex flex-col h-auto md:h-full z-10">
        <div className="p-6 shrink-0">
          <Link to="/" className="text-xl font-bold tracking-tight text-[var(--brand-dark)] mb-4 block">
            TradeArc
          </Link>
          <h2 className="text-lg font-bold text-[#333333]">Mi Panel</h2>
          <p className="text-sm text-[rgba(51,51,51,0.72)]">Proveedor</p>
        </div>
        <nav className="px-4 pb-4 md:pb-0 space-y-1 flex md:flex-col overflow-x-auto shrink-0 md:flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
<Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive 
                      ? 'bg-[rgba(0,212,255,0.12)] text-[var(--brand-dark)]'
                      : 'text-[#333333] hover:bg-[#F8F9FA] hover:text-[#333333]'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-[var(--brand-dark)]' : 'text-[rgba(51,51,51,0.72)]'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
