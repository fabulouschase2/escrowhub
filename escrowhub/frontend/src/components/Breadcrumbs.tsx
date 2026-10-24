import React from 'react';
import { Link } from 'react-router-dom';

interface Crumb {
  name: string;
  path: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
}

// Visible breadcrumb trail matching the BreadcrumbList JSON-LD emitted by seo.ts
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-apple-muted/50" aria-hidden="true">/</span>}
              {isLast ? (
                <span className="text-white font-medium" aria-current="page">{crumb.name}</span>
              ) : (
                <Link to={crumb.path} className="text-apple-muted hover:text-white transition-colors">
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
