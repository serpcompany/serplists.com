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
  icon?: ReactNode;
  toggleLabel?: string;
};

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
