#!/usr/bin/env python3
"""Generate the PoinTrak model outline as Markdown + a Google-Docs-ready .docx.
Pure stdlib (zipfile). The .docx uses Heading1/2/3 styles so Google Docs maps
them to its own headings on import."""
import os, zipfile, html

OUT_DIR = "docs"
os.makedirs(OUT_DIR, exist_ok=True)

# ---- Content: (kind, text). kind in: title,h1,h2,p,b(bullet),note ----
C = [
 ("title", "PoinTrak — Trip Planner: Model & Settings"),
 ("p", "Working outline of the current data model and settings. Edit/expand freely, then send it back."),

 ("h1", "Trip (the container)"),
 ("b", "name, start date, end date"),
 ("b", "collaborators[], items[], suggestions[], checklist[], version, updated"),
 ("b", "Settings (⚙ Trip): name · From/To dates · Who's planning + your identity · Share link · Export / Import · Lock"),
 ("b", "Global config (not per-trip): password · Firebase sync room · OpenRouteService key (bike/walk) · AeroDataBox key (flights) · Transitous (transit, keyless)"),

 ("h1", "Activity / Item — the atom"),
 ("p", "Four types: Hotel stay · Event / activity · Travel / transport · Task / errand."),
 ("h2", "Shared fields (all types)"),
 ("b", "title, date, time (arrival), departTime, arriveDate (overnight), stay (minutes)"),
 ("b", "legMode — how you get to this stop: Car · Transit · Flight · Bike · Walk"),
 ("b", "tz (zone label, auto from flight), location {name, lat, lng, label}"),
 ("b", "notes, done, by (author), comments[]"),
 ("h2", "Per-type behavior"),
 ("b", "Hotel — Check-out date (endDate); hides Departure time / Arrival date / Stay; shows 'until …'"),
 ("b", "Event — date, arrival time, stay duration, departure time, arrival date (no extras)"),
 ("b", "Travel — same as event; if legMode = Flight: multi-segment Flights list, route search, reservation code, seat, class, cost, great-circle map arcs"),
 ("b", "Task — no special fields yet (generic item with a done checkbox)"),
 ("h2", "Derived / behavioral"),
 ("b", "Departure = departTime or arrival + stay → drives 'leave by / arrive' leg pills"),
 ("b", "Map route colored by mode (+ flight arcs); 'Now' anchor dims past & accents Next up; today/free-day markers"),

 ("h1", "Suggestions"),
 ("b", "title, location, notes, by, votes, voters[], accepted, comments[]"),
 ("b", "Vote, then promote to an Event on the timeline"),

 ("h1", "Checklist"),
 ("b", "text, section (collapsible groups), parentId (sub-tasks), assignee, done, by"),

 ("h1", "Travelers"),
 ("b", "Fixed trio: Peter / Niszki / JS (each a color); identity stored per device"),

 ("h1", "Views"),
 ("b", "Overview (dashboard; desktop = card rail + large interactive map)"),
 ("b", "Timeline (All ↔ Day, week strip, free days, now-anchor)"),
 ("b", "Map · Suggestions · Checklist"),

 ("h1", "Open questions for the redesign"),
 ("b", "type vs legMode overlap — should Flight/Transit/Drive be their own types instead of a mode on a generic Travel item?"),
 ("b", "task is undifferentiated — add due time / assignee / category, or merge with checklist?"),
 ("b", "No status — only 'done'. Add planned / booked / wishlist / done?"),
 ("b", "No categories (Museum, Food, Beach…) for filtering / lists / pin colors"),
 ("b", "Hotel doesn't compute nights; events have no real end time (only stay/departTime)"),

 ("h1", "Notes / my edits"),
 ("p", "(Add your thoughts here…)"),
]

# ---------- Markdown ----------
md = []
for kind, text in C:
    if kind == "title": md.append(f"# {text}\n")
    elif kind == "h1": md.append(f"\n## {text}\n")
    elif kind == "h2": md.append(f"\n### {text}\n")
    elif kind == "b": md.append(f"- {text}")
    else: md.append(f"\n{text}\n")
open(os.path.join(OUT_DIR, "PoinTrak-Model.md"), "w").write("\n".join(md) + "\n")

# ---------- DOCX ----------
def esc(t): return html.escape(t, quote=False)
def para(text, style=None):
    pPr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    return f'<w:p>{pPr}<w:r><w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>'

body = []
for kind, text in C:
    if kind == "title": body.append(para(text, "Title"))
    elif kind == "h1": body.append(para(text, "Heading1"))
    elif kind == "h2": body.append(para(text, "Heading2"))
    elif kind == "b": body.append(para("•  " + text, "ListParagraph"))
    else: body.append(para(text))

document = (
 '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
 '<w:body>' + "".join(body) + '<w:sectPr/></w:body></w:document>'
)

def style(sid, name, sz, bold=True, color=None, outline=None):
    rpr = f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
    if bold: rpr += '<w:b/>'
    if color: rpr += f'<w:color w:val="{color}"/>'
    ppr = '<w:spacing w:before="200" w:after="80"/>'
    if outline is not None: ppr += f'<w:outlineLvl w:val="{outline}"/>'
    return (f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{name}"/>'
            f'<w:pPr>{ppr}</w:pPr><w:rPr>{rpr}</w:rPr></w:style>')

styles = (
 '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
 '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
 + style("Title", "Title", 56, True, "1F4E79")
 + style("Heading1", "heading 1", 32, True, "2E74B5", 0)
 + style("Heading2", "heading 2", 26, True, "2E74B5", 1)
 + style("ListParagraph", "List Paragraph", 22, False)
 + '</w:styles>'
)

content_types = (
 '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
 '<Default Extension="xml" ContentType="application/xml"/>'
 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
 '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
 '</Types>'
)
rels = (
 '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
 '</Relationships>'
)
doc_rels = (
 '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
 '</Relationships>'
)

path = os.path.join(OUT_DIR, "PoinTrak-Model.docx")
with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document)
    z.writestr("word/styles.xml", styles)
    z.writestr("word/_rels/document.xml.rels", doc_rels)

print("wrote docs/PoinTrak-Model.md and docs/PoinTrak-Model.docx")
