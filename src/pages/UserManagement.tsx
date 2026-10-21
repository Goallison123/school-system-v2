import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Search, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SchoolRole = 'dean_of_studies' | 'headteacher' | 'teacher' | 'it';
type SchoolUser = { id: string; email: string; full_name: string; role: SchoolRole };
const roles: SchoolRole[] = ['dean_of_studies', 'headteacher', 'teacher', 'it'];
const roleLabel: Record<SchoolRole, string> = {
  dean_of_studies: 'Dean of Studies',
  headteacher: 'Headteacher',
  teacher: 'Teacher',
  it: 'IT administrator',
};

export default function UserManagement() {
  const [users, setUsers] = useState<SchoolUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, SchoolRole>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      if (!supabase) { setError('Staff accounts are unavailable right now. Please try again later.'); setLoading(false); return; }
      const { data, error: queryError } = await supabase.from('users').select('id, email, full_name, role').order('full_name').order('email');
      if (cancelled) return;
      if (queryError) {
        console.error('Could not load staff accounts', queryError);
        setError('We couldn’t load staff accounts. Please try again later.');
      }
      else {
        const records = (data ?? []) as SchoolUser[];
        setUsers(records);
        setDraftRoles(Object.fromEntries(records.map((user) => [user.id, user.role])));
      }
      setLoading(false);
    }
    void loadUsers();
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => `${user.full_name} ${user.email} ${roleLabel[user.role]}`.toLowerCase().includes(query));
  }, [users, search]);

  async function saveRole(user: SchoolUser) {
    if (!supabase) return;
    const role = draftRoles[user.id];
    if (!roles.includes(role) || role === user.role) return;
    setSavingId(user.id);
    setError('');
    setNotice('');
    const { data, error: updateError } = await supabase.from('users').update({ role }).eq('id', user.id).select('id, email, full_name, role').maybeSingle();
    setSavingId('');
    if (updateError || !data) {
      if (updateError) console.error('Could not update staff access', updateError);
      setError('We couldn’t save this change. Please try again or ask IT for help.');
      setDraftRoles((current) => ({ ...current, [user.id]: user.role }));
      return;
    }
    const updated = data as SchoolUser;
    setUsers((current) => current.map((existing) => existing.id === user.id ? updated : existing));
    setNotice(`${updated.full_name || updated.email} is now ${roleLabel[updated.role]}.`);
  }

  return <div className="space-y-5 text-stone-800">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-[#C59B27]">Staff access</p><h1 className="mt-1 text-2xl font-bold text-stone-900 sm:text-3xl">Staff roles</h1><p className="mt-1 text-sm text-stone-500">Choose what each staff member can access.</p></div>
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
        <label className="relative block w-full max-w-sm"><Search size={16} className="absolute left-3 top-2.5 text-stone-400"/><input aria-label="Search school users" className="w-full rounded-lg border border-stone-200 py-2 pl-9 pr-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or role"/></label>
        <span className="text-xs text-stone-500">{users.length} accounts</span>
      </div>
      {error && <p role="alert" className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="m-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {loading ? <div className="flex items-center gap-2 p-10 text-sm text-stone-500"><LoaderCircle className="animate-spin" size={18}/>Loading staff accounts…</div>
        : filteredUsers.length ? <div className="divide-y divide-stone-100">{filteredUsers.map((user) => <div key={user.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#3A2818]/10 text-[#3A2818]"><Users size={17}/></div><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-stone-900">{user.full_name || 'Name not provided'}</strong><span className="block truncate text-xs text-stone-500">{user.email}</span></div><label className="flex items-center gap-2 text-xs font-medium text-stone-600"><span>Role</span><select aria-label={`Role for ${user.email}`} value={draftRoles[user.id] ?? user.role} onChange={(event) => setDraftRoles((current) => ({ ...current, [user.id]: event.target.value as SchoolRole }))} className="min-w-44 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">{roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></label><button onClick={() => void saveRole(user)} disabled={savingId === user.id || draftRoles[user.id] === user.role} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#3A2818] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{savingId === user.id ? <LoaderCircle className="animate-spin" size={14}/> : <ShieldCheck size={14}/>}Save changes</button></div>)}</div>
        : <div className="p-10 text-center"><Users className="mx-auto text-stone-300" size={26}/><p className="mt-2 text-sm text-stone-500">No user accounts match this search.</p></div>}
      <footer className="border-t border-stone-100 bg-stone-50 px-5 py-3 text-xs text-stone-500">New accounts registered by SYBELLA SYSTEMS LTD are automatically assigned a teacher's role by the system. The school IT is therefore responsible for ensuring everyone has the right access. The IT can manage staff roles.</footer>
    </section>
  </div>;
}
