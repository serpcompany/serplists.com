import type { ChangeEvent, JSX } from 'react';
import { useRef, useState } from 'react';
import { File, LogIn, Upload, X } from 'lucide-react';

import { Link } from '@/components/navigation/Link';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { uploadSelectedFile } from '@/components/ui/file-upload-flow';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { uploadAcceptTypesForBlock } from '@/lib/utils/fileUpload';
import { safeUrl } from '@/lib/utils/safeUrl';
import type { FormAnswer } from '@/types/checklist';

interface FormFileControlProps {
  answer: FormAnswer | undefined;
  describedBy: string | undefined;
  id: string;
  labelledBy: string;
  onChange: (answer: FormAnswer | undefined) => void;
  problem: boolean;
  uploadLoginPath?: string | undefined;
}

export function FormFileControl({
  answer,
  describedBy,
  id,
  labelledBy,
  onChange,
  problem,
  uploadLoginPath,
}: FormFileControlProps): JSX.Element {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const marks = {
    'aria-describedby': describedBy,
    'aria-labelledby': `${labelledBy} ${id}`,
    'data-form-problem': problem ? 'true' : undefined,
    id,
  };
  const file = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : null;

  if (file) {
    const href = safeUrl(file.url);
    const name = file.fileName || file.url;
    return (
      <Item size="sm" variant="outline">
        <ItemMedia variant="icon">
          <File />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="break-all">
            {href ? (
              <a className="underline-offset-4 hover:underline" href={href} rel="noopener noreferrer" target="_blank">
                {name}
              </a>
            ) : (
              name
            )}
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button aria-label={`Remove ${name}`} onClick={() => onChange(undefined)} size="icon-sm" type="button" variant="ghost">
            <X />
          </Button>
        </ItemActions>
      </Item>
    );
  }

  if (uploadLoginPath) {
    return (
      <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={uploadLoginPath} {...marks}>
        <LogIn data-icon="inline-start" />
        Log in to upload
      </Link>
    );
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setIsUploading(true);
    try {
      await uploadSelectedFile({
        file: selected,
        type: 'file',
        onUploaded: (uploaded) =>
          onChange({ url: uploaded.url, fileName: uploaded.fileName ?? selected.name, fileSize: uploaded.fileSize ?? selected.size }),
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        accept={uploadAcceptTypesForBlock('file')}
        className="hidden"
        disabled={isUploading}
        onChange={(event) => void handleFile(event)}
        ref={fileInputRef}
        type="file"
      />
      <Button
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
        {...marks}
      >
        {isUploading ? 'Uploading...' : (
          <>
            <Upload data-icon="inline-start" />
            Upload file
          </>
        )}
      </Button>
    </>
  );
}
