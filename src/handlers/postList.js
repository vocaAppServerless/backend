// import necessary functions
// const {
//   ObjectId,
//   checkCachedSecrets,
//   getDb,
//   auth: { getOauthMiddleWareResult },
//   apiResource: { respond },
// } = require("@nurdworker/rbm-helper");
const {
  checkCachedSecrets,
  getDb,
  auth: { getOauthMiddleWareResult },
  apiResource: { respond },
} = require("./rbm-helper");

// declare cached data
let cachedSecrets = {};
let cachedDb = null;

// handlers

const putList = async (event, authResult, email) => {
  try {
    // Extract parameters and body
    const requestBody = event.body ? JSON.parse(event.body) : {};

    // Fetch user ID based on email from the users collection
    const user = await cachedDb.collection("users").findOne({ email });
    if (!user) {
      return respond(500, { message: "User not found" });
    }
    const userId = user._id;
    console.log(userId);

    // Prepare the new list data
    const newList = {
      name: requestBody.name,
      language: requestBody.language,
      user_id: userId,
      creation_date: new Date().toISOString(),
      linked_incorrect_word_lists: [],
      is_deleted: false,
      is_bookmark: false,
    };

    // Insert the new list into the voca_lists collection
    const result = await cachedDb.collection("voca_lists").insertOne(newList);
    console.log(result.insertedId);
    // If insertion was successful, return the newly created list
    if (result.insertedId) {
      return respond(authResult.code, {
        authResponse: authResult.authResponse,
        answer: {
          message: "List added successfully!",
          list: {
            _id: result.insertedId,
            ...newList,
          },
        },
      });
    } else {
      return respond(500, { message: "Failed to add the list" });
    }
  } catch (error) {
    console.error("Error on putList:", error);
    return respond(500, {
      message: error.message || "Failed on putList",
    });
  }
};

// main handler
exports.handler = async (event) => {
  //get params request and email
  const requestType = event.queryStringParameters?.request;
  const email = decodeURIComponent(event.queryStringParameters?.email);
  console.log(email);

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
    case "putList":
      return putList(event, authResult, email);
    default:
      console.log("Invalid request type on lists get lambda:", requestType);
      return respond(400, { message: "Invalid request from list post lambda" });
  }
};
