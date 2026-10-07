export type DownloadableFile = {
  content: string;
  fileName: string;
  type: string;
};

export const downloadFile = ({ content, fileName, type }: DownloadableFile): void => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
