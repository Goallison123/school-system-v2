import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight,
  FileSpreadsheet,
  Search,
  Plus,
  Pencil,
  X,
  Users,
  CheckCircle2,
  Save,
  Archive,
  RotateCcw,
  Trash,
} from "lucide-react";
import {
  autoMapStudentCsvHeaders,
  parseStudentCsv,
  previewStudentCsvRows,
  type ParsedCsvRow,
  type StudentCsvMapping,
} from "@/utils/studentCsv";
import { supabase } from "@/lib/supabase";
import { triggerStudentWelcomeNotification } from "@/services/automationService";

type FeeStatus = "Paid" | "Partial" | "Unpaid";

type Student = {
  id: string;
  registryCode: string;
  fullName: string;
  parentName: string;
  email: string;
  phone: string;
  studentClass: string;
  stream?: string;
  feeStatus: FeeStatus;
  feeAmount: string;
  lastUpdated: string;
};

type ArchivedStudent = Student & {
  originalId: string;
  archivedAt: string;
  archivedReason?: string;
};

const classes = [
  "S1 A", "S1 B", "S1 C",
  "S2 A", "S2 B", "S2 C",
  "S3 A", "S3 B", "S3 C",
  "S4 ARH", "S4 STREAM 2",
  "S5 ARH", "S5 STREAM 2",
  "S6 MPC", "S6 HGL"
];

const initialStudents: Student[] = [];

const emptyForm = {
  fullName: "",
  registryCode: "",
  parentName: "",
  email: "",
  phone: "",
  studentClass: "S1 A",
  stream: "General",
  feeStatus: "Paid" as FeeStatus,
  feeAmount: "145,000 RWF",
};

function toStudentRecord(row: Record<string, unknown>): Student {
  return {
    id: String(row.id),
    registryCode: String(row.registration_number ?? row.registry_code ?? `STU-${String(row.id).slice(0, 8).toUpperCase()}`),
    fullName: String(row.full_name ?? ""),
    parentName: String(row.parent_name ?? "Not provided"),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    studentClass: String(row.class_name ?? ""),
    stream: String(row.stream ?? ""),
    feeStatus: row.fee_status === "Paid" || row.fee_status === "Partial" ? row.fee_status : "Unpaid",
    feeAmount: String(row.fee_amount ?? "0 RWF"),
    lastUpdated: row.updated_at ? new Date(String(row.updated_at)).toLocaleDateString() : "Just now",
  };
}

function toArchivedRecord(row: Record<string, unknown>): ArchivedStudent {
  const base = toStudentRecord(row);
  return {
    ...base,
    originalId: String(row.original_id ?? row.id),
    archivedAt: row.archived_at ? new Date(String(row.archived_at)).toLocaleString() : "Just now",
    archivedReason: String(row.archived_reason ?? ""),
  };
}

function toStudentPayload(student: Omit<Student, "id" | "lastUpdated">) {
  const registryCode = student.registryCode?.trim() || newRegistryCode();
  return {
    registry_code: registryCode,
    registration_number: registryCode,
    full_name: student.fullName,
    parent_name: student.parentName,
    email: student.email,
    phone: student.phone,
    class_name: student.studentClass,
    stream: student.stream ?? "",
    fee_status: student.feeStatus,
    fee_amount: student.feeAmount,
    updated_at: new Date().toISOString(),
  };
}

function toArchivePayload(student: Student, reason = "Deleted by admin") {
  return {
    original_id: student.id,
    registry_code: student.registryCode,
    registration_number: student.registryCode,
    full_name: student.fullName,
    parent_name: student.parentName,
    email: student.email,
    phone: student.phone,
    class_name: student.studentClass,
    stream: student.stream ?? "",
    fee_status: student.feeStatus,
    fee_amount: student.feeAmount,
    archived_at: new Date().toISOString(),
    archived_reason: reason,
    archived_by: "admin",
    original_data: toStudentPayload(student),
  };
}

function newRegistryCode() {
  return `GSG-${Math.floor(10000 + Math.random() * 90000)}`;
}

function validateParentContact(email: string, phone: string) {
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid parent email address.";
  }
  if (phone.replace(/[\s()+.-]/g, "").length < 8) {
    return "Enter a valid parent phone number.";
  }
  return "";
}

export default function Students() {
  const [students, setStudents] = useState<Student[]>(supabase ? [] : initialStudents);
  const [archivedStudents, setArchivedStudents] = useState<ArchivedStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(Boolean(supabase));
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeSubMenu, setActiveSubMenu] = useState<"all" | "class" | "fee" | "archive">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [modalStudent, setModalStudent] = useState<Student | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvRows, setCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvMapping, setCsvMapping] = useState<StudentCsvMapping | null>(null);
  const [csvError, setCsvError] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [toast, setToast] = useState("");
  const [formError, setFormError] = useState("");
  const [sendWelcomeNotice, setSendWelcomeNotice] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [studentToArchive, setStudentToArchive] = useState<Student | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const importPreview = useMemo(
    () => csvMapping ? previewStudentCsvRows(csvRows, csvMapping, students) : [],
    [csvRows, csvMapping, students],
  );
  const importableRows = importPreview.filter((row) => row.student && !row.errors.length && !row.duplicateLabel);
  const duplicateRows = importPreview.filter((row) => row.duplicateLabel);
  const invalidRows = importPreview.filter((row) => row.errors.length > 0);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    async function loadStudents() {
      const { data, error: loadError } = await supabase!
        .from("school_students")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (loadError) {
        console.error("Failed to load student registry", loadError);
        notify("We couldn’t load the student list. Please try again.");
      } else {
        const mapped = (data ?? []).map((row) => toStudentRecord(row as unknown as Record<string, unknown>));
        setStudents(mapped.length > 0 ? mapped : initialStudents);
      }
      setStudentsLoading(false);
    }
    async function loadArchive() {
      setArchiveLoading(true);
      const { data, error } = await supabase!
        .from("school_students_archive")
        .select("*")
        .order("archived_at", { ascending: false });
      if (!error && data) {
        setArchivedStudents((data as unknown as Record<string, unknown>[]).map(toArchivedRecord));
      }
      setArchiveLoading(false);
    }
    void loadStudents();
    void loadArchive();
    return () => { cancelled = true; };
  }, []);

  const availableClasses = useMemo(() => {
    return [...new Set([...classes, ...students.map((s) => s.studentClass).filter(Boolean)])].sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = activeSubMenu === "archive" ? archivedStudents : students;
    return source.filter((student) => {
      const matchesSearch = [
        student.fullName,
        student.parentName,
        student.email,
        student.phone,
        student.registryCode ?? student.id,
      ].some((val) => val.toLowerCase().includes(query));
      const matchesClass = !classFilter || student.studentClass === classFilter;
      const matchesStatus = !statusFilter || student.feeStatus === statusFilter;
      return matchesSearch && matchesClass && matchesStatus;
    });
  }, [students, archivedStudents, search, classFilter, statusFilter, activeSubMenu]);

    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage]);

  // Reset to page 1 when search changes
  useEffect(() => { setCurrentPage(1); }, [search, classFilter, statusFilter, activeSubMenu]);


  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  function exportToExcel() {
    const headers = ["Registry Code", "Full Name", "Class", "Stream", "Parent Name", "Phone", "Email", "Fee Status", "Fee Amount"];
    const rows = filteredStudents.map((s) => [
      s.registryCode ?? s.id,
      s.fullName,
      s.studentClass,
      s.stream ?? "General",
      s.parentName,
      s.phone,
      s.email,
      s.feeStatus,
      s.feeAmount,
    ]);
    const table = `<table><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((val) => `<td>${val}</td>`).join("")}</tr>`).join("")}</table>`;
    const blob = new Blob([`<html><meta charset="utf-8"><body>${table}</body></html>`], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GS-GACUBA-STUDENT-REGISTRY-${activeSubMenu === "archive" ? "archive-" : ""}${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Student registry exported to Excel.");
  }

  function openAddModal() {
    setFormData({ ...emptyForm, registryCode: newRegistryCode() });
    setFormError("");
    setIsAddMode(true);
    setModalStudent(null);
  }

  function openEdit(student: Student) {
    setFormData({
      fullName: student.fullName,
      registryCode: student.registryCode ?? student.id,
      parentName: student.parentName,
      email: student.email,
      phone: student.phone,
      studentClass: student.studentClass,
      stream: student.stream ?? "General",
      feeStatus: student.feeStatus,
      feeAmount: student.feeAmount,
    });
    setFormError("");
    setIsAddMode(false);
    setModalStudent(student);
  }

  function closeModal() {
    setModalStudent(null);
    setIsAddMode(false);
    setFormError("");
  }

  async function handleSaveModal() {
    if (!formData.fullName.trim()) { setFormError("Full student name is required."); return; }
    if (!formData.parentName.trim()) { setFormError("Parent's name is required."); return; }
    if (!formData.phone.trim()) { setFormError("Parent contact phone is required."); return; }
    const contactErr = validateParentContact(formData.email, formData.phone);
    if (contactErr) { setFormError(contactErr); return; }

    if (isAddMode) {
      let newStudent: Student;
      const code = formData.registryCode.trim() || newRegistryCode();
      if (supabase) {
        const { data, error: insertError } = await supabase.from("school_students").insert(toStudentPayload({ ...formData, registryCode: code })).select("*").maybeSingle();
        if (insertError || !data) { setFormError("We couldn’t add this student. Please check the details and try again."); return; }
        newStudent = toStudentRecord(data as unknown as Record<string, unknown>);
      } else {
        newStudent = { ...formData, id: `STU-${Date.now().toString().slice(-4)}`, registryCode: code, lastUpdated: "Just now" };
      }
            setStudents((curr) => [newStudent, ...curr]);
      if (sendWelcomeNotice) {
        const confirmed = window.confirm(
          `Send welcome SMS/Email to ${newStudent.parentName} (${newStudent.phone})?\n\nClick OK to send, Cancel to skip.`
        );
        if (confirmed) {
          void triggerStudentWelcomeNotification(newStudent);
        }
      }
      notify(`Student ${newStudent.fullName} registered successfully.`);
      closeModal();
    } else if (modalStudent) {
      const updated: Student = { ...modalStudent, ...formData, lastUpdated: "Just now" };
      if (supabase) {
        const { data, error: updateError } = await supabase.from("school_students").update(toStudentPayload(updated)).eq("id", updated.id).select("*").maybeSingle();
        if (updateError || !data) { setFormError("We couldn’t save these changes. Please try again."); return; }
      }
      setStudents((curr) => curr.map((s) => (s.id === updated.id ? updated : s)));
      notify(`Updated ${updated.fullName} in student registry.`);
      closeModal();
    }
  }

  function confirmArchive(student: Student) {
    setStudentToArchive(student);
    setArchiveReason("");
  }

  async function handleArchive() {
    if (!studentToArchive) return;
    const reason = archiveReason.trim() || "Deleted by admin";

    if (supabase) {
      const { error: archiveError } = await supabase.from("school_students_archive").insert(toArchivePayload(studentToArchive, reason));
      if (archiveError) {
        console.error("Archive failed", archiveError);
        notify("Failed to archive student. Try again, refresh your browser or talk to the school IT.");
        return;
      }
      const { error: deleteError } = await supabase.from("school_students").delete().eq("id", studentToArchive.id);
      if (deleteError) {
        console.error("Delete after archive failed", deleteError);
        await supabase.from("school_students_archive").delete().eq("original_id", studentToArchive.id);
        notify("Failed to remove from registry.");
        return;
      }
    }

    const archived: ArchivedStudent = {
      ...studentToArchive,
      originalId: studentToArchive.id,
      archivedAt: new Date().toISOString(),
      archivedReason: reason,
    };
    setArchivedStudents((curr) => [archived, ...curr]);
    setStudents((curr) => curr.filter((s) => s.id !== studentToArchive.id));
    notify(`Moved ${studentToArchive.fullName} to Archive.`);
    if (modalStudent?.id === studentToArchive.id) closeModal();
    setStudentToArchive(null);
  }

  async function handleRestore(student: ArchivedStudent) {
    if (!window.confirm(`Restore ${student.fullName} back to active registry?`)) return;
    if (supabase) {
      const payload = toStudentPayload({ ...student, registryCode: student.registryCode });
      const { data, error } = await supabase.from("school_students").insert(payload).select("*").maybeSingle();
      if (error || !data) { notify("Restore failed."); return; }
      await supabase.from("school_students_archive").delete().eq("original_id", student.originalId);
      const restored = toStudentRecord(data as unknown as Record<string, unknown>);
      setStudents((curr) => [restored, ...curr]);
    } else {
      setStudents((curr) => [...curr, { ...student, id: student.originalId, lastUpdated: "Restored" }]);
    }
    setArchivedStudents((curr) => curr.filter((s) => s.originalId !== student.originalId));
    notify(`Restored ${student.fullName}.`);
  }

  async function handlePermanentDelete(student: ArchivedStudent) {
    if (!window.confirm(`Permanently delete ${student.fullName} from archive? This cannot be undone.`)) return;
    if (supabase) {
      await supabase.from("school_students_archive").delete().eq("original_id", student.originalId);
    }
    setArchivedStudents((curr) => curr.filter((s) => s.originalId !== student.originalId));
    notify(`Permanently deleted ${student.fullName}.`);
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const parsedRows = parseStudentCsv(await file.text());
      if (parsedRows.length < 2) throw new Error("The CSV requires a header row and at least one student record.");
      const headers = parsedRows[0].values.map((h, i) => h || `Column ${i + 1}`);
      setCsvFileName(file.name);
      setCsvRows(parsedRows.slice(1));
      setCsvMapping(autoMapStudentCsvHeaders(headers));
      setCsvError("");
      setReviewConfirmed(false);
      setShowImportModal(true);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Failed to parse CSV file.");
      setShowImportModal(true);
    }
  }

  async function importCsvStudents() {
    if (!reviewConfirmed || importableRows.length === 0) return;
    const importRecords = importableRows.flatMap((row) => {
      if (!row.student) return [];
      const regCode = row.student.registrationCode || newRegistryCode();
      return [{ registry_code: regCode, registration_number: regCode, full_name: row.student.fullName, stream: row.student.stream, parent_name: row.student.parentName, email: row.student.email, phone: row.student.phone, class_name: row.student.studentClass, fee_status: row.student.feeStatus, fee_amount: row.student.feeAmount }];
    });
    let importedStudents: Student[] = [];
    if (supabase) {
      const { data, error: importError } = await supabase.rpc("import_school_students", { p_students: importRecords });
      if (importError || !data) { setCsvError(importError?.message ?? "Database import failed."); return; }
      importedStudents = (data as unknown as Record<string, unknown>[]).map(toStudentRecord);
    } else {
      importedStudents = importableRows.flatMap((row) => {
        if (!row.student) return [];
        return [{ ...row.student, id: `STU-${Math.floor(1000 + Math.random() * 9000)}`, registryCode: row.student.registrationCode || newRegistryCode(), lastUpdated: "Just now" }];
      });
    }
    setStudents((curr) => [...importedStudents, ...curr]);
    setShowImportModal(false);
    notify(`Imported ${importedStudents.length} student records.`);
  }

  return (
    <div className="subnav-content-layout flex flex-col lg:flex-row gap-4">
      <aside className="subnav-sidebar w-full lg:w-64 flex-shrink-0">
        <div className="subnav-sidebar-header hidden lg:block">Student list</div>
        <div className="subnav-links-list flex lg:flex-col overflow-x-auto no-scrollbar gap-1 pb-2 lg:pb-0">
          <button type="button" onClick={() => { setActiveSubMenu("all"); setClassFilter(""); setStatusFilter(""); }} className={`subnav-link-btn ${activeSubMenu === "all" ? "active" : ""}`}>
            <ArrowRight size={14} className="mr-2 text-[#ea580c]" /> Find a student
          </button>
          <button type="button" onClick={openAddModal} className="subnav-link-btn"><ArrowRight size={14} className="mr-2 text-[#ea580c]" /> Add a student</button>
          <button type="button" onClick={() => setActiveSubMenu("class")} className={`subnav-link-btn ${activeSubMenu === "class" ? "active" : ""}`}><ArrowRight size={14} className="mr-2 text-[#ea580c]" /> Find a class</button>
          <button type="button" onClick={() => setActiveSubMenu("fee")} className={`subnav-link-btn ${activeSubMenu === "fee" ? "active" : ""}`}><ArrowRight size={14} className="mr-2 text-[#ea580c]" /> Check fee status</button>
          <button type="button" onClick={() => csvInputRef.current?.click()} className="subnav-link-btn"><ArrowRight size={14} className="mr-2 text-[#ea580c]" /> Import a student list</button>
          <button type="button" onClick={() => setActiveSubMenu("archive")} className={`subnav-link-btn ${activeSubMenu === "archive" ? "active bg-amber-50" : ""}`}><Archive size={14} className="mr-2 text-amber-600" /> Archive ({archivedStudents.length})</button>
        </div>
        {activeSubMenu === "class" && (
          <div className="border-t border-slate-200 p-2 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 px-2 block">Quick Stream Select</span>
            {availableClasses.slice(0, 8).map((c) => (
              <button key={c} type="button" onClick={() => setClassFilter(c)} className={`w-full text-left px-2 py-1 text-xs rounded ${classFilter === c ? 'bg-emerald-100 text-emerald-900 font-bold' : 'text-slate-600 hover:bg-slate-100'}`}>{c}</button>
            ))}
          </div>
        )}
      </aside>

      <main className="data-workspace">
        <div className="flex flex-col gap-3 pb-3 border-b border-slate-200 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{activeSubMenu === "archive" ? "Archived Students" : "Student list"}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{activeSubMenu === "archive" ? "Deleted students saved in archive." : "Update student details, classes, fees, and family contacts."}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <button type="button" onClick={exportToExcel} className="btn-enterprise-excel justify-center py-2.5"><FileSpreadsheet size={14} /> Export</button>
            {activeSubMenu !== "archive" && <button type="button" onClick={openAddModal} className="btn-enterprise-register justify-center py-2.5"><Plus size={14} /> Add student</button>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 bg-slate-50 p-2.5 sm:p-3 rounded-lg border border-slate-200 mb-4">
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, student, parent..." className="form-input w-full pl-9 py-2.5 text-sm" /></div>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="form-select w-full py-2.5 text-sm"><option value="">-- All Class Streams --</option>{availableClasses.map((c) => (<option key={c} value={c}>{c}</option>))}</select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-select w-full py-2.5 text-sm"><option value="">-- All Fee Statuses --</option><option value="Paid">Fully Paid</option><option value="Partial">Partial Payment</option><option value="Unpaid">Unpaid</option></select>
        </div>

      {/* DESKTOP TABLE */}
        <div className="hidden md:block system-table-wrap">
          <table className="system-table">
            <thead>
              <tr>
                <th>Reg Code</th>
                <th>Student Full Name</th>
                <th>Class / Stream</th>
                <th>Parent / Guardian</th>
                <th>Contact Phone</th>
                <th>{activeSubMenu === "archive" ? "Archived" : "Fee Status"}</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.length > 0 ? (
                paginatedStudents.map((student, index) => (
                  <tr 
                    key={`${student.id}-${student.registryCode}-${index}`} 
                    className="cursor-pointer" 
                    onClick={() => activeSubMenu !== "archive" && openEdit(student as Student)}
                  >
                    <td className="table-sticky-left font-mono text-emerald-800 font-semibold text-xs">{student.registryCode ?? student.id}</td>
                    <td><span className="font-semibold text-slate-900 block">{student.fullName}</span><span className="text-[11px] text-slate-500">{student.stream ?? 'General'}</span>{activeSubMenu === "archive" && <span className="text-[10px] text-amber-600 block">{(student as ArchivedStudent).archivedReason}</span>}</td>
                    <td><span className="font-medium">{student.studentClass}</span></td>
                    <td>{student.parentName}</td>
                    <td><span className="font-mono text-[11px] block">{student.phone}</span>{student.email && <span className="text-[10px] text-slate-400 block">{student.email}</span>}</td>
                    <td>
                      {activeSubMenu === "archive" ? <span className="text-[11px] font-mono text-slate-600">{(student as ArchivedStudent).archivedAt}</span> : <>
                        <span className={`status-pill ${student.feeStatus === 'Paid' ? 'status-pill-paid' : student.feeStatus === 'Partial' ? 'status-pill-partial' : 'status-pill-unpaid'}`}>{student.feeStatus}</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">{student.feeAmount}</span>
                      </>}
                    </td>
                    <td className="table-sticky-right">
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {activeSubMenu === "archive" ? <>
                          <button type="button" onClick={() => handleRestore(student as ArchivedStudent)} className="p-2 text-emerald-600 hover:text-emerald-700 rounded" title="Restore"><RotateCcw size={14} /></button>
                          <button type="button" onClick={() => handlePermanentDelete(student as ArchivedStudent)} className="p-2 text-slate-400 hover:text-red-600 rounded" title="Permanent delete"><Trash size={14} /></button>
                        </> : <>
                          <button type="button" onClick={() => openEdit(student as Student)} className="p-2 text-slate-500 hover:text-emerald-700 rounded" title="Edit student"><Pencil size={14} /></button>
                          <button type="button" onClick={() => confirmArchive(student as Student)} className="p-2 text-slate-400 hover:text-amber-600 rounded" title="Archive student"><Archive size={14} /></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="text-center py-8 text-slate-500"><Users size={24} className="mx-auto mb-2 text-slate-400" />{activeSubMenu === "archive" ? "Archive is empty." : "No registered students found matching your search."}{archiveLoading && <span className="text-[10px] block mt-1">Syncing archive...</span>}</td></tr>
              )}
            </tbody>
          </table>
        </div>
               <div className="md:hidden space-y-3">
        {paginatedStudents.map((student, index) => (
            <div key={`${student.id}-${index}`} className="bg-white border border-slate-200 rounded-[14px] shadow-[0_2px_8px_rgba(15,23,42,0.04)] overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold tracking-wide shrink-0">
                    {student.fullName.split(' ').map(n=>n[0]).slice(0,2).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[13.5px] leading-[1.3] text-slate-900 tracking-[-0.01em] truncate">{student.fullName}</p>
                    <p className="text-[11px] leading-4 font-mono font-medium text-slate-500 mt-0.5 tracking-wide">{student.registryCode} • {student.studentClass}</p>
                    {activeSubMenu === "archive" && (student as ArchivedStudent).archivedReason && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1.5 inline-block">{(student as ArchivedStudent).archivedReason}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Details - clean 2 col */}
              <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-slate-100 pt-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400">Parent / Guardian</p>
                  <p className="text-[12.5px] font-medium text-slate-800 leading-tight mt-1 truncate">{student.parentName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400">Contact</p>
                  <p className="text-[12px] font-mono font-medium text-slate-800 leading-tight mt-1">{student.phone}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400">Tuition</p>
                  <p className="text-[12px] font-mono text-slate-700 mt-1">{student.feeAmount}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400">{activeSubMenu === "archive" ? "Archived On" : "Stream"}</p>
                  <p className="text-[12px] text-slate-700 mt-1 truncate">{activeSubMenu === "archive" ? (student as ArchivedStudent).archivedAt.split(',')[0] : (student.stream || 'General')}</p>
                </div>
              </div>

              {/* Actions - clear boundaries */}
              <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200 bg-slate-50/60">
                {activeSubMenu === "archive" ? (
                  <>
                    <button onClick={() => handleRestore(student as ArchivedStudent)} className="h-11 text-[12px] font-semibold tracking-wide text-emerald-700 hover:bg-emerald-50 flex items-center justify-center gap-1.5">
                      <RotateCcw size={14}/> Restore
                    </button>
                    <button onClick={() => handlePermanentDelete(student as ArchivedStudent)} className="h-11 text-[12px] font-semibold tracking-wide text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5">
                      <Trash size={14}/> Delete Forever
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => openEdit(student as Student)} className="h-11 text-[12px] font-semibold tracking-wide text-slate-700 hover:bg-white flex items-center justify-center gap-1.5">
                      <Pencil size={14}/> Edit
                    </button>
                    <button onClick={() => confirmArchive(student as Student)} className="h-11 text-[12px] font-semibold tracking-wide text-amber-700 hover:bg-amber-50 flex items-center justify-center gap-1.5">
                      <Archive size={14}/> Archive
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {paginatedStudents.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-[14px] p-8 text-center">
              <Users size={20} className="mx-auto text-slate-400 mb-2"/><p className="text-[13px] font-medium text-slate-600">{activeSubMenu === "archive" ? "Archive is empty" : "No students found"}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 mt-4 pt-3 border-t border-slate-200">
          <span className="text-[11px]">Showing {(currentPage-1)*itemsPerPage+1}-{Math.min(currentPage*itemsPerPage, filteredStudents.length)} of <strong className="font-mono text-slate-800">{filteredStudents.length}</strong></span>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)} className="px-3 py-2 border rounded bg-white disabled:opacity-40 text-xs font-medium">Prev</button>
              <div className="flex items-center gap-1 mx-1">
                {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                  let pageNum = totalPages <=5 ? i+1 : currentPage <=3 ? i+1 : currentPage >= totalPages-2 ? totalPages-4+i : currentPage-2+i;
                  return (
                    <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-8 h-8 rounded text-xs font-bold ${currentPage===pageNum ? 'bg-[#ea580c] text-white' : 'bg-white border text-slate-600'}`}>{pageNum}</button>
                  );
                })}
              </div>
              <button disabled={currentPage===totalPages} onClick={() => setCurrentPage(p=>p+1)} className="px-3 py-2 border rounded bg-white disabled:opacity-40 text-xs font-medium">Next</button>
            </div>
          )}
        </div>

      </main>

      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileChange} />

      {(isAddMode || modalStudent) && (
        <div className="modal-overlay p-0 sm:p-4 bg-white sm:bg-black/50" onClick={closeModal}>
          <div className="modal-dialog-box w-full h-[100dvh] sm:h-auto rounded-none sm:rounded-xl max-w-lg sm:max-w-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-bar"><h2>{isAddMode ? "Register new student" : "Edit student record"}</h2><button type="button" onClick={closeModal} className="modal-close-btn"><X size={16} /></button></div>
            <div className="modal-section-marker">Student Information</div>
            <div className="modal-form-grid">
              <div className="form-row"><label className="form-label"><span className="req">*</span> Student index code</label><div className="form-input-with-button"><input type="text" value={formData.registryCode} onChange={(e) => setFormData({ ...formData, registryCode: e.target.value })} placeholder="e.g. GSG-10293" className="form-input" /><button type="button" onClick={() => setFormData({ ...formData, registryCode: newRegistryCode() })} className="form-field-action-btn"><Search size={14} /></button></div></div>
              <div className="form-row"><label className="form-label"><span className="req">*</span> Student full name</label><input type="text" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} placeholder="e.g. Mugisha Jean Claude" className="form-input" /></div>
              <div className="form-row"><label className="form-label">combination</label><input type="text" value={formData.stream} onChange={(e) => setFormData({ ...formData, stream: e.target.value })} placeholder="e.g. General, Science (MPC), Arts (HGL)" className="form-input" /></div>
              <div className="form-group-2col"><div className="form-row"><label className="form-label"><span className="req">*</span> Class stream</label><select value={formData.studentClass} onChange={(e) => setFormData({ ...formData, studentClass: e.target.value })} className="form-select"><option value="">--Select class--</option>{availableClasses.map((c) => (<option key={c} value={c}>{c}</option>))}</select></div><div className="form-row"><label className="form-label"><span className="req">*</span> Tuition fee status</label><select value={formData.feeStatus} onChange={(e) => setFormData({ ...formData, feeStatus: e.target.value as FeeStatus })} className="form-select"><option value="Paid">Fully paid</option><option value="Partial">Partial payment</option><option value="Unpaid">Unpaid</option></select></div></div>
              <div className="text-xs font-bold text-[#ea580c] pt-2 border-t border-slate-100">Parent & Fee Information</div>
              <div className="form-group-2col"><div className="form-row"><label className="form-label"><span className="req">*</span> Parent or guardian name</label><input type="text" value={formData.parentName} onChange={(e) => setFormData({ ...formData, parentName: e.target.value })} placeholder="e.g. Jean Bosco Mugisha" className="form-input" /></div><div className="form-row"><label className="form-label"><span className="req">*</span> Parent phone number</label><input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+250 788 000 000" className="form-input" /></div></div>
              <div className="form-group-2col"><div className="form-row"><label className="form-label">Parent email address</label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="parent@example.com" className="form-input" /></div><div className="form-row"><label className="form-label">Term tuition amount</label><input type="text" value={formData.feeAmount} onChange={(e) => setFormData({ ...formData, feeAmount: e.target.value })} placeholder="24,000 RWF" className="form-input" /></div></div>
                            {isAddMode && (
                <div className="pt-3 border-t border-amber-200 bg-amber-50 p-2 rounded flex items-start gap-2">
                  <input type="checkbox" id="autoWelcomeCheckbox" checked={sendWelcomeNotice} onChange={(e) => setSendWelcomeNotice(e.target.checked)} className="accent-[#ea580c] h-4 w-4 mt-0.5" />
                  <label htmlFor="autoWelcomeCheckbox" className="text-xs text-slate-700 cursor-pointer font-medium leading-tight">
                    Send welcome message to parent via SMS and email
                  </label>
                </div>
              )}
              {formError && (<p className="text-xs text-red-600 font-semibold mt-1">{formError}</p>)}
            </div>
            <div className="modal-footer-bar"><button type="button" onClick={closeModal} className="btn-enterprise-cancel">Cancel</button><button type="button" onClick={handleSaveModal} className="btn-enterprise-save"><Save size={14} /> {isAddMode ? "Save student" : "Save changes"}</button></div>
          </div>
        </div>
      )}

      {studentToArchive && (
        <div className="modal-overlay" onClick={() => setStudentToArchive(null)}>
          <div className="modal-dialog-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-bar"><h2>Archive Student</h2><button type="button" onClick={() => setStudentToArchive(null)} className="modal-close-btn"><X size={16} /></button></div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-700">You are about to move <strong>{studentToArchive.fullName}</strong> ({studentToArchive.registryCode}) to the archive folder.</p>
              <p className="text-[11px] text-slate-500">The record will be saved in <code className="bg-slate-100 px-1 rounded">Archive</code> and removed from active list. You can restore it later.</p>
              <div className="form-row"><label className="form-label">Reason for archiving (optional)</label><input type="text" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="e.g. Level completed, Transferred, Duplicate record" className="form-input" /></div>
            </div>
            <div className="modal-footer-bar"><button type="button" onClick={() => setStudentToArchive(null)} className="btn-enterprise-cancel">Cancel</button><button type="button" onClick={handleArchive} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-xs font-bold flex items-center gap-2"><Archive size={14} /> Move to Archive</button></div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-dialog-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-bar"><h2>Import Student List</h2><button type="button" onClick={() => setShowImportModal(false)} className="modal-close-btn"><X size={16} /></button></div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-600">File: <strong className="text-slate-900">{csvFileName}</strong> ({csvRows.length} rows loaded)</p>
              {csvError ? (<div className="bg-red-50 text-red-700 p-3 rounded text-xs">{csvError}</div>) : (<div className="space-y-3"><p className="text-xs text-slate-500">Preview: Ready to import <strong className="text-emerald-700">{importableRows.length}</strong> students. ({duplicateRows.length} duplicates and {invalidRows.length} invalid rows will be skipped).</p><label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} className="accent-[#ea580c]" />I have checked this student list and confirm importing into school records.</label></div>)}
            </div>
            <div className="modal-footer-bar"><button type="button" onClick={() => setShowImportModal(false)} className="btn-enterprise-cancel">Cancel</button><button type="button" disabled={!reviewConfirmed || importableRows.length === 0} onClick={importCsvStudents} className="btn-enterprise-register">Import students</button></div>
          </div>
        </div>
      )}

      {toast && (<div className="system-toast"><CheckCircle2 size={16} className="text-emerald-400" /><span>{toast}</span></div>)}
    </div>
  );
}