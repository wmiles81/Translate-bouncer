from __future__ import annotations

import pytest

from server.docx_io import ParsedDoc, Paragraph
from server.payload import (
    PayloadParseError,
    parse_target_lines,
    render_payload,
)


def test_render_basic_two_paragraph_pair():
    en = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapter 1"),
        Paragraph(style="normal", text="Hello."),
    ])
    fr = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre 1"),
        Paragraph(style="normal", text="Bonjour."),
    ])
    rendered = render_payload(en, fr, source_code="EN", target_code="FR")
    assert rendered == (
        "[1]\n"
        "EN: # Chapter 1\n"
        "FR: # Chapitre 1\n"
        "\n"
        "[2]\n"
        "EN: Hello.\n"
        "FR: Bonjour.\n"
    )


def test_render_inline_markup_passthrough():
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="The *cold* hand.")])
    fr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="La main *froide*.")])
    out = render_payload(en, fr, source_code="EN", target_code="FR")
    assert "EN: The *cold* hand." in out
    assert "FR: La main *froide*." in out


def test_render_paragraph_count_mismatch_raises():
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="a")])
    fr = ParsedDoc(paragraphs=[
        Paragraph(style="normal", text="a"),
        Paragraph(style="normal", text="b"),
    ])
    with pytest.raises(ValueError, match="paragraph count"):
        render_payload(en, fr, source_code="EN", target_code="FR")


def test_parse_target_lines_round_trips_render():
    en = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapter 1"),
        Paragraph(style="normal", text="Hello *there*."),
    ])
    fr = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre 1"),
        Paragraph(style="normal", text="Bonjour *là*."),
    ])
    rendered = render_payload(en, fr, source_code="EN", target_code="FR")
    # Simulate what an Editor would return: only target-language lines.
    editor_response = "\n".join([
        "[1]",
        "FR: # Chapitre Un",
        "",
        "[2]",
        "FR: Salut *là*.",
    ])
    parsed = parse_target_lines(editor_response, target_code="FR", expected_count=2)
    assert parsed.paragraphs[0].style == "heading-1"
    assert parsed.paragraphs[0].text == "Chapitre Un"
    assert parsed.paragraphs[1].style == "normal"
    assert parsed.paragraphs[1].text == "Salut *là*."


def test_parse_target_lines_wrong_count_raises():
    response = "[1]\nFR: only one\n"
    with pytest.raises(PayloadParseError):
        parse_target_lines(response, target_code="FR", expected_count=2)


def test_parse_target_lines_missing_prefix_raises():
    response = "[1]\nXX: wrong prefix\n[2]\nFR: ok\n"
    with pytest.raises(PayloadParseError):
        parse_target_lines(response, target_code="FR", expected_count=2)
