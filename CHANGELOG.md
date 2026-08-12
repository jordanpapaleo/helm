## v1.1.0 — 2026-08-12

- Key the tag tree by null-prototype maps
- Add Homebrew tap instructions
- Add Homebrew cask support to release.sh
- fix: route Ctrl+Q through the shared quit flow
- Stop writing escaped wiki-link brackets to disk
- Fix the cursor mapping against real notes, and guarantee a visible caret
- Sync the markdown textarea with external writes
- Merge tags on save instead of recomputing them from the body
- Keep the reading position across the editor/markdown toggle
- fix: never let a wedged save make the app impossible to close
- Store `created` / `updated` as UTC datetimes
- Stop Vite watching agent worktrees under .claude
- Preserve the cursor position when toggling editor/markdown
- Snapshot before bulk tag writes; clean up emptied lines
- Exclude unmanaged notes from the briefing and drop the empty state badge
- Reattach the extractInlineTags docblock to its function
- Add bulk tag rename and delete from the sidebar
- Keep get_kanban on ?? and document why
- Share the inline-tag grammar instead of duplicating it
- Do not bump `updated` when a note is merely opened or blurred
- Hide and clear workflow fields on unmanaged notes
- Add visual chip styling for inline #tags in the editor
- Extract update-result dialog presentation into a helper.
- Add the GitHub repo URL to the About dialog.
- Show a checking toast while update lookup runs.
- Ignore overlapping Check for Updates clicks.
- Add manual Check for Updates via GitHub latest release.
- Keep GitHub Releases as drafts after Linux uploads.
- Automate Linux releases and stabilize download asset names.
- feat: print version with --version / -V before GUI launch
- fix: unstick close if exit_app invoke fails
- fix: exit the whole process when closing the main window
- fix: handle setsid failure when detaching from terminal
- fix: detach from controlling terminal when launched from a shell
- chore: update version to 1.0.0 in package-lock.json and Cargo.lock
- release: add Helm_1.0.0_aarch64.dmg

## v1.0.0 — 2026-07-10

- docs: refresh CLAUDE.md for agentic use — new conventions, structure, MCP tools
- docs(mcp): usage examples in setup modal and README
- feat(mcp): note history snapshots, restore tools, and get_briefing
- feat(capture): global quick-capture window (Cmd+Shift+Space)
- feat(history): note time machine with snapshot-on-save
- feat(dashboard): daily briefing card
- chore: add MIT license
- feat(release): validate signing credentials and verify notarization in release.sh
- chore: fix remaining biome lint errors
- fix(mcp): align inline-tag parsing with the app parser
- feat(ui): toast notifications, error boundary, and close-time autosave flush
- fix(store): crash-safe rename ordering, fresh search index, deselect on remove
- fix(vault): atomic writes, path validation, and delete_asset command
- docs: polish v0.9.0 changelog announcement
- release: add Helm_0.9.0_aarch64.dmg

## v0.9.0 — 2026-07-10

**What's new**

- Sync note title live between editor and note list
- Use a lightweight setter for live title edits
- Show pin icon by date for pinned notes, in primary color
- Exclude unmanaged notes from the Kanban board
- Add rename to the note-list panel; unify rename logic and input
- Fix New Subfolder + add folder Rename in LeftColumn (live sidebar)

**Editor fixes**

- Allow inserting content between adjacent code blocks
- Paste verbatim inside code blocks
- Keep nested lists tight (fix indent/outdent gap)
- Balance code-block top/bottom padding and drop extra margin for even spacing
- Make code-block punctuation legible in light mode

**Internal**

- Extract editor extensions so tests exercise the real code
- Remove dead FileTree component
- Document Linux installation steps

## v0.8.0 — 2026-06-17

- feat: toggle markdown mode via Cmd+M menu item and fix event double-registration
- docs: fix Paragraph accelerator note in heading format menu spec
- fix: use setHeading instead of toggleHeading for Format menu
- feat: wire format-heading and format-paragraph events to TipTap editor
- fix: remove out-of-scope toggle_markdown menu item
- feat: add Format native menu with heading level shortcuts
- feat: convert first-line heading to paragraph on Backspace
- docs: add heading format menu implementation plan
- docs: add heading format menu design spec
- feat: enhance App functionality with new event listeners and UI state management
- feat: enhance PropertyPanel title handling and improve NoteListPanel search functionality
- 0.7.0
- release: add Helm_0.7.0_aarch64.dmg

## v0.7.0 — 2026-06-12

- conflict aftermath

## v0.6.0 — 2026-06-12

- Find (#6)
- feat: inline code block language selector with typeahead
- feat: add Cmd+F find & replace (#5)
- release: add Helm_0.5.0_aarch64.dmg

## v0.5.0 — 2026-06-03

- June updates: tables, context menus, sidebar polish, unmanaged flag, nav history (#4)
- chore: abort release if sign.sh is missing to prevent unsigned builds
- release: replace 0.4.0 DMG with signed and notarized build
- docs: document release process in CONTRIBUTING.md and CLAUDE.md
- release: add Helm_0.4.0_aarch64.dmg

## v0.3.0 — 2026-05-09

- fix: add type declaration for d3-force-3d
- style polish
- final graph adjustments
- Aaron feedback (#2)
- chore: update version to 0.2.0 and enhance release script
- release: add Helm_0.2.0_aarch64.dmg

# Changelog

## v0.2.0 — 2026-05-08

- feat: enhance release script to include changelog generation and signing
- feat: add release script for version bumping and tagging
- chore: update .gitignore and tauri configuration
- feat: add build script to package.json and clean up test imports
- Formatting and stuff (#1)
- feat: add settings configuration and agent documentation
- fix: show empty folders in file tree (list_folders + vault-dirs-changed event)
- feat: drag-and-drop to move notes between folders
- feat: add Move to submenu for notes
- fix: anchor folder path substitution on rename
- feat: folder context menu — new note here, new subfolder, rename, delete
- feat: note context menu — open, new note here, pin, rename, delete
- fix: prevent double-commit in NewFolderInput, guard empty vault path
- feat: wire FileTree into sidebar with working toolbar
- fix: correct key placement, add React import, memoize tree
- feat: add FileTree base rendering with expand/collapse
- fix: add keyboard support to submenu trigger button
- fix: ContextMenu viewport clamping, ARIA roles, submenu as button
- feat: wire up General settings tab
- fix: live reload on external file changes, collapse button cleanup
- feat: add ContextMenu component
- fix: normalize vaultPath in getAllFolderPaths, use locale-aware folder sort
- feat: add buildTree utility and tests
- fix: sidebar expand at bottom, notes fill full width
- docs: add file tree implementation plan
- docs: add file tree view design spec
- chore: config updates, recursive vault watching, and responsive graph view
- ignore local settings
- removing local settings
- chore: update app icons and permissions
- chore: clean up app icon - dark background, no white border
- chore: fix icon to fill dock slot edge-to-edge
- feat: add Help > MCP Setup menu item with step-by-step modal
- feat: overhaul MCP server to v2 — full note features + resources + prompts
- fix: resolve pre-existing TypeScript errors blocking production build
- feat: add app icon — helm wheel + viking helmet
- feat: multi-vault support with frontmatter repair on import
- feat: 2-column grid layout for backlinks panel
- feat: fix task list checkbox rendering in editor
- feat: add confirmation dialog for note deletion and improve CSS spacing
- feat: initial project setup and documentation for Helm
- feat: real-time file watching for external vault edits
- feat: new note button and MCP server for Claude integration
- feat: backlinks panel and zettelkasten graph view
- feat: full-text search with minisearch
- feat: dashboard view with tag and state distribution charts
- feat: Kanban view with drag-and-drop state management
- feat: Eisenhower matrix view with drag-and-drop
- feat: frontmatter property panel above editor
- feat: TipTap markdown editor with auto-save on blur
- feat: collapsible tag tree in sidebar
- feat: named views navigation with UI store
- feat: app shell layout with collapsible left column
- feat: vault initialization and note loading on startup
- feat: add Zustand note store with tag tree
- feat: add note parsing utilities with gray-matter
- fix: add path validation to prevent traversal in vault commands
- feat: add Tauri file system commands for vault CRUD
- feat: add Note types, constants, and Vitest setup
- feat: configure Tailwind CSS and project structure
- feat: scaffold Tauri + React + TypeScript project
- Add Helm implementation plan
- Add Helm design document
