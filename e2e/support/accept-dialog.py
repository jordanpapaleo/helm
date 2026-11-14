#!/usr/bin/env python3
"""Click Ok on a native GTK confirm dialog.

The dialog is outside the webview, so Webdriver cannot see it. GTK exposes
it on the accessibility bus when GTK_MODULES includes gail:atk-bridge.
On newer AT-SPI the Ok button has no accessible name, so a named match is
not enough: the default button, then the last of the Cancel/Ok pair, then
the bottom-right of the dialog.
"""

import subprocess
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

title = sys.argv[1]
deadline = time.time() + 8
OK_LABELS = {"ok", "okay", "yes"}


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
    if node is None or depth > 14:
        return
    yield node
    for child in children(node):
        yield from walk(child, depth + 1)


def node_strings(node):
    values = []
    name = text(node)
    if name:
        values.append(name)
    try:
        description = node.get_description() or ""
    except Exception:
        description = ""
    if description and description not in values:
        values.append(description)
    try:
        if node.get_text_iface() is not None:
            chunk = node.get_text(0, 80) or ""
            if chunk and chunk not in values:
                values.append(chunk)
    except Exception:
        pass
    return values


def normalized(value):
    return value.replace("_", "").strip().lower()


def is_button(node):
    return "button" in role(node)


def is_default(node):
    try:
        return bool(node.get_state_set().contains(Atspi.StateType.IS_DEFAULT))
    except Exception:
        return False


def extents(node):
    try:
        iface = node.get_component_iface()
        if iface is None:
            return None
        rect = Atspi.Component.get_extents(iface, Atspi.CoordType.SCREEN)
    except Exception:
        return None
    if rect is None or rect.width <= 0 or rect.height <= 0:
        return None
    return rect


def dialog_root(label_node):
    current = label_node
    for _ in range(12):
        if role(current) in {"alert", "dialog"}:
            return current
        try:
            parent = current.get_parent()
        except Exception:
            parent = None
        if parent is None:
            break
        current = parent
    return label_node


def buttons_for(dialog):
    found = [node for node in walk(dialog) if is_button(node)]
    if found:
        return found
    try:
        parent = dialog.get_parent()
    except Exception:
        parent = None
    if parent is None:
        return []
    for child in children(parent):
        if child == dialog:
            continue
        rect = extents(child)
        # The action row is a short sibling. The webview is the rest of the window.
        if rect is None or rect.height > 120:
            continue
        found.extend(node for node in walk(child) if is_button(node))
    return found


def button_labels(button):
    labels = []
    for node in walk(button):
        labels.extend(node_strings(node))
    return labels


def pick_ok(buttons):
    for button in buttons:
        if any(normalized(label) in OK_LABELS for label in button_labels(button)):
            return button
    defaults = [button for button in buttons if is_default(button)]
    if len(defaults) == 1:
        return defaults[0]
    # GTK_BUTTONS_OK_CANCEL adds Cancel, then Ok.
    if len(buttons) == 2:
        return buttons[-1]
    return None


def click_button(button):
    try:
        return bool(Atspi.Action.do_action(button, 0))
    except Exception:
        return False


def click_corner(dialog):
    rect = extents(dialog)
    if rect is None or rect.width < 80 or rect.height < 40:
        return False
    x = int(rect.x + rect.width - 36)
    y = int(rect.y + rect.height - 22)
    clicked = subprocess.run(
        ["xdotool", "mousemove", "--sync", str(x), str(y), "click", "1"],
        check=False,
    )
    return clicked.returncode == 0


def title_visible():
    desktop = Atspi.get_desktop(0)
    for app in children(desktop):
        for node in walk(app):
            if role(node) == "label" and text(node) == title:
                return True
    return False


def accept():
    desktop = Atspi.get_desktop(0)
    for app in children(desktop):
        for node in walk(app):
            if role(node) != "label" or text(node) != title:
                continue
            dialog = dialog_root(node)
            button = pick_ok(buttons_for(dialog))
            clicked = button is not None and click_button(button)
            if not clicked:
                clicked = click_corner(dialog)
            if not clicked:
                return False
            time.sleep(0.3)
            return not title_visible()
    return False


def dump():
    lines = []
    desktop = Atspi.get_desktop(0)
    for app in children(desktop):
        lines.append(f"app {text(app)}")
        for node in walk(app):
            if role(node) != "label" or text(node) != title:
                continue
            dialog = dialog_root(node)
            lines.append(f"dialog {role(dialog)}: {text(dialog) or '(unnamed)'}")
            for item in walk(dialog):
                labels = " | ".join(node_strings(item)) or "(unnamed)"
                flag = " default" if is_default(item) else ""
                lines.append(f"  {role(item)}: {labels}{flag}")
                if len(lines) >= 60:
                    return lines
            for button in buttons_for(dialog):
                labels = " | ".join(button_labels(button)) or "(unnamed)"
                lines.append(f"  button-candidate: {labels}")
            return lines
    return lines


Atspi.init()
while time.time() < deadline:
    if accept():
        sys.exit(0)
    time.sleep(0.1)

print(f'no Ok button on a dialog titled "{title}"', file=sys.stderr)
for line in dump():
    print(line, file=sys.stderr)
sys.exit(1)
