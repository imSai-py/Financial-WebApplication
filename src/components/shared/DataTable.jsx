import { useState, useMemo } from 'react';
import {
  ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight,
  Download, Loader2, Check, Minus,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useMediaQuery';

/**
 * Enhanced DataTable — responsive, feature-rich data table.
 *
 * Props:
 *   columns          - Array of { header, accessor, render?, hideOnMobile?,
 *                       sortable?, width?, align? }
 *   data             - Array of row objects
 *   searchable       - Enable search bar (default: true)
 *   searchPlaceholder
 *   mobileRender     - (row) => JSX for custom mobile card
 *   emptyMessage     - Message when no data
 *   onRowClick       - (row) => void
 *   loading          - Show skeleton placeholder rows (default: false)
 *   selectable       - Enable checkbox row selection (default: false)
 *   onSelectionChange - (selectedIds[]) => void
 *   exportable       - Show CSV export button (default: false)
 *   exportFilename   - CSV download filename (default: 'export')
 *   stickyHeader     - Stick table header on scroll (default: true)
 *   rowActions       - (row) => JSX — per-row action buttons
 *   perPage          - Items per page (default: 10 desktop, 8 mobile)
 *   idField          - Row ID field key (default: 'id')
 */
export default function DataTable({
  columns,
  data,
  searchable = true,
  searchPlaceholder = 'Search...',
  mobileRender,
  emptyMessage = 'No data found',
  onRowClick,
  loading = false,
  selectable = false,
  onSelectionChange,
  exportable = false,
  exportFilename = 'export',
  stickyHeader = true,
  rowActions,
  perPage: perPageProp,
  idField = 'id',
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const isMobile = useIsMobile();
  const perPage = perPageProp || (isMobile ? 8 : 10);

  // ── Add actions column if rowActions provided ──
  const allColumns = useMemo(() => {
    if (!rowActions) return columns;
    return [
      ...columns,
      {
        header: '',
        accessor: '__actions',
        sortable: false,
        hideOnMobile: true,
        width: 'auto',
        align: 'right',
        render: (row) => rowActions(row),
      },
    ];
  }, [columns, rowActions]);

  function handleSort(key) {
    const col = allColumns.find(c => c.accessor === key);
    if (col && col.sortable === false) return;
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // ── Filter ──
  let filtered = data;
  if (search && searchable) {
    const q = search.toLowerCase();
    filtered = data.filter(row =>
      columns.some(col => {
        const val = col.accessor ? row[col.accessor] : '';
        return String(val).toLowerCase().includes(q);
      })
    );
  }

  // ── Sort ──
  if (sortKey) {
    filtered = [...filtered].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // ── Selection ──
  const allPageSelected = paginated.length > 0 && paginated.every(r => selectedIds.has(r[idField] || r.uid));
  const somePageSelected = paginated.some(r => selectedIds.has(r[idField] || r.uid)) && !allPageSelected;

  function toggleSelectAll() {
    const newSet = new Set(selectedIds);
    if (allPageSelected) {
      paginated.forEach(r => newSet.delete(r[idField] || r.uid));
    } else {
      paginated.forEach(r => newSet.add(r[idField] || r.uid));
    }
    setSelectedIds(newSet);
    onSelectionChange?.(Array.from(newSet));
  }

  function toggleSelectRow(row) {
    const id = row[idField] || row.uid;
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
    onSelectionChange?.(Array.from(newSet));
  }

  // ── CSV Export ──
  function handleExport() {
    const headers = columns.filter(c => c.accessor !== '__actions').map(c => c.header);
    const rows = filtered.map(row =>
      columns.filter(c => c.accessor !== '__actions').map(c => {
        const val = row[c.accessor] ?? '';
        // Escape commas and quotes
        const str = String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      })
    );
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Skeleton Rows ──
  function renderSkeleton() {
    const skeletonCount = perPage;
    if (isMobile) {
      return Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="glass-card" style={{ padding: '1rem 1.125rem' }}>
          {[1, 2, 3].map(j => (
            <div key={j} style={{
              display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem',
            }}>
              <div style={{
                width: '30%', height: 12, borderRadius: 4,
                background: 'var(--color-bg-tertiary)', animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <div style={{
                width: '40%', height: 12, borderRadius: 4,
                background: 'var(--color-bg-tertiary)', animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${j * 0.1}s`,
              }} />
            </div>
          ))}
        </div>
      ));
    }
    return (
      <div style={{
        overflowX: 'auto', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-tertiary)' }}>
              {allColumns.map(col => (
                <th key={col.accessor || col.header} style={{
                  padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600,
                  color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)',
                }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.min(skeletonCount, 5) }, (_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                {allColumns.map((col, ci) => (
                  <td key={ci} style={{ padding: '0.75rem 1rem' }}>
                    <div style={{
                      width: `${50 + Math.random() * 40}%`,
                      height: 14, borderRadius: 4,
                      background: 'var(--color-bg-tertiary)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                      animationDelay: `${(i * allColumns.length + ci) * 0.05}s`,
                    }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Checkbox component ──
  function Checkbox({ checked, indeterminate, onChange, style }) {
    return (
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onChange(); }}
        style={{
          width: isMobile ? 22 : 18, height: isMobile ? 22 : 18,
          minWidth: isMobile ? 22 : 18,
          borderRadius: 4,
          border: `1.5px solid ${checked || indeterminate ? 'var(--color-primary-500)' : 'var(--color-border-hover)'}`,
          background: checked || indeterminate ? 'var(--color-primary-600)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0, flexShrink: 0,
          transition: 'all var(--transition-fast)',
          ...style,
        }}
      >
        {checked && <Check size={12} color="white" strokeWidth={3} />}
        {indeterminate && <Minus size={12} color="white" strokeWidth={3} />}
      </button>
    );
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div>
        {/* Toolbar shimmer */}
        {(searchable || exportable) && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '1rem', gap: '0.75rem',
          }}>
            <div style={{
              width: isMobile ? '100%' : 320, height: isMobile ? 48 : 40,
              borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          </div>
        )}
        {renderSkeleton()}
      </div>
    );
  }

  return (
    <div>
      {/* ── Toolbar: Search + Export ── */}
      {(searchable || exportable || (selectable && selectedIds.size > 0)) && (
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          marginBottom: '1rem',
          gap: '0.75rem',
        }}>
          {/* Search */}
          {searchable && (
            <div style={{ position: 'relative', maxWidth: isMobile ? '100%' : 320, flex: 1 }}>
              <Search size={16} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }} />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="input"
                placeholder={searchPlaceholder}
                style={{
                  paddingLeft: 36,
                  fontSize: isMobile ? '1rem' : 'var(--text-sm)',
                  minHeight: isMobile ? 48 : undefined,
                }}
              />
            </div>
          )}

          {/* Right side: selection count + export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {selectable && selectedIds.size > 0 && (
              <span style={{
                fontSize: 'var(--text-sm)', color: 'var(--color-primary-400)', fontWeight: 500,
              }}>
                {selectedIds.size} selected
              </span>
            )}
            {exportable && (
              <button
                onClick={handleExport}
                className="btn btn-secondary btn-sm"
                style={{ whiteSpace: 'nowrap' }}
              >
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile: Card Layout ── */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {paginated.length === 0 ? (
            <div style={{
              padding: '3rem 1rem', textAlign: 'center',
              color: 'var(--color-text-muted)',
              background: 'var(--color-bg-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
            }}>
              {emptyMessage}
            </div>
          ) : (
            paginated.map((row, i) => (
              <div
                key={row[idField] || row.uid || i}
                onClick={() => onRowClick?.(row)}
                className="glass-card"
                style={{
                  padding: '1rem 1.125rem',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'all var(--transition-fast)',
                  display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                }}
              >
                {selectable && (
                  <Checkbox
                    checked={selectedIds.has(row[idField] || row.uid)}
                    onChange={() => toggleSelectRow(row)}
                    style={{ marginTop: 2 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {mobileRender ? (
                    mobileRender(row)
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      {columns
                        .filter(col => !col.hideOnMobile)
                        .map((col, ci) => (
                          <div key={col.accessor || ci} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            fontSize: ci === 0 ? '0.9375rem' : 'var(--text-sm)',
                            fontWeight: ci === 0 ? 600 : 400,
                            color: ci === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          }}>
                            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                              {col.header}
                            </span>
                            <span>
                              {col.render ? col.render(row) : row[col.accessor] ?? '—'}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                  {/* Mobile row actions */}
                  {rowActions && (
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end', gap: '0.375rem',
                      marginTop: '0.625rem', paddingTop: '0.625rem',
                      borderTop: '1px solid var(--color-border)',
                    }}>
                      {rowActions(row)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Desktop: Traditional Table ── */
        <div style={{
          overflowX: 'auto', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                {selectable && (
                  <th style={{
                    padding: '0.75rem 0.625rem', width: 40,
                    borderBottom: '1px solid var(--color-border)',
                    ...(stickyHeader ? { position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-bg-tertiary)' } : {}),
                  }}>
                    <Checkbox
                      checked={allPageSelected}
                      indeterminate={somePageSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                {allColumns.map(col => (
                  <th
                    key={col.accessor || col.header}
                    onClick={() => col.accessor && col.accessor !== '__actions' && handleSort(col.accessor)}
                    style={{
                      padding: '0.75rem 1rem',
                      textAlign: col.align || 'left',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      cursor: col.sortable !== false && col.accessor !== '__actions' ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      width: col.width || undefined,
                      ...(stickyHeader ? { position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-bg-tertiary)' } : {}),
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                    }}>
                      {col.header}
                      {sortKey === col.accessor && (
                        sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={allColumns.length + (selectable ? 1 : 0)}
                    style={{
                      padding: '2rem', textAlign: 'center',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginated.map((row, i) => {
                  const rowId = row[idField] || row.uid || i;
                  const isSelected = selectedIds.has(rowId);

                  return (
                    <tr
                      key={rowId}
                      onClick={() => onRowClick?.(row)}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        cursor: onRowClick ? 'pointer' : 'default',
                        transition: 'background var(--transition-fast)',
                        background: isSelected ? 'rgba(99, 102, 241, 0.06)' : 'transparent',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-glass)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isSelected ? 'rgba(99, 102, 241, 0.06)' : 'transparent';
                      }}
                    >
                      {selectable && (
                        <td style={{ padding: '0.75rem 0.625rem', width: 40 }}>
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleSelectRow(row)}
                          />
                        </td>
                      )}
                      {allColumns.map(col => (
                        <td key={col.accessor || col.header} style={{
                          padding: '0.75rem 1rem',
                          color: 'var(--color-text-primary)',
                          textAlign: col.align || 'left',
                        }}>
                          {col.render ? col.render(row) : row[col.accessor] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'space-between',
          flexWrap: 'wrap', gap: '0.5rem',
          padding: '0.75rem 0', fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
        }}>
          {!isMobile && (
            <span>
              Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
            >
              <ChevronLeft size={16} />
              {!isMobile && 'Prev'}
            </button>

            {(() => {
              const maxVisible = isMobile ? 3 : 5;
              let start = Math.max(1, page - Math.floor(maxVisible / 2));
              let end = Math.min(totalPages, start + maxVisible - 1);
              if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

              return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
                >
                  {p}
                </button>
              ));
            })()}

            <button
              className="btn btn-ghost btn-sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
            >
              {!isMobile && 'Next'}
              <ChevronRight size={16} />
            </button>
          </div>

          {isMobile && (
            <span style={{ fontSize: 'var(--text-xs)', width: '100%', textAlign: 'center' }}>
              {page} of {totalPages} · {filtered.length} items
            </span>
          )}
        </div>
      )}
    </div>
  );
}
