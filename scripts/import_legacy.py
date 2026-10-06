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
            collection("posts", "Posts", [field("title", "Title", required=True, searchable=True), field("featured_image", "Featured image", "image"), field("content", "Content", "portableText", searchable=True), field("excerpt", "Excerpt", "text"), field("event_date", "Event date", "datetime"), field("source_url", "Original source", "url")], "/posts/{slug}"),
            collection("pages", "Pages", [field("title", "Title", required=True, searchable=True), field("content", "Content", "portableText", searchable=True), field("intro", "Hero introduction", "text"), field("about_intro", "About introduction", "text"), field("supper_copy", "Supper copy", "text"), field("supper_photo", "Supper photo", "image"), field("supper_photo_two", "Second supper photo", "image"), field("podcast_copy", "Podcast copy", "text"), field("podcast_url", "Podcast link", "url")], "/{slug}"),
            collection("programmes", "Programmes", [field("title", "Title", required=True), field("label", "Label"), field("description", "Description", "text"), field("cover", "Cover artwork", "image"), field("url", "Registration link", "url"), field("accent", "Accent", "select", validation={"options": ["amber", "red", "teal"]}, options={"options": ["amber", "red", "teal"]}), field("sort_order", "Display order", "integer")], "/#events"),
            collection("team", "Exco profiles", profile_fields, "/exco"),
            collection("members", "Members", profile_fields + [field("building", "What they are building", "text"), field("interests", "Technical interests", "text"), field("project_url", "Project link", "url")], "/members"),
        ],
        "taxonomies": [
            {"name": "category", "label": "Categories", "labelSingular": "Category", "hierarchical": True, "collections": ["posts"], "terms": [{"slug": "event-summaries", "label": "Event summaries"}]},
            {"name": "tag", "label": "Tags", "labelSingular": "Tag", "hierarchical": False, "collections": ["posts"], "terms": [{"slug": "roast-my-techstack", "label": "Roast My TechStack"}]},
        ],
        "menus": [{"name": "primary", "label": "Primary navigation", "items": [{"type": "custom", "label": label, "url": url} for label, url in [("About", "/#about"), ("Events", "/#events"), ("Posts", "/posts"), ("Members", "/members"), ("Exco", "/exco")]]}],
        "content": {"pages": [home], "posts": list(reversed(posts)), "programmes": programmes, "team": team, "members": []},
    }
    (ROOT / "seed" / "seed.json").write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n")
    print("Seed ready: homepage, 3 programmes, 6 posts, 5 Exco profiles. Members await curation.")


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
    print("Legacy conversion check passed: formatting, links, nested lists, images and demos.")


if __name__ == "__main__":
    check() if "--check" in sys.argv else main()
