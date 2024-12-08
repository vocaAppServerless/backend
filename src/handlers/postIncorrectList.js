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

const putIncorrectList = async (event, authResult, email) => {
  try {
    // Extract parameters and body
    const requestBody = event.body ? JSON.parse(event.body) : {};
    const { list_id } = requestBody;

    // Fetch user ID based on email from the users collection
    const user = await cachedDb.collection("users").findOne({ email });
    if (!user) {
      return respond(500, { message: "User not found" });
    }
    const userId = user._id;

    // Prepare the new incorrect list data
    const newIncorrectList = {
      user_id: userId,
      linked_word_lists: [new ObjectId(list_id)],
      creation_date: new Date().toISOString(),
    };

    // Insert the new incorrect list into the incorrect_lists collection
    const incorrectListResult = await cachedDb
      .collection("incorrect_lists")
      .insertOne(newIncorrectList);
    console.log(incorrectListResult.insertedId);

    // If insertion was successful, update the voca_lists collection
    if (incorrectListResult.insertedId) {
      // Find the list in voca_lists by list_id and user_id
      const updatedVocaList = await cachedDb
        .collection("voca_lists")
        .findOneAndUpdate(
          { _id: new ObjectId(list_id), user_id: userId }, // Find list by list_id and user_id
          {
            $addToSet: {
              linked_incorrect_word_lists: new ObjectId(
                incorrectListResult.insertedId
              ), // Add the new incorrect list's _id if not already present
            },
          },
          { returnDocument: "after" }
        );

      if (
        updatedVocaList &&
        updatedVocaList.linked_incorrect_word_lists
          .map((id) => id.toString())
          .includes(incorrectListResult.insertedId.toString())
      ) {
        // If voca_lists update is successful, respond with the new incorrect list data
        return respond(authResult.code, {
          authResponse: authResult.authResponse,
          answer: {
            message:
              "Incorrect list created and voca list updated successfully!",
            incorrectList: {
              _id: incorrectListResult.insertedId,
              ...newIncorrectList,
            },
          },
        });
      } else {
        return respond(500, { message: "Failed to update voca list" });
      }
    } else {
      return respond(500, { message: "Failed to create incorrect list" });
    }
  } catch (error) {
    console.error("Error on putIncorrectList:", error);
    return respond(500, {
      message: error.message || "Failed on putIncorrectList",
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
    case "putIncorrectList":
      return putIncorrectList(event, authResult, email);
    default:
      console.log(
        "Invalid request type on incorrect list post lambda:",
        requestType
      );
      return respond(400, {
        message: "Invalid request from incorrect list post lambda",
      });
  }
};
