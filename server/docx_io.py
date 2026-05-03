"""Parse .docx -> ParsedDoc and render ParsedDoc -> .docx.

Inline markup convention:
- *text* for italic
- **text** for bold
- Headings are captured by the `style` field, not inline markup.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from docx import Document
from pydantic import BaseModel


class Paragraph(BaseModel):
    style: str  # "heading-1" .. "heading-6" or "normal"
    text: str


class ParsedDoc(BaseModel):
    paragraphs: List[Paragraph]


def _style_name(p) -> str:
    style = getattr(p, "style", None)
    raw = getattr(style, "name", None) if style is not None else None
    name = (raw or "").lower()
    if name.startswith("heading "):
        try:
            level = int(name.split(" ")[1])
            return f"heading-{level}"
        except (ValueError, IndexError):
            return "normal"
    return "normal"


def _runs_to_marked_text(p) -> str:
    """Encode a paragraph's runs as inline-marked text.

    Adjacent runs sharing the same style are merged. Bold takes precedence
    over italic when both are set.
    """
    out: list[str] = []
    cur_text = ""
    cur_style: tuple[bool, bool] = (False, False)  # (bold, italic)

    def flush():
        if not cur_text:
            return
        bold, italic = cur_style
        if bold:
            out.append(f"**{cur_text}**")
        elif italic:
            out.append(f"*{cur_text}*")
        else:
            out.append(cur_text)

    for run in p.runs:
        style = (bool(run.bold), bool(run.italic))
        if style == cur_style:
            cur_text += run.text
        else:
            flush()
            cur_text = run.text
            cur_style = style
    flush()
    return "".join(out)


def parse_docx(path: Path | str) -> ParsedDoc:
    doc = Document(str(path))
    paras: list[Paragraph] = []
    for p in doc.paragraphs:
        text = _runs_to_marked_text(p)
        if not text.strip():
            continue
        paras.append(Paragraph(style=_style_name(p), text=text))
    return ParsedDoc(paragraphs=paras)


def _emit_runs(p, text: str) -> None:
    """Walk inline markers and append correctly-styled runs to a paragraph."""
    i = 0
    n = len(text)
    while i < n:
        if text.startswith("**", i):
            end = text.find("**", i + 2)
            if end == -1:
                p.add_run(text[i:])
                return
            run = p.add_run(text[i + 2:end])
            run.bold = True
            i = end + 2
        elif text[i] == "*":
            end = text.find("*", i + 1)
            if end == -1:
                p.add_run(text[i:])
                return
            run = p.add_run(text[i + 1:end])
            run.italic = True
            i = end + 1
        else:
            # Find next marker.
            next_star = text.find("*", i)
            chunk_end = next_star if next_star != -1 else n
            p.add_run(text[i:chunk_end])
            i = chunk_end


def write_docx(parsed: ParsedDoc, out_path: Path | str) -> None:
    doc = Document()
    for para in parsed.paragraphs:
        if para.style.startswith("heading-"):
            level = int(para.style.split("-")[1])
            p = doc.add_heading(level=level)
            # add_heading inserts placeholder text; clear and add runs explicitly.
            for r in list(p.runs):
                r.text = ""
            _emit_runs(p, para.text)
        else:
            p = doc.add_paragraph()
            _emit_runs(p, para.text)
    doc.save(str(out_path))
