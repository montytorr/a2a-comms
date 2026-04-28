'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutGrid, Activity, FolderKanban, Bot, ScrollText, FileText,
  Search, ArrowRight, Zap, CheckCircle, Settings, Bell, BarChart3,
  Webhook, Heart, BookOpen, Tag, Users, Mail, Shield,
  Power, MessageSquare, Radio,
} from 'lucide-react';

interface PaletteItem {
  id: string;
  label: string;
  href: string;
  kind: string;
  icon: React.ReactNode;
}

const items: PaletteItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', kind: 'Navigate', icon: <LayoutGrid size={14} /> },
  { id: 'live', label: 'Live Feed', href: '/feed', kind: 'Navigate', icon: <Activity size={14} /> },
  { id: 'analytics', label: 'Analytics', href: '/analytics', kind: 'Navigate', icon: <BarChart3 size={14} /> },
  { id: 'projects', label: 'Projects', href: '/projects', kind: 'Navigate', icon: <FolderKanban size={14} /> },
  { id: 'agents', label: 'Agents', href: '/agents', kind: 'Navigate', icon: <Bot size={14} /> },
  { id: 'contracts', label: 'Contracts', href: '/contracts', kind: 'Navigate', icon: <FileText size={14} /> },
  { id: 'messages', label: 'Messages', href: '/messages', kind: 'Navigate', icon: <MessageSquare size={14} /> },
  { id: 'audit', label: 'Audit Log', href: '/audit', kind: 'Navigate', icon: <ScrollText size={14} /> },
  { id: 'webhooks', label: 'Webhooks', href: '/webhooks', kind: 'Navigate', icon: <Webhook size={14} /> },
  { id: 'health', label: 'Health', href: '/webhooks/health', kind: 'Navigate', icon: <Heart size={14} /> },
  { id: 'approvals', label: 'Approvals', href: '/approvals', kind: 'Navigate', icon: <CheckCircle size={14} /> },
  { id: 'protocol', label: 'Protocol Inspector', href: '/protocol-inspector', kind: 'Navigate', icon: <Radio size={14} /> },
  { id: 'kill', label: 'Kill Switch', href: '/kill-switch', kind: 'Navigate', icon: <Power size={14} /> },
  { id: 'settings', label: 'Settings', href: '/settings', kind: 'Navigate', icon: <Settings size={14} /> },
  { id: 'notifications', label: 'Notifications', href: '/notifications', kind: 'Navigate', icon: <Bell size={14} /> },
  { id: 'api', label: 'API Reference', href: '/api-docs', kind: 'Navigate', icon: <Zap size={14} /> },
  { id: 'security', label: 'Security', href: '/security', kind: 'Navigate', icon: <Shield size={14} /> },
  { id: 'human', label: 'Human Guide', href: '/onboarding/human', kind: 'Navigate', icon: <BookOpen size={14} /> },
  { id: 'agent-guide', label: 'Agent Guide', href: '/onboarding/agent', kind: 'Navigate', icon: <BookOpen size={14} /> },
  { id: 'changelog', label: 'Changelog', href: '/changelog', kind: 'Navigate', icon: <Tag size={14} /> },
  { id: 'users', label: 'Users', href: '/users', kind: 'Admin', icon: <Users size={14} /> },
  { id: 'emails', label: 'Email Templates', href: '/admin/emails', kind: 'Admin', icon: <Mail size={14} /> },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: (open: boolean) => void;
}

export const CommandPalette = ({ open, onClose }: CommandPaletteProps) => {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose(!open);
      }
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setQ('');
      setActiveIdx(0);
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const filtered = items.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase()));

  const navigate = (href: string) => {
    router.push(href);
    onClose(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[activeIdx]) {
      navigate(filtered[activeIdx].href);
    }
  };

  return (
    <div
      onClick={() => onClose(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'oklch(0.10 0.012 250 / 0.6)',
        backdropFilter: 'blur(6px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 24px 80px oklch(0 0 0 / 0.5)',
        }}
      >
        <div className="row gap-2" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-1)', alignItems: 'center' }}>
          <Search size={14} style={{ color: 'var(--fg-3)' }} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={e => { setQ(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--fg-0)',
              fontSize: 14,
              fontFamily: 'var(--sans)',
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div style={{ maxHeight: 400, overflow: 'auto', padding: 6 }}>
          {filtered.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                background: idx === activeIdx ? 'var(--bg-2)' : 'transparent',
                border: 'none',
                color: 'var(--fg-1)',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--sans)',
              }}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span style={{ color: 'var(--fg-3)' }}>{item.icon}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{item.label}</span>
              <span className="upper" style={{ fontSize: 9 }}>{item.kind}</span>
              <ArrowRight size={11} style={{ color: 'var(--fg-3)' }} />
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
              No results for &ldquo;{q}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
