import React, { useState, useEffect } from 'react';
import { Search, Loader, User, CheckSquare } from 'lucide-react';
import { globalSearch } from '../../services/searchService';
import { useNavigate } from 'react-router-dom';

/**
 * Global Search Overlay attached to the Header.
 */
export default function SearchOverlay({ searchTerm, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await globalSearch(searchTerm);
      setResults(res);
      setLoading(false);
    }, 400); // Debounce by 400ms

    return () => clearTimeout(timer);
  }, [searchTerm]);

  if (!searchTerm || searchTerm.trim().length < 2) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 0.5rem)',
      left: 0,
      width: '100%',
      minWidth: 300,
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
      zIndex: 100,
      overflow: 'hidden',
      maxHeight: 400,
      overflowY: 'auto'
    }}>
      {loading ? (
        <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', color: 'var(--color-primary-500)' }}>
          <Loader size={24} className="animate-spin" />
        </div>
      ) : results.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {results.map((r, i) => (
            <li key={`${r.type}-${r.id}-${i}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <button
                onClick={() => {
                  navigate(r.route);
                  onClose();
                }}
                className="hover-bg-surface"
                style={{
                  width: '100%', textAlign: 'left', padding: '0.75rem 1rem',
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'inherit'
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: r.type === 'user' ? 'var(--color-primary-400)' : 'var(--color-accent-400)'
                }}>
                  {r.type === 'user' ? <User size={16} /> : <CheckSquare size={16} />}
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{r.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{r.subtitle}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          <Search size={24} style={{ opacity: 0.3, margin: '0 auto 0.5rem' }} />
          No results found for "{searchTerm}"
        </div>
      )}
    </div>
  );
}
