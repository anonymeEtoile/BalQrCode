import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Loader2 } from 'lucide-react';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        checkAdminStatus(currentUser.email);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const checkAdminStatus = async (email: string | null) => {
    if (!email) return;
    try {
      // First try to read settings. If this admin was allowed, they can read.
      const settingsRef = doc(db, 'settings', 'global');
      const settingsSnap = await getDoc(settingsRef) as any;
      if (settingsSnap.exists() || !settingsSnap.exists()) {
        setIsAdmin(true);
        // Make sure global settings exist if we are root admin
        if (!settingsSnap.exists() && email === "emile.repellin.31@gmail.com") {
           await setDoc(settingsRef, {
             scanActive: false,
             updatedBy: auth.currentUser?.uid,
             updatedAt: serverTimestamp()
           });
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('permission')) {
        setIsAdmin(false);
        setError("Accès refusé. Vous n'êtes pas un Super-Administrateur.");
      } else {
        setError("Erreur de connexion.");
      }
    }
    setLoading(false);
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900"><Loader2 className="animate-spin text-zinc-500 w-8 h-8" /></div>;
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-zinc-800 p-8 pt-10 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-6">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white mb-2">Bal de Fin d'Année</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8">Espace Super-Administrateur</p>
          <button onClick={login} className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 font-medium py-3 px-4 rounded-xl transition-colors">
            Se connecter avec Google
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
        <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="max-w-md w-full bg-white dark:bg-zinc-800 p-8 rounded-2xl shadow-sm border border-red-200 dark:border-red-900/50 text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-6">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Accès Non Autorisé</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">{error || "Votre compte doit être validé par un administrateur."}</p>
          <div className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 font-mono text-left mb-6 truncate whitespace-normal break-all">
            {user.email}
          </div>
          <button onClick={() => signOut(auth)} className="w-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-medium py-2 px-4 transition-colors">
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
