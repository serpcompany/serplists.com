'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

type PasswordInputProps = Omit<ComponentProps<typeof InputGroupInput>, 'type'> & {
  // A leading icon, such as a lock.
  icon?: ReactNode;
  // What the show and hide button names: "Show password", "Hide confirm password".
  toggleLabel?: string;
};

// A password field with a button that shows or hides what was typed (the shadcn InputGroup).
// Each field shows or hides on its own.
export function PasswordInput({ icon, toggleLabel = 'password', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup>
      <InputGroupInput {...props} type={visible ? 'text' : 'password'} />
      {icon ? <InputGroupAddon>{icon}</InputGroupAddon> : null}
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label={`${visible ? 'Hide' : 'Show'} ${toggleLabel}`}
          onClick={() => setVisible((current) => !current)}
          size="icon-xs"
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
