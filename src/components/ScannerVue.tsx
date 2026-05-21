import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { doc, getDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Ticket } from '../types';
import { ShieldAlert, CheckCircle2, XCircle, PowerOff } from 'lucide-react';

export default function ScannerVue() {
  const [scanActive, setScanActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [lastScanned, setLastScanned] = useState<Ticket | null>(null);
  const [isScanningState, setIsScanningState] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<any> | null>(null);

  const isProcessingRef = useRef(false);
  const handleScanRef = useRef<any>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  const resetState = () => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    setStatus('idle');
    setLastScanned(null);
    setMessage('');
    isProcessingRef.current = false;
  };

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists() && snap.data().scanActive !== undefined) {
        setScanActive(snap.data().scanActive);
      }
    });
    return () => unsubSettings();
  }, []);

  const handleScan = async (decodedText: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // Clear any previous timer
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);

    try {
      const ticketRef = doc(db, 'tickets', decodedText);
      const ticketSnap = await getDoc(ticketRef);
      
      if (!ticketSnap.exists()) {
        setStatus('error');
        setMessage("Billet introuvable ! Ce QR code n'est pas dans la base.");
        timeoutIdRef.current = setTimeout(() => {
          resetState();
        }, 5000);
        return;
      }
      
      const ticketData = ticketSnap.data() as Ticket;
      setLastScanned(ticketData);

      let isSuccess = false;
      if (ticketData.scanned) {
        setStatus('error');
        setMessage(`Ce billet a DÉJÀ ÉTÉ UTILISÉ.`);
      } else {
        // Attempt to validate
        await updateDoc(ticketRef, {
          scanned: true,
          scannedAt: serverTimestamp()
        });
        setStatus('success');
        setMessage(`Accès autorisé ! Billet validé.`);
        isSuccess = true;
      }
      
      // Success auto-destruct is very short (1 second) to allow continuous quick scans
      // Error stays longer but can be dismissed with a tap
      timeoutIdRef.current = setTimeout(() => {
        resetState();
      }, isSuccess ? 1000 : 5000);

    } catch (err: any) {
      setStatus('error');
      setMessage("Erreur de validation. " + (err.message.includes("permission") ? "Le scan n'est peut-être pas activé globalement." : err.message));
      timeoutIdRef.current = setTimeout(() => {
        resetState();
      }, 5000);
    }
  };

  // Keep ref to latest handleScan to avoid closure stale state
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  useEffect(() => {
    let isMounted = true;

    if (scanActive && !isScanningState && !scannerRef.current) {
      const initScanner = async () => {
        try {
          const html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;
          startPromiseRef.current = html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (text) => {
              if (isMounted && handleScanRef.current) {
                handleScanRef.current(text);
              }
            },
            () => {} // ignore read errors
          );
          await startPromiseRef.current;
          if (isMounted) {
            setIsScanningState(true);
          }
        } catch (err: any) {
          console.error("Camera error", err);
          if (isMounted) {
            setCameraError(err.message || "Erreur d'accès à la caméra");
            setIsScanningState(false);
          }
          scannerRef.current = null;
          startPromiseRef.current = null;
        }
      };
      initScanner();
    }

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        const startPromise = startPromiseRef.current;
        
        scannerRef.current = null;
        startPromiseRef.current = null;
        setIsScanningState(false);

        const performStop = async () => {
          try {
            if (startPromise) {
               await startPromise.catch(() => {});
            }
            if (scanner.getState && scanner.getState() === 2) {
              await scanner.stop();
            }
            scanner.clear();
          } catch (err) {
            console.log("Stop error:", err);
          }
        };
        
        performStop();
      }
    };
  }, [scanActive]);

  if (!scanActive) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-zinc-500 p-8 text-center max-w-sm mx-auto">
        <PowerOff className="w-16 h-16 mb-6 text-zinc-300 dark:text-zinc-700" />
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Scan Désactivé</h2>
        <p>Le scan des billets n'est pas autorisé pour le moment. Veuillez l'activer depuis le tableau de bord.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-center justify-between">
        <div>
           <h2 className="text-xl font-bold">Contrôle d'Accès</h2>
           <p className="text-sm text-zinc-500">Pointez la caméra vers le QR Code</p>
        </div>
        <ShieldCheckIndicator status={status} />
      </div>

      {cameraError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-center animate-in fade-in">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-red-500" />
          <p className="font-semibold mb-1">Accès Caméra Refusé</p>
          <p className="text-sm mt-2 opacity-90">
            L'accès à la caméra est bloqué dans cet environnement sécurisé.
          </p>
          <p className="text-sm font-medium mt-3 text-red-800 dark:text-red-200">
            Veuillez ouvrir l'application dans un nouvel onglet pour utiliser le scanner (cliquez sur "Open App" en haut à droite).
          </p>
          <button onClick={() => window.open(window.location.href, '_blank')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white font-medium rounded-lg text-sm w-full transition-colors">
            Ouvrir dans un nouvel onglet
          </button>
        </div>
      )}

      <div className={`overflow-hidden rounded-2xl border-4 transition-colors ${status === 'idle' ? 'border-zinc-200 dark:border-zinc-700' : status === 'success' ? 'border-green-500' : 'border-red-500'}`}>
        {/* Camera placeholder/container */}
        <div id="reader" className="w-full bg-black aspect-square object-cover" />
      </div>

      {status !== 'idle' && (
        <div 
          onClick={resetState}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
        >
          {status === 'success' ? (
            /* Petit popup vert */
            <div className="bg-emerald-650 dark:bg-emerald-600 text-white p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center flex flex-col items-center animate-in zoom-in-95 duration-200 cursor-default" onClick={e => e.stopPropagation()}>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 animate-bounce">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-wider">BILLET VALIDE</h3>
              <p className="text-sm opacity-90 mt-2 font-medium">{message}</p>
              
              {lastScanned && (
                <div className="mt-5 p-4 bg-white/10 dark:bg-white/5 rounded-2xl w-full text-center">
                  <p className="font-extrabold text-xl">{lastScanned.lastName} {lastScanned.firstName}</p>
                  <p className="text-sm opacity-85 mt-0.5">{lastScanned.studentClass}</p>
                </div>
              )}
            </div>
          ) : (
            /* Gros popup rouge */
            <div className="bg-red-650 dark:bg-red-600 text-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-md w-full text-center flex flex-col items-center animate-in zoom-in-95 duration-200 border-4 border-white cursor-default" onClick={e => e.stopPropagation()}>
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <XCircle className="w-16 h-16 text-white" />
              </div>
              <h3 className="text-4xl font-black tracking-widest">ACCÈS REFUSÉ</h3>
              <p className="text-xl font-bold mt-4 leading-relaxed">{message}</p>
              
              {lastScanned && (
                <div className="mt-6 p-6 bg-black/25 rounded-2xl w-full text-left">
                  <span className="text-xs uppercase tracking-widest opacity-60 font-semibold block">Élève ID</span>
                  <p className="font-black text-2xl mt-1">{lastScanned.lastName} {lastScanned.firstName}</p>
                  <p className="text-lg opacity-90 mt-1">{lastScanned.studentClass}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white text-red-600 uppercase">
                    Déjà scanné
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShieldCheckIndicator({ status }: { status: 'idle' | 'success' | 'error' }) {
  if (status === 'success') return <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-500"><CheckCircle2 className="w-6 h-6" /></div>;
  if (status === 'error') return <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500"><ShieldAlert className="w-6 h-6" /></div>;
  return <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
    <div className="w-4 h-4 bg-zinc-400 rounded-full animate-pulse" />
  </div>;
}
