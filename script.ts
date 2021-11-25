import { PrismaClient } from "@prisma/client";
import { fieldEncryptionMiddleware } from "./src/middlewares/fieldEncryption";

const prisma = new PrismaClient();

prisma.$use(
  fieldEncryptionMiddleware({
    fields: {
      // List what you want to encrypt as "{Model}.{field}": true
      "Post.content": true,
      "User.name": true,
    },
    // Generate keys: https://cloak.47ng.com
    encryptionKey: "k1.aesgcm256.OsqVmAOZBB_WW3073q1wU4ag0ap0ETYAYMh041RuxuI=",
  })
);

async function main() {
  // Play with the Prisma API here.
  // Supported operations on models with encrypted fields:
  // - create, update, upsert
  // - findUnique, findFirst
  // - delete
  // Note: extending results with `include` is not yet supported
  // (included models will show up encrypted)

  // Clean slate
  try {
    process.env.PRISMA_FIELD_ENCRYPTION_LOG = "false";
    await prisma.user.delete({ where: { email: "secret.spy@cia.gov" } });
  } catch {}

  // Un-comment this line to see internal operations:
  process.env.PRISMA_FIELD_ENCRYPTION_LOG = "true";

  await prisma.user.create({
    data: {
      email: "secret.spy@cia.gov",
      name: "Super secret",
    },
  });
  const superSecretSpy = await prisma.user.findUnique({
    where: { email: "secret.spy@cia.gov" },
  });
  await prisma.user.update({
    where: { email: "secret.spy@cia.gov" },
    data: {
      name: "Under cover",
    },
  });
  const underCoverSpy = await prisma.user.findFirst({
    where: { email: "secret.spy@cia.gov" },
  });

  const report = await prisma.post.create({
    data: {
      author: {
        connect: {
          email: underCoverSpy?.email,
        },
      },
      title: "Secret report",
      content: "I have infiltrated the enemy base.",
    },
  });

  console.dir(
    {
      superSecretSpy,
      underCoverSpy,
      report,
    },
    { depth: Infinity }
  );
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
