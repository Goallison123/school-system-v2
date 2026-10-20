import React, { useMemo, useState, useEffect } from 'react';
import { Search, Plus, Globe, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import type { Content } from '@/types';

const perPage = 6;

export default function ContentManager({
  content,
  onAdd,
  onEdit,
  onDelete,
  onPublish,
}: {
  content: Content[];
  onAdd: () => void;
  onEdit: (item: Content) => void;
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'News' | 'Announcement' | 'Gallery'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'Published'>('All');
  const [page, setPage] = useState(1);

  const filteredContent = useMemo(() => {
    const term = search.trim().toLowerCase();
    return content.filter((item) => {
      const matchesType = typeFilter === 'All' || item.content_type === typeFilter;
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesSearch = !term || [
        item.title,
        item.excerpt,
        item.summary,
        item.description,
        item.category,
        item.author,
        item.src,
        item.image_url,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(term));
      return matchesType && matchesStatus && matchesSearch;
    });
  }, [content, search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredContent.length / perPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleContent = filteredContent.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="data-workspace space-y-4">
      {/* Title & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Public Website Content & Media Manager
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Manage school announcements, campus gallery photography, and official news
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={onAdd}
            className="btn-enterprise-register"
          >
            <Plus size={14} /> Create Content
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
        <div className="relative sm:col-span-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search news, gallery items..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="form-input w-full pl-8"
          />
        </div>
        <div>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as 'All' | 'News' | 'Announcement' | 'Gallery'); setPage(1); }}
            className="form-select w-full"
          >
            <option value="All">All Content Types</option>
            <option value="News">News Article</option>
            <option value="Announcement">Announcement</option>
            <option value="Gallery">Campus Gallery</option>
          </select>
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as 'All' | 'Draft' | 'Published'); setPage(1); }}
            className="form-select w-full"
          >
            <option value="All">All Statuses</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleContent.map((item) => (
          <div key={item.id} className="border border-slate-200 rounded p-4 bg-white flex flex-col justify-between hover:border-slate-300 transition">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span className={`status-pill ${item.status === 'Published' ? 'status-pill-paid' : 'status-pill-partial'}`}>
                  {item.status}
                </span>
                <span className="font-mono text-[10px]">{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
              <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider block mb-1">
                {item.content_type} · {item.category || 'General'}
              </span>
              <h3 className="text-sm font-bold text-slate-900 line-clamp-1 mb-1">{item.title}</h3>
              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">
                {item.excerpt || item.summary || item.description || 'No description provided.'}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">By {item.author || 'Admin'}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="p-1 text-slate-500 hover:text-emerald-700 rounded text-xs inline-flex items-center gap-1"
                >
                  <Pencil size={12} /> Edit
                </button>
                {item.status !== 'Published' && (
                  <button
                    type="button"
                    onClick={() => onPublish(item.id)}
                    className="p-1 text-emerald-700 hover:text-emerald-800 font-bold rounded text-xs inline-flex items-center gap-1"
                  >
                    <CheckCircle2 size={12} /> Publish
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded text-xs"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredContent.length === 0 && (
        <div className="p-12 text-center text-slate-400 text-xs border border-slate-200 rounded">
          <Globe size={24} className="mx-auto mb-2 text-slate-300" />
          No website articles or gallery items found matching your filters.
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs text-slate-600">
          <span>Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, filteredContent.length)} of {filteredContent.length}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((c) => Math.max(1, c - 1))}
              className="px-2 py-1 border border-slate-300 rounded disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 py-1 font-mono font-bold">Page {page} / {totalPages}</span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
              className="px-2 py-1 border border-slate-300 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
