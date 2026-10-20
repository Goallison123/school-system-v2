import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Campaign, Contact, Content, Inquiry, View } from '@/types';
import { SCHOOL_NAME } from '@/lib/constants';

type Role = 'dean_of_studies' | 'headteacher' | 'teacher' | 'it' | 'unknown';
type Metric = { label: string; value: string; detail: string; destination?: View };

export default function HeadmasterOverview({
  contacts,
  campaigns,
  content,
  inquiries,
  adminName,
  adminRole,
  onNavigate,
}: {
  contacts: Contact[];
  campaigns: Campaign[];
  content: Content[];
  inquiries: Inquiry[];
  adminName: string;
  adminRole: Role;
  onNavigate: (view: View) => void;
}) {
  const role = adminRole;
  const roleName = role === 'dean_of_studies' ? 'Dean of Studies'
    : role === 'headteacher' ? 'Headteacher'
      : role === 'it' ? 'IT administrator' : 'School staff';
  const classCount = new Set(contacts.map((contact) => contact.class_name).filter(Boolean)).size;
  const sentNotices = campaigns.filter((campaign) => campaign.status.toLowerCase() === 'sent').length;
  const recentCampaigns = useMemo(() => campaigns.slice(0, 5), [campaigns]);

  const metrics: Metric[] = role === 'headteacher'
    ? [
        { label: 'Students in the school register', value: contacts.length.toLocaleString(), detail: 'Across all classes' },
        { label: 'Parent notices sent', value: sentNotices.toLocaleString(), detail: 'View notice history', destination: 'campaigns' },
        { label: 'Notices being prepared', value: campaigns.filter((item) => item.status.toLowerCase() !== 'sent').length.toLocaleString(), detail: 'View notices', destination: 'campaigns' },
        { label: 'Classes with students', value: classCount.toLocaleString(), detail: 'In the school register' },
      ]
    : [
        { label: 'Students in the school register', value: contacts.length.toLocaleString(), detail: 'Open student register', destination: 'students' },
        { label: 'Classes in the school register', value: classCount.toLocaleString(), detail: 'Open student register', destination: 'students' },
        { label: 'Parent notices sent', value: sentNotices.toLocaleString(), detail: 'View notice history', destination: 'campaigns' },
        { label: 'Website updates', value: content.length.toLocaleString(), detail: 'Manage school news', destination: 'content' },
        { label: 'Visitor questions', value: inquiries.length.toLocaleString(), detail: 'View questions', destination: 'inquiries' },
      ];

  const quickActions: { label: string; destination: View }[] = role === 'headteacher'
    ? [
        { label: 'Review mid-term reports', destination: 'midterm' },
        { label: 'Send a parent notice', destination: 'campaigns' },
      ]
    : role === 'it'
      ? [
          { label: 'Manage staff roles', destination: 'users' },
          { label: 'Open the student register', destination: 'students' },
          { label: 'Review mid-term marks', destination: 'midterm' },
        ]
      : [
          { label: 'Open the student register', destination: 'students' },
          { label: 'Review mid-term marks', destination: 'midterm' },
          { label: 'View parent contacts', destination: 'contacts' },
          { label: 'Update school news', destination: 'content' },
        ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#ea580c]">{roleName}</p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900 sm:text-3xl">
          {role === 'headteacher' ? 'School overview' : role === 'it' ? 'Staff and school overview' : 'Academic overview'}
        </h1>
        <p className="mt-2 text-sm text-stone-600">Good day, {adminName}. Here’s the latest from {SCHOOL_NAME}.</p>
      </header>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="font-semibold text-stone-900">School at a glance</h2>
          <p className="mt-1 text-sm text-stone-500">Current totals from your school records.</p>
        </div>
        <div className="system-table-wrap rounded-none border-0">
          <table className="system-table">
            <thead><tr><th>What you can check</th><th>Total</th><th>Next step</th></tr></thead>
            <tbody>
              {metrics.map((metric) => {
                const destination = metric.destination;
                return (
              <tr key={metric.label}>
                <td className="font-semibold">{metric.label}</td>
                <td>{metric.value}</td>
                <td>
                  {destination ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(destination)}
                      className="inline-flex items-center gap-1 font-semibold text-[#c2410c] hover:text-[#9a3412]"
                    >
                      {metric.detail} <ArrowRight size={14} />
                    </button>
                  ) : <span className="text-stone-500">{metric.detail}</span>}
                </td>
              </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-stone-900">Quick links</h2>
        <div className="mt-3 divide-y divide-stone-100">
          {quickActions.map((action) => (
            <button
              key={action.destination}
              type="button"
              onClick={() => onNavigate(action.destination)}
              className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-stone-700 hover:text-[#c2410c]"
            >
              {action.label}<ArrowRight size={15} />
            </button>
          ))}
        </div>
      </section>

      {role !== 'headteacher' && (
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-stone-900">Recent parent notices</h2>
              <p className="mt-1 text-sm text-stone-500">The latest notices saved by your school.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#c2410c]"
            >
              View notices <ArrowRight size={14} />
            </button>
          </div>
          {recentCampaigns.length ? (
            <div className="system-table-wrap rounded-none border-0">
              <table className="system-table">
                <thead><tr><th>Notice</th><th>Category</th><th>Recipients</th><th>Status</th></tr></thead>
                <tbody>
                  {recentCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <strong className="block text-stone-900">{campaign.title}</strong>
                        <span className="block max-w-md truncate text-xs text-stone-500">{campaign.message}</span>
                      </td>
                      <td>{campaign.category}</td>
                      <td>{campaign.recipient_count.toLocaleString()}</td>
                      <td>{campaign.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-sm text-stone-600">No parent notices yet. When one is saved, it will appear here.</p>
          )}
        </section>
      )}
    </div>
  );
}
