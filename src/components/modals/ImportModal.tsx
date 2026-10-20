import React from 'react';
import { AlertTriangle, ArrowDownToLine, FileSpreadsheet, X } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';
import Button from '@/components/ui/Button';

export default function ImportModal({ onClose, onChoose }: { onClose: () => void; onChoose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Family directory</p>
            <h2>Import contacts</h2>
          </div>
          <IconButton onClick={onClose}><X size={19} /></IconButton>
        </div>
        <div className="modal-body">
          <div className="upload-dropzone">
            <div className="upload-icon"><FileSpreadsheet size={24} /></div>
            <strong>Upload a CSV file</strong>
            <span>Drag and drop or choose a file from your computer.</span>
            <Button variant="secondary" onClick={onChoose}><ArrowDownToLine size={16} /> Choose CSV file</Button>
          </div>
          <div className="format-note"><AlertTriangle size={16} /><span>Your CSV should include: parent name, student name, class, phone, email, preferred channel.</span></div>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
