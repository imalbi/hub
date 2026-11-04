import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrivateWords, scanContent } from './private-scanner.ts';

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
  ]) {
    const findings = scanContent('fixture.txt', `${homePath} ${comment}\n${homePath}`);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.line, 2);
  }
  for (const suffix of ['guard-private: allow', '// guard-private: allow   ', '<!-- guard-private: allow -->']) {
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
  assert.deepEqual(scanContent('fixture.txt', 'Acmeology and preAcme and Acme_suffix', words), []);
});

void test('private words treat regex metacharacters literally and use Unicode word boundaries', () => {
  assert.equal(scanContent('fixture.txt', 'Use A+B.', ['A+B']).length, 1);
  assert.deepEqual(scanContent('fixture.txt', 'Use AAAB.', ['A+B']), []);
  assert.equal(scanContent('fixture.txt', 'Un CAFFÈ.', ['caffè']).length, 1);
  assert.deepEqual(scanContent('fixture.txt', 'caffèlatte', ['caffè']), []);
});
