const { execFileSync } = require('node:child_process');
const { expo } = require('./app.json');
module.exports = () => {
  let revision = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  if (!revision) {
    try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  }
  return { ...expo, extra: { ...expo.extra, buildRevision: revision?.slice(0, 7) ?? 'local' } };
};
