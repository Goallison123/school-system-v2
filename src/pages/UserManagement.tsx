import { useEffect, useMemo, useState, useCallback } from 'react';
import { LoaderCircle, Search, ShieldCheck, Users, GraduationCap, X, Check, Crown, Briefcase, HardDrive } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SchoolRole = 'dean_of_studies' | 'headteacher' | 'teacher' | 'it';
type SchoolUser = { id: string; email: string; full_name: string; role: SchoolRole };
type Assignment = { teacher_id: string; class_name: string };

const roleConfig: Record<SchoolRole, { label: string; icon: any; color: string }> = {
  dean_of_studies: { label: 'Dean of Studies', icon: Crown, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  headteacher: { label: 'Headteacher', icon: Briefcase, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  teacher: { label: 'Teacher', icon: GraduationCap, color: 'bg-amber-50 text-amber-800 border-amber-200' },
  it: { label: 'IT Administrator', icon: HardDrive, color: 'bg-stone-800 text-white border-stone-800' },
};

type Props = { currentRole: SchoolRole; currentUserId?: string };

export default function UserManagement({ currentRole, currentUserId }: Props) {
  const [allUsers, setAllUsers] = useState<SchoolUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, SchoolRole>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [assignUser, setAssignUser] = useState<SchoolUser | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [savingId, setSavingId] = useState('');

  const isDean = currentRole === 'dean_of_studies';
  const isIT = currentRole === 'it';

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const [u, c, a] = await Promise.all([
        supabase.from('users').select('id, email, full_name, role').order('full_name'),
        supabase.from('school_students').select('class_name'),
        supabase.from('teacher_class_assignments').select('teacher_user_id, class_name'),
      ]);
      if (u.error) throw u.error;
      const records = (u.data ?? []).map((r: any) => ({
        id: r.id,
        email: r.email,
        full_name: r.full_name || r.email.split('@')[0],
        role: String(r.role || 'teacher').toLowerCase().replace(/ /g, '_') as SchoolRole,
      })) as SchoolUser[];
      setAllUsers(records);
      setDraftRoles(Object.fromEntries(records.map((x) => [x.id, x.role])));
      setClasses([...new Set((c.data ?? []).map((x: any) => x.class_name).filter(Boolean))].sort() as string[]);
      setAssignments((a.data ?? []).map((x: any) => ({ teacher_id: x.teacher_user_id, class_name: x.class_name })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const users = useMemo(() => {
    if (isIT) return allUsers;
    if (isDean) return allUsers.filter((u) => u.role === 'teacher');
    return allUsers;
  }, [allUsers, isDean, isIT]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.full_name} ${u.email} ${u.role}`.toLowerCase().includes(q));
  }, [users, search]);

  const stats = useMemo(() => ({
    teachers: allUsers.filter(u => u.role === 'teacher').length,
    assigned: new Set(assignments.map(a => a.teacher_id)).size,
    unassigned: allUsers.filter(u => u.role === 'teacher').filter(t => !assignments.some(a => a.teacher_id === t.id)).length,
  }), [allUsers, assignments]);

  function openAssign(user: SchoolUser) {
    setAssignUser(user);
    setSelectedClasses(assignments.filter((a) => a.teacher_id === user.id).map((a) => a.class_name));
  }

  async function saveAssignments() {
    if (!assignUser || !supabase) return;
    setAssignBusy(true);
    setError('');
    try {
      await supabase.from('teacher_class_assignments').delete().eq('teacher_user_id', assignUser.id);
      if (selectedClasses.length) {
        const rows = selectedClasses.map((class_name) => ({ teacher_user_id: assignUser.id, class_name, created_by: currentUserId }));
        const { error } = await supabase.from('teacher_class_assignments').insert(rows);
        if (error) throw error;
      }
      setAssignments((prev) => [...prev.filter((a) => a.teacher_id !== assignUser.id), ...selectedClasses.map((class_name) => ({ teacher_id: assignUser.id, class_name }))]);
      setNotice(`${assignUser.full_name} • ${selectedClasses.length} classes saved`);
      setAssignUser(null);
      setTimeout(() => setNotice(''), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssignBusy(false);
    }
  }

  async function saveRole(user: SchoolUser) {
    if (isDean) return;
    const role = draftRoles[user.id];
    if (role === user.role) return;
    setSavingId(user.id);
    const { error } = await supabase.from('users').update({ role }).eq('id', user.id);
    setSavingId('');
    if (error) { setError(error.message); return; }
    setAllUsers((c) => c.map((x) => x.id === user.id ? { ...x, role } : x));
    setNotice(`${user.full_name} is now ${roleConfig[role].label}`);
    setTimeout(() => setNotice(''), 3000);
  }

  const getAssigned = (id: string) => assignments.filter((a) => a.teacher_id === id).map((a) => a.class_name);

  return (
    <div className="space-y-6 text-stone-800">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#C59B27]">{isDean ? 'Class Management' : 'Access Control'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{isDean ? 'Teacher Class Assignments' : 'Staff Roles & Assignments'}</h1>
          <p className="mt-1.5 text-sm text-stone-500">{isDean ? 'Assign classes to teachers for Mid-term access' : 'Manage who can access what and which classes teachers see'}</p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-xl border bg-white px-3 py-2 text-center min-w-[70px]"><p className="text-[10px] uppercase text-stone-400">Teachers</p><p className="text-lg font-bold">{stats.teachers}</p></div>
          <div className="rounded-xl border bg-white px-3 py-2 text-center min-w-[70px]"><p className="text-[10px] uppercase text-stone-400">Assigned</p><p className="text-lg font-bold text-emerald-700">{stats.assigned}</p></div>
          {stats.unassigned > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center min-w-[70px]"><p className="text-[10px] uppercase text-amber-700">Pending</p><p className="text-lg font-bold text-amber-800">{stats.unassigned}</p></div>}
        </div>
      </div>

      {/* Card */}
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row sm:items-center sm:justify-between bg-stone-50/50">
          <label className="relative block w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#3A2818] focus:ring-2 focus:ring-[#3A2818]/10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teacher, email..." />
          </label>
          <span className="text-xs text-stone-500">{filteredUsers.length} {isDean ? 'teachers' : 'staff members'} • {classes.length} classes available</span>
        </div>

        {error && <div className="m-4 rounded-xl bg-rose-50 border border-rose-100 p-3 text-sm text-rose-800">{error}</div>}
        {notice && <div className="m-4 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800">{notice}</div>}

        {loading ? <div className="flex items-center justify-center gap-2 p-16 text-sm text-stone-500"><LoaderCircle className="animate-spin" size={18} /> Loading staff...</div>
          : <div className="divide-y divide-stone-100">
            {filteredUsers.map((user) => {
              const assigned = getAssigned(user.id);
              const conf = roleConfig[user.role];
              const Icon = conf.icon;
              return (
                <div key={user.id} className="group flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center hover:bg-stone-50/70 transition">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#3A2818] text-white font-bold text-sm shrink-0">{user.full_name[0]?.toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="truncate text-[13px] font-semibold">{user.full_name}</strong>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${conf.color}`}><Icon size={10} />{conf.label}</span>
                      </div>
                      <span className="block truncate text-xs text-stone-500">{user.email}</span>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {assigned.length > 0 ? assigned.map((c) => <span key={c} className="rounded-full bg-[#3A2818] px-2.5 py-1 text-[11px] font-semibold text-white">{c}</span>) : <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] text-amber-800">No class assigned</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:ml-auto">
                    {isIT ? (
                      <>
                        <select value={draftRoles[user.id] ?? user.role} onChange={(e) => setDraftRoles((p) => ({ ...p, [user.id]: e.target.value as SchoolRole }))} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs font-medium outline-none focus:border-[#3A2818]">
                          <option value="teacher">Teacher</option><option value="dean_of_studies">Dean</option><option value="headteacher">Headteacher</option><option value="it">IT Admin</option>
                        </select>
                        <button onClick={() => void saveRole(user)} disabled={savingId === user.id || draftRoles[user.id] === user.role} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3A2818] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-[#4a2c19] transition">
                          <ShieldCheck size={14} />{savingId === user.id ? '...' : 'Save'}
                        </button>
                      </>
                    ) : null}
                    <button onClick={() => openAssign(user)} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-semibold hover:bg-stone-900 hover:text-white transition">
                      <GraduationCap size={14} /> {assigned.length ? `${assigned.length} classes` : 'Assign'}
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredUsers.length && <div className="p-16 text-center"><Users size={24} className="mx-auto text-stone-300 mb-2" /><p className="text-sm text-stone-500">No teachers found</p><p className="text-xs text-stone-400 mt-1">{isDean ? 'IT needs to create teacher accounts' : 'Create staff accounts'}</p></div>}
          </div>}
        <div className="border-t bg-stone-50 px-5 py-3 text-[11px] text-stone-500">{isDean ? 'You can only assign classes. Role changes are managed by IT.' : 'Dean can assign classes to teachers only. IT has full access to roles and assignments.'}</div>
      </section>

      {assignUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in">
            <div className="flex items-center justify-between border-b p-5">
              <div><h3 className="text-sm font-bold">Assign classes</h3><p className="text-xs text-stone-500 mt-0.5">{assignUser.full_name} • {assignUser.email}</p></div>
              <button onClick={() => setAssignUser(null)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-stone-100"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs leading-relaxed text-stone-600">Select classes this teacher will see in Mid-term engine. Dean assignments control what appears for each teacher.</p>
              <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {classes.map((cls) => {
                  const active = selectedClasses.includes(cls);
                  return <button key={cls} onClick={() => setSelectedClasses((prev) => prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls])} className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-sm font-medium transition ${active ? 'border-[#3A2818] bg-[#3A2818] text-white shadow-sm' : 'border-stone-200 bg-white hover:border-stone-300'}`}><span>{cls}</span>{active && <Check size={14} />}</button>;
                })}
                {!classes.length && <div className="col-span-2 rounded-xl border border-dashed p-8 text-center text-xs text-stone-500">No classes yet. Add students first.</div>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setSelectedClasses([])} className="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-xs font-semibold hover:bg-stone-50">Clear all</button>
                <button onClick={() => void saveAssignments()} disabled={assignBusy} className="flex-[2] rounded-xl bg-[#3A2818] py-3 text-xs font-semibold text-white hover:bg-[#4a2c19] disabled:opacity-40">{assignBusy ? 'Saving...' : `Save ${selectedClasses.length} classes`}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}