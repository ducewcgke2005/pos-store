const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const walk = (dir) =>
    fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
            entry.name === 'node_modules'
                ? []
                : entry.isDirectory()
                  ? walk(path.join(dir, entry.name))
                  : entry.name.endsWith('.js')
                    ? [path.join(dir, entry.name)]
                    : []
        );
let checked = 0;
for (const file of [
    ...walk(path.join(root, 'src')),
    ...walk(path.join(root, 'scripts')),
    ...walk(path.join(root, 'test'))
]) {
    const result = spawnSync(process.execPath, ['--check', file], {
        encoding: 'utf8',
        windowsHide: true
    });
    if (result.status !== 0) throw new Error(result.stderr);
    const source = fs.readFileSync(file, 'utf8');
    if (
        /[\\/](services|controllers|middlewares)[\\/]/.test(file) &&
        /require\(['"][^'"]*(?:\/models\/|mongoose|mssql|config\/database)/.test(
            source
        )
    )
        throw new Error(`Layer violation: ${file}`);
    if (
        file.includes(`${path.sep}src${path.sep}`) &&
        /require\(['"]mssql|\.query\s*\(|\.execute\s*\(/.test(source)
    )
        throw new Error(`SQL runtime remains: ${file}`);
    checked++;
}
require('../src/routes/index.route');
console.log(
    `Syntax, module loading and layer checks passed (${checked} JavaScript files).`
);
