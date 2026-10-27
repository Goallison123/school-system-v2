import { useMemo, useState } from 'react';
import { FileSpreadsheet, Search, Users, Phone, Mail } from 'lucide-react';
import type { Contact } from '@/types';

export default function Contacts({
  contacts,
  onExport,
}: {
  contacts: Contact[];
  onExport: (format: 'xls' | 'ods') => void;
}) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const availableClasses = useMemo(() => {
    return [...new Set(contacts.map((c) => c.class_name).filter(Boolean))].sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return contacts.filter((contact) => {
      const matchesQuery = !query || [
        contact.parent_name,
        contact.student_name,
        contact.class_name,
        contact.phone,
        contact.email,
      ].some((value) => value.toLocaleLowerCase().includes(query));
      const matchesClass = !classFilter || contact.class_name === classFilter;
      return matchesQuery && matchesClass;
    });
   }, [contacts, search, classFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pagedContacts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  // reset page on search
  useMemo(() => { setCurrentPage(1); }, [search, classFilter]);

  return (
    <div className="data-workspace space-y-4">
      {/* Title & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Parent Contact Directory
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Phone numbers and email addresses for enrolled students' parents
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          <button type="button" onClick={() => onExport('xls')} className="btn-enterprise-excel justify-center py-2.5 text-[12px]"><FileSpreadsheet size={14} /> Export Excel</button>
          <button type="button" onClick={() => onExport('ods')} className="btn-enterprise-cancel justify-center py-2.5 text-[12px] border">Export ODS</button>
        </div>
      </div>

            {/* Filter strip - clean */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search parent, student, phone..." value={search} onChange={(event) => setSearch(event.target.value)} className="form-input w-full pl-9 py-2.5 text-[13px] rounded-lg" />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="form-select w-full py-2.5 text-[13px] rounded-lg">
          <option value="">-- All Class Streams --</option>
          {availableClasses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

           {/* DESKTOP TABLE */}
      <div className="hidden md:block system-table-wrap border border-slate-200 rounded-xl overflow-hidden">
        <table className="system-table">
          <thead><tr><th>Parent / Guardian</th><th>Student</th><th>Class</th><th>Phone</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>
            {pagedContacts.length > 0 ? pagedContacts.map((contact) => (
              <tr key={contact.id}>
                <td className="font-semibold text-slate-900 text-[13px]">{contact.parent_name || 'Not provided'}</td>
                <td className="text-[13px]">{contact.student_name || '—'}</td>
                <td className="text-[12px] font-medium">{contact.class_name || '—'}</td>
                <td className="font-mono text-[12px]">{contact.phone || <span className="text-slate-400 italic">No phone</span>}</td>
                <td className="text-[12px] text-slate-600 truncate max-w-[180px]">{contact.email || '—'}</td>
                <td><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Verified</span></td>
              </tr>
            )) : <tr><td colSpan={6} className="text-center py-10 text-slate-500">No contacts found</td></tr>}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS - clean, clear boundaries, nice font */}
      <div className="md:hidden space-y-2.5">
        {pagedContacts.length > 0 ? pagedContacts.map((contact) => (
          <div key={contact.id} className="bg-white border border-slate-200 rounded-[12px] p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[13.5px] leading-tight text-slate-900 tracking-[-0.01em] truncate">{contact.parent_name || 'Not provided'}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Student: <span className="font-medium text-slate-700">{contact.student_name}</span> • {contact.class_name}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Verified</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <a href={contact.phone ? `tel:${contact.phone}` : undefined} className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                <Phone size={14} className="text-slate-500"/><span className="text-[12.5px] font-mono font-medium text-slate-800">{contact.phone || 'No phone'}</span>
              </a>
              {contact.email && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                  <Mail size={14} className="text-slate-500"/><span className="text-[12px] text-slate-700 truncate">{contact.email}</span>
                </div>
              )}
            </div>
          </div>
        )) : <div className="bg-white border border-dashed rounded-xl p-8 text-center"><Users size={20} className="mx-auto text-slate-300 mb-2"/><p className="text-sm text-slate-500">No contacts found</p></div>}
      </div>

      {/* PAGINATION FOOTER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 pt-3 border-t border-slate-200">
        <span className="text-[11px]">Showing {(currentPage-1)*itemsPerPage+1}-{Math.min(currentPage*itemsPerPage, filtered.length)} of <strong className="font-mono text-slate-800">{filtered.length}</strong></span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)} className="flex-1 sm:flex-none h-9 px-4 border rounded-lg bg-white disabled:opacity-40 font-medium">Prev</button>
            <div className="flex gap-1 mx-1">
              {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                let n = totalPages<=5 ? i+1 : currentPage<=3 ? i+1 : currentPage>=totalPages-2 ? totalPages-4+i : currentPage-2+i;
                return <button key={n} onClick={() => setCurrentPage(n)} className={`w-8 h-8 rounded-lg text-xs font-bold border ${currentPage===n ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600'}`}>{n}</button>
              })}
            </div>
            <button disabled={currentPage===totalPages} onClick={() => setCurrentPage(p=>p+1)} className="flex-1 sm:flex-none h-9 px-4 border rounded-lg bg-white disabled:opacity-40 font-medium">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
