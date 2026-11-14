#!/usr/bin/env python3
"""Wait until the accessibility bus is on the session bus."""

import sys
import time

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio

deadline = time.time() + 15
while time.time() < deadline:
    try:
        Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            None,
            "org.a11y.Bus",
            "/org/a11y/bus",
            "org.a11y.Bus",
            None,
        )
    except Exception:
        time.sleep(0.25)
        continue
    sys.exit(0)

print("accessibility bus did not start", file=sys.stderr)
sys.exit(1)
