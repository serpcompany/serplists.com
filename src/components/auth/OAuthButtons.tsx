import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { toast } from "sonner";
import { Github, Mail } from "lucide-react";

interface OAuthButtonsProps {
  mode: 'login' | 'register';
}

export const OAuthButtons = ({ mode }: OAuthButtonsProps) => {
  const { signInWithOAuth, signInWithMagicLink } = useAuth();
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [isLoadingOAuth, setIsLoadingOAuth] = useState<string | null>(null);
  const [isLoadingMagicLink, setIsLoadingMagicLink] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);

  const handleOAuthSignIn = async (provider: 'github') => {
    setIsLoadingOAuth(provider);
    try {
      await signInWithOAuth(provider);
    } catch (error) {
      toast.error(`Failed to sign in with ${provider}`);
      console.error(`${provider} OAuth error:`, error);
    } finally {
      setIsLoadingOAuth(null);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicLinkEmail) return;

    setIsLoadingMagicLink(true);
    try {
      const success = await signInWithMagicLink(magicLinkEmail);
      if (success) {
        toast.success("Magic link sent! Check your email.");
        setMagicLinkEmail("");
        setShowMagicLink(false);
      } else {
        toast.error("Failed to send magic link");
      }
    } catch (error) {
      toast.error("Failed to send magic link");
      console.error("Magic link error:", error);
    } finally {
      setIsLoadingMagicLink(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        onClick={() => handleOAuthSignIn('github')}
        disabled={isLoadingOAuth === 'github'}
        className="w-full"
      >
        <Github className="mr-2 h-4 w-4" />
        GitHub
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      {!showMagicLink ? (
        <Button
          variant="outline"
          onClick={() => setShowMagicLink(true)}
          className="w-full"
        >
          <Mail className="mr-2 h-4 w-4" />
          Sign in with Magic Link
        </Button>
      ) : (
        <form onSubmit={handleMagicLink} className="space-y-2">
          <input
            type="email"
            placeholder="Enter your email for magic link"
            value={magicLinkEmail}
            onChange={(e) => setMagicLinkEmail(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            required
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isLoadingMagicLink}
              className="flex-1"
            >
              Send Magic Link
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMagicLink(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};