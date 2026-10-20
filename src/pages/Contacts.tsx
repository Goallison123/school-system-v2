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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onExport('xls')}
            className="btn-enterprise-excel"
          >
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          <button
            type="button"
            onClick={() => onExport('ods')}
            className="btn-enterprise-cancel text-xs"
          >
            Export ODS
          </button>
        </div>
      </div>

      {/* Filter strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            aria-label="Search parent records"
            placeholder="Search parent name, student, phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="form-input w-full pl-8"
          />
        </div>
        <div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="form-select w-full"
          >
            <option value="">-- All Class Streams --</option>
            {availableClasses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabular Table */}
      <div className="system-table-wrap">
        <table className="system-table">
          <thead>
            <tr>
              <th>Parent / Guardian Name</th>
              <th>Pupil / Student</th>
              <th>Class Stream</th>
              <th>Primary Contact Telephone</th>
              <th>Email Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((contact) => (
                <tr key={contact.id}>
                  <td className="font-semibold text-slate-900">
                    {contact.parent_name || 'Not provided'}
                  </td>
                  <td>{contact.student_name || '—'}</td>
                  <td>
                    <span className="font-medium text-slate-700">{contact.class_name || '—'}</span>
                  </td>
                  <td className="font-mono text-xs">
                    {contact.phone ? (
                      <span className="inline-flex items-center gap-1 text-slate-800">
                        <Phone size={12} className="text-slate-400" /> {contact.phone}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">No phone</span>
                    )}
                  </td>
                  <td className="text-xs text-slate-600">
                    {contact.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail size={12} className="text-slate-400" /> {contact.email}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td>
                    <span className="status-pill status-pill-paid">Verified</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">
                  <Users size={24} className="mx-auto mb-2 text-slate-400" />
                  {contacts.length ? 'No matching parent contact records found.' : 'No parent contacts currently registered.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span>Verified Contacts: <strong className="font-mono font-bold text-slate-800">{filtered.length}</strong></span>
        <span className="text-[11px]">Synced automatically with the School Student Registry</span>
      </div>
    </div>
  );
}
