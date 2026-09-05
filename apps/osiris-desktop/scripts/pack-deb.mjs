#!/usr/bin/env node
/**
 * Wrap a branded linux-x64 prebuilt tree into an installable `.deb`.
 *
 *   node scripts/pack-deb.mjs                       # .build/linux-x64 → dist_electron/
 *   node scripts/pack-deb.mjs <sourceTree> <out>    # explicit paths
 *
 * Built natively with `dpkg-deb --build` (part of `dpkg`, present on any
 * Debian/Ubuntu host) — no fpm, no electron-builder. See `debControl` in
 * `pack-linux.mjs` for the `Depends` line: the runtime shared libraries
 * Electron needs from the host, plus Docker/Podman (kind's own dependency —
 * see spec §6.7).
 */
import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appRoot, readUpstreamConfig, stageDir } from './lib.mjs';
import { debControl, debPostinst } from './pack-linux.mjs';
import { buildWrapperRoot } from './pack-tree.mjs';

export async function packDeb(sourceTree, out) {
  const { release } = await readUpstreamConfig();
  const staging = `${out}.staging`;
  const root = `${out}.pkgroot`;
  await rm(staging, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await buildWrapperRoot(sourceTree, staging, { topLevelExtras: false });

  await mkdir(root, { recursive: true });
  await cp(path.join(staging, 'usr'), path.join(root, 'usr'), { recursive: true });
  await rm(staging, { recursive: true, force: true });

  const bin = path.join(root, 'usr', 'bin');
  await mkdir(bin, { recursive: true });
  await symlink('../share/osiris/bin/osiris', path.join(bin, 'osiris'));

  const debian = path.join(root, 'DEBIAN');
  await mkdir(debian, { recursive: true });
  await writeFile(path.join(debian, 'control'), debControl({ version: release }));
  const postinst = path.join(debian, 'postinst');
  await writeFile(postinst, debPostinst());
  await chmod(postinst, 0o755);

  await mkdir(path.dirname(out), { recursive: true });
  await rm(out, { recursive: true, force: true });
  execFileSync('dpkg-deb', ['--root-owner-group', '--build', root, out], { stdio: 'inherit' });
  await rm(root, { recursive: true, force: true });
  console.log(`[osiris-desktop] ${path.relative(appRoot, out)}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [tree, out] = process.argv.slice(2);
  const { release } = await readUpstreamConfig();
  await packDeb(
    tree ?? stageDir('linux-x64'),
    out ?? path.join(appRoot, 'dist_electron', `Osiris-linux-x64-${release}_amd64.deb`),
  );
}
