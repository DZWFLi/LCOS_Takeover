import { useId } from 'react';

import { TextReaderLine } from './TextReaderLine';

/** Actual GEN1 line-based text body. Plain-text callers retain their raw preformatted view. */
export function Gen1TextDocument({ text, query = '' }: { readonly text: string; readonly query?: string }): React.JSX.Element {
  const idPrefix = useId();
  return (
    <article className="lcos-gen1-reader-document" data-donor-text-reader>
      {text.split(/\r?\n/).map((line, index) => <TextReaderLine key={index} line={line} index={index} query={query} idPrefix={idPrefix} />)}
    </article>
  );
}
