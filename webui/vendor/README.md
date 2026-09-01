# Vendored Canvas Harness ink engine

`core` and `react` are built from Canvas Harness commit
`7bf7346` (`perf(ink): keep eraser previews local`), on top of upstream
v0.1.29. The source branch is
[`maxdu0016-gif/canvas-harness:codex/ink-review-fixes`](https://github.com/maxdu0016-gif/canvas-harness/tree/codex/ink-review-fixes).

The tarballs are checked in because that commit is not published to npm yet.
They keep thinned/capped sampling, pressure, palm rejection, cached preview
rendering, geometry, swept whole-stroke erasing, export, and undo batching
inside Canvas Harness. Dim0 supplies only its Note persistence envelope through
`InkToolDefaults.createNode`.

SHA-256 checksums:

- `canvas-harness-core-0.1.29.tgz`:
  `0937FF2753E89E0E04DD95D93890108AE02D2041A76E134767B5182CA7BB5E32`
- `canvas-harness-react-0.1.29.tgz`:
  `21E71D2369E7B8385481FC4D1AC3B2EF8E203979B8FD7F3191815B16A05B3D42`
