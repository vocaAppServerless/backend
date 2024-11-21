const { MongoClient } = require("mongodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
require("dotenv").config();

let cachedSecret = null;
let cachedClient = null;

const getSecretAndDbUri = async () => {
  const env = process.env.ENV;
  const user = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;
  const host = process.env.MONGODB_HOST;
  const port = process.env.MONGODB_PORT;
  const dbName = process.env.MONGODB_DB;

  // 로컬 환경(dev, dev_sam)일 경우 .env에서 설정된 값을 사용
  if (env === "dev" || env === "dev_sam") {
    if (env === "dev_sam") {
      // dev_sam 환경일 때는 로컬 MongoDB 연결
      const dbUri = `mongodb://${user}:${password}@host.docker.internal:${port}/${dbName}`; // host.docker.internal 사용
      return { dbUri, dbName };
    }

    if (user && password && host && port && dbName) {
      // dev 환경에서는 사용자, 비밀번호와 함께 DB 연결
      const dbUri = `mongodb://${user}:${password}@${host}:${port}/${dbName}`;
      return { dbUri, dbName };
    } else {
      throw new Error(
        "Required environment variables not set for dev or dev_sam"
      );
    }
  } else {
    // AWS 환경에서만 cachedSecret이 존재할 수 있음
    if (cachedSecret) {
      // cachedSecret이 있으면 기존 비밀 값을 사용
      const {
        MONGODB_USER,
        MONGODB_PASSWORD,
        MONGODB_HOST,
        MONGODB_PORT,
        MONGODB_DB,
      } = cachedSecret;
      const dbUri = `mongodb://${MONGODB_USER}:${encodeURIComponent(
        MONGODB_PASSWORD
      )}@${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DB}`;
      return { dbUri, dbName: MONGODB_DB };
    } else {
      // cachedSecret이 없으면 Secrets Manager에서 값을 가져옴
      const secretName = "eng_voca/mongodb";
      const region = "ap-northeast-2";
      const client = new SecretsManagerClient({ region });

      try {
        const data = await client.send(
          new GetSecretValueCommand({
            SecretId: secretName,
            VersionStage: "AWSCURRENT",
          })
        );

        cachedSecret = data.SecretString
          ? JSON.parse(data.SecretString)
          : JSON.parse(
              Buffer.from(data.SecretBinary, "base64").toString("ascii")
            );

        const {
          MONGODB_USER,
          MONGODB_PASSWORD,
          MONGODB_HOST,
          MONGODB_PORT,
          MONGODB_DB,
        } = cachedSecret;
        const dbUri = `mongodb://${MONGODB_USER}:${encodeURIComponent(
          MONGODB_PASSWORD
        )}@${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DB}`;
        return { dbUri, dbName: MONGODB_DB };
      } catch (error) {
        console.error("Error retrieving secret:", error);
        throw new Error("Unable to retrieve secret value");
      }
    }
  }
};

const getMongoClient = async () => {
  if (!cachedClient) {
    const { dbUri } = await getSecretAndDbUri(); // DB URI를 받아옴
    cachedClient = new MongoClient(dbUri);
    await cachedClient.connect(); // 최초 연결만 수행
    console.log("MongoDB connected!", dbUri); // 연결된 URI를 출력 (디버깅용)
  } else {
    console.log("Reusing existing MongoDB connection.");
  }
  return cachedClient;
};

module.exports = { getSecretAndDbUri, getMongoClient };
