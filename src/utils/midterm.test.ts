import { describe, expect, it } from 'vitest';
import { averageMark, compileReportRows, gradeForMark, isValidSmsPhone, shouldRegenerateReport } from './midterm';
import { autoMapStudentCsvHeaders, parseStudentCsv, previewStudentCsvRows } from './studentCsv';

describe('mid-term report rules', () => {
  it('maps mark boundaries to grades', () => {
    expect([49, 50, 60, 70, 80].map(gradeForMark)).toEqual(['E', 'D', 'C', 'B', 'A']);
  });

  it('excludes zero-mark and disabled subjects from report rows', () => {
    const rows = compileReportRows([
      { subject_id: 'math', mark: 70, entered_at: '2026-10-01T00:00:00Z', subject: { subject_name: 'Mathematics', is_enabled: true } },
      { subject_id: 'eng', mark: 0, entered_at: '2026-10-01T00:00:00Z', subject: { subject_name: 'English', is_enabled: true } },
      { subject_id: 'hist', mark: 85, entered_at: '2026-10-01T00:00:00Z', subject: { subject_name: 'History', is_enabled: false } },
    ]);
    expect(rows).toEqual([{ subject_id: 'math', subject: 'Mathematics', mark: 70, weight: 7, grade: 'B' }]);
  });

  it('regenerates only when marks are newer than the previous report', () => {
    const marks = [
      { subject_id: 'math', mark: 70, entered_at: '2026-10-10T12:00:00Z' },
      { subject_id: 'eng', mark: 60, entered_at: '2026-10-12T12:00:00Z' },
    ];
    expect(shouldRegenerateReport(marks, '2026-10-11T12:00:00Z')).toBe(true);
    expect(shouldRegenerateReport(marks, '2026-10-13T12:00:00Z')).toBe(false);
    expect(shouldRegenerateReport(marks)).toBe(true);
    expect(shouldRegenerateReport([], undefined, true)).toBe(false);
    expect(shouldRegenerateReport(marks, '2026-10-13T12:00:00Z', true)).toBe(true);
  });

  it('computes report averages without a NaN empty case', () => {
    expect(averageMark([{ mark: 70 }, { mark: 80 }])).toBe(75);
    expect(averageMark([])).toBe(0);
  });

  it('rejects missing or short parent phone numbers', () => {
    expect(isValidSmsPhone(undefined)).toBe(false);
    expect(isValidSmsPhone('123-456')).toBe(false);
    expect(isValidSmsPhone('+250 788 123 456')).toBe(true);
  });
});

describe('student CSV validation', () => {
  it('imports registration number, stream, and required parent contacts', () => {
    const parsed = parseStudentCsv('Full Name,Registration Number,Class,Stream,Parent Name,Email,Phone\nAda Example,REG-25,S2 A,Science,Parent Example,parent@example.com,+250 788 123 456');
    const headers = parsed[0].values;
    const mapping = autoMapStudentCsvHeaders(headers);
    const result = previewStudentCsvRows(parsed.slice(1), mapping, [])[0];
    expect(result.errors).toEqual([]);
    expect(result.student).toMatchObject({ registrationCode: 'REG-25', studentClass: 'S2 A', stream: 'Science', parentName: 'Parent Example' });
  });

  it('rejects records with missing or invalid parent phone/email', () => {
    const parsed = parseStudentCsv('Full Name,Class,Parent Name,Email,Phone\nAda Example,S2 A,Parent Example,invalid,123');
    const mapping = autoMapStudentCsvHeaders(parsed[0].values);
    const result = previewStudentCsvRows(parsed.slice(1), mapping, [])[0];
    expect(result.student).toBeNull();
    expect(result.errors).toContain('Email address is invalid.');
    expect(result.errors).toContain('A valid parent phone number is required.');
  });
});
