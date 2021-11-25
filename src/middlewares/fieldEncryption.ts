import {
  decryptString,
  encryptString,
  findKeyForMessage,
  makeKeychain,
} from "@47ng/cloak";

interface MiddlewareParams<Models, Actions> {
  model?: Models;
  action: Actions;
  args: any;
  dataPath: string[];
  runInTransaction: boolean;
}

export interface Configuration<Models extends string> {
  fields: Record<`${Models}.${string}`, true>;
  encryptionKey?: string;
  decryptionKeys?: string[];
}

interface EncryptionConfiguration {
  encryptOnWrite: boolean;
  decryptOnRead: boolean;
}

// todo: Export and test
function configureEncryption<Models extends string, Actions extends string>(
  params: MiddlewareParams<Models, Actions>,
  config: Configuration<Models>
): EncryptionConfiguration {
  if (!params.model) {
    // Model is not available for raw SQL & execute.
    // For now those operations are not supported.
    return {
      encryptOnWrite: false,
      decryptOnRead: false,
    };
  }

  const action = String(params.action);
  const model = String(params.model);

  const hasModel = Object.entries(config.fields).some(
    ([key, value]) => key.split(".")[0] === model && value === true
  );

  if (["findUnique", "findFirst"].includes(action)) {
    // Read-only queries
    return {
      encryptOnWrite: false,
      decryptOnRead: true,
    };
  }
  if (["create", "update", "upsert"].includes(action)) {
    // Write queries (includes decryption for returned data)
    return {
      encryptOnWrite: hasModel,
      decryptOnRead: true,
    };
  }
  return {
    encryptOnWrite: false,
    decryptOnRead: false,
  };
}

function getFieldsForModel<Models extends string>(
  model: Models | undefined,
  config: Configuration<Models>
) {
  if (!model) {
    return [];
  }
  return Object.keys(config.fields)
    .filter((modelField) => modelField.startsWith(`${model}.`))
    .map((modelField) => modelField.split(".")[1]);
}

export function fieldEncryptionMiddleware<
  Models extends string,
  Actions extends string
>(config: Configuration<Models>) {
  const encryptionKey =
    config.encryptionKey || process.env.PRISMA_FIELD_ENCRYPTION_KEY;

  if (!encryptionKey) {
    console.warn(
      "[prisma-field-encryption] No encryption key provided, fieldEncryptionMiddleware is disabled."
    );
    return async (params: any, next: (params: any) => Promise<any>) => {
      return next(params);
    };
  }

  const decryptionKeysFromEnv = (process.env.PRISMA_FIELD_DECRYPTION_KEYS ?? "")
    .split(",")
    .filter(Boolean);

  const decryptionKeys: string[] = Array.from(
    new Set([
      encryptionKey,
      ...(config.decryptionKeys ?? decryptionKeysFromEnv),
    ])
  );

  const keychainPromise = makeKeychain(decryptionKeys);

  return async (
    params: MiddlewareParams<Models, Actions>,
    next: (params: MiddlewareParams<Models, Actions>) => Promise<any>
  ) => {
    const { encryptOnWrite, decryptOnRead } = configureEncryption(
      params,
      config
    );

    const logger =
      process.env.PRISMA_FIELD_ENCRYPTION_LOG === "false"
        ? {
            log: (_args: any) => {},
            info: (_args: any) => {},
            dir: (_args: any) => {},
            error: console.error, // Still log errors
            warn: console.warn, // and warnings
          }
        : console;

    const fieldsToWorkOn = getFieldsForModel(params.model, config);
    const operation = `${params.model}.${params.action}`;

    logger.info("------------------------------------------------------------");
    logger.dir(
      {
        _: `${operation} - fieldEncryptionMiddleware - pre-encrypt`,
        config,
        context: {
          encryptionKey,
          decryptionKeys,
          decryptionKeysFromEnv,
          encryptOnWrite,
          decryptOnRead,
          fieldsToWorkOn,
        },
        params,
      },
      { depth: Infinity }
    );

    if (encryptOnWrite && fieldsToWorkOn.length > 0) {
      // todo: Add support for nested encrypted fields
      // todo: Add support for Many writes
      await Promise.all(
        fieldsToWorkOn
          .filter((field) => typeof params.args?.data?.[field] === "string")
          .map(async (field) => {
            params.args.data[field] = await encryptString(
              params.args.data[field],
              encryptionKey
            );
          })
      );
    }

    logger.dir(
      {
        _: `${operation} - fieldEncryptionMiddleware - before next`,
        params,
      },
      { depth: Infinity }
    );

    const result = await next(params);

    logger.dir(
      {
        _: `${operation} - fieldEncryptionMiddleware - after next`,
        result,
      },
      { depth: Infinity }
    );

    if (decryptOnRead && fieldsToWorkOn.length > 0) {
      const keychain = await keychainPromise;
      await Promise.all(
        fieldsToWorkOn
          .filter((field) => typeof result[field] === "string")
          .map(async (field) => {
            const ciphertext = result[field];
            try {
              const decryptionKey = findKeyForMessage(ciphertext, keychain);
              result[field] = await decryptString(result[field], decryptionKey);
            } catch (error) {
              logger.error(
                `[prisma-field-encryption] Error decrypting field ${params.model}.${field}: ${error} (fallback: passing through)`
              );
              return ciphertext; // pass-through on errors
            }
          })
      );
    }

    logger.dir(
      {
        _: `${operation} - fieldEncryptionMiddleware - post-decrypt`,
        result,
      },
      { depth: Infinity }
    );
    return result;
  };
}
