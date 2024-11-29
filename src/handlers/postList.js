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

const putList = async (event, authResult, email) => {
  try {
    // Extract parameters and body
    const queryParams = event.queryStringParameters || {};
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
      name: requestBody.name, // List name from request body
      language: requestBody.language, // Language from request body
      user_id: userId, // User ID from users collection
      creation_date: new Date().toISOString(), // Set the current date and time
      linked_incorrect_word_lists: [], // Empty array for linked incorrect words
      is_deleted: false, // Default to false
      is_bookmark: false, // Default to false
    };
    console.log(newList);

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
            ...newList, // Include the list details in the response
          },
        },
      });
    } else {
      return respond(500, { message: "Failed to add the list" });
    }
  } catch (error) {
    // Error handler
    console.error("Error on putList:", error);
    return respond(500, {
      message: error.message || "Failed on putList",
    });
  }
};

const editList = async (event, authResult, email) => {
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
    console.error("Error on editList:", error);
    return respond(500, {
      message: error.message || "Failed on editList",
    });
  }
};

const deleteList = async (event, authResult, email) => {
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
    console.error("Error on deleteList:", error);
    return respond(500, {
      message: error.message || "Failed on deleteList",
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
    case "putList":
      return putList(event, authResult, email);
    case "editList":
      return editList(event, authResult, email);
    case "deleteList":
      return deleteList(event, authResult, email);
    default:
      console.log("Invalid request type on lists get lambda:", requestType);
      return respond(400, { message: "Invalid request from lists get lambda" });
  }
};
