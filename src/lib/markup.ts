import { Fragment, createElement, type ReactNode } from 'react';

// [\s\S] rather than the `s` flag, which needs an ES2018 compile target.
// The href group only ever matches a literal https:// URL — never attacker-
// or user-controlled, since plan copy is static in-repo text (see below).
const TAG = /<b>([\s\S]*?)<\/b>|<a href="(https:\/\/[^"]*)">([\s\S]*?)<\/a>/g;

/**
 * Render the `<b>`/`<a href="https://...">`-only markup used by the plan copy
 * in data.ts.
 *
 * Replaces dangerouslySetInnerHTML: the content is authored in-repo today, but
 * parsing just the specific tags we actually use means plan text can later
 * become user-editable without opening an XSS hole — this still only ever
 * parses these two fixed tag shapes out of the source string, never executes
 * arbitrary HTML, and the link pattern only accepts an `https://` href.
 */
export function renderBold(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TAG)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    if (match[1] !== undefined) {
      parts.push(createElement('b', { key: key++ }, match[1]));
    } else {
      parts.push(
        createElement(
          'a',
          { key: key++, href: match[2], target: '_blank', rel: 'noopener' },
          match[3]
        )
      );
    }
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return createElement(Fragment, null, ...parts);
}
