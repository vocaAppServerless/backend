const { MongoClient } = require("mongodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const axios = require("axios");
const jwt_decode = require("jwt-decode");
require("dotenv").config();

const awsDevSecretName = process.env.AWS_DEV_SECRET_NAME;
const awsDevSecretRegion = process.env.AWS_DEV_SECRET_REGION;

// secret funcs

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

  const validateRequiredEnvs = (vars) => {
    const missingVars = vars.filter((varName) => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
  };

  if (env === "dev" || env === "dev_sam") {
    validateRequiredEnvs([
      "MONGODB_USER",
      "MONGODB_PASSWORD",
      "MONGODB_HOST",
      "MONGODB_PORT",
      "MONGODB_DB",
      "OAUTH_CLIENT_ID",
      "OAUTH_CLIENT_SECRET",
      "OAUTH_REDIRECT_URI",
    ]);
    let dbUri;

    if (env === "dev_sam") {
      dbUri = `mongodb://${user}:${password}@host.docker.internal:${port}/${dbName}`;
    } else if (env === "dev") {
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

// db funcs

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

// auth funcs

const createAuthResult = (authResponse, userInfo, code) => {
  return {
    authResponse,
    userInfo, // 사용자 정보를 추가
    code,
  };
};

// 토큰 검증 함수
const verifyAccessToken = async (accessToken) => {
  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`;

    const response = await axios.get(url);
    return response; // access_token 정보 반환
  } catch (error) {
    console.error(`Error verifying access token:`, error.message);
    throw error;
  }
};

const calculateExpiryTime = (expiresIn) => {
  const currentTime = Math.floor(Date.now() / 1000); // 현재 시간(초 단위)
  const expiryTime = currentTime + expiresIn; // 만료 시간 계산
  return expiryTime; // 유닉스 타임 형식으로 반환
};

const getNewAccessTokenByRefreshToken = async (
  refreshToken,
  clientId,
  clientSecret
) => {
  const url = "https://oauth2.googleapis.com/token";

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  try {
    const response = await axios.post(url, params);
    return response;
  } catch (error) {
    if (
      error.response &&
      error.response.data &&
      error.response.data.error === "invalid_grant"
    ) {
      console.error("Refresh token is invalid or expired");
    } else {
      console.error("Error refreshing access token:", error.message);
    }
    throw error;
  }
};

const tokenLogFuncs = {
  saveAccessTokenLog: async (
    email,
    access_token,
    expires_in,
    process_kind,
    cachedDb
  ) => {
    const tokenLogsCollection = cachedDb.collection("token_logs");
    const logEntry = {
      type: "access",
      process_kind,
      email,
      token_value: access_token,
      exp: calculateExpiryTime(expires_in),
    };

    try {
      await tokenLogsCollection.insertOne(logEntry);
      console.log("Access token log inserted successfully");
    } catch (error) {
      console.error("Error inserting access token log:", error);
      throw error;
    }
  },
  saveRefreshTokenLog: async (email, refresh_token, process_kind, cachedDb) => {
    const tokenLogsCollection = cachedDb.collection("token_logs");
    const logEntry = {
      type: "refresh",
      process_kind,
      email,
      token_value: refresh_token,
    };

    try {
      await tokenLogsCollection.insertOne(logEntry);
      console.log("Refresh token log inserted successfully");
    } catch (error) {
      console.error("Error inserting refresh token log:", error);
      throw error;
    }
  },
  doesTokenLogExist: async (cachedDb, email, tokenValue, type) => {
    try {
      const tokenLogsCollection = cachedDb.collection("token_logs");

      const matchingDocument = await tokenLogsCollection.findOne(
        { email, token_value: tokenValue, type },
        { sort: { _id: -1 } } // _id 기준 내림차순 정렬 (가장 최근에 생성된 데이터)
      );

      if (!matchingDocument) {
        throw new Error(
          `The ${type} token is not in database on doesTokenLogExist`
        );
      }

      return true;
    } catch (error) {
      console.error(`DB error on find ${type} token:`, error);
      throw error;
    }
  },
  isTokenExpired: async (cachedDb, email, tokenValue, type, now) => {
    try {
      const tokenLogsCollection = cachedDb.collection("token_logs");

      const matchingDocument = await tokenLogsCollection.findOne(
        { email, token_value: tokenValue, type },
        { sort: { _id: -1 } } // _id 기준 내림차순 정렬 (가장 최근에 생성된 데이터)
      );

      if (!matchingDocument) {
        throw new Error(
          `The ${type} token is not in database on isTokenExpired`
        );
      }

      // now가 exp보다 클 경우 true, 작을 경우 false 반환
      return now > matchingDocument.exp;
    } catch (error) {
      console.error(`DB error on find ${type} token:`, error);
      throw error;
    }
  },
};

const auth = {
  getGoogleTokensByOauthCode: async (
    oauthCode,
    clientId,
    clientSecret,
    redirectUri,
    codeVerifier
  ) => {
    const tokenUrl = "https://oauth2.googleapis.com/token";

    const payload = {
      code: oauthCode,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    };

    try {
      const response = await axios.post(
        tokenUrl,
        new URLSearchParams(payload).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (!response.data.refresh_token) {
        console.warn(
          "No refresh_token received. Ensure your OAuth URL includes 'access_type=offline' and 'prompt=consent'."
        );
      }

      return {
        message: "Successfully fetched tokens from getGoogleTokensByOauthCode",
        tokens: response.data,
      };
    } catch (error) {
      console.log("Error Response:", error.response?.data);

      throw new Error(
        `Failed to fetch token from getGoogleTokensByOauthCode: ${
          error.response?.data.error_description || error.message
        }`
      );
    }
  },

  getGoogleUserInfoByAccessToken: async (accessToken) => {
    const userInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";

    try {
      const response = await axios.get(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const userInfo = response.data;

      return userInfo;
    } catch (error) {
      throw new Error(
        `Failed to fetch user info from getGoogleUserInfoByAccessToken: ${error.message}`
      );
    }
  },
  getSignData: async function (
    oauthCode,
    clientId,
    clientSecret,
    redirectUri,
    codeVerifier
  ) {
    try {
      const tokens = (
        await auth.getGoogleTokensByOauthCode(
          oauthCode,
          clientId,
          clientSecret,
          redirectUri,
          codeVerifier
        )
      ).tokens;

      const decodedIdToken = jwt_decode(tokens.id_token);

      const userInfo = {
        email: decodedIdToken.email,
        name: decodedIdToken.name,
        picture: decodedIdToken.picture,
      };

      return {
        message: "here are tokens and user Info from getSignData",
        userInfo,
        tokens,
      };
    } catch (error) {
      throw new Error(`Error in getSignData: ${error.message}`);
    }
  },
  getOauthMiddleWareResult: async (event, email, cachedSecrets, cachedDb) => {
    let refresh_token;
    let access_token;

    const client_id = cachedSecrets.oauthSecrets.clientId;
    const client_secret = cachedSecrets.oauthSecrets.clientSecret;

    //check env
    if (process.env.ENV == "dev_sam") {
      refresh_token = event.headers?.["Refresh-Token"];
      access_token = event.headers?.["Access-Token"];
    } else {
      refresh_token = event.headers?.["refresh-token"];
      access_token = event.headers?.["access-token"];
    }
    //contract access token string
    access_token = access_token?.replace(/^Bearer\s+/i, "");
    refresh_token = refresh_token?.replace(/^Bearer\s+/i, "");

    if (refresh_token) {
      // refresh token case
      try {
        //verify refresh token
        // 여기에 refresh토큰으로 토큰 존재 검사
        await tokenLogFuncs.doesTokenLogExist(
          cachedDb,
          email,
          refresh_token,
          "refresh"
        );
        // refresh 토큰으로 새로운 access token요청
        newAccessTokenData = await getNewAccessTokenByRefreshToken(
          refresh_token,
          client_id,
          client_secret
        );

        if (newAccessTokenData.status === 200) {
          //새로받은 access token의 token log저장
          const { access_token, expires_in } = newAccessTokenData.data;
          const process_kind = "renew";

          await tokenLogFuncs.saveAccessTokenLog(
            email,
            access_token,
            expires_in,
            process_kind,
            cachedDb
          );

          const userInfo = await auth.getGoogleUserInfoByAccessToken(
            access_token
          );

          return createAuthResult(
            { message: "here is new tokens", tokens: { access_token } },
            userInfo,
            201
          );
        }
      } catch (error) {
        // refresh토큰과 이메일, type=refresh로 검색. 가장 최근에 있는 token_info가 인수로 받은 이메일과 refresh토큰이랑 일치하면 419, 아니면 401
        console.error(
          "maybe the refresh token is expired or modified :",
          error
        );
        return createAuthResult(
          error.message +
            " / or maybe the refresh token is expired or modified",
          null,
          500
        );
      }
    } else if (access_token) {
      // Access-Token이 있을 경우
      try {
        const accessTokenResponse = await verifyAccessToken(access_token);
        //여기서 에러던지면 바로 catch로 가니까 상관없음

        if (accessTokenResponse.status === 200) {
          // 유효한 액세스 토큰을 사용해 사용자 정보 가져오기
          const userInfo = await auth.getGoogleUserInfoByAccessToken(
            access_token
          );

          return createAuthResult(
            "success authorization",
            userInfo, // 사용자 정보 포함
            200
          ); // 200: 인증 성공
        }
      } catch (error) {
        console.log(error);
        if (error.response?.status === 400) {
          // 여기서 토큰 만료 혹은 위조 조건문 나눔
          if (
            tokenLogFuncs.isTokenExpired(
              cachedDb,
              email,
              access_token,
              "access",
              Math.floor(Date.now() / 1000)
            )
          ) {
            return createAuthResult("expired access token", null, 419); // 만료된 토큰
          } else {
            return createAuthResult("error", null, 400); // 위조된 토큰
          }
        } else {
          console.error("Unhandled error during token verification:", error);
          return createAuthResult(error.message, null, 500); // 예상치 못한 에러
        }
      }
    } else {
      return createAuthResult("failed empty", null, 401); // 401: 인증 정보 없음, userInfo는 null
    }
  },
};

// api resources

const apiResource = {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, GET, POST",
    "Access-Control-Allow-Headers": "*",
  },

  respond: (statusCode, body) => {
    return {
      statusCode,
      body: JSON.stringify(body),
      headers: apiResource.headers,
    };
  },
};

module.exports = {
  checkCachedSecrets,
  getDb,
  tokenLogFuncs,
  auth,
  apiResource,
};
