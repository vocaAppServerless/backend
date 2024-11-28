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

const getLists = async (event, authResult, email) => {
  try {
    // Fetch user ID based on email from cachedDb
    const user = await cachedDb.collection("users").findOne({ email });
    if (!user) {
      return respond(500, { message: "User not found" });
    }
    const userId = user._id;

    // Fetch lists for the user, sorted by most recent addition (assuming a `createdAt` field)
    const listsArr = await cachedDb
      .collection("lists")
      .find({ userId }) // Filter by userId
      .sort({ createdAt: -1 }) // Sort by createdAt in descending order
      .project({ _id: 1, name: 1, otherFields: 1 }) // Include _id and specific fields
      .toArray();

    // Respond with the lists
    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      answer: {
        message: "success get lists",
        lists: listsArr,
      },
    });
  } catch (error) {
    // Error handler
    console.error("Error on getLists:", error);
    return respond(500, {
      message: error.message || "Failed on getLists",
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
    case "getLists":
      return getLists(event, authResult, email);
    default:
      console.log("Invalid request type on lists get lambda:", requestType);
      return respond(400, { message: "Invalid request from lists get lambda" });
  }
};
