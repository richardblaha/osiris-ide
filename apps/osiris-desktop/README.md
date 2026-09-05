# @osiris/desktop

The Osiris IDE desktop app. It **does not build VS Code from source** — it
downloads a pinned [VSCodium](https://github.com/VSCodium/vscodium) prebuilt and
rebrands it (product identity, icons, `codium` → `osiris`).

## Pipeline

```bash
pnpm --filter @osiris/desktop run prepare:shell   # fetch VSCodium prebuilt(s) + rebrand in place
pnpm --filter @osiris/desktop package             # repack → dist_electron/Osiris-<platform>-<release>.*
```

`prepare:shell` with no argument does this host's platform; CI passes an explicit
key (`node scripts/fetch-prebuilt.mjs darwin-arm64`).

`apply-branding.mjs` also drops the Osiris first-party extensions — `osiris-ai`,
`osiris-workspace` and a generated `osiris-theme` (the `Osiris Dark`/`Osiris Light`
themes + editor defaults) — into `resources/app/extensions/` as **built-ins**, via
`@osiris/branding/bundle-extensions`. It packages each `<name>.vsix` on demand, so
`pnpm --filter "./extensions/*" package` is only needed explicitly in CI.

`package` emits a portable archive per platform (`.tar.gz` on Linux, `.zip` on
Windows/macOS) and, for `linux-x64` only, an **AppImage**, a classic
confinement **snap**, a **`.deb`** and an **`.rpm`** wrapping the same branded
tree. All four extra Linux packages are best-effort — `package.mjs` warns and
skips a given one if its tool is missing (`mksquashfs`/`appimagetool` for
AppImage/snap, `dpkg-deb` for `.deb`, `rpmbuild` for `.rpm`). Build one on its
own with `node scripts/pack-appimage.mjs` / `pack-snap.mjs` / `pack-deb.mjs` /
`pack-rpm.mjs`.

Unlike the AppImage/snap (self-contained, no host dependency declaration
possible), the `.deb`/`.rpm` declare real package dependencies — see
`RUNTIME_DEB_DEPENDS`/`RUNTIME_RPM_REQUIRES` and `DOCKER_DEB_ALTERNATIVES`/
`DOCKER_RPM_ALTERNATIVES` in `pack-linux.mjs`. Per spec §6.7, Osiris always
works through `kind`, and Docker (or Podman) is `kind`'s own runtime
dependency — so the package itself must require it (`docker-ce | docker.io |
podman-docker` on `.deb`, the RPM-rich-dependency equivalent on `.rpm`), not
just document it. `kind`/`kubectl` are **not** declared this way — neither
ships a package in any distro's or Docker's/Podman's own repos — `osiris
doctor` has to detect those missing at runtime instead.

| File / dir                   | Role                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| `config/upstream.json`       | pinned VSCodium repo + `release` tag + per-platform asset names     |
| `scripts/fetch-prebuilt.mjs` | download + `sha256`-verify + unpack into `.build/<platform>/`       |
| `scripts/rebrand.mjs`        | pure transforms (product.json curation, launcher patching) — tested |
| `scripts/apply-branding.mjs` | apply the rebrand to every staged platform                          |
| `scripts/package.mjs`        | repack the branded tree into `dist_electron/`                       |
| `scripts/pack-linux.mjs`     | pure text: `.desktop`, AppImage `AppRun`, snap `snap.yaml`, `.deb` control, `.rpm` spec — tested |
| `scripts/pack-tree.mjs`      | lay out the shared wrapper root (`usr/share/osiris/` + icon)        |
| `scripts/pack-appimage.mjs`  | wrap `linux-x64` → `.AppImage` (`appimagetool`, auto-downloaded)    |
| `scripts/pack-snap.mjs`      | wrap `linux-x64` → `.snap` (`mksquashfs`, classic confinement)      |
| `scripts/pack-deb.mjs`       | wrap `linux-x64` → `.deb` (`dpkg-deb`)                              |
| `scripts/pack-rpm.mjs`       | wrap `linux-x64` → `.rpm` (`rpmbuild`, no-compile `--buildroot`)    |
| `scripts/dev.mjs`            | launch this host's branded build straight from `.build/`            |
| `runtime/`                   | Electron main-process hook (not wired into the rebrand yet)         |

## Notes

- `.build/` and `dist_electron/` are git-ignored and disposable.
- The overlay in `@osiris/branding/product-overlay` is applied on top of the
  shipped `product.json`, **keeping** upstream's `builtInExtensions`, integrity
  `checksums`, `commit`/`version` and the working Open VSX gallery template.
- Archives are **portable and unsigned** — an alpha convenience, not installers.
  macOS users will need to clear the quarantine flag (`xattr -cr Osiris.app`).
- The `.tar.gz` ships Electron's `chrome-sandbox`; on a host with locked-down user
  namespaces it must be `sudo chown root:root chrome-sandbox && sudo chmod 4755
  chrome-sandbox`, or run with `--no-sandbox`. The **AppImage** does this check in
  `AppRun` and drops to `--no-sandbox` automatically (override with
  `OSIRIS_SANDBOX=1`). The **snap** is classic-confinement, so install it with
  `sudo snap install --dangerous --classic Osiris-linux-x64-<release>.snap`.
- The AppImage `AppRun` and the snap launcher **scrub inherited `VSCODE_*` /
  `ELECTRON_RUN_AS_NODE`** before starting Electron — otherwise launching Osiris
  from another editor's integrated terminal makes it read that editor's NLS
  config and caches. The `.tar.gz` has no wrapper: launch it from a plain shell,
  not a VS Code terminal.
- Bumping `config/upstream.json` is a deliberate PR; the `release` value must be
  a real tag at github.com/VSCodium/vscodium/releases.
