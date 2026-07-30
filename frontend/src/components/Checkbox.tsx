import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  id?: string;
}

export function Checkbox({ checked, onCheckedChange, label, id = 'checkbox' }: CheckboxProps) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-body-m text-text-secondary cursor-pointer select-none">
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className={cn(
          'h-4 w-4 rounded-sm border border-border bg-surface flex items-center justify-center',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=checked]:bg-primary data-[state=checked]:border-primary'
        )}
      >
        <RadixCheckbox.Indicator>
          <Check className="h-3 w-3 text-white" />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label}
    </label>
  );
}
