import React, { useState } from 'react';
import { X } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';
import Button from '@/components/ui/Button';
import type { Contact } from '@/types';

export default function AddContactModal({ onClose, onSave }: { onClose: () => void; onSave: (contact: Omit<Contact, 'id' | 'created_at'>) => void }) {
  const [parentName, setParentName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState('SMS');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Family directory</p>
            <h2>Add contact</h2>
          </div>
          <IconButton onClick={onClose}><X size={19} /></IconButton>
        </div>
        <div className="modal-body">
          <label>Parent name<input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Parent or guardian full name" /></label>
          <label>Student name<input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Student full name" /></label>
          <label>Class<input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. P6A" /></label>
          <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 788 ..." /></label>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" /></label>
          <label>Preferred channel<select value={channel} onChange={(e) => setChannel(e.target.value)}><option>SMS</option><option>WhatsApp</option><option>Email</option></select></label>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!parentName} onClick={() => onSave({ parent_name: parentName, student_name: studentName, class_name: className, phone, email, preferred_channel: channel, status: 'Active' })}>Add contact</Button>
        </div>
      </div>
    </div>
  );
}
