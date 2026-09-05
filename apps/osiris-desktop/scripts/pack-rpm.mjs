#!/usr/bin/env node
/**
 * Wrap a branded linux-x64 prebuilt tree into an installable `.rpm`.
 *
 *   node scripts/pack-rpm.mjs                       # .build/linux-x64 → dist_electron/
 *   node scripts/pack-rpm.mjs <sourceTree> <out>    # explicit paths
 *
 * Built natively with `rpmbuild -bb` against a pre-populated `--buildroot`
 * (no compile step — `%install` is a no-op, see `rpmSpec` in
 * `pack-linux.mjs`). Needs the `rpm-build` (Fedora/RHEL) or `rpm` (Debian/
 * Ubuntu, for cross-building) package on PATH.
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appRoot, readUpstreamConfig, stageDir } from './lib.mjs';
import { rpmSpec } from './pack-linux.mjs';
import { buildWrapperRoot } from './pack-tree.mjs';

export async function packRpm(sourceTree, out) {
  const { release: version } = await readUpstreamConfig();
  const work = `${out}.rpmwork`;
  const root = path.join(work, 'buildroot');
  await rm(work, { recursive: true, force: true });
  await buildWrapperRoot(sourceTree, root, { topLevelExtras: false });

  const bin = path.join(root, 'usr', 'bin');
  await mkdir(bin, { recursive: true });
  await symlink('../share/osiris/bin/osiris', path.join(bin, 'osiris'));

  const specDir = path.join(work, 'SPECS');
  await mkdir(specDir, { recursive: true });
  const specFile = path.join(specDir, 'osiris.spec');
  await writeFile(specFile, rpmSpec({ version }));

  const rpmDir = path.join(work, 'RPMS');
  await mkdir(rpmDir, { recursive: true });

  execFileSync(
    'rpmbuild',
    [
      '--define', `_topdir ${work}`,
      '--define', `_rpmdir ${rpmDir}`,
      '--buildroot', root,
      '--target', 'x86_64',
      '-bb', specFile,
    ],
    { stdio: 'inherit' },
  );

  const arch = path.join(rpmDir, 'x86_64');
  const built = (await readdir(arch)).find((f) => f.endsWith('.rpm'));
  if (!built) throw new Error(`[osiris-desktop] rpmbuild produced no .rpm under ${arch}`);

  await mkdir(path.dirname(out), { recursive: true });
  await rm(out, { recursive: true, force: true });
  await cp(path.join(arch, built), out);
  await rm(work, { recursive: true, force: true });
  console.log(`[osiris-desktop] ${path.relative(appRoot, out)}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [tree, out] = process.argv.slice(2);
  const { release } = await readUpstreamConfig();
  await packRpm(
    tree ?? stageDir('linux-x64'),
    out ?? path.join(appRoot, 'dist_electron', `Osiris-linux-x64-${release}.x86_64.rpm`),
  );
}
