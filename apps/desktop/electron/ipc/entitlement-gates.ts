import {
  evaluateEntitlementFeatures,
  type EntitlementFeature,
  type LicenseInfo,
} from '../license/types';

const SERVER_CREDENTIAL_FEATURES = ['ssh', 'sftp'] as const;

const CHANNEL_ENTITLEMENTS: Array<
  readonly [prefix: string, features: readonly EntitlementFeature[]]
> = [
  ['local:docker:', ['docker']],
  ['ssh:docker:', ['docker']],
  ['ssh:tunnel:', ['tunnel']],
  ['ssh:sftp:', ['sftp']],
  ['native-ssh:', ['ssh']],
  ['pty:', ['ssh']],
  ['ssh:', ['ssh']],
  ['sftp:', ['sftp']],
  ['s3:', ['s3']],
  ['db:s3:', ['s3']],
  ['db:hosts:', SERVER_CREDENTIAL_FEATURES],
  ['db:keys:', SERVER_CREDENTIAL_FEATURES],
  ['db:dbconnections:', ['database']],
  ['dbexplorer:', ['database']],
  ['redis:', ['database']],
  ['mongodb:', ['database']],
  ['db:tunnels:', ['tunnel']],
  ['db:snippets:', ['snippets']],
  ['file-picker:open-ssh-key', SERVER_CREDENTIAL_FEATURES],
  ['file-picker:open-sqlite-file', ['database']],
  ['vault:environments:deploy-to-sftp', ['sftp']],
];

export function getEntitlementFeaturesForChannel(
  channel: string
): readonly EntitlementFeature[] | null {
  return CHANNEL_ENTITLEMENTS.find(([prefix]) => channel.startsWith(prefix))?.[1] ?? null;
}

export function isChannelAllowedByLicenseInfo(channel: string, info: LicenseInfo): boolean {
  const requiredFeatures = getEntitlementFeaturesForChannel(channel);
  return !requiredFeatures || evaluateEntitlementFeatures(info, requiredFeatures).allowed;
}
