import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Ticket } from '../types';
import { Power, CheckCircle, Clock } from 'lucide-react';

export default function Dashboard() {
  const [tickets, setTickets] = useState<(Ticket & { id: string })[]>([]);
  const [scanActive, setScanActive] = useState(false);

  useEffect(() => {
    const unsubTickets = onSnapshot(collection(db, 'tickets'), (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as (Ticket & { id: string }))));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists() && snap.data().scanActive !== undefined) {
        setScanActive(snap.data().scanActive);
      }
    });

    return () => {
      unsubTickets();
      unsubSettings();
    };
  }, []);

  const toggleScan = async () => {
    try {
      await updateDoc(doc(db, 'settings', 'global'), {
        scanActive: !scanActive,
        updatedBy: auth.currentUser?.uid,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      if (err.message.includes('No document to update')) {
        await setDoc(doc(db, 'settings', 'global'), {
          scanActive: true,
          updatedBy: auth.currentUser?.uid,
          updatedAt: serverTimestamp()
        });
      } else {
        alert("Erreur: " + err.message);
      }
    }
  };

  const stats = {
    totalRevenue: tickets.reduce((acc, t) => acc + (t.amount || 0), 0),
    totalRegistrations: tickets.length,
    scanned: tickets.filter(t => t.scanned).length,
    expected: tickets.filter(t => !t.scanned).length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Argent Récolté" value={`${stats.totalRevenue} €`} icon={<div className="text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg font-bold">€</div>} />
        <StatCard title="Total Inscrits" value={stats.totalRegistrations} />
        <StatCard title="Personnes Scannées" value={stats.scanned} icon={<CheckCircle className="text-blue-500 w-6 h-6" />} />
        <StatCard title="Personnes Attendues" value={stats.expected} icon={<Clock className="text-amber-500 w-6 h-6" />} />
      </div>

      <div className="flex justify-between items-center bg-white dark:bg-zinc-800 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700">
        <div>
          <h3 className="text-lg font-bold mb-1">Contrôle du Scan</h3>
          <p className="text-zinc-500 text-sm">Activez ou désactivez globalement la possibilité de scanner les billets.</p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <button 
            onClick={toggleScan}
            className={`w-14 h-8 rounded-full transition-colors relative flex items-center ${scanActive ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
          >
            <div className={`w-6 h-6 bg-white rounded-full absolute shadow-sm transition-transform ${scanActive ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
          <span className="font-medium hidden sm:flex items-center gap-2">
            <Power className={`w-5 h-5 ${scanActive ? 'text-green-500' : 'text-zinc-500'}`} />
            {scanActive ? 'Scan Activé' : 'Scan Désactivé'}
          </span>
        </label>
      </div>

    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon?: ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col justify-center">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
        {icon}
      </div>
      <p className="text-3xl font-semibold text-zinc-900 dark:text-white">{value}</p>
    </div>
  );
}
