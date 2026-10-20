import { useMemo, useState } from 'react';
import {
  Bell,
  Copy,
  Megaphone,
  Plus,
  Search,
  Trash2,
  Users,
  Zap,
  FileText,
  Sliders,
  Send,
  Smartphone,
  Mail,
  Loader2,
  Play,
  Key,
} from 'lucide-react';
import type { Campaign, Contact } from '@/types';
import {
  getAfricasTalkingConfig,
  saveAfricasTalkingConfig,
  sendAfricasTalkingBulkSMS,
  type AfricasTalkingConfig,
} from '@/services/africasTalkingService';
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

type SubTab = 'broadcasts' | 'automations' | 'logs' | 'gateways';
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

  // Automations state
  const [rules, setRules] = useState<AutomationRule[]>(() => getAutomationRules());
  const [isRunningFeeAutomation, setIsRunningFeeAutomation] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<AutomatedMessageLog[]>(() => getDispatchLogs());

  // Gateway Settings state
  const [atConfig, setAtConfig] = useState<AfricasTalkingConfig>(() => getAfricasTalkingConfig());
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(() => getEmailConfig());
  const [testPhone, setTestPhone] = useState('+250788000000');
  const [testEmail, setTestEmail] = useState('parent@gsgacuba2a.rw');
  const [isTestingSMS, setIsTestingSMS] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return campaigns.filter((campaign) => {
      const category = campaign.category.toLocaleUpperCase();
      const normalizedCategory = category === 'FEE REMINDER' ? 'FEES'
        : category === 'EXAMINATION RESULT' ? 'REPORT'
          : category === 'PARENT NOTIFICATION' ? 'GENERAL' : category;
      const matchesCategory = activeFilter === 'ALL' || normalizedCategory === activeFilter;
      const matchesQuery = !query || [campaign.title, campaign.message, campaign.category]
        .some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [campaigns, activeFilter, search]);

  async function deleteCampaign(campaign: Campaign) {
    if (!window.confirm(`Delete "${campaign.title}" from notifications?`)) return;
    setBusyId(campaign.id);
    try {
      await onDelete(campaign.id);
    } catch {
      notify('Could not delete notification.');
    } finally {
      setBusyId(null);
    }
  }

  async function copyMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      notify('Message copied to clipboard.');
    } catch {
      notify('Clipboard access is unavailable in this browser.');
    }
  }

  // Trigger automated fee reminder scan
  async function handleRunFeeAutomation() {
    setIsRunningFeeAutomation(true);
    try {
      // Map contacts to student shape for reminder scanner
      const studentsForFee = contacts.map((c) => ({
        fullName: c.student_name,
        parentName: c.parent_name,
        phone: c.phone,
        email: c.email,
        studentClass: c.class_name,
        feeStatus: c.status || 'Pending Balance',
        feeAmount: '35,000 RWF',
      }));

      const res = await runAutomatedFeeReminders(studentsForFee);
      notify(`Fee reminders sent: ${res.smsSent} text messages and ${res.emailSent} emails.`);
      setLogs(getDispatchLogs());
      setRules(getAutomationRules());
    } catch (err: unknown) {
      console.error('Could not send fee reminders', err);
      notify('We couldn’t send fee reminders. Please try again.');
    } finally {
      setIsRunningFeeAutomation(false);
    }
  }

  // Toggle automation rule
  function toggleRule(id: string) {
    const updated = rules.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated);
    saveAutomationRules(updated);
    notify('Reminder setting saved.');
  }

  // Save Africa's Talking config
  function handleSaveATConfig() {
    saveAfricasTalkingConfig(atConfig);
    notify('Text message settings saved.');
  }

  // Test Africa's Talking connection
  async function handleTestATConnection() {
    setIsTestingSMS(true);
    try {
      const res = await sendAfricasTalkingBulkSMS({
        to: [testPhone],
        message: 'This is a test text message from G.S. Gacuba 2A. No action is needed.',
        configOverride: atConfig,
      });
      notify(`Test text message sent. Cost: ${res.totalCost}.`);
      setLogs(getDispatchLogs());
    } catch (err: unknown) {
      console.error('Could not send test text message', err);
      notify('We couldn’t send the test text message. Check the number and settings, then try again.');
    } finally {
      setIsTestingSMS(false);
    }
  }

  // Save Email Config
  function handleSaveEmailConfig() {
    saveEmailConfig(emailConfig);
    notify('Email settings saved.');
  }

  // Test Email connection
  async function handleTestEmailConnection() {
    setIsTestingEmail(true);
    try {
      await sendBulkEmail({
        recipients: [{ email: testEmail, name: 'School Administrator' }],
        subject: 'G.S. Gacuba 2A: Test email',
        message: 'This is a test email from G.S. Gacuba 2A. No action is needed.',
        configOverride: emailConfig,
      });
      notify('Test email sent.');
      setLogs(getDispatchLogs());
    } catch (err: unknown) {
      console.error('Could not send test email', err);
      notify('We couldn’t send the test email. Check the address and settings, then try again.');
    } finally {
      setIsTestingEmail(false);
    }
  }

  return (
    <div className="data-workspace space-y-4">
      {/* Header bar with Subnav Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Parent Notices & Messaging
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Send bulk SMS messages and school emails to parents and students
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCompose}
            className="btn-enterprise-register"
          >
            <Plus size={14} /> Send notice
          </button>
        </div>
      </div>

      {/* Subnav Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 rounded-t">
        <button
          type="button"
          onClick={() => setActiveTab('broadcasts')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition flex items-center gap-1.5 ${
            activeTab === 'broadcasts'
              ? 'bg-[#ea580c] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Megaphone size={13} />
          Broadcast notices ({filteredCampaigns.length})
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('automations');
            setRules(getAutomationRules());
          }}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition flex items-center gap-1.5 ${
            activeTab === 'automations'
              ? 'bg-[#ea580c] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Zap size={13} />
          Automated reminders ({rules.filter((r) => r.enabled).length} Active)
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('logs');
            setLogs(getDispatchLogs());
          }}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition flex items-center gap-1.5 ${
            activeTab === 'logs'
              ? 'bg-[#ea580c] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <FileText size={13} />
          Delivery history ({logs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gateways')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition flex items-center gap-1.5 ${
            activeTab === 'gateways'
              ? 'bg-[#ea580c] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Sliders size={13} />
          Message settings
        </button>
      </div>

      {/* TAB 1: BROADCAST CAMPAIGNS */}
      {activeTab === 'broadcasts' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded border border-slate-200">
            <div className="relative w-full sm:max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notifications..."
                className="form-input w-full pl-8"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              {([
                ['ALL', 'All'],
                ['FEES', 'Fees'],
                ['GENERAL', 'Announcements'],
                ['REPORT', 'Reports'],
              ] as const).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`px-3 py-1.5 rounded font-medium transition ${
                    activeFilter === filter
                      ? 'bg-emerald-800 text-white font-bold'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign List */}
          <div className="system-table-wrap">
            <table className="system-table">
              <thead>
                <tr>
                  <th>Title & Announcement</th>
                  <th>Category</th>
                  <th>Channels</th>
                  <th>Dispatched Date</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.length > 0 ? (
                  filteredCampaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong className="font-semibold text-slate-900 block">{c.title}</strong>
                        <p className="text-[11px] text-slate-600 font-mono mt-1 p-1.5 bg-slate-50 rounded border border-slate-200 max-w-xl">
                          {c.message}
                        </p>
                      </td>
                      <td>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${categoryColor(c.category)}`}>
                          {categoryLabels[c.category] ?? c.category}
                        </span>
                      </td>
                      <td className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(c.channels || ['SMS']).map((ch) => (
                            <span key={ch} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                              {ch.includes('SMS') ? 'SMS' : 'Email'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">
                        {campaignDate(c)}
                      </td>
                      <td className="font-mono text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} className="text-slate-400" /> {c.recipient_count}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${c.status === 'Sent' ? 'status-pill-paid' : 'status-pill-partial'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => void copyMessage(c.message)}
                            title="Copy message"
                            className="p-1 text-slate-500 hover:text-emerald-700 rounded"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => void deleteCampaign(c)}
                            title="Delete notification"
                            className="p-1 text-slate-400 hover:text-red-600 rounded disabled:opacity-40"
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
                      <Megaphone size={24} className="mx-auto mb-2 text-slate-400" />
                      No notices yet. Send one to keep parents informed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Saved messages: <strong className="font-mono font-bold text-slate-800">{filteredCampaigns.length}</strong></span>
            <span className="text-[11px]"><Bell size={12} className="inline mr-1" />Send by text message or email</span>
          </div>
        </div>
      )}

      {/* TAB 2: AUTOMATED REMINDERS */}
      {activeTab === 'automations' && (
        <div className="space-y-4">
          <div className="bg-slate-50 p-3.5 rounded border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase">
                Automated Parent Reminders
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Automatically send fee reminders and student enrollment notices to parents
              </p>
            </div>
            <button
              type="button"
              disabled={isRunningFeeAutomation}
              onClick={() => void handleRunFeeAutomation()}
              className="btn-enterprise-register flex items-center gap-1.5"
            >
              {isRunningFeeAutomation ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Sending reminders...
                </>
              ) : (
                <>
                  <Play size={13} /> Send fee reminders
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-4 rounded border bg-white space-y-3 transition ${
                  rule.enabled ? 'border-amber-400 shadow-sm' : 'border-slate-200 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#ea580c] bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                      Channel: {rule.channel}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">{rule.name}</h4>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleRule(rule.id)}
                      className="accent-[#ea580c] h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </label>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {rule.description}
                </p>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[11px]">
                  <div>
                    <strong className="text-slate-700 block">SMS text:</strong>
                    <div className="p-2 bg-slate-50 rounded border border-slate-200 font-mono text-slate-600 mt-0.5">
                      {rule.templateSMS}
                    </div>
                  </div>
                  <div>
                    <strong className="text-slate-700 block mt-2">Email text:</strong>
                    <div className="p-2 bg-slate-50 rounded border border-slate-200 font-sans text-slate-600 mt-0.5">
                      {rule.templateEmail}
                    </div>
                  </div>
                </div>

                {rule.lastRun && (
                  <p className="text-[10px] text-slate-400 pt-1">
                    Last sent: {new Date(rule.lastRun).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: DELIVERY HISTORY */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase">
                Message Delivery History
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Every parent SMS and email is recorded here with delivery status
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogs(getDispatchLogs())}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700"
            >
              Refresh list
            </button>
          </div>

          <div className="system-table-wrap">
            <table className="system-table">
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Category</th>
                  <th>Channel</th>
                  <th>Recipients</th>
                  <th>SMS status</th>
                  <th>Email status</th>
                  <th>Message text</th>
                </tr>
              </thead>
              <tbody>
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-xs font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          {log.category}
                        </span>
                      </td>
                      <td className="text-xs font-semibold">
                        {log.channel === 'BOTH' ? (
                          <span className="text-[#ea580c]">SMS + Email</span>
                        ) : log.channel === 'SMS' ? (
                          <span className="text-[#0284c7]">SMS Only</span>
                        ) : (
                          <span className="text-purple-700">Email Only</span>
                        )}
                      </td>
                      <td className="text-xs">
                        <strong className="text-slate-800">{log.recipientCount}</strong>
                        <div className="text-[10px] text-slate-400">{log.recipientDetails}</div>
                      </td>
                      <td className="text-xs">
                        {log.smsStatus ? (
                          <div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {log.smsStatus}
                            </span>
                            {log.smsCost && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {log.smsCost}
                              </div>
                            )}
                            {log.smsMessageId && (
                              <div className="text-[9px] text-slate-400 font-mono truncate max-w-[120px]">
                                {log.smsMessageId}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {log.emailStatus ? (
                          <div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              {log.emailStatus}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {log.emailProvider || 'Free Email'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="text-xs max-w-xs">
                        <div className="truncate text-slate-700" title={log.previewMessage}>
                          {log.previewMessage}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      No message delivery logs yet. Send your first notice to view records here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MESSAGE SETTINGS */}
      {activeTab === 'gateways' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Africa's Talking Settings Panel */}
          <div className="p-5 bg-white rounded border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-[#ea580c]" />
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase">
                    Africa's Talking SMS
                  </h3>
                  <a
                    href="https://developers.africastalking.com/docs/sms/sending/bulk"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#0284c7] hover:underline font-medium"
                  >
                    View official SMS documentation
                  </a>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                atConfig.environment === 'live' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {atConfig.environment.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Operating Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAtConfig({ ...atConfig, environment: 'sandbox', username: 'sandbox' })}
                    className={`p-2 rounded border text-xs font-semibold ${
                      atConfig.environment === 'sandbox'
                        ? 'border-[#ea580c] bg-orange-50 text-[#c2410c]'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Test mode (Sandbox)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAtConfig({ ...atConfig, environment: 'live' })}
                    className={`p-2 rounded border text-xs font-semibold ${
                      atConfig.environment === 'live'
                        ? 'border-[#ea580c] bg-orange-50 text-[#c2410c]'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Live mode
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Africa's Talking username
                </label>
                <input
                  type="text"
                  value={atConfig.username}
                  onChange={(e) => setAtConfig({ ...atConfig, username: e.target.value })}
                  placeholder="e.g. sandbox or your school account"
                  className="form-input w-full font-mono text-xs"
                />
                <span className="text-[10px] text-slate-400">Use "sandbox" for test mode.</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Africa's Talking API key
                </label>
                <input
                  type="password"
                  value={atConfig.apiKey}
                  onChange={(e) => setAtConfig({ ...atConfig, apiKey: e.target.value })}
                  placeholder="Enter Africa's Talking API key"
                  className="form-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Sender name (Optional)
                </label>
                <input
                  type="text"
                  value={atConfig.senderId || ''}
                  onChange={(e) => setAtConfig({ ...atConfig, senderId: e.target.value })}
                  placeholder="e.g. GACUBA2A"
                  className="form-input w-full font-mono text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSaveATConfig}
                  className="btn-enterprise-register flex items-center gap-1.5"
                >
                  <Key size={13} /> Save SMS settings
                </button>
              </div>

              {/* Live SMS Tester */}
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2 mt-3">
                <strong className="text-[11px] font-bold text-slate-800 uppercase block">
                  Send test SMS
                </strong>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+250788000000"
                    className="form-input flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={isTestingSMS}
                    onClick={() => void handleTestATConnection()}
                    className="btn-enterprise-save whitespace-nowrap text-xs"
                  >
                    {isTestingSMS ? <Loader2 size={12} className="animate-spin inline mr-1" /> : <Send size={12} className="inline mr-1" />}
                    Send test SMS
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Free Email Tool Settings Panel */}
          <div className="p-5 bg-white rounded border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-[#0284c7]" />
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase">
                    Free School Email
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Choose your free school email service
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                {emailConfig.provider}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Email service
                </label>
                <select
                  value={emailConfig.provider}
                  onChange={(e) => setEmailConfig({ ...emailConfig, provider: e.target.value as FreeEmailProvider })}
                  className="form-input w-full bg-white font-medium"
                >
                  <option value="simulation">Free simulation mode (Test without sending)</option>
                  <option value="resend">Resend (Free 100 emails/day · 3,000/mo)</option>
                  <option value="emailjs">EmailJS (Free 200 emails/mo)</option>
                  <option value="brevo">Brevo (Free 300 emails/day)</option>
                  <option value="webhook">Custom Webhook (Google Apps Script / Worker)</option>
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Select your preferred free service or leave on Simulation mode for verified records.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Sender display name
                </label>
                <input
                  type="text"
                  value={emailConfig.fromName}
                  onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })}
                  placeholder="G.S Gacuba 2A Administration"
                  className="form-input w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Sender email address
                </label>
                <input
                  type="email"
                  value={emailConfig.fromEmail}
                  onChange={(e) => setEmailConfig({ ...emailConfig, fromEmail: e.target.value })}
                  placeholder="admin@gsgacuba2a.rw"
                  className="form-input w-full font-mono text-xs"
                />
              </div>

              {emailConfig.provider !== 'simulation' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    {emailConfig.provider === 'webhook' ? 'Webhook URL' : 'Provider API key'}
                  </label>
                  <input
                    type="password"
                    value={emailConfig.provider === 'webhook' ? emailConfig.webhookUrl : emailConfig.apiKey}
                    onChange={(e) => {
                      if (emailConfig.provider === 'webhook') {
                        setEmailConfig({ ...emailConfig, webhookUrl: e.target.value });
                      } else {
                        setEmailConfig({ ...emailConfig, apiKey: e.target.value });
                      }
                    }}
                    placeholder={emailConfig.provider === 'webhook' ? 'https://script.google.com/macros/s/...' : 're_12345...'}
                    className="form-input w-full font-mono text-xs"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSaveEmailConfig}
                  className="btn-enterprise-register flex items-center gap-1.5"
                >
                  <Key size={13} /> Save email settings
                </button>
              </div>

              {/* Email Tester */}
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2 mt-3">
                <strong className="text-[11px] font-bold text-slate-800 uppercase block">
                  Send test email
                </strong>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="parent@gsgacuba2a.rw"
                    className="form-input flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={isTestingEmail}
                    onClick={() => void handleTestEmailConnection()}
                    className="btn-enterprise-save whitespace-nowrap text-xs"
                  >
                    {isTestingEmail ? <Loader2 size={12} className="animate-spin inline mr-1" /> : <Send size={12} className="inline mr-1" />}
                    Send test email
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
