import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { Loader2, Video } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <section
      aria-labelledby="clipy-generator-title"
      className="mx-4 mt-4 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <Video aria-hidden="true" className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 id="clipy-generator-title" className="font-medium text-foreground">
            Generate from Clipy
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a public Clipy video link to fill this editor with an unsaved, editable draft.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="clipy-video-url">
              Public Clipy video link
            </label>
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
              type="button"
              disabled={isGenerating || !url.trim()}
              onClick={() => void handleGenerate()}
            >
              {isGenerating ? (
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isGenerating ? "Generating…" : "Generate draft"}
            </Button>
          </div>
          {error ? (
            <Alert className="mt-3" variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </section>
  );
}
