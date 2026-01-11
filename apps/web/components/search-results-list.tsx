"use client";

import { ExternalLink, Globe } from "lucide-react";

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
    const domain = new URL(url).hostname.replace("www.", "");

    if (!seenUrls.has(domain)) {
      seenUrls.add(domain);
      results.push({
        title,
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
            if (boldMatch) {
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

export function SearchResultsList({
  results,
  className,
}: SearchResultsListProps) {
  if (results.length === 0) return null;

  return (
    <div className={`space-y-1 ${className || ""}`}>
      {results.slice(0, 10).map((result, idx) => (
        <a
          key={idx}
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
        >
          {/* Favicon */}
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
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
              <Globe className="w-4 h-4 text-white/40" />
            )}
          </div>

          {/* Title and domain */}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white/90 truncate group-hover:text-white">
              {result.title}
            </div>
            <div className="text-xs text-white/40 truncate">
              {result.domain}
              {result.date && ` • ${result.date}`}
            </div>
          </div>

          {/* External link icon */}
          <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-white/60 flex-shrink-0" />
        </a>
      ))}

      {results.length > 10 && (
        <div className="text-xs text-white/40 pl-2">
          +{results.length - 10} more results
        </div>
      )}
    </div>
  );
}

export default SearchResultsList;
