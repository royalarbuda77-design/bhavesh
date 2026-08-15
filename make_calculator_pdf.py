"""Create a compact PDF handout containing calculator.py source code."""
from pathlib import Path

PAGE_WIDTH, PAGE_HEIGHT = 612, 792  # US Letter in PDF points
LEFT, TOP, BOTTOM = 54, 730, 54


def pdf_escape(text):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def stream_for_page(lines):
    parts = ["BT"]
    for font, size, x, y, text in lines:
        parts.extend([
            f"/{font} {size} Tf",
            f"1 0 0 1 {x} {y} Tm",
            f"({pdf_escape(text)}) Tj",
        ])
    parts.append("ET")
    return "\n".join(parts).encode("ascii")


def make_page(title, subtitle, body, code=False, page_number=None):
    lines = [("F1", 18, LEFT, TOP, title)]
    if subtitle:
        lines.append(("F1", 10, LEFT, TOP - 23, subtitle))
    y = TOP - 56
    font = "F2" if code else "F1"
    size = 8.6 if code else 10.5
    leading = 11.5 if code else 15
    for line in body:
        lines.append((font, size, LEFT, y, line if line else " "))
        y -= leading
    if page_number:
        lines.append(("F1", 8, 528, 34, f"Page {page_number}"))
    return stream_for_page(lines)


def build_pdf(pages, output):
    # Object ids: catalog, pages tree, Helvetica, Courier, then pairs of content/page.
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        None,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    ]
    page_ids = []
    for content in pages:
        content_id = len(objects) + 1
        objects.append(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
        page_id = len(objects) + 1
        page_ids.append(page_id)
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_id} 0 R >>".encode("ascii")
        )
    objects[1] = ("<< /Type /Pages /Kids [" + " ".join(f"{n} 0 R" for n in page_ids) + f"] /Count {len(page_ids)} >>").encode("ascii")

    data = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(data))
        data.extend(f"{number} 0 obj\n".encode("ascii"))
        data.extend(obj)
        data.extend(b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    data.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii"))
    output.write_bytes(data)


source = Path("calculator.py").read_text().splitlines()
intro = [
    "This handout contains a complete command-line calculator written in Python 3.",
    "It supports addition, subtraction, multiplication, and division.",
    "",
    "Highlights",
    "- Re-prompts for invalid numeric input.",
    "- Validates the selected operator.",
    "- Handles division by zero without crashing.",
    "- Lets the user perform more than one calculation.",
    "",
    "Run it",
    "1. Save the source as calculator.py.",
    "2. In a terminal, run: python calculator.py",
    "3. Follow the prompts. Enter n when you are finished.",
    "",
    "Source code follows.",
]

pages = [make_page("Python Calculator", "Complete source code and quick-start guide", intro, page_number=1)]
# 53 code rows fit comfortably with a title and footer.
for index in range(0, len(source), 53):
    chunk = [f"{line_no:>3}  {line}" for line_no, line in enumerate(source[index:index + 53], start=index + 1)]
    pages.append(make_page("calculator.py", "Python 3 source code", chunk, code=True, page_number=len(pages) + 1))

build_pdf(pages, Path("python_calculator_code.pdf"))
print("Created python_calculator_code.pdf")
