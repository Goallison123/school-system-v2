import React from 'react';
import { Users, Send, GalleryHorizontal, ArrowUpRight, Plus } from 'lucide-react';
import type { Contact, Campaign, View, Content } from '@/types';
import { CATEGORIES } from '@/lib/constants';
import Button from '@/components/ui/Button';

export default function Overview({ contacts, campaigns, content, onNavigate, onCompose }: { contacts: Contact[]; campaigns: Campaign[]; content: Content[]; onNavigate: (v: View) => void; onCompose: () => void }) {
  const sent = campaigns.filter((c) => c.status === 'Sent').length;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Today</p>
          <h1>Welcome back</h1>
          <p className="subheading">Overview of recent activity.</p>
        </div>
        <Button variant="primary" onClick={onCompose}><Plus size={18} /> New notification</Button>
      </div>

      <div className="category-grid">
        {CATEGORIES.map((cat) => {
          const count = campaigns.filter((c) => c.category === cat.id).length;
          const Icon = cat.icon;
          return (
            <button key={cat.id} className={`category-card ${cat.tone}`} onClick={onCompose}>
              <div className="category-icon"><Icon size={20} /></div>
              <div>
                <strong>{cat.label}</strong>
                <span>{count} sent this term</span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          );
        })}
      </div>

      <div className="stats-grid">
        <StatCard label="Parent contacts" value={String(contacts.length)} detail="Total" icon={Users} tone="sky" action={() => onNavigate('contacts')} />
        <StatCard label="Messages delivered" value={String(sent)} detail="Delivered" icon={Send} tone="brown" action={() => onNavigate('campaigns')} />
        <StatCard label="Published content" value={String(content.length)} detail="Across news & gallery" icon={GalleryHorizontal} tone="brown" action={() => onNavigate('content')} />
      </div>
    </>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone, action }: { label: string; value: string; detail: string; icon: typeof Users; tone: string; action: () => void }) {
  return (
    <button className="stat-card" onClick={action}>
      <div className={`stat-icon ${tone}`}><Icon size={19} /></div>
      <div className="stat-label">{label}</div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </button>
  );
}
