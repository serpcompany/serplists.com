import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

type GenerateFromClipyProps = {
  // Receives the draft, which replaces the form in the editor.
  onGenerated: (draft: TemplateEditorFormValues) => void;
  generate?: (url: string) => Promise<{ draft: TemplateEditorFormValues }>;
  // Asked before the request: false keeps the editor (and this field) as it is.
  confirmReplace?: () => boolean;
  // While true the editor is locked, so nothing typed during the request is replaced.
  onGeneratingChange?: (isGenerating: boolean) => void;
};

export function GenerateFromClipy({
  onGenerated,
  generate = (url) => api.generateTemplateFromClipy(url),
  confirmReplace = () => true,
  onGeneratingChange,
}: GenerateFromClipyProps): JSX.Element {
  const [url, setUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The latest request; bumped on unmount, so a draft that arrives after the editor
  // closed (Cancel, or leaving the page) is dropped.
  const requestRef = useRef(0);

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  const setGenerating = (generating: boolean) => {
    setIsGenerating(generating);
    onGeneratingChange?.(generating);
  };

  const handleGenerate = async () => {
    if (!confirmReplace()) {
      return;
    }

    requestRef.current += 1;
    const request = requestRef.current;
    setError(null);
    setGenerating(true);
    try {
      const result = await generate(url);
      if (request === requestRef.current) {
        onGenerated(result.draft);
      }
    } catch (caught) {
      if (request === requestRef.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to generate a template from this Clipy recording.",
        );
      }
    } finally {
      if (request === requestRef.current) {
        setGenerating(false);
      }
    }
  };

  return (
    <section aria-labelledby="clipy-generator-title">
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2" id="clipy-generator-title">
            <Video aria-hidden="true" className="size-4 text-muted-foreground" />
            Generate from Clipy
          </CardTitle>
          <CardDescription>
            Paste a public Clipy video link to fill this editor with an unsaved, editable draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="clipy-video-url">Public Clipy video link</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="clipy-video-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://clipy.online/video/…"
                value={url}
                disabled={isGenerating}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleGenerate();
                  }
                }}
              />
              <Button
                className="sm:shrink-0"
                type="button"
                disabled={isGenerating || !url.trim()}
                onClick={() => void handleGenerate()}
              >
                {isGenerating ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
                {isGenerating ? "Generating…" : "Generate draft"}
              </Button>
            </div>
          </Field>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
