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

// 토큰 검증 함수 (공통으로 처리)
const verifyToken = async (token, tokenType) => {
  try {
    const url =
      tokenType === "refresh"
        ? "https://oauth2.googleapis.com/tokeninfo"
        : `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`;

    const headers =
      tokenType === "refresh"
        ? { Authorization: `Bearer ${token}` }
        : undefined;

    const response =
      tokenType === "refresh"
        ? await axios.post(url, null, { headers })
        : await axios.get(url);

    return response;
  } catch (error) {
    console.error(`Error verifying ${tokenType} token:`, error);
    throw error;
  }
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

      return {
        message: "there is userInfo from getGoogleUserInfoByAccessToken",
        userInfo: response.data,
      };
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
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        },
      };
    } catch (error) {
      throw new Error(`Error in getSignData: ${error.message}`);
    }
  },
  getOauthMiddleWareResult: async (event) => {
    let refresh_token;
    let access_token;

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

    if (refresh_token) {
      // refresh token case
      try {
        //verify refresh token
        const refreshTokenResponse = await verifyToken(
          refresh_token,
          "refresh"
        );

        if (refreshTokenResponse.status === 200) {
          const { access_token } =
            refreshTokenResponse.data.authResponse.tokens;

          const userInfo = await auth.getGoogleUserInfoByAccessToken(
            access_token
          );

          return createAuthResult("here is new tokens", userInfo.userInfo, 201);
        }
      } catch (error) {
        if (error.response?.data?.error_description === "Token has expired") {
          return createAuthResult("expired refresh token", null, 419);
        } else if (
          error.response?.data?.error_description === "Invalid Value"
        ) {
          return createAuthResult("invalid refresh token", null, 401);
        } else {
          console.error(
            "Unhandled error during refresh token verification:",
            error
          );
          return createAuthResult("unknown error", null, 500);
        }
      }
    } else if (access_token) {
      // Access-Token이 있을 경우
      try {
        const accessTokenResponse = await verifyToken(access_token, "access");
        //여기서 refresh token에러남 failed on access token

        if (accessTokenResponse.status === 200) {
          // 유효한 액세스 토큰을 사용해 사용자 정보 가져오기
          const userInfo = await auth.getGoogleUserInfoByAccessToken(
            access_token
          );

          return createAuthResult(
            "success authorization",
            userInfo.userInfo, // 사용자 정보 포함
            200
          ); // 200: 인증 성공
        }
      } catch (error) {
        console.log(error);
        if (error.response?.data?.error_description === "Token has expired") {
          return createAuthResult("expired access token", null, 419); // 만료된 토큰
        } else if (
          error.response?.data?.error_description === "Invalid Value"
        ) {
          //요 부분으로 디버깅
          return createAuthResult(error, null, 401); // 위조된 토큰
        } else {
          console.error("Unhandled error during token verification:", error);
          return createAuthResult("unknown error", null, 500); // 예상치 못한 에러
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
  getSecrets,
  checkCachedSecrets,
  getDb,
  auth,
  apiResource,
};
