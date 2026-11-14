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


def has_title(node):
    for item in walk(node):
        if role(item) == "label" and text(item) == title:
            return True
    return False


def ok_button(node):
    for item in walk(node):
        if role(item) == "push button" and text(item).lower() == "ok":
            return item
    return None


Atspi.init()
while time.time() < deadline:
    desktop = Atspi.get_desktop(0)
    for app in children(desktop):
        for node in walk(app):
            if role(node) not in {"alert", "dialog", "window", "frame"}:
                continue
            if not has_title(node):
                continue
            button = ok_button(node)
            if button is not None and Atspi.Action.do_action(button, 0):
                sys.exit(0)
    time.sleep(0.1)

print(f'no Ok button on a dialog titled "{title}"', file=sys.stderr)
sys.exit(1)
