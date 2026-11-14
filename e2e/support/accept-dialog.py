#!/usr/bin/env python3
"""Click Ok on a native GTK confirm dialog.

The dialog is outside the webview, so Webdriver cannot see it. GTK exposes
it on the accessibility bus when GTK_MODULES includes gail:atk-bridge.
"""

import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

title = sys.argv[1]
deadline = time.time() + 8


def text(node):
    try:
        return node.get_name() or ""
    except Exception:
        return ""


def role(node):
    try:
        return node.get_role_name() or ""
    except Exception:
        return ""


def children(node):
    try:
        count = node.get_child_count()
    except Exception:
        return
    for index in range(count):
        child = node.get_child_at_index(index)
        if child is not None:
            yield child


def walk(node, depth=0):
    if depth > 14:
        return
    yield node
    for child in children(node):
        yield from walk(child, depth + 1)


def ok_button(node):
    for item in walk(node):
        if role(item) == "push button" and text(item).lower() == "ok":
            return item
    return None


def ok_for_title():
    desktop = Atspi.get_desktop(0)
    for app in children(desktop):
        for node in walk(app):
            if role(node) != "label" or text(node) != title:
                continue
            current = node
            for _ in range(10):
                button = ok_button(current)
                if button is not None:
                    return button
                parent = current.get_parent()
                if parent is None:
                    break
                current = parent
    return None


def visible_names():
    lines = []
    desktop = Atspi.get_desktop(0)
    for app in children(desktop):
        lines.append(f"app {text(app)}")
        for node in walk(app):
            kind = role(node)
            name = text(node)
            if name and kind in {"alert", "dialog", "window", "frame", "push button", "label"}:
                lines.append(f"  {kind}: {name}")
            if len(lines) >= 40:
                return lines
    return lines


Atspi.init()
while time.time() < deadline:
    button = ok_for_title()
    if button is not None and Atspi.Action.do_action(button, 0):
        sys.exit(0)
    time.sleep(0.1)

print(f'no Ok button on a dialog titled "{title}"', file=sys.stderr)
for line in visible_names():
    print(line, file=sys.stderr)
sys.exit(1)
