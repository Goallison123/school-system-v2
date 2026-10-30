/**
 * School Messaging & Manual Campaign Rules Engine
 * FIXED: No unsupervised automations - all triggers require explicit user action
 * All automation rules are DISABLED by default
 */

import { sendAfricasTalkingBulkSMS } from './africasTalkingService';
import { sendBulkEmail } from './emailService';
import type { Inquiry } from '@/types';

export interface AutomatedMessageLog {
  id: string;
  timestamp: string;
  channel: 'SMS' | 'EMAIL' | 'BOTH';
  category: 'FEES' | 'WELCOME' | 'REPORT' | 'ANNOUNCEMENT' | 'INQUIRY';
  title: string;
  previewMessage: string;
  recipientCount: number;
  recipientDetails: string;
  smsStatus?: string;
  smsCost?: string;
  smsMessageId?: string;
  emailStatus?: string;
  emailProvider?: string;
}

export interface AutomationRule {
  id: 'auto_fees' | 'auto_welcome' | 'auto_report' | 'auto_inquiry';
  name: string;
  description: string;
  enabled: boolean;
  channel: 'SMS' | 'EMAIL' | 'BOTH';
  templateSMS: string;
  templateEmail: string;
  lastRun?: string;
}

const RULES_STORAGE_KEY = 'gs_gacuba_automation_rules';
const LOGS_STORAGE_KEY = 'gs_gacuba_automation_logs';

// FIX 1: All rules DISABLED by default - requires manual enable in UI
export const DEFAULT_RULES: AutomationRule[] = [
  {
    id: 'auto_fees',
    name: 'Tuition Balance Reminders (Manual Only)',
    description: 'Manual trigger only - scans for unpaid balances when you click Run in Campaigns.',
    enabled: false,
    channel: 'BOTH',
    templateSMS: 'Muraho {PARENT_NAME}, G.S GACUBA 2A irabibutsa ko amafaranga y\'ishuri asigaye kuri {STUDENT_NAME} ({CLASS_STREAM}) ari {FEES} RWF. Mwakwishyura kuri MoMo/Bank.',
    templateEmail: 'Dear {PARENT_NAME}, this is a reminder from G.S Gacuba 2A. The remaining tuition fee balance for {STUDENT_NAME} ({CLASS_STREAM}) is {FEES} RWF.',
  },
  {
    id: 'auto_welcome',
    name: 'New Student Enrollment Welcome (Manual Opt-In)',
    description: 'Only sends if you explicitly check "Send welcome message" when registering a student.',
    enabled: false,
    channel: 'BOTH',
    templateSMS: 'G.S Gacuba 2A: {STUDENT_NAME} yanditswe neza muri {CLASS_STREAM}. Code y\'umunyeshuri: {REG_CODE}. Murakaza neza!',
    templateEmail: 'Dear {PARENT_NAME}, welcome to G.S Gacuba 2A. Your child {STUDENT_NAME} has been officially registered into {CLASS_STREAM} with Registry Code {REG_CODE}.',
  },
  {
    id: 'auto_report',
    name: 'Academic Mid-Term Marks Notification (Manual Only)',
    description: 'Only sends when you explicitly click Publish Reports in Mid-Term Engine.',
    enabled: false,
    channel: 'BOTH',
    templateSMS: 'G.S Gacuba 2A: Raporo y\'amasomo ya {STUDENT_NAME} iriteguye. Kanda hano uyirebe: {REPORT_LINK}',
    templateEmail: 'Dear {PARENT_NAME}, the mid-term report for {STUDENT_NAME} ({CLASS_STREAM}) is now accessible. Access token: {REG_CODE}.',
  },
  {
    id: 'auto_inquiry',
    name: 'Visitor Inquiry Auto-Acknowledgment',
    description: 'Manual opt-in only. No automatic reply unless enabled.',
    enabled: false,
    channel: 'EMAIL',
    templateSMS: 'G.S Gacuba 2A: Ubutumwa bwanyu bwakiriwe. Ubuyobozi bw\'ikigo burabusubiza mu masaha 24.',
    templateEmail: 'Dear {VISITOR_NAME}, thank you for contacting G.S Gacuba 2A regarding "{TOPIC}". Our administration will respond shortly.',
  },
];

export function getAutomationRules(): AutomationRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return DEFAULT_RULES.map((def) => {
        const found = (parsed as AutomationRule[]).find((p) => p.id === def.id);
        return found ? { ...def, ...found } : def;
      });
    }
  } catch (err) {
    console.warn('Failed to load rules', err);
  }
  return DEFAULT_RULES;
}

export function saveAutomationRules(rules: AutomationRule[]): void {
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.error('Failed to save rules', err);
  }
}

// FIX 2: Removed fake seed logs - returns empty array
export function getDispatchLogs(): AutomatedMessageLog[] {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load logs', err);
  }
  return [];
}

export function addDispatchLog(log: Omit<AutomatedMessageLog, 'id' | 'timestamp'>): AutomatedMessageLog {
  const newLog: AutomatedMessageLog = {
    ...log,
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  try {
    const existing = getDispatchLogs();
    const updated = [newLog, ...existing].slice(0, 100);
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to append log', err);
  }
  return newLog;
}

/**
 * Manual Only: Tuition Balance Reminders - Must be explicitly clicked in UI
 */
export async function runAutomatedFeeReminders(
  students: Array<{
    fullName: string;
    parentName: string;
    phone: string;
    email: string;
    studentClass: string;
    stream?: string;
    feeStatus: string;
    feeAmount: string;
  }>
): Promise<{
  totalProcessed: number;
  smsSent: number;
  emailSent: number;
  totalCostRwf: string;
}> {
  // FIX 3: Block if rule is disabled
  const rules = getAutomationRules();
  const feeRule = rules.find((r) => r.id === 'auto_fees');
  if (!feeRule || !feeRule.enabled) {
    throw new Error('Fee reminder automation is DISABLED. Enable it in Campaigns > Automation Rules first.');
  }

  const targetStudents = students.filter((s) => {
    const isUnpaid = s.feeStatus.toLowerCase().includes('unpaid') ||
                     s.feeStatus.toLowerCase().includes('partial') ||
                     s.feeStatus.toLowerCase().includes('pending');
    const hasFeeNum = parseInt(s.feeAmount.replace(/\D/g, '') || '0', 10) > 0;
    return isUnpaid || hasFeeNum;
  });

  if (targetStudents.length === 0) {
    throw new Error('No students with outstanding fee balances found.');
  }

  const phones: string[] = [];
  const emails: Array<{ email: string; name: string; studentName: string }> = [];

  for (const s of targetStudents) {
    if (s.phone && s.phone.trim()) phones.push(s.phone);
    if (s.email && s.email.includes('@')) {
      emails.push({ email: s.email, name: s.parentName, studentName: s.fullName });
    }
  }

  let smsResult;
  let emailResult;

  if (feeRule.channel === 'SMS' || feeRule.channel === 'BOTH') {
    const sampleMsg = feeRule.templateSMS
      .replace('{PARENT_NAME}', 'Parent')
      .replace('{STUDENT_NAME}', 'Student')
      .replace('{CLASS_STREAM}', 'Class')
      .replace('{FEES}', 'balance');
    smsResult = await sendAfricasTalkingBulkSMS({ to: phones, message: sampleMsg });
  }

  if (feeRule.channel === 'EMAIL' || feeRule.channel === 'BOTH') {
    if (emails.length > 0) {
      emailResult = await sendBulkEmail({
        recipients: emails,
        subject: 'G.S Gacuba 2A - Tuition Fee Balance Notice',
        message: feeRule.templateEmail
          .replace('{PARENT_NAME}', 'Parent')
          .replace('{STUDENT_NAME}', 'Student')
          .replace('{CLASS_STREAM}', 'Class')
          .replace('{FEES}', 'specified balance'),
      });
    }
  }

  addDispatchLog({
    channel: feeRule.channel,
    category: 'FEES',
    title: 'Manual Tuition Balance Reminders',
    previewMessage: feeRule.templateSMS.slice(0, 100) + '...',
    recipientCount: targetStudents.length,
    recipientDetails: `${targetStudents.length} parents with pending balance`,
    smsStatus: smsResult ? 'Sent (101)' : 'Skipped',
    smsCost: smsResult?.totalCost || 'RWF 0.00',
    smsMessageId: smsResult?.recipients[0]?.messageId,
    emailStatus: emailResult ? 'Delivered' : 'Skipped',
    emailProvider: 'Free Email Tool',
  });

  const updatedRules = rules.map((r) => r.id === 'auto_fees' ? { ...r, lastRun: new Date().toISOString() } : r);
  saveAutomationRules(updatedRules);

  return {
    totalProcessed: targetStudents.length,
    smsSent: phones.length,
    emailSent: emails.length,
    totalCostRwf: smsResult?.totalCost || 'RWF 0.00',
  };
}

export async function triggerStudentWelcomeNotification(student: {
  fullName: string;
  parentName: string;
  phone: string;
  email: string;
  studentClass: string;
  stream?: string;
  registryCode: string;
}): Promise<void> {
  const rules = getAutomationRules();
  const rule = rules.find((r) => r.id === 'auto_welcome');
  // FIX 4: Strict guard - disabled = no send
  if (!rule || !rule.enabled) return;

  const classStream = `${student.studentClass} ${student.stream || ''}`.trim();
  const smsText = rule.templateSMS
    .replace('{PARENT_NAME}', student.parentName)
    .replace('{STUDENT_NAME}', student.fullName)
    .replace('{CLASS_STREAM}', classStream)
    .replace('{REG_CODE}', student.registryCode);

  const emailText = rule.templateEmail
    .replace('{PARENT_NAME}', student.parentName)
    .replace('{STUDENT_NAME}', student.fullName)
    .replace('{CLASS_STREAM}', classStream)
    .replace('{REG_CODE}', student.registryCode);

  let smsStatus = 'Skipped';
  let emailStatus = 'Skipped';
  let cost = 'RWF 0.00';

  if ((rule.channel === 'SMS' || rule.channel === 'BOTH') && student.phone) {
    try {
      const res = await sendAfricasTalkingBulkSMS({ to: [student.phone], message: smsText });
      smsStatus = 'Sent (101)';
      cost = res.totalCost;
    } catch (err) {
      smsStatus = 'Failed';
    }
  }

  if ((rule.channel === 'EMAIL' || rule.channel === 'BOTH') && student.email) {
    try {
      await sendBulkEmail({
        recipients: [{ email: student.email, name: student.parentName, studentName: student.fullName }],
        subject: `Welcome to G.S Gacuba 2A - ${student.fullName}`,
        message: emailText,
      });
      emailStatus = 'Delivered';
    } catch (err) {
      emailStatus = 'Failed';
    }
  }

  addDispatchLog({
    channel: rule.channel,
    category: 'WELCOME',
    title: `Student Welcome: ${student.fullName}`,
    previewMessage: smsText,
    recipientCount: 1,
    recipientDetails: `${student.parentName} (${student.phone || student.email})`,
    smsStatus,
    smsCost: cost,
    emailStatus,
    emailProvider: 'Free Email Tool',
  });
}

export async function triggerInquiryAutoReply(inquiry: Inquiry): Promise<void> {
  const rules = getAutomationRules();
  const rule = rules.find((r) => r.id === 'auto_inquiry');
  if (!rule || !rule.enabled) return;

  const emailText = rule.templateEmail
    .replace('{VISITOR_NAME}', inquiry.visitor_name)
    .replace('{TOPIC}', inquiry.topic || 'Inquiry');

  if (inquiry.email && inquiry.email.includes('@')) {
    try {
      await sendBulkEmail({
        recipients: [{ email: inquiry.email, name: inquiry.visitor_name }],
        subject: `G.S Gacuba 2A Inquiry Acknowledgment: ${inquiry.topic || 'Message Received'}`,
        message: emailText,
      });
      addDispatchLog({
        channel: 'EMAIL',
        category: 'INQUIRY',
        title: `Inquiry Reply: ${inquiry.visitor_name}`,
        previewMessage: emailText,
        recipientCount: 1,
        recipientDetails: `${inquiry.visitor_name} <${inquiry.email}>`,
        emailStatus: 'Delivered',
        emailProvider: 'Free Email Tool',
      });
    } catch (err) {
      console.warn('Auto reply failed', err);
    }
  }
}