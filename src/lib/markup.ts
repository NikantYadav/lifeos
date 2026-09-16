import { Fragment, createElement, type ReactNode } from 'react';

// [\s\S] rather than the `s` flag, which needs an ES2018 compile target.
const BOLD = /<b>([\s\S]*?)<\/b>/g;

/**
 * Render the `<b>`-only markup used by the plan copy in data.ts.
 *
 * Replaces dangerouslySetInnerHTML: the content is authored in-repo today, but
 * parsing just the one tag we actually use means plan text can later become
 * user-editable without opening an XSS hole.
 */
export function renderBold(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(createElement('b', { key: key++ }, match[1]));
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return createElement(Fragment, null, ...parts);
}
