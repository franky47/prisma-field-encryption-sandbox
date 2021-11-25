# Sandbox repository for [`prisma-field-encryption`](https://github.com/47ng/prisma-field-encryption)

1. Install dependencies:

```shell
$ yarn install
```

2. Run the demo script:

```shell
$ yarn dev
```

3. Inspect the SQLite database (`./prisma/dev.db`) to see encrypted fields.

4. Edit `script.ts` to play with the API.

## Caveats & Limitations

Only the following Prisma operations are supported with encrypted models/fields for now:

- Read: `findUnique`, `findFirst`
- Write: `create`, `update`, `upsert`
- Other: `delete`

Other operations should pass-through and return ciphertext.
