import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Check,
  Clock3,
  Mail,
  Send,
  Smartphone,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Loader2,
} from 'lucide-react';
import type { Campaign, Contact } from '@/types';
import {
  sendAfricasTalkingBulkSMS,
  calculateSMSCost,
  formatRwandaPhone,
} from '@/services/africasTalkingService';
import { sendBulkEmail } from '@/services/emailService';
import { addDispatchLog } from '@/services/automationService';

type Category = 'FEES' | 'GENERAL' | 'REPORT';
type RecipientMode = 'ALL' | 'SELECT';
type DispatchAction = 'SEND_NOW' | 'SAVE_DRAFT' | 'SCHEDULE';

const REQUIRED_SCHOOL_FEES_RWF = 24000;

function getRemainingBalanceRwf(contact: Contact): number {
  const paid = Number(contact.fee_amount ?? 0);

  if (!Number.isFinite(paid) || paid < 0) {
    return REQUIRED_SCHOOL_FEES_RWF;
  }

  return Math.max(0, REQUIRED_SCHOOL_FEES_RWF - paid);
}

function personalizeMessage(
  template: string,
  contact: Contact
): string {
  const values: Record<string, string> = {
    FULLNAME: contact.student_name?.trim() || 'Student name not recorded',
    FEES: getRemainingBalanceRwf(contact).toLocaleString('en-RW'),
    PARENTNAME: contact.parent_name?.trim() || 'Parent / Guardian',
    CLASS: contact.class_name?.trim() || 'Class not recorded',
  };

  return template.replace(
    /\{(FULLNAME|FEES|PARENTNAME|CLASS)\}/g,
    (_match, token: string) => values[token]
  );
}


const templates: Record<
  Category,
  { title: string; message: string; tags: string[] }
> = {
  FEES: {
    title: 'School Fees Remaining Balance Reminder',
    message:
      'Dear {PARENTNAME}, the remaining school fees balance for {FULLNAME} in {CLASS} is {FEES} RWF. Please settle the balance promptly.',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{FEES}', '{CLASS}'],
  },
  GENERAL: {
    title: 'Important School Announcement',
    message:
      'Dear {PARENTNAME}, please note this announcement concerning {FULLNAME} of {CLASS}: ',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{CLASS}'],
  },
  REPORT: {
    title: 'Academic Performance Report',
    message:
      'Dear {PARENTNAME}, the academic report for {FULLNAME} of {CLASS} is not available for online download yet. Please contact the school administration.',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{CLASS}'],
  },
};


export default function NotificationModal({
  onClose,
  onSave,
  contacts,
  allowReports = true,
}: {
  onClose: () => void;
  onSave: (campaign: Omit<Campaign, 'id' | 'created_at'>, dispatch: { fingerprint: string; recipientIds: string[] }) => void;
  contacts: Contact[];
  allowReports?: boolean;
}) {
  const [category, setCategory] = useState<Category>('FEES');
  const [title, setTitle] = useState(templates.FEES.title);
  const [message, setMessage] = useState(templates.FEES.message);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('ALL');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [actionType, setActionType] = useState<DispatchAction>('SEND_NOW');
  const [scheduledDate, setScheduledDate] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    smsMessage?: string;
    smsCost?: string;
    emailMessage?: string;
  } | null>(null);

  // Channels selection: SMS (Africa's Talking), Email (Free Tool)
  const [useSMS, setUseSMS] = useState(true);
  const [useEmail, setUseEmail] = useState(false);

  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Filter contacts with valid phone or email
  const validContacts = useMemo(() => {
    return contacts.filter((c) => {
      const hasPhone = c.phone && c.phone.replace(/\D/g, '').length >= 8;
      const hasEmail = c.email && c.email.includes('@');
      if (useSMS && useEmail) return hasPhone || hasEmail;
      if (useSMS) return hasPhone;
      if (useEmail) return hasEmail;
      return true;
    });
  }, [contacts, useSMS, useEmail]);

  const targetedContacts = useMemo(() => {
    if (recipientMode === 'ALL') return validContacts;
    return validContacts.filter((c) => selectedContactIds.includes(c.id));
  }, [validContacts, recipientMode, selectedContactIds]);

  const recipientCount = targetedContacts.length;
  const smsCostEstimate = calculateSMSCost(recipientCount, message.length);

  const minDateTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const isScheduleValid = actionType !== 'SCHEDULE' || Boolean(scheduledDate && new Date(scheduledDate).getTime() > Date.now());
  const canSubmit = Boolean(
    title.trim() &&
    message.trim() &&
    recipientCount > 0 &&
    (useSMS || useEmail) &&
    isScheduleValid &&
    !isSending
  );

  useEffect(() => {
    const template = templates[category];
    setTitle(template.title);
    setMessage(template.message);
    setError('');
  }, [category]);

  function updateCategory(event: ChangeEvent<HTMLSelectElement>) {
    setCategory(event.target.value as Category);
  }

  function toggleContact(id: string) {
    setSelectedContactIds((selected) =>
      selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
    );
  }

  function insertTag(tag: string) {
    const textarea = messageRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = `${message.slice(0, start)}${tag}${message.slice(end)}`;
    setMessage(updated);
    setError('');
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  async function handleExecuteDispatch() {
    if (!title.trim() || !message.trim()) {
      setError('Add a title and message.');
      return;
    }
    if (!useSMS && !useEmail) {
      setError('Choose text message or email.');
      return;
    }
    if (recipientCount === 0) {
      setError(recipientMode === 'SELECT' ? 'Choose at least one parent contact.' : 'No parents have contact details for this message.');
      return;
    }
    if (actionType === 'SCHEDULE' && (!scheduledDate || new Date(scheduledDate).getTime() <= Date.now())) {
      setError('Choose a date and time in the future.');
      return;
    }

    const recipientIds = targetedContacts.map((c) => c.id).sort();
    const dedupeKey = `${category}|${message.trim()}|${recipientIds.join(',')}`;

    const channels: string[] = [];
    if (useSMS) channels.push('SMS (Africa\'s Talking)');
    if (useEmail) channels.push('Email (Free Tool)');

    // If saving as Draft or Scheduling, do not dispatch immediately
    if (actionType === 'SAVE_DRAFT' || actionType === 'SCHEDULE') {
      onSave(
        {
          title: title.trim(),
          message: message.trim(),
          channels,
          recipient_count: recipientCount,
          status: actionType === 'SCHEDULE' ? 'Scheduled' : 'Draft',
          category,
          ...(actionType === 'SCHEDULE' ? { scheduled_for: new Date(scheduledDate).toISOString() } : {}),
        },
        { fingerprint: dedupeKey, recipientIds }
      );
      return;
    }

    // Direct automated execution
    setIsSending(true);
    setError('');

    try {
      let smsResult;
      let emailResult;

      // 1. Africa's Talking Bulk SMS Dispatch
      if (useSMS) {
        const phoneList = targetedContacts
          .map((c) => c.phone)
          .filter(Boolean);

        if (phoneList.length > 0) {
          smsResult = await sendAfricasTalkingBulkSMS({
            to: phoneList,
            message: message.trim(),
          });
        }
      }

      // 2. Free Email Tool Dispatch
      if (useEmail) {
        const emailList = targetedContacts
          .filter((c) => c.email && c.email.includes('@'))
          .map((c) => ({
            email: c.email,
            name: c.parent_name,
            studentName: c.student_name,
          }));

        if (emailList.length > 0) {
          emailResult = await sendBulkEmail({
            recipients: emailList,
            subject: title.trim(),
            message: message.trim(),
          });
        }
      }

      // Record dispatch in Audit Ledger
      addDispatchLog({
        channel: useSMS && useEmail ? 'BOTH' : useSMS ? 'SMS' : 'EMAIL',
        category,
        title: title.trim(),
        previewMessage: message.trim().slice(0, 100),
        recipientCount,
        recipientDetails: `${recipientCount} parents (${channels.join(', ')})`,
        smsStatus: smsResult ? 'Sent (101)' : undefined,
        smsCost: smsResult?.totalCost,
        smsMessageId: smsResult?.recipients[0]?.messageId,
        emailStatus: emailResult ? 'Delivered' : undefined,
        emailProvider: 'Free Email Tool',
      });

      setSendResult({
        smsMessage: smsResult?.message,
        smsCost: smsResult?.totalCost,
        emailMessage: emailResult?.message,
      });

      // Save campaign record with 'Sent' status
      onSave(
        {
          title: title.trim(),
          message: message.trim(),
          channels,
          recipient_count: recipientCount,
          status: 'Sent',
          category,
        },
        { fingerprint: dedupeKey, recipientIds }
      );
    } catch (err: unknown) {
      console.error('Dispatch failed', err);
      setError('We couldn’t send the message. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  const categoryOptions = ([
    { value: 'FEES', label: '1. School Fees Balance Reminder ({FEES} calculation)' },
    { value: 'GENERAL', label: '2. General Announcement (PTA assembly, academic calendar)' },
    { value: 'REPORT', label: '3. Student Academic Report ({FULLNAME} & {REPORTLINK})' },
  ] as { value: Category; label: string }[]).filter((opt) => allowReports || opt.value !== 'REPORT');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="system-modal w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden bg-white rounded-lg shadow-xl border border-slate-300">
        {/* Modal Header */}
        <div className="system-modal-header flex items-center justify-between px-5 py-3.5 bg-[#3b2314] text-white border-b-2 border-[#ea580c]">
          <div>
            <h2 id="notification-modal-title" className="text-sm font-bold uppercase tracking-wider">
              Send Parent Notice
            </h2>
            <p className="text-[11px] text-[#fed7aa] mt-0.5">
              SMS and or Email
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Success Banner if already sent */}
          {sendResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Message sent successfully!</strong>
                {sendResult.smsMessage && (
                  <p className="text-[11px] mt-0.5">
                    SMS: {sendResult.smsMessage} {sendResult.smsCost && `(${sendResult.smsCost})`}
                  </p>
                )}
                {sendResult.emailMessage && (
                  <p className="text-[11px] mt-0.5">
                    Email: {sendResult.emailMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Section: Category & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Notice Category <span className="text-[#ea580c]">*</span>
              </label>
              <select
                value={category}
                onChange={updateCategory}
                className="form-input w-full bg-white font-medium"
              >
                {categoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Notice Title <span className="text-[#ea580c]">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Term II Fees Clearance Alert"
                className="form-input w-full"
              />
            </div>
          </div>

          {/* Delivery Channels Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
              Delivery Channels <span className="text-[#ea580c]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded border transition cursor-pointer ${
                  useSMS
                    ? 'border-[#ea580c] bg-orange-50/70 text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={useSMS}
                  onChange={(e) => setUseSMS(e.target.checked)}
                  className="mt-0.5 accent-[#ea580c]"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Smartphone size={14} className={useSMS ? 'text-[#ea580c]' : 'text-slate-400'} />
                    <strong className="text-xs font-semibold">SMS</strong>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Direct SMS to parent numbers
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded border transition cursor-pointer ${
                  useEmail
                    ? 'border-emerald-600 bg-emerald-50/70 text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={useEmail}
                  onChange={(e) => setUseEmail(e.target.checked)}
                  className="mt-0.5 accent-emerald-700"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Mail size={14} className={useEmail ? 'text-emerald-700' : 'text-slate-400'} />
                    <strong className="text-xs font-semibold">Email</strong>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Send this message to parents by email.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Message Textarea & Dynamic Tags */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="broadcast-message" className="text-[11px] font-bold text-slate-700 uppercase">
                Broadcast Message Content <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400">Insert Tag:</span>
                {templates[category].tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertTag(tag)}
                    className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="broadcast-message"
              ref={messageRef}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter message for parents..."
              className="form-input w-full font-sans text-xs resize-y"
            />
            {/* Live SMS Cost & Segment Counter */}
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="font-mono">Length: {message.length} chars</span>
                {useSMS && (
                  <span className="text-emerald-800 font-medium flex items-center gap-1">
                    <DollarSign size={12} />
                    {smsCostEstimate.segments} SMS segment(s) · Est. Cost: ~RWF {smsCostEstimate.estimatedCostRwf}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                 Bulk Spec
              </span>
            </div>
          </div>

          {/* Target Parent Recipients */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-700 uppercase">
                Target Recipients ({recipientCount} Selected)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientMode('ALL')}
                  className={`px-2 py-1 rounded text-[11px] font-medium border ${
                    recipientMode === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900 font-bold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Users size={12} className="inline mr-1" />
                  All Parents ({validContacts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode('SELECT')}
                  className={`px-2 py-1 rounded text-[11px] font-medium border ${
                    recipientMode === 'SELECT'
                      ? 'bg-slate-900 text-white border-slate-900 font-bold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Check size={12} className="inline mr-1" />
                  Select Manually
                </button>
              </div>
            </div>

            {/* Recipient list preview */}
            <div className="max-h-36 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 space-y-1">
              {validContacts.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic p-2 text-center">
                  No eligible contacts found for the selected channels.
                </p>
              ) : (
                validContacts.map((c) => {
                  const isChecked = recipientMode === 'ALL' || selectedContactIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center justify-between p-1.5 rounded bg-white border border-slate-200 text-xs ${
                        recipientMode === 'SELECT' ? 'cursor-pointer hover:bg-slate-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {recipientMode === 'SELECT' && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleContact(c.id)}
                            className="accent-emerald-700"
                          />
                        )}
                        <span className="truncate">
                          <strong className="text-slate-800">{c.parent_name}</strong>
                          <span className="text-slate-400 text-[10px] ml-1.5">
                            ({c.student_name} · {c.class_name})
                          </span>
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono shrink-0 ml-2">
                        {useSMS && c.phone && <span>{formatRwandaPhone(c.phone)}</span>}
                        {useEmail && c.email && <span className="ml-2 text-slate-400">&lt;{c.email}&gt;</span>}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Action Choice: Send Now / Save Draft / Schedule */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
              Execution Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'SEND_NOW', label: 'Send Automated Now', desc: 'Execute live bulk delivery', icon: Send },
                { type: 'SAVE_DRAFT', label: 'Save as Draft', desc: 'Hold in broadcast records', icon: Check },
                { type: 'SCHEDULE', label: 'Schedule Dispatch', desc: 'Set future date & time', icon: Clock3 },
              ].map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setActionType(item.type as DispatchAction)}
                  className={`p-2.5 rounded border text-left transition ${
                    actionType === item.type
                      ? 'border-institutional-green bg-emerald-50 text-emerald-950 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <item.icon size={14} className="mb-1 text-slate-700" />
                  <div className="text-xs font-semibold">{item.label}</div>
                  <div className="text-[10px] text-slate-500 font-normal">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {actionType === 'SCHEDULE' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Select Dispatch Date & Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                min={minDateTime}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="form-input w-full"
              />
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="system-modal-footer flex items-center justify-between px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          <div className="text-[11px] text-slate-500">
            {actionType === 'SEND_NOW' ? (
              <span>Sending to <strong className="text-slate-800">{recipientCount}</strong> parent(s) via school SMS & email</span>
            ) : actionType === 'SCHEDULE' ? (
              <span>Will schedule for {scheduledDate || 'selected date'}</span>
            ) : (
              <span>Will save as draft</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="btn-enterprise-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleExecuteDispatch()}
              className="btn-enterprise-save flex items-center gap-1.5"
            >
              {isSending ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Sending notice...
                </>
              ) : actionType === 'SEND_NOW' ? (
                <>
                  <Send size={13} />
                  Send notice
                </>
              ) : actionType === 'SCHEDULE' ? (
                <>
                  <Clock3 size={13} />
                  Schedule notice
                </>
              ) : (
                <>
                  <Check size={13} />
                  Save draft
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
