import { Page } from "@/types/page";

export interface PageBackup {
  version: string;
  exported_at: string;
  exported_by?: string;
  pages: Page[];
}

// Export pages as individual markdown files in a zip
export const exportPagesAsMarkdown = async (pages: Page[]): Promise<void> => {
  if (pages.length === 1) {
    // Single page - download as single .md file
    const page = pages[0];
    const markdownContent = `# ${page.title}\n\n${page.content}`;
    const blob = new Blob([markdownContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `${page.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    // Multiple pages - create zip file
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    
    pages.forEach((page) => {
      const markdownContent = `# ${page.title}\n\n${page.content}`;
      const filename = `${page.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
      zip.file(filename, markdownContent);
    });
    
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `pages-export-${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};