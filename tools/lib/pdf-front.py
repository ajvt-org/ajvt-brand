#!/usr/bin/env python3
"""Replace the first pages of a PDF with pages rendered separately.

    pdf-front.py <whole.pdf> <front.pdf> <out.pdf>

Why this exists: a cover carries no page number, and Chrome renders one footer
template for every page with no way for it to know which page it is on. The
obvious answer — render the cover and the body separately and concatenate — is
wrong, because Chrome writes internal links as NAMED destinations held in the
document catalogue, and every concatenating tool to hand (pdfunite, mutool,
ghostscript) drops the name table or the links with it. A contents page of two
hundred entries then points at nothing.

So nothing is concatenated. The document is rendered once, whole, with its
links, its named destinations and its outline intact, and only the first page
or two are swapped for footerless ones. Everything that makes the document
navigable lives in the catalogue and is never touched.
"""
import sys

from pypdf import PdfReader, PdfWriter


def main(whole: str, front: str, out: str) -> int:
    pages = PdfReader(front).pages
    writer = PdfWriter(clone_from=whole)
    if len(pages) >= len(writer.pages):
        print("front.pdf is not shorter than whole.pdf", file=sys.stderr)
        return 1
    for i, page in enumerate(pages):
        writer.insert_page(page, i)
    for _ in pages:
        del writer.pages[len(pages)]
    with open(out, "wb") as f:
        writer.write(f)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(*sys.argv[1:]))
