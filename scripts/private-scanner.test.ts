import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { extractPngText, parsePrivateWords, scanContent } from './private-scanner.ts';

const homePath = ['', 'home', 'sample', 'Documents'].join('/');
const applePath = ['', 'Users', 'sample', 'Documents'].join('/');
const lanAddress = ['192', '168', '4', '20'].join('.');
const privateHost = ['desktop', 'local'].join('.');
const email = ['person', 'mail.invalid'].join('@');
const macAddress = ['AB', '12', 'CD', '34', 'EF', '56'].join(':');
const secret = 'ab12'.repeat(12);

const cases = [
  { rule: 'home-path', positive: homePath, negative: '~/Documents' },
  { rule: 'home-path', positive: applePath, negative: '/usr/share/fonts/' },
  { rule: 'private-ip', positive: lanAddress, negative: '192.0.2.20' },
  { rule: 'private-ip', positive: ['10', '0', '0', '4'].join('.'), negative: '198.51.100.4' },
  { rule: 'private-ip', positive: ['172', '16', '0', '1'].join('.'), negative: '172.15.0.1' },
  { rule: 'private-ip', positive: ['172', '31', '255', '254'].join('.'), negative: '172.32.0.1' },
  { rule: 'lan-hostname', positive: `https://${privateHost}/desk`, negative: 'https://example.com/desk' },
  { rule: 'mac-address', positive: macAddress, negative: 'AB:12:CD:34:EF' },
  { rule: 'mac-address', positive: macAddress.replaceAll(':', '-'), negative: 'AB-12-CD-34-EF' },
  { rule: 'email', positive: email, negative: 'person@example.com' },
  { rule: 'email', positive: email.toUpperCase(), negative: 'person@example.org' },
  { rule: 'email', positive: email, negative: 'person@test' },
  { rule: 'token', positive: `token = "${secret}"`, negative: `token = "${'ab12'.repeat(7)}"` },
  { rule: 'token', positive: `apiKey = "${'Az_9-Qw7'.repeat(5)}"`, negative: `checksum = "${secret}"` },
];

for (const [index, { rule, positive, negative }] of cases.entries()) {
  void test(`${rule} detects its positive sample and accepts its near negative (${index})`, () => {
    const findings = scanContent('fixture.txt', positive);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.rule, rule);
    assert.deepEqual(scanContent('fixture.txt', negative), []);
  });
}

void test('only valid private IPv4 addresses match, including at range boundaries', () => {
  for (const address of ['127.0.0.1', '203.0.113.1', '192.168.999.1', '110.0.0.1', '1172.16.0.1']) {
    assert.deepEqual(scanContent('fixture.txt', address), []);
  }
});

void test('sentence-ending periods do not hide an IP, LAN hostname or email', () => {
  for (const [value, rule] of [
    [lanAddress, 'private-ip'],
    [privateHost, 'lan-hostname'],
    [email, 'email'],
  ]) {
    for (const suffix of ['.', '...', '.)', '.\n']) {
      const findings = scanContent('prose.md', `Contact ${value}${suffix}`);
      assert.equal(findings.length, 1);
      assert.equal(findings[0]?.rule, rule);
    }
  }
});

void test('address boundaries still reject extra IP components and longer public domains', () => {
  for (const value of [
    `${lanAddress}.9`,
    `${privateHost}.example.org`,
    `${privateHost}-suffix`,
    `${privateHost}host`,
    ['person', 'example.com'].join('@') + '.',
  ]) {
    assert.deepEqual(scanContent('prose.md', value), []);
  }
});

void test('email allowlist does not accept a domain merely containing example.com', () => {
  assert.equal(scanContent('fixture.txt', ['person', 'example.com.invalid'].join('@'))[0]?.rule, 'email');
});

void test('package scopes, locked versions and CDN package URLs are not email addresses', () => {
  const source = [
    "import { test } from '@playwright/test';",
    '`@hub/server` and `@trpc/server`',
    'typescript@7.0.2:',
    'https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format/dist/index.js',
  ].join('\n');
  assert.deepEqual(scanContent('packages.txt', source), []);
});

void test('token hints are case insensitive and base64 padding does not expose the value', () => {
  const findings = scanContent('fixture.txt', `SECRET = "${'Ab09+/'.repeat(8)}=="`);
  assert.equal(findings[0]?.rule, 'token');
  assert.equal(findings.length, 1);
});

void test('a public checksum containing key by chance is not its own token hint', () => {
  const checksum = 'ab12'.repeat(8) + 'KEY' + 'ef34'.repeat(8);
  assert.deepEqual(scanContent('fixture.txt', `integrity: sha512-${checksum}`), []);
  assert.equal(scanContent('fixture.txt', `secret: ${checksum}`)[0]?.rule, 'token');
});

void test('a long descriptive token identifier still identifies the separate secret value', () => {
  const findings = scanContent('fixture.ts', `const veryLongAuthenticationTokenIdentifier = "${secret}";`); // guard-private: allow Long identifier regression fixture
  assert.ok(findings.some((finding) => finding.rule === 'token' && finding.masked === 'ab***'));
});

void test('reports correct file, line and masked match without returning sensitive content', () => {
  const findings = scanContent('fixture.txt', `safe\n${homePath}\n${email}`);
  assert.deepEqual(findings, [
    { file: 'fixture.txt', line: 2, rule: 'home-path', masked: '/h***' },
    { file: 'fixture.txt', line: 3, rule: 'email', masked: 'pe***' },
  ]);
  const report = JSON.stringify(findings);
  for (const value of [homePath, email]) assert.equal(report.includes(value), false);
});

void test('trailing allow comments require a reason and suppress only their own line', () => {
  for (const comment of [
    '// guard-private: allow Fake scanner fixture',
    '# guard-private: allow Fake scanner fixture',
    '-- guard-private: allow Fake scanner fixture',
    '<!-- guard-private: allow Fake scanner fixture -->',
    '/* guard-private: allow Fake scanner fixture */',
  ]) {
    const findings = scanContent('fixture.txt', `${homePath} ${comment}\n${homePath}`);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.line, 2);
  }
  for (const suffix of [
    'guard-private: allow',
    '// guard-private: allow   ',
    '<!-- guard-private: allow -->',
    '/* guard-private: allow */',
  ]) {
    assert.equal(scanContent('fixture.txt', `${homePath} ${suffix}`).length, 1);
  }
});

void test('an allow marker inside a quoted string is not a trailing comment', () => {
  assert.equal(scanContent('fixture.ts', `const token = "${secret} // guard-private: allow sample";`).length, 1);
});

void test('binary content is skipped when a NUL appears anywhere in the first 8 KiB', () => {
  const buffer = Buffer.concat([Buffer.from(homePath), Buffer.alloc(8000), Buffer.from(email)]);
  assert.deepEqual(scanContent('image.bin', buffer), []);
});

void test('text after the binary detection window is still scanned', () => {
  const buffer = Buffer.concat([Buffer.from('x'.repeat(8192) + '\n'), Buffer.from(homePath)]);
  assert.equal(scanContent('large.txt', buffer)[0]?.line, 2);
});

void test('private words ignore blank/comment lines and match whole words and phrases case insensitively', () => {
  const words = parsePrivateWords('# private terms\n\nSample Person\n  Acme  \nAcme\n');
  assert.deepEqual(words, ['Sample Person', 'Acme']);
  const findings = scanContent('fixture.txt', 'SAMPLE PERSON works at acme. Acmeology is public.', words);
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.rule === 'private-word'));
  assert.deepEqual(scanContent('fixture.txt', 'Acmeology and AcmeologySuffix', words), []);
});

function buildPng(chunks: Array<{ type: string; data: Buffer }>): Buffer {
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  const all = [{ type: 'IHDR', data: ihdrData }, ...chunks, { type: 'IEND', data: Buffer.alloc(0) }];
  const encoded = all.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, data, Buffer.alloc(4)]);
  });
  return Buffer.concat([magic, ...encoded]);
}

void test('expanded G1 rules detect IPv6 ULA/link-local, CGNAT, link-local IPv4, LAN hosts, BlueZ/dotted MACs, Windows paths, tokens, and Italian PII', () => {
  const cgnat = ['100', '64', '0', '1'].join('.');
  const linkLocal4 = ['169', '254', '10', '2'].join('.');
  const ipv6Ula = ['fd00', '1234', '', '1'].join(':');
  const ipv6Link = ['fe80', '', '1%eth0'].join(':');
  const bluezMac = ['dev', 'AA', 'BB', 'CC', 'DD', 'EE', 'FF'].join('_');
  const dottedMac = ['aa11', 'bb22', 'cc33'].join('.');
  const winPath = ['C:', 'Users', 'sample', 'Documents'].join('\\');
  const googleKey = ['AIza', '0'.repeat(35)].join('');
  const ghp = ['ghp_', 'aB12'.repeat(6)].join('');
  const ghPat = ['github_pat_', 'aB12_'.repeat(5)].join('');
  const openaiKey = ['sk-', 'proj-', 'Ab12'.repeat(6)].join('');
  const slackKey = ['xoxb', '123456', 'abcdef987654'].join('-');
  const tgToken = ['123456789', 'A'.repeat(35)].join(':');
  const pemKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('EC ');
  const bearer = ['Bearer ', 'aB09._~+-'.repeat(3)].join('');
  const pwHint = `password = "${'z9y8'.repeat(9)}"`;
  const phone = ['+39', '333', '1234567'].join(' ');
  const iban = ['IT60', 'X054', '2811', '1010', '0000', '0123', '456'].join(' ');
  const cf = ['RSSMRA', '85T10', 'A562S'].join('');

  const positives: Array<[string, string]> = [
    [cgnat, 'private-ip'],
    [linkLocal4, 'private-ip'],
    [ipv6Ula, 'private-ip'],
    [ipv6Link, 'private-ip'],
    [['router', 'lan'].join('.'), 'lan-hostname'],
    [['nas', 'home'].join('.'), 'lan-hostname'],
    [['printer', 'home', 'arpa'].join('.'), 'lan-hostname'],
    [['db', 'internal'].join('.'), 'lan-hostname'],
    [['laptop', 'ts', 'net'].join('.'), 'lan-hostname'],
    [['fritz', 'box'].join('.'), 'lan-hostname'],
    [['mesh', 'fritz', 'box'].join('.'), 'lan-hostname'],
    [bluezMac, 'mac-address'],
    [dottedMac, 'mac-address'],
    [winPath, 'home-path'],
    [googleKey, 'token'],
    [ghp, 'token'],
    [ghPat, 'token'],
    [openaiKey, 'token'],
    [slackKey, 'token'],
    [tgToken, 'token'],
    [pemKey, 'token'],
    [bearer, 'token'],
    [pwHint, 'token'],
    [phone, 'phone'],
    [iban, 'iban'],
    [cf, 'codice-fiscale'],
  ];
  for (const [sample, rule] of positives) {
    const found = scanContent('fixture.txt', sample);
    assert.ok(
      found.some((f) => f.rule === rule),
      `Expected ${rule} for synthetic sample`,
    );
  }

  const fakeSha256 = 'a'.repeat(64);
  const fakeUuid = '550e8400-e29b-41d4-a716-446655440000';
  const safeSamples = [
    fakeSha256,
    fakeUuid,
    ['::', '1'].join(''),
    ['2001', 'db8', '', '1'].join(':'),
    ['100', '128', '0', '1'].join('.'),
    ['169', '255', '0', '1'].join('.'),
    'Bearer ${token}',
  ];
  for (const safe of safeSamples) {
    assert.deepEqual(scanContent('fixture.txt', safe), [], safe);
  }
});

void test('obfuscated private words match camelCase, snake_case, URL encoding, line splits, filenames, and ignore allow comments', () => {
  const words = ['AcmeCorp', 'SecretWord'];
  assert.ok(scanContent('src/file.ts', 'const preAcmeCorp = true;', words).some((f) => f.rule === 'private-word'));
  assert.ok(scanContent('src/file.ts', 'const acme_corp_key = 1;', words).some((f) => f.rule === 'private-word'));
  assert.ok(
    scanContent('src/file.ts', 'https://example.org/q=Secret%20Word&x=Secret%5FWord', ['Secret Word', 'SecretWord'])
      .length >= 1,
  );
  assert.ok(
    scanContent('src/file.ts', 'prefix Secret\n  Word suffix', ['Secret Word']).some((f) => f.rule === 'private-word'),
  );
  assert.ok(
    scanContent('src/file.ts', 'prefix Secret-\n  Word suffix', ['SecretWord']).some((f) => f.rule === 'private-word'),
  );
  assert.ok(scanContent('docs/my-AcmeCorp-notes.txt', 'clean body', words).some((f) => f.rule === 'private-word'));

  const allowPrivateWord = scanContent(
    'src/file.ts',
    'const acmeCorp = 1; // guard-private: allow False test excuse',
    words,
  );
  assert.ok(allowPrivateWord.some((f) => f.rule === 'private-word'));
});

void test('PNG tEXt, compressed iTXt and zTXt metadata chunks are scanned for leaks and private words', () => {
  const iTXtPlain = Buffer.concat([Buffer.from('Author\0\0\0\0\0'), Buffer.from(homePath, 'utf8')]);
  const iTXtZ = Buffer.concat([Buffer.from('Note\0\x01\0\0\0'), deflateSync(Buffer.from(email, 'utf8'))]);
  const png = buildPng([
    { type: 'tEXt', data: Buffer.from(`Comment\0CustomWordValue`) },
    { type: 'iTXt', data: iTXtPlain },
    { type: 'iTXt', data: iTXtZ },
    {
      type: 'zTXt',
      data: Buffer.concat([
        Buffer.from('Desc\0\0'),
        deflateSync(Buffer.from(`https://${['router', 'lan'].join('.')}`)),
      ]),
    },
  ]);
  const extracted = extractPngText(png);
  assert.equal(extracted.length, 4);
  const findings = scanContent('shot.png', png, ['CustomWordValue']);
  const rules = new Set(findings.map((f) => f.rule));
  assert.ok(rules.has('private-word'));
  assert.ok(rules.has('home-path'));
  assert.ok(rules.has('email'));
  assert.ok(rules.has('lan-hostname'));
});

void test('private words treat regex metacharacters literally and use Unicode word boundaries', () => {
  assert.equal(scanContent('fixture.txt', 'Use A+B.', ['A+B']).length, 1);
  assert.deepEqual(scanContent('fixture.txt', 'Use AAAB.', ['A+B']), []);
  assert.equal(scanContent('fixture.txt', 'Un CAFFÈ.', ['caffè']).length, 1);
  assert.deepEqual(scanContent('fixture.txt', 'caffèlatte', ['caffè']), []);
});

void test('email allowlist permits public GitHub bot and noreply addresses without waiving generic github.com addresses', () => {
  for (const allowed of [
    'Signed-off-by: dependabot[bot] <support@github.com>',
    'noreply@github.com',
    '12345+octocat@users.noreply.github.com',
    'bot@noreply.github.com',
  ]) {
    assert.deepEqual(scanContent('commit-msg', allowed), [], allowed);
  }
  for (const blocked of [
    ['person', 'github.com'].join('@'),
    ['person', 'users.noreply.github.com.invalid'].join('@'),
  ]) {
    assert.equal(scanContent('fixture.txt', blocked)[0]?.rule, 'email', blocked);
  }
});
