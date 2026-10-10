const path = require('node:path');
const utils = require('./release-utils.cjs');

async function main() {
  const version = utils.packageVersion(path.resolve(__dirname, '..'));
  const [command, value, directory] = process.argv.slice(2);
  switch (command) {
    case 'tag':
      utils.validateTag(value, version);
      console.log(`Version verified: ${value}`);
      break;
    case 'host':
      utils.verifyHost(value);
      console.log(`Runner verified: ${value}`);
      break;
    case 'verify':
      console.log(await utils.verifyPackage(path.resolve(__dirname, '..'), version, value));
      break;
    case 'collect':
      utils.validateTag(value, version);
      console.log((await utils.verifyDownloads(path.resolve(directory || 'release-assets'), version)).join('\n'));
      break;
    default:
      throw new Error('Usage: node scripts/release.cjs tag <vVERSION> | host <platform> | verify <platform> | collect <vVERSION> [directory]');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
