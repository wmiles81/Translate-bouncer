from __future__ import annotations

from pathlib import Path

from server.docx_io import ParsedDoc, Paragraph, parse_docx


def test_parse_returns_heading_and_paragraphs(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-folder" / "ch01.docx")
    assert isinstance(parsed, ParsedDoc)
    assert parsed.paragraphs[0] == Paragraph(style="heading-1", text="Chapter 1")
    assert parsed.paragraphs[1].style == "normal"
    assert parsed.paragraphs[1].text.startswith("The morning when")


def test_parse_encodes_italic_with_single_asterisks(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-folder" / "ch01.docx")
    cold_para = next(p for p in parsed.paragraphs if "cold" in p.text)
    assert "*cold*" in cold_para.text


def test_parse_encodes_bold_with_double_asterisks(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-en-folder" / "ch02.docx")
    letter_para = next(p for p in parsed.paragraphs if "letter" in p.text)
    assert "**letter**" in letter_para.text


def test_parse_preserves_unicode(fixtures_dir: Path) -> None:
    parsed = parse_docx(fixtures_dir / "sample-fr-folder" / "ch01.docx")
    assert any("« Pourquoi moi ? »" in p.text for p in parsed.paragraphs)
