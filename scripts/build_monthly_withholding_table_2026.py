from __future__ import annotations

import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

import pdfplumber


OFFICIAL_2026_WITHHOLDING_TABLE_URL = "https://www.law.go.kr/flDownload.do?bylClsCd=110201&flSeq=127372327&gubun="


def ensure_pdf(path_or_url: str) -> Path:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        temp_dir = Path(tempfile.gettempdir())
        pdf_path = temp_dir / "withholding_table_2026_official.pdf"
        urllib.request.urlretrieve(path_or_url, pdf_path)
        return pdf_path
    return Path(path_or_url)


def parse_numeric_token(token: str) -> int:
    return int(token.replace(",", "").strip())


def build_table_rows(pdf_path: Path) -> list[dict]:
    rows: list[dict] = []
    over_10m_base_row: dict[str, int] | None = None

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            lines = (page.extract_text() or "").splitlines()
            for index, raw_line in enumerate(lines):
                line = raw_line.strip()
                if not line:
                    continue

                if re.match(r"^\d[\d,]*\s+\d[\d,]*\s+", line):
                    tokens = line.split()
                    if len(tokens) >= 13 and all(re.match(r"^[\d,]+$", token) for token in tokens[:13]):
                        rows.append(
                            {
                                "min": parse_numeric_token(tokens[0]) * 1000,
                                "max": parse_numeric_token(tokens[1]) * 1000,
                                "rate": 0,
                                "family_monthly_tax": {
                                    str(family_count): parse_numeric_token(tokens[family_count + 1])
                                    for family_count in range(1, 12)
                                },
                                "official": True,
                            }
                        )
                    continue

                if line == "10,000천원" and index + 1 < len(lines):
                    next_line = lines[index + 1].strip()
                    next_tokens = next_line.split()
                    if len(next_tokens) >= 11 and all(re.match(r"^[\d,]+$", token) for token in next_tokens[:11]):
                        over_10m_base_row = {
                            str(family_count): parse_numeric_token(next_tokens[family_count - 1])
                            for family_count in range(1, 12)
                        }

    if over_10m_base_row is None:
        raise RuntimeError("10,000천원 초과 구간의 기준 세액을 추출하지 못했습니다.")

    rows.append(
        {
            "min": 10_000_000,
            "max": None,
            "rate": 0,
            "family_monthly_tax": over_10m_base_row,
            "formula_base_income": 10_000_000,
            "formula_multiplier": 0.95,
            "formula_rate": 0.35,
            "official": True,
        }
    )

    return rows


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else OFFICIAL_2026_WITHHOLDING_TABLE_URL
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/payroll/2026_monthly_withholding_table.json")
    output.parent.mkdir(parents=True, exist_ok=True)

    pdf_path = ensure_pdf(source)
    rows = build_table_rows(pdf_path)
    output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "saved": True,
                "rows": len(rows),
                "output": str(output.resolve()),
                "source": str(source),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
