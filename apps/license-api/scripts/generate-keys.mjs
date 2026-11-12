import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

console.log(
  JSON.stringify(
    {
      publicJwk: publicKey.export({ format: 'jwk' }),
      privateJwk: privateKey.export({ format: 'jwk' }),
    },
    null,
    2
  )
);
console.log('\nSet the privateJwk as Cloudflare secret ENTITLEMENT_PRIVATE_KEY_JWK.');
console.log('Commit only the publicJwk in the desktop entitlement verifier.');
