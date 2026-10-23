import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  DollarSign,
  Loader2,
  Mail,
  Send,
  Smartphone,
  Users,
  X,
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

const REQUIRED_FEES_RWF = 24000;

const TEMPLATES: Record<Category, { title: string; message: string; tags: string[] }> = {
  FEES: {
    title: 'School Fees Balance',
    message: 'Dear {PARENTNAME}, the remaining school fees for {FULLNAME} ({CLASS}) at GS Gacuba II A is {FEES} RWF.',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{CLASS}', '{FEES}'],
  },
  ANNOUNCEMENT: {
    title: 'Parents Announcement',
    message: 'Dear {PARENTNAME}, GS Gacuba II A invites you to a parents meeting on [DATE] for {FULLNAME} ({CLASS}).',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{CLASS}'],
  },
  REPORT: {
    title: 'Mid-Term Report',
    message: 'Dear {PARENTNAME}, the mid-term report for {FULLNAME} ({CLASS}) is now available.',
    tags: ['{PARENTNAME}', '{FULLNAME}', '{CLASS}'],
  },
};

function getRemainingBalance(contact: Contact): number {
  const raw = String(contact.fee_amount ?? contact.fees ?? '0').replace(/[^\d]/g, '');
  const paid = Number(raw);
  if (!Number.isFinite(paid) || paid < 0) return REQUIRED_FEES_RWF;
  return Math.max(0, REQUIRED_FEES_RWF - paid);
}

function personalize(template: string, contact: Contact): string {
  const values: Record<string, string> = {
    FULLNAME: contact.student_name?.trim() || 'Student',
    PARENTNAME: contact.parent_name?.trim() || 'Parent',
    CLASS: contact.class_name?.trim() || 'N/A',
    FEES: getRemainingBalance(contact).toLocaleString('en-RW'),
  };
  return template.replace(/\{(FULLNAME|PARENTNAME|CLASS|FEES)\}/g, (_, k) => values[k] ?? '');
}

type DeliveryResult = {
  id: string;
  name: string;
  channel: 'SMS' | 'EMAIL';
  status: 'Delivered' | 'Failed';
  detail: string;
};

interface Props {
  onClose: () => void;
  onSave: (
    campaign: Omit<Campaign, 'id' | 'created_at'>,
    dispatch: { fingerprint: string; recipientIds: string[] },
  ) => void;
  contacts: Contact[];
  allowReports?: boolean;
}

export default function NotificationModal({ onClose, onSave, contacts, allowReports = true }: Props) {
  const [category, setCategory] = useState<Category>('FEES');
  const [title, setTitle] = useState(TEMPLATES.FEES.title);
  const [message, setMessage] = useState(TEMPLATES.FEES.message);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [action, setAction] = useState<DispatchAction>('SEND_NOW');
  const [scheduledDate, setScheduledDate] = useState('');
  const [useSMS, setUseSMS] = useState(true);
  const [useEmail, setUseEmail] = useState(false);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<DeliveryResult[] | null>(null);

  const messageRef = useRef<HTMLTextAreaElement>(null);

  const validContacts = useMemo(() => {
    return contacts.filter((c) => {
      const hasPhone = !!c.phone && c.phone.replace(/\D/g, '').length >= 9;
      const hasEmail = !!c.email && c.email.includes('@');
      if (useSMS && useEmail) return hasPhone || hasEmail;
      if (useSMS) return hasPhone;
      if (useEmail) return hasEmail;
      return false;
    });
  }, [contacts, useSMS, useEmail]);

  const targeted = useMemo(() => {
    if (recipientMode === 'ALL') return validContacts;
    return validContacts.filter((c) => selectedIds.includes(c.id));
  }, [validContacts, recipientMode, selectedIds]);

  const cost = useMemo(() => calculateSMSCost(targeted.length, message.length), [targeted.length, message.length]);
  const minDateTime = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), []);

  useEffect(() => {
    const t = TEMPLATES[category];
    setTitle(t.title);
    setMessage(t.message);
    setError('');
    setResult(null);
  }, [category]);

  const canSubmit = title.trim() && message.trim() && targeted.length > 0 && (useSMS || useEmail) && !isSending;

  function toggleContact(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function insertTag(tag: string) {
    const el = messageRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${message.slice(0, start)}${tag}${message.slice(end)}`;
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  async function handleDispatch() {
    if (!title.trim() || !message.trim()) return setError('Title and message required');
    if (!useSMS && !useEmail) return setError('Select at least one channel');
    if (targeted.length === 0) return setError('No recipients');
    if (action === 'SCHEDULE' && new Date(scheduledDate).getTime() <= Date.now()) {
      return setError('Invalid schedule date');
    }

    const recipientIds = targeted.map((c) => c.id).sort();
    const fingerprint = `${category}|${message.trim()}|${recipientIds.join(',')}`;
    const channels: string[] = [];
    if (useSMS) channels.push('SMS');
    if (useEmail) channels.push('Email');

    if (action !== 'SEND_NOW') {
      onSave(
        {
          title: title.trim(),
          message: message.trim(),
          channels,
          recipient_count: targeted.length,
          status: action === 'SCHEDULE' ? 'Scheduled' : 'Draft',
          category,
          ...(action === 'SCHEDULE' ? { scheduled_for: new Date(scheduledDate).toISOString() } : {}),
        },
        { fingerprint, recipientIds },
      );
      return;
    }

    setIsSending(true);
    setError('');
    setResult(null);

    const delivery: DeliveryResult[] = [];

    try {
      // SMS - Bulk in one request with personalized per contact not supported by AT bulk,
      // so we send personalized via loop but limited to 100 and without artificial delay
      if (useSMS) {
        const smsTargets = targeted.filter((c) => c.phone);
        for (const contact of smsTargets) {
          try {
            const personalized = personalize(message.trim(), contact);
            const res = await sendAfricasTalkingBulkSMS({ to: [contact.phone], message: personalized });
            const ok = res.recipients[0]?.status === 'Success';
            delivery.push({
              id: contact.id,
              name: contact.parent_name || contact.student_name,
              channel: 'SMS',
              status: ok ? 'Delivered' : 'Failed',
              detail: res.recipients[0]?.status || 'Unknown',
            });
          } catch (e) {
            delivery.push({
              id: contact.id,
              name: contact.parent_name || contact.student_name,
              channel: 'SMS',
              status: 'Failed',
              detail: e instanceof Error ? e.message : 'Failed',
            });
          }
        }
      }

      if (useEmail) {
        const emailTargets = targeted.filter((c) => c.email);
        for (const contact of emailTargets) {
          try {
            const personalized = personalize(message.trim(), contact);
            await sendBulkEmail({
              recipients: [{ email: contact.email, name: contact.parent_name }],
              subject: title.trim(),
              message: personalized,
            });
            delivery.push({ id: contact.id, name: contact.parent_name, channel: 'EMAIL', status: 'Delivered', detail: 'Sent' });
          } catch {
            delivery.push({ id: contact.id, name: contact.parent_name, channel: 'EMAIL', status: 'Failed', detail: 'Failed' });
          }
        }
      }

      const delivered = delivery.filter((d) => d.status === 'Delivered').length;
      const failed = delivery.filter((d) => d.status === 'Failed').length;

      if (delivered === 0) {
        setError(`Delivery failed for ${failed} recipients`);
        setResult(delivery);
        return;
      }

      addDispatchLog({
        channel: useSMS && useEmail ? 'BOTH' : useSMS ? 'SMS' : 'EMAIL',
        category,
        title: title.trim(),
        previewMessage: message.trim().slice(0, 100),
        recipientCount: delivered,
        recipientDetails: `Delivered: ${delivered}, Failed: ${failed}`,
      });

      setResult(delivery);

      onSave(
        {
          title: title.trim(),
          message: message.trim(),
          channels,
          recipient_count: delivered,
          status: failed > 0 ? 'Partially Sent' : 'Sent',
          category,
        },
        {
          fingerprint,
          recipientIds: [...new Set(delivery.filter((d) => d.status === 'Delivered').map((d) => d.id))],
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed');
    } finally {
      setIsSending(false);
    }
  }

  const categoryOptions = [
    { value: 'FEES', label: 'School Fees Balance' },
    { value: 'ANNOUNCEMENT', label: 'General Announcement' },
    { value: 'REPORT', label: 'Academic Report' },
  ].filter((o) => allowReports || o.value !== 'REPORT');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-lg shadow-xl border border-slate-300">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#3b2314] text-white">
          <h2 className="text-sm font-bold uppercase tracking-wider">Send Parent Notice</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {isSending && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-amber-900">
              <Loader2 size={16} className="animate-spin" /> Sending...
            </div>
          )}

          {result && (
            <div className="p-3 bg-slate-50 border rounded">
              <div className="flex gap-2">
                <CheckCircle2 size={16} className="text-emerald-700 mt-0.5" />
                <div className="flex-1">
                  <strong>{result.filter((r) => r.status === 'Failed').length > 0 ? 'Partial delivery' : 'Delivery complete'}</strong>
                  <div className="mt-2 max-h-32 overflow-auto border rounded bg-white">
                    <table className="w-full text-[10px]">
                      <thead><tr className="bg-slate-100 text-left"><th className="p-1">Parent</th><th className="p-1">Channel</th><th className="p-1">Status</th></tr></thead>
                      <tbody>{result.slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-t"><td className="p-1">{r.name}</td><td className="p-1">{r.channel}</td><td className={`p-1 font-bold ${r.status === 'Delivered' ? 'text-emerald-700' : 'text-red-600'}`}>{r.status}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold uppercase mb-1">Category</label>
              <select value={category} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value as Category)} className="form-input w-full">
                {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold uppercase mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="form-input w-full" />
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase mb-1.5">Channels</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex gap-3 p-3 rounded border cursor-pointer ${useSMS ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
                <input type="checkbox" checked={useSMS} onChange={(e) => setUseSMS(e.target.checked)} className="accent-[#ea580c]" />
                <div><div className="flex items-center gap-1.5"><Smartphone size={14} /><strong>SMS</strong></div></div>
              </label>
              <label className={`flex gap-3 p-3 rounded border cursor-pointer ${useEmail ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <input type="checkbox" checked={useEmail} onChange={(e) => setUseEmail(e.target.checked)} className="accent-emerald-700" />
                <div><div className="flex items-center gap-1.5"><Mail size={14} /><strong>Email</strong></div></div>
              </label>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="font-bold uppercase">Message</label>
              <div className="flex gap-1">{TEMPLATES[category].tags.map((tag) => (
                <button key={tag} onClick={() => insertTag(tag)} className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 border rounded">{tag}</button>
              ))}</div>
            </div>
            <textarea ref={messageRef} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="form-input w-full resize-y" />
            <div className="flex justify-between text-[11px] text-slate-500 mt-1">
              <span>{message.length} chars</span>
              {useSMS && <span className="flex items-center gap-1"><DollarSign size={12} />RWF {cost.estimatedCostRwf} for {targeted.length}</span>}
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="font-bold uppercase">Recipients ({targeted.length})</label>
              <div className="flex gap-2">
                <button onClick={() => setRecipientMode('ALL')} className={`px-2 py-1 rounded border text-[11px] ${recipientMode === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white'}`}><Users size={12} className="inline mr-1" />All ({validContacts.length})</button>
                <button onClick={() => setRecipientMode('SELECT')} className={`px-2 py-1 rounded border text-[11px] ${recipientMode === 'SELECT' ? 'bg-slate-900 text-white' : 'bg-white'}`}><Check size={12} className="inline mr-1" />Select</button>
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto rounded border bg-slate-50 p-2 space-y-1">
              {validContacts.map((c) => (
                <label key={c.id} className="flex justify-between p-1.5 rounded bg-white border text-xs">
                  <span className="flex items-center gap-2">{recipientMode === 'SELECT' && <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleContact(c.id)} />} {c.parent_name}</span>
                  <span className="font-mono text-[10px] text-slate-500">{formatRwandaPhone(c.phone)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[{ id: 'SEND_NOW', label: 'Send Now', icon: Send }, { id: 'SAVE_DRAFT', label: 'Draft', icon: Check }, { id: 'SCHEDULE', label: 'Schedule', icon: Clock3 }].map((item) => (
              <button key={item.id} onClick={() => setAction(item.id as DispatchAction)} className={`p-2.5 rounded border text-left ${action === item.id ? 'border-emerald-600 bg-emerald-50 font-bold' : 'border-slate-200 bg-white'}`}>
                <item.icon size={14} className="mb-1" /><div className="text-xs">{item.label}</div>
              </button>
            ))}
          </div>

          {action === 'SCHEDULE' && (
            <input type="datetime-local" min={minDateTime} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="form-input w-full" />
          )}

          {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 flex gap-2"><AlertCircle size={15} />{error}</div>}
        </div>

        <div className="flex justify-between px-5 py-3.5 bg-slate-50 border-t">
          <span className="text-[11px] text-slate-500">{targeted.length} recipients</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={isSending} className="btn-enterprise-cancel">Cancel</button>
            <button disabled={!canSubmit} onClick={() => void handleDispatch()} className="btn-enterprise-save flex items-center gap-1.5">
              {isSending ? <><Loader2 size={13} className="animate-spin" />Sending</> : action === 'SEND_NOW' ? <><Send size={13} />Send</> : action === 'SCHEDULE' ? <><Clock3 size={13} />Save schedule</> : <><Check size={13} />Save draft</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}