import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type LabeledSelectProps<Option extends string> = {
  className: string;
  id: string;
  label: string;
  labels: Record<Option, string>;
  onValueChange: (value: Option) => void;
  value: Option;
};

export function LabeledSelect<Option extends string>({
  className,
  id,
  label,
  labels,
  onValueChange,
  value,
}: LabeledSelectProps<Option>) {
  const isOption = (candidate: unknown): candidate is Option =>
    typeof candidate === 'string' && Object.prototype.hasOwnProperty.call(labels, candidate);

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={labels}
        value={value}
        onValueChange={(next) => {
          if (isOption(next)) onValueChange(next);
        }}
      >
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries<string>(labels).map(([option, optionLabel]) => (
            <SelectItem key={option} value={option}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
