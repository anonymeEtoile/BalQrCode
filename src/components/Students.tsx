import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Ticket } from '../types';
import { Search, Eye, CheckCircle, Download, Users, Trash2, RotateCcw, FileSpreadsheet, FolderDown, Loader2 } from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import * as htmlToImage from 'html-to-image';

type SortField = 'name' | 'class' | 'date';
type SortOrder = 'asc' | 'desc';

export default function Students() {
  const [tickets, setTickets] = useState<(Ticket & { id: string, hasPendingWrites?: boolean })[]>([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewTicket, setViewTicket] = useState<(Ticket & { id: string }) | null>(null);
  const [deleteConfirmTicket, setDeleteConfirmTicket] = useState<{ id: string, name: string } | null>(null);

  const qrRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isZipExporting, setIsZipExporting] = useState(false);

  useEffect(() => {
    const unsubTickets = onSnapshot(collection(db, 'tickets'), { includeMetadataChanges: true }, (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, hasPendingWrites: d.metadata.hasPendingWrites, ...d.data() } as (Ticket & { id: string, hasPendingWrites?: boolean }))));
    });
    return () => unsubTickets();
  }, []);

  const filteredAndSortedTickets = useMemo(() => {
    let result = tickets;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => 
        t.firstName.toLowerCase().includes(q) || 
        t.lastName.toLowerCase().includes(q) || 
        t.studentClass.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
        const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
        comparison = nameA.localeCompare(nameB);
      } else if (sortField === 'class') {
        comparison = a.studentClass.localeCompare(b.studentClass);
      } else if (sortField === 'date') {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        comparison = timeA - timeB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [tickets, search, sortField, sortOrder]);

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
      alert("Erreur lors de l'exportation");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (tickets.length === 0) return;
    const headers = ['ID Billet', 'Nom', 'Prénom', 'Classe', 'Statut', 'Date d\'entrée', 'Montant Payé (€)', 'Date d\'achat'];
    const rows = tickets.map(t => {
      const status = t.scanned ? 'Scanné' : 'En attente';
      const entryDate = t.scannedAt?.toDate ? t.scannedAt.toDate().toLocaleString('fr-FR') : (t.scannedAt ? new Date(t.scannedAt).toLocaleString('fr-FR') : '');
      const purchaseDate = t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString('fr-FR') : (t.createdAt ? new Date(t.createdAt).toLocaleString('fr-FR') : '');
      const amountVal = t.amount !== undefined ? `${t.amount} €` : '5 €';
      
      return [
        t.id || '',
        t.lastName,
        t.firstName,
        t.studentClass,
        status,
        entryDate,
        amountVal,
        purchaseDate
      ];
    });

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export_eleves_bal_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllQRs = async () => {
    if (tickets.length === 0) return;
    setIsZipExporting(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      let addedCount = 0;
      for (const t of tickets) {
        const qrCanvas = document.getElementById(`qr-canvas-${t.id}`) as HTMLCanvasElement | null;
        if (qrCanvas) {
          // Create high-resolution offscreen ticket pass canvas
          const canvas = document.createElement('canvas');
          canvas.width = 500;
          canvas.height = 700;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Fill background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 500, 700);

            // Outer elegant border
            ctx.strokeStyle = '#E4E4E7'; // zinc-200
            ctx.lineWidth = 12;
            ctx.strokeRect(6, 6, 488, 688);

            // Inner light double line
            ctx.strokeStyle = '#F4F4F5'; // zinc-100
            ctx.lineWidth = 2;
            ctx.strokeRect(18, 18, 464, 664);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            // Event stamp label
            ctx.fillStyle = '#71717A'; // zinc-500
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText("BILLET ÉLECTRONIQUE", 250, 42);

            // Student Full Name
            ctx.fillStyle = '#18181B'; // zinc-900
            const fullName = `${t.lastName.toUpperCase()} ${t.firstName}`;
            let nameFontSize = 26;
            ctx.font = `bold ${nameFontSize}px Inter, sans-serif`;
            while (ctx.measureText(fullName).width > 420 && nameFontSize > 16) {
              nameFontSize -= 2;
              ctx.font = `bold ${nameFontSize}px Inter, sans-serif`;
            }
            ctx.fillText(fullName, 250, 72);

            // Student Class
            ctx.fillStyle = '#52525B'; // zinc-600
            ctx.font = '600 18px Inter, sans-serif';
            ctx.fillText(t.studentClass, 250, 118);

            // Upper Divider
            ctx.beginPath();
            ctx.strokeStyle = '#E4E4E7';
            ctx.lineWidth = 1.5;
            ctx.moveTo(50, 158);
            ctx.lineTo(450, 158);
            ctx.stroke();

            // Render raw QR code in the middle container
            ctx.drawImage(qrCanvas, 100, 188, 300, 300);

            // Lower Divider
            ctx.beginPath();
            ctx.strokeStyle = '#E4E4E7';
            ctx.lineWidth = 1.5;
            ctx.moveTo(50, 515);
            ctx.lineTo(450, 515);
            ctx.stroke();

            // Bottom title
            ctx.fillStyle = '#09090B'; // zinc-950
            ctx.font = '900 24px Inter, sans-serif';
            ctx.fillText("Bal LMMF", 250, 538);

            // Ticket unique reference
            ctx.fillStyle = '#71717A';
            ctx.font = '12px monospace';
            ctx.fillText(t.id, 250, 584);

            // Secure stamp / Status & price
            ctx.fillStyle = '#059669'; // emerald-600
            ctx.font = 'bold 13px Inter, sans-serif';
            const amountVal = t.amount !== undefined ? `${t.amount} €` : '5 €';
            ctx.fillText(`STATUT : PAYÉ • ACCÈS UNIQUE (${amountVal})`, 250, 618);

            const dataUrl = canvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1];
            
            const safeLastName = t.lastName.toUpperCase().trim().replace(/[^a-zA-Z0-9]/g, '_');
            const safeFirstName = t.firstName.trim().replace(/[^a-zA-Z0-9]/g, '_');
            const safeClass = t.studentClass.trim().replace(/[^a-zA-Z0-9]/g, '_');
            
            zip.file(`BILLET_${safeLastName}_${safeFirstName}_${safeClass}.png`, base64Data, { base64: true });
            addedCount++;
          }
        }
      }
      
      if (addedCount === 0) {
        alert("Erreur: Les QR codes ne sont pas encore prêts.");
        return;
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `billets_eleves_bal_${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erreur lors de la génération du ZIP", err);
      alert("Une erreur s'est produite lors de la création du fichier ZIP.");
    } finally {
      setIsZipExporting(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteConfirmTicket({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTicket) return;
    try {
      await deleteDoc(doc(db, 'tickets', deleteConfirmTicket.id));
      setDeleteConfirmTicket(null);
    } catch (err) {
      console.error("Erreur lors de la suppression", err);
      alert("Erreur lors de la suppression");
    }
  };

  const handleResetScan = async (ticketId: string) => {
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        scanned: false,
        scannedAt: null
      });
    } catch (err) {
      console.error("Erreur de réinitialisation", err);
      alert("Erreur lors de la réinitialisation du statut de scan.");
    }
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="opacity-0 group-hover:opacity-50">↕</span>;
    return <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Tous les Élèves</h2>
            <p className="text-zinc-500">Gérez, recherchez et exportez les billets des participants.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportCSV}
            disabled={tickets.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer disabled:pointer-events-none"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exporter Tableau (CSV)</span>
          </button>
          
          <button
            onClick={handleExportAllQRs}
            disabled={isZipExporting || tickets.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 dark:text-zinc-900 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer disabled:pointer-events-none"
          >
            {isZipExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderDown className="w-4 h-4" />
            )}
            <span>{isZipExporting ? 'Zip en cours...' : 'Télécharger tous les QRs (ZIP)'}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700">
        <div className="relative w-full sm:w-80">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Rechercher élève ou classe..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
        </div>
        <div className="text-sm text-zinc-500">
          {filteredAndSortedTickets.length} élève{filteredAndSortedTickets.length !== 1 ? 's' : ''} trouvé{filteredAndSortedTickets.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {/* Desktop View (Standard Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-700">
                <th 
                  className="px-6 py-3 text-sm font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 group"
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center gap-1">Nom Prénom <SortIndicator field="name" /></div>
                </th>
                <th 
                  className="px-6 py-3 text-sm font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 group"
                  onClick={() => toggleSort('class')}
                >
                  <div className="flex items-center gap-1">Classe <SortIndicator field="class" /></div>
                </th>
                <th className="px-6 py-3 text-sm font-medium text-zinc-500">Statut</th>
                <th 
                  className="px-6 py-3 text-sm font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 group"
                  onClick={() => toggleSort('date')}
                >
                  <div className="flex items-center gap-1">Date d'achat <SortIndicator field="date" /></div>
                </th>
                <th className="px-6 py-3 text-sm font-medium text-zinc-500 text-right">QR Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {filteredAndSortedTickets.map(t => (
                <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4 font-medium">
                    {t.lastName} {t.firstName}
                    {t.hasPendingWrites && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                        Pas synchronisé
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{t.studentClass}</td>
                  <td className="px-6 py-4">
                    {t.scanned ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="w-3.5 h-3.5"/> Scanné
                        </span>
                        <button 
                          onClick={() => handleResetScan(t.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 rounded-lg transition-colors border border-amber-200/50 dark:border-amber-800/50 cursor-pointer"
                          title="Réinitialiser le scan"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Réinit.</span>
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                        En attente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-500">
                    {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setViewTicket(t)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer" title="Voir">
                      <Eye className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDeleteClick(t.id, `${t.firstName} ${t.lastName}`)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors ml-2 cursor-pointer" title="Supprimer">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAndSortedTickets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">Aucun élève trouvé.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Touch-Optimized Responsive Cards Layout) */}
        <div className="block md:hidden divide-y divide-zinc-200 dark:divide-zinc-700 bg-white dark:bg-zinc-800">
          {filteredAndSortedTickets.map(t => (
            <div key={t.id} className="p-5 flex flex-col gap-3.5">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-[16px] text-zinc-900 dark:text-white truncate">
                    {t.lastName} {t.firstName}
                  </h4>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold mt-0.5">{t.studentClass}</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                    Acheté le : {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('fr-FR') : '—'}
                  </p>
                </div>
                <div className="shrink-0">
                  {t.scanned ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-905/30 dark:text-green-400">
                      <CheckCircle className="w-3.5 h-3.5 text-green-650" /> Scanné
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      En attente
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-700/50 gap-2">
                <div className="flex gap-2">
                  <button 
                    onClick={() => setViewTicket(t)} 
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-650 rounded-xl text-zinc-700 dark:text-zinc-200 font-bold text-xs active:scale-95 transition-all cursor-pointer min-h-[44px]"
                    title="Voir ticket"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Billet</span>
                  </button>

                  {t.scanned && (
                    <button 
                      onClick={() => handleResetScan(t.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50 rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer min-h-[44px]"
                      title="Réinitialiser le scan"
                    >
                      <RotateCcw className="w-4 h-4 animate-reverse" />
                      <span>Réinit.</span>
                    </button>
                  )}
                </div>

                <button 
                  onClick={() => handleDeleteClick(t.id, `${t.firstName} ${t.lastName}`)} 
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-xl text-red-600 dark:text-red-450 border border-red-200/30 dark:border-red-900/30 font-bold text-xs active:scale-95 transition-all cursor-pointer ml-auto min-h-[44px]"
                  title="Supprimer l'élève"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Suppr.</span>
                </button>
              </div>
            </div>
          ))}
          {filteredAndSortedTickets.length === 0 && (
            <div className="p-8 text-center text-zinc-500 text-sm">Aucun élève trouvé.</div>
          )}
        </div>
      </div>

      {viewTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-800 p-6 md:p-8 rounded-3xl shadow-xl max-w-sm w-full relative">
            <h3 className="text-xl font-bold mb-4 text-center">Billet Électronique</h3>
            
            <div 
              ref={qrRef} 
              className="bg-white text-zinc-900 p-6 rounded-2xl border border-zinc-200 mb-6 flex flex-col items-center shadow-sm"
              style={{ padding: '2rem' }} /* Force spacing for image export */
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
                className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white font-medium py-3 rounded-xl transition-colors"
              >
                Fermer
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {isExporting ? 'Export...' : 'Exporter Image'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-800 p-6 md:p-8 rounded-3xl shadow-xl max-w-sm w-full relative">
            <h3 className="text-xl font-bold mb-2">Confirmation</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Voulez-vous vraiment supprimer le billet de <strong className="text-zinc-900 dark:text-white">{deleteConfirmTicket.name}</strong> ?<br/><br/>Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirmTicket(null)} 
                className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white font-medium py-3 rounded-xl transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-xl transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conteneur caché de génération des QR Code Canvas pour l'export en masse (PNG) */}
      <div 
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: 0, height: 0, overflow: 'hidden' }}
        aria-hidden="true"
      >
        {tickets.map(t => (
          <QRCodeCanvas
            key={t.id}
            id={`qr-canvas-${t.id}`}
            value={t.id}
            size={400}
            includeMargin={true}
          />
        ))}
      </div>
    </div>
  );
}
