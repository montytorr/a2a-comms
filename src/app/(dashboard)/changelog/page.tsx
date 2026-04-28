import type { Metadata } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';
import { formatDate } from '@/lib/format-date';
import { FileText } from 'lucide-react';

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

function getSectionTone(type: string): { pill: string; dotColor: string; bg: string; border: string } {
  switch (type.toLowerCase()) {
    case 'added':
      return {
        pill: 'pill--mint',
        dotColor: 'var(--mint)',
        bg: 'var(--mint-bg)',
        border: 'oklch(0.50 0.10 165 / 0.3)',
      };
    case 'changed':
      return {
        pill: 'pill--peri',
        dotColor: 'var(--peri)',
        bg: 'var(--peri-bg)',
        border: 'oklch(0.50 0.08 265 / 0.3)',
      };
    case 'fixed':
      return {
        pill: 'pill--amber',
        dotColor: 'var(--amber)',
        bg: 'var(--amber-bg)',
        border: 'oklch(0.55 0.12 60 / 0.3)',
      };
    default:
      return {
        pill: 'pill--ghost',
        dotColor: 'var(--fg-3)',
        bg: 'var(--bg-2)',
        border: 'var(--line-1)',
      };
  }
}

export default function ChangelogPage() {
  const entries = parseChangelog();

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: 32 }}>
        <div className="row gap-3" style={{ marginBottom: 8 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'var(--peri-bg)',
            border: '1px solid oklch(0.50 0.08 265 / 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <FileText size={15} style={{ color: 'var(--peri)' }} />
          </div>
          <div>
            <p className="upper" style={{ color: 'var(--peri)', marginBottom: 4 }}>Documentation</p>
            <h1 className="h1">Changelog</h1>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
          All notable changes to A2A Comms. Format follows{' '}
          <a
            href="https://keepachangelog.com/en/1.1.0/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--peri)', textDecoration: 'none' }}
            onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            Keep a Changelog
          </a>.
        </p>
      </div>

      {/* Version timeline */}
      <div style={{ position: 'relative' }}>
        {/* Timeline line */}
        <div style={{
          position: 'absolute',
          left: 15,
          top: 16,
          bottom: 16,
          width: 1,
          background: 'linear-gradient(to bottom, var(--peri-bg), var(--line-1), transparent)',
        }} />

        <div className="col gap-3">
          {entries.map((entry, idx) => (
            <div
              key={entry.version}
              className="animate-fade-in"
              style={{ position: 'relative', animationDelay: `${idx * 0.03}s` }}
            >
              {/* Timeline dot */}
              <div style={{
                position: 'absolute',
                left: 11,
                top: 26,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: 'var(--bg-0)',
                border: '2px solid var(--peri)',
                zIndex: 10,
              }} />

              <div className="card" style={{ marginLeft: 40, padding: 24 }}>
                {/* Version header */}
                <div className="row gap-3" style={{ marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: 'var(--peri-bg)',
                    border: '1px solid oklch(0.50 0.08 265 / 0.4)',
                    color: 'var(--peri)',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'var(--mono)',
                    letterSpacing: '-0.01em',
                  }}>
                    v{entry.version}
                  </span>
                  <span className="dim num" style={{ fontSize: 12 }}>
                    {formatDate(entry.date)}
                  </span>
                  {idx === 0 && (
                    <span className="pill pill--mint">Latest</span>
                  )}
                </div>

                {/* Sections */}
                <div className="col gap-3">
                  {entry.sections.map((section, sIdx) => {
                    const tone = getSectionTone(section.type);
                    return (
                      <div key={sIdx}>
                        <div className="row gap-2" style={{ marginBottom: 8 }}>
                          <div style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: tone.dotColor,
                            flexShrink: 0,
                          }} />
                          <span className={`pill ${tone.pill}`}>{section.type}</span>
                        </div>
                        <div style={{
                          borderRadius: 6,
                          background: tone.bg,
                          border: `1px solid ${tone.border}`,
                          padding: '12px 16px',
                        }}>
                          <ul className="col gap-2">
                            {section.items.map((item, iIdx) => (
                              <li key={iIdx} className="row" style={{ alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: tone.dotColor, opacity: 0.6, flexShrink: 0, marginTop: 7 }} />
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
      <div className="animate-fade-in" style={{ marginTop: 32, textAlign: 'center', animationDelay: '0.5s' }}>
        <p className="dim" style={{ fontSize: 11 }}>
          {entries.length} versions tracked · Started {entries.length > 0 ? formatDate(entries[entries.length - 1].date) : 'N/A'}
        </p>
      </div>
    </div>
  );
}
