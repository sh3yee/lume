import tokens from '@/styles/tokens.css?inline'
import markdown from '@/features/editor/styles/markdown-content.css?inline'
import code from '@/features/editor/extensions/code-block/styles.css?inline'
import math from '@/features/editor/extensions/math/styles.css?inline'
import toc from '@/features/editor/extensions/toc/styles.css?inline'
import callouts from '@/features/editor/extensions/callouts/styles.css?inline'
import footnotes from '@/features/editor/extensions/footnotes/styles.css?inline'
import mermaid from '@/features/editor/extensions/mermaid/styles.css?inline'
import frontMatter from '@/features/editor/extensions/front-matter/styles.css?inline'
import katex from 'katex/dist/katex.min.css?inline'

export const exportStyles =
  [tokens, markdown, code, math, toc, callouts, footnotes, mermaid, frontMatter, katex].join('\n') +
  `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { color: var(--lume-text-primary); background: var(--lume-bg-surface); }
.lume-export { width: 820px; max-width: 100%; margin: auto; padding: 32px; font: 16px/1.8 var(--lume-font-sans); overflow-wrap: anywhere; }
.lume-export pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.lume-export img, .lume-export svg { max-width: 100%; }
.lume-export img.lume-image-standalone { display: block; margin-inline: auto; }
@page { size: A4; margin: 18mm; }
@media print {
  body { background: white; color: #18233e; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .lume-export { width: auto; padding: 0; }
  pre, blockquote, img, tr, .katex-display { break-inside: avoid; }
  h1, h2, h3, h4 { break-after: avoid; }
}
`
