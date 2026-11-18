import { generateKeyPairSync, sign } from 'node:crypto';

export type SelfSignedCertificate = { key: string; cert: string };

const ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const COMMON_NAME = '2.5.4.3';
const SUBJECT_ALTERNATIVE_NAME = '2.5.29.17';
const BASIC_CONSTRAINTS = '2.5.29.19';
const A_DAY = 24 * 60 * 60 * 1000;

function lengthOf(size: number): Buffer {
  if (size < 0x80) return Buffer.from([size]);
  const bytes: number[] = [];
  for (let rest = size; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return Buffer.from([0x80 + bytes.length, ...bytes]);
}

const tagged = (tag: number, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), lengthOf(body.length), body]);
};

const sequence = (...parts: Buffer[]) => tagged(0x30, ...parts);

function objectIdentifier(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
  const arcs = rest.flatMap((arc) => {
    const bytes = [arc % 128];
    for (let left = Math.floor(arc / 128); left > 0; left = Math.floor(left / 128)) bytes.unshift(0x80 + (left % 128));
    return bytes;
  });
  return tagged(0x06, Buffer.from([first * 40 + second, ...arcs]));
}

const utcTime = (at: Date) => tagged(0x17, Buffer.from(`${at.toISOString().slice(2, 19).replace(/[-:T]/g, '')}Z`));

const named = (commonName: string) => sequence(tagged(0x31, sequence(objectIdentifier(COMMON_NAME), tagged(0x0c, Buffer.from(commonName)))));

const extension = (identifier: string, value: Buffer) => sequence(objectIdentifier(identifier), tagged(0x04, value));

const pem = (label: string, der: Buffer) =>
  `-----BEGIN ${label}-----\n${(der.toString('base64').match(/.{1,64}/g) ?? []).join('\n')}\n-----END ${label}-----\n`;

export function aCertificateForLocalhost(now: Date = new Date()): SelfSignedCertificate {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const signedWith = sequence(objectIdentifier(ECDSA_WITH_SHA256));
  const localhost = named('localhost');
  const toBeSigned = sequence(
    tagged(0xa0, tagged(0x02, Buffer.from([2]))),
    tagged(0x02, Buffer.from([1])),
    signedWith,
    localhost,
    sequence(utcTime(new Date(now.getTime() - A_DAY)), utcTime(new Date(now.getTime() + A_DAY))),
    localhost,
    publicKey.export({ type: 'spki', format: 'der' }),
    tagged(
      0xa3,
      sequence(
        extension(BASIC_CONSTRAINTS, sequence(tagged(0x01, Buffer.from([0xff])))),
        extension(SUBJECT_ALTERNATIVE_NAME, sequence(tagged(0x82, Buffer.from('localhost')), tagged(0x87, Buffer.from([127, 0, 0, 1])))),
      ),
    ),
  );
  const signature = sign('sha256', toBeSigned, privateKey);
  const certificate = sequence(toBeSigned, signedWith, tagged(0x03, Buffer.from([0]), signature));
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), cert: pem('CERTIFICATE', certificate) };
}
