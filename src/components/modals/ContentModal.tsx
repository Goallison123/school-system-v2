import React, { useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { galleryImages } from '@/lib/constants';
import type { Content } from '@/types';
import IconButton from '@/components/ui/IconButton';
import Button from '@/components/ui/Button';

export default function ContentModal({ onClose, onSave, initialContent }: { onClose: () => void; onSave: (content: Omit<Content, 'id' | 'created_at'> & Partial<Pick<Content, 'id'>>) => void; initialContent?: Content }) {
  const [title, setTitle] = useState(initialContent?.title ?? '');
  const [type, setType] = useState<'News' | 'Announcement' | 'Gallery'>(initialContent?.content_type ?? 'News');
  const [excerpt, setExcerpt] = useState(initialContent?.excerpt ?? initialContent?.summary ?? initialContent?.description ?? '');
  const [date, setDate] = useState(initialContent?.date ?? '');
  const [author, setAuthor] = useState(initialContent?.author ?? '');
  const [readTime, setReadTime] = useState(initialContent?.read_time ?? '');
  const [imageUrl, setImageUrl] = useState(initialContent?.image_url ?? initialContent?.src ?? '');

  const isGallery = type === 'Gallery';

  return (
    <section role="dialog" aria-modal="true" aria-label={initialContent ? 'Edit content' : 'Create content'} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col overflow-y-auto border-l border-[#EAE5DC] bg-white shadow-2xl">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Connected website</p>
            <h2>{initialContent ? 'Edit content' : 'Create content'}</h2>
          </div>
          <IconButton onClick={onClose}><X size={19} /></IconButton>
        </div>
        <div className="modal-body flex-1">
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your update a clear title" /></label>
          <label>Content type<select value={type} onChange={(e) => setType(e.target.value as 'News' | 'Announcement' | 'Gallery')}><option>News</option><option>Announcement</option><option>Gallery</option></select></label>
          {isGallery ? (
            <label>Image URL<input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Enter gallery image URL" /></label>
          ) : (
            <>
              <label>Date<input value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" /></label>
              <label>Author<input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Admin name or author" /></label>
              <label>Read time<input value={readTime} onChange={(e) => setReadTime(e.target.value)} placeholder="e.g. 3 min read" /></label>
            </>
          )}
          <label>{isGallery ? 'Caption / description' : 'Summary'}<textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder={isGallery ? 'Describe the image' : 'Write a short summary for the article...'} rows={4} /></label>
          <div className="attachment-button"><Paperclip size={16} /> Add cover image <span>Optional</span></div>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!title || !excerpt}
            onClick={() => onSave({
              ...(initialContent ? { id: initialContent.id } : {}),
              title,
              content_type: type,
              excerpt,
              image_url: imageUrl || initialContent?.image_url || initialContent?.src || galleryImages[Math.floor(Math.random() * galleryImages.length)],
              src: isGallery ? (imageUrl || initialContent?.src || galleryImages[Math.floor(Math.random() * galleryImages.length)]) : undefined,
              date: isGallery ? undefined : date || new Date().toISOString().split('T')[0],
              author: isGallery ? undefined : author || 'Administrator',
              read_time: isGallery ? undefined : readTime,
              category: type,
              description: excerpt,
              summary: excerpt,
              content: isGallery ? [] : [excerpt],
              status: initialContent?.status ?? 'Draft',
            })}
          >
            {initialContent ? 'Save changes' : 'Save as draft'}
          </Button>
        </div>
    </section>
  );
}
