import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { doc, setDoc, collection, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Ticket as TicketIcon, Eye, Download, Wifi, WifiOff, CheckCircle, RefreshCw, Trash2, X, Ghost } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as htmlToImage from 'html-to-image';

interface SessionTicket {
  id: string;
  firstName: string;
  lastName: string;
  studentClass: string;
  amount: number;
  createdAtLocal: string;
  synced: boolean;
  isGhost?: boolean;
}

export default function Guichet() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [level, setLevel] = useState('Terminale');
  const [stream, setStream] = useState('STMG');
  const [classNum, setClassNum] = useState('');
  const [amount, setAmount] = useState<number | ''>(5);
  const [isGhost, setIsGhost] = useState(false);

  const isEmile = auth.currentUser?.email?.toLowerCase() === 'emile.repellin.31@gmail.com';

  const computedClass = (() => {
    const parts = [];
    if (level === 'BTS') {
      parts.push('BTS');
      if (stream && stream !== 'Aucun' && stream !== 'Général' && stream !== 'BTS') {
        parts.push(stream);
      }
    } else {
      parts.push(level);
      if (stream && stream !== 'Aucun' && stream !== 'Général' && stream !== 'BTS') {
        parts.push(stream);
      }
    }
    if (classNum) {
      parts.push(classNum.toUpperCase().trim());
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  })();
  
  const [loading, setLoading] = useState(false);
  const [successBanner, setSuccessBanner] = useState<{ name: string; isOffline: boolean } | null>(null);
  const [viewTicket, setViewTicket] = useState<SessionTicket | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Load session sales from localStorage
  const [sessionTickets, setSessionTickets] = useState<SessionTicket[]>(() => {
    try {
      const saved = localStorage.getItem('lmmf_recent_sales');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Keep track of online state
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Automatically attempt to mark offline tickets as synced once the browser tells us we are online.
      // Firebase's background queue is automatically handling synchronization, 
      // but let's make sure our local list visual state synchronizes too.
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen to Firestore to clean up deleted students and keep synced states up-to-date
  useEffect(() => {
    if (!isOnline) return;
    const unsub = onSnapshot(collection(db, 'tickets'), (snap) => {
      const dbTicketsMap = new Map();
      snap.docs.forEach(doc => {
        dbTicketsMap.set(doc.id, doc.data());
      });
      setSessionTickets(prev => {
        const updated = prev
          .filter(t => dbTicketsMap.has(t.id) || !t.synced)
          .map(t => {
            const remoteData = dbTicketsMap.get(t.id);
            if (remoteData) {
              return {
                ...t,
                synced: true,
                firstName: remoteData.firstName || t.firstName,
                lastName: remoteData.lastName || t.lastName,
                studentClass: remoteData.studentClass || t.studentClass,
                amount: remoteData.amount !== undefined ? remoteData.amount : t.amount
              };
            }
            return t;
          });
        return updated;
      });
    });
    return () => unsub();
  }, [isOnline]);

  // Sync state with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('lmmf_recent_sales', JSON.stringify(sessionTickets));
    } catch (e) {
      console.error("Local storage save error", e);
    }
  }, [sessionTickets]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const finalizedClass = computedClass;
    if (!firstName || !lastName || !finalizedClass) return;

    setLoading(true);
    const ticketsRef = collection(db, 'tickets');
    const newDoc = doc(ticketsRef);
    const ticketId = newDoc.id;

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim().toUpperCase();
    const trimmedClass = finalizedClass;
    const numericAmount = amount === '' ? 5 : Number(amount);

    const ticketData = {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      studentClass: trimmedClass,
      amount: numericAmount,
      createdBy: auth.currentUser?.uid || 'anonymous',
      createdAt: serverTimestamp(),
      scanned: false,
      scannedAt: null,
      isGhost: isEmile ? isGhost : false
    };

    const localTicket: SessionTicket = {
      id: ticketId,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      studentClass: trimmedClass,
      amount: numericAmount,
      createdAtLocal: new Date().toISOString(),
      synced: false,
      isGhost: isEmile ? isGhost : false
    };

    // Add to session list immediately to avoid waiting
    setSessionTickets(prev => [localTicket, ...prev].slice(0, 50)); // Limit to last 50 for performance

    // Offline check for banner announcement
    const wasOffline = !navigator.onLine;
    setSuccessBanner({
      name: `${trimmedFirstName} ${trimmedLastName}`,
      isOffline: wasOffline
    });

    // Reset fields instantly so they can type another name
    setFirstName('');
    setLastName('');
    setClassNum('');
    setAmount(5);
    setIsGhost(false);
    setLoading(false);

    // Save metadata locally to firestore cache
    // This allows firestore offline persistence engine to register it instantly
    setDoc(newDoc, ticketData)
      .then(() => {
        // Document successfully uploaded to remote Firestore server
        setSessionTickets(prev => 
          prev.map(ticket => ticket.id === ticketId ? { ...ticket, synced: true } : ticket)
        );
      })
      .catch((err) => {
        console.error("Error writing to Firestore:", err);
      });

    // Dismiss banner automatically after 4 seconds
    setTimeout(() => {
      setSuccessBanner(prev => {
        if (prev?.name === `${trimmedFirstName} ${trimmedLastName}`) {
          return null;
        }
        return prev;
      });
    }, 4500);
  };

  const handleExport = async () => {
    if (!qrRef.current || !viewTicket) return;
    try {
      setIsExporting(true);
      const dataUrl = await htmlToImage.toPng(qrRef.current, { backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `billet_${viewTicket.lastName}_${viewTicket.firstName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
      alert("Erreur lors de l'exportation du QR Code.");
    } finally {
      setIsExporting(false);
    }
  };

  const clearSessionList = () => {
    if (confirm("Voulez-vous vider l'historique des ventes de cette session ? Cela ne supprimera pas les tickets de la base de données.")) {
      setSessionTickets([]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 mt-6">
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Left Hand: Registration Form Card */}
        <div id="guichet-form-container" className="flex-1 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm self-start">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex justify-between items-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
                 <TicketIcon className="w-6 h-6" />
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                {isOnline ? (
                  <>
                    <Wifi className="w-3.5 h-3.5" /> Synchronisé en direct
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 animate-pulse" /> Mode hors-ligne
                  </>
                )}
              </div>
            </div>
            <h2 className="text-xl font-semibold mt-4">Enregistrer une Vente (Guichet)</h2>
            <p className="text-zinc-500 mt-1 text-sm">Saisie rapide d'élèves. Les QR Codes sont générés et stockés localement même sans réseau.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {successBanner && (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-green-800 dark:text-green-300 text-sm flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
                <CheckCircle className="w-5 h-5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="flex-1">
                  <span className="font-semibold block">{successBanner.name} enregistré avec succès !</span>
                  <span className="text-xs opacity-90">
                    {successBanner.isOffline 
                      ? "Enregistré localement (hors-ligne). Le QR code est disponible, la synchronisation se lancera dès connexion."
                      : "Synchronisé avec succès sur la base de données distante."}
                  </span>
                </div>
                <button type="button" onClick={() => setSuccessBanner(null)} className="opacity-70 hover:opacity-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-200">Prénom</label>
                <input required type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jean" autoComplete="off" autoCorrect="off" spellCheck={false} className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-zinc-900 dark:text-white text-base md:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-200">Nom (En Majuscules)</label>
                <input required type="text" value={lastName} onChange={e => setLastName(e.target.value.toUpperCase())} placeholder="DUPONT" autoComplete="off" autoCorrect="off" spellCheck={false} className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none uppercase font-semibold text-zinc-900 dark:text-white text-base md:text-sm" />
              </div>
            </div>
            
            <div className="bg-zinc-50 dark:bg-zinc-900/40 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700 space-y-4">
              <span className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">Classe de l'élève</span>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Niveau</label>
                  <div className="flex flex-wrap gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
                    {['Seconde', 'Première', 'Terminale', 'BTS'].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setLevel(lvl);
                          if (lvl === 'BTS') {
                            setStream('BTS');
                          } else if (lvl === 'Seconde') {
                            setStream('Aucun');
                          } else {
                            setStream('STMG');
                          }
                        }}
                        className={`flex-1 py-2 px-1 text-xs font-bold rounded-lg transition-all text-center select-none active:scale-95 ${
                          level === lvl
                            ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Filière / Spécialité</label>
                  <div className="flex flex-wrap gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl min-h-[40px] items-center">
                    {level === 'Seconde' ? (
                      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 px-3 py-2 select-none w-full text-center">Générale (Aucune)</span>
                    ) : level === 'BTS' ? (
                      ['BTS', 'MCO', 'NDRC'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStream(st)}
                          className={`flex-1 py-1.5 px-1 text-xs font-bold rounded-lg transition-all text-center select-none active:scale-95 ${
                            stream === st
                              ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))
                    ) : (
                      ['STMG', 'STI2D', 'Général', 'Autre'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStream(st)}
                          className={`flex-1 py-1.5 px-1 text-xs font-bold rounded-lg transition-all text-center select-none active:scale-95 ${
                            stream === st
                              ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          {st === 'Général' ? 'Générale' : st}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Numéro de classe</label>
                  <input 
                    required 
                    type="number" 
                    min="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={classNum} 
                    onChange={e => setClassNum(e.target.value)} 
                    placeholder="4" 
                    className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-base md:text-sm focus:ring-2 focus:ring-blue-500/25 focus:outline-none"
                  />
                </div>
              </div>

              <div className="text-xs text-zinc-500 dark:text-zinc-400 flex justify-between items-center bg-zinc-100/50 dark:bg-black/20 p-2.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800">
                <span>Aperçu de la classe :</span>
                <span className="font-bold text-zinc-900 dark:text-white">
                  {computedClass || "(en attente de saisie)"}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Montant Payé (€) <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">(Par défaut: 5€)</span></label>
              <input type="number" min="0" step="0.5" inputMode="decimal" autoComplete="off" autoCorrect="off" value={amount} onChange={e => setAmount(e.target.value ? Number(e.target.value) : '')} placeholder="5" className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 rounded-xl text-base md:text-sm focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 focus:outline-none" />
            </div>

            {isEmile && (
              <div className="p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-2xl flex items-center justify-between transition-colors mt-2 animate-in slide-in-from-top-1">
                <div className="flex items-center gap-2.5">
                  <Ghost className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-pulse" />
                  <div>
                    <label className="text-sm font-bold text-purple-950 dark:text-purple-300">Élève Fantôme 👻</label>
                    <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">Masqué pour les autres admins.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGhost(!isGhost)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${isGhost ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isGhost ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )}

            <button disabled={loading} type="submit" className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 font-medium py-3 rounded-xl transition-colors mt-6 disabled:opacity-50 flex items-center justify-center gap-2">
              Validé la vente
            </button>
          </form>
        </div>

        {/* Right Hand: Session's Local Entries list */}
        <div id="guichet-session-list" className="w-full md:w-80 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6 flex flex-col shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Ventes de la Session</h3>
            {sessionTickets.length > 0 && (
              <button 
                onClick={clearSessionList} 
                className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition"
                title="Vider l'historique"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1 flex-1">
            {sessionTickets.map((t) => (
              <div key={t.id} className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-100 dark:border-zinc-850 flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <p className="font-semibold text-sm truncate">
                    {t.firstName} {t.lastName} {isEmile && t.isGhost && <span className="text-purple-600 dark:text-purple-400" title="Élève Fantôme">👻</span>}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{t.studentClass} • {t.amount} €</p>
                  <p className="mt-1">
                    {t.synced ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-950/20 px-1.5 py-0.5 rounded">
                        <CheckCircle className="w-2.5 h-2.5" /> Synchronisé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded animate-pulse">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '3s' }} /> Hors-ligne
                      </span>
                    )}
                  </p>
                </div>

                <button 
                  onClick={() => setViewTicket(t)} 
                  className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white shrink-0 transition"
                  title="Afficher le QR code"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ))}

            {sessionTickets.length === 0 && (
              <div className="text-center py-12 text-zinc-450 dark:text-zinc-500 text-sm">
                <TicketIcon className="w-8 h-8 mx-auto stroke-[1.5] mb-2 opacity-50 text-zinc-400" />
                Dernières ventes enregistrées s'afficheront ici.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* QR Code display Modal */}
      {viewTicket && (
        <div id="ticket-modal" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-800 p-6 md:p-8 rounded-3xl shadow-xl max-w-sm w-full relative">
            <h3 className="text-xl font-bold mb-4 text-center">Billet Électronique</h3>
            
            <div 
              ref={qrRef} 
              className="bg-white text-zinc-900 p-6 rounded-2xl border border-zinc-200 mb-6 flex flex-col items-center shadow-sm text-center"
              style={{ padding: '2rem' }}
            >
              <div className="text-center mb-6 w-full pb-4 border-b border-zinc-200">
                <h2 className="text-2xl font-bold tracking-tight mb-1 break-words">{viewTicket.firstName} {viewTicket.lastName}</h2>
                <p className="text-lg text-zinc-500">{viewTicket.studentClass}</p>
              </div>
              <QRCodeSVG value={viewTicket.id} size={220} />
              <div className="mt-6 pt-4 border-t border-zinc-200 text-center w-full">
                <p className="font-semibold text-xl">Bal LMMF</p>
                <p className="text-xs text-zinc-400 break-all font-mono mt-2">{viewTicket.id}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setViewTicket(null)} 
                className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white font-medium py-3 rounded-xl transition"
              >
                Fermer
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {isExporting ? 'Export...' : 'Exporter Image'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
