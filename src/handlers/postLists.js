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

const handleEditLists = async (event, authResult, email) => {
  try {
    // Extract parameters and body
    const requestBody = event.body ? JSON.parse(event.body) : {};

    // Fetch user ID based on email from the users collection
    const user = await cachedDb.collection("users").findOne({ email });
    if (!user) {
      return respond(500, { message: "User not found" });
    }

    const userId = user._id; // userId는 ObjectId로 MongoDB에서 받아옴

    // Process each list in the requestBody
    for (const list of requestBody.lists) {
      // Convert the string _id to ObjectId for comparison with MongoDB
      const listId = new ObjectId(list._id);

      // Find the list in voca_lists collection by _id
      const existingList = await cachedDb
        .collection("voca_lists")
        .findOne({ _id: listId });

      if (existingList) {
        // Convert userId to ObjectId for comparison
        if (!existingList.user_id.equals(userId)) {
          console.log(`User ID does not match for list with _id: ${list._id}`);
          continue; // Skip this list if user_id doesn't match
        }

        // Create an object to store the updated values (overwrite only changed fields)
        const updatedList = {};

        // Compare and update only the properties that are different
        if (list.name !== existingList.name) updatedList.name = list.name;
        if (list.is_bookmark !== existingList.is_bookmark)
          updatedList.is_bookmark = list.is_bookmark;
        if (list.is_deleted !== existingList.is_deleted)
          updatedList.is_deleted = list.is_deleted;
        if (
          JSON.stringify(list.linked_incorrect_word_lists) !==
          JSON.stringify(existingList.linked_incorrect_word_lists)
        ) {
          updatedList.linked_incorrect_word_lists =
            list.linked_incorrect_word_lists;
        }

        // If there are changes, update the list in the database
        if (Object.keys(updatedList).length > 0) {
          const updateResult = await cachedDb
            .collection("voca_lists")
            .updateOne({ _id: listId }, { $set: updatedList });

          if (updateResult.modifiedCount === 0) {
            console.log(`No update needed for list with _id: ${list._id}`);
          } else {
            console.log(`List with _id: ${list._id} updated successfully`);
          }
        }
      } else {
        console.log(`List with _id: ${list._id} not found in voca_lists`);
      }
    }

    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      answer: "Lists updated successfully!",
    });
  } catch (error) {
    // Error handler
    console.error("Error on editList:", error);
    return respond(500, {
      message: error.message || "Failed on editList",
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
    case "editLists":
      return handleEditLists(event, authResult, email);
    default:
      console.log("Invalid request type on lists post lambda:", requestType);
      return respond(400, {
        message: "Invalid request from lists post lambda",
      });
  }
};
