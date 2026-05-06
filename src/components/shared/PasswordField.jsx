import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordField({
  leftIcon: LeftIcon,
  leftIconSize = 16,
  className = 'input',
  style = {},
  buttonStyle = {},
  inputRef = null,
  ...inputProps
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      {LeftIcon && (
        <LeftIcon
          size={leftIconSize}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-muted)',
            pointerEvents: 'none',
          }}
        />
      )}

      <input
        {...inputProps}
        ref={inputRef}
        className={className}
        type={isVisible ? 'text' : 'password'}
        style={{
          paddingLeft: LeftIcon ? 38 : undefined,
          paddingRight: 48,
          ...style,
        }}
      />

      <button
        type="button"
        onClick={() => setIsVisible((prev) => !prev)}
        onMouseDown={(event) => event.preventDefault()}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          padding: 8,
          minWidth: 40,
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          ...buttonStyle,
        }}
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
