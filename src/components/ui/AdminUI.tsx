import './ui.css';

import { Button, type ButtonProps } from './Button';

export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';
export { Dialog } from './Dialog';
export { Field, Input, NumberInput, Select, Switch } from './FormControls';
export {
  DangerZone,
  DataTable,
  EmptyState,
  ErrorState,
  Feedback,
  LoadingState,
  MetricCard,
  PageShell,
  SectionCard,
  StatusBadge,
  StickyActionBar,
} from './Surfaces';
export type { BadgeTone, FeedbackTone } from './Surfaces';

type AdminButtonProps = ButtonProps & {
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaLabel?: string;
};

export function AdminButton({
  ariaControls,
  ariaExpanded,
  ariaLabel,
  ...props
}: AdminButtonProps) {
  return (
    <Button
      {...props}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
    />
  );
}
