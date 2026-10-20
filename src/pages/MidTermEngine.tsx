import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle, Bell, CalendarDays, Check, Download, Eye, FileText, LoaderCircle,
  Plus, Search, Send, Settings2, Trash2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { averageMark, compileReportRows, gradeForMark, isValidSmsPhone, shouldRegenerateReport } from '@/utils/midterm';

 type Role = 'teacher' | 'dean_of_studies' | 'headteacher' | 'it' | 'unknown';
 type Student = { id: string; full_name: string; class_name: string; registry_code?: string; stream?: string; parent_name?: string; phone?: string; email?: string };
 type Subject = { id: string; class_name: string; subject_name: string; is_enabled: boolean };
 type Mark = { id: string; student_id: string; class_name: string; period: string; subject_id: string; mark: number; entered_at: string; subject?: Subject };
 type TeacherAccount = { id: string; full_name: string; email: string };
 type TeacherClassAssignment = { teacher_user_id: string; teacher_name: string; class_name: string };
 type ReportRow = { subject_id?: string; subject: string; mark: number; weight: number; grade: string };
type Report = { id: string; student_id: string | null; student_name: string; class_name: string; period: string; average: number; review_status: 'pending' | 'approved'; is_deleted?: boolean; report_data: { rows?: ReportRow[]; parent_name?: string; phone?: string; email?: string }; generated_at: string; pdf_generated_at?: string | null; pdf_storage_path?: string | null; teacher_comment: string };
type Alert = { id: string; event_type: string; payload: Record<string, unknown>; created_at: string; read_at?: string | null };
 type Props = { role: Role; userId?: string; notify: (message: string) => void };

const currentPeriod = `${new Date().getFullYear()} Mid-Term`;
const isDean = (role: Role) => role === 'dean_of_studies' || role === 'it';
const gradeFor = gradeForMark;

export default function MidTermEngine({ role, userId, notify }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [officialDate, setOfficialDate] = useState('');
  const [savedOfficialDate, setSavedOfficialDate] = useState('');
  const [reviewStatus, setReviewStatus] = useState('pending');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [markValue, setMarkValue] = useState('');
  const [subjectDraft, setSubjectDraft] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [teacherAccounts, setTeacherAccounts] = useState<TeacherAccount[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherClassAssignment[]>([]);
  const [teacherDirectoryLoading, setTeacherDirectoryLoading] = useState(false);
  const [teacherDirectoryError, setTeacherDirectoryError] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyClass, setHistoryClass] = useState('');
  const [historyYear, setHistoryYear] = useState('');
  const [historyAverage, setHistoryAverage] = useState('');
  const [belowAverageOnly, setBelowAverageOnly] = useState(false);
  const [withoutMarksOnly, setWithoutMarksOnly] = useState(false);
  const [reportView, setReportView] = useState<Report | null>(null);
  const [smsReports, setSmsReports] = useState<Report[]>([]);
  const [smsText, setSmsText] = useState('G.S Gacuba: Your child’s mid-term report is ready. Please contact the school for details.');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pendingRealtimeReports = useRef(new Map<string, Report>());
  const openingReportIds = useRef(new Set<string>());
  const reportNotificationTimer = useRef<number | null>(null);

  const classes = useMemo(() => [...new Set(students.map((student) => student.class_name).filter(Boolean))].sort(), [students]);
  const allClassStudents = useMemo(() => students.filter((student) => student.class_name === selectedClass), [students, selectedClass]);
  const classSubjects = useMemo(() => subjects.filter((subject) => subject.class_name === selectedClass && subject.is_enabled), [subjects, selectedClass]);
  const periodMarks = useMemo(() => marks.filter((mark) => mark.period === currentPeriod), [marks]);
  const studentSummaries = allClassStudents.map((student) => {
    const studentMarks = periodMarks.filter((mark) => mark.student_id === student.id && Number(mark.mark) > 0);
    return { student, average: studentMarks.length ? studentMarks.reduce((sum, mark) => sum + Number(mark.mark), 0) / studentMarks.length : null };
  });
  const averageClassMark = studentSummaries.filter((entry) => entry.average !== null)
    .reduce((sum, entry, _index, all) => sum + (entry.average ?? 0) / (all.length || 1), 0);
  const classStudents = studentSummaries.filter(({ average }) =>
    (!belowAverageOnly || (average !== null && average < averageClassMark))
      && (!withoutMarksOnly || average === null),
  ).map(({ student }) => student);
  const filteredHistory = useMemo(() => reports.filter((report) => {
    const query = historySearch.trim().toLowerCase();
    return (!query || `${report.student_name} ${report.class_name} ${report.period}`.toLowerCase().includes(query))
      && (!historyClass || report.class_name === historyClass)
        && (!historyYear || report.period.includes(historyYear))
        && (!historyAverage || (historyAverage === 'below50' ? report.average < 50 : historyAverage === '50to69' ? report.average >= 50 && report.average < 70 : report.average >= 70));
      }), [reports, historySearch, historyClass, historyYear, historyAverage]);

  const refresh = useCallback(async () => {
    if (!supabase) { setError('Mid-term records are unavailable right now. Please ask IT for help.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    let alertQuery = supabase.from('midterm_notification_outbox').select('id, event_type, payload, created_at, read_at').order('created_at', { ascending: false }).limit(8);
    if (role === 'teacher' && userId) alertQuery = alertQuery.eq('recipient_user_id', userId);
    if (role !== 'teacher' && !isDean(role)) alertQuery = alertQuery.eq('recipient_user_id', userId ?? '00000000-0000-0000-0000-000000000000');
    const [studentsResult, subjectResult, marksResult, reportsResult, settingsResult, alertsResult] = await Promise.all([
      role === 'teacher' || role === 'headteacher' || !isDean(role)
        ? supabase.from(role === 'teacher' ? 'teacher_student_register' : 'school_students').select('id, full_name, class_name, stream').order('class_name').order('full_name')
        : supabase.from('school_students').select('id, full_name, class_name, registry_code, stream, parent_name, phone, email').order('class_name').order('full_name'),
      role === 'unknown'
        ? Promise.resolve({ data: [], error: null })
        : supabase.from('midterm_subjects').select('*').order('class_name').order('subject_name'),
      role === 'headteacher'
        ? Promise.resolve({ data: [], error: null })
        : supabase.from('student_midterm_marks').select('*, midterm_subjects(id, class_name, subject_name, is_enabled)').order('entered_at', { ascending: false }),
      role === 'unknown'
        ? Promise.resolve({ data: [], error: null })
        : supabase.from('midterm_reports').select('*').order('generated_at', { ascending: false }).limit(1000),
      isDean(role) || role === 'teacher'
        ? supabase.from('midterm_settings').select('official_date, review_status').eq('id', 1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      alertQuery,
    ]);
    const failed = [studentsResult.error, subjectResult.error, marksResult.error, reportsResult.error, settingsResult.error, alertsResult.error].find(Boolean);
    if (failed) {
      console.error('Could not load mid-term workspace', failed);
      setError('Mid-term records are unavailable right now. Please try again later.');
    } else {
      setStudents((studentsResult.data ?? []) as Student[]);
      setSubjects((subjectResult.data ?? []) as Subject[]);
      setMarks((marksResult.data ?? []).map((row) => ({ ...row, subject: row.midterm_subjects })) as Mark[]);
      setReports(((reportsResult.data ?? []) as Report[]).filter((report) => !report.is_deleted));
      setAlerts((alertsResult.data ?? []) as Alert[]);
      setOfficialDate(settingsResult.data?.official_date ?? '');
      setSavedOfficialDate(settingsResult.data?.official_date ?? '');
      setReviewStatus(settingsResult.data?.review_status ?? 'pending');
    }
    setLoading(false);
  }, [role, userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!isDean(role)) return;
    if (!supabase) {
      setTeacherDirectoryError(true);
      return;
    }
    const client = supabase;
    let cancelled = false;
    setTeacherDirectoryLoading(true);

    async function loadTeacherDirectory() {
      const [teachersResult, assignmentsResult] = await Promise.all([
        client.rpc('list_school_teachers'),
        client.rpc('list_teacher_class_assignments'),
      ]);
      if (cancelled) return;
      if (teachersResult.error || assignmentsResult.error) {
        if (teachersResult.error) console.error('Could not load teacher accounts', teachersResult.error);
        if (assignmentsResult.error) console.error('Could not load teacher assignments', assignmentsResult.error);
        setTeacherDirectoryError(true);
        setTeacherDirectoryLoading(false);
        return;
      }
      setTeacherAccounts((teachersResult.data ?? []) as TeacherAccount[]);
      setTeacherAssignments((assignmentsResult.data ?? []) as TeacherClassAssignment[]);
      setTeacherDirectoryLoading(false);
    }

    void loadTeacherDirectory();
    return () => { cancelled = true; };
  }, [role]);
  useEffect(() => {
    if (!supabase || !isDean(role)) return;
    const client = supabase;
    const realtimeReports = pendingRealtimeReports.current;
    const channel = client.channel('midterm-report-dean-review')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'midterm_reports' }, (payload) => {
        const newReport = payload.new as Report;
        if (openingReportIds.current.has(newReport.id)) {
          openingReportIds.current.delete(newReport.id);
          return;
        }
        realtimeReports.set(newReport.id, newReport);
        if (reportNotificationTimer.current) window.clearTimeout(reportNotificationTimer.current);
        reportNotificationTimer.current = window.setTimeout(() => {
          const newReports = [...realtimeReports.values()];
          realtimeReports.clear();
          if (newReports.length) void openSmsReportsRef.current(newReports);
          void refresh();
        }, 350);
      })
      .subscribe();
    return () => {
      if (reportNotificationTimer.current) window.clearTimeout(reportNotificationTimer.current);
      realtimeReports.clear();
      void client.removeChannel(channel);
    };
  }, [role, userId, refresh]);
  useEffect(() => {
    if (!selectedClass && classes.length) setSelectedClass(classes[0]);
  }, [classes, selectedClass]);
  useEffect(() => {
    if (!selectedStudent && classStudents.length) setSelectedStudent(classStudents[0].id);
    else if (!classStudents.some((student) => student.id === selectedStudent)) setSelectedStudent(classStudents[0]?.id ?? '');
  }, [classStudents, selectedStudent]);
  useEffect(() => { setSelectedSubject(classSubjects[0]?.id ?? ''); }, [classSubjects]);

  async function setDate() {
    if (!supabase || !officialDate || !isDean(role)) return;
    setBusy(true);
    const { error: saveError } = await supabase.from('midterm_settings').update({ official_date: officialDate, review_status: 'pending', reviewed_by: null, reviewed_at: null, updated_by: userId ?? null, updated_at: new Date().toISOString() }).eq('id', 1);
    setBusy(false);
    if (saveError) { notify(`Could not save mid-term date: ${saveError.message}`); return; }
    notify('Mid-term date saved. Teacher alerts are visible in the school notification outbox.');
    setReviewStatus('pending');
    setSavedOfficialDate(officialDate);
  }

  async function reviewDate(status: 'approved' | 'extended') {
    if (!supabase || !isDean(role) || !officialDate) return;
    if (status === 'extended' && (!savedOfficialDate || officialDate <= savedOfficialDate)) {
      notify('Choose a new mid-term date later than the currently saved date before extending.');
      return;
    }
    setBusy(true);
    const { error: reviewError } = await supabase.from('midterm_settings').update({ official_date: officialDate, review_status: status, reviewed_by: userId ?? null, reviewed_at: new Date().toISOString(), updated_by: userId ?? null, updated_at: new Date().toISOString() }).eq('id', 1);
    setBusy(false);
    if (reviewError) { console.error('Could not update mid-term review', reviewError); notify('We couldn’t update the mid-term date. Please try again.'); return; }
    setReviewStatus(status);
    setSavedOfficialDate(officialDate);
    notify(status === 'approved' ? 'Mid-term date approved.' : 'Mid-term date changed. Teachers will see the update in their school account.');
  }

  async function saveMark() {
    if (!supabase || !['teacher', 'dean_of_studies', 'it'].includes(role) || !selectedStudent || !selectedSubject || markValue === '') return;
    const value = Number(markValue);
    if (!Number.isFinite(value) || value < 0 || value > 100) { notify('Enter a mark from 0 to 100.'); return; }
    const student = students.find((item) => item.id === selectedStudent);
    if (!student) return;
    setBusy(true);
    const { error: saveError } = await supabase.from('student_midterm_marks').upsert({
      student_id: student.id, class_name: student.class_name, period: currentPeriod,
      subject_id: selectedSubject, mark: value, entered_by: userId ?? null,
      entered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,period,subject_id' });
    setBusy(false);
    if (saveError) { notify(`Could not save mark: ${saveError.message}`); return; }
    setMarkValue('');
    notify('Mark saved.');
    await refresh();
  }

  async function addSubject() {
    const name = subjectDraft.trim();
    if (!supabase || !isDean(role) || !selectedClass || !name) return;
    setBusy(true);
    const { error: addError } = await supabase.from('midterm_subjects').upsert({ class_name: selectedClass, subject_name: name, is_enabled: true, created_by: userId ?? null }, { onConflict: 'class_name,subject_name' });
    setBusy(false);
    if (addError) { notify(`Could not add subject: ${addError.message}`); return; }
    setSubjectDraft('');
    notify(`${name} added to ${selectedClass} mid-term subjects.`);
    await refresh();
  }

  async function assignTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const teacher = teacherAccounts.find((account) => account.id === selectedTeacherId);
    if (!supabase || !isDean(role) || !selectedClass || !teacher) return;
    setBusy(true);
    const { error: assignmentError } = await supabase.from('teacher_class_assignments').upsert({ teacher_user_id: teacher.id, class_name: selectedClass, created_by: userId ?? null }, { onConflict: 'teacher_user_id,class_name' });
    setBusy(false);
    if (assignmentError) { notify(`Could not assign teacher: ${assignmentError.message}`); return; }
    const teacherName = teacher.full_name.trim() || teacher.email;
    setTeacherAssignments((current) => [
      ...current.filter((assignment) => !(assignment.teacher_user_id === teacher.id && assignment.class_name === selectedClass)),
      { teacher_user_id: teacher.id, teacher_name: teacherName, class_name: selectedClass },
    ]);
    setSelectedTeacherId('');
    notify(`${teacherName} is assigned to ${selectedClass}.`);
  }

  async function setSubjectEnabled(subject: Subject) {
    if (!supabase || !isDean(role)) return;
    const { error: updateError } = await supabase.from('midterm_subjects').update({ is_enabled: !subject.is_enabled }).eq('id', subject.id);
    if (updateError) { notify(`Could not update subject: ${updateError.message}`); return; }
    await refresh();
  }

  async function generateReports(force = false, targetStudentId?: string) {
    if (!supabase || !isDean(role)) return;
    const reportClass = targetStudentId ? students.find((student) => student.id === targetStudentId)?.class_name : selectedClass;
    if (!reportClass) return;
    setBusy(true);
    const byStudent = new Map<string, Mark[]>();
    const requiredSubjects = subjects.filter((subject) => subject.class_name === reportClass && subject.is_enabled).length;
    periodMarks.filter((mark) => mark.class_name === reportClass && mark.subject?.is_enabled !== false && (!targetStudentId || mark.student_id === targetStudentId))
      .forEach((mark) => byStudent.set(mark.student_id, [...(byStudent.get(mark.student_id) ?? []), mark]));
    const pending = [...byStudent.entries()].flatMap(([studentId, studentMarks]) => {
      const student = students.find((entry) => entry.id === studentId);
      if (!student) return [];
      if (requiredSubjects === 0 || new Set(studentMarks.map((mark) => mark.subject_id)).size < requiredSubjects) return [];
      const lastReport = reports.filter((report) => report.student_id === studentId && report.period === currentPeriod).sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0];
      const changedSinceLastReport = shouldRegenerateReport(studentMarks, lastReport?.generated_at, force);
      if (!changedSinceLastReport) return [];
      const rows: ReportRow[] = compileReportRows(studentMarks);
      if (!rows.length) return [];
      const average = averageMark(rows);
      return [{ id: crypto.randomUUID(), student_id: studentId, student_name: student.full_name, class_name: student.class_name, period: currentPeriod, average: Number(average.toFixed(2)), report_data: { rows }, generated_by: userId ?? null, generated_at: new Date().toISOString() }];
    });
    if (!pending.length) {
      setBusy(false);
      notify('No new or updated marks since the latest report generation.');
      return;
    }
    pending.forEach((report) => openingReportIds.current.add(report.id));
    const { data, error: generateError } = await supabase.from('midterm_reports').insert(pending).select('*');
    setBusy(false);
    if (generateError || !data) {
      pending.forEach((report) => openingReportIds.current.delete(report.id));
      notify(`Report generation failed: ${generateError?.message ?? 'No reports returned.'}`);
      return;
    }
    notify(`Generated ${data.length} report${data.length === 1 ? '' : 's'} for ${reportClass}.`);
    await refresh();
    // Open one recipient review for the full batch; ignore these rows in realtime.
    await openSmsReports(data as Report[]);
  }

  async function openSmsReports(selectedReports: Report[]) {
    if (!supabase || !isDean(role)) return;
    const { data, error: contactError } = await supabase.from('midterm_report_contacts')
      .select('report_id, parent_name, phone, email').in('report_id', selectedReports.map((report) => report.id));
    if (contactError) { notify(`Could not load report recipients: ${contactError.message}`); return; }
    const contactByReport = new Map((data ?? []).map((contact) => [contact.report_id, contact]));
    setSmsReports(selectedReports.map((report) => {
      const contact = contactByReport.get(report.id);
      return { ...report, report_data: { ...report.report_data, parent_name: contact?.parent_name ?? '', phone: contact?.phone ?? '', email: contact?.email ?? '' } };
    }));
  }
  const openSmsReportsRef = useRef(openSmsReports);
  openSmsReportsRef.current = openSmsReports;

  async function deleteReport(report: Report) {
    if (!supabase || !isDean(role) || !window.confirm(`Delete the ${report.period} report for ${report.student_name}?`)) return;
    const { error: deleteError } = await supabase.from('midterm_reports').update({ is_deleted: true, deleted_by: userId ?? null, deleted_at: new Date().toISOString() }).eq('id', report.id);
    if (deleteError) { notify(`Could not delete report: ${deleteError.message}`); return; }
    notify('Report deleted. Generate again to create a fresh snapshot.');
    setReportView(null);
    await refresh();
  }

  async function saveReport() {
    if (!supabase || !reportView || !isDean(role)) return;
    const rows = (reportView.report_data.rows ?? []).filter((row) => Number(row.mark) > 0);
    for (const row of reportView.report_data.rows ?? []) {
      if (!row.subject_id || !reportView.student_id) continue;
      const { error: markError } = await supabase.from('student_midterm_marks').update({ mark: Number(row.mark), entered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('student_id', reportView.student_id).eq('period', reportView.period).eq('subject_id', row.subject_id);
      if (markError) { notify(`Could not update ${row.subject}: ${markError.message}`); return; }
    }
    const average = averageMark(rows);
    const { error: saveError } = await supabase.from('midterm_reports').update({ teacher_comment: reportView.teacher_comment, report_data: { ...reportView.report_data, rows }, average: Number(average.toFixed(2)), generated_at: new Date().toISOString(), pdf_generated_at: null, pdf_storage_path: null }).eq('id', reportView.id);
    if (saveError) { notify(`Could not save report: ${saveError.message}`); return; }
    notify('Report marks and teacher comment saved.');
    setReportView(null);
    await refresh();
  }

  async function approveReport(report: Report) {
    if (!supabase || !isDean(role)) return;
    const { error: approveError } = await supabase.from('midterm_reports').update({ review_status: 'approved', reviewed_by: userId ?? null, reviewed_at: new Date().toISOString() }).eq('id', report.id);
    if (approveError) { notify(`Could not approve report: ${approveError.message}`); return; }
    notify(`Report for ${report.student_name} approved.`);
    setReportView({ ...report, review_status: 'approved' });
    await refresh();
  }

  async function queueSms() {
    if (!supabase || !isDean(role) || smsRecipients.length === 0) return;
    const fingerprint = `${smsReports.map((report) => report.id).sort().join(':')}:${smsText.trim()}`;
    setBusy(true);
    const { data: existing } = await supabase.from('midterm_sms_dispatches').select('id').eq('fingerprint', fingerprint).maybeSingle();
    if (existing) { setBusy(false); notify('This message has already been saved for these parents.'); return; }
    const { data: campaign, error: campaignError } = await supabase.from('notification_campaigns').insert({
      title: `Mid-term reports · ${currentPeriod}`, message: smsText.trim(), channels: ['SMS'],
      recipient_count: smsRecipients.length, status: 'Draft', category: 'Examination result',
    }).select('id').maybeSingle();
    if (campaignError || !campaign) { setBusy(false); console.error('Could not save mid-term message', campaignError); notify('We couldn’t save this message. Please try again.'); return; }
    const { error: ledgerError } = await supabase.from('midterm_sms_dispatches').insert({ fingerprint, period: currentPeriod, campaign_id: campaign.id, recipient_count: smsRecipients.length, created_by: userId ?? null });
    if (ledgerError) {
      await supabase.from('notification_campaigns').delete().eq('id', campaign.id);
      setBusy(false);
      console.error('Could not save mid-term message recipients', ledgerError);
      notify(ledgerError.code === '23505' ? 'This message has already been saved for these parents.' : 'We couldn’t save this message. Please try again.');
      return;
    }
    setBusy(false);
    setSmsReports([]);
    notify('Draft saved. It hasn’t been sent.');
  }

  const smsRecipients = useMemo(() => smsReports.filter((report) => isValidSmsPhone(report.report_data.phone)
    && Boolean(report.report_data.parent_name?.trim() && report.report_data.parent_name.trim().toLowerCase() !== 'not provided')),
  [smsReports]);
  const invalidRecipientCount = smsReports.length - smsRecipients.length;
  const markByStudentAndSubject = (studentId: string, subjectId: string) => periodMarks.find((mark) => mark.student_id === studentId && mark.subject_id === subjectId);
  const studentHasReport = (studentId: string) => reports.some((report) => report.student_id === studentId && report.period === currentPeriod);
  function positionForReport(report: Report) {
    const snapshots = new Map<string, Report>();
        reports.filter((candidate) => candidate.period === report.period && candidate.class_name === report.class_name
        && candidate.generated_at <= report.generated_at && candidate.student_id)
          .forEach((candidate) => {
        const key = candidate.student_id as string;
        const previous = snapshots.get(key);
        if (!previous || previous.generated_at < candidate.generated_at) snapshots.set(key, candidate);
      });
    const cohort = [...snapshots.values()];
    const higherAverages = cohort.filter((candidate) => Number(candidate.average) > Number(report.average)).length;
      return { rank: higherAverages + 1, total: cohort.length };
  }

  async function downloadReportPdf(report: Report) {
    if (!supabase) { notify('Report downloads are unavailable right now. Please try again later.'); return; }
    const storage = supabase.storage.from('midterm-reports');
    const storagePath = report.pdf_storage_path || `${report.id}/report.pdf`;
    const pdfIsFresh = report.pdf_storage_path && report.pdf_generated_at
      && Date.now() - new Date(report.pdf_generated_at).getTime() < 7 * 24 * 60 * 60 * 1000;
    let pdfBlob: Blob;
    if (pdfIsFresh) {
      const { data, error: downloadError } = await storage.download(storagePath);
      if (downloadError || !data) { notify(`Could not download saved PDF: ${downloadError?.message ?? 'File missing.'}`); return; }
      pdfBlob = data;
    } else {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF();
      pdf.setFontSize(17);
      pdf.text('GS Gacuba D.A.', 14, 18);
      pdf.setFontSize(12);
      pdf.text('Student Mid-Term Report', 14, 27);
      pdf.setFontSize(10);
      pdf.text(`Student: ${report.student_name}`, 14, 39);
      pdf.text(`Class: ${report.class_name}    Period: ${report.period}`, 14, 46);
      const position = positionForReport(report);
      pdf.text(`Position: ${position.rank} of ${position.total}`, 14, 53);
      pdf.text(`Average: ${Number(report.average).toFixed(1)}%    Result: ${report.average >= 50 ? 'Pass' : 'Review'}`, 14, 60);
      let y = 74;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Subject', 14, y); pdf.text('Mark', 105, y); pdf.text('Weight', 130, y); pdf.text('Grade', 160, y);
      pdf.setFont('helvetica', 'normal');
      y += 8;
      for (const row of report.report_data.rows ?? []) {
        if (row.mark <= 0) continue;
        if (y > 275) { pdf.addPage(); y = 20; }
        pdf.text(row.subject.slice(0, 48), 14, y);
        pdf.text(String(row.mark), 105, y); pdf.text(String(row.weight), 130, y); pdf.text(row.grade, 160, y);
        y += 7;
      }
      y += 8;
      if (y > 275) { pdf.addPage(); y = 20; }
      pdf.setFont('helvetica', 'bold'); pdf.text(`Total: ${(report.report_data.rows ?? []).filter((row) => row.mark > 0).reduce((sum, row) => sum + row.mark, 0)}`, 14, y);
      y += 10;
      pdf.setFont('helvetica', 'normal');
      const commentLines = pdf.splitTextToSize(`Teacher's comment: ${report.teacher_comment || '—'}`, 180);
      pdf.text(commentLines, 14, y);
      pdfBlob = pdf.output('blob');
      const { error: uploadError } = await storage.upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
      if (uploadError) { notify(`Could not store report PDF: ${uploadError.message}`); return; }
      const pdfGeneratedAt = new Date().toISOString();
      const { error: metadataError } = await supabase.rpc('set_midterm_report_pdf_metadata', { p_report_id: report.id, p_pdf_generated_at: pdfGeneratedAt, p_pdf_storage_path: storagePath });
      if (metadataError) { notify(`PDF was created but its metadata could not be saved: ${metadataError.message}`); return; }
    }
    const objectUrl = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `midterm-${report.student_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${report.period.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    notify(pdfIsFresh ? 'Downloaded the stored report PDF.' : 'Generated and stored a fresh report PDF.');
  }

  if (loading) return <div className="flex items-center gap-2 p-8 text-sm text-stone-500"><LoaderCircle className="animate-spin" size={18} />Loading mid-term workspace…</div>;

  return (
    <div className="space-y-6 text-stone-800">
      {isDean(role) && reports.some((report) => report.review_status === 'pending') && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">Reports awaiting Dean approval</h2><div className="mt-3 flex flex-wrap gap-2">{reports.filter((report) => report.review_status === 'pending').map((report) => <button key={report.id} onClick={() => void approveReport(report)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950">Approve {report.student_name} · {report.class_name}</button>)}</div></section>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-[#C59B27]">Academic reports</p><h1 className="mt-1 text-2xl font-bold text-stone-900 sm:text-3xl">Mid-term marks</h1><p className="mt-1 text-sm text-stone-500">Enter marks, review results, and prepare reports.</p></div>
        {isDean(role) && <button onClick={() => void generateReports()} disabled={busy || !selectedClass} className="inline-flex items-center gap-2 rounded-xl bg-[#3A2818] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#281B10]"><FileText size={16} />{busy ? 'Working…' : 'Generate Report'}</button>}
      </div>
      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle size={18} />{error}</div>}

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><CalendarDays size={20} /></div><div className="flex-1"><h2 className="font-semibold text-stone-900">Mid-term date</h2><p className="mt-1 text-xs text-stone-500">Choose the date teachers should have marks ready.</p></div></div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><input aria-label="Official mid-term date" type="date" className="min-w-48 rounded-lg border border-stone-200 px-3 py-2 text-sm" value={officialDate} onChange={(event) => setOfficialDate(event.target.value)} disabled={!isDean(role)} />{isDean(role) && <><button onClick={setDate} disabled={busy || !officialDate} className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50">Save date</button><button onClick={() => void reviewDate('approved')} disabled={busy || !officialDate} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white">Approve</button><button onClick={() => void reviewDate('extended')} disabled={busy || !officialDate} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Extend deadline</button></>}<span className="rounded-full bg-stone-100 px-3 py-2 text-xs capitalize text-stone-600">{reviewStatus}</span></div>
          {alerts.length > 0 && <div aria-label="Mid-term notifications" className="mt-4 space-y-2">{alerts.map((alert) => <div key={alert.id} className={`flex items-start gap-2 rounded-lg p-3 text-xs ${alert.read_at ? 'bg-stone-50 text-stone-500' : 'bg-sky-50 text-sky-900'}`}><Bell size={14} className="mt-0.5 shrink-0"/><div><strong>{alert.event_type.replace(/_/g, ' ')}</strong><span className="ml-2">{String(alert.payload.official_date ?? alert.payload.student_name ?? alert.payload.period ?? '')}</span><small className="ml-2">{new Date(alert.created_at).toLocaleString()}</small></div></div>)}</div>}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-stone-900">Assessment period</h2><p className="mt-1 text-xs text-stone-500">{currentPeriod} · {students.length} students visible to your role</p></div><Bell size={18} className="text-[#C59B27]" /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{periodMarks.length}</strong><span className="text-xs text-stone-500">Marks recorded</span></div><div className="rounded-xl bg-stone-50 p-3"><strong className="block text-xl">{reports.length}</strong><span className="text-xs text-stone-500">Historical reports</span></div></div></div>
      </section>

      {role !== 'unknown' && <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-stone-900">Marks and subjects</h2><p className="mt-1 text-xs text-stone-500">Teachers can edit marks until a report exists; zero-mark subjects are excluded from compiled reports.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Class" className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>{classes.map((name) => <option key={name}>{name}</option>)}</select>{isDean(role) && <button onClick={() => void generateReports()} disabled={busy} className="rounded-lg bg-[#3A2818] px-3 py-2 text-sm font-medium text-white">Generate Report</button>}</div></div>
        {isDean(role) && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-3"><Settings2 size={16} className="text-stone-500"/><div className="flex flex-wrap gap-2">{subjects.filter((subject) => subject.class_name === selectedClass).map((subject) => <button key={subject.id} onClick={() => void setSubjectEnabled(subject)} title="Toggle subject inclusion" className={`rounded-full border px-3 py-1 text-xs ${subject.is_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-white text-stone-500 line-through'}`}>{subject.subject_name}</button>)}</div><form className="ml-auto flex gap-2" onSubmit={(event) => { event.preventDefault(); void addSubject(); }}><input aria-label="New subject" className="w-36 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs" placeholder="Add subject" value={subjectDraft} onChange={(event) => setSubjectDraft(event.target.value)} /><button aria-label="Add subject" className="rounded-lg bg-stone-800 p-2 text-white"><Plus size={14}/></button></form></div>}
        {isDean(role) && <section className="mt-3 rounded-xl border border-stone-100 p-3">
          <form onSubmit={(event) => void assignTeacher(event)} className="flex flex-wrap items-center gap-2">
            <label htmlFor="teacher-assignment" className="text-xs font-semibold text-stone-700">Assign a teacher</label>
            <select
              id="teacher-assignment"
              value={selectedTeacherId}
              onChange={(event) => setSelectedTeacherId(event.target.value)}
              disabled={teacherDirectoryLoading || teacherDirectoryError || teacherAccounts.length === 0}
              className="min-w-64 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"
            >
              <option value="">Choose a teacher</option>
              {teacherAccounts.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name.trim() || teacher.email}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !selectedClass || !selectedTeacherId || teacherDirectoryLoading || teacherDirectoryError}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
            >
              Assign to {selectedClass || 'class'}
            </button>
          </form>
          {teacherDirectoryError ? (
            <p role="alert" className="mt-3 text-xs text-rose-700">The teacher list is unavailable right now. Please ask IT for help.</p>
          ) : teacherDirectoryLoading ? (
            <p className="mt-3 text-xs text-stone-500">Loading teacher accounts…</p>
          ) : teacherAccounts.length === 0 ? (
            <p className="mt-3 text-xs text-stone-500">No teacher accounts are available to assign.</p>
          ) : (
            <div className="mt-3">
              <h3 className="text-xs font-semibold text-stone-700">Teachers assigned to {selectedClass || 'this class'}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {teacherAssignments.filter((assignment) => assignment.class_name === selectedClass).map((assignment) => (
                  <li key={`${assignment.teacher_user_id}-${assignment.class_name}`} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">
                    {assignment.teacher_name}
                  </li>
                ))}
                {!teacherAssignments.some((assignment) => assignment.class_name === selectedClass) && (
                  <li className="text-xs text-stone-500">No teachers assigned yet.</li>
                )}
              </ul>
            </div>
          )}
        </section>}
        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-100"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-stone-500"><tr><th className="px-4 py-3">Student</th>{classSubjects.map((subject) => <th key={subject.id} className="px-4 py-3">{subject.subject_name}</th>)}<th className="px-4 py-3">Average</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-stone-100">{classStudents.map((student) => { const studentMarks = periodMarks.filter((mark) => mark.student_id === student.id && Number(mark.mark) > 0); const average = studentMarks.length ? studentMarks.reduce((sum, mark) => sum + Number(mark.mark), 0) / studentMarks.length : null; return <tr key={student.id}><td className="px-4 py-3"><strong className="text-stone-900">{student.full_name}</strong><small className="block text-stone-500">{student.class_name}{student.stream ? ` · ${student.stream}` : ''}</small></td>{classSubjects.map((subject) => { const mark = markByStudentAndSubject(student.id, subject.id); return <td key={subject.id} className="px-4 py-3 text-stone-700">{mark ? Number(mark.mark) : '—'}</td>; })}<td className="px-4 py-3">{average === null ? '—' : `${average.toFixed(1)}%`}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] ${studentHasReport(student.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{studentHasReport(student.id) ? 'Compiled' : studentMarks.length ? 'Marks entered' : 'No marks'}</span></td></tr>; })}</tbody></table>{!classStudents.length && <p className="p-8 text-center text-sm text-stone-500">No student records found for this filter.</p>}</div>
        {role !== 'headteacher' && <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-stone-100 bg-[#FBF9F5] p-4"><div className="min-w-40 flex-1"><label className="mb-1 block text-xs font-medium text-stone-600">Student</label><select className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)}>{classStudents.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></div><div className="min-w-40 flex-1"><label className="mb-1 block text-xs font-medium text-stone-600">Subject</label><select className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{classSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.subject_name}</option>)}</select></div><div className="w-28"><label className="mb-1 block text-xs font-medium text-stone-600">Mark / 100</label><input type="number" min="0" max="100" step="0.01" value={markValue} onChange={(event) => setMarkValue(event.target.value)} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" placeholder="0–100" /></div><button onClick={saveMark} disabled={busy || !selectedSubject || !selectedStudent || (role === 'teacher' && studentHasReport(selectedStudent))} className="rounded-lg bg-[#3A2818] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save mark</button>{role === 'teacher' && studentHasReport(selectedStudent) && <span className="text-xs text-rose-700">Marks are locked after report generation.</span>}</div>}
      </section>}

      {isDean(role) && <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-stone-900">Student report filters</h2><p className="mt-1 text-xs text-stone-500">Filter the current class register by marks and average. Reports with no marks are never compiled.</p><div className="mt-3 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={belowAverageOnly} onChange={(event) => setBelowAverageOnly(event.target.checked)} />Below class average ({averageClassMark.toFixed(1)}%)</label><label className="flex items-center gap-2"><input type="checkbox" checked={withoutMarksOnly} onChange={(event) => setWithoutMarksOnly(event.target.checked)} />Students without marks</label></div><p className="mt-2 text-xs text-stone-500">The filters apply to the class marks register above; students with no marks remain visible when that filter is off.</p></section>}

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 p-5"><div><h2 className="font-semibold text-stone-900">Mid-Term History</h2><p className="mt-1 text-xs text-stone-500">Every report generation is retained as a dated historical snapshot.</p></div><div className="flex flex-wrap gap-2"><label className="relative"><Search size={15} className="absolute left-3 top-2.5 text-stone-400"/><input aria-label="Search report history" className="w-48 rounded-lg border border-stone-200 py-2 pl-9 pr-3 text-sm" placeholder="Search history" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)}/></label><select aria-label="Filter report class" className="rounded-lg border border-stone-200 px-3 py-2 text-sm" value={historyClass} onChange={(event) => setHistoryClass(event.target.value)}><option value="">All classes</option>{classes.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Filter report average" className="rounded-lg border border-stone-200 px-3 py-2 text-sm" value={historyAverage} onChange={(event) => setHistoryAverage(event.target.value)}><option value="">All averages</option><option value="below50">Below 50%</option><option value="50to69">50–69%</option><option value="70plus">70% and above</option></select><select aria-label="Filter report year" className="rounded-lg border border-stone-200 px-3 py-2 text-sm" value={historyYear} onChange={(event) => setHistoryYear(event.target.value)}><option value="">All years</option>{[2023, 2024, 2025, 2026].map((year) => <option key={year}>{year}</option>)}</select></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-stone-500"><tr><th className="px-5 py-3">Period</th><th className="px-5 py-3">Class</th><th className="px-5 py-3">Student Name</th><th className="px-5 py-3">Average</th><th className="px-5 py-3">Generated</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-stone-100">{filteredHistory.map((report) => <tr key={report.id}><td className="px-5 py-3">{report.period}</td><td className="px-5 py-3">{report.class_name}</td><td className="px-5 py-3 font-medium text-stone-900">{report.student_name}</td><td className="px-5 py-3">{Number(report.average).toFixed(1)}%</td><td className="px-5 py-3 text-stone-500">{new Date(report.generated_at).toLocaleDateString()}</td><td className="px-5 py-3"><div className="flex justify-end gap-1"><button title="Alert / SMS" aria-label={`Alert ${report.student_name}`} disabled={!isDean(role)} onClick={() => void openSmsReports([report])} className="rounded-lg p-2 text-stone-500 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-40"><Bell size={16}/></button><button title="View report" aria-label={`View ${report.student_name} report`} onClick={() => setReportView(report)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><Eye size={16}/></button><button title="Download PDF" aria-label={`Download ${report.student_name} report`} onClick={() => void downloadReportPdf(report)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><Download size={16}/></button>{isDean(role) && <button title="Delete report" aria-label={`Delete ${report.student_name} report`} onClick={() => void deleteReport(report)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16}/></button>}</div></td></tr>)}</tbody></table>{filteredHistory.length === 0 && <div className="p-10 text-center text-sm text-stone-500">No reports match these filters.</div>}</div></section>

      {reportView && <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/40 p-4 sm:p-8 print:static print:overflow-visible print:bg-white print:p-0"><article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-2xl print:max-w-none print:rounded-none print:p-8 print:shadow-none"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-700">GS Gacuba D.A. · {reportView.period}</p><h2 className="mt-2 text-2xl font-bold text-stone-900">{reportView.student_name}</h2><div className="mt-2 flex gap-2"><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold">{reportView.class_name}</span><span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold">Average {Number(reportView.average).toFixed(1)}%</span></div></div><button aria-label="Close report" onClick={() => setReportView(null)} className="rounded-lg p-2 hover:bg-stone-100 print:hidden"><X size={18}/></button></div>{isDean(role) && <div className="mt-5 grid gap-2 sm:grid-cols-2 print:hidden">{(reportView.report_data.rows ?? []).map((row, index) => <label key={`${row.subject}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2 text-xs">{row.subject}<input aria-label={`${row.subject} mark`} type="number" min="0" max="100" value={row.mark} onChange={(event) => { const value = Math.max(0, Math.min(100, Number(event.target.value))); const rows = (reportView.report_data.rows ?? []).map((item, rowIndex) => rowIndex === index ? { ...item, mark: value, weight: Math.round(value / 10), grade: gradeFor(value) } : item); const average = rows.filter((item) => item.mark > 0).reduce((sum, item, _rowIndex, all) => sum + item.mark / (all.length || 1), 0); setReportView({ ...reportView, report_data: { ...reportView.report_data, rows }, average }); }} className="w-20 rounded border border-stone-200 px-2 py-1"/></label>)}</div>}<div className="mt-6 overflow-hidden rounded-xl border border-stone-200"><table className="w-full text-left text-sm"><thead className="bg-stone-50"><tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Mark</th><th className="px-4 py-3">Weight</th><th className="px-4 py-3">Grade</th></tr></thead><tbody>{(reportView.report_data.rows ?? []).filter((row) => row.mark > 0).map((row, index) => <tr key={`${row.subject}-${index}`} className="border-t border-stone-100"><td className="px-4 py-3">{row.subject}</td><td className="px-4 py-3">{row.mark}</td><td className="px-4 py-3">{row.weight}</td><td className="px-4 py-3 font-semibold">{row.grade}</td></tr>)}</tbody><tfoot className="border-t border-stone-200 bg-stone-50 font-bold"><tr><td className="px-4 py-3">Total / Result</td><td className="px-4 py-3">{(reportView.report_data.rows ?? []).filter((row) => row.mark > 0).reduce((sum, row) => sum + row.mark, 0)}</td><td/><td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">{reportView.average >= 50 ? 'Pass' : 'Review'}</span></td></tr></tfoot></table></div><label className="mt-5 block text-sm font-medium text-stone-700">Teacher’s comment<textarea rows={3} value={reportView.teacher_comment ?? ''} disabled={!isDean(role)} onChange={(event) => setReportView({ ...reportView, teacher_comment: event.target.value })} className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm disabled:bg-stone-50" placeholder="Enter a teacher comment"/></label><div className="mt-5 flex justify-end gap-2 print:hidden"><button onClick={() => setReportView(null)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Back</button>{isDean(role) && <><button onClick={() => { const studentId = reportView.student_id ?? undefined; setReportView(null); void generateReports(true, studentId); }} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">Regenerate</button><button onClick={() => void saveReport()} className="rounded-lg bg-[#3A2818] px-4 py-2 text-sm font-semibold text-white"><Check size={15} className="mr-1 inline"/>Save</button></>}</div></article></div>}

      {smsReports.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="midterm-sms-title"
          className="fixed inset-0 z-[90] flex flex-col bg-white"
        >
          <header className="flex items-start justify-between gap-4 bg-[#3A2818] px-5 py-5 text-white sm:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Dean · SMS review</p>
              <h2 id="midterm-sms-title" className="mt-1 text-xl font-bold">Mid-Term report notification</h2>
              <p className="mt-1 text-xs text-stone-300">
                Check who will receive this message. Parents without a phone number won’t be included.
                Update their details in the student list.
              </p>
            </div>
            <button aria-label="Close SMS review" onClick={() => setSmsReports([])} className="rounded-lg p-2 hover:bg-white/10">
              <X size={20} />
            </button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
            <div className="mx-auto max-w-4xl space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-stone-50 p-4">
                  <strong className="block text-2xl">{smsRecipients.length}</strong>
                  <span className="text-xs text-stone-500">Parents to contact</span>
                </div>
                <div className="rounded-xl bg-rose-50 p-4">
                  <strong className="block text-2xl text-rose-800">{invalidRecipientCount}</strong>
                  <span className="text-xs text-rose-700">Not included · no phone number</span>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-stone-200">
                <div className="max-h-[45vh] overflow-y-auto">
                  {smsRecipients.map((report) => (
                    <div key={report.id} className="flex items-center justify-between gap-4 border-b border-stone-100 px-4 py-3 last:border-0">
                      <div>
                        <strong className="block text-sm text-stone-900">{report.report_data.parent_name || 'Parent / guardian'}</strong>
                        <span className="text-xs text-stone-500">{report.student_name} · {report.class_name}</span>
                      </div>
                      <span className="text-xs text-stone-600">{report.report_data.phone}</span>
                    </div>
                  ))}
                </div>
              </div>
              <label className="block text-sm font-medium text-stone-700">
                Message
                <textarea
                  rows={4}
                  maxLength={480}
                  value={smsText}
                  onChange={(event) => setSmsText(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm"
                />
              </label>
              <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <AlertCircle size={16} className="shrink-0" />
                This saves a draft only. No text messages will be sent yet.
              </p>
            </div>
          </main>
          <footer className="flex justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4 sm:px-8">
            <button onClick={() => setSmsReports([])} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm">
              Cancel
            </button>
            <button
              onClick={() => void queueSms()}
              disabled={busy || !smsRecipients.length || !smsText.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#3A2818] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Send size={15} />
              {busy ? 'Saving…' : 'Save draft'}
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
