import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import { api } from "@/lib/api";

interface UserInfoProps {
  userId: string;
  showAvatar?: boolean;
  className?: string;
}

interface UserProfile {
  full_name: string | null;
  username: string | null;
}

export const UserInfo = ({ userId, showAvatar = true, className = "" }: UserInfoProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!userId) {
          setProfile(null);
          return;
        }

        const data = await api.getProfileById(userId);
        setProfile({
          full_name: data.full_name ?? null,
          username: data.username ?? null,
        });
      } catch (error) {
        console.error('Error fetching user profile:', error);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  if (isLoading) {
    return <div className={`text-sm text-muted-foreground ${className}`}>Loading...</div>;
  }

  if (!profile?.username && !profile?.full_name) {
    return <div className={`text-sm text-muted-foreground ${className}`}>Unknown user</div>;
  }

  if (!profile?.username) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        {showAvatar && (
          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
            <User className="h-3 w-3" />
          </div>
        )}
        <span>by {profile.full_name}</span>
      </div>
    );
  }

  return (
    <Link 
      to={`/profile/${profile.username}`}
      className={`flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {showAvatar && (
        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
          <User className="h-3 w-3" />
        </div>
      )}
      <span>
        by {profile.full_name || `@${profile.username}`}
      </span>
    </Link>
  );
};
