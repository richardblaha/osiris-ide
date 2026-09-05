/**
 * Pure text transforms for the two extra Linux desktop packages we build on top
 * of the branded VSCodium prebuilt:
 *
 *   - an **AppImage** (portable, double-click / `chmod +x && ./run`)
 *   - a **snap**      (`snap install --dangerous --classic Osiris-*.snap`)
 *
 * Both wrap the exact same branded tree that `package.mjs` tars up; the layout
 * inside the wrapper is:
 *
 *   <root>/usr/share/osiris/osiris          the Electron binary (renamed)
 *   <root>/usr/share/osiris/bin/osiris      the CLI launcher shim
 *   <root>/usr/share/osiris/chrome-sandbox  the SUID sandbox helper
 *
 * The functions here only produce file *contents* — the filesystem work and the
 * `mksquashfs` / `appimagetool` calls live in `pack-appimage.mjs` / `pack-snap.mjs`.
 */

/** Where the branded app tree is placed inside every wrapper. */
export const APP_PREFIX = 'usr/share/osiris';

/**
 * A freedesktop `.desktop` entry for Osiris IDE.
 *
 * @param {object} [opts]
 * @param {string} [opts.exec]  the `Exec=` command (AppImage: `osiris`, snap: `osiris`)
 */
export function desktopEntry({ exec = 'osiris' } = {}) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Osiris IDE',
    'GenericName=Text Editor',
    'Comment=Osiris IDE — a rebranded VSCodium build',
    `Exec=${exec} %F`,
    'Icon=osiris',
    'Terminal=false',
    'StartupNotify=true',
    'StartupWMClass=Osiris',
    'Categories=Development;IDE;TextEditor;',
    'Keywords=osiris;vscode;vscodium;editor;',
    'MimeType=x-scheme-handler/osiris;text/plain;inode/directory;',
    'Actions=new-empty-window;',
    '',
    '[Desktop Action new-empty-window]',
    'Name=New Empty Window',
    `Exec=${exec} --new-window %F`,
    'Icon=osiris',
    '',
  ].join('\n');
}

/**
 * `sh` that drops the VS Code / Electron environment a *parent* editor leaks into
 * a child process — most often when the user runs the launcher from another
 * VS Code's integrated terminal. Left in place, `VSCODE_NLS_CONFIG`,
 * `VSCODE_CODE_CACHE_PATH`, `VSCODE_IPC_HOOK`, `ELECTRON_RUN_AS_NODE`, … point
 * the fresh Osiris process at the parent's install and caches.
 *
 * Only the top-level GUI launcher scrubs — Osiris sets these vars for its own
 * child processes afterwards, and the `bin/osiris` CLI keeps `VSCODE_IPC_HOOK_CLI`
 * so `osiris <file>` still opens in a running window.
 */
export function envScrubPreamble() {
  return `# Drop inherited VS Code / Electron env (e.g. launched from another editor's terminal)
for _v in $(env | sed -n 's/^\\(VSCODE_[A-Za-z0-9_]*\\)=.*/\\1/p'); do unset "$_v"; done
unset ELECTRON_RUN_AS_NODE ELECTRON_NO_ATTACH_CONSOLE VSCODE_PORTABLE
`;
}

/**
 * The AppImage `AppRun` entrypoint.
 *
 * Electron's SUID sandbox helper can't be `chmod 4755 root` inside a read-only
 * squashfs, so on a host where unprivileged user namespaces are also locked down
 * (`kernel.unprivileged_userns_clone=0`, or AppArmor's
 * `kernel.apparmor_restrict_unprivileged_userns=1` on Ubuntu 24.04+) Chromium
 * would abort with `FATAL:setuid_sandbox_host.cc`. Detect that and fall back to
 * `--no-sandbox` rather than failing to launch. `OSIRIS_SANDBOX=1` forces the
 * sandbox on; `OSIRIS_SANDBOX=0` forces it off.
 */
export function appRunScript() {
  return `#!/bin/sh
# Osiris IDE — AppImage entrypoint
HERE="$(dirname "$(readlink -f "$0")")"
APP="$HERE/${APP_PREFIX}"
export PATH="$APP/bin:$PATH"

${envScrubPreamble()}
userns_ok() {
  [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)" != "0" ] || return 1
  [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" != "1" ] || return 1
  return 0
}

SANDBOX_FLAG=""
case "\${OSIRIS_SANDBOX:-auto}" in
  0) SANDBOX_FLAG="--no-sandbox" ;;
  1) SANDBOX_FLAG="" ;;
  *) [ -u "$APP/chrome-sandbox" ] || userns_ok || SANDBOX_FLAG="--no-sandbox" ;;
esac

exec "$APP/osiris" $SANDBOX_FLAG "$@"
`;
}

/**
 * `meta/snap.yaml` for a classic-confinement dump snap. Classic confinement runs
 * in the host namespace (needed: Osiris shells out to host toolchains and the
 * bundled Electron isn't relocatable), so the snap installs with
 * `--dangerous --classic` and is not intended for Store upload as-is.
 *
 * @param {string} version  the upstream release string, e.g. `1.94.2.24286`
 * @param {string} [grade]  `stable` (default) or `devel`
 */
export function snapMeta(version, grade = 'stable') {
  return `name: osiris
version: '${version}'
summary: Osiris IDE — a rebranded VSCodium build
description: |
  Osiris IDE is a rebrand of the VSCodium prebuilt: the same editor, with the
  Osiris product identity, icons and Open VSX gallery.

  Installed with classic confinement — it has full access to the host, exactly
  like the VSCodium snap.
base: core22
confinement: classic
grade: ${grade}
apps:
  osiris:
    command: bin/osiris-launch
    environment:
      DISABLE_WAYLAND: '1'
`;
}

/** Snap `command` wrapper: scrub inherited editor env, then exec the CLI shim. */
export function snapLauncher() {
  return `#!/bin/sh
${envScrubPreamble()}exec "$SNAP/${APP_PREFIX}/bin/osiris" "$@"
`;
}

/**
 * `.deb` `postinst`: set the setuid bit on Electron's sandbox helper so
 * `osiris` runs sandboxed out of the box. Unlike the AppImage (`appRunScript`
 * detects a locked-down userns at launch and falls back to `--no-sandbox`)
 * or the `.tar.gz` (README tells the user to `chmod` it by hand), a `.deb` is
 * a real system install and can just fix the permission once, at install time.
 */
export function debPostinst() {
  return `#!/bin/sh
set -e
chmod 4755 /${APP_PREFIX}/chrome-sandbox 2>/dev/null || true
exit 0
`;
}

/** Same fix as `debPostinst()`, as an RPM `%post` scriptlet body. */
export function rpmPost() {
  return `chmod 4755 /${APP_PREFIX}/chrome-sandbox 2>/dev/null || true\n`;
}

/**
 * Shared library packages the branded VSCodium prebuilt needs from the host —
 * Electron/Chromium is not fully self-contained the way the AppImage/snap
 * wrappers are. Mirrors upstream VS Code's/VSCodium's own `.deb` dependency
 * list; best-effort, revisit if upstream's Electron version moves the goalposts.
 */
export const RUNTIME_DEB_DEPENDS = [
  'ca-certificates',
  'git',
  'libasound2',
  'libgbm1',
  'libgtk-3-0',
  'libnotify4',
  'libnspr4',
  'libnss3',
  'libsecret-1-0',
  'libx11-xcb1',
  'libxkbfile1',
  'libxss1',
  'libxtst6',
  'xdg-utils',
];

/** Same runtime set, RPM package naming (Fedora/RHEL-family). */
export const RUNTIME_RPM_REQUIRES = [
  'alsa-lib',
  'at-spi2-atk',
  'git',
  'gtk3',
  'libnotify',
  'libsecret',
  'libX11-xcb',
  'libxkbfile',
  'libXScrnSaver',
  'libXtst',
  'mesa-libgbm',
  'nspr',
  'nss',
  'xdg-utils',
];

/**
 * Docker Engine alternatives for the `Depends`/`Requires` line — see spec
 * §6.7: Osiris always works through `kind`, and Docker is purely `kind`'s own
 * runtime dependency, but it still has to be an *installed* dependency of the
 * Osiris package itself (kind needs a container engine present). `kind` and
 * `kubectl` are deliberately NOT listed here: neither ships a package in any
 * distro's default repos (or Docker's/Podman's own repos), so they can't be
 * expressed as a package dependency — `osiris doctor` has to detect and
 * report those missing at runtime instead.
 */
export const DOCKER_DEB_ALTERNATIVES = ['docker-ce', 'docker.io', 'podman-docker'];
export const DOCKER_RPM_ALTERNATIVES = ['docker-ce', 'docker', 'moby-engine', 'podman-docker'];

/**
 * `DEBIAN/control` for the `.deb` wrapper.
 *
 * @param {object} opts
 * @param {string} opts.version  upstream release string, e.g. `1.94.2.24286`
 * @param {string} [opts.arch]   Debian architecture, default `amd64`
 */
export function debControl({ version, arch = 'amd64' }) {
  const depends = [...RUNTIME_DEB_DEPENDS, DOCKER_DEB_ALTERNATIVES.join(' | ')].join(', ');
  return `Package: osiris
Version: ${version}
Section: devel
Priority: optional
Architecture: ${arch}
Maintainer: Osiris IDE <noreply@osiris.dev>
Depends: ${depends}
Homepage: https://github.com/osiris-ide/osiris
Description: Osiris IDE — a rebranded VSCodium build
 Osiris IDE is a rebrand of the VSCodium prebuilt: the same editor, with the
 Osiris product identity, icons and Open VSX gallery. Requires a working
 Docker (or Podman) install — Osiris always delegates project/session work to
 a local kind Kubernetes cluster, and kind itself runs on top of Docker.
`;
}

/**
 * RPM `.spec` for the `.rpm` wrapper. Packages an already-built tree (no
 * compile step): `%install` is a no-op and `_missing_build_ids_terminate_build`
 * is disabled because the bundled Electron/Chromium binaries carry no ELF
 * build-id, which recent `rpmbuild` otherwise treats as a fatal QA error.
 *
 * @param {object} opts
 * @param {string} opts.version   upstream release string, e.g. `1.94.2.24286`
 * @param {string} [opts.release] RPM release field, default `1`
 * @param {string} [opts.arch]    RPM architecture, default `x86_64`
 */
export function rpmSpec({ version, release = '1', arch = 'x86_64' }) {
  const requires = [...RUNTIME_RPM_REQUIRES, `(${DOCKER_RPM_ALTERNATIVES.join(' or ')})`]
    .map((r) => `Requires: ${r}`)
    .join('\n');
  return `%global debug_package %{nil}
%global __os_install_post %{nil}
%global _missing_build_ids_terminate_build 0
AutoReqProv: no

Name: osiris
Version: ${version}
Release: ${release}
Summary: Osiris IDE — a rebranded VSCodium build
License: MIT
URL: https://github.com/osiris-ide/osiris
BuildArch: ${arch}
${requires}

%description
Osiris IDE is a rebrand of the VSCodium prebuilt: the same editor, with the
Osiris product identity, icons and Open VSX gallery. Requires a working
Docker (or Podman) install -- Osiris always delegates project/session work to
a local kind Kubernetes cluster, and kind itself runs on top of Docker.

%install
true

%post
${rpmPost()}
%files
/usr/bin/osiris
/usr/share/osiris
/usr/share/applications/osiris.desktop
/usr/share/icons/hicolor/512x512/apps/osiris.png

%changelog
`;
}
