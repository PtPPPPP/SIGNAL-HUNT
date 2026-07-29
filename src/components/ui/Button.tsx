import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className = '',
    disabled,
    loading = false,
    loadingLabel = '处理中…',
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      disabled={disabled || loading}
      type={type}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
});

type IconButtonProps = Omit<ButtonProps, 'children' | 'aria-label'> & {
  'aria-label': string;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className = '', children, ...props }, ref) {
    return (
      <Button
        {...props}
        ref={ref}
        className={`ui-icon-button ${className}`.trim()}
      >
        {children}
      </Button>
    );
  },
);
