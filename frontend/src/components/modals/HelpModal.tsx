import React from 'react';
import { GalleryHorizontal, Inbox, Megaphone, Users, X } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';
import Button from '@/components/ui/Button';

export default function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Support</p>
            <h2>Help center</h2>
          </div>
          <IconButton onClick={onClose}><X size={19} /></IconButton>
        </div>
        <div className="modal-body">
          <div className="help-item"><Megaphone size={18} /><div><strong>Creating notifications</strong><p>Choose a category, write your message, select channels and send or schedule.</p></div></div>
          <div className="help-item"><Users size={18} /><div><strong>Importing contacts</strong><p>Use a CSV with columns: parent name, student name, class, phone, email, preferred channel.</p></div></div>
          <div className="help-item"><GalleryHorizontal size={18} /><div><strong>Website content</strong><p>Create news, announcements and gallery items. Publish to push them live.</p></div></div>
          <div className="help-item"><Inbox size={18} /><div><strong>Visitor inquiries</strong><p>Reply to inquiries and mark them as in progress or resolved.</p></div></div>
        </div>
        <div className="modal-footer"><Button variant="primary" onClick={onClose}>Close</Button></div>
      </div>
    </div>
  );
}
