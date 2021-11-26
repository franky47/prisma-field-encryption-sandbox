import { PrismaClient } from '@prisma/client'
import { fieldEncryptionMiddleware } from 'prisma-field-encryption'

const prisma = new PrismaClient()

prisma.$use(fieldEncryptionMiddleware())

async function main() {
  // Play with the Prisma API here, and report back:
  // https://github.com/47ng/prisma-field-encryption/issues/new
  //
  // Caveats & Limitations: you cannot filter on encrypted fields, eg:
  // prisma.user.findUnique({ where: { name: 'Super secret' }}) won't work.
  // Also, direct SQL operations with $execute and $raw are not supported.

  const USER_EMAIL = 'secret.spy@cia.gov'

  // Clean slate
  try {
    process.env.PRISMA_FIELD_ENCRYPTION_LOG = 'false'
    await prisma.user.delete({ where: { email: USER_EMAIL } })
    await prisma.post.deleteMany()
  } catch {}

  // Un-comment this line to see internal operations:
  // process.env.PRISMA_FIELD_ENCRYPTION_LOG = 'true'

  await prisma.user.create({
    data: {
      email: USER_EMAIL,
      name: 'Super secret',
    },
  })
  const superSecretSpy = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
  })
  await prisma.user.update({
    where: { email: USER_EMAIL },
    data: {
      name: 'Under cover',
    },
  })
  const underCoverSpy = await prisma.user.findFirst({
    where: { email: USER_EMAIL },
  })

  const report = await prisma.post.create({
    data: {
      author: {
        connect: {
          email: underCoverSpy?.email,
        },
      },
      title: 'Secret report',
      content: 'I have infiltrated the enemy base.',
    },
  })

  const assignmentPre = await prisma.post.create({
    data: {
      author: {
        connect: {
          email: underCoverSpy?.email,
        },
      },
      title: 'Your mission if you choose to accept it...',
      content: 'This encrypted field will self-destruct in the next operation',
    },
  })

  const assignmentPost = await prisma.post.update({
    where: {
      id: assignmentPre.id,
    },
    data: {
      content: null,
    },
  })

  const userUpdate = await prisma.user.update({
    where: { email: USER_EMAIL },
    data: {
      name: 'I am the enemy now',
      posts: {
        update: {
          where: {
            id: report.id,
          },
          data: {
            content: 'I hereby resign from my position, effective immediately.',
          },
        },
      },
    },
    include: {
      posts: {
        select: {
          title: true,
          content: true,
        },
      },
    },
  })

  const usersAndTheirPosts = await prisma.user.findMany({
    include: {
      posts: {
        select: {
          title: true,
          content: true,
        },
      },
    },
  })

  console.dir(
    {
      superSecretSpy,
      underCoverSpy,
      report,
      assignmentPre,
      assignmentPost,
      userUpdate,
      usersAndTheirPosts,
    },
    { depth: Infinity }
  )
}

main().finally(async () => {
  await prisma.$disconnect()
})
