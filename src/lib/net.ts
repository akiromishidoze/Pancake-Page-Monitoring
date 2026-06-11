export function netmask(cidr: string, ip: string): boolean {
  const [range, bits = '32'] = cidr.split('/');
  const mask = ~(2 ** (32 - Number(bits)) - 1);

  const ipInt = ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0);
  const rangeInt = range.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0);

  return (ipInt & mask) === (rangeInt & mask);
}
