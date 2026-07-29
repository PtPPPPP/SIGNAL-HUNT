import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

type FieldProps = {
  children: ReactNode;
  error?: string;
  hint?: string;
  label: string;
  required?: boolean;
};

export function Field({
  children,
  error,
  hint,
  label,
  required = false,
}: FieldProps) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const child = isValidElement(children)
    ? (children as ReactElement<{
        id?: string;
        'aria-describedby'?: string;
        'aria-invalid'?: boolean;
      }>)
    : undefined;
  const control = child
    ? cloneElement(
        child,
        {
          id: child.props.id ?? generatedId,
          'aria-describedby':
            [child.props['aria-describedby'], hint ? hintId : '', error ? errorId : '']
              .filter(Boolean)
              .join(' ') || undefined,
          'aria-invalid': error ? true : child.props['aria-invalid'],
        },
      )
    : children;

  return (
    <div className={`ui-field${error ? ' ui-field--error' : ''}`}>
      <label
        className="ui-field__label"
        htmlFor={
          isValidElement(control)
            ? (control.props as { id?: string }).id
            : undefined
        }
      >
        {label}
        {required ? <span className="ui-field__required" aria-hidden="true" /> : null}
      </label>
      {control}
      {hint ? <span className="ui-field__hint" id={hintId}>{hint}</span> : null}
      {error ? (
        <span className="ui-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = '', ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={`ui-input ${className}`.trim()}
    />
  );
});

export const NumberInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function NumberInput(props, ref) {
  return <Input {...props} ref={ref} type="number" inputMode="numeric" />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = '', ...props }, ref) {
  return (
    <select
      {...props}
      ref={ref}
      className={`ui-select ${className}`.trim()}
    />
  );
});

type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'role'
> & {
  label: string;
  description?: string;
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { checked, className = '', description, id, label, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  return (
    <label className={`ui-switch ${className}`.trim()} htmlFor={controlId}>
      <input
        {...props}
        ref={ref}
        id={controlId}
        type="checkbox"
        role="switch"
        checked={checked}
      />
      <span className="ui-switch__track" aria-hidden="true">
        <span />
      </span>
      <span className="ui-switch__copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
});
