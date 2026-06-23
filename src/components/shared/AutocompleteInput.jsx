import { useState, useRef, useEffect } from 'react';

/**
 * Premium Searchable Dropdown / Autocomplete Input Component
 * Styled to match light/dark glassmorphic themes.
 */
export default function AutocompleteInput({
  value = '',
  onChange,
  suggestions = [],
  placeholder = '',
  name = '',
  id = '',
  disabled = false,
  error = '',
  style = {},
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const containerRef = useRef(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions when input changes or when value changes
  useEffect(() => {
    if (!value) {
      setFilteredSuggestions(suggestions.slice(0, 10));
      return;
    }

    const query = value.toLowerCase();
    const filtered = suggestions.filter(item =>
      item.toLowerCase().includes(query)
    );
    setFilteredSuggestions(filtered.slice(0, 10));
  }, [value, suggestions]);

  function handleInputChange(e) {
    const val = e.target.value;
    onChange({ target: { name, value: val } });
    setShowSuggestions(true);
    setActiveSuggestionIndex(-1);
  }

  function handleSuggestionClick(suggestion) {
    onChange({ target: { name, value: suggestion } });
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
  }

  function handleKeyDown(e) {
    if (!showSuggestions) {
      if (e.key === 'ArrowDown') {
        setShowSuggestions(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev =>
        prev < filteredSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < filteredSuggestions.length) {
        handleSuggestionClick(filteredSuggestions[activeSuggestionIndex]);
      } else {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <input
        type="text"
        id={id}
        name={name}
        className={`input ${error ? 'input-error' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 999,
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '4px 0',
            listStyle: 'none',
            margin: 0,
          }}
        >
          {filteredSuggestions.map((suggestion, index) => {
            const isActive = index === activeSuggestionIndex;
            return (
              <li
                key={suggestion}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSuggestionClick(suggestion)}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                style={{
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  color: isActive ? '#ffffff' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  background: isActive ? 'var(--color-primary-600)' : 'transparent',
                  transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}
              >
                {suggestion}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
