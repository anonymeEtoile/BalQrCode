import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import AdminGuard from './components/AdminGuard';
import Dashboard from './components/Dashboard';
import Guichet from './components/Guichet';
import ScannerVue from './components/ScannerVue';
import Students from './components/Students';
import AdminManager from './components/AdminManager';
import { Ticket, QrCode, ClipboardList, ShieldCheck, LogOut, Sun, Moon, Users, WifiOff } from 'lucide-react';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';

type View = 'dashboard' | 'guichet' | 'scanner' | 'admins' | 'eleves';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  return { theme, toggleTheme };
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const { theme, toggleTheme } = useTheme();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AdminGuard>
      <div className="flex flex-col md:flex-row min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100 selection:bg-blue-200 dark:selection:bg-blue-900">
        
        {/* Top Header for Mobile */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 w-full">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Bal LMMF</h1>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-lg">
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button onClick={() => signOut(auth)} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-lg" title="Déconnexion">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Sidebar for Desktop */}
        <aside className="hidden md:flex w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex-col sticky top-0 h-screen">
          <div className="p-8 flex items-center justify-between">
             <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Bal LMMF</h1>
             <button onClick={toggleTheme} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
               {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
             </button>
          </div>
          <nav className="flex-1 px-4 flex flex-col gap-2">
            <NavButton active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon={<ClipboardList className="w-5 h-5" />}>
              Tableau de bord
            </NavButton>
            <NavButton active={currentView === 'eleves'} onClick={() => setCurrentView('eleves')} icon={<Users className="w-5 h-5" />}>
               Élèves
            </NavButton>
            <NavButton active={currentView === 'guichet'} onClick={() => setCurrentView('guichet')} icon={<Ticket className="w-5 h-5" />}>
               Guichet Vente
            </NavButton>
            <NavButton active={currentView === 'scanner'} onClick={() => setCurrentView('scanner')} icon={<QrCode className="w-5 h-5" />}>
               Scanner
            </NavButton>
            <NavButton active={currentView === 'admins'} onClick={() => setCurrentView('admins')} icon={<ShieldCheck className="w-5 h-5" />}>
               Admins
            </NavButton>
          </nav>
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
             <button onClick={() => signOut(auth)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl transition-colors">
               <LogOut className="w-5 h-5" /> Déconnexion
             </button>
          </div>
        </aside>
        
        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto mb-20 md:mb-0 w-full max-w-6xl mx-auto">
          {!isOnline && (
            <div className="mb-6 px-4 py-3 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-800/50 flex items-center justify-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-top-2 shadow-sm">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>Mode hors-ligne actif. Vos modifications seront synchronisées automatiquement une fois le réseau rétabli.</span>
            </div>
          )}
          {currentView === 'dashboard' && <Dashboard />}
          {currentView === 'eleves' && <Students />}
          {currentView === 'guichet' && <Guichet />}
          {currentView === 'scanner' && <ScannerVue />}
          {currentView === 'admins' && <AdminManager />}
        </main>
        
        {/* Bottom Navigation for Mobile */}
        <nav 
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-around pt-2 px-2 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.2)]"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <MobileNavButton active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon={<ClipboardList className="w-5 h-5" />} label="Stats" />
          <MobileNavButton active={currentView === 'eleves'} onClick={() => setCurrentView('eleves')} icon={<Users className="w-5 h-5" />} label="Élèves" />
          <MobileNavButton active={currentView === 'guichet'} onClick={() => setCurrentView('guichet')} icon={<Ticket className="w-5 h-5" />} label="Vente" />
          <MobileNavButton active={currentView === 'scanner'} onClick={() => setCurrentView('scanner')} icon={<QrCode className="w-5 h-5" />} label="Scan" />
          <MobileNavButton active={currentView === 'admins'} onClick={() => setCurrentView('admins')} icon={<ShieldCheck className="w-5 h-5" />} label="Admins" />
        </nav>

      </div>
    </AdminGuard>
  );
}

function NavButton({ children, active, onClick, icon }: { children: ReactNode, active: boolean, onClick: () => void, icon?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 text-base font-medium rounded-xl transition-all w-full text-left ${
        active 
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm' 
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 flex-1 transition-colors rounded-xl ${
        active 
          ? 'text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800/50' 
          : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
      }`}
    >
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}

