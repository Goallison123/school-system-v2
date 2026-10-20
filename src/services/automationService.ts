/**
 * School Automated Messaging & Automation Rules Engine
 * Handles automated triggers for SMS (via Africa's Talking) and Email (Free Tool TBD)
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

export const DEFAULT_RULES: AutomationRule[] = [
  {
    id: 'auto_fees',
    name: 'Automated Tuition Balance Reminders',
    description: 'Scans student registry for unpaid balances and notifies parents via Africa\'s Talking SMS and Email.',
    enabled: true,
    channel: 'BOTH',
    templateSMS: 'Muraho {PARENT_NAME}, G.S GACUBA 2A irabibutsa ko amafaranga y\'ishuri asigaye kuri {STUDENT_NAME} ({CLASS_STREAM}) ari {FEES} RWF. Mwakwishyura kuri MoMo/Bank.',
    templateEmail: 'Dear {PARENT_NAME}, this is an automated reminder from G.S Gacuba 2A. The remaining tuition fee balance for {STUDENT_NAME} ({CLASS_STREAM}) is {FEES} RWF. Please ensure timely clearance.',
  },
  {
    id: 'auto_welcome',
    name: 'New Student Enrollment Welcome',
    description: 'Dispatches instant confirmation SMS & Email when a new student is registered into the school database.',
    enabled: true,
    channel: 'BOTH',
    templateSMS: 'G.S Gacuba 2A: {STUDENT_NAME} yanditswe neza muri {CLASS_STREAM}. Code y\'umunyeshuri: {REG_CODE}. Murakaza neza!',
    templateEmail: 'Dear {PARENT_NAME}, welcome to G.S Gacuba 2A. Your child {STUDENT_NAME} has been officially registered into {CLASS_STREAM} with Registry Code {REG_CODE}.',
  },
  {
    id: 'auto_report',
    name: 'Academic Mid-Term Marks & Report Notification',
    description: 'Broadcasts report card download links to parents when examination marks are locked or published.',
    enabled: true,
    channel: 'BOTH',
    templateSMS: 'G.S Gacuba 2A: Raporo y\'amasomo ya {STUDENT_NAME} iriteguye. Kanda hano uyirebe: {REPORT_LINK}',
    templateEmail: 'Dear {PARENT_NAME}, the mid-term academic report card for {STUDENT_NAME} ({CLASS_STREAM}) is now accessible online. Access token: {REG_CODE}.',
  },
  {
    id: 'auto_inquiry',
    name: 'Visitor Inquiry Auto-Acknowledgment',
    description: 'Sends instant automated reply confirming receipt of parent messages or admissions inquiries.',
    enabled: true,
    channel: 'EMAIL',
    templateSMS: 'G.S Gacuba 2A: Ubutumwa bwanyu bwakiriwe. Ubuyobozi bw\'ikigo burabusubiza mu masaha 24.',
    templateEmail: 'Dear {VISITOR_NAME}, thank you for contacting G.S Gacuba 2A regarding "{TOPIC}". Our administration has received your message and will respond shortly.',
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

export function getDispatchLogs(): AutomatedMessageLog[] {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load logs', err);
  }
  return [
    {
      id: 'log-seed-1',
      timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
      channel: 'BOTH',
      category: 'FEES',
      title: 'Automated Remaining Fees Reminder',
      previewMessage: 'Muraho Parent, G.S GACUBA 2A irabibutsa ko amafaranga y\'ishuri asigaye...',
      recipientCount: 24,
      recipientDetails: '24 parents with remaining balance > 0 RWF',
      smsStatus: 'Sent (101)',
      smsCost: 'RWF 288.00',
      smsMessageId: 'ATXid_gw_78821',
      emailStatus: 'Delivered',
      emailProvider: 'Free Email Tool',
    },
    {
      id: 'log-seed-2',
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
      channel: 'SMS',
      category: 'ANNOUNCEMENT',
      title: 'PTA General Assembly Circular',
      previewMessage: 'Dear Parents, please be informed that G.S Gacuba 2A will hold a general PTA meeting...',
      recipientCount: 120,
      recipientDetails: 'All registered parents',
      smsStatus: 'Sent (101)',
      smsCost: 'RWF 1,440.00',
      smsMessageId: 'ATXid_gw_78119',
    },
  ];
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
 * Execute automated Tuition Balance Reminders
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
  // Filter students with pending balance
  const targetStudents = students.filter((s) => {
    const isUnpaid = s.feeStatus.toLowerCase().includes('unpaid') ||
                     s.feeStatus.toLowerCase().includes('partial') ||
                     s.feeStatus.toLowerCase().includes('pending');
    const hasFeeNum = parseInt(s.feeAmount.replace(/\D/g, '') || '0', 10) > 0;
    return isUnpaid || hasFeeNum;
  });

  if (targetStudents.length === 0) {
    throw new Error('No students with outstanding fee balances found in registry.');
  }

  const rules = getAutomationRules();
  const feeRule = rules.find((r) => r.id === 'auto_fees') || DEFAULT_RULES[0];

  const phones: string[] = [];
  const emails: Array<{ email: string; name: string; studentName: string }> = [];

  for (const s of targetStudents) {
    if (s.phone && s.phone.trim()) {
      phones.push(s.phone);
    }
    if (s.email && s.email.includes('@')) {
      emails.push({
        email: s.email,
        name: s.parentName,
        studentName: s.fullName,
      });
    }
  }

  let smsResult;
  let emailResult;

  // 1. Dispatch Africa's Talking SMS
  if (feeRule.channel === 'SMS' || feeRule.channel === 'BOTH') {
    const sampleMsg = feeRule.templateSMS
      .replace('{PARENT_NAME}', 'Parent')
      .replace('{STUDENT_NAME}', 'Student')
      .replace('{CLASS_STREAM}', 'Class')
      .replace('{FEES}', 'balance');

    smsResult = await sendAfricasTalkingBulkSMS({
      to: phones,
      message: sampleMsg,
    });
  }

  // 2. Dispatch Free Email Tool
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

  // Record Audit Log
  addDispatchLog({
    channel: feeRule.channel,
    category: 'FEES',
    title: 'Automated Tuition Balance Reminders',
    previewMessage: feeRule.templateSMS.slice(0, 100) + '...',
    recipientCount: targetStudents.length,
    recipientDetails: `${targetStudents.length} parents with pending balance (${phones.length} SMS, ${emails.length} Emails)`,
    smsStatus: smsResult ? 'Sent (101)' : 'Skipped',
    smsCost: smsResult?.totalCost || 'RWF 0.00',
    smsMessageId: smsResult?.recipients[0]?.messageId,
    emailStatus: emailResult ? 'Delivered' : 'Skipped',
    emailProvider: 'Free Email Tool',
  });

  // Update rule lastRun
  const updatedRules = rules.map((r) => r.id === 'auto_fees' ? { ...r, lastRun: new Date().toISOString() } : r);
  saveAutomationRules(updatedRules);

  return {
    totalProcessed: targetStudents.length,
    smsSent: phones.length,
    emailSent: emails.length,
    totalCostRwf: smsResult?.totalCost || 'RWF 0.00',
  };
}

/**
 * Execute automated New Student Enrollment Welcome Notification
 */
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
      const res = await sendAfricasTalkingBulkSMS({
        to: [student.phone],
        message: smsText,
      });
      smsStatus = 'Sent (101)';
      cost = res.totalCost;
    } catch (err) {
      console.warn('Welcome SMS failed', err);
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
      console.warn('Welcome Email failed', err);
      emailStatus = 'Failed';
    }
  }

  addDispatchLog({
    channel: rule.channel,
    category: 'WELCOME',
    title: `Student Enrollment Welcome: ${student.fullName}`,
    previewMessage: smsText,
    recipientCount: 1,
    recipientDetails: `${student.parentName} (${student.phone || student.email})`,
    smsStatus,
    smsCost: cost,
    emailStatus,
    emailProvider: 'Free Email Tool',
  });
}

/**
 * Execute automated Inquiry Auto-Reply
 */
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
        title: `Inquiry Auto-Reply: ${inquiry.visitor_name}`,
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
