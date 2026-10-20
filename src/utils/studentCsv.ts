export type StudentImportRecord = {
  fullName: string;
  registrationCode: string;
  parentName: string;
  email: string;
  phone: string;
  studentClass: string;
  stream: string;
  feeStatus: "Paid" | "Partial" | "Unpaid";
  feeAmount: string;
};

export type StudentCsvField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "registrationCode"
  | "parentName"
  | "email"
  | "phone"
  | "studentClass"
  | "stream"
  | "feeStatus"
  | "feeAmount";

export type StudentCsvMapping = Record<StudentCsvField, string>;

export type ParsedCsvRow = {
  lineNumber: number;
  values: string[];
};

export type StudentCsvPreview = {
  lineNumber: number;
  values: string[];
  student: StudentImportRecord | null;
  errors: string[];
  duplicateLabel?: string;
};

const csvFields: StudentCsvField[] = [
  "firstName",
  "lastName",
  "fullName",
  "registrationCode",
  "parentName",
  "email",
  "phone",
  "studentClass",
  "stream",
  "feeStatus",
  "feeAmount",
];

const headerAliases: Record<StudentCsvField, string[]> = {
  firstName: ["firstname", "studentfirstname", "givenname", "forename"],
  lastName: ["lastname", "studentlastname", "familyname", "surname"],
  fullName: ["fullname", "studentname", "learnername", "pupilname", "name"],
  registrationCode: ["registrationnumber", "registrationno", "regnumber", "regno", "registrationcode", "studentid"],
  parentName: ["parentname", "guardianname", "guardian", "parentguardian", "contactname"],
  email: ["email", "parentemail", "guardianemail", "contactemail", "emailaddress"],
  phone: ["phone", "telephone", "mobile", "parentphone", "guardianphone", "contactphone"],
  studentClass: ["class", "classname", "studentclass", "grade", "level"],
  stream: ["stream", "studentstream", "section"],
  feeStatus: ["feestatus", "feesstatus", "paymentstatus", "payment", "feespaidstatus"],
  feeAmount: ["feeamount", "feesamount", "amountpaid", "paidamount", "feespaid", "amount"],
};

const fieldLabels: Record<StudentCsvField, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name (combined)",
  registrationCode: "Registration number",
  parentName: "Parent / guardian",
  email: "Parent email",
  phone: "Parent phone",
  studentClass: "Class",
  stream: "Stream",
  feeStatus: "Fee status",
  feeAmount: "Fees paid amount",
};

export const studentCsvFields = csvFields.map((key) => ({ key, label: fieldLabels[key] }));

function countDelimiters(line: string) {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",";
}

export function parseStudentCsv(text: string): ParsedCsvRow[] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = countDelimiters(firstLine);
  const rows: ParsedCsvRow[] = [];
  let values: string[] = [];
  let value = "";
  let quoted = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (quoted || value.length === 0) {
        quoted = !quoted;
      } else {
        throw new Error(`Unexpected quote on line ${lineNumber}.`);
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      values.push(value.trim());
      value = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      if (!quoted) {
        values.push(value.trim());
        if (values.some(Boolean)) rows.push({ lineNumber: rowStartLine, values });
        values = [];
        value = "";
        lineNumber += 1;
        rowStartLine = lineNumber;
        continue;
      }
      value += "\n";
      lineNumber += 1;
      continue;
    }

    value += char;
  }

  if (quoted) throw new Error(`The CSV has an unclosed quote near line ${rowStartLine}.`);
  values.push(value.trim());
  if (values.some(Boolean)) rows.push({ lineNumber: rowStartLine, values });
  return rows;
}

function normalizeHeader(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function autoMapStudentCsvHeaders(headers: string[]): StudentCsvMapping {
  const mapping = Object.fromEntries(csvFields.map((field) => [field, ""])) as StudentCsvMapping;
  const usedColumns = new Set<string>();

  for (const field of csvFields) {
    const aliases = headerAliases[field];
    const index = headers.findIndex((header, columnIndex) =>
      !usedColumns.has(String(columnIndex)) && aliases.includes(normalizeHeader(header)),
    );
    if (index >= 0) {
      mapping[field] = String(index);
      usedColumns.add(String(index));
    }
  }

  return mapping;
}

function selectedValue(row: string[], mapping: StudentCsvMapping, field: StudentCsvField) {
  if (mapping[field] === "") return "";
  const index = Number(mapping[field]);
  return Number.isInteger(index) && index >= 0 ? (row[index] ?? "").trim() : "";
}

function normalizeFeeStatus(value: string): StudentImportRecord["feeStatus"] | null {
  const status = value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!status) return "Unpaid";
  if (["paid", "full", "fully paid", "complete", "completed"].includes(status)) return "Paid";
  if (["partial", "partially paid", "part paid", "in progress"].includes(status)) return "Partial";
  if (["unpaid", "not paid", "outstanding", "pending", "none"].includes(status)) return "Unpaid";
  return null;
}

function normalizeName(firstName: string, lastName: string, fullName: string) {
  let first = firstName.trim();
  let last = lastName.trim();

  if ((!first || !last) && fullName) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0];
      last = parts.slice(1).join(" ");
    }
  }

  if (!first || !last) return null;
  return `${first.toLocaleUpperCase()} ${last.toLocaleLowerCase()}`;
}

function identityKey(fullName: string, studentClass: string) {
  return `${fullName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()}|${studentClass.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()}`;
}

export function previewStudentCsvRows(
  rows: ParsedCsvRow[],
  mapping: StudentCsvMapping,
  existingStudents: Array<Pick<StudentImportRecord, "fullName" | "studentClass">>,
): StudentCsvPreview[] {
  const seen = new Map<string, string>();
  for (const student of existingStudents) {
    seen.set(identityKey(student.fullName, student.studentClass), "already in registry");
  }

  return rows.map(({ lineNumber, values }) => {
    const firstName = selectedValue(values, mapping, "firstName");
    const lastName = selectedValue(values, mapping, "lastName");
    const fullName = selectedValue(values, mapping, "fullName");
    const normalizedName = normalizeName(firstName, lastName, fullName);
    const studentClass = selectedValue(values, mapping, "studentClass").replace(/\s+/g, " ");
    const stream = selectedValue(values, mapping, "stream");
    const email = selectedValue(values, mapping, "email");
    const parentName = selectedValue(values, mapping, "parentName");
    const phone = selectedValue(values, mapping, "phone");
    const rawFeeStatus = selectedValue(values, mapping, "feeStatus");
    const feeStatus = normalizeFeeStatus(rawFeeStatus);
    const errors: string[] = [];

    if (!normalizedName) errors.push("Provide both first and last name, or a full name containing both.");
    if (!studentClass) errors.push("Class is required.");
    if (!stream) errors.push("Student stream is required.");
    if (!parentName) errors.push("Parent or guardian name is required.");
    if (!email) errors.push("Parent email is required.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email address is invalid.");
    if (!phone || phone.replace(/[\s()+.-]/g, "").length < 8) errors.push("A valid parent phone number is required.");
    if (rawFeeStatus && !feeStatus) errors.push(`Unknown fee status: “${rawFeeStatus}”.`);

    if (errors.length || !normalizedName) {
      return { lineNumber, values, student: null, errors };
    }

    const student: StudentImportRecord = {
      fullName: normalizedName,
      registrationCode: selectedValue(values, mapping, "registrationCode"),
      parentName,
      email,
      phone,
      studentClass,
      stream,
      feeStatus: feeStatus ?? "Unpaid",
      feeAmount: selectedValue(values, mapping, "feeAmount") || "0 RWF",
    };
    const key = identityKey(student.fullName, student.studentClass);
    const duplicateLabel = seen.get(key);
    if (!duplicateLabel) seen.set(key, `CSV row ${lineNumber}`);

    return { lineNumber, values, student, errors, duplicateLabel };
  });
}
