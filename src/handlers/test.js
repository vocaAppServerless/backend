const { MongoClient } = require("mongodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
require("dotenv").config();

const env = process.env.ENV;
const user = process.env.MONGODB_USER;
const password = process.env.MONGODB_PASSWORD;
const host = process.env.MONGODB_HOST;
const port = process.env.MONGODB_PORT;
const dbName = process.env.MONGODB_DB;

let secret;
let client;

console.log(env, "여기");

// 실행

const getSecretValue = async (client, secretName) => {
  try {
    const data = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: "AWSCURRENT",
      })
    );
    if (secret) {
      return secret;
    } else {
      if (data.SecretString) {
        secret = JSON.parse(data.SecretString);
        return secret;
      } else {
        const buff = Buffer.from(data.SecretBinary, "base64");
        secret = JSON.parse(buff.toString("ascii"));
        return secret;
      }
    }
  } catch (error) {
    console.error("Error retrieving secret: ", error);
    throw new Error("Unable to retrieve secret value");
  }
};

const chooseDbUri = async () => {
  try {
    if (env == "dev") {
      dbUri = `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@host.docker.internal:${process.env.MONGODB_PORT}/${process.env.MONGODB_DB}`;
      return dbUri;
    } else {
      const secretName = "eng_voca/mongodb";
      const region = "ap-northeast-2";
      client = new SecretsManagerClient({ region });

      const secret = await getSecretValue(client, secretName);
      dbUri = `mongodb://${secret.MONGODB_USER}:${encodeURIComponent(
        secret.MONGODB_PASSWORD
      )}@${secret.MONGODB_HOST}:${secret.MONGODB_PORT}/${secret.MONGODB_DB}`;
      return dbUri;
    }
  } catch (error) {
    console.error("Error in chooseDbUri: ", error);
    return error.message;
  }
};

exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;
  let dbUri = await chooseDbUri();

  console.log(dbUri);
  let client;

  if (requestType === "connectDb") {
    try {
      client = new MongoClient(dbUri);
      await client.connect();
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map((col) => col.name);

      return {
        statusCode: 200,
        body: JSON.stringify({ collections: collectionNames }),
      };
    } catch (error) {
      console.error("Error retrieving collections:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to fetch collections",
        }),
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  } else if (requestType === "connectLambda") {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "This is the connectLambda response!" }),
    };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "inavailable" }),
    };
  }
};
