import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  UnlockKeyhole,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  sendAfricasTalkingBulkSMS,
  formatRwandaPhone,
} from '@/services/africasTalkingService';
import { sendBulkEmail } from '@/services/emailService';
import { addDispatchLog } from '@/services/automationService';

type Role = 'teacher' | 'dean_of_studies' | 'headteacher' | 'it' | 'unknown';
type Props = { role: Role; userId?: string; notify: (message: string) => void; };

type Student = { id: string; full_name: string; class_name: string; stream?: string | null; phone?: string; email?: string; parent_name?: string; };
type Subject = { id: string; class_name: string; subject_name: string; is_enabled: boolean; };
type Period = { id: string; name: string; official_date: string; status: 'scheduled' | 'open' | 'finalized'; finalized_at: string | null; created_at: string; };
type Mark = { id: string; period_id: string; student_id: string; class_name: string; subject_id: string; mark: number; updated_at: string; };
type Report = {
  id: string; period_id: string; period: string; student_id: string; student_name: string; class_name: string; average: number;
  report_data: { rows?: Array<{ subject_id?: string; subject: string; mark: number; grade?: string; }>; };
  generated_at: string;
};
type ParentLink = { id: string; report_id: string; token: string; url: string; student_id: string; };

const isDean = (role: Role) => role === 'dean_of_studies';
const canManage = (role: Role) => isDean(role);

function gradeFor(mark: number) {
  if (mark >= 80) return 'A'; if (mark >= 70) return 'B'; if (mark >= 60) return 'C'; if (mark >= 50) return 'D'; return 'F';
}

export default function MidTermEngine({ role, userId, notify }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [parentLinks, setParentLinks] = useState<ParentLink[]>([]);

  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [markValue, setMarkValue] = useState('');
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodDate, setNewPeriodDate] = useState('');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendingNotices, setSendingNotices] = useState(false);
  const [error, setError] = useState('');
  const [noticeResult, setNoticeResult] = useState<{ delivered: number; failed: number; } | null>(null);

  const selectedPeriod = useMemo(() => periods.find((p) => p.id === selectedPeriodId) ?? null, [periods, selectedPeriodId]);
  const isFinalized = selectedPeriod?.status === 'finalized';

  const classes = useMemo(() => [...new Set(students.map((s) => s.class_name))].filter(Boolean).sort(), [students]);
  const classStudents = useMemo(() => students.filter((s) => s.class_name === selectedClass).sort((a, b) => a.full_name.localeCompare(b.full_name)), [students, selectedClass]);
  const classSubjects = useMemo(() => subjects.filter((s) => s.class_name === selectedClass && s.is_enabled), [subjects, selectedClass]);
  const periodMarks = useMemo(() => marks.filter((m) => m.period_id === selectedPeriodId), [marks, selectedPeriodId]);
  const periodReports = useMemo(() => reports.filter((r) => r.period_id === selectedPeriodId), [reports, selectedPeriodId]);

  const refresh = useCallback(async () => {
    if (!supabase) { setError('The database connection is unavailable.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [studentsResult, subjectsResult, periodsResult, marksResult, reportsResult, linksResult] = await Promise.all([
        supabase.from('school_students').select('id, full_name, class_name, stream, phone, email, parent_name').order('class_name').order('full_name'),
        supabase.from('midterm_subjects').select('id, class_name, subject_name, is_enabled').order('class_name').order('subject_name'),
        supabase.from('midterm_periods').select('id, name, official_date, status, finalized_at, created_at').order('created_at', { ascending: false }),
        supabase.from('student_midterm_marks').select('id, period_id, student_id, class_name, subject_id, mark, updated_at'),
        supabase.from('midterm_reports').select('id, period_id, student_id, student_name, class_name, average, report_data, generated_at').order('generated_at', { ascending: false }).limit(2000),
        supabase.from('midterm_parent_links').select('id, report_id, token, url, student_id').limit(2000),
      ]);
      const failed = [studentsResult.error, subjectsResult.error, periodsResult.error, marksResult.error, reportsResult.error].find(Boolean);
      if (failed) throw failed;

      setStudents((studentsResult.data ?? []) as Student[]);
      setSubjects((subjectsResult.data ?? []) as Subject[]);
      setPeriods((periodsResult.data ?? []) as Period[]);
      setMarks((marksResult.data ?? []) as Mark[]);
      setReports((reportsResult.data ?? []) as Report[]);
      setParentLinks((linksResult.data ?? []) as ParentLink[]);

      const availablePeriods = (periodsResult.data ?? []) as Period[];
      setSelectedPeriodId((cur) => availablePeriods.some((p) => p.id === cur) ? cur : availablePeriods[0]?.id ?? '');
    } catch (cause) {
      console.error('Could not load mid-term workspace:', cause);
      setError('Could not load mid-term records. Check the database migration and permissions.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!selectedClass && classes.length) setSelectedClass(classes[0]); }, [classes, selectedClass]);
  useEffect(() => { if (!classStudents.some((s) => s.id === selectedStudentId)) setSelectedStudentId(classStudents[0]?.id ?? ''); }, [classStudents, selectedStudentId]);
  useEffect(() => { if (!classSubjects.some((s) => s.id === selectedSubjectId)) setSelectedSubjectId(classSubjects[0]?.id ?? ''); }, [classSubjects, selectedSubjectId]);

  async function createPeriod() {
    if (!supabase || !canManage(role) || busy) return;
    const name = newPeriodName.trim();
    if (!name || !newPeriodDate) { notify('Enter a name and official date for the mid-term.'); return; }
    if (periods.some((p) => p.name.toLowerCase() === name.toLowerCase())) { notify('A mid-term with this name already exists.'); return; }
    setBusy(true);
    try {
      const { data, error: insertError } = await supabase.from('midterm_periods').insert({ name, official_date: newPeriodDate, status: 'open', created_by: userId ?? null }).select('id, name, official_date, status, finalized_at, created_at').single();
      if (insertError) throw insertError;
      setNewPeriodName(''); setNewPeriodDate(''); await refresh(); setSelectedPeriodId(data.id);
      notify('Mid-term created. Its marks will be separate from other periods.');
    } catch (cause) { console.error('Could not create mid-term:', cause); notify('Could not create the mid-term. Check the database permissions.'); }
    finally { setBusy(false); }
  }

  async function saveMark() {
    if (!supabase || !isDean(role) || busy) { notify('Only the dean of studies can edit mid-term marks.'); return; }
    if (!selectedPeriod || isFinalized) { notify('This mid-term is finalized or has not been selected.'); return; }
    if (!selectedStudentId || !selectedSubjectId || markValue.trim() === '') { notify('Select a student, subject, and mark.'); return; }
    const value = Number(markValue);
    if (!Number.isFinite(value) || value < 0 || value > 100) { notify('Enter a mark between 0 and 100.'); return; }
    const student = students.find((item) => item.id === selectedStudentId);
    const subject = classSubjects.find((item) => item.id === selectedSubjectId);
    if (!student || !subject) { notify('The selected student or subject could not be found.'); return; }
    setBusy(true);
    try {
      const { error: saveError } = await supabase.from('student_midterm_marks').upsert({
        period_id: selectedPeriod.id, student_id: student.id, class_name: student.class_name, subject_id: subject.id,
        mark: value, entered_by: userId ?? null, entered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'period_id,student_id,subject_id' });
      if (saveError) throw saveError;
      setMarkValue(''); notify('Mark saved.'); await refresh();
    } catch (cause) { console.error('Could not save mark:', cause); notify('The mark could not be saved. The period may be locked or database permissions may prevent the change.'); }
    finally { setBusy(false); }
  }

  async function generateReports() {
    if (!supabase || !isDean(role) || busy) return;
    if (!selectedPeriod || isFinalized) { notify('Select an open mid-term before generating reports.'); return; }
    if (!classStudents.length || !classSubjects.length) { notify('This class has no students or enabled subjects.'); return; }
    setBusy(true);
    try {
      const reportsToCreate = classStudents.flatMap((student) => {
        const studentMarks = periodMarks.filter((mark) => mark.student_id === student.id && classSubjects.some((s) => s.id === mark.subject_id));
        const complete = studentMarks.length === classSubjects.length && new Set(studentMarks.map((m) => m.subject_id)).size === classSubjects.length;
        if (!complete) return [];
        const rows = studentMarks.map((mark) => {
          const subject = subjects.find((item) => item.id === mark.subject_id);
          return { subject_id: mark.subject_id, subject: subject?.subject_name ?? 'Unknown subject', mark: Number(mark.mark), grade: gradeFor(Number(mark.mark)) };
        });
        const average = rows.reduce((sum, row) => sum + row.mark, 0) / rows.length;
        const existingReport = periodReports.find((report) => report.student_id === student.id);
        if (existingReport) return [];
        return [{ period_id: selectedPeriod.id, period: selectedPeriod.name, student_id: student.id, student_name: student.full_name, class_name: student.class_name, average: Number(average.toFixed(2)), report_data: { rows }, generated_by: userId ?? null, generated_at: new Date().toISOString() }];
      });
      if (!reportsToCreate.length) { notify('No new reports were generated. Students may have incomplete marks or existing reports.'); return; }
      const { error: reportError } = await supabase.from('midterm_reports').insert(reportsToCreate);
      if (reportError) throw reportError;
      notify(`Generated ${reportsToCreate.length} report(s). The mid-term is still open and marks are not locked.`);
      await refresh();
    } catch (cause) { console.error('Report generation failed:', cause); notify('Report generation failed. Check the database schema and permissions.'); }
    finally { setBusy(false); }
  }

  // STEP 2: FINALIZE + ISSUE LINKS (does NOT send SMS yet)
  async function finalizePeriod() {
    if (!supabase || !isDean(role) || busy) return;
    if (!selectedPeriod || isFinalized) { notify('Select an open mid-term first.'); return; }
    if (!classStudents.length || !classSubjects.length) { notify('This class has no students or enabled subjects.'); return; }

    const missingReports = classStudents.filter((student) => !periodReports.find((item) => item.student_id === student.id && item.period_id === selectedPeriod.id));
    if (missingReports.length > 0) { notify(`${missingReports.length} student(s) still need reports. Generate and check all reports before locking.`); return; }

    const confirmed = window.confirm(`Finalize "${selectedPeriod.name}"? This permanently locks marks for this mid-term. ${classStudents.length} student reports have been checked. Continue?`);
    if (!confirmed) return;

    setBusy(true);
    try {
      const { data, error: finalizeError } = await supabase.from('midterm_periods').update({
        status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: userId ?? null,
      }).eq('id', selectedPeriod.id).eq('status', 'open').select('id');
      if (finalizeError) throw finalizeError;
      if (!data?.length) throw new Error('The period was not locked. It may already be finalized.');

      // ISSUE SECURE PARENT LINKS NOW (only on finalize, not on PDF export)
      const reportIds = periodReports.map((r) => r.id);
      if (reportIds.length > 0) {
        const { data: linkData, error: linkError } = await supabase.functions.invoke('issue-midterm-links', { body: { report_ids: reportIds } });
        if (linkError) {
          console.error('Parent link generation failed:', linkError);
          notify('Mid-term locked, but parent link generation failed. You can retry from the finalized view.');
        } else {
          console.info('Parent links issued:', linkData);
          notify(`Mid-term locked and ${reportIds.length} secure parent links generated. Now send notices to parents.`);
        }
      } else {
        notify('Mid-term locked. All students have reports.');
      }

      await refresh();
    } catch (cause) {
      console.error('Could not finalize mid-term:', cause);
      notify('Could not finalize this mid-term. Check the database and permissions.');
    } finally { setBusy(false); }
  }

  // STEP 3: SEND NOTICES TO PARENTS (NEW)
  async function sendParentNotices() {
    if (!supabase || !isDean(role) || sendingNotices) return;
    if (!selectedPeriod || !isFinalized) { notify('Finalize the mid-term before sending notices.'); return; }
    if (periodReports.length === 0) { notify('No reports to send.'); return; }

    const confirmed = window.confirm(`Send report notices to ${periodReports.length} parents for "${selectedPeriod.name}"? Each parent will receive an SMS/email with secure download link.`);
    if (!confirmed) return;

    setSendingNotices(true); setNoticeResult(null); setError('');
    let delivered = 0; let failed = 0;

    try {
      // Get parent links for this period
      const { data: links } = await supabase.from('midterm_parent_links').select('id, report_id, token, url, student_id').in('report_id', periodReports.map(r => r.id));
      const linkMap = new Map((links ?? []).map((l: any) => [l.report_id, l.url || `${window.location.origin}/parent-report/${l.token}`]));

      for (const report of periodReports) {
        const student = students.find(s => s.id === report.student_id);
        if (!student) { failed++; continue; }
        const link = linkMap.get(report.id) || `Report ID ${report.id} - contact school`;

        const smsMessage = `Dear ${student.parent_name || 'Parent'}, the mid-term report for ${student.full_name} (${student.class_name}) is ready. Average: ${report.average}%. View/download: ${link} - G.S. Gacuba 2A`;
        const emailMessage = `Dear ${student.parent_name || 'Parent'},\n\nThe ${selectedPeriod.name} report for ${student.full_name} is ready.\n\nAverage: ${report.average}%\nSecure link: ${link}\n\nPlease contact school if you need assistance.\n\nG.S. Gacuba 2A`;

        try {
          if (student.phone && formatRwandaPhone(student.phone)) {
            const smsResult = await sendAfricasTalkingBulkSMS({ to: [student.phone], message: smsMessage });
            if (smsResult.recipients?.[0]?.status === 'Success' || smsResult.recipients?.[0]?.status === 'Queued' || smsResult.recipients?.[0]?.status === 'Sent') delivered++;
            else failed++;
          }
          if (student.email && student.email.includes('@')) {
            const emailResult = await sendBulkEmail({ recipients: [{ email: student.email, name: student.parent_name }], subject: `Mid-term Report - ${student.full_name} - ${selectedPeriod.name}`, message: emailMessage });
            if (emailResult.totalSent > 0) delivered++;
          }
          if (!student.phone && !student.email) failed++;
        } catch (err) {
          console.error('Notice failed for', student.id, err);
          failed++;
        }
      }

      addDispatchLog({
        channel: 'BOTH', category: 'REPORT', title: `Mid-term Reports: ${selectedPeriod.name}`, previewMessage: smsMessagePreview(selectedPeriod.name),
        recipientCount: delivered, recipientDetails: `Delivered: ${delivered}, Failed: ${failed}`, smsStatus: `Mid-term ${selectedPeriod.name}`, emailProvider: 'Configured Email',
      });

      setNoticeResult({ delivered, failed });
      notify(`Notices sent: ${delivered} delivered, ${failed} failed.`);
    } catch (cause) {
      console.error('Sending parent notices failed:', cause);
      setError('Failed to send parent notices. Check SMS/email service credentials.');
      notify('Failed to send parent notices.');
    } finally { setSendingNotices(false); }
  }

  function smsMessagePreview(periodName: string) { return `Mid-term ${periodName} report is ready. Check SMS/email for secure link.`; }

  // FIXED: Export PDFs ONLY exports PDFs, no link generation
  const exportReportsPDF = async () => {
    if (!selectedPeriod || periodReports.length === 0) { notify('No reports are available to export.'); return; }
    try {
      // Export as single combined PDF for admin to avoid 30 download popups
      const pdf = new jsPDF();
      let isFirst = true;

      periodReports.forEach((report, idx) => {
        if (!isFirst) pdf.addPage();
        isFirst = false;
        const rows = report.report_data?.rows ?? [];

        pdf.setFontSize(18); pdf.text('G.S. Gacuba 2A', 105, 18, { align: 'center' });
        pdf.setFontSize(14); pdf.text('Mid-term report card', 105, 27, { align: 'center' });
        pdf.setFontSize(10);
        pdf.text(`Student: ${report.student_name}`, 14, 42);
        pdf.text(`Class: ${report.class_name}`, 14, 49);
        pdf.text(`Assessment: ${selectedPeriod.name}`, 14, 56);
        pdf.text(`Official date: ${selectedPeriod.official_date}`, 14, 63);
        pdf.text(`GS Gacuba II A @2026`, 14, 250);
        pdf.text(`Developed by SYBELLA SYSTEMS LTD`, 14, 255);

        autoTable(pdf, {
          startY: 72, head: [['Subject', 'Mark / 100', 'Grade']],
          body: rows.map((row) => [row.subject, Number(row.mark).toFixed(1), row.grade || gradeFor(Number(row.mark))]),
          theme: 'grid', headStyles: { fillColor: [58, 40, 24] },
        });

        const finalY = (pdf as any).lastAutoTable?.finalY ?? 80;
        pdf.setFontSize(12); pdf.text(`Average: ${Number(report.average).toFixed(2)}%`, 14, finalY + 12);
      });

      pdf.save(`Midterm_${selectedPeriod.name.replace(/[^a-z0-9-_]/gi, '_')}_All_Reports.pdf`);
      notify(`${periodReports.length} student report(s) exported as one PDF.`);
    } catch (cause) {
      console.error('PDF export failed:', cause); notify('Could not export the PDF reports.');
    }
  };

  function exportMarksExcel() {
    if (!selectedPeriod) { notify('Select an assessment period first.'); return; }
    try {
      const subjectColumns = subjects.filter((subject) => subject.is_enabled);
      const register = students.map((student) => {
        const studentMarks = periodMarks.filter((mark) => mark.student_id === student.id);
        const row: Record<string, string | number> = { 'Student name': student.full_name, Class: student.class_name, Stream: student.stream ?? '' };
        subjectColumns.forEach((subject) => {
          const mark = studentMarks.find((item) => item.subject_id === subject.id);
          row[`${subject.class_name} - ${subject.subject_name}`] = mark ? Number(mark.mark) : '';
        });
        const numericMarks = studentMarks.map((item) => Number(item.mark));
        row['Recorded marks'] = numericMarks.length;
        row['Average of recorded marks'] = numericMarks.length ? Number((numericMarks.reduce((sum, mark) => sum + mark, 0) / numericMarks.length).toFixed(2)) : '';
        return row;
      });
      const reportSummary = periodReports.map((report) => ({
        Student: report.student_name, Class: report.class_name, Average: Number(report.average),
        'Assessment period': selectedPeriod.name, 'Report generated': new Date(report.generated_at).toLocaleString(),
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(register), 'Marks register');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportSummary), 'Report summary');
      XLSX.writeFile(workbook, `Midterm_${selectedPeriod.name.replace(/[^a-z0-9-_]/gi, '_')}.xlsx`);
      notify('Excel register exported successfully.');
    } catch (cause) { console.error('Excel export failed:', cause); notify('Could not export the Excel register.'); }
  }

  const markFor = (studentId: string, subjectId: string) => periodMarks.find((mark) => mark.student_id === studentId && mark.subject_id === subjectId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-stone-500">
        <RefreshCw size={17} className="animate-spin" /> Loading mid-term workspace…
      </div>
    );
  }

  return (
    <div className="space-y-6 text-stone-800">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Academic reports</p>
          <h1 className="mt-1 text-2xl font-bold text-stone-900">Mid-term marks</h1>
          <p className="mt-1 text-sm text-stone-500">Generate → Finalize (issues links) → Send notices to parents</p>
        </div>
        <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm">
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {noticeResult && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          Parent notices: {noticeResult.delivered} delivered, {noticeResult.failed} failed for {selectedPeriod?.name}
        </div>
      )}

      {canManage(role) && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-stone-900">Schedule a new mid-term</h2>
          <p className="mt-1 text-xs text-stone-500">Give each mid-term a distinct name and date. Previous periods remain separate.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_190px_auto]">
            <input value={newPeriodName} onChange={(e) => setNewPeriodName(e.target.value)} placeholder="e.g. Term 1 Mid-Term" aria-label="Mid-term name" className="rounded-lg border border-stone-200 px-3 py-2 text-sm" />
            <input type="date" value={newPeriodDate} onChange={(e) => setNewPeriodDate(e.target.value)} aria-label="Official mid-term date" className="rounded-lg border border-stone-200 px-3 py-2 text-sm" />
            <button onClick={() => void createPeriod()} disabled={busy || !newPeriodName.trim() || !newPeriodDate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#3A2818] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Plus size={16} /> Create mid-term
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-stone-900">Assessment period</h2><p className="mt-1 text-xs text-stone-500">Select a period to view its marks and reports.</p></div>
          {selectedPeriod && (
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${isFinalized ? 'bg-stone-100 text-stone-700' : selectedPeriod.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {isFinalized ? <LockKeyhole size={14} /> : selectedPeriod.status === 'open' ? <UnlockKeyhole size={14} /> : <Clock3 size={14} />} {selectedPeriod.status}
            </span>
          )}
        </div>
        <div className="mt-4">
          <label htmlFor="midterm-period" className="mb-1 block text-xs font-medium text-stone-600">Mid-term</label>
          <select id="midterm-period" value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
            <option value="">Select a mid-term</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {period.official_date} · {period.status}</option>)}
          </select>
        </div>
        {selectedPeriod && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{periodMarks.length}</strong><span className="text-xs text-stone-500">Marks recorded</span></div>
            <div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{periodReports.length}</strong><span className="text-xs text-stone-500">Reports generated</span></div>
            <div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{new Date(`${selectedPeriod.official_date}T00:00:00`).toLocaleDateString()}</strong><span className="text-xs text-stone-500">Official date</span></div>
          </div>
        )}
        {selectedPeriod?.status === 'scheduled' && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">This period is scheduled. Its status must be opened before marks can be entered.</p>}
      </section>

      {selectedPeriod && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold text-stone-900">Marks register</h2><p className="mt-1 text-xs text-stone-500">Only the dean of studies can enter or edit marks.</p></div>
            <div className="flex flex-wrap gap-2">
              {canManage(role) && !isFinalized && (
                <button onClick={() => void generateReports()} disabled={busy || !selectedClass} className="inline-flex items-center gap-2 rounded-lg bg-[#3A2818] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <FileText size={15} /> Generate reports
                </button>
              )}
              <button onClick={exportReportsPDF} disabled={busy || periodReports.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">
                <Download size={15} /> Export PDFs
              </button>
              <button onClick={exportMarksExcel} disabled={busy || !selectedPeriod} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">
                <FileSpreadsheet size={15} /> Export Excel
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="midterm-class" className="mb-1 block text-xs font-medium text-stone-600">Class</label>
            <select id="midterm-class" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
              {classes.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-100">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500"><tr><th className="px-4 py-3">Student</th>{classSubjects.map((s) => <th key={s.id} className="px-4 py-3">{s.subject_name}</th>)}</tr></thead>
              <tbody className="divide-y divide-stone-100">
                {classStudents.map((student) => (
                  <tr key={student.id}><td className="px-4 py-3"><strong>{student.full_name}</strong>{student.stream && <span className="block text-xs text-stone-500">{student.stream}</span>}</td>
                    {classSubjects.map((subject) => { const mark = markFor(student.id, subject.id); return <td key={subject.id} className="px-4 py-3">{mark ? Number(mark.mark) : '—'}</td>; })}
                  </tr>
                ))}
                {!classStudents.length && <tr><td colSpan={Math.max(classSubjects.length + 1, 1)} className="px-4 py-8 text-center text-sm text-stone-500">No students found for this class.</td></tr>}
              </tbody>
            </table>
          </div>

          {canManage(role) && !isFinalized && (
            <div className="mt-4 grid gap-3 rounded-xl bg-stone-50 p-4 sm:grid-cols-[1fr_1fr_130px_auto]">
              <select aria-label="Student" value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                <option value="">Select student</option>{classStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <select aria-label="Subject" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} className="min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                <option value="">Select subject</option>{classSubjects.map((s) => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
              </select>
              <input type="number" min="0" max="100" step="0.01" value={markValue} onChange={(e) => setMarkValue(e.target.value)} placeholder="Mark / 100" aria-label="Mark out of 100" className="min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" />
              <button onClick={() => void saveMark()} disabled={busy || !selectedStudentId || !selectedSubjectId || markValue.trim() === ''} className="rounded-lg bg-[#3A2818] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save mark</button>
            </div>
          )}
          {isFinalized && <p className="mt-4 flex items-center gap-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-700"><LockKeyhole size={17} />This mid-term is finalized. Marks cannot be edited from this page.</p>}
        </section>
      )}

      {canManage(role) && selectedPeriod && !isFinalized && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Finalize this mid-term</h2>
          <p className="mt-1 text-sm text-amber-900">Review the generated reports before finalizing. This will lock marks and automatically issue secure parent links for this period.</p>
          <button onClick={() => void finalizePeriod()} disabled={busy || periodReports.length === 0} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            <CheckCircle2 size={16} /> Finalize and issue parent links
          </button>
          {!periodReports.length && <p className="mt-2 text-xs text-amber-900">Generate reports before finalizing this period.</p>}
        </section>
      )}

      {/* NEW: Send notices section - only after finalized */}
      {canManage(role) && selectedPeriod && isFinalized && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-950">Send report notices to parents</h2>
          <p className="mt-1 text-sm text-emerald-900">
            Mid-term is locked. {periodReports.length} reports ready. {parentLinks.filter(l => periodReports.some(r => r.id === l.report_id)).length} secure links issued. Send SMS/email with download link to parents.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void sendParentNotices()} disabled={sendingNotices || busy || periodReports.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {sendingNotices ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              {sendingNotices ? 'Sending...' : 'Send Notices to Parents'}
            </button>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800"><Smartphone size={14}/>SMS + <Mail size={14}/>Email with link</span>
          </div>
        </section>
      )}

      {selectedPeriod && (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 p-5"><h2 className="font-semibold text-stone-900">Reports and history</h2><p className="mt-1 text-xs text-stone-500">Reports are grouped by the selected mid-term.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Class</th><th className="px-5 py-3">Average</th><th className="px-5 py-3">Generated</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {periodReports.map((report) => <tr key={report.id}><td className="px-5 py-3 font-medium">{report.student_name}</td><td className="px-5 py-3">{report.class_name}</td><td className="px-5 py-3">{Number(report.average).toFixed(1)}%</td><td className="px-5 py-3 text-stone-500">{new Date(report.generated_at).toLocaleString()}</td></tr>)}
                {!periodReports.length && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-stone-500">No reports generated for this mid-term yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedPeriod?.status === 'finalized' && (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <CalendarDays size={16} /> Finalized on {selectedPeriod.finalized_at ? new Date(selectedPeriod.finalized_at).toLocaleString() : 'a date not recorded'}. This record remains in history.
        </p>
      )}
    </div>
  );
}