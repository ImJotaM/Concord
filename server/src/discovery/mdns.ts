import os from 'os';
import { Bonjour } from 'bonjour-service';

export function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (netList) {
      for (const net of netList) {
        // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
  }

  // Prioritize Wi-Fi / Ethernet subnets (192.168.x.x, 10.x.x.x, 172.x.x.x) over VPNs
  addresses.sort((a, b) => {
    const isALan = a.startsWith('192.168.') || a.startsWith('10.');
    const isBLan = b.startsWith('192.168.') || b.startsWith('10.');
    if (isALan && !isBLan) return -1;
    if (!isALan && isBLan) return 1;
    return 0;
  });

  return addresses;
}

export function startMdnsBroadcaster(port: number, serverName: string = 'Concord LAN Server') {
  try {
    const bonjour = new Bonjour();
    const service = bonjour.publish({
      name: serverName,
      type: 'concord',
      port: port,
      txt: {
        version: '1.0.0',
        platform: os.platform(),
        hostname: os.hostname(),
      },
    });

    service.on('up', () => {
      console.log(`📡 mDNS Broadcast active: "${serverName}" published on local network.`);
    });

    service.on('error', (err) => {
      console.warn('mDNS warning (LAN clients can still connect via IP):', err.message);
    });

    return bonjour;
  } catch (err: any) {
    console.warn('Could not initialize mDNS broadcast:', err?.message || err);
    return null;
  }
}
