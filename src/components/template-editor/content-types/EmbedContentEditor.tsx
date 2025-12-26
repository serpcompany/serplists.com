import { EmbedField } from "@/components/ui/embed-field";

interface EmbedContentEditorProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const EmbedContentEditor = ({ value, onValueChange }: EmbedContentEditorProps) => {
  return (
    <div>
      <EmbedField
        value={value}
        onValueChange={onValueChange}
      />
    </div>
  );
};