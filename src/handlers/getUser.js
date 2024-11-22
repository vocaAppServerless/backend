const { MongoClient } = require("mongodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
require("dotenv").config();

// 환경변수 설정
const env = process.env.ENV;
const user = process.env.MONGODB_USER;
const password = process.env.MONGODB_PASSWORD;
const host = process.env.MONGODB_HOST;
const port = process.env.MONGODB_PORT;
const dbName = process.env.MONGODB_DB;
let client;

// 비밀번호 및 기타 MongoDB 접속 정보
let secret;

const getSecretValue = async (client, secretName) => {
  try {
    const data = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: "AWSCURRENT",
      })
    );
    if (data.SecretString) {
      secret = JSON.parse(data.SecretString);
      return secret;
    } else {
      const buff = Buffer.from(data.SecretBinary, "base64");
      secret = JSON.parse(buff.toString("ascii"));
      return secret;
    }
  } catch (error) {
    console.error("Error retrieving secret: ", error);
    throw new Error("Unable to retrieve secret value");
  }
};

// MongoDB URI 선택
const chooseDbUri = async () => {
  try {
    if (env === "dev") {
      return `mongodb://${user}:${password}@host.docker.internal:${port}/${dbName}`;
    } else {
      const secretName = "eng_voca/mongodb";
      const region = "ap-northeast-2";
      client = new SecretsManagerClient({ region });

      const secret = await getSecretValue(client, secretName);
      return `mongodb://${secret.MONGODB_USER}:${encodeURIComponent(
        secret.MONGODB_PASSWORD
      )}@${secret.MONGODB_HOST}:${secret.MONGODB_PORT}/${dbName}`;
    }
  } catch (error) {
    console.error("Error in chooseDbUri: ", error);
    throw new Error("Error while choosing DB URI");
  }
};

// MongoDB 연결 후 사용자 정보 조회
const getUserByEmail = async (email) => {
  let dbUri = await chooseDbUri();
  const mongoClient = new MongoClient(dbUri);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const usersCollection = db.collection("users");

    // 이메일로 사용자 조회
    const user = await usersCollection.findOne({ email });

    return user;
  } catch (error) {
    console.error("Error fetching user by email:", error);
    throw new Error("Error fetching user from MongoDB");
  } finally {
    await mongoClient.close();
  }
};

// 사용자를 가입/로그인/차단 처리
const handleUserAuth = async (email, accessToken, refreshToken) => {
  const user = await getUserByEmail(email);

  if (user) {
    if (user.isBanned) {
      // 차단된 사용자 처리
      return {
        statusCode: 200,
        body: JSON.stringify({
          authResponse: "get out",
          email: email,
        }),
      };
    } else {
      // 기존 사용자 로그인 성공
      return {
        statusCode: 200,
        body: JSON.stringify({
          authResponse: "signIn success",
          email: email,
          tokens: { access_token: accessToken, refresh_token: refreshToken },
        }),
      };
    }
  } else {
    // 비회원 처리 (회원가입)
    const newUser = {
      email: email,
      accessToken: accessToken,
      refreshToken: refreshToken,
      isBanned: false, // 기본적으로 가입 시 차단되지 않음
      createdAt: new Date().toISOString(),
    };

    // DB에 새 사용자 추가
    await signUpUser(newUser);

    return {
      statusCode: 200,
      body: JSON.stringify({
        authResponse: "signUp success",
        email: email,
        tokens: { access_token: accessToken, refresh_token: refreshToken },
      }),
    };
  }
};

// 새 사용자 가입 처리
const signUpUser = async (user) => {
  let dbUri = await chooseDbUri();
  const mongoClient = new MongoClient(dbUri);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const usersCollection = db.collection("users");

    await usersCollection.insertOne(user);
  } catch (error) {
    console.error("Error signing up user to DB:", error);
    throw new Error("Error signing up user");
  } finally {
    await mongoClient.close();
  }
};

exports.handler = async (event) => {
  const queryParams = event.queryStringParameters;
  const requestType = queryParams.request;
  const authCode = queryParams.authCode;
  let response = { statusCode: 400, body: "Invalid request" };

  try {
    if (requestType === "clientId") {
      // 클라이언트 ID 요청 처리
      response = {
        statusCode: 200,
        body: JSON.stringify({
          authResponse: "getClientId success",
          clientId: process.env.GOOGLE_CLIENT_ID,
        }),
      };
    } else if (requestType === "sign") {
      if (!authCode) {
        throw new Error("authCode is required");
      }

      // 인증 코드를 통해 구글 API로 토큰 요청 및 사용자 확인
      // 이 부분은 실제 구현에 따라 다를 수 있습니다.
      const { accessToken, refreshToken, email } = await getGoogleTokens(
        authCode
      );

      // 사용자 처리 (로그인/가입/차단)
      response = await handleUserAuth(email, accessToken, refreshToken);
    } else {
      throw new Error("Invalid request type");
    }
  } catch (error) {
    console.error("Error in handler:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }

  return response;
};

// 인증 코드로 구글 토큰 받기 (예시)
const getGoogleTokens = async (authCode) => {
  // 실제 구글 API와의 연동을 통해 토큰을 받아오는 로직을 작성해야 합니다.
  // 이 예시에서는 가상의 데이터로 대체합니다.
  const accessToken = "sampleAccessToken";
  const refreshToken = "sampleRefreshToken";
  const email = "user@example.com"; // 구글 토큰에서 이메일을 추출하는 로직이 필요함.

  return { accessToken, refreshToken, email };
};
