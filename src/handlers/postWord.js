// import necessary functions
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

// declare cached data
let cachedSecrets = {};
let cachedDb = null;

// handlers

const handleRequest1 = async (event, authResult, email) => {
  try {
    // Extract parameters and body
    const queryParams = event.queryStringParameters || {};
    const requestBody = event.body ? JSON.parse(event.body) : {};

    // Your code
    // Example response with auth data
    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      answer: "testdata",
    });
  } catch (error) {
    // Error handler
    console.error("Error on request1:", error);
    return respond(500, {
      message: error.message || "Failed on request1",
    });
  }
};

const handleRequest2 = async (event, authResult, email) => {
  try {
    // Extract parameters and body
    const queryParams = event.queryStringParameters || {};
    const requestBody = event.body ? JSON.parse(event.body) : {};

    // Your code
    // Example response with auth data
    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      answer: "testdata",
    });
  } catch (error) {
    // Error handler
    console.error("Error on request2:", error);
    return respond(500, {
      message: error.message || "Failed on request2",
    });
  }
};

// main handler
exports.handler = async (event) => {
  //get params request and email
  const requestType = event.queryStringParameters?.request;
  const email = decodeURIComponent(event.queryStringParameters?.email);

  // caching
  cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
  cachedDb = (await getDb(cachedDb, cachedSecrets)).db;

  //auth middle ware
  const authResult = await getOauthMiddleWareResult(
    event,
    email,
    cachedSecrets,
    cachedDb
  );
  if ([400, 401, 419, 500].includes(authResult.code)) {
    return respond(authResult.code, {
      authResponse: authResult.authResponse,
    });
  }

  // response by request
  switch (requestType) {
    case "handleRequest1":
      return handleRequest1(event, authResult, email);
    case "handleRequest2":
      return handleRequest2(event, authResult, email);
    default:
      console.log("Invalid request type on lists get lambda:", requestType);
      return respond(400, { message: "Invalid request from lists get lambda" });
  }
};
