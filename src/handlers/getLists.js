const {
  checkCachedSecrets,
  getDb,
  auth: {
    getGoogleTokensByOauthCode,
    getGoogleUserInfoByAccessToken,
    getSignData,
  },
  apiResource: { respond },
} = require("@nurdworker/rbm-helper");
// const {
//   checkCachedSecrets,
//   getDb,
//   auth: {
//     getGoogleTokensByOauthCode,
//     getGoogleUserInfoByAccessToken,
//     getSignData,
//   },
//   apiResource: { respond },
// } = require("./rbm-helper");

let cachedSecrets = {};
let cachedDb = null;

const handleRequest1 = async (event) => {
  try {
    cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
    cachedDb = (await getDb(cachedDb, cachedSecrets)).db;

    const queryParams = event.queryStringParameters || {};
    const requestBody = event.body ? JSON.parse(event.body) : {};

    const authResponse = `success on request1`;

    return respond(200, { authResponse });
  } catch (error) {
    console.error("Error on request1:", error);
    return respond(500, {
      message: "Failed on request1",
    });
  }
};

// 요청 핸들러: Request 2
const handleRequest2 = async (event) => {
  try {
    cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
    cachedDb = (await getDb(cachedDb, cachedSecrets)).db;
    // 헤더나 파라미터 활용 예시
    const customHeader = event.headers?.["x-custom-header"] || "No Header";
    const queryParams = event.queryStringParameters || {};
    const authResponse = `success on request2`;

    return respond(200, {
      authResponse,
      message: "Request 2 successfully handled",
    });
  } catch (error) {
    console.error("Error on request2:", error);
    return respond(500, { message: "Failed on request2" });
  }
};

// 메인 핸들러
exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;

  switch (requestType) {
    case "request1":
      return handleRequest1(event);
    case "request2":
      return handleRequest2(event);
    default:
      return respond(400, { message: "Invalid request from lambdaFunc" });
  }
};
