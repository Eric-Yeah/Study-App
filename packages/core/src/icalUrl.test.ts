import { describe, expect, it } from 'vitest';
import { checkIcalUrl, isPrivateIp, normalizeIcalUrl } from './icalUrl';

describe('Adresse eines Kalender-Abos', () => {
  it('nimmt öffentliche https-Adressen an und macht webcal:// zu https://', () => {
    const r = checkIcalUrl('webcal://moodle.example-uni.de/calendar/export_execute.php?userid=1&authtoken=abc');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.startsWith('https://moodle.example-uni.de/')).toBe(true);
      expect(r.host).toBe('moodle.example-uni.de');
    }
    expect(normalizeIcalUrl('  WEBCAL://a.de/x ')).toBe('https://a.de/x');
    expect(checkIcalUrl('https://campus.uni.de:443/plan.ics').ok).toBe(true);
  });

  it('lehnt alles Unsichere ab', () => {
    const reason = (u: string) => {
      const r = checkIcalUrl(u);
      return r.ok ? 'ok' : r.reason;
    };
    expect(reason('http://uni.de/plan.ics')).toBe('not_https');
    expect(reason('ftp://uni.de/plan.ics')).toBe('not_https');
    expect(reason('https://user:pw@uni.de/plan.ics')).toBe('credentials');
    expect(reason('https://uni.de:8443/plan.ics')).toBe('port');
    expect(reason('https://localhost/plan.ics')).toBe('host');
    expect(reason('https://intern/plan.ics')).toBe('host');
    expect(reason('https://drucker.local/plan.ics')).toBe('host');
    expect(reason('https://db.internal/plan.ics')).toBe('host');
    expect(reason('https://127.0.0.1/plan.ics')).toBe('host');
    expect(reason('https://2130706433/plan.ics')).toBe('host'); // 127.0.0.1 als Zahl
    expect(reason('https://0x7f.0.0.1/plan.ics')).toBe('host');
    expect(reason('https://169.254.169.254/latest/meta-data')).toBe('host');
    expect(reason('https://[::1]/plan.ics')).toBe('host');
    expect(reason('https://[fd00::1]/plan.ics')).toBe('host');
    expect(reason('nonsense')).toBe('invalid');
    expect(reason('')).toBe('invalid');
    expect(reason(`https://uni.de/${'a'.repeat(2100)}`)).toBe('too_long');
  });
});

describe('Nicht öffentliche IP-Adressen', () => {
  it('IPv4', () => {
    for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '198.18.0.1', '224.0.0.1', '255.255.255.255']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.0.1', '93.184.216.34']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it('IPv6, auch mit eingebetteter IPv4', () => {
    for (const ip of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a00:1', '64:ff9b::7f00:1', '2001:db8::1', '2002:7f00:1::', '2001:0:4136:e378::1', 'kaputt', '1.2.3']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});
