const fs = require('fs');
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const plist = require('plist');

const electronFuseConfig = {
  version: FuseVersion.V1,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
};

function findMacAppBundle(appOutDir) {
  return fs
    .readdirSync(appOutDir)
    .find((entry) => entry.endsWith('.app') && fs.statSync(path.join(appOutDir, entry)).isDirectory());
}

async function hardenElectronFuses(appBundlePath) {
  await flipFuses(appBundlePath, electronFuseConfig);
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appBundle = findMacAppBundle(context.appOutDir);
  if (!appBundle) {
    throw new Error(`Could not find macOS app bundle in ${context.appOutDir}`);
  }

  const appBundlePath = path.join(context.appOutDir, appBundle);
  await hardenElectronFuses(appBundlePath);

  const infoPlistPath = path.join(appBundlePath, 'Contents', 'Info.plist');
  const info = plist.parse(fs.readFileSync(infoPlistPath, 'utf8'));

  info.NSAppTransportSecurity = {
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: true,
    NSExceptionDomains: {
      localhost: {
        NSIncludesSubdomains: false,
        NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
      },
      '127.0.0.1': {
        NSIncludesSubdomains: false,
        NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
      },
    },
  };

  fs.writeFileSync(infoPlistPath, plist.build(info));
};
