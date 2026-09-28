import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TrackSearchScope } from '../lib/track-tags';

type Scope = TrackSearchScope | 'subcategories';
const options: { value: Scope; label: string; title: string }[] = [
  { value: 'name', label: 'Noms', title: 'Noms' },
  { value: 'tags', label: 'Tags', title: 'Tags' },
  { value: 'subcategories', label: 'SC', title: 'Sous-catégories' },
];

export function SearchScopeControl({ scopes, onToggle, children }: { scopes: Set<Scope>; onToggle: (scope: Scope) => void; children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const id = useId();
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const rect = anchor.current!.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 146)), top: Math.max(8, rect.top - 32) });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(anchor.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  return <div className="search" ref={anchor} onFocus={() => setOpen(true)} onBlur={(event) => {
    const next = event.relatedTarget as Node | null;
    if (!anchor.current?.contains(next) && !panel.current?.contains(next)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === 'ArrowUp' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      panel.current?.querySelector('button')?.focus();
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      anchor.current?.querySelector('input')?.focus();
      setOpen(false);
    }
  }}>
    {children}
    {open && createPortal(<div ref={panel} id={id} className="search-scope search-scope-popover" style={position} role="group" aria-label="Filtres de recherche cumulables">
      {options.map(({ value, label, title }) => <button key={value} type="button" className={scopes.has(value) ? 'active' : ''} aria-pressed={scopes.has(value)} aria-label={title} title={title} onClick={() => onToggle(value)}>{label}</button>)}
    </div>, document.body)}
  </div>;
}
