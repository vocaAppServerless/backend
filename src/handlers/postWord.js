// import necessary functions
// const {
//   ObjectId,
//   checkCachedSecrets,
//   getDb,
//   auth: { getOauthMiddleWareResult },
//   apiResource: { respond },
// } = require("@nurdworker/rbm-helper");
const {
  ObjectId,
  checkCachedSecrets,
  getDb,
  auth: { getOauthMiddleWareResult },
  apiResource: { respond },
} = require("./rbm-helper");

// declare cached data
let cachedSecrets = {};
let cachedDb = null;

// handlers

const putWord = async (event, authResult, email) => {
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

    // Fetch list_id and word data from request body
    const { word, meaning, list_id } = requestBody;
    if (!word || !meaning || !list_id) {
      return respond(500, {
        message: "Missing required fields: word, meaning, or list_id",
      });
    }

    // Convert list_id from string to ObjectId
    const listIdObject = new ObjectId(list_id);

    // Check if the list exists and if the userId matches the list's user_id
    const list = await cachedDb
      .collection("voca_lists")
      .findOne({ _id: listIdObject });
    if (!list) {
      return respond(500, { message: "List not found" });
    }

    if (list.user_id.toString() !== userId.toString()) {
      return respond(500, {
        message: "You are not authorized to add words to this list",
      });
    }

    // Prepare the new word data
    const newWord = {
      word,
      mean: meaning,
      list_id: listIdObject,
      user_id: userId,
      creation_date: new Date().toISOString(),
      is_deleted: false,
      memo: "",
      is_incorrect: false,
      incorrect_lists: [],
    };

    // Insert the new word into the words collection
    const result = await cachedDb.collection("words").insertOne(newWord);
    console.log(result.insertedId);

    // If insertion was successful, return the newly created word
    if (result.insertedId) {
      return respond(authResult.code, {
        authResponse: authResult.authResponse,
        answer: {
          message: "Word added successfully!",
          word: {
            _id: result.insertedId,
            ...newWord,
          },
        },
      });
    } else {
      return respond(500, { message: "Failed to add the word" });
    }
  } catch (error) {
    console.error("Error on putWord:", error);
    return respond(500, {
      message: error.message || "Failed on putWord",
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
    case "putWord":
      return putWord(event, authResult, email);
    default:
      console.log("Invalid request type on word post lambda:", requestType);
      return respond(400, { message: "Invalid request from word post lambda" });
  }
};
