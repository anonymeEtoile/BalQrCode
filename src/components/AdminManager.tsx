import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { collection, onSnapshot, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Admin } from '../types';
import { UserPlus, Trash2 } from 'lucide-react';

export default function AdminManager() {
  const [admins, setAdmins] = useState<(Admin & { id: string })[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Admin & { id: string }));
      setAdmins(data);
    });
    return () => unsub();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmail.includes('@')) {
      setError("Email invalide");
      return;
    }
    setError('');
    try {
      await setDoc(doc(db, 'admins', newEmail.toLowerCase().trim()), {
        email: newEmail.toLowerCase().trim(),
        grantedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });
      setNewEmail('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      if(id === "emile.repellin.31@gmail.com") {
         alert("Cannot remove root admin.");
         return;
      }
      await deleteDoc(doc(db, 'admins', id));
    } catch(err: any) {
      alert("Erreur: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700">
        <h2 className="text-xl font-semibold mb-4">Ajouter un Super-Administrateur</h2>
        <form onSubmit={handleAdd} className="flex gap-4">
          <input 
            type="email" 
            placeholder="adresse@lycee.fr" 
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
          <button type="submit" className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-xl font-medium flex items-center gap-2">
            <UserPlus className="w-4 h-4"/> Ajouter
          </button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-6 py-3 text-sm font-medium text-zinc-500">Email</th>
              <th className="px-6 py-3 text-sm font-medium text-zinc-500">Ajouté par (UID)</th>
              <th className="px-6 py-3 text-sm font-medium text-zinc-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {admins.map(a => (
              <tr key={a.id}>
                <td className="px-6 py-4">{a.email}</td>
                <td className="px-6 py-4 text-sm text-zinc-500 font-mono">{a.grantedBy}</td>
                <td className="px-6 py-4">
                  <button onClick={() => handleRemove(a.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-center text-zinc-500">Aucun autre admin. Le créateur a toujours accès.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
