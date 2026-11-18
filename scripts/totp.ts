/** Dev helper: prints the current TOTP code of an admin. `make totp email=…` */
import { prisma } from '../lib/db';
import { decrypt } from '../lib/crypto';
import { totpCode } from '../lib/auth/totp';

const email = process.argv[2];
if (!email) {
  console.error('Usage: tsx scripts/totp.ts <admin email>');
  process.exit(1);
}
const admin = await prisma.adminUser.findUnique({ where: { email } });
if (!admin?.totpSecretEnc) {
  console.error(`No TOTP secret for ${email}`);
  process.exit(1);
}
console.log(totpCode(decrypt(admin.totpSecretEnc)));
await prisma.$disconnect();
