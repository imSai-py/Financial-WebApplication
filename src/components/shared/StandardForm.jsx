import { useState, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Loader2 } from 'lucide-react';

/**
 * StandardForm — Declarative, validated form component.
 *
 * Props:
 *   fields          - Array of field definitions (see below)
 *   initialValues   - Object with default values keyed by field.name
 *   onSubmit        - async (values) => void
 *   onCancel        - () => void
 *   submitLabel     - Submit button text (default: 'Submit')
 *   cancelLabel     - Cancel button text (default: 'Cancel')
 *   loading         - Boolean — disables form + shows spinner
 *   columns         - Number of grid columns on desktop (default: 2)
 *   compact         - Boolean — reduce spacing for modal forms
 *
 * Field definition:
 *   { name, label, type, placeholder, required, validation, prefix, suffix,
 *     helpText, gridSpan, disabled, options, rows, min, max, step }
 */
export default function StandardForm({
  fields = [],
  initialValues = {},
  onSubmit,
  onCancel,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  loading = false,
  columns = 2,
  compact = false,
}) {
  const isMobile = useIsMobile();
  const cols = isMobile ? 1 : columns;

  // Build initial state from fields + initialValues
  const [values, setValues] = useState(() => {
    const v = {};
    fields.forEach(f => {
      v[f.name] = initialValues[f.name] ?? (f.type === 'select' ? '' : '');
    });
    return v;
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // ── Validation ──
  const validateField = useCallback((field, value) => {
    if (field.required && (value === '' || value === null || value === undefined)) {
      return `${field.label} is required`;
    }
    if (field.validation) {
      return field.validation(value, values);
    }
    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Invalid email address';
    }
    if (field.type === 'number' || field.type === 'currency') {
      if (value !== '' && isNaN(Number(value))) return 'Must be a number';
      if (field.min !== undefined && Number(value) < field.min) return `Minimum value is ${field.min}`;
      if (field.max !== undefined && Number(value) > field.max) return `Maximum value is ${field.max}`;
    }
    return null;
  }, [values]);

  const validateAll = useCallback(() => {
    const newErrors = {};
    let hasError = false;
    fields.forEach(f => {
      const err = validateField(f, values[f.name]);
      if (err) {
        newErrors[f.name] = err;
        hasError = true;
      }
    });
    setErrors(newErrors);
    // Mark all as touched
    const allTouched = {};
    fields.forEach(f => { allTouched[f.name] = true; });
    setTouched(allTouched);
    return !hasError;
  }, [fields, values, validateField]);

  // ── Handlers ──
  function handleChange(name, value) {
    setValues(prev => ({ ...prev, [name]: value }));
    // Clear error on change if field was touched
    if (touched[name] && errors[name]) {
      const field = fields.find(f => f.name === name);
      if (field) {
        const err = validateField(field, value);
        setErrors(prev => ({ ...prev, [name]: err }));
      }
    }
  }

  function handleBlur(name) {
    setTouched(prev => ({ ...prev, [name]: true }));
    const field = fields.find(f => f.name === name);
    if (field) {
      const err = validateField(field, values[name]);
      setErrors(prev => ({ ...prev, [name]: err }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateAll()) return;
    if (onSubmit) await onSubmit(values);
  }

  // ── Render Field ──
  function renderField(field) {
    const value = values[field.name] ?? '';
    const error = touched[field.name] ? errors[field.name] : null;
    const isDisabled = loading || field.disabled;

    const inputStyle = {
      width: '100%',
      padding: '0.625rem 0.875rem',
      paddingLeft: field.prefix ? '2.25rem' : '0.875rem',
      paddingRight: field.suffix ? '2.25rem' : '0.875rem',
      fontSize: isMobile ? '1rem' : 'var(--text-base)',
      fontFamily: 'inherit',
      color: 'var(--color-text-primary)',
      background: 'var(--color-bg-primary)',
      border: `1px solid ${error ? 'var(--error-color)' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-md)',
      outline: 'none',
      transition: 'all var(--transition-fast)',
      minHeight: isMobile ? 'var(--input-height-mobile)' : 'var(--input-height)',
      opacity: isDisabled ? 0.5 : 1,
    };

    let input;

    if (field.type === 'select') {
      input = (
        <select
          id={`form-${field.name}`}
          value={value}
          onChange={e => handleChange(field.name, e.target.value)}
          onBlur={() => handleBlur(field.name)}
          disabled={isDisabled}
          style={{
            ...inputStyle,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.875rem center',
            paddingRight: '2.5rem',
          }}
        >
          <option value="" disabled>{field.placeholder || `Select ${field.label}...`}</option>
          {(field.options || []).map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    } else if (field.type === 'textarea') {
      input = (
        <textarea
          id={`form-${field.name}`}
          value={value}
          onChange={e => handleChange(field.name, e.target.value)}
          onBlur={() => handleBlur(field.name)}
          disabled={isDisabled}
          placeholder={field.placeholder}
          rows={field.rows || 3}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: 'auto',
          }}
        />
      );
    } else {
      input = (
        <div style={{ position: 'relative' }}>
          {field.prefix && (
            <span style={{
              position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', pointerEvents: 'none',
              fontWeight: 600,
            }}>
              {field.prefix}
            </span>
          )}
          <input
            id={`form-${field.name}`}
            type={field.type === 'currency' ? 'number' : (field.type || 'text')}
            value={value}
            onChange={e => handleChange(field.name, e.target.value)}
            onBlur={() => handleBlur(field.name)}
            disabled={isDisabled}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step || (field.type === 'currency' ? '0.01' : undefined)}
            style={inputStyle}
          />
          {field.suffix && (
            <span style={{
              position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', pointerEvents: 'none',
            }}>
              {field.suffix}
            </span>
          )}
        </div>
      );
    }

    const span = field.gridSpan || 1;

    return (
      <div
        key={field.name}
        style={{
          gridColumn: span >= cols ? '1 / -1' : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? '0.25rem' : '0.375rem',
        }}
      >
        {/* Label */}
        <label
          htmlFor={`form-${field.name}`}
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--label-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          {field.label}
          {field.required && (
            <span style={{ color: 'var(--error-color)', fontWeight: 700 }}>*</span>
          )}
        </label>

        {/* Input */}
        {input}

        {/* Help text or Error */}
        {error ? (
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--error-color)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}>
            ⚠ {error}
          </span>
        ) : field.helpText ? (
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--help-text-color)',
          }}>
            {field.helpText}
          </span>
        ) : null}
      </div>
    );
  }

  // ── Main Render ──
  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Field Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: compact ? '0.75rem' : '1.25rem',
        marginBottom: compact ? '1.25rem' : '1.75rem',
      }}>
        {fields.map(f => renderField(f))}
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column-reverse' : 'row',
        justifyContent: 'flex-end',
        gap: '0.625rem',
      }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            disabled={loading}
            style={{ width: isMobile ? '100%' : undefined }}
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{
            width: isMobile ? '100%' : undefined,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
          {loading ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
