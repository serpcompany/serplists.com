import { Link } from '@/components/navigation/Link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { profileInitials } from '@/features/profile/profileInitials';
import { buildPublicProfilePath } from '@/lib/routes';
import type { ProfileDirectoryEntry } from '@/lib/schemas/profileDirectory';
import { formatCount } from '@/lib/utils/pluralize';

export function ProfileDirectoryCard({ profile }: { profile: ProfileDirectoryEntry }) {
  const handle = `@${profile.handle}`;
  const title = profile.name ?? handle;

  return (
    <Item
      className="h-full flex-nowrap items-start"
      data-profile-handle={profile.handle}
      render={<Link href={buildPublicProfilePath(profile.handle)} />}
      variant="outline"
    >
      <ItemMedia>
        <Avatar className="size-12">
          <AvatarImage alt="" src={profile.avatar_url ?? undefined} />
          <AvatarFallback>{profileInitials(title)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <h2 className="min-w-0 truncate">{title}</h2>
        </ItemTitle>
        <ItemDescription className="truncate">{handle}</ItemDescription>
        <p className="text-xs text-muted-foreground">
          {formatCount(profile.public_template_count, 'public template')}
        </p>
      </ItemContent>
    </Item>
  );
}
