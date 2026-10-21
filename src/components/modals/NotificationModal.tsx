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

type Category = 'FEES' | 'ANNOUNCEMENT' | 'REPORT';
type RecipientMode = 'ALL' | 'SELECT';
type DispatchAction = 'SEND_NOW' | 'SAVE_DRAFT' | 'SCHEDULE';

const REQUIRED_SCHOOL_FEES_RWF = 24000;

// FIX: handles "145,000 RWF", "1200", etc.
function getRemainingBalanceRwf(contact: Contact): number {
  const raw = String(contact.fee_amount ?? contact.fees ?? '0').replace(/[^\d]/g, '');
  const paid = Number(raw);
  if (!Number.isFinite(paid) || paid < 0) return REQUIRED_SCHOOL_FEES_RWF;
  return Math.max(0, REQUIRED_SCHOOL_FEES_RWF - paid);
}

function personalizeMessage(template: string, contact: Contact): string {
  const values: Record<string, string> = {
    FULLNAME: contact.student_name?.trim() || 'Student name not recorded',
    FEES: getRemainingBalanceRwf(contact).toLocaleString('en-RW'),
    PARENTNAME: contact.parent_name?.trim() || 'Parent / Guardian',
    CLASS: contact.class_name?.trim() || 'Class not recorded',
  };
  return template.replace(
    /\{(FULLNAME|FEES|PARENTNAME|CLASS)\}/g,
    (_match, token: string) => values[token] ?? ''
  );
}

const templates: Record<Category, { title: string; message: string; tags: string[] }> = {
  FEES: {
    title: 'School Fees Remaining Balance Reminder',
    message:
      'Dear {PARENTNAME}, the remaining school fees balance for {FULLNAME} in {CLASS} is {FEES} RWF. Please contact the school administration if you have already paid.',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{FEES}', '{CLASS}'],
  },
  ANNOUNCEMENT: {
    title: 'Important School Announcement',
    message: 'Dear {PARENTNAME}, please note this announcement concerning {FULLNAME} of {CLASS}: ',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{CLASS}'],
  },
  REPORT: {
    title: 'Academic Performance Report',
    message:
      'Dear {PARENTNAME}, the academic report for {FULLNAME} of {CLASS} is not available for online download yet. Please contact the school administration.',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{CLASS}'],
  },
};

type DeliveryResult = {
  id: string;
  name: string;
  phone?: string;
  channel: 'SMS' | 'EMAIL';
  status: 'Delivered' | 'Failed';
  detail: string;
};

export default function NotificationModal({
  onClose,
  onSave,
  contacts,
  allowReports = true,
}: {
  onClose: () => void;
  onSave: (
    campaign: Omit<Campaign, 'id' | 'created_at'>,
    dispatch: { fingerprint: string; recipientIds: string[] }
  ) => void;
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
    results?: DeliveryResult[];
  } | null>(null);

  const [useSMS, setUseSMS] = useState(true);
  const [useEmail, setUseEmail] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const validContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const hasPhone = Boolean(contact.phone) && contact.phone.replace(/\D/g, '').length >= 8;
      const hasEmail = Boolean(contact.email) && contact.email.includes('@');
      if (useSMS && useEmail) return hasPhone || hasEmail;
      if (useSMS) return hasPhone;
      if (useEmail) return hasEmail;
      return false;
    });
  }, [contacts, useSMS, useEmail]);

  const targetedContacts = useMemo(() => {
    if (recipientMode === 'ALL') return validContacts;
    return validContacts.filter((contact) => selectedContactIds.includes(contact.id));
  }, [validContacts, recipientMode, selectedContactIds]);

  const recipientCount = targetedContacts.length;
  const smsCostEstimate = calculateSMSCost(recipientCount, message.length);

  const minDateTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const isScheduleValid = actionType !== 'SCHEDULE' || Boolean(scheduledDate && new Date(scheduledDate).getTime() > Date.now());
  const canSubmit = Boolean(title.trim() && message.trim() && recipientCount > 0 && (useSMS || useEmail) && isScheduleValid && !isSending);

  useEffect(() => {
    const template = templates[category];
    setTitle(template.title);
    setMessage(template.message);
    setError('');
    setSendResult(null);
  }, [category]);

  function updateCategory(event: ChangeEvent<HTMLSelectElement>) {
    setCategory(event.target.value as Category);
  }
  function toggleContact(id: string) {
    setSelectedContactIds((selected) => (selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]));
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
      setError('Choose SMS, email, or both.');
      return;
    }
    if (recipientCount === 0) {
      setError(recipientMode === 'SELECT' ? 'Choose at least one parent contact.' : 'No parents have valid contact details for the selected channels.');
      return;
    }
    if (actionType === 'SCHEDULE' && (!scheduledDate || new Date(scheduledDate).getTime() <= Date.now())) {
      setError('Choose a date and time in the future.');
      return;
    }

    const recipientIds = targetedContacts.map((contact) => contact.id).sort();
    const dedupeKey = `${category}|${message.trim()}|${recipientIds.join(',')}`;
    const channels: string[] = [];
    if (useSMS) channels.push("SMS (Africa's Talking)");
    if (useEmail) channels.push('Email');

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

    setIsSending(true);
    setError('');
    setSendResult(null);

    const deliveryResults: DeliveryResult[] = [];

    try {
      let smsSentCount = 0;
      let smsCostDetails: string[] = [];
      let emailSentCount = 0;
      let emailWasSimulated = false;

      if (useSMS) {
        const smsContacts = targetedContacts.filter((c) => c.phone && c.phone.replace(/\D/g, '').length >= 8);
        for (const contact of smsContacts) {
          try {
            const personalized = personalizeMessage(message.trim(), contact);
            const result = await sendAfricasTalkingBulkSMS({ to: [contact.phone], message: personalized });
            const recipient = result.recipients?.[0];
            const isOk = recipient?.status === 'Success' || recipient?.status === 'Queued' || recipient?.status === 'Sent';
            if (isOk) {
              smsSentCount++;
              deliveryResults.push({ id: contact.id, name: contact.parent_name || contact.student_name, phone: contact.phone, channel: 'SMS', status: 'Delivered', detail: recipient.status });
              if (result.totalCost) smsCostDetails.push(result.totalCost);
            } else {
              deliveryResults.push({ id: contact.id, name: contact.parent_name || contact.student_name, phone: contact.phone, channel: 'SMS', status: 'Failed', detail: recipient?.status || 'Rejected' });
            }
          } catch (err: unknown) {
            console.error('[SMS] Failed for', contact.id, contact.phone, err);
            deliveryResults.push({ id: contact.id, name: contact.parent_name || contact.student_name, phone: contact.phone, channel: 'SMS', status: 'Failed', detail: 'Provider error' });
          }
        }
      }

      if (useEmail) {
        const emailContacts = targetedContacts.filter((c) => c.email && c.email.includes('@'));
        for (const contact of emailContacts) {
          try {
            const personalized = personalizeMessage(message.trim(), contact);
            const result = await sendBulkEmail({
              recipients: [{ email: contact.email, name: contact.parent_name, studentName: contact.student_name }],
              subject: title.trim(),
              message: personalized,
            });
            if (result.totalSent > 0) {
              emailSentCount++;
              emailWasSimulated = emailWasSimulated || Boolean(result.isSimulated);
              deliveryResults.push({ id: contact.id, name: contact.parent_name, channel: 'EMAIL', status: 'Delivered', detail: result.isSimulated ? 'Simulated' : 'Accepted' });
            } else {
              deliveryResults.push({ id: contact.id, name: contact.parent_name, channel: 'EMAIL', status: 'Failed', detail: 'Not accepted' });
            }
          } catch (err) {
            console.error('[EMAIL] Failed for', contact.id, err);
            deliveryResults.push({ id: contact.id, name: contact.parent_name, channel: 'EMAIL', status: 'Failed', detail: 'Error' });
          }
        }
      }

      const deliveredCount = deliveryResults.filter((r) => r.status === 'Delivered').length;
      const failedCount = deliveryResults.filter((r) => r.status === 'Failed').length;

      if (deliveredCount === 0) {
        console.error('All deliveries failed:', deliveryResults);
        setError(`No messages were delivered. ${failedCount} contact(s) failed. Please check phone numbers and provider credentials.`);
        setSendResult({ smsMessage: `0 delivered, ${failedCount} failed`, results: deliveryResults });
        return;
      }

      addDispatchLog({
        channel: useSMS && useEmail ? 'BOTH' : useSMS ? 'SMS' : 'EMAIL',
        category,
        title: title.trim(),
        previewMessage: message.trim().slice(0, 100),
        recipientCount: deliveredCount,
        recipientDetails: `Delivered: ${deliveredCount}, Failed: ${failedCount}`,
        smsStatus: useSMS ? `Delivered ${smsSentCount}, Failed ${deliveryResults.filter(r=>r.channel==='SMS'&&r.status==='Failed').length}` : undefined,
        smsCost: smsCostDetails.join(' + ') || undefined,
        emailStatus: useEmail ? (emailWasSimulated ? `Simulated ${emailSentCount}` : `Delivered ${emailSentCount}`) : undefined,
        emailProvider: useEmail ? 'Configured Email Service' : undefined,
      });

      setSendResult({
        smsMessage: useSMS ? `${smsSentCount} SMS delivered, ${deliveryResults.filter(r=>r.channel==='SMS'&&r.status==='Failed').length} failed` : undefined,
        smsCost: smsCostDetails.join(' + ') || undefined,
        emailMessage: useEmail ? (emailWasSimulated ? `${emailSentCount} email simulated` : `${emailSentCount} email delivered`) : undefined,
        results: deliveryResults,
      });

      const deliveredIds = [...new Set(deliveryResults.filter((r) => r.status === 'Delivered').map((r) => r.id))];

      onSave(
        {
          title: title.trim(),
          message: message.trim(),
          channels,
          recipient_count: deliveredCount,
          status: failedCount > 0 ? 'Partially Sent' : 'Sent',
          category,
        },
        { fingerprint: dedupeKey, recipientIds: deliveredIds }
      );
    } catch (err: unknown) {
      console.error('Dispatch fatal error', err);
      setError('We couldn’t send the messages. Please try again. If it persists, contact the administrator.');
    } finally {
      setIsSending(false);
    }
  }

  const categoryOptions = [
    { value: 'FEES', label: '1. School Fees Balance Reminder' },
    { value: 'ANNOUNCEMENT', label: '2. General Announcement' },
    { value: 'REPORT', label: '3. Student Academic Report' },
  ].filter((option) => allowReports || option.value !== 'REPORT');

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="notification-modal-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="system-modal w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden bg-white rounded-lg shadow-xl border border-slate-300">
        <div className="system-modal-header flex items-center justify-between px-5 py-3.5 bg-[#3b2314] text-white border-b-2 border-[#ea580c]">
          <div>
            <h2 id="notification-modal-title" className="text-sm font-bold uppercase tracking-wider">Send Parent Notice</h2>
            <p className="text-[11px] text-[#fed7aa] mt-0.5">SMS and/or email</p>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose} className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {sendResult && (
            <div className="p-3 bg-slate-50 border rounded text-slate-900">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={18} className={`${(sendResult.results?.filter(r=>r.status==='Failed').length ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-700'} shrink-0 mt-0.5`} />
                <div className="flex-1">
                  <strong className="block font-semibold">{sendResult.results?.some(r=>r.status==='Failed') ? 'Partial delivery' : 'Dispatch results'}</strong>
                  {sendResult.smsMessage && <p className="text-[11px] mt-0.5">SMS: {sendResult.smsMessage} {sendResult.smsCost && `(cost: ${sendResult.smsCost})`}</p>}
                  {sendResult.emailMessage && <p className="text-[11px] mt-0.5">Email: {sendResult.emailMessage}</p>}
                  
                  {sendResult.results && sendResult.results.length > 0 && (
                    <div className="mt-3 max-h-32 overflow-y-auto border rounded bg-white">
                      <table className="w-full text-[10px]">
                        <thead><tr className="bg-slate-100 text-left"><th className="p-1">Parent</th><th className="p-1">Channel</th><th className="p-1">Status</th><th className="p-1">Detail</th></tr></thead>
                        <tbody>
                          {sendResult.results.map((r,i)=>(
                            <tr key={i} className="border-t"><td className="p-1 truncate max-w-[100px]">{r.name}</td><td className="p-1">{r.channel}</td><td className={`p-1 font-bold ${r.status==='Delivered' ? 'text-emerald-700' : 'text-red-600'}`}>{r.status}</td><td className="p-1">{r.detail}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Notice Category <span className="text-[#ea580c]">*</span></label>
              <select value={category} onChange={updateCategory} className="form-input w-full bg-white font-medium">
                {categoryOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Notice Title <span className="text-[#ea580c]">*</span></label>
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Term II Fees Clearance Alert" className="form-input w-full" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Delivery Channels <span className="text-[#ea580c]">*</span></label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 p-3 rounded border transition cursor-pointer ${useSMS ? 'border-[#ea580c] bg-orange-50/70 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                <input type="checkbox" checked={useSMS} onChange={(event) => setUseSMS(event.target.checked)} className="mt-0.5 accent-[#ea580c]" />
                <div><div className="flex items-center gap-1.5"><Smartphone size={14} className={useSMS ? 'text-[#ea580c]' : 'text-slate-400'} /><strong className="text-xs font-semibold">SMS</strong></div><p className="text-[10px] text-slate-500 mt-0.5">Personalized messages to parent numbers</p></div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded border transition cursor-pointer ${useEmail ? 'border-emerald-600 bg-emerald-50/70 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                <input type="checkbox" checked={useEmail} onChange={(event) => setUseEmail(event.target.checked)} className="mt-0.5 accent-emerald-700" />
                <div><div className="flex items-center gap-1.5"><Mail size={14} className={useEmail ? 'text-emerald-700' : 'text-slate-400'} /><strong className="text-xs font-semibold">Email</strong></div><p className="text-[10px] text-slate-500 mt-0.5">Personalized email for each parent</p></div>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="broadcast-message" className="text-[11px] font-bold text-slate-700 uppercase">Message Content <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-1 flex-wrap justify-end"><span className="text-[10px] text-slate-400">Insert Tag:</span>{templates[category].tags.map((tag) => (<button key={tag} type="button" onClick={() => insertTag(tag)} className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700">{tag}</button>))}</div>
            </div>
            <textarea id="broadcast-message" ref={messageRef} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Enter message for parents..." className="form-input w-full font-sans text-xs resize-y" />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-3 flex-wrap"><span className="font-mono">Length: {message.length} chars</span>{useSMS && (<span className="text-emerald-800 font-medium flex items-center gap-1"><DollarSign size={12} />Estimated: ~RWF {smsCostEstimate.estimatedCostRwf}</span>)}</div>
              <span className="text-[10px] text-slate-400 font-mono">Per-recipient personalization</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <label className="text-[11px] font-bold text-slate-700 uppercase">Target Recipients ({recipientCount} selected)</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setRecipientMode('ALL')} className={`px-2 py-1 rounded text-[11px] font-medium border ${recipientMode === 'ALL' ? 'bg-slate-900 text-white border-slate-900 font-bold' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}><Users size={12} className="inline mr-1" />All Parents ({validContacts.length})</button>
                <button type="button" onClick={() => setRecipientMode('SELECT')} className={`px-2 py-1 rounded text-[11px] font-medium border ${recipientMode === 'SELECT' ? 'bg-slate-900 text-white border-slate-900 font-bold' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}><Check size={12} className="inline mr-1" />Select Manually</button>
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 space-y-1">
              {validContacts.length === 0 ? (<p className="text-[11px] text-slate-500 italic p-2 text-center">No eligible contacts found for the selected channels.</p>) : (
                validContacts.map((contact) => {
                  const isChecked = recipientMode === 'ALL' || selectedContactIds.includes(contact.id);
                  return (
                    <label key={contact.id} className={`flex items-center justify-between gap-2 p-1.5 rounded bg-white border border-slate-200 text-xs ${recipientMode === 'SELECT' ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">{recipientMode === 'SELECT' && (<input type="checkbox" checked={isChecked} onChange={() => toggleContact(contact.id)} className="accent-emerald-700" />)}<span className="truncate"><strong className="text-slate-800">{contact.parent_name || 'Parent not recorded'}</strong><span className="text-slate-400 text-[10px] ml-1.5">({contact.student_name || 'Student not recorded'} · {contact.class_name || 'Class not recorded'})</span></span></div>
                      <div className="text-[10px] text-slate-500 font-mono shrink-0">{useSMS && contact.phone && (<span>{formatRwandaPhone(contact.phone)}</span>)}{useEmail && contact.email && (<span className="ml-2 text-slate-400">&lt;{contact.email}&gt;</span>)}</div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Execution Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[{ type: 'SEND_NOW', label: 'Send Now', desc: 'Execute delivery now', icon: Send }, { type: 'SAVE_DRAFT', label: 'Save as Draft', desc: 'Save without sending', icon: Check }, { type: 'SCHEDULE', label: 'Schedule Dispatch', desc: 'Choose future date/time', icon: Clock3 }].map((item) => (
                <button key={item.type} type="button" onClick={() => setActionType(item.type as DispatchAction)} className={`p-2.5 rounded border text-left transition ${actionType === item.type ? 'border-institutional-green bg-emerald-50 text-emerald-950 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><item.icon size={14} className="mb-1 text-slate-700" /><div className="text-xs font-semibold">{item.label}</div><div className="text-[10px] text-slate-500 font-normal">{item.desc}</div></button>
              ))}
            </div>
          </div>

          {actionType === 'SCHEDULE' && (
            <div><label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Select Dispatch Date & Time <span className="text-red-500">*</span></label><input type="datetime-local" min={minDateTime} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="form-input w-full" /><p className="mt-1 text-[10px] text-slate-500">This saves a scheduled campaign. It does not send automatically.</p></div>
          )}

          {error && (<div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2"><AlertCircle size={15} className="shrink-0" /><span>{error}</span></div>)}
        </div>

        <div className="system-modal-footer flex items-center justify-between gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          <div className="text-[11px] text-slate-500">{actionType === 'SEND_NOW' ? (<span>Sending to <strong className="text-slate-800">{recipientCount}</strong> parent contact(s)</span>) : actionType === 'SCHEDULE' ? (<span>Will save schedule for {scheduledDate || 'selected date'}</span>) : (<span>Will save as draft</span>)}</div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={onClose} disabled={isSending} className="btn-enterprise-cancel">Cancel</button>
            <button type="button" disabled={!canSubmit} onClick={() => void handleExecuteDispatch()} className="btn-enterprise-save flex items-center gap-1.5">{isSending ? (<><Loader2 size={13} className="animate-spin" />Sending...</>) : actionType === 'SEND_NOW' ? (<><Send size={13} />Send notice</>) : actionType === 'SCHEDULE' ? (<><Clock3 size={13} />Save schedule</>) : (<><Check size={13} />Save draft</>)}</button>
          </div>
        </div>
      </div>
    </div>
  );
}