import { useState, useEffect, useCallback } from "react";
// Supabase removed - using Cloudflare API
import { Page } from "@/types/page";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/CloudflareAuthContext";

export const usePages = () => {
  const [pages, setPages] = useState<Page[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchPages = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // TODO: Replace with Cloudflare API call to fetch pages
      // const { data, error } = await supabase
      //   .from('pages')
      //   .select('*')
      //   .eq('user_id', user.id)
      //   .order('created_at', { ascending: false });

      // if (error) throw error;
      
      // Temporary dummy data while Supabase is disabled
      const formattedPages: Page[] = [];
      
      setPages(formattedPages);
    } catch (error) {
      console.error('Error fetching pages:', error);
      toast({
        title: "Error",
        description: "Failed to fetch pages",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  const createPage = async (title: string, content: string, description?: string) => {
    if (!user) return false;

    setIsLoading(true);
    try {
      // Generate slug from title
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // TODO: Replace with Cloudflare API call to create page
      // const { data, error } = await supabase
      //   .from('pages')
      //   .insert({
      //     title,
      //     content,
      //     description,
      //     slug,
      //     user_id: user.id,
      //     is_public: true // Default to public as per migration
      //   })
      //   .select()
      //   .single();

      // if (error) throw error;

      // Temporary dummy implementation
      toast({
        title: "Info",
        description: "Page creation temporarily disabled - Cloudflare API integration needed",
        variant: "destructive"
      });
      
      return false;
    } catch (error) {
      console.error('Error creating page:', error);
      toast({
        title: "Error",
        description: "Failed to create page",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePage = async (id: string, title: string, content: string, description?: string) => {
    if (!user) return false;

    setIsLoading(true);
    try {
      // Generate slug from title
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // TODO: Replace with Cloudflare API call to update page
      // const { data, error } = await supabase
      //   .from('pages')
      //   .update({
      //     title,
      //     content,
      //     description,
      //     slug
      //   })
      //   .eq('id', id)
      //   .select()
      //   .single();

      // if (error) throw error;

      // Temporary dummy implementation
      toast({
        title: "Info",
        description: "Page update temporarily disabled - Cloudflare API integration needed",
        variant: "destructive"
      });
      
      return false;
    } catch (error) {
      console.error('Error updating page:', error);
      toast({
        title: "Error",
        description: "Failed to update page",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const deletePage = async (id: string) => {
    if (!user) return false;

    setIsLoading(true);
    try {
      // TODO: Replace with Cloudflare API call to delete page
      // const { error } = await supabase
      //   .from('pages')
      //   .delete()
      //   .eq('id', id);

      // if (error) throw error;

      // Temporary dummy implementation
      toast({
        title: "Info",
        description: "Page deletion temporarily disabled - Cloudflare API integration needed",
        variant: "destructive"
      });
      
      return false;
    } catch (error) {
      console.error('Error deleting page:', error);
      toast({
        title: "Error",
        description: "Failed to delete page",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  return {
    pages,
    isLoading,
    createPage,
    updatePage,
    deletePage,
    fetchPages
  };
};