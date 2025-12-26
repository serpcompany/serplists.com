import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingSkeletonProps {
  type?: 'card' | 'list' | 'form' | 'table';
  count?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  type = 'card',
  count = 3,
  className = ''
}) => {
  const renderCardSkeleton = () => (
    <div className={`space-y-3 p-4 border rounded-lg ${className}`}>
      <Skeleton className="h-4 w-[250px]" />
      <Skeleton className="h-4 w-[200px]" />
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );

  const renderListSkeleton = () => (
    <div className={`flex items-center space-x-4 p-3 ${className}`}>
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  );

  const renderFormSkeleton = () => (
    <div className={`space-y-4 ${className}`}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );

  const renderTableSkeleton = () => (
    <div className={`space-y-2 ${className}`}>
      <div className="flex space-x-4 border-b pb-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
      {Array.from({ length: count }).map((_, i: number) => (
        <div key={i} className="flex space-x-4 py-2">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[150px]" />
          <Skeleton className="h-4 w-[100px]" />
        </div>
      ))}
    </div>
  );

  const renderSkeleton = () => {
    switch (type) {
      case 'list':
        return renderListSkeleton();
      case 'form':
        return renderFormSkeleton();
      case 'table':
        return renderTableSkeleton();
      default:
        return renderCardSkeleton();
    }
  };

  if (type === 'table' || type === 'form') {
    return renderSkeleton();
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i: number) => (
        <div key={i}>
          {renderSkeleton()}
        </div>
      ))}
    </>
  );
};