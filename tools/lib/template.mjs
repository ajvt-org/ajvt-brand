/**
 * A deliberately tiny template language: {{name}}, and {{#name}}...{{/name}}
 * for a block that disappears when the value is empty.
 *
 * Not Handlebars, not EJS. A layout in this repository is edited by whoever
 * needs a new kind of document, and every construct the language has is one
 * more thing that can go wrong in their hands. Two constructs cover every
 * layout here; if a third is ever needed, that is a signal the logic belongs in
 * the build script instead.
 */
export function render(tpl, data) {
  return tpl
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, key, inner) => {
      const v = data[key]
      return v === undefined || v === null || v === '' || v === false ? '' : render(inner, data)
    })
    .replace(/\{\{(\w+)\}\}/g, (m, key) => (data[key] ?? ''))
}

/** Strips the HTML comment a layout opens with, so it never reaches the PDF. */
export const stripLayoutComment = (s) => s.replace(/^\s*<!--[\s\S]*?-->\s*/, '')
