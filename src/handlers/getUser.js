const {
  checkCachedSecrets,
  getDb,
  tokenLogFuncs: { saveAccessTokenLog, saveRefreshTokenLog },
  auth: { getSignData },
  apiResource: { respond },
} = require("@nurdworker/rbm-helper");

// const {
//   checkCachedSecrets,
//   getDb,
//   tokenLogFuncs: { saveAccessTokenLog, saveRefreshTokenLog },
//   auth: {
//     getGoogleTokensByOauthCode,
//     getGoogleUserInfoByAccessToken,
//     getSignData,
//   },
//   apiResource: { respond },
// } = require("./rbm-helper");

let cachedSecrets = {};
let cachedDb = null;

// Handle existing user flow: check if user is banned or not, and respond accordingly
const handleExistingUser = async (existingUser, userInfo, tokens) => {
  const user_id = existingUser._id;
  const is_banned = existingUser.is_banned;

  if (is_banned) {
    // User is banned, respond with "get out!"
    return respond(200, {
      authResponse: "get out!",
      userInfo: { email: userInfo.email },
    });
  } else {
    // User is not banned, respond with "signIn success!"
    saveAccessTokenLog(
      userInfo.email,
      tokens.access_token,
      tokens.expires_in,
      "signIn",
      cachedDb
    );
    saveRefreshTokenLog(
      userInfo.email,
      tokens.refresh_token,
      "signIn",
      cachedDb
    );
    return respond(200, {
      authResponse: "signIn success!",
      userInfo: {
        email: userInfo.email,
        picture: userInfo.picture,
        user_id,
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      },
    });
  }
};

// Handle new user flow: create a new user and respond with success
const handleNewUser = async (userInfo, tokens) => {
  const userCollection = cachedDb.collection("users");
  const newUser = {
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
    creation_date: new Date(),
    is_banned: false,
  };

  const user_id = (await userCollection.insertOne(newUser)).insertedId;

  await saveAccessTokenLog(
    userInfo.email,
    tokens.access_token,
    tokens.expires_in,
    "signUp",
    cachedDb
  );
  await saveRefreshTokenLog(
    userInfo.email,
    tokens.refresh_token,
    "signUp",
    cachedDb
  );
  return respond(200, {
    authResponse: "signUp success",
    userInfo: { email: userInfo.email, picture: userInfo.picture, user_id },
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    },
  });
};

// Retrieve client ID and redirect URI
const getClientIdAndRedirectUri = async () => {
  try {
    const { clientId, redirectUri } = cachedSecrets.oauthSecrets;
    if (clientId && redirectUri) {
      const authResponse = "success to get client id and redirect uri";
      return respond(200, { authResponse, clientId, redirectUri });
    }
    throw new Error("missing value from getClientIdAndRedirectUri at getUser");
  } catch (error) {
    console.error("Error on getClientIdAndRedirectUri:", error);
    return respond(500, { message: error.message });
  }
};

// Sign-up or Sign-in flow based on the existing user data
const signUpOrSignIn = async (event) => {
  try {
    // Arrange necessary data
    let oauthCode;
    let codeVerifier;
    if (process.env.ENV == "dev_sam") {
      oauthCode = event.headers?.Oauthcode;
      codeVerifier = event.headers?.Codeverifier;
    } else {
      oauthCode = event.headers?.oauthcode;
      codeVerifier = event.headers?.codeverifier;
    }
    const { clientId, clientSecret, redirectUri } = cachedSecrets.oauthSecrets;
    //check header values

    //check necessary data
    if (
      !oauthCode ||
      !codeVerifier ||
      !clientId ||
      !clientSecret ||
      !redirectUri
    ) {
      return respond(400, { message: "Missing required data in the request" });
    }

    // Sign flow
    if (oauthCode && codeVerifier && clientId && clientSecret && redirectUri) {
      try {
        const signData = await getSignData(
          oauthCode,
          clientId,
          clientSecret,
          redirectUri,
          codeVerifier
        );

        //find User data from database
        const { userInfo, tokens } = signData;

        const userCollection = cachedDb.collection("users");
        const existingUser = await userCollection.findOne({
          email: userInfo.email,
        });

        if (existingUser) {
          // User already exists, handle existing user flow
          return handleExistingUser(existingUser, userInfo, tokens);
        } else {
          // New user, handle sign-up flow
          return handleNewUser(userInfo, tokens);
        }
      } catch (error) {
        console.error("Error during sign flow:", error);
        return respond(500, { message: "Internal server error" });
      }
    } else {
      // Missing necessary data, reject the request
      return respond(400, {
        message: "there is empty auth data from signUpOrSignIn at getUser",
      });
    }
  } catch (error) {
    console.error("Error on sign up/sign in:", error);
    return respond(500, {
      message: "Failed on sign",
    });
  }
};

// Main handler function to process requests based on query params
exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;
  // 캐시된 비밀 값과 DB를 가져오는 작업
  cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
  cachedDb = (await getDb(cachedDb, cachedSecrets)).db;

  switch (requestType) {
    case "getClientIdAndRedirectUri":
      return getClientIdAndRedirectUri();
    case "sign":
      return signUpOrSignIn(event);
    default:
      console.log("Invalid request type on user get lambda:", requestType);
      return respond(400, { message: "Invalid request from user get lambda" });
  }
};
