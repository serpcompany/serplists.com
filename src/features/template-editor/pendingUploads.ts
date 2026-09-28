import { createContext, useContext, useState, useSyncExternalStore } from "react";

// Uploads started in the template editor that have not finished. A picked file only
// reaches the form when its upload finishes, so until then Save would store the block
// without it and leaving would drop it. The store lives in the editor page, above the
// upload fields: selecting another task unmounts a field while its upload keeps
// running, and the result still lands in the form (the block is found by id).
export type PendingUploads = {
  // Counts the upload until its promise settles, whether it succeeds or fails.
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

// The editor page owns the store and re-renders as uploads start and finish.
export const usePendingTemplateEditorUploads = () => {
  const [uploads] = useState(createPendingUploads);
  const pendingCount = useSyncExternalStore(uploads.subscribe, uploads.count, uploads.count);
  return { uploads, pendingCount };
};

// Upload fields report their uploads here. Outside the editor nothing is tracked.
export const useTrackTemplateEditorUpload = () =>
  useContext(TemplateEditorUploadsContext)?.track;
