import { useMemo, useState } from 'react';
import {
  Bell,
  Copy,
  Megaphone,
  Plus,
  Search,
  Trash2,
  Users,
  FileText,
  Loader2,
  Play,
} from 'lucide-react';
import type { Campaign, Contact } from '@/types';
import { sendAfricasTalkingBulkSMS } from '@/services/africasTalkingService';
import {
  getEmailConfig,
  saveEmailConfig,
  sendBulkEmail,
  type EmailConfig,
  type FreeEmailProvider,
} from '@/services/emailService';
import {
  getAutomationRules,
  saveAutomationRules,
  getDispatchLogs,
  runAutomatedFeeReminders,
  type AutomationRule,
  type AutomatedMessageLog,
} from '@/services/automationService';

type SubTab = 'broadcasts' | 'logs';
type CategoryFilter = 'ALL' | 'FEES' | 'GENERAL' | 'REPORT';

const categoryLabels: Record<string, string> = {
  FEES: 'Remaining Fees Alert',
  GENERAL: 'School Announcement',
  REPORT: 'Student Report Link',
  'Fee reminder': 'Remaining Fees Alert',
  'Parent notification': 'School Announcement',
  'Examination result': 'Student Report Link',
};

function campaignDate(campaign: Campaign) {
  const timestamp = campaign.scheduled_for ?? campaign.created_at;
  if (!timestamp) return 'Date unavailable';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return campaign.scheduled_for
    ? `Scheduled for ${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function categoryColor(category: string) {
  if (category === 'FEES' || category === 'Fee reminder') return 'bg-amber-100 text-amber-800';
  if (category === 'REPORT' || category === 'Examination result') return 'bg-purple-100 text-purple-800';
  return 'bg-blue-100 text-blue-800';
}

export default function Campaigns({
  campaigns,
  contacts = [],
  onCompose,
  onDelete,
  notify,
}: {
  campaigns: Campaign[];
  contacts?: Contact[];
  onCompose: () => void;
  onDelete: (id: string) => void | Promise<void>;
  notify: (message: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<SubTab>('broadcasts');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rules, setRules] = useState<AutomationRule[]>(() => getAutomationRules());
  const [isRunningFeeAutomation, setIsRunningFeeAutomation] = useState(false);
  const [logs, setLogs] = useState<AutomatedMessageLog[]>(() => getDispatchLogs());

  const [logsPage, setLogsPage] = useState(1);
  const LOGS_PER_PAGE = 15;
  const logsTotalPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const pagedLogs = useMemo(() => {
    const start = (logsPage - 1) * LOGS_PER_PAGE;
    return logs.slice(start, start + LOGS_PER_PAGE);
  }, [logs, logsPage]);

  const [testPhone, setTestPhone] = useState('+250788000000');
  const [isTestingSMS, setIsTestingSMS] = useState(false);

  const [emailConfig, setEmailConfig] = useState<EmailConfig>(() => getEmailConfig());
  const [testEmail, setTestEmail] = useState('parent@gsgacuba2a.rw');
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return campaigns.filter((campaign) => {
      const category = campaign.category.toLocaleUpperCase();
      const normalizedCategory =
        category === 'FEE REMINDER' ? 'FEES' : category === 'EXAMINATION RESULT' ? 'REPORT' : category === 'PARENT NOTIFICATION' ? 'GENERAL' : category;
      const matchesCategory = activeFilter === 'ALL' || normalizedCategory === activeFilter;
      const matchesQuery = !query || [campaign.title, campaign.message, campaign.category].some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [campaigns, activeFilter, search]);

  async function deleteCampaign(campaign: Campaign) {
    if (!window.confirm(`Delete "${campaign.title}" from notifications?`)) return;
    setBusyId(campaign.id);
    try { await onDelete(campaign.id); } catch { notify('Could not delete notification.'); }
    finally { setBusyId(null); }
  }

  async function copyMessage(message: string) {
    try { await navigator.clipboard.writeText(message); notify('Message copied to clipboard.'); }
    catch { notify('Clipboard access is unavailable in this browser.'); }
  }

  async function handleRunFeeAutomation() {
    setIsRunningFeeAutomation(true);
    try {
      const studentsForFee = contacts.map((contact) => ({
        fullName: contact.student_name, parentName: contact.parent_name, phone: contact.phone, email: contact.email,
        studentClass: contact.class_name, feeStatus: contact.status || 'Pending Balance', feeAmount: '24,000 RWF',
      }));
      const result = await runAutomatedFeeReminders(studentsForFee);
      notify(`Fee reminders sent: ${result.smsSent} text messages and ${result.emailSent} emails.`);
      setLogs(getDispatchLogs()); setRules(getAutomationRules());
    } catch (error: unknown) {
      console.error('Could not send fee reminders', error); notify('We couldn’t send fee reminders. Please try again.');
    } finally { setIsRunningFeeAutomation(false); }
  }

  function toggleRule(id: string) {
    const updated = rules.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule));
    setRules(updated); saveAutomationRules(updated); notify('Reminder setting saved.');
  }

  async function handleTestSMS() {
    if (!testPhone) { notify('Enter a phone number for test.'); return; }
    setIsTestingSMS(true);
    try {
      const result = await sendAfricasTalkingBulkSMS({ to: [testPhone], message: 'Test SMS from G.S. Gacuba 2A - SMS gateway is working.' });
      notify(result.recipients?.[0]?.status ? `Test SMS: ${result.recipients[0].status}` : 'Test SMS sent.');
    } catch (e) { console.error(e); notify('Test SMS failed. Check Africa’s Talking config.'); }
    finally { setIsTestingSMS(false); }
  }

  async function handleTestEmail() {
    if (!testEmail) { notify('Enter an email for test.'); return; }
    setIsTestingEmail(true);
    try {
      const result = await sendBulkEmail({
        recipients: [{ email: testEmail, name: 'Test Parent' }],
        subject: 'Test Email - G.S. Gacuba 2A',
        message: 'This is a test email from G.S. Gacuba 2A. Email gateway is working.',
      });
      notify(result.totalSent > 0 ? 'Test email sent.' : 'Test email failed.');
    } catch (e) { console.error(e); notify('Test email failed. Check email config.'); }
    finally { setIsTestingEmail(false); }
  }

  function handleSaveEmailConfig() {
    saveEmailConfig(emailConfig);
    notify('Email settings saved.');
  }

  return (
    <div className="data-workspace space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Parent Notices &amp; Messaging</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Send bulk SMS messages and school emails to parents and students</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCompose} className="btn-enterprise-register"><Plus size={14} /> Send notice</button>
        </div>
      </div>

      <div className="flex overflow-x-auto no-scrollbar items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 rounded-t -mx-1 sm:mx-0">
        <button type="button" onClick={() => setActiveTab('broadcasts')} className={`px-3 py-2 text-xs font-semibold rounded transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${activeTab === 'broadcasts' ? 'bg-[#ea580c] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}>
          <Megaphone size={13} /> Broadcast notices ({filteredCampaigns.length})
        </button>
        <button type="button" onClick={() => { setActiveTab('logs'); setLogs(getDispatchLogs()); setLogsPage(1); }} className={`px-3 py-2 text-xs font-semibold rounded transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${activeTab === 'logs' ? 'bg-[#ea580c] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}>
          <FileText size={13} /> Dispatch Logs ({logs.length})
        </button>
      </div>

      {activeTab === 'broadcasts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded border border-slate-200">
            <div className="relative w-full sm:max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notifications..." className="form-input w-full pl-8" />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              {([['ALL', 'All'], ['FEES', 'Fees'], ['GENERAL', 'Announcements'], ['REPORT', 'Reports']] as const).map(([filter, label]) => (
                <button type="button" onClick={() => { setActiveTab('logs'); setLogs(getDispatchLogs()); setLogsPage(1); }}>{label}</button>
              ))}
            </div>
          </div>

                    {/* DESKTOP TABLE */}
          <div className="hidden md:block system-table-wrap">
            <table className="system-table">
              <thead><tr><th>Title &amp; Announcement</th><th>Category</th><th>Channels</th><th>Dispatched Date</th><th>Recipients</th><th>Status</th><th style={{ width: '80px', textAlign: 'center' }}>Actions</th></tr></thead>
              <tbody>
                {filteredCampaigns.length > 0 ? filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td><strong className="font-semibold text-slate-900 block">{campaign.title}</strong><p className="text-[11px] text-slate-600 font-mono mt-1 p-1.5 bg-slate-50 rounded border border-slate-200 max-w-xl whitespace-pre-wrap break-words">{campaign.message}</p></td>
                    <td><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${categoryColor(campaign.category)}`}>{categoryLabels[campaign.category] ?? campaign.category}</span></td>
                    <td className="text-xs"><div className="flex flex-wrap gap-1">{(campaign.channels || ['SMS']).map((channel) => <span key={channel} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">{channel.includes('SMS') ? 'SMS' : 'Email'}</span>)}</div></td>
                    <td className="text-xs text-slate-500 whitespace-nowrap">{campaignDate(campaign)}</td>
                    <td className="font-mono text-xs"><span className="inline-flex items-center gap-1"><Users size={12} className="text-slate-400" />{campaign.recipient_count}</span></td>
                    <td><span className={`status-pill ${campaign.status === 'Sent' ? 'status-pill-paid' : 'status-pill-partial'}`}>{campaign.status}</span></td>
                    <td><div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => void copyMessage(campaign.message)} title="Copy message" className="p-2 text-slate-500 hover:text-emerald-700 rounded"><Copy size={13} /></button>
                      <button type="button" disabled={busyId === campaign.id} onClick={() => void deleteCampaign(campaign)} title="Delete notification" className="p-2 text-slate-400 hover:text-red-600 rounded disabled:opacity-40"><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                )) : <tr><td colSpan={7} className="text-center py-8 text-slate-500"><Megaphone size={24} className="mx-auto mb-2 text-slate-400" />No notices yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS */}
          <div className="md:hidden space-y-3">
            {filteredCampaigns.length > 0 ? filteredCampaigns.map((campaign) => (
              <div key={campaign.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <strong className="font-bold text-sm text-slate-900">{campaign.title}</strong>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${categoryColor(campaign.category)}`}>{categoryLabels[campaign.category] ?? campaign.category}</span>
                </div>
                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border break-words whitespace-pre-wrap">{campaign.message}</p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Users size={11} />{campaign.recipient_count} recipients</span>
                  <span>{campaignDate(campaign)}</span>
                  <span className={`status-pill ${campaign.status === 'Sent' ? 'status-pill-paid' : 'status-pill-partial'}`}>{campaign.status}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => void copyMessage(campaign.message)} className="flex-1 py-2 text-xs font-medium border rounded bg-white">Copy</button>
                  <button type="button" onClick={() => void deleteCampaign(campaign)} className="flex-1 py-2 text-xs font-medium border rounded bg-red-50 text-red-600">Delete</button>
                </div>
              </div>
            )) : <div className="text-center py-8 text-slate-500 text-sm">No notices yet.</div>}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Saved messages: <strong className="font-mono font-bold text-slate-800">{filteredCampaigns.length}</strong></span>
            <span className="text-[11px]"><Bell size={12} className="inline mr-1" />Send by text message or email</span>
          </div>
        </div>
      )}

      {activeTab === 'automations' && (
        <div className="space-y-4">
          <div className="bg-slate-50 p-3.5 rounded border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><h3 className="text-xs font-bold text-slate-900 uppercase">Automated Parent Reminders</h3><p className="text-[11px] text-slate-500 mt-0.5">Automatically send fee reminders and student enrollment notices to parents</p></div>
            <button type="button" disabled={isRunningFeeAutomation} onClick={() => void handleRunFeeAutomation()} className="btn-enterprise-register flex items-center gap-1.5">
              {isRunningFeeAutomation ? <><Loader2 size={13} className="animate-spin" /> Sending reminders...</> : <><Play size={13} /> Send fee reminders</>}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <div key={rule.id} className={`p-4 rounded border bg-white space-y-3 transition ${rule.enabled ? 'border-amber-400 shadow-sm' : 'border-slate-200 opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><span className="text-[10px] font-bold uppercase tracking-wider text-[#ea580c] bg-orange-50 px-2 py-0.5 rounded border border-orange-200">Channel: {rule.channel}</span><h4 className="text-sm font-bold text-slate-900 mt-1">{rule.name}</h4></div>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.id)} className="accent-[#ea580c] h-4 w-4" /><span className="text-xs font-semibold text-slate-700">{rule.enabled ? 'Active' : 'Disabled'}</span></label>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{rule.description}</p>
                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[11px]">
                  <div><strong className="text-slate-700 block">SMS text:</strong><div className="p-2 bg-slate-50 rounded border border-slate-200 font-mono text-slate-600 mt-0.5">{rule.templateSMS}</div></div>
                  <div><strong className="text-slate-700 block mt-2">Email text:</strong><div className="p-2 bg-slate-50 rounded border border-slate-200 font-sans text-slate-600 mt-0.5">{rule.templateEmail}</div></div>
                </div>
                {rule.lastRun && <p className="text-[10px] text-slate-400 pt-1">Last sent: {new Date(rule.lastRun).toLocaleString()}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div><h3 className="text-xs font-bold text-slate-900 uppercase">Message Delivery History</h3><p className="text-[11px] text-slate-500 mt-0.5">Every parent SMS and email is recorded here with delivery status</p></div>
                    <button type="button" onClick={() => { setLogs(getDispatchLogs()); setLogsPage(1); }} className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700">Refresh list</button>
             </div>
                    {/* DESKTOP - keeps table but no forced min-width */}
          <div className="hidden md:block system-table-wrap border border-slate-200 rounded-xl overflow-hidden">
            <table className="system-table">
              <thead><tr><th className="whitespace-nowrap">Date & time</th><th>Category</th><th>Channel</th><th>Recipients</th><th>SMS</th><th>Email</th><th>Message</th></tr></thead>
              <tbody>
                {pagedLogs.length > 0 ? pagedLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-[11px] font-mono text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border">{log.category}</span></td>
                    <td className="text-[11px] font-semibold">{log.channel === 'BOTH' ? <span className="text-[#ea580c]">BOTH</span> : log.channel}</td>
                    <td className="text-xs"><strong className="font-mono">{log.recipientCount}</strong><div className="text-[10px] text-slate-400 truncate max-w-[100px]">{log.recipientDetails}</div></td>
                    <td className="text-[11px]">{log.smsStatus ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">{log.smsStatus}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="text-[11px]">{log.emailStatus ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{log.emailStatus}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="text-[11px] max-w-[200px]"><div className="truncate text-slate-600" title={log.previewMessage}>{log.previewMessage}</div></td>
                  </tr>
                )) : <tr><td colSpan={7} className="text-center py-10 text-slate-500 text-sm">No logs yet</td></tr>}
              </tbody>
            </table>
          </div>

          {/* MOBILE - clean cards, clear boundaries */}
          <div className="md:hidden space-y-2.5">
            {pagedLogs.length > 0 ? pagedLogs.map((log) => (
              <div key={log.id} className="bg-white border border-slate-200 rounded-[12px] p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-white tracking-wide">{log.category}</span>
                  <span className="text-[10px] font-mono text-slate-500">{new Date(log.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-[12px] text-slate-700 mt-2 leading-snug line-clamp-2">{log.previewMessage}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div><p className="text-[9px] uppercase tracking-widest font-semibold text-slate-400">Channel</p><p className="font-semibold mt-0.5">{log.channel}</p></div>
                  <div><p className="text-[9px] uppercase tracking-widest font-semibold text-slate-400">Recipients</p><p className="font-mono font-bold mt-0.5">{log.recipientCount}</p></div>
                  <div><p className="text-[9px] uppercase tracking-widest font-semibold text-slate-400">Status</p><p className="mt-0.5">{log.smsStatus || log.emailStatus || '—'}</p></div>
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="truncate max-w-[140px]">{log.recipientDetails}</span>
                </div>
              </div>
            )) : <div className="bg-white border border-dashed rounded-xl p-8 text-center text-sm text-slate-500">No message delivery logs yet</div>}
          </div>

          {/* PAGINATION */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 pt-3 border-t border-slate-200">
            <span className="text-[11px]">Showing {(logsPage-1)*LOGS_PER_PAGE+1}-{Math.min(logsPage*LOGS_PER_PAGE, logs.length)} of <strong className="font-mono text-slate-800">{logs.length}</strong> logs</span>
            {logsTotalPages > 1 && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button disabled={logsPage===1} onClick={() => setLogsPage(p=>p-1)} className="flex-1 sm:flex-none h-9 px-4 border rounded-lg bg-white disabled:opacity-40 font-medium">Prev</button>
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({length: Math.min(5, logsTotalPages)}, (_, i) => {
                    let pageNum = logsTotalPages <=5 ? i+1 : logsPage <=3 ? i+1 : logsPage >= logsTotalPages-2 ? logsTotalPages-4+i : logsPage-2+i;
                    return <button key={pageNum} onClick={() => setLogsPage(pageNum)} className={`w-8 h-8 rounded-lg text-xs font-bold border ${logsPage===pageNum ? 'bg-[#ea580c] text-white border-[#ea580c]' : 'bg-white text-slate-600'}`}>{pageNum}</button>;
                  })}
                </div>
                <button disabled={logsPage===logsTotalPages} onClick={() => setLogsPage(p=>p+1)} className="flex-1 sm:flex-none h-9 px-4 border rounded-lg bg-white disabled:opacity-40 font-medium">Next</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}