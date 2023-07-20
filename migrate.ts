import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { PrismaClient } from './prisma-client'
import { migrate } from './prisma/data-migrations'

async function main() {
  const prisma = new PrismaClient().$extends(fieldEncryptionExtension())
  await migrate(prisma as PrismaClient)
}

main()
