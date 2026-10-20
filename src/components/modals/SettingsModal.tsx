import React, { useState, useEffect } from 'react';
import { Check, X, Smartphone, Mail } from 'lucide-react';
import { SCHOOL_NAME } from '@/lib/constants';
import { getAfricasTalkingConfig } from '@/services/africasTalkingService';
import { getEmailConfig } from '@/services/emailService';

export default function SettingsModal({
  onClose,
  notify,
  adminName,
  defaultChannel,
  onSave,
}: {
  onClose: () => void;
  notify: (message: string) => void;
  adminName?: string | null;
  defaultChannel?: string | null;
  onSave: (settings: { admin_name: string; default_notification_channel: string }) => void;
}) {
  const [name, setName] = useState(adminName ?? '');
  const [channel, setChannel] = useState(defaultChannel ?? 'SMS');
  const atConfig = getAfricasTalkingConfig();
  const emailConfig = getEmailConfig();

  useEffect(() => {
    setName(adminName ?? '');
  }, [adminName]);

  useEffect(() => {
    setChannel(defaultChannel ?? 'SMS');
  }, [defaultChannel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workspace settings"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl border border-slate-300 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#3b2314] text-white border-b-2 border-[#ea580c]">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">School Profile & Settings</h2>
            <p className="text-[11px] text-[#fed7aa] mt-0.5">School Administration Portal</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Institution</label>
            <input value={SCHOOL_NAME} disabled className="form-input w-full bg-slate-100 text-slate-600 font-semibold" />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Administrator Full Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mitali Jean Bosco"
              className="form-input w-full"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Default Notification Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="form-input w-full bg-white font-medium"
            >
              <option value="SMS">SMS (Africa's Talking)</option>
              <option value="Email">Email (Free School Email)</option>
              <option value="Both">Both SMS and Email</option>
            </select>
          </div>

          {/* Integrated Messaging Services Status */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase block">Active Messaging Services</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded border border-slate-200 bg-slate-50 flex items-start gap-2">
                <Smartphone size={15} className="text-[#ea580c] mt-0.5 shrink-0" />
                <div>
                  <strong className="block text-[11px] text-slate-800">Africa's Talking SMS</strong>
                  <span className="text-[10px] text-slate-500">
                    Mode: <span className="font-semibold uppercase text-[#ea580c]">{atConfig.environment}</span>
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50 flex items-start gap-2">
                <Mail size={15} className="text-[#0284c7] mt-0.5 shrink-0" />
                <div>
                  <strong className="block text-[11px] text-slate-800">Free School Email</strong>
                  <span className="text-[10px] text-slate-500">
                    Service: <span className="font-semibold uppercase text-[#0284c7]">{emailConfig.provider}</span>
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
              For help with phone numbers, test messages, or reminders, contact IT.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          <button type="button" onClick={onClose} className="btn-enterprise-cancel">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave({ admin_name: name || 'Administrator', default_notification_channel: channel });
              onClose();
              notify('Settings saved successfully.');
            }}
            className="btn-enterprise-save flex items-center gap-1.5"
          >
            <Check size={14} /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
