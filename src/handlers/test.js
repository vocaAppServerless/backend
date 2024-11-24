// const {
//   getSecrets,
//   checkCachedSecrets,
//   getDb,
//   auth: {
//     getGoogleTokensByOauthCode,
//     getGoogleUserInfoByAccessToken,
//     getSignData,
//     getOauthMiddleWareResult
//   },
//   apiResource: { respond },
// } = require("@nurdworker/rbm-helper");
const {
  checkCachedSecrets,
  getDb,
  auth: { getOauthMiddleWareResult },
  apiResource: { respond },
} = require("./rbm-helper");

// cached data

let cachedSecrets = {};
let cachedDb = null;

// handler funcs

const handleConnectLambda = () => {
  return respond(200, { message: "This is the connectLambda response!" });
};

const handleReadServerEnv = async () => {
  try {
    cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
    if (cachedSecrets.dbSecrets && cachedSecrets.oauthSecrets) {
      return respond(200, { message: "we can read server env!" });
    } else {
      return respond(500, {
        message: "Failed to read server env / empty db or oauth secret",
      });
    }
  } catch (error) {
    console.error("Error reading server env:", error);
    return respond(500, { message: "Failed to read server env" });
  }
};

const handleConnectDb = async () => {
  try {
    cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
    cachedDb = (await getDb(cachedDb, cachedSecrets)).db;
    const collections = await cachedDb.listCollections().toArray();
    const collectionNames = collections.map((col) => col.name);

    return respond(200, { collections: collectionNames });
  } catch (error) {
    console.error("Error retrieving collections:", error);
    return respond(500, { message: "Failed to fetch collections" });
  }
};

const handleTestAuthFlow = async (event, authResult) => {
  try {
    cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
    console.log("여기야 여기~");
    console.log(authResult.userInfo);
    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      testdata: "testdata",
    });
  } catch (error) {
    return respond(500, { message: error.message });
  }
};

const validateRequestType = (requestType) => {
  const validRequestTypes = [
    "connectLambda",
    "readServerEnv",
    "connectDb",
    "testAuthFlow",
  ];
  return validRequestTypes.includes(requestType);
};

exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;
  if (!validateRequestType(requestType)) {
    return respond(400, { message: "Invalid request" });
  }

  // // 미들웨어에서 요청 처리
  // const authResult = await getOauthMiddleWareResult(event);

  // if (authResult.code == 419 || authResult.code == 401) {
  //   return respond(authResult.code, { authResponse: authResult.authResponse });
  // }

  let authResult;

  //test존 미들웨어 조건문
  if (requestType == "testAuthFlow") {
    authResult = await getOauthMiddleWareResult(event);
    if (authResult.code == 419 || authResult.code == 401) {
      return respond(authResult.code, {
        authResponse: authResult.authResponse,
      });
    }
  }

  switch (requestType) {
    case "connectLambda":
      return handleConnectLambda();
    case "readServerEnv":
      return handleReadServerEnv();
    case "connectDb":
      return handleConnectDb();
    case "testAuthFlow":
      return handleTestAuthFlow(event, authResult);
  }
};
