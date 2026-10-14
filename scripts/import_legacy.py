"""Rebuild the Techies seed from archived legacy HTML. Run with --check to test conversion.

First run downloads public source pages; subsequent runs use seed/source snapshots.
No running CMS database is modified by this script.
"""
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://apactechies.vercel.app/"
VOID = {"img", "br", "hr", "meta", "link", "input", "source"}


class Node:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def find(self, tag):
        for child in self.children:
            if isinstance(child, Node):
                if child.tag == tag:
                    yield child
                yield from child.find(tag)

    def text(self):
        return re.sub(r"\s+", " ", "".join(c.text() if isinstance(c, Node) else c for c in self.children)).strip()


class Parser(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)


def key(value):
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def spans(node, definitions, marks=()):
    result = []
    for child in node.children:
        if isinstance(child, str):
            text = re.sub(r"\s+", " ", child)
            if text:
                result.append({"_type": "span", "text": text, "marks": list(marks)})
        elif child.tag == "br":
            result.append({"_type": "span", "text": "\n", "marks": list(marks)})
        elif child.tag in {"svg", "script", "style", "img"}:
            continue
        else:
            extra = {"strong": "strong", "b": "strong", "em": "em", "i": "em", "code": "code"}.get(child.tag)
            if child.tag == "a" and child.attrs.get("href"):
                href = urljoin(ORIGIN, child.attrs["href"])
                extra = "link-" + key(href)
                definitions.append({"_key": extra, "_type": "link", "href": href})
                if not child.text():
                    label = child.attrs.get("title", "Website")
                    result.append({"_type": "span", "text": label, "marks": [*marks, extra]})
                    continue
            result.extend(spans(child, definitions, (*marks, extra) if extra else marks))
    return result


def block(node, style="normal", list_type=None, level=1):
    definitions = []
    children = spans(node, definitions)
    result = {"_type": "block", "style": style, "children": children, "markDefs": definitions}
    if list_type:
        result.update(listItem=list_type, level=level)
    return result


def portable(node, level=0):
    """Preserve semantic HTML, inline links, figures, nested lists and embedded-media links."""
    blocks = []
    skip_classes = {"topic-number", "ops-emoji", "roast-page-hero"}
    if node.tag in {"nav", "footer", "script", "style", "svg"} or skip_classes.intersection(node.attrs.get("class", "").split()):
        return blocks
    if node.tag == "img":
        if "roast-page-logo" not in node.attrs.get("class", ""):
            blocks.append({"_type": "image", "asset": {"$media": {"url": urljoin(ORIGIN, node.attrs["src"]), "alt": node.attrs.get("alt", "")}}, "alt": node.attrs.get("alt", "")})
    elif "speaker-tags" in node.attrs.get("class", "").split():
        wrapper = Node()
        wrapper.children = [" · ".join(c.text() for c in node.children if isinstance(c, Node))]
        blocks.append(block(wrapper))
    elif node.tag in {"iframe", "video", "source"}:
        media_source = node.attrs.get("src") or next((n.attrs.get("src") for n in node.find("source")), None)
        if media_source:
            link = Node("a", [("href", media_source)])
            link.children = [node.attrs.get("title", "Watch the demo")]
            wrapper = Node()
            wrapper.children = [link]
            blocks.append(block(wrapper))
    elif node.tag in {"p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "dt", "dd"}:
        if node.text():
            blocks.append(block(node, node.tag if node.tag.startswith("h") or node.tag == "blockquote" else "normal"))
    elif node.tag in {"ul", "ol"}:
        for li in node.children:
            if isinstance(li, Node) and li.tag == "li":
                shallow = Node()
                shallow.children = [c for c in li.children if not isinstance(c, Node) or c.tag not in {"ul", "ol"}]
                blocks.append(block(shallow, list_type="bullet" if node.tag == "ul" else "number", level=level + 1))
                for c in li.children:
                    if isinstance(c, Node) and c.tag in {"ul", "ol"}:
                        blocks.extend(portable(c, level + 1))
    elif node.tag == "pre":
        blocks.append({"_type": "code", "code": "".join(c if isinstance(c, str) else c.text() for c in node.children), "language": "text"})
    else:
        inline = []
        for c in node.children:
            if isinstance(c, str) or c.tag in {"span", "a", "strong", "b", "em", "code"}:
                inline.append(c)
            else:
                if inline:
                    wrapper = Node()
                    wrapper.children = inline
                    if wrapper.text() or list(wrapper.find("a")):
                        blocks.append(block(wrapper))
                    inline = []
                blocks.extend(portable(c, level))
        if inline:
            wrapper = Node()
            wrapper.children = inline
            if wrapper.text() or list(wrapper.find("a")):
                blocks.append(block(wrapper))
    return blocks


def source(name):
    path = ROOT / "seed" / "source" / name
    if not path.exists():
        request = Request(urljoin(ORIGIN, name), headers={"User-Agent": "Techies content migration"})
        with urlopen(request, timeout=45) as response:
            html = response.read().decode()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html)
    return Parser(path.read_text()).root


def image(url, alt):
    return {"$media": {"url": urljoin(ORIGIN, url), "alt": alt}}


def field(slug, label, kind="string", **options):
    return dict(slug=slug, label=label, type=kind, **options)


def collection(slug, label, fields, url):
    return {"slug": slug, "label": label, "labelSingular": label.rstrip("s"), "urlPattern": url, "supports": ["drafts", "revisions", "preview", "search", "seo"], "fields": fields}


def entry(slug, data, status="published", **other):
    return dict(id=slug, slug=slug, status=status, data=data, **other)


def member_profiles():
    """Curated introductions; identity, photos, links and topics come from Roast #2–#7."""
    introductions = {
        "Marcus Liang": ("Marcus presented Harwav Order Hub at Roast #2, connecting user feedback to an AI-assisted software repair workflow with human validation before deployment.", "Harwav Order Hub: chatbot feedback becomes GitHub issues, then AI-generated fixes for a human to review."),
        "Ee One Lim": ("Ee One brought two builds to the room: Kantaro, which teaches Spanish through music, and Care Compass, which helps caregivers find support resources.", "Kantaro, a music-based Spanish learning app, and Care Compass, a caregiver resource app using retrieval-augmented generation."),
        "Jesse Sng": ("Jesse shared Drag Flow at Roast #2 and an AI content pipeline at Roast #6, exploring visual automation and reliable generation across multiple media formats.", "Drag Flow, a drag-and-drop workflow tool, and a pipeline that turns source material into podcasts, blogs, images and audio in parallel."),
        "Abdelrahman Fliou": ("Abdelrahman presented TransPrice at Roast #3, exploring how document parsing and deterministic analysis can support an AI pricing copilot.", "TransPrice: a pricing copilot that turns PDFs into Markdown for downstream model work."),
        "Gaurav Kumar Manek": ("Gaurav shared the immutable storage architecture of his previous startup, Visigoth.ai, at Roast #3, then returned at Roast #6 to discuss evaluating AI agents and bounding their blast radius.", "Visigoth.ai’s storage architecture, shared from a previous startup, and evaluation approaches for AI agents."),
        "Arul Kumaran": ("Arul presented a programmatic video toolchain at Roast #3, combining React-based rendering, local voice cloning, media processing and open-weight models.", "A programmatic video workflow using Remotion, Voicebox, FFmpeg and Gemma for rendering, audio and video summarisation."),
        "Ying Zhao": ("Ying shared a personal LinkedIn analytics pipeline at Roast #4, applying production-style data engineering to understand reach and performance.", "A LinkedIn analytics pipeline built with Databricks and a medallion architecture, with attention to ETL, retries and query trade-offs."),
        "Kaleb Nim": ("Kaleb presented Voice Resume at Roast #4, exploring a conversational way for employers to ask questions and receive real-time answers from a resume.", "Voice Resume: an AI-powered interview app with speech recognition, spoken responses and application guardrails."),
        "Richard Lee": ("Richard shared a multi-agent system for finding business opportunities at Roast #5, including lessons on grounding, orchestration and avoiding unnecessary complexity.", "A business-opportunity discovery system with an executive agent coordinating siloed, purpose-built child agents."),
        "Alec Teo": ("Alec presented PixelPuggles at Roast #5, bringing questions about authentication, data design and agent-friendly interfaces to an image app.", "PixelPuggles: an app that pixelates and animates photos, with image-generation cost and evaluation among the design questions."),
        "Dalton Prescott Ng": ("Dalton presented pgGraph at Roast #5, exploring how graph capabilities can live in Postgres and help AI agents work with relationships between entities.", "Evokoa’s pgGraph: a virtual graph layer for AI agents built on PostgreSQL."),
        "Kong": ("Kong is a solo, non-technical founder who presented Zhiji at Roast #7, sharing how he built a paid AI astrology companion without a human engineer in the loop.", "Zhiji / 知己: an AI companion that uses Chinese astrology charts to personalise conversations."),
        "Fernandi": ("Fernandi presented Canary Lab at Roast #7, focusing on independently verifying AI-generated output before it ships and keeping agent changes inspectable.", "Canary Lab: an AI repair loop for Playwright and a skill for coding tools, with deterministic execution and reviewable Git diffs."),
        "Krishna": ("Krishna shared Unfinal and a server-first approach to real-time products at Roast #7, bringing together Phoenix LiveView, persistent services and research-led UX.", "Unfinal, with a server-first stack using exe.dev, Phoenix LiveView and WebSockets for real-time interactions."),
    }
    bios = {
        "Marcus Liang": "Builds AI-assisted software workflows that connect user feedback to human-reviewed fixes.",
        "Ee One Lim": "Builds apps for learning and care, from Spanish through music to finding caregiver support.",
        "Jesse Sng": "Explores visual automation and AI content workflows across text, images, audio and video.",
        "Abdelrahman Fliou": "Builds a pricing copilot that combines document processing with deterministic analysis.",
        "Gaurav Kumar Manek": "Shares practical experience in immutable data storage, AI agent evaluations and guardrails.",
        "Arul Kumaran": "Works with programmatic video, voice cloning and open-weight models for media workflows.",
        "Ying Zhao": "Applies production-style data engineering to personal analytics and understanding LinkedIn reach.",
        "Kaleb Nim": "Explores conversational AI interfaces, speech recognition and real-time voice responses.",
        "Richard Lee": "Builds multi-agent workflows for discovering business opportunities, with a focus on grounding and orchestration.",
        "Alec Teo": "Builds playful image experiences and explores how apps can become more agent-friendly.",
        "Dalton Prescott Ng": "Works on graph capabilities in PostgreSQL to help AI agents navigate relationships between entities.",
        "Kong": "A solo, non-technical founder building a paid AI companion with AI-assisted development.",
        "Fernandi": "Builds tools for independently verifying AI-generated code and making agent changes inspectable.",
        "Krishna": "Explores server-first, real-time products with Phoenix LiveView and research-led UX.",
    }
    project_descriptions = {
        "Harwav Order Hub": "Turns chatbot feedback into GitHub issues and AI-generated fixes, with human review before deployment.",
        "Kantaro · kantaro.live": "Teaches Spanish through music, using real lyrics and open-source components.",
        "Drag Flow": "Connects automation workflows by dragging and linking nodes.",
        "TransPrice": "A pricing copilot that turns PDFs into Markdown before model work.",
        "Visigoth.ai · Data Storage": "An immutable storage architecture from Gaurav’s previous startup.",
        "Programmatic Video Toolchain": "Combines Remotion, Voicebox, FFmpeg and Gemma for video rendering, voice cloning and summarisation.",
        "Personal LinkedIn Analytics Pipeline": "A Databricks pipeline using medallion ETL to analyse LinkedIn performance.",
        "Care Compass": "Helps caregivers find support resources using retrieval-augmented generation.",
        "Voice Resume": "Lets employers ask questions and receive real-time spoken answers from an AI-powered resume.",
        "Agents To Find Business Opportunities": "An executive agent coordinates purpose-built child agents to discover business opportunities.",
        "PixelPuggles": "Pixelates and animates photos, with agent-friendly interaction among its design goals.",
        "Evokoa · pgGraph": "A virtual graph layer for AI agents built on PostgreSQL.",
        "AI Content Pipeline": "Turns source material into podcasts, blogs, images and audio in parallel.",
        "Zhiji / 知己": "An AI companion that uses Chinese astrology charts to personalise conversations.",
        "Canary Lab": "Independently verifies AI output with an AI repair loop for Playwright and a skill for coding tools.",
        "Unfinal / exe.dev": "A server-first real-time product using exe.dev, Phoenix LiveView and WebSockets.",
    }
    # Square head-and-shoulders crops, in fractions of the original image width.
    crops = {
        "Ee One Lim": {"x": .36, "y": .35, "size": .29},
        "Jesse Sng": {"x": .12, "y": .05, "size": .40},
        "Ying Zhao": {"x": .12, "y": .06, "size": .42},
        "Abdelrahman Fliou": {"x": .03, "y": .48, "size": .22},
        "Gaurav Kumar Manek": {"x": .50, "y": .17, "size": .22},
        "Arul Kumaran": {"x": .17, "y": .49, "size": .23},
        "Kaleb Nim": {"x": .30, "y": .10, "size": .55},
        "Richard Lee": {"x": .05, "y": .05, "size": .26},
        "Alec Teo": {"x": .02, "y": .00, "size": .32},
        "Dalton Prescott Ng": {"x": .10, "y": .015, "size": .28},
        "Kong": {"x": .10, "y": .08, "size": .43},
        "Fernandi": {"x": .39, "y": .16, "size": .29},
        "Krishna": {"x": .25, "y": .39, "size": .22},
    }
    people = {}
    for edition in range(2, 8):
        for card in source(f"roast-{edition}.html").find("article"):
            if "speaker-card" not in card.attrs.get("class", "").split():
                continue
            name = next(card.find("h2")).text()
            links = list(card.find("a"))
            linkedin = next(a.attrs["href"] for a in links if a.attrs.get("title") == "LinkedIn")
            # Roast #2 says Jesse Lim but links to Jesse Sng, as does Roast #6.
            if linkedin == "https://www.linkedin.com/in/jesse-sng-05ab7944/":
                name = "Jesse Sng"
            person = people.setdefault(linkedin, {"title": name, "linkedin": linkedin, "editions": [], "topics": [], "projects": []})
            person["editions"].append(edition)
            tags = next(n for n in card.find("div") if "speaker-tags" in n.attrs.get("class", "").split())
            for tag in tags.find("span"):
                if tag.text() not in person["topics"]:
                    person["topics"].append(tag.text())
            photo = next(card.find("img"), None)
            if photo:
                person["photo"] = image(photo.attrs["src"], photo.attrs.get("alt", name))
            for link in links:
                label, href = link.attrs.get("title", ""), link.attrs["href"]
                if "GitHub" in label:
                    person["github"] = href.replace("http://github.com/", "https://github.com/")
                elif label in {"Website", "Blog series"}:
                    person.setdefault("website", href)
                    person["project_url"] = href
            if name in {"Dalton Prescott Ng", "Fernandi"}:
                person["project_url"] = person["github"]
            project_name = next(p.text() for p in card.find("p") if "speaker-project" in p.attrs.get("class", "").split())
            # Agent evals was a talk, rather than a separate product.
            if project_name == "Evals for AI Agents":
                continue
            title = {"Kantaro · kantaro.live": "Kantaro", "Evokoa · pgGraph": "pgGraph", "Unfinal / exe.dev": "Unfinal"}.get(project_name, project_name)
            heading, summary, project_links = Node(), Node(), Node()
            heading.children = [title]
            summary.children = [project_descriptions[project_name]]
            for link in links:
                label = link.attrs.get("title", "")
                if label not in {"Website", "Blog series", "GitHub", "Slides on GitHub"}:
                    continue
                if project_links.children:
                    project_links.children.append(" · ")
                anchor = Node("a", [("href", link.attrs["href"].replace("http://github.com/", "https://github.com/"))])
                anchor.children = ["Slides on GitHub" if name == "Richard Lee" and label == "GitHub" else label]
                project_links.children.append(anchor)
            person["projects"].extend([block(heading, "h4"), block(summary)])
            if project_links.children:
                person["projects"].append(block(project_links))
    members = []
    for i, person in enumerate(people.values()):
        editions = person.pop("editions")
        person["role"] = "Roast My TechStack speaker · " + ", ".join(f"#{n}" for n in editions)
        person["recaps"] = []
        for edition in editions:
            wrapper = Node()
            link = Node("a", [("href", f"/posts/roast-{edition}")])
            link.children = [f"Speaker · Roast #{edition}"]
            wrapper.children = [link]
            recap = block(wrapper)
            # Internal links must stay on this site, rather than the legacy origin.
            recap["markDefs"][0]["href"] = f"/posts/roast-{edition}"
            recap["_key"] = f"recap-{edition}"
            recap["children"][0]["_key"] = "s0"
            person["recaps"].append(recap)
        person["interests"] = " · ".join(person.pop("topics"))
        person["bio"] = bios[person["title"]]
        person["building"] = introductions[person["title"]][1]
        if person["title"] in crops:
            person["portrait_crop"] = crops[person["title"]]
        for i_block, project in enumerate(person["projects"]):
            project["_key"] = f"project-{i_block}"
            for j, span in enumerate(project["children"]):
                span["_key"] = f"s{j}"
        person["sort_order"] = i
        slug = re.sub(r"[^a-z0-9]+", "-", person["title"].lower()).strip("-")
        members.append(entry(slug, person))
    # Use the existing close-up portraits for members who are also on the Exco.
    for article in source("exco.html").find("article"):
        link = next(article.find("a"), None)
        if not link:
            continue
        profile = next((m["data"] for m in members if m["data"]["linkedin"].rstrip("/").replace("www.", "").replace("sg.", "") == link.attrs["href"].rstrip("/").replace("www.", "").replace("sg.", "")), None)
        if profile:
            photo = next(article.find("img"))
            profile["photo"] = image(photo.attrs["src"], photo.attrs.get("alt", profile["title"]))
    return members


def link_member_profiles(posts, members):
    names = {m["data"]["title"]: m["slug"] for m in members}
    names["Jesse Lim"] = names["Jesse Sng"]
    for post in posts:
        if post["slug"] not in {f"roast-{n}" for n in range(2, 8)}:
            continue
        for item in post["data"]["content"]:
            name = "".join(s["text"] for s in item.get("children", []))
            if item.get("style") != "h2" or name not in names:
                continue
            mark = "member-profile"
            item["markDefs"] = [d for d in item.get("markDefs", []) if d["_key"] != mark]
            item["markDefs"].append({"_key": mark, "_type": "link", "href": f"/members#{names[name]}"})
            for span in item["children"]:
                span["marks"] = list(dict.fromkeys([*span.get("marks", []), mark]))


def configure_member_editor(seed):
    schema = next(c for c in seed["collections"] if c["slug"] == "members")
    suggestions = sorted({tag.strip() for member in seed["content"]["members"] for tag in member["data"].get("interests", "").split(" · ") if tag.strip()}, key=str.casefold)
    widgets = {"sort_order": "hidden", "portrait_crop": "hidden", "interests": "interests", "recaps": "recaps"}
    for i, definition in enumerate(schema["fields"]):
        widget = widgets.get(definition["slug"])
        if widget:
            schema["fields"][i] = {**definition, "widget": f"techies-members:{widget}"}
            if definition["slug"] == "interests":
                schema["fields"][i]["options"] = {"suggestions": suggestions}


def write_members():
    """Update only members in the existing seed, preserving other curated content."""
    path = ROOT / "seed" / "seed.json"
    seed = json.loads(path.read_text())
    members = member_profiles()
    if seed["content"]["members"]:
        updated = {m["slug"]: m["data"] for m in members}
        for member in seed["content"]["members"]:
            if member["slug"] in updated:
                for field_name in ("bio", "photo", "portrait_crop", "projects", "recaps"):
                    if field_name in updated[member["slug"]]:
                        member["data"][field_name] = updated[member["slug"]][field_name]
    else:
        seed["content"]["members"] = members
    schema = next(c for c in seed["collections"] if c["slug"] == "members")
    if not any(f["slug"] == "recaps" for f in schema["fields"]):
        schema["fields"].append(field("recaps", "Event recaps", "portableText"))
    for new_field in (field("projects", "Projects", "portableText"), field("portrait_crop", "Portrait crop (x, y, size)", "json")):
        if not any(f["slug"] == new_field["slug"] for f in schema["fields"]):
            schema["fields"].append(new_field)
    link_member_profiles(seed["content"]["posts"], members)
    configure_member_editor(seed)
    path.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n")
    print(f"Seed ready: {len(seed['content']['members'])} member profiles from Roast #2–#7.")


def main():
    logo = ROOT / "public" / "brand" / "techies-wordmark.png"
    if not logo.exists():
        with urlopen(urljoin(ORIGIN, "techies-logo-cropped.png"), timeout=45) as response:
            artwork = response.read()
        logo.parent.mkdir(parents=True, exist_ok=True)
        logo.write_bytes(artwork)
    posts = []
    dates = {2: "2026-04-06", 3: "2026-04-17", 4: "2026-05-07", 5: "2026-05-21", 6: "2026-06-04", 7: "2026-07-02"}
    for edition in range(7, 1, -1):
        document = source(f"roast-{edition}.html")
        main_node = next(document.find("main"))
        hero = next(n for n in main_node.find("section") if "roast-page-hero" in n.attrs.get("class", ""))
        title = next(hero.find("h1")).text().replace("Roast #", "Roast My TechStack #")
        content = portable(main_node)
        for i, item in enumerate(content):
            item["_key"] = f"roast-{edition}-{i}"
            for j, span in enumerate(item.get("children", [])):
                span["_key"] = f"s{j}"
        # Every substantive source paragraph, heading and list item must survive the conversion.
        flattened = " ".join("".join(s["text"] for s in b.get("children", [])) for b in content)
        for n in main_node.find("p"):
            if n not in list(hero.find("p")) and n.text():
                assert n.text() in re.sub(r"\s+", " ", flattened), f"Lost paragraph in recap {edition}: {n.text()}"
        links = {d["href"] for b in content for d in b.get("markDefs", [])}
        for anchor in main_node.find("a"):
            if anchor.attrs.get("href"):
                assert urljoin(ORIGIN, anchor.attrs["href"]) in links, f"Lost link in recap {edition}"
        photos = [n for n in main_node.find("img") if "speaker-photo" in n.attrs.get("class", "")]
        data = {"title": title, "excerpt": next(hero.find("p")).text(), "content": content, "event_date": dates[edition] + "T10:30:00Z", "source_url": urljoin(ORIGIN, f"roast-{edition}.html")}
        if photos:
            data["featured_image"] = image(photos[0].attrs["src"], photos[0].attrs.get("alt", ""))
        posts.append(entry(f"roast-{edition}", data, taxonomies={"category": ["event-summaries"], "tag": ["roast-my-techstack"]}))
        print(f"Roast #{edition}: {len(content)} rich-text blocks migrated")

    team = []
    exco = source("exco.html")
    for i, article in enumerate(exco.find("article")):
        name_node = next(article.find("h2"), None)
        if not name_node:
            continue
        name = name_node.text()
        paragraphs = list(article.find("p"))
        photo = next(article.find("img"))
        link = next(article.find("a"))
        team.append(entry(re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), {"title": name, "role": paragraphs[0].text(), "bio": paragraphs[-1].text(), "photo": image(photo.attrs["src"], photo.attrs.get("alt", name)), "linkedin": link.attrs["href"], "sort_order": i}))
    assert len(team) == 5, f"Expected five Exco profiles, got {len(team)}"

    profile_fields = [field("title", "Name", required=True, searchable=True), field("role", "Role / introduction"), field("bio", "Biography", "text", searchable=True), field("photo", "Portrait", "image"), field("linkedin", "LinkedIn", "url"), field("github", "GitHub", "url"), field("website", "Website", "url"), field("sort_order", "Display order", "integer")]
    programmes = [
        entry("roast", {"title": "Roast My TechStack", "label": "01 / Architecture, under discussion", "description": "Your demo works. What breaks first? Bring the stack, the constraints, and the decision you’re stuck on. Curious questions. Technical debate. No personal takedowns.", "cover": image("https://images.lumacdn.com/uploads/93/ac98ed5d-5ed5-4de4-b256-b9a49188f4ce.png", "Roast My TechStack: graphite stack with glowing orange layers and a pixel flame"), "url": "https://luma.com/1ia9kj18", "accent": "amber", "sort_order": 1}),
        entry("prod-down", {"title": "Prod is DOWN!!!", "label": "02 / Lessons from production", "description": "Everything was fine. Then production wasn’t. We unpack what broke, how the team recovered, and the guardrails they wish they’d had.", "cover": image("https://images.lumacdn.com/uploads/mc/b5dd3dc0-ea86-40cd-aba5-771b96859ce5.png", "Prod is DOWN!!! artwork with burning servers and After Dark partner branding"), "url": "https://luma.com/f5azjksz", "accent": "red", "sort_order": 2}),
        entry("starting-right", {"title": "Building Products: Starting Right w/ Techies", "label": "03 / Product thinking", "description": "What should you build—and what can wait? Work through the business and engineering decisions before writing code. Part of Lorong AI’s Tinker Time series.", "cover": image("https://images.lumacdn.com/uploads/3e/a30cc1f8-9036-4e02-9e70-49e05531a2f4.jpg", "Starting Right product-thinking cover with architecture layers, glowing cube and Tinker Time attribution"), "url": "https://luma.com/rddsuaa6", "accent": "teal", "sort_order": 3}),
    ]
    home = entry("home", {"title": "A 3rd space for devs to geek out.", "intro": "Real stacks. Real constraints. Real conversations. We get into how things are actually built—and why. Bring your questions. Stay for supper.", "about_intro": "Serious about the craft. Relaxed with the people. A room for developers, dev-adjacents, and technically curious people, whatever your title or experience.", "supper_copy": "The agenda ends. The conversation doesn’t. Join us for supper, compare notes, and meet people to keep building with.", "supper_photo": image("photos/2026-08-08%2012.01.58.jpg", "Techies community members sharing a meal after an event"), "supper_photo_two": image("photos/2026-08-08%2012.02.36.jpg", "Techies members continuing the conversation over supper"), "podcast_copy": "Tech and AI developments through a builder’s lens. What matters, what’s overhyped, and what changes how you build. Season 1 is complete; the podcast is currently on pause.", "podcast_url": "https://open.spotify.com/show/3JhNpERWFXWIjGcmXDvu3f"})
    seed = {
        "$schema": "https://emdashcms.com/seed.schema.json", "version": "1", "meta": {"name": "Techies", "description": "Techies community website and original event summaries", "author": "Techies APAC"},
        "settings": {"title": "Techies", "tagline": "A 3rd space for devs to geek out.", "timezone": "Asia/Singapore"},
        "collections": [
            json.loads((ROOT / "seed" / "campaigns.schema.json").read_text()),
            {"slug": "announcements", "label": "Announcements", "labelSingular": "Announcement", "supports": ["drafts", "revisions"], "fields": [field("campaign_ref", "Managed campaign reference", unique=True, indexed=True, widget="techies-campaigns:managed-reference"), field("title", "Announcement text", "text", required=True), field("starts_at", "Show from (optional)", "datetime"), field("ends_at", "Hide at (optional)", "datetime"), field("cta_label", "CTA text (optional)"), field("cta_url", "CTA link (https://… or /path)"), field("cta_new_tab", "Open CTA in new tab", "boolean")]},
            collection("posts", "Posts", [field("title", "Title", required=True, searchable=True), field("featured_image", "Featured image", "image"), field("content", "Content", "portableText", searchable=True), field("excerpt", "Excerpt", "text"), field("event_date", "Event date", "datetime"), field("source_url", "Original source", "url")], "/posts/{slug}"),
            collection("pages", "Pages", [field("title", "Title", required=True, searchable=True), field("content", "Content", "portableText", searchable=True), field("intro", "Hero introduction", "text"), field("about_intro", "About introduction", "text"), field("supper_copy", "Supper copy", "text"), field("supper_photo", "Supper photo", "image"), field("supper_photo_two", "Second supper photo", "image"), field("podcast_copy", "Podcast copy", "text"), field("podcast_url", "Podcast link", "url")], "/{slug}"),
            collection("programmes", "Programmes", [field("title", "Title", required=True), field("label", "Label"), field("description", "Description", "text"), field("cover", "Cover artwork", "image"), field("url", "Registration link", "url"), field("accent", "Accent", "select", validation={"options": ["amber", "red", "teal"]}, options={"options": ["amber", "red", "teal"]}), field("sort_order", "Display order", "integer")], "/#events"),
            collection("team", "Exco profiles", profile_fields, "/exco"),
            collection("members", "Members", profile_fields + [field("building", "What they are building", "text"), field("interests", "Technical interests", "text"), field("project_url", "Project link", "url"), field("recaps", "Event recaps", "portableText"), field("projects", "Projects", "portableText"), field("portrait_crop", "Portrait crop (x, y, size)", "json")], "/members"),
        ],
        "taxonomies": [
            {"name": "category", "label": "Categories", "labelSingular": "Category", "hierarchical": True, "collections": ["posts"], "terms": [{"slug": "event-summaries", "label": "Event summaries"}]},
            {"name": "tag", "label": "Tags", "labelSingular": "Tag", "hierarchical": False, "collections": ["posts"], "terms": [{"slug": "roast-my-techstack", "label": "Roast My TechStack"}]},
        ],
        "menus": [{"name": "primary", "label": "Primary navigation", "items": [{"type": "custom", "label": label, "url": url} for label, url in [("About", "/#about"), ("Events", "/#events"), ("Posts", "/posts"), ("Members", "/members"), ("Exco", "/exco")]]}],
        "content": {"pages": [home], "posts": list(reversed(posts)), "programmes": programmes, "team": team, "members": member_profiles()},
    }
    link_member_profiles(seed["content"]["posts"], seed["content"]["members"])
    configure_member_editor(seed)
    (ROOT / "seed" / "seed.json").write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n")
    print("Seed ready: homepage, 3 programmes, 6 posts, 5 Exco profiles, 14 member profiles.")


def check():
    document = Parser('<main><p>A <strong>real</strong> constraint. <a href="https://example.com">Details</a></p><ul><li>Keep the partial result<ul><li>Retry later</li></ul></li></ul><img src="assets/test.jpg" alt="A speaker"><a href="https://example.com/profile" title="LinkedIn"><svg></svg></a><iframe src="https://example.com/demo" title="Demo"></iframe></main>').root
    result = portable(next(document.find("main")))
    assert len(result) == 6
    assert result[0]["children"][1]["marks"] == ["strong"]
    assert result[0]["markDefs"][0]["href"] == "https://example.com"
    assert result[2]["level"] == 2
    assert result[3]["asset"]["$media"]["url"] == ORIGIN + "assets/test.jpg"
    assert result[4]["children"][0]["text"] == "LinkedIn"
    assert result[5]["markDefs"][0]["href"] == "https://example.com/demo"
    video = portable(Parser('<video><source src="demo.mp4"></video>').root)
    assert video[0]["markDefs"][0]["href"] == ORIGIN + "demo.mp4"
    tags = portable(Parser('<div class="speaker-tags"><span>Postgres</span><span>RAG</span></div>').root)
    assert tags[0]["children"][0]["text"] == "Postgres · RAG"
    members = member_profiles()
    assert len(members) == len({m["data"]["linkedin"] for m in members}) == 14
    by_name = {m["data"]["title"]: m["data"] for m in members}
    assert "#2, #6" in by_name["Jesse Sng"]["role"]
    assert "Drag Flow" in by_name["Jesse Sng"]["building"]
    assert "#2, #4" in by_name["Ee One Lim"]["role"]
    assert by_name["Ee One Lim"]["website"] == "https://kantaro.live"
    assert by_name["Ee One Lim"]["project_url"] == "https://care-compass-iota.vercel.app/"
    assert "#3, #6" in by_name["Gaurav Kumar Manek"]["role"]
    assert "Immutable storage" in by_name["Gaurav Kumar Manek"]["interests"]
    assert "LLM evals" in by_name["Gaurav Kumar Manek"]["interests"]
    assert sum("photo" in m["data"] for m in members) == 13
    assert all(m["data"]["bio"] and m["data"]["building"] for m in members)
    assert all(len(m["data"]["bio"]) < 170 and m["data"]["projects"] for m in members)
    ee_one_projects = by_name["Ee One Lim"]["projects"]
    headings = ["".join(s["text"] for s in b["children"]) for b in ee_one_projects if b.get("style") == "h4"]
    assert headings == ["Kantaro", "Care Compass"]
    links = [d["href"] for b in ee_one_projects for d in b.get("markDefs", [])]
    assert "https://kantaro.live" in links and "https://care-compass-iota.vercel.app/" in links
    assert "https://github.com/EeOneLim/care-compass" in links
    assert "assets/exco/jesse-sng.jpg" in by_name["Jesse Sng"]["photo"]["$media"]["url"]
    assert "assets/exco/yingzhao.jpg" in by_name["Ying Zhao"]["photo"]["$media"]["url"]
    for member in members:
        crop = member["data"].get("portrait_crop")
        if crop:
            assert 0 <= crop["x"] < 1 and 0 <= crop["y"] < 1 and 0 < crop["size"] <= 1
    posts = [{"slug": f"roast-{n}", "data": {"content": portable(next(source(f"roast-{n}.html").find("main")))}} for n in range(2, 8)]
    link_member_profiles(posts, members)
    linked = [d["href"] for p in posts for b in p["data"]["content"] for d in b.get("markDefs", []) if d["_key"] == "member-profile"]
    assert len(linked) == 17
    assert set(linked) == {f"/members#{m['slug']}" for m in members}
    for member in members:
        for recap in member["data"]["recaps"]:
            slug = recap["markDefs"][0]["href"].removeprefix("/posts/")
            post = next(p for p in posts if p["slug"] == slug)
            assert any(d["href"] == f"/members#{member['slug']}" for b in post["data"]["content"] for d in b.get("markDefs", []))
    link_member_profiles(posts, members)
    assert sum(d["_key"] == "member-profile" for p in posts for b in p["data"]["content"] for d in b.get("markDefs", [])) == 17
    print("Legacy conversion check passed: formatting, links, nested lists, images and demos.")
    print("Member check passed: 14 unique speakers, merged appearances, projects, links and 13 photos.")


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    elif "--members-only" in sys.argv:
        write_members()
    else:
        main()
