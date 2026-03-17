"use client";

import { useMemo, useState } from "react";

import { ChevronLeft, ChevronRight, ExternalLink, Globe } from "lucide-react";

interface SearchResult {
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  date?: string;
}

interface SearchResultsListProps {
  results: SearchResult[];
  className?: string;
}

const PAGE_SIZE = 5;

// Extract URLs and their context from text
export function parseSearchResults(text: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Pattern to find URLs with optional title context
  const urlPattern =
    /(?:(?:\*\*)?([^*\n:]+)(?:\*\*)?(?:[:\s-]+)?)?(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)(\/[^\s\n)]*)?/gi;

  // Also try to find markdown-style links
  const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;

  let match;
  const seenUrls = new Set<string>();

  // First, try markdown links
  while ((match = markdownPattern.exec(text)) !== null) {
    const title = match[1];
    const url = match[2];
    if (!url) continue;
    const domain = new URL(url).hostname.replace("www.", "");

    if (!seenUrls.has(domain)) {
      seenUrls.add(domain);
      results.push({
        title: title || domain,
        url,
        domain,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      });
    }
  }

  // If no markdown links, try to find URLs in text
  if (results.length === 0) {
    const lines = text.split("\n");
    for (const line of lines) {
      // Look for patterns like "* **Title:** description (url)" or "- Title: url"
      const urlMatch = line.match(/https?:\/\/[^\s\)]+/);
      if (urlMatch) {
        const url = urlMatch[0];
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace("www.", "");

          if (!seenUrls.has(domain)) {
            seenUrls.add(domain);

            // Try to extract title from line
            let title = domain;
            const boldMatch = line.match(/\*\*([^*]+)\*\*/);
            if (boldMatch && boldMatch[1]) {
              title = boldMatch[1].replace(/:\s*$/, "");
            } else {
              // Use the text before the URL as title
              const beforeUrl = line.split(url)[0]?.trim();
              if (beforeUrl && beforeUrl.length > 3 && beforeUrl.length < 100) {
                title = beforeUrl.replace(/^[-*•]\s*/, "").replace(/:\s*$/, "");
              }
            }

            results.push({
              title,
              url,
              domain,
              favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
            });
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
    }
  }

  return results;
}

export function SearchResultsList({ results, className }: SearchResultsListProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const displayed = useMemo(
    () => results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [results, page]
  );

  if (results.length === 0) return null;

  return (
    <div className={className || ""}>
      <div className="space-y-1">
        {displayed.map((result, idx) => (
          <a
            key={page * PAGE_SIZE + idx}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5">
            {/* Favicon */}
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
              {result.favicon ? (
                // Use regular img for external favicons (can't whitelist all domains in next.config.js)
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.favicon}
                  alt=""
                  width={20}
                  height={20}
                  className="rounded-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <Globe className="h-4 w-4 text-white/40" />
              )}
            </div>

            {/* Title and domain */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white/90 group-hover:text-white">
                {result.title}
              </div>
              <div className="truncate text-xs text-white/40">
                {result.domain}
                {result.date && ` • ${result.date}`}
              </div>
            </div>

            {/* External link icon */}
            <ExternalLink className="h-4 w-4 flex-shrink-0 text-white/30 group-hover:text-white/60" />
          </a>
        ))}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-2.5">
          <span className="text-xs text-white/30">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, results.length)} of{" "}
            {results.length}
          </span>
          <div className="flex items-center gap-1 text-xs text-white/30">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-0.5 transition-colors hover:text-white/60 disabled:opacity-30">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="rounded p-0.5 transition-colors hover:text-white/60 disabled:opacity-30">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchResultsList;
