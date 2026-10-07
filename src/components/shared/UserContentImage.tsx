type UserContentImageProps = {
  alt: string;
  className: string;
  loading?: 'eager' | 'lazy';
  onError?: () => void;
  src: string;
};

export function UserContentImage({ alt, className, loading, onError, src }: UserContentImageProps) {
  return <img alt={alt} className={className} loading={loading} onError={onError} src={src} />;
}
