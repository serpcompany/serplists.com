import { createContext, useContext, useState, useSyncExternalStore } from "react";

export type PendingUploads = {
  track: (upload: Promise<unknown>) => void;
  count: () => number;
  subscribe: (listener: () => void) => () => void;
};

export const createPendingUploads = (): PendingUploads => {
  const pending = new Set<Promise<unknown>>();
  const listeners = new Set<() => void>();
  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    track(upload) {
      if (pending.has(upload)) {
        return;
      }

      pending.add(upload);
      notify();
      const settle = () => {
        if (pending.delete(upload)) {
          notify();
        }
      };
      upload.then(settle, settle);
    },
    count: () => pending.size,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const TemplateEditorUploadsContext = createContext<PendingUploads | null>(null);

export const usePendingTemplateEditorUploads = () => {
  const [uploads] = useState(createPendingUploads);
  const pendingCount = useSyncExternalStore(uploads.subscribe, uploads.count, uploads.count);
  return { uploads, pendingCount };
};

export const useTrackTemplateEditorUpload = () =>
  useContext(TemplateEditorUploadsContext)?.track;
