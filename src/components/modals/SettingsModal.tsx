import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { SCHOOL_NAME } from '@/lib/constants';

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
  onSave: (settings: {
    admin_name: string;
    default_notification_channel: string;
  }) => void;
}) {
  const [name, setName] = useState(adminName ?? '');
  const [channel, setChannel] = useState(defaultChannel ?? 'SMS');

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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#3b2314] text-white border-b-2 border-[#ea580c]">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">
              School Profile &amp; Settings
            </h2>
            <p className="text-[11px] text-[#fed7aa] mt-0.5">
              School Administration Portal
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Institution */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              SCHOOL
            </label>
            <input
              value={SCHOOL_NAME}
              disabled
              className="form-input w-full bg-slate-100 text-slate-600 font-semibold"
            />
          </div>

          {/* Administrator */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Administrator Full Name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter administrator's full name"
              className="form-input w-full"
            />
          </div>

          {/* Default notification channel */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Default Notification Channel
            </label>
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              className="form-input w-full bg-white font-medium"
            >
              <option value="SMS">SMS</option>
              <option value="Email">Email</option>
              <option value="Both">SMS and Email</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              This sets the preferred channel for notifications where applicable.
            </p>
          </div>

          <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-3">
            For delivery issues, phone number problems, or messaging service
            changes, contact the school IT administrator.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          <button type="button" onClick={onClose} className="btn-enterprise-cancel">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave({
                admin_name: name.trim() || 'Administrator',
                default_notification_channel: channel,
              });
              onClose();
              notify('Settings saved successfully.');
            }}
            className="btn-enterprise-save flex items-center gap-1.5"
          >
            <Check size={14} />
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}