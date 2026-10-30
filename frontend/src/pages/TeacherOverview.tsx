import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ClipboardList, GraduationCap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Student = { id: string; full_name: string; class_name: string; stream?: string };
type ClassSummary = { className: string; studentCount: number; streams: string[] };

export default function TeacherOverview({
  teacherName,
  onNavigate,
}: {
  teacherName: string;
  onNavigate: (path: '/students' | '/midterm') => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClasses() {
      if (!supabase) {
        setError(true);
        setLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from('teacher_student_register')
        .select('id, full_name, class_name, stream')
        .order('class_name')
        .order('full_name');

      if (cancelled) return;
      if (queryError) {
        console.error('Could not load the teacher class list', queryError);
        setError(true);
      } else {
        setStudents((data ?? []) as Student[]);
      }
      setLoading(false);
    }

    void loadClasses();
    return () => { cancelled = true; };
  }, []);

  const classes = useMemo(() => {
    const summaries = new Map<string, ClassSummary>();
    students.forEach((student) => {
      const summary = summaries.get(student.class_name) ?? {
        className: student.class_name,
        studentCount: 0,
        streams: [],
      };
      summary.studentCount += 1;
      if (student.stream && !summary.streams.includes(student.stream)) summary.streams.push(student.stream);
      summaries.set(student.class_name, summary);
    });
    return [...summaries.values()];
  }, [students]);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#ea580c]">Teacher home</p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900 sm:text-3xl">
          Welcome, {teacherName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Your classes and student lists are here. Choose a class to view its register or enter marks.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/students')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#3b2314] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4a2c19]"
          >
            <BookOpen size={16} /> View class register
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/midterm')}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <ClipboardList size={16} /> Enter marks
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="font-semibold text-stone-900">Your classes</h2>
          <p className="mt-1 text-sm text-stone-500">
            {loading ? 'Loading your class list…' : `${classes.length} ${classes.length === 1 ? 'class' : 'classes'} · ${students.length} students`}
          </p>
        </div>

        {error ? (
          <div role="alert" className="p-6">
            <h3 className="font-semibold text-stone-900">Your class list isn’t available</h3>
            <p className="mt-1 text-sm text-stone-600">Please try again later or ask the school IT or dean of studies for help.</p>
          </div>
        ) : loading ? (
          <p className="p-6 text-sm text-stone-500">Loading your class list…</p>
        ) : classes.length ? (
          <div className="system-table-wrap rounded-none border-0">
            <table className="system-table">
              <thead>
                <tr><th>Class</th><th>Streams</th><th>Students</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {classes.map((classSummary) => (
                  <tr key={classSummary.className}>
                    <td className="font-semibold">{classSummary.className}</td>
                    <td>{classSummary.streams.join(', ') || '—'}</td>
                    <td>{classSummary.studentCount}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => onNavigate('/students')}
                        className="inline-flex items-center gap-1 font-semibold text-[#c2410c] hover:text-[#9a3412]"
                      >
                        Open register <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <GraduationCap className="mx-auto text-stone-300" size={28} />
            <h3 className="mt-3 font-semibold text-stone-900">No classes assigned yet</h3>
            <p className="mt-1 text-sm text-stone-600">Ask the Dean of Studies to add your classes.</p>
          </div>
        )}
      </section>
    </div>
  );
}
