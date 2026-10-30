import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UnlockKeyhole,
  Link2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { sendAfricasTalkingBulkSMS } from '@/services/africasTalkingService';
import { sendBulkEmail } from '@/services/emailService';
import { addDispatchLog } from '@/services/automationService';

type Role = 'teacher' | 'dean_of_studies' | 'headteacher' | 'it' | 'unknown';
type Props = { role: Role; userId?: string; notify: (m: string) => void };

type Student = { id: string; full_name: string; class_name: string; phone?: string; email?: string; parent_name?: string };
type Subject = { id: string; class_name: string; subject_name: string; is_enabled: boolean };
type Period = { id: string; name: string; official_date: string; status: 'scheduled' | 'open' | 'finalized'; finalized_at: string | null; created_at: string };
type Mark = { id: string; period_id: string; student_id: string; class_name: string; subject_id: string; mark: number };
type Report = { id: string; period_id: string; student_id: string; student_name: string; class_name: string; average: number; report_data: { rows?: { subject: string; mark: number; grade?: string }[] }; generated_at: string };
type IssuedToken = { report_id: string; token: string; url?: string };

const PAGE_SIZE = 25;
const SCHOOL_NAME = 'G.S Gacuba II A';

function gradeFor(m: number) {
  if (m >= 80) return 'A';
  if (m >= 70) return 'B';
  if (m >= 60) return 'C';
  if (m >= 50) return 'D';
  return 'F';
}

function positionFor(average: number, allAverages: number[]) {
  const sorted = [...allAverages].sort((a, b) => b - a);
  return sorted.indexOf(average) + 1;
}

export default function MidTermEngine({ role, userId, notify }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [issuedTokens, setIssuedTokens] = useState<Record<string, IssuedToken>>({});

  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [teacherAssignments, setTeacherAssignments] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [marksPage, setMarksPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [editing, setEditing] = useState<{ studentId: string; subjectId: string; value: string } | null>(null);

  // Subjects manager
  const [showSubjects, setShowSubjects] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');

  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const selectedPeriod = useMemo(() => periods.find((p) => p.id === selectedPeriodId) ?? null, [periods, selectedPeriodId]);
  const isFinalized = selectedPeriod?.status === 'finalized';
  const isDean = role === 'dean_of_studies' || role === 'it' || role === 'headteacher';
  const canEditMarks = useMemo(() => {
    if (isFinalized) return false;
    if (isDean) return true;
    if (role === 'teacher' && teacherAssignments.map(c => c.trim().toLowerCase()).includes(selectedClass.trim().toLowerCase())) {
      return true;
    }
    return false;
  }, [isDean, isFinalized, role, teacherAssignments, selectedClass]);

    const classes = useMemo(() => {
    const allFromStudents = [...new Set(students.map((s) => s.class_name))].filter(Boolean).sort() as string[];
    if (role === 'teacher') {
      // If teacher has assignments, show those assignments even if no students yet in those classes
      // Merge both so teacher sees assigned classes
      if (teacherAssignments.length) {
        return [...new Set([...teacherAssignments, ...allFromStudents.filter(c => teacherAssignments.includes(c))])].sort();
      }
      return [];
    }
    return allFromStudents;
  }, [students, role, teacherAssignments]);

  const classStudents = useMemo(() => {
    const base = students.filter((s) => s.class_name === selectedClass);
    const q = search.trim().toLowerCase();
    const filtered = q ? base.filter((s) => s.full_name.toLowerCase().includes(q)) : base;
    return filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [students, selectedClass, search]);

  // Only subjects of same class and enabled
  const classSubjects = useMemo(() => subjects.filter((s) => s.class_name === selectedClass && s.is_enabled).sort((a, b) => a.subject_name.localeCompare(b.subject_name)), [subjects, selectedClass]);
  const allClassSubjects = useMemo(() => subjects.filter((s) => s.class_name === selectedClass).sort((a, b) => a.subject_name.localeCompare(b.subject_name)), [subjects, selectedClass]);

  const periodMarks = useMemo(() => marks.filter((m) => m.period_id === selectedPeriodId), [marks, selectedPeriodId]);
  const periodReports = useMemo(() => reports.filter((r) => r.period_id === selectedPeriodId), [reports, selectedPeriodId]);

  const pagedMarks = useMemo(() => {
    const start = (marksPage - 1) * PAGE_SIZE;
    return classStudents.slice(start, start + PAGE_SIZE);
  }, [classStudents, marksPage]);
  const pagedReports = useMemo(() => {
    const start = (reportsPage - 1) * PAGE_SIZE;
    return periodReports.slice(start, start + PAGE_SIZE);
  }, [periodReports, reportsPage]);

  const marksTotalPages = Math.max(1, Math.ceil(classStudents.length / PAGE_SIZE));
  const reportsTotalPages = Math.max(1, Math.ceil(periodReports.length / PAGE_SIZE));

  const REPORT_BASE_URL = import.meta.env.VITE_REPORT_BASE_URL || 'https://gacuba.co.rw';
  const buildLink = useCallback((report: Report, token: string) => `${REPORT_BASE_URL}/parent-report/${report.id}?token=${token}`, []);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const [stu, sub, per, mar, rep] = await Promise.all([
        supabase.from('school_students').select('id, full_name, class_name, phone, email, parent_name').order('full_name'),
        supabase.from('midterm_subjects').select('id, class_name, subject_name, is_enabled').order('subject_name'),
        supabase.from('midterm_periods').select('*').order('created_at', { ascending: false }),
        supabase.from('student_midterm_marks').select('id, period_id, student_id, class_name, subject_id, mark'),
        supabase.from('midterm_reports').select('id, period_id, student_id, student_name, class_name, average, report_data, generated_at').order('generated_at', { ascending: false }).limit(2000),
      ]);
      setStudents((stu.data ?? []) as Student[]);
      setSubjects((sub.data ?? []) as Subject[]);
      setPeriods((per.data ?? []) as Period[]);
      setMarks((mar.data ?? []) as Mark[]);
      setReports((rep.data ?? []) as Report[]);
      const first = (per.data as Period[] | null)?.[0]?.id;
      setSelectedPeriodId((c) => c || first || '');
      try {
        const saved = localStorage.getItem(`midterm_tokens_${selectedPeriodId || first}`);
        if (saved) setIssuedTokens(JSON.parse(saved));
      } catch {}
    } catch {
      setError('Could not load mid-term data');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId]);

    useEffect(() => { void refresh(); }, [refresh]);
  
  useEffect(() => {
    async function loadAssignments() {
      if (!supabase || !userId) return;
      if (role === 'teacher') {
        const { data } = await supabase.from('teacher_class_assignments').select('class_name').eq('teacher_user_id', userId);
        setTeacherAssignments((data ?? []).map((d: any) => d.class_name));
      } else {
        setTeacherAssignments([]);
      }
    }
    void loadAssignments();
  }, [userId, role]);

  useEffect(() => { setMarksPage(1); }, [selectedClass, search, selectedPeriodId]);
  
  useEffect(() => {
    if (!selectedClass && classes[0]) setSelectedClass(classes[0]);
    if (selectedClass && classes.length && !classes.includes(selectedClass)) {
      setSelectedClass(classes[0]);
    }
  }, [classes, selectedClass]);

  // Subjects CRUD
  async function addSubject() {
    if (!isDean || !newSubjectName.trim() || !selectedClass) return;
    const name = newSubjectName.trim();
    if (allClassSubjects.some((s) => s.subject_name.toLowerCase() === name.toLowerCase())) return notify('Subject already exists in this class');
    setBusy(true);
    try {
      await supabase!.from('midterm_subjects').insert({ class_name: selectedClass, subject_name: name, is_enabled: true });
      setNewSubjectName('');
      await refresh();
      notify('Subject added');
    } catch {
      notify('Could not add subject');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSubject(id: string, enabled: boolean) {
    if (!isDean) return;
    setBusy(true);
    try {
      await supabase!.from('midterm_subjects').update({ is_enabled: !enabled }).eq('id', id);
      await refresh();
    } catch {
      notify('Could not update subject');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSubject(id: string) {
    if (!isDean) return;
    if (!confirm('Remove this subject? Marks linked will remain but not count in new reports.')) return;
    setBusy(true);
    try {
      await supabase!.from('midterm_subjects').delete().eq('id', id);
      await refresh();
      notify('Subject removed');
    } catch {
      notify('Could not remove subject');
    } finally {
      setBusy(false);
    }
  }

  async function createPeriod() {
    if (!isDean || !newName.trim() || !newDate) return;
    setBusy(true);
    try {
      const { data } = await supabase!.from('midterm_periods').insert({ name: newName.trim(), official_date: newDate, status: 'open', created_by: userId }).select('id').single();
      setNewName('');
      setNewDate('');
      await refresh();
      if (data?.id) setSelectedPeriodId(data.id);
      notify('Mid-term created');
    } catch {
      notify('Could not create mid-term');
    } finally {
      setBusy(false);
    }
  }

  async function saveMark(studentId: string, subjectId: string, value: string) {
    if (!canEditMarks || !selectedPeriod) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) return notify('Enter a mark between 0 and 100');
    setBusy(true);
    try {
      const st = students.find((s) => s.id === studentId);
      await supabase!.from('student_midterm_marks').upsert(
        { period_id: selectedPeriod.id, student_id: studentId, class_name: st?.class_name || selectedClass, subject_id: subjectId, mark: n, entered_by: userId, updated_at: new Date().toISOString() },
        { onConflict: 'period_id,student_id,subject_id' }
      );
      setEditing(null);
      await refresh();
    } catch {
      notify('Could not save mark');
    } finally {
      setBusy(false);
    }
  }

  async function removeMark(studentId: string, subjectId: string) {
    if (!canEditMarks || !selectedPeriod) return;
    if (!confirm('Remove this mark?')) return;
    setBusy(true);
    try {
      await supabase!.from('student_midterm_marks').delete().eq('period_id', selectedPeriod.id).eq('student_id', studentId).eq('subject_id', subjectId);
      await refresh();
      notify('Mark removed');
    } catch {
      notify('Could not remove mark');
    } finally {
      setBusy(false);
    }
  }

  async function generateReports() {
    if (!isDean || !selectedPeriod || isFinalized) return;
    if (!classSubjects.length) return notify('Add subjects to this class first');
    setBusy(true);
    try {
      const toCreate = classStudents
        .filter((s) => !periodReports.some((r) => r.student_id === s.id))
        .map((student) => {
          const sm = periodMarks.filter((m) => m.student_id === student.id && classSubjects.some((c) => c.id === m.subject_id));
          if (sm.length !== classSubjects.length) return null;
          const rows = sm.map((m) => {
            const sub = subjects.find((x) => x.id === m.subject_id);
            return { subject: sub?.subject_name ?? 'Subject', mark: Number(m.mark), grade: gradeFor(Number(m.mark)) };
          });
          const avg = rows.reduce((a, b) => a + b.mark, 0) / rows.length;
          return { period_id: selectedPeriod.id, student_id: student.id, student_name: student.full_name, class_name: student.class_name, average: Number(avg.toFixed(2)), report_data: { rows }, generated_at: new Date().toISOString(), generated_by: userId };
        })
        .filter(Boolean) as any[];
      if (!toCreate.length) { notify('No new reports - check if all marks are entered for this class subjects'); return; }
      await supabase!.from('midterm_reports').insert(toCreate);
      notify(`${toCreate.length} reports generated`);
      await refresh();
    } catch {
      notify('Could not generate reports');
    } finally {
      setBusy(false);
    }
  }

  async function finalizePeriod() {
    if (!isDean || !selectedPeriod || isFinalized) return;
    const missing = classStudents.filter((s) => !periodReports.some((r) => r.student_id === s.id));
    if (missing.length) return notify(`${missing.length} students still need reports`);
    if (!confirm(`Finalize "${selectedPeriod.name}"? Marks will be locked.`)) return;
    setBusy(true);
    try {
      const { data } = await supabase!.from('midterm_periods').update({ status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: userId }).eq('id', selectedPeriod.id).eq('status', 'open').select('id');
      if (!data?.length) throw new Error();
      const { data: linkData } = await supabase!.functions.invoke('issue-midterm-links', { body: { report_ids: periodReports.map((r) => r.id) } });
      const links: IssuedToken[] = (linkData as any)?.links || (Array.isArray(linkData) ? linkData : []) as any;
      const map: Record<string, IssuedToken> = {};
      links.forEach((i) => { 
  if (i.report_id && i.token) {
    // Always force gacuba.co.rw, ignore what function returns
    const url = buildLink({ id: i.report_id } as Report, i.token);
    map[i.report_id] = { report_id: i.report_id, token: i.token, url }; 
  }
});
      setIssuedTokens(map);
      localStorage.setItem(`midterm_tokens_${selectedPeriod.id}`, JSON.stringify(map));
      notify(`Finalized with ${Object.keys(map).length} parent links`);
      await refresh();
    } catch {
      notify('Could not finalize');
    } finally {
      setBusy(false);
    }
  }

  async function sendNotices() {
    if (!isDean || !selectedPeriod || !isFinalized) return;
    setSending(true);
    try {
      let map = issuedTokens;
      if (!Object.keys(map).length) {
        const saved = localStorage.getItem(`midterm_tokens_${selectedPeriod.id}`);
        if (saved) map = JSON.parse(saved);
      }
      if (!Object.keys(map).length) {
        const { data } = await supabase!.functions.invoke('issue-midterm-links', { body: { report_ids: periodReports.map((r) => r.id) } });
        const links: IssuedToken[] = (data as any)?.links || [];
        links.forEach((i) => { map[i.report_id] = i; });
      }
      let delivered = 0;
      for (const r of periodReports) {
        const st = students.find((s) => s.id === r.student_id);
        const tk = map[r.id]?.token;
        if (!st || !tk) continue;
        const link = buildLink(r, tk);
        try {
          if (st.phone) await sendAfricasTalkingBulkSMS({ to: [st.phone], message: `Report for ${st.full_name} ${r.average}%: ${link} - ${SCHOOL_NAME}` });
          if (st.email) await sendBulkEmail({ recipients: [{ email: st.email, name: st.parent_name }], subject: `Mid-term ${st.full_name}`, message: link });
          delivered++;
        } catch {}
      }
      addDispatchLog({ channel: 'BOTH', category: 'REPORT', title: selectedPeriod.name, previewMessage: `${delivered} notices`, recipientCount: delivered } as any);
      notify(`Sent to ${delivered} parents`);
    } catch {
      notify('Could not send notices');
    } finally {
      setSending(false);
    }
  }

  // PDF exactly as wireframe
  const exportPDF = () => {
    if (!selectedPeriod || !periodReports.length) return;
    const pdf = new jsPDF();
    const allAvgs = periodReports.map((r) => r.average);

    periodReports.forEach((r, idx) => {
      if (idx > 0) pdf.addPage();
      const yStart = 10;
      // School name - centered
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(SCHOOL_NAME, 105, yStart, { align: 'center' });
      pdf.setFontSize(11);
      pdf.text('Mid-term report Card', 105, yStart + 7, { align: 'center' });

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Student: ${r.student_name}`, 14, yStart + 18);
      pdf.text(`Class: ${r.class_name}`, 140, yStart + 18);
      pdf.text(`Assessment: ${selectedPeriod.name}`, 14, yStart + 25);
      pdf.text(`Date: ${selectedPeriod.official_date}`, 14, yStart + 32);

      const rows = r.report_data.rows || [];
      autoTable(pdf, {
        startY: yStart + 40,
        head: [['Subject', 'Marks / 100', 'Grade']],
        body: rows.map((x) => [x.subject, String(x.mark), x.grade || gradeFor(x.mark)]),
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { lineWidth: 0.3, lineColor: [0, 0, 0] },
      });

      const finalY = (pdf as any).lastAutoTable.finalY + 10;
      const pos = positionFor(r.average, allAvgs);
      pdf.text(`Position: ${pos}`, 14, finalY);
      pdf.text(`Average: ${r.average}%`, 140, finalY);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Decision: __________________', 14, finalY + 12);
      pdf.setFontSize(8);
      pdf.text(`${SCHOOL_NAME} - Generated ${new Date().toLocaleDateString()}`, 105, 285, { align: 'center' });
    });

    pdf.save(`Midterm_${selectedPeriod.name}.pdf`);
  };

  const exportExcel = () => {
    if (!selectedPeriod) return;
    // Only subjects of this class - same as display
    const rows = classStudents.map((s) => {
      const sm = periodMarks.filter((m) => m.student_id === s.id);
      const row: any = { Student: s.full_name, Class: s.class_name };
      classSubjects.forEach((sub) => {
        row[sub.subject_name] = sm.find((m) => m.subject_id === sub.id)?.mark ?? '';
      });
      const report = periodReports.find((r) => r.student_id === s.id);
      row['Average'] = report?.average ?? '';
      return row;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `Marks ${selectedClass}`);
    XLSX.writeFile(wb, `Midterm_${selectedPeriod.name}_${selectedClass}.xlsx`);
  };

  if (loading) {
    return <div className="p-6 text-sm text-stone-500 flex gap-2"><RefreshCw className="animate-spin" size={16} />Loading mid-term engine...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1400px] mx-auto text-stone-800 px-3 sm:px-4 pb-20">
      <div className="text-left sm:text-center">
        <h1 className="text-[15px] sm:text-lg font-bold tracking-wide">Mid-term engine</h1>
        <div className="mt-3 flex flex-col sm:flex-row sm:justify-center gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border bg-white p-3 sm:px-3 sm:py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Assessment period</span>
            <select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)} className="w-full sm:min-w-[220px] rounded-lg border px-3 py-2.5 text-sm">
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name} - {p.official_date} ({p.status})</option>)}
              {!periods.length && <option>No periods</option>}
            </select>
            {selectedPeriod && <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${isFinalized ? 'bg-stone-100' : 'bg-emerald-50 text-emerald-700'}`}>{isFinalized ? <LockKeyhole size={10} /> : <UnlockKeyhole size={10} />}{selectedPeriod.status}</span>}
          </div>
        </div>
      </div>

      {error && <div className="mx-auto max-w-3xl flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle size={14} />{error}</div>}

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-3 order-1">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="text-xs font-bold uppercase">New mid-term</h3>
            <div className="mt-2 space-y-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name e.g Term 1 2026" className="w-full rounded-lg border px-3 py-2.5 text-[13px]" />
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-[13px]" />
              <button onClick={() => void createPeriod()} disabled={busy || !newName.trim() || !newDate || !isDean} className="w-full rounded-lg bg-[#3b2314] py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">Create</button>
              </div>
          </div>

          <div className="rounded-lg border bg-white p-3">
            <label className="text-xs font-bold uppercase">Class</label>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm">
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
              {role === 'teacher' && !classes.length && (
              <div className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-800">
                No class assigned to you. Ask IT to assign in User Management.
              </div>
            )}
            <div className="relative mt-3">
              <Search size={12} className="absolute left-2 top-2.5 text-stone-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student" className="w-full rounded border pl-7 pr-2 py-1.5 text-xs" />
            </div>
            {isDean && <button onClick={() => setShowSubjects(true)} className="mt-3 w-full rounded border bg-white py-1.5 text-xs font-medium hover:bg-stone-50"><Plus size={12} className="inline mr-1" />Manage subjects for {selectedClass || 'class'}</button>}
          </div>

          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase">Reports</label>
              <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-bold">{periodReports.length}</span>
            </div>
            <p className="mt-1 text-[11px] text-stone-500">{selectedPeriod?.name || 'No period'} - {selectedClass}</p>
            <p className="text-[11px] text-stone-500">{classSubjects.length} subjects enabled</p>
            {isDean && !isFinalized && <button onClick={() => void generateReports()} disabled={busy} className="mt-2 w-full rounded border bg-white py-1.5 text-xs font-medium hover:bg-stone-50"><FileText size={12} className="inline mr-1" />Generate</button>}
            {isDean && !isFinalized && <button onClick={() => void finalizePeriod()} disabled={busy || !periodReports.length} className="mt-2 w-full rounded bg-amber-900 py-1.5 text-xs font-semibold text-white disabled:opacity-40"><LockKeyhole size={12} className="inline mr-1" />Finalize</button>}
          </div>
        </div>

        <div className="lg:col-span-9 order-2">
          <div className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b p-3">
              <h2 className="text-sm font-bold">Marks register - {selectedClass}</h2>
              <div className="flex gap-2">
                <button onClick={exportPDF} disabled={!periodReports.length} className="rounded border px-3 py-1 text-xs font-medium disabled:opacity-40"><Download size={12} className="inline mr-1" />PDF</button>
                <button onClick={exportExcel} className="rounded border px-3 py-1 text-xs font-medium"><FileSpreadsheet size={12} className="inline mr-1" />Excel</button>
              </div>
            </div>

    {/*DESKTOP*/}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-stone-50 text-[11px] uppercase tracking-widest text-stone-500">
                  <tr>
                    <th className="px-3 py-2.5">Student</th>
                    {classSubjects.map((s) => <th key={s.id} className="px-3 py-2.5 whitespace-nowrap">{s.subject_name}</th>)}
                    <th className="px-3 py-2.5">Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pagedMarks.map((stu) => {
                    const sm = periodMarks.filter((m) => m.student_id === stu.id);
                    const avg = sm.length ? (sm.reduce((a, b) => a + Number(b.mark), 0) / sm.length).toFixed(1) : '—';
                    return (
                      <tr key={stu.id} className="hover:bg-stone-50/70">
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{stu.full_name}</td>
                        {classSubjects.map((sub) => {
                          const mk = sm.find((m) => m.subject_id === sub.id);
                          const edit = editing?.studentId === stu.id && editing?.subjectId === sub.id;
                          return (
                            <td key={sub.id} className="px-3 py-2">
                              {edit ? (
                                <div className="flex items-center gap-1">
                                  <input autoFocus type="number" value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void saveMark(stu.id, sub.id, editing.value); if (e.key === 'Escape') setEditing(null); }} className="w-16 rounded border border-amber-400 px-2 py-1 text-sm" />
                                  <button onClick={() => void saveMark(stu.id, sub.id, editing.value)} className="rounded bg-emerald-600 p-1 text-white"><CheckCircle2 size={14} /></button>
                                </div>
                              ) : (
                                <div className="group flex items-center gap-1">
                                  <span className={`font-mono ${mk ? 'font-semibold' : 'text-stone-400'}`}>{mk ? Number(mk.mark) : '—'}</span>
                                  {canEditMarks && <span className="hidden group-hover:flex gap-0.5"><button onClick={() => setEditing({ studentId: stu.id, subjectId: sub.id, value: mk ? String(mk.mark) : '' })} className="rounded p-1 text-stone-400 hover:bg-stone-100"><Pencil size={12} /></button>{mk && <button onClick={() => void removeMark(stu.id, sub.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={12} /></button>}</span>}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 font-bold">{avg}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          {/*MOBILE*/}
            <div className="md:hidden divide-y">
              {pagedMarks.map((stu) => {
                const sm = periodMarks.filter((m) => m.student_id === stu.id);
                const avg = sm.length ? (sm.reduce((a, b) => a + Number(b.mark), 0) / sm.length).toFixed(1) : '—';
                return (
                  <div key={stu.id} className="p-3.5 bg-white">
                    <div className="flex justify-between items-center">
                      <p className="font-semibold text-[13px] text-stone-900 leading-tight">{stu.full_name}</p>
                      <span className="text-[11px] font-mono font-bold bg-stone-900 text-white px-2 py-0.5 rounded">Avg {avg}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {classSubjects.map((sub) => {
                        const mk = sm.find((m) => m.subject_id === sub.id);
                        const edit = editing?.studentId === stu.id && editing?.subjectId === sub.id;
                        return (
                          <div key={sub.id} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5 bg-stone-50/50">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{sub.subject_name}</span>
                            {edit ? (
                              <div className="flex items-center gap-2">
                                <input autoFocus type="number" value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} className="w-20 rounded-lg border-2 border-amber-400 px-2 py-1.5 text-sm" />
                                <button onClick={() => void saveMark(stu.id, sub.id, editing.value)} className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><CheckCircle2 size={16} /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`text-[14px] font-mono font-bold ${mk ? 'text-stone-900' : 'text-stone-400'}`}>{mk ? Number(mk.mark) : '—'}</span>
                                {canEditMarks && <button onClick={() => setEditing({ studentId: stu.id, subjectId: sub.id, value: mk ? String(mk.mark) : '' })} className="h-9 w-9 rounded-lg bg-white border flex items-center justify-center text-stone-600"><Pencil size={14} /></button>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {!classSubjects.length && <p className="text-[12px] text-stone-500 py-2">No subjects enabled</p>}
                    </div>
                  </div>
                );
              })}
            </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t p-3 text-[11px]">
              <span className="text-stone-500">Showing {(marksPage-1)*PAGE_SIZE+1}-{Math.min(marksPage*PAGE_SIZE, classStudents.length)} of {classStudents.length} • Page {marksPage}/{marksTotalPages}</span>
              <div className="flex gap-2 w-full sm:w-auto">
                <button disabled={marksPage <= 1} onClick={() => setMarksPage((p) => p - 1)} className="flex-1 sm:flex-none h-10 rounded-lg border bg-white px-4 font-medium disabled:opacity-40 flex items-center justify-center gap-1"><ChevronLeft size={14}/> Prev</button>
                <button disabled={marksPage >= marksTotalPages} onClick={() => setMarksPage((p) => p + 1)} className="flex-1 sm:flex-none h-10 rounded-lg border bg-white px-4 font-medium disabled:opacity-40 flex items-center justify-center gap-1">Next <ChevronRight size={14}/></button>
              </div>
            </div>
          </div>
        </div>
      </div>

            <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b p-3.5">
          <div>
            <h2 className="text-[13px] font-bold tracking-wide">Reports and history</h2>
            <p className="text-[11px] text-stone-500 mt-0.5">{periodReports.length} reports • {selectedPeriod?.name || 'No period'}</p>
          </div>
          <button onClick={() => void sendNotices()} disabled={sending || !isFinalized || !periodReports.length || !isDean} className="w-full sm:w-auto h-10 rounded-lg bg-emerald-700 px-4 text-[13px] font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"><Send size={14}/>{sending ? 'Sending...' : 'Send to parents'}</button>
        </div>

        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-widest text-stone-500"><tr><th className="px-3 py-2.5 font-semibold">Student</th><th className="px-3 py-2.5 font-semibold">Class</th><th className="px-3 py-2.5 font-semibold">Average</th><th className="px-3 py-2.5 font-semibold">Link</th><th className="px-3 py-2.5 font-semibold">Generated</th></tr></thead>
            <tbody className="divide-y">
              {pagedReports.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/70"><td className="px-3 py-2.5 font-medium">{r.student_name}</td><td className="px-3 py-2.5 text-stone-600">{r.class_name}</td><td className="px-3 py-2.5 font-bold font-mono">{Number(r.average).toFixed(1)}%</td><td className="px-3 py-2.5">{issuedTokens[r.id] ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><Link2 size={12} />Ready</span> : <span className="text-[11px] text-stone-400">{isFinalized ? 'Pending' : 'Draft'}</span>}</td><td className="px-3 py-2.5 text-xs text-stone-500">{new Date(r.generated_at).toLocaleDateString()}</td></tr>
              ))}
              {!pagedReports.length && <tr><td colSpan={5} className="py-12 text-center text-stone-500">No reports for this period</td></tr>}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS  */}
        <div className="md:hidden divide-y divide-stone-100">
          {pagedReports.map((r) => (
            <div key={r.id} className="p-3.5 bg-white">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[13px] leading-tight text-stone-900 truncate">{r.student_name}</p>
                  <p className="text-[11px] text-stone-500 mt-1">{r.class_name} • {new Date(r.generated_at).toLocaleDateString()}</p>
                </div>
                <span className="shrink-0 text-[12px] font-mono font-bold bg-stone-900 text-white px-2.5 py-1 rounded-full">{Number(r.average).toFixed(1)}%</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-stone-400">Link</span>
                  {issuedTokens[r.id] ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full"><Link2 size={12} />Ready</span> : <span className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">{isFinalized ? 'Pending' : 'Draft'}</span>}
                </div>
                <span className="text-[10px] text-stone-400">{r.average >= 50 ? 'Pass' : 'Review'}</span>
              </div>
            </div>
          ))}
          {!pagedReports.length && (
            <div className="py-10 text-center px-4">
              <FileText size={20} className="mx-auto text-stone-300 mb-2"/>
              <p className="text-[13px] font-medium text-stone-600">No reports for this period</p>
              <p className="text-[11px] text-stone-400 mt-1">Generate reports after entering all marks</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t bg-stone-50/50 p-3 text-[11px]">
          <span className="text-stone-500">Page {reportsPage} / {reportsTotalPages} • {periodReports.length} total</span>
          <div className="flex gap-2 w-full sm:w-auto">
            <button disabled={reportsPage <= 1} onClick={() => setReportsPage((p) => p - 1)} className="flex-1 sm:flex-none h-10 rounded-lg border bg-white px-4 font-medium disabled:opacity-40 flex items-center justify-center gap-1"><ChevronLeft size={14}/> Prev</button>
            <button disabled={reportsPage >= reportsTotalPages} onClick={() => setReportsPage((p) => p + 1)} className="flex-1 sm:flex-none h-10 rounded-lg border bg-white px-4 font-medium disabled:opacity-40 flex items-center justify-center gap-1">Next <ChevronRight size={14}/></button>
          </div>
        </div>
      </div>

      {showSubjects && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-sm font-bold">Subjects for {selectedClass}</h3>
              <button onClick={() => setShowSubjects(false)} className="rounded p-1 hover:bg-stone-100"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <input value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addSubject(); }} placeholder="e.g Mathematics" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                <button onClick={() => void addSubject()} disabled={busy || !newSubjectName.trim()} className="rounded-lg bg-[#3b2314] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus size={14} /></button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y rounded-lg border">
                {allClassSubjects.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 text-sm">
                    <span className={s.is_enabled ? 'font-medium' : 'text-stone-400 line-through'}>{s.subject_name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => void toggleSubject(s.id, s.is_enabled)} className={`rounded px-2 py-1 text-[11px] font-medium ${s.is_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{s.is_enabled ? 'Enabled' : 'Disabled'}</button>
                      <button onClick={() => void deleteSubject(s.id)} className="rounded p-1 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {!allClassSubjects.length && <div className="p-4 text-center text-xs text-stone-500">No subjects for this class yet</div>}
              </div>
              <p className="text-[11px] text-stone-500">Only enabled subjects appear in marks register and exports (PDF/Excel). Same subjects used for generation.</p>
              <button onClick={() => setShowSubjects(false)} className="w-full rounded-lg bg-stone-900 py-2 text-xs font-semibold text-white">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}