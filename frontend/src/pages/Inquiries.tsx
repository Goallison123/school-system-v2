import React, { useState } from 'react';
import { Mail, Phone, Inbox, CheckCircle, Clock, Send } from 'lucide-react';
import type { Inquiry } from '@/types';
import { triggerInquiryAutoReply } from '@/services/automationService';

export default function Inquiries({
  inquiries,
  setInquiries,
  notify,
}: {
  inquiries: Inquiry[];
  setInquiries: (items: Inquiry[]) => void;
  notify: (m: string) => void;
}) {
  const [selected, setSelected] = useState<Inquiry | null>(inquiries[0] ?? null);

  function updateStatus(status: string) {
    if (!selected) return;
    const updated = { ...selected, status };
    setSelected(updated);
    setInquiries(inquiries.map((item) => item.id === selected.id ? updated : item));
    notify(`Inquiry marked as ${status.toLowerCase()}.`);
  }

  return (
    <div className="data-workspace space-y-4">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Visitor Inquiries
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Questions and admission requests sent from the school website
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-1 rounded">
            {inquiries.filter((i) => i.status === 'New').length} Pending
          </span>
        </div>
      </div>

      {/* 2-Column Administrative Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left List Pane */}
        <div className="md:col-span-5 border border-slate-200 rounded divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
          {inquiries.length > 0 ? (
            inquiries.map((inquiry) => (
              <button
                key={inquiry.id}
                type="button"
                onClick={() => setSelected(inquiry)}
                className={`w-full text-left p-3 transition flex items-start gap-3 ${
                  selected?.id === inquiry.id ? 'bg-emerald-50 border-l-4 border-emerald-700' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 grid place-items-center font-bold text-xs shrink-0">
                  {inquiry.visitor_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs font-bold text-slate-900 truncate">{inquiry.visitor_name}</strong>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      inquiry.status === 'New' ? 'bg-amber-100 text-amber-800' :
                      inquiry.status === 'In progress' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {inquiry.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-700 truncate mt-0.5">{inquiry.topic}</p>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{inquiry.message}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Inbox size={24} className="mx-auto mb-2" />
              No visitor inquiries recorded.
            </div>
          )}
        </div>

        {/* Right Detail Pane */}
        <div className="md:col-span-7 border border-slate-200 rounded p-4 flex flex-col justify-between">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selected.visitor_name}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Mail size={12} className="text-slate-400" /> {selected.email}
                    </span>
                    {selected.phone && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Phone size={12} className="text-slate-400" /> {selected.phone}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded font-bold ${
                  selected.status === 'New' ? 'bg-amber-100 text-amber-800' :
                  selected.status === 'In progress' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {selected.status}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Subject / Topic
                </span>
                <p className="text-xs font-semibold text-slate-800">{selected.topic}</p>
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Message Content
                </span>
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 leading-relaxed font-mono whitespace-pre-wrap">
                  {selected.message}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void triggerInquiryAutoReply(selected);
                    notify(`Automated reply sent to ${selected.email}`);
                  }}
                  className="btn-enterprise-cancel inline-flex items-center gap-1 text-slate-700 hover:text-[#ea580c]"
                >
                  <Send size={13} /> Send email reply
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('In progress')}
                  className="btn-enterprise-cancel inline-flex items-center gap-1"
                >
                  <Clock size={13} /> Mark in progress
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('Resolved')}
                  className="btn-enterprise-register inline-flex items-center gap-1"
                >
                  <CheckCircle size={13} /> Mark resolved
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              Select an inquiry on the left to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
