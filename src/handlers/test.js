const {
  checkCachedSecrets,
  getDb,
  auth: { getOauthMiddleWareResult },
  apiResource: { respond },
} = require("@nurdworker/rbm-helper");
// const {
//   checkCachedSecrets,
//   getDb,
//   auth: { getOauthMiddleWareResult },
//   apiResource: { respond },
// } = require("./rbm-helper");

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
    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      testdata: "testdata",
    });
  } catch (error) {
    return respond(500, { message: error.message });
  }
};

exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;
  const email = decodeURIComponent(event.queryStringParameters?.email);
  console.log(email);
  console.log("여기야1");
  console.log(event.headers);
  console.log("여기야2");

  cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
  console.log(cachedSecrets);
  cachedDb = (await getDb(cachedDb, cachedSecrets)).db;

  // // 미들웨어에서 요청 처리
  // const authResult = await getOauthMiddleWareResult(event);

  // if (authResult.code == 419 || authResult.code == 401) {
  //   return respond(authResult.code, { authResponse: authResult.authResponse });
  // }

  let authResult;

  //test존 미들웨어 조건문
  if (requestType == "testAuthFlow") {
    authResult = await getOauthMiddleWareResult(
      event,
      email,
      cachedSecrets,
      cachedDb
    );
    if (authResult.code == 400 || 401 || 419 || 500) {
      console.log(authResult);
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
    default:
      console.log("Invalid request type on test lambda:", requestType);
      return respond(400, { message: "Invalid request from test lambda" });
  }
};
