export type AssessmentMark = {
  subject_id: string;
  mark: number;
  entered_at: string;
  subject?: { subject_name: string; is_enabled: boolean };
};

export type CompiledReportRow = {
  subject_id: string;
  subject: string;
  mark: number;
  weight: number;
  grade: string;
};

export function gradeForMark(mark: number): string {
  if (mark >= 80) return 'A';
  if (mark >= 70) return 'B';
  if (mark >= 60) return 'C';
  if (mark >= 50) return 'D';
  return 'E';
}

export function isValidSmsPhone(phone?: string): boolean {
  return Boolean(phone?.trim() && phone.replace(/[\s()+.-]/g, '').length >= 8);
}

export function shouldRegenerateReport(marks: AssessmentMark[], generatedAt?: string, force = false): boolean {
  return marks.length > 0 && (force || !generatedAt || marks.some((mark) => mark.entered_at > generatedAt));
}

export function compileReportRows(marks: AssessmentMark[]): CompiledReportRow[] {
  return marks
    .filter((mark) => Number(mark.mark) > 0 && mark.subject?.is_enabled !== false)
    .map((mark) => ({
      subject_id: mark.subject_id,
      subject: mark.subject?.subject_name ?? 'Subject',
      mark: Number(mark.mark),
      weight: Math.round(Number(mark.mark) / 10),
      grade: gradeForMark(Number(mark.mark)),
    }));
}

export function averageMark(marks: Array<{ mark: number }>): number {
  return marks.length ? marks.reduce((sum, mark) => sum + Number(mark.mark), 0) / marks.length : 0;
}
