import type { Metadata } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Changelog — A2A Comms',
  description: 'All notable changes to the A2A Comms platform',
};

interface ChangelogEntry {
  version: string;
  date: string;
  sections: { type: string; items: string[] }[];
}

function parseChangelog(): ChangelogEntry[] {
  const content = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8');
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentSection: { type: string; items: string[] } | null = null;

  for (const line of content.split('\n')) {
    // Match version header: ## [1.0.0] - 2026-03-28
    const versionMatch = line.match(/^## \[(.+?)\] - (\d{4}-\d{2}-\d{2})/);
    if (versionMatch) {
      if (current) {
        if (currentSection) current.sections.push(currentSection);
        entries.push(current);
      }
      current = { version: versionMatch[1], date: versionMatch[2], sections: [] };
      currentSection = null;
      continue;
    }

    // Match section header: ### Added / ### Changed / ### Fixed
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && current) {
      if (currentSection) current.sections.push(currentSection);
      currentSection = { type: sectionMatch[1], items: [] };
      continue;
    }

    // Match bullet item: - Some change
    const itemMatch = line.match(/^- (.+)/);
    if (itemMatch && currentSection) {
      currentSection.items.push(itemMatch[1]);
    }
  }

  // Push last entry
  if (current) {
    if (currentSection) current.sections.push(currentSection);
    entries.push(current);
  }

  return entries;
}

function getSectionColor(type: string): { badge: string; dot: string; bg: string; border: string } {
  switch (type.toLowerCase()) {
    case 'added':
      return {
        badge: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/20',
        dot: 'bg-emerald-400',
        bg: 'bg-emerald-500/[0.03]',
        border: 'border-emerald-500/10',
      };
    case 'changed':
      return {
        badge: 'text-blue-400 bg-blue-500/[0.08] border-blue-500/20',
        dot: 'bg-blue-400',
        bg: 'bg-blue-500/[0.03]',
        border: 'border-blue-500/10',
      };
    case 'fixed':
      return {
        badge: 'text-amber-400 bg-amber-500/[0.08] border-amber-500/20',
        dot: 'bg-amber-400',
        bg: 'bg-amber-500/[0.03]',
        border: 'border-amber-500/10',
      };
    default:
      return {
        badge: 'text-gray-400 bg-gray-500/[0.08] border-gray-500/20',
        dot: 'bg-gray-400',
        bg: 'bg-gray-500/[0.03]',
        border: 'border-gray-500/10',
      };
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  const entries = parseChangelog();

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/15 to-blue-600/15 border border-cyan-500/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em]">Documentation</p>
              <h1 className="text-[28px] font-bold text-white tracking-tight">Changelog</h1>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            All notable changes to A2A Comms. Format follows{' '}
            <a
              href="https://keepachangelog.com/en/1.1.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-500/70 hover:text-cyan-400 transition-colors"
            >
              Keep a Changelog
            </a>.
          </p>
        </div>

        {/* Version timeline */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-cyan-500/20 via-white/[0.04] to-transparent hidden sm:block" />

          <div className="space-y-5">
            {entries.map((entry, idx) => (
              <div
                key={entry.version}
                className="relative animate-fade-in"
                style={{ animationDelay: `${idx * 0.03}s` }}
              >
                {/* Timeline dot */}
                <div className="absolute left-[11px] top-[26px] w-[9px] h-[9px] rounded-full bg-[#08080d] border-2 border-cyan-500/40 hidden sm:block z-10" />

                <div className="sm:ml-10 rounded-2xl glass-card p-6">
                  {/* Version header */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-cyan-500/[0.08] border border-cyan-500/20 text-cyan-400 text-[13px] font-bold font-mono tracking-tight">
                      v{entry.version}
                    </span>
                    <span className="text-[12px] text-gray-600 font-medium">
                      {formatDate(entry.date)}
                    </span>
                    {idx === 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                        Latest
                      </span>
                    )}
                  </div>

                  {/* Sections */}
                  <div className="space-y-4">
                    {entry.sections.map((section, sIdx) => {
                      const colors = getSectionColor(section.type);
                      return (
                        <div key={sIdx}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${colors.badge}`}>
                              {section.type}
                            </span>
                          </div>
                          <div className={`rounded-xl ${colors.bg} border ${colors.border} px-4 py-3`}>
                            <ul className="space-y-1.5">
                              {section.items.map((item, iIdx) => (
                                <li key={iIdx} className="flex items-start gap-2 text-[13px] text-gray-400 leading-relaxed">
                                  <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${colors.dot} opacity-60`} />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <p className="text-[11px] text-gray-700">
            {entries.length} versions tracked · Started {entries.length > 0 ? formatDate(entries[entries.length - 1].date) : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}
