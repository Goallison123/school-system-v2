import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight,
  FileSpreadsheet,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Users,
  CheckCircle2,
  Save,
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

const classes = [
  "S1 A", "S1 B", "S1 C",
  "S2 A", "S2 B", "S2 C",
  "S3 A", "S3 B", "S3 C",
  "S4 ARH", "S4 STREAM 2",
  "S5 ARH", "S5 STREAM 2",
  "S6 MPC", "S6 HGL"
];

const initialStudents: Student[] = [
  {
    id: "STU-101",
    registryCode: "STU-00101",
    fullName: "Ineza Divine",
    parentName: "Jean Claude Uwase",
    email: "divine.ineza@gmail.com",
    phone: "+250 788 123 456",
    studentClass: "S1 A",
    stream: "General",
    feeStatus: "Paid",
    feeAmount: "145,000 RWF",
    lastUpdated: "Oct 12, 2026",
  },
  {
    id: "STU-102",
    registryCode: "STU-00102",
    fullName: "Nshimiyimana Patrick",
    parentName: "Marie Claire Mukamana",
    email: "patrick.nshi@yahoo.com",
    phone: "+250 790 987 654",
    studentClass: "S2 B",
    stream: "General",
    feeStatus: "Partial",
    feeAmount: "75,000 RWF",
    lastUpdated: "Oct 10, 2026",
  },
  {
    id: "STU-103",
    registryCode: "STU-00103",
    fullName: "Uwera Giramata Keza",
    parentName: "Emmanuel Giramata",
    email: "e.giramata@outlook.com",
    phone: "+250 783 456 789",
    studentClass: "S1 A",
    stream: "General",
    feeStatus: "Paid",
    feeAmount: "145,000 RWF",
    lastUpdated: "Oct 14, 2026",
  },
  {
    id: "STU-104",
    registryCode: "STU-00104",
    fullName: "Habimana Eric",
    parentName: "Claudine Nyiramahoro",
    email: "habimana.eric@gmail.com",
    phone: "+250 781 223 344",
    studentClass: "S3 C",
    stream: "General",
    feeStatus: "Unpaid",
    feeAmount: "0 RWF",
    lastUpdated: "Sep 28, 2026",
  },
  {
    id: "STU-105",
    registryCode: "STU-00105",
    fullName: "Mutoni Sandra",
    parentName: "Fiston Mutoni",
    email: "fiston.m@gmail.com",
    phone: "+250 782 555 666",
    studentClass: "S4 ARH",
    stream: "Arts & Humanities",
    feeStatus: "Paid",
    feeAmount: "130,000 RWF",
    lastUpdated: "Oct 05, 2026",
  },
  {
    id: "STU-106",
    registryCode: "STU-00106",
    fullName: "Kwizera Yves",
    parentName: "Aline Uwimbabazi",
    email: "kwizera.yves@gmail.com",
    phone: "+250 791 444 333",
    studentClass: "S6 MPC",
    stream: "Math, Physics, CompSci",
    feeStatus: "Partial",
    feeAmount: "90,000 RWF",
    lastUpdated: "Oct 11, 2026",
  },
];

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

function newRegistryCode() {
  return `STU-${Math.floor(10000 + Math.random() * 90000)}`;
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
  const [studentsLoading, setStudentsLoading] = useState(Boolean(supabase));
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeSubMenu, setActiveSubMenu] = useState<"all" | "class" | "fee">("all");
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
  const [sendWelcomeNotice, setSendWelcomeNotice] = useState(true);
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
    void loadStudents();
    return () => { cancelled = true; };
  }, []);

  const availableClasses = useMemo(() => {
    return [...new Set([...classes, ...students.map((s) => s.studentClass).filter(Boolean)])].sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
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
  }, [students, search, classFilter, statusFilter]);

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
    a.download = `gs-gacuba-student-registry-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Student registry exported to Excel.");
  }

  function openAddModal() {
    setFormData({
      ...emptyForm,
      registryCode: newRegistryCode(),
    });
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
    if (!formData.fullName.trim()) {
      setFormError("Full student name is required.");
      return;
    }
    if (!formData.parentName.trim()) {
      setFormError("Parent's name is required.");
      return;
    }
    if (!formData.phone.trim()) {
      setFormError("Parent contact phone is required.");
      return;
    }
    const contactErr = validateParentContact(formData.email, formData.phone);
    if (contactErr) {
      setFormError(contactErr);
      return;
    }

    if (isAddMode) {
      let newStudent: Student;
      const code = formData.registryCode.trim() || newRegistryCode();
      if (supabase) {
        const { data, error: insertError } = await supabase
          .from("school_students")
          .insert(toStudentPayload({ ...formData, registryCode: code }))
          .select("*")
          .maybeSingle();
        if (insertError || !data) {
          console.error("Failed to add student", insertError);
          setFormError("We couldn’t add this student. Please check the details and try again.");
          return;
        }
        newStudent = toStudentRecord(data as unknown as Record<string, unknown>);
      } else {
        newStudent = {
          ...formData,
          id: `STU-${Date.now().toString().slice(-4)}`,
          registryCode: code,
          lastUpdated: "Just now",
        };
      }
      setStudents((curr) => [newStudent, ...curr]);
      if (sendWelcomeNotice) {
        void triggerStudentWelcomeNotification(newStudent);
      }
      notify(`Student ${newStudent.fullName} registered successfully.`);
      closeModal();
    } else if (modalStudent) {
      const updated: Student = {
        ...modalStudent,
        ...formData,
        lastUpdated: "Just now",
      };
      if (supabase) {
        const { data, error: updateError } = await supabase
          .from("school_students")
          .update(toStudentPayload(updated))
          .eq("id", updated.id)
          .select("*")
          .maybeSingle();
        if (updateError || !data) {
          console.error("Failed to update student", updateError);
          setFormError("We couldn’t save these changes. Please try again.");
          return;
        }
      }
      setStudents((curr) => curr.map((s) => (s.id === updated.id ? updated : s)));
      notify(`Updated ${updated.fullName} in student registry.`);
      closeModal();
    }
  }

  async function handleDelete(student: Student) {
    if (!window.confirm(`Are you sure you want to delete ${student.fullName} from the registry?`)) return;
    if (supabase) {
      await supabase.from("school_students").delete().eq("id", student.id);
    }
    setStudents((curr) => curr.filter((s) => s.id !== student.id));
    notify(`Removed ${student.fullName} from registry.`);
    if (modalStudent?.id === student.id) closeModal();
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const parsedRows = parseStudentCsv(await file.text());
      if (parsedRows.length < 2) {
        throw new Error("The CSV requires a header row and at least one student record.");
      }
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
      return [{
        registry_code: regCode,
        registration_number: regCode,
        full_name: row.student.fullName,
        stream: row.student.stream,
        parent_name: row.student.parentName,
        email: row.student.email,
        phone: row.student.phone,
        class_name: row.student.studentClass,
        fee_status: row.student.feeStatus,
        fee_amount: row.student.feeAmount,
      }];
    });

    let importedStudents: Student[] = [];
    if (supabase) {
      const { data, error: importError } = await supabase.rpc("import_school_students", { p_students: importRecords });
      if (importError || !data) {
        setCsvError(importError?.message ?? "Database import failed.");
        return;
      }
      importedStudents = (data as unknown as Record<string, unknown>[]).map(toStudentRecord);
    } else {
      importedStudents = importableRows.flatMap((row) => {
        if (!row.student) return [];
        return [{
          ...row.student,
          id: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
          registryCode: row.student.registrationCode || newRegistryCode(),
          lastUpdated: "Just now",
        }];
      });
    }

    setStudents((curr) => [...importedStudents, ...curr]);
    setShowImportModal(false);
    notify(`Imported ${importedStudents.length} student records.`);
  }

  return (
    <div className="subnav-content-layout">
      {/* Left Sub-Navigation Menu (Screenshot 2 Style) */}
      <aside className="subnav-sidebar">
        <div className="subnav-sidebar-header">
          Student list
        </div>
        <div className="subnav-links-list">
          <button
            type="button"
            onClick={() => { setActiveSubMenu("all"); setClassFilter(""); setStatusFilter(""); }}
            className={`subnav-link-btn ${activeSubMenu === "all" ? "active" : ""}`}
          >
            <ArrowRight size={14} className="mr-2 text-[#ea580c]" aria-hidden="true" /> Find a student
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="subnav-link-btn"
          >
            <ArrowRight size={14} className="mr-2 text-[#ea580c]" aria-hidden="true" /> Add a student
          </button>
          <button
            type="button"
            onClick={() => setActiveSubMenu("class")}
            className={`subnav-link-btn ${activeSubMenu === "class" ? "active" : ""}`}
          >
            <ArrowRight size={14} className="mr-2 text-[#ea580c]" aria-hidden="true" /> Find a class
          </button>
          <button
            type="button"
            onClick={() => setActiveSubMenu("fee")}
            className={`subnav-link-btn ${activeSubMenu === "fee" ? "active" : ""}`}
          >
            <ArrowRight size={14} className="mr-2 text-[#ea580c]" aria-hidden="true" /> Check fee status
          </button>
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="subnav-link-btn"
          >
            <ArrowRight size={14} className="mr-2 text-[#ea580c]" aria-hidden="true" /> Import a student list
          </button>
        </div>

        {/* Quick Stream Filter Sidebar Panel */}
        {activeSubMenu === "class" && (
          <div className="border-t border-slate-200 p-2 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 px-2 block">Quick Stream Select</span>
            {availableClasses.slice(0, 8).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClassFilter(c)}
                className={`w-full text-left px-2 py-1 text-xs rounded ${classFilter === c ? 'bg-emerald-100 text-emerald-900 font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* Main Administrative Workspace */}
      <main className="data-workspace">
        {/* Workspace Title & Toolbar Bar (Screenshot 2) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Student list
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Update student details, classes, fees, and family contacts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportToExcel}
              className="btn-enterprise-excel"
            >
              <FileSpreadsheet size={14} /> Export list
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="btn-enterprise-register"
            >
              <Plus size={14} /> Add student
            </button>
          </div>
        </div>

        {/* Filter Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded border border-slate-200 mb-4">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, student, parent..."
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
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-select w-full"
            >
              <option value="">-- All Fee Statuses --</option>
              <option value="Paid">Fully Paid</option>
              <option value="Partial">Partial Payment</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </div>
        </div>

        {/* High-Density Tabular Data Grid */}
        <div className="system-table-wrap">
          <table className="system-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>Reg Code</th>
                <th>Student Full Name</th>
                <th>Class / Stream</th>
                <th>Parent / Guardian</th>
                <th>Contact Phone</th>
                <th style={{ width: '130px' }}>Fee Status</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="cursor-pointer" onClick={() => openEdit(student)}>
                    <td className="font-mono text-emerald-800 font-semibold">
                      {student.registryCode ?? student.id}
                    </td>
                    <td>
                      <span className="font-semibold text-slate-900 block">{student.fullName}</span>
                      <span className="text-[11px] text-slate-500">{student.stream ?? 'General'}</span>
                    </td>
                    <td>
                      <span className="font-medium">{student.studentClass}</span>
                    </td>
                    <td>{student.parentName}</td>
                    <td>
                      <span className="font-mono text-[11px] block">{student.phone}</span>
                      {student.email && <span className="text-[10px] text-slate-400 block">{student.email}</span>}
                    </td>
                    <td>
                      <span className={`status-pill ${
                        student.feeStatus === 'Paid' ? 'status-pill-paid' :
                        student.feeStatus === 'Partial' ? 'status-pill-partial' : 'status-pill-unpaid'
                      }`}>
                        {student.feeStatus}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">{student.feeAmount}</span>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openEdit(student)}
                          className="p-1 text-slate-500 hover:text-emerald-700 rounded"
                          title="Edit student"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(student)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                          title="Delete student"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    <Users size={24} className="mx-auto mb-2 text-slate-400" />
                    No registered students found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
          <span>Total Records: <strong className="font-mono font-bold text-slate-800">{filteredStudents.length}</strong> {studentsLoading && <span className="text-[10px] text-slate-400 font-mono">(Syncing...)</span>}</span>
          <span className="text-[11px]">Click any record to inspect or modify pupil details</span>
        </div>
      </main>

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvFileChange}
      />

      {/* School Student Registration Modal */}
      {(isAddMode || modalStudent) && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-dialog-box" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header Bar */}
            <div className="modal-header-bar">
              <h2>{isAddMode ? "Register new student" : "Edit student record"}</h2>
              <button type="button" onClick={closeModal} className="modal-close-btn">
                <X size={16} />
              </button>
            </div>

            {/* Section 1: Student Information */}
            <div className="modal-section-marker">
              Student Information
            </div>

            <div className="modal-form-grid">
              {/* Index / Registration Code */}
              <div className="form-row">
                <label className="form-label">
                  <span className="req">*</span> Student index code
                </label>
                <div className="form-input-with-button">
                  <input
                    type="text"
                    value={formData.registryCode}
                    onChange={(e) => setFormData({ ...formData, registryCode: e.target.value })}
                    placeholder="e.g. STU-10293"
                    className="form-input"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, registryCode: newRegistryCode() })}
                    className="form-field-action-btn"
                    title="Generate code"
                  >
                    <Search size={14} />
                  </button>
                </div>
              </div>

              {/* Student Full Name */}
              <div className="form-row">
                <label className="form-label">
                  <span className="req">*</span> Student full name
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g. Mugisha Jean Claude"
                  className="form-input"
                />
              </div>

              {/* Academic Stream / Track */}
              <div className="form-row">
                <label className="form-label">
                  Academic track / combination
                </label>
                <input
                  type="text"
                  value={formData.stream}
                  onChange={(e) => setFormData({ ...formData, stream: e.target.value })}
                  placeholder="e.g. General, Science (MPC), Arts (HGL)"
                  className="form-input"
                />
              </div>

              {/* 2-Column: Class Stream & Fee Status */}
              <div className="form-group-2col">
                <div className="form-row">
                  <label className="form-label">
                    <span className="req">*</span> Class stream
                  </label>
                  <select
                    value={formData.studentClass}
                    onChange={(e) => setFormData({ ...formData, studentClass: e.target.value })}
                    className="form-select"
                  >
                    <option value="">--Select class--</option>
                    {availableClasses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <label className="form-label">
                    <span className="req">*</span> Tuition fee status
                  </label>
                  <select
                    value={formData.feeStatus}
                    onChange={(e) => setFormData({ ...formData, feeStatus: e.target.value as FeeStatus })}
                    className="form-select"
                  >
                    <option value="Paid">Fully paid</option>
                    <option value="Partial">Partial payment</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>
              </div>

              {/* Section 2: Parent / Guardian Information */}
              <div className="text-xs font-bold text-[#ea580c] pt-2 border-t border-slate-100">
                Parent & Fee Information
              </div>

              {/* 2-Column: Parent Name & Phone */}
              <div className="form-group-2col">
                <div className="form-row">
                  <label className="form-label">
                    <span className="req">*</span> Parent or guardian name
                  </label>
                  <input
                    type="text"
                    value={formData.parentName}
                    onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                    placeholder="e.g. Jean Bosco Mugisha"
                    className="form-input"
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">
                    <span className="req">*</span> Parent phone number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+250 788 000 000"
                    className="form-input"
                  />
                </div>
              </div>

              {/* 2-Column: Parent Email & Fee Amount */}
              <div className="form-group-2col">
                <div className="form-row">
                  <label className="form-label">
                    Parent email address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="parent@example.com"
                    className="form-input"
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">
                    Term tuition amount
                  </label>
                  <input
                    type="text"
                    value={formData.feeAmount}
                    onChange={(e) => setFormData({ ...formData, feeAmount: e.target.value })}
                    placeholder="145,000 RWF"
                    className="form-input"
                  />
                </div>
              </div>

              {isAddMode && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoWelcomeCheckbox"
                    checked={sendWelcomeNotice}
                    onChange={(e) => setSendWelcomeNotice(e.target.checked)}
                    className="accent-[#ea580c] h-4 w-4"
                  />
                  <label htmlFor="autoWelcomeCheckbox" className="text-xs text-slate-700 cursor-pointer font-medium">
                    Send welcome message to parent via SMS and email
                  </label>
                </div>
              )}

              {formError && (
                <p className="text-xs text-red-600 font-semibold mt-1">
                  {formError}
                </p>
              )}
            </div>

            {/* Modal Footer Bar */}
            <div className="modal-footer-bar">
              <button
                type="button"
                onClick={closeModal}
                className="btn-enterprise-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="btn-enterprise-save"
              >
                <Save size={14} /> {isAddMode ? "Save student" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-dialog-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-bar">
              <h2>Import Student List</h2>
              <button type="button" onClick={() => setShowImportModal(false)} className="modal-close-btn">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-600">
                File: <strong className="text-slate-900">{csvFileName}</strong> ({csvRows.length} rows loaded)
              </p>
              {csvError ? (
                <div className="bg-red-50 text-red-700 p-3 rounded text-xs">
                  {csvError}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Preview: Ready to import <strong className="text-emerald-700">{importableRows.length}</strong> students.
                    ({duplicateRows.length} duplicates and {invalidRows.length} invalid rows will be skipped).
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={reviewConfirmed}
                      onChange={(e) => setReviewConfirmed(e.target.checked)}
                      className="accent-[#ea580c]"
                    />
                    I have checked this student list and confirm importing into school records.
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer-bar">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="btn-enterprise-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reviewConfirmed || importableRows.length === 0}
                onClick={importCsvStudents}
                className="btn-enterprise-register"
              >
                Import students
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="system-toast">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}