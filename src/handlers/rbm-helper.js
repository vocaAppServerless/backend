const { MongoClient } = require("mongodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
require("dotenv").config();

const awsDevSecretName = process.env.AWS_DEV_SECRET_NAME;
const awsDevSecretRegion = process.env.AWS_DEV_SECRET_REGION;

const getSecrets = async () => {
  const env = process.env.ENV;
  const user = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;
  const host = process.env.MONGODB_HOST;
  const port = process.env.MONGODB_PORT;
  const dbName = process.env.MONGODB_DB;
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;

  if (env === "dev" || env === "dev_sam") {
    let dbUri;

    if (env === "dev_sam") {
      dbUri = `mongodb://${user}:${password}@host.docker.internal:${port}/${dbName}`;
    } else if (
      env === "dev" &&
      user &&
      password &&
      host &&
      port &&
      dbName &&
      clientId &&
      clientSecret &&
      redirectUri
    ) {
      dbUri = `mongodb://${user}:${password}@${host}:${port}/${dbName}`;
    } else {
      throw new Error(
        "Required environment variables not set for dev or dev_sam"
      );
    }

    return {
      dbSecrets: { dbUri, dbName },
      oauthSecrets: { clientId, clientSecret, redirectUri },
    };
  } else {
    const secretName = awsDevSecretName;
    const region = awsDevSecretRegion;
    const client = new SecretsManagerClient({ region });

    try {
      const data = await client.send(
        new GetSecretValueCommand({
          SecretId: secretName,
          VersionStage: "AWSCURRENT",
        })
      );

      const rareSecrets = data.SecretString
        ? JSON.parse(data.SecretString)
        : JSON.parse(
            Buffer.from(data.SecretBinary, "base64").toString("ascii")
          );

      const user = rareSecrets.MONGODB_USER;
      const password = rareSecrets.MONGODB_PASSWORD;
      const host = rareSecrets.MONGODB_HOST;
      const port = rareSecrets.MONGODB_PORT;
      const dbName = rareSecrets.MONGODB_DB;
      const clientId = rareSecrets.OAUTH_CLIENT_ID;
      const clientSecret = rareSecrets.OAUTH_CLIENT_SECRET;
      const redirectUri = rareSecrets.OAUTH_REDIRECT_URI;

      const dbUri = `mongodb://${user}:${encodeURIComponent(
        password
      )}@${host}:${port}/${dbName}`;

      return {
        dbSecrets: { dbUri, dbName },
        oauthSecrets: { clientId, clientSecret, redirectUri },
      };
    } catch (error) {
      console.error("Error retrieving secret:", error);
      throw new Error("Unable to retrieve secret value in production");
    }
  }
};

const checkCachedSecrets = async (cachedSecrets) => {
  try {
    if (cachedSecrets.dbSecrets && cachedSecrets.oauthSecrets) {
      return { message: "there is cached secrets", secrets: cachedSecrets };
    } else {
      const nonCheckedSecrets = await getSecrets();
      if (!nonCheckedSecrets.dbSecrets || !nonCheckedSecrets.oauthSecrets) {
        throw new Error("There are some empty secrets from aws");
      } else {
        const secrets = nonCheckedSecrets;
        return {
          message: "there is cached secrets",
          secrets: secrets,
        };
      }
    }
  } catch (err) {
    throw new Error("Failed to retrieve or cache secrets: " + err.message);
  }
};

const getDb = async (cachedDb, cachedSecrets) => {
  try {
    if (cachedDb && cachedSecrets) {
      return {
        message: "there is already cached and connected client",
        db: cachedDb,
      };
    } else {
      const secrets = cachedSecrets;
      const { dbUri, dbName } = secrets.dbSecrets;

      const client = new MongoClient(dbUri);

      await client.connect();

      return {
        message: "there is new connected db",
        db: client.db(dbName),
      };
    }
  } catch (err) {
    console.error("Error connecting to MongoDB:", err.message);
    throw new Error("Failed to connect to MongoDB");
  }
};

module.exports = { getSecrets, checkCachedSecrets, getDb };
