const { MongoClient } = require("mongodb");
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

//------
// const {
//   SecretsManagerClient,
//   GetSecretValueCommand,
// } = require("@aws-sdk/client-secrets-manager");

// const secretName = "eng_voca/mongodb"; // 가져올 비밀 이름
// const region = "ap-northeast-2"; // AWS 리전

// const client = new SecretsManagerClient({ region });

// const getSecretValue = async () => {
//   try {
//     // 비밀을 가져오는 명령어 실행
//     const data = await client.send(
//       new GetSecretValueCommand({
//         SecretId: secretName,
//         VersionStage: "AWSCURRENT", // 최신 버전의 비밀을 가져옵니다.
//       })
//     );

//     // 비밀 값이 문자열로 제공되면 JSON으로 파싱
//     if (data.SecretString) {
//       const secret = JSON.parse(data.SecretString); // 문자열을 JSON으로 파싱
//       console.log("Secret:", secret);
//       return secret;
//     } else {
//       // 바이너리 데이터일 경우 Base64로 디코딩 후 처리
//       const buff = Buffer.from(data.SecretBinary, "base64");
//       const secret = JSON.parse(buff.toString("ascii")); // 바이너리를 문자열로 변환 후 JSON 파싱
//       return secret;
//     }
//   } catch (error) {
//     return error;
//   }
// };

// 실행

const getSecretValue = async (client, secretName) => {
  const { GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
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
      return secret;
    } else {
      const {
        SecretsManagerClient,
      } = require("@aws-sdk/client-secrets-manager");
      const secretName = "eng_voca/mongodb";
      const region = "ap-northeast-2";
      client = new SecretsManagerClient({ region });

      const secret = await getSecretValue(client, secretName);
      dbUri = `mongodb://${secret.MONGODB_USER}:${encodeURIComponent(
        secret.MONGODB_PASSWORD
      )}@${secret.MONGODB_HOST}:${secret.MONGODB_PORT}/${secret.MONGODB_DB}`;
      return secret;
    }
  } catch (error) {
    console.error("Error in chooseDbUri: ", error);
    return error;
  }
};

exports.handler = async (event) => {
  console.log("invoke!!여기야1");
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
          error: error.message,
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
      statusCode: 200,
      body: JSON.stringify(await chooseDbUri()),
    };
  }
};
