const { MongoClient, ObjectId } = require("mongodb");
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

// auth sub funcs
const createAuthResult = (authResponse, userInfo, code) => {
  return {
    authResponse,
    userInfo,
    code,
  };
};

const calculateExpiryTime = (expiresIn) => {
  const currentTime = Math.floor(Date.now() / 1000);
  const expiryTime = currentTime + expiresIn;
  return expiryTime;
};

// auth token logs funcs
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
      const result = await tokenLogsCollection.insertOne(logEntry);
      if (result.acknowledged) {
        console.log("Access token log inserted successfully");
      }
    } catch (error) {
      console.error(
        "Error inserting access token log:",
        error.message,
        error.stack
      );
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

      const limitCount = type === "access" ? 20 : 5;

      // bring recent logs with email and type conditions ? customer can use 5 devices at least
      const recentLogs = await tokenLogsCollection
        .find({ email, type })
        .sort({ _id: -1 })
        .limit(limitCount)
        .toArray();

      // check the token value from the recent logs
      const matchingDocument = recentLogs.find(
        (log) => log.token_value === tokenValue
      );

      if (!matchingDocument) {
        throw new Error(
          `The ${type} token is not in the last 5 logs for the given email.`
        );
      }

      return true;
    } catch (error) {
      console.error(`DB error on finding ${type} token:`, error);
      throw error;
    }
  },
  isTokenExpired: async (cachedDb, email, tokenValue, type, now) => {
    try {
      const tokenLogsCollection = cachedDb.collection("token_logs");

      const matchingDocument = await tokenLogsCollection.findOne(
        { email, token_value: tokenValue, type },
        { sort: { _id: -1 } }
      );

      if (!matchingDocument) {
        throw new Error(
          `The ${type} token is not in database on isTokenExpired`
        );
      }

      return now > matchingDocument.exp;
    } catch (error) {
      console.error(`DB error on find ${type} token:`, error);
      throw error;
    }
  },
};

// main auth funcs
const auth = {
  verifyAccessToken: async (accessToken) => {
    try {
      const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`;

      const response = await axios.get(url);
      return response;
    } catch (error) {
      console.error(`Error verifying access token:`, error.message);
      throw error;
    }
  },
  getNewAccessTokenByRefreshToken: async (
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
  },
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
      // refresh token flow
      try {
        // check refresh token logs
        const doesRefreshTokenLogExist = await tokenLogFuncs.doesTokenLogExist(
          cachedDb,
          email,
          refresh_token,
          "refresh"
        );

        // check access token is expired
        const isAccessTokenExpired = tokenLogFuncs.isTokenExpired(
          cachedDb,
          email,
          access_token,
          "access",
          Math.floor(Date.now() / 1000)
        );

        if (doesRefreshTokenLogExist && isAccessTokenExpired) {
          // ask new access token
          newAccessTokenData = await auth.getNewAccessTokenByRefreshToken(
            refresh_token,
            client_id,
            client_secret
          );
          if (newAccessTokenData.status === 200) {
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
        } else {
          return createAuthResult("invalid authentication", null, 401);
        }
      } catch (error) {
        // error case on db or server
        console.error(
          "there is something wrong on refresh flow on getOauthMiddleWareResult",
          error
        );
        return createAuthResult(
          "there is something wrong on refresh flow on getOauthMiddleWareResult",
          null,
          500
        );
      }
    } else if (access_token) {
      // access token flow
      try {
        // check access token from google api
        const accessTokenResponse = await auth.verifyAccessToken(access_token);
        // check the token log is exist in token logs
        const doesAccessTokenLogExist = await tokenLogFuncs.doesTokenLogExist(
          cachedDb,
          email,
          access_token,
          "access"
        );

        if (accessTokenResponse.status === 200 && doesAccessTokenLogExist) {
          const userInfo = await auth.getGoogleUserInfoByAccessToken(
            access_token
          );

          return createAuthResult("success authorization", userInfo, 200);
        }
      } catch (error) {
        if (error.response?.status === 400) {
          if (
            tokenLogFuncs.isTokenExpired(
              cachedDb,
              email,
              access_token,
              "access",
              Math.floor(Date.now() / 1000)
            )
          ) {
            // if the token is expired
            return createAuthResult("expired access token", null, 419);
          } else {
            // if the token is invalid
            return createAuthResult("error", null, 400);
          }
        } else {
          // if server error
          console.error("Unhandled error during token verification:", error);
          return createAuthResult(error.message, null, 500);
        }
      }
    } else {
      // if there are not tokens from request header
      return createAuthResult("failed tokens are empty", null, 401);
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
  ObjectId,
  checkCachedSecrets,
  getDb,
  tokenLogFuncs,
  auth,
  apiResource,
};
