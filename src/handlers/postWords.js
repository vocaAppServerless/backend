// import necessary functions
// const {
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
const handleGetWords = async (event, authResult, email) => {
  try {
    const { list_id } = JSON.parse(event.body);

    // Convert the list_id to ObjectId for MongoDB comparison
    const listId = new ObjectId(list_id);

    // Fetch user ID based on email from cachedDb
    const user = await cachedDb.collection("users").findOne({ email });
    if (!user) {
      return respond(500, { message: "User not found" });
    }
    const userId = user._id;

    // Fetch words for the user where list_id matches, user_id matches, and is_deleted is false
    const wordsArr = await cachedDb
      .collection("words")
      .find({ list_id: listId, user_id: userId, is_deleted: false })
      .toArray();

    if (wordsArr.length === 0) {
      return respond(500, { message: "No words found for this list." });
    }

    // Respond with the words
    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      answer: {
        message: "success get words",
        words: wordsArr,
      },
    });
  } catch (error) {
    // Error handler
    console.error("Error on getWords:", error);
    return respond(500, {
      message: error.message || "Failed on getWords",
    });
  }
};

const handleEditWords = async (event, authResult, email) => {
  try {
    // Extract parameters and body
    const requestBody = event.body ? JSON.parse(event.body) : {};

    // Fetch user ID based on email from the users collection
    const user = await cachedDb.collection("users").findOne({ email });
    if (!user) {
      return respond(500, { message: "User not found" });
    }

    const userId = user._id;

    // Process each word in the requestBody
    for (const word of requestBody.words) {
      // Convert the string _id to ObjectId for comparison with MongoDB
      const wordId = new ObjectId(word._id);

      // Find the word in voca_words collection by _id
      const existingWord = await cachedDb
        .collection("words")
        .findOne({ _id: wordId });

      if (existingWord) {
        // Convert userId to ObjectId for comparison
        if (!existingWord.user_id.equals(userId)) {
          console.log(`User ID does not match for word with _id: ${word._id}`);
          continue; // Skip this word if user_id doesn't match
        }

        // Create an object to store the updated values (overwrite only changed fields)
        const updatedWord = {};

        // Compare and update only the properties that are different
        if (word.word !== existingWord.word) updatedWord.word = word.word;
        if (word.mean !== existingWord.mean) updatedWord.mean = word.mean;
        if (word.is_deleted !== existingWord.is_deleted)
          updatedWord.is_deleted = word.is_deleted;
        if (word.memo !== existingWord.memo) updatedWord.memo = word.memo;
        if (word.is_incorrect !== existingWord.is_incorrect)
          updatedWord.is_incorrect = word.is_incorrect;

        // Deep comparison for incorrect_lists (arrays)
        if (
          word.incorrect_lists.length !== existingWord.incorrect_lists.length
        ) {
          updatedWord.incorrect_lists = word.incorrect_lists.map(
            (id) => new ObjectId(id)
          );
        } else {
          const isDifferent =
            word.incorrect_lists
              .map((id) => new ObjectId(id).toString())
              .sort()
              .join(",") !==
            existingWord.incorrect_lists
              .map((id) => new ObjectId(id).toString())
              .sort()
              .join(",");

          if (isDifferent) {
            updatedWord.incorrect_lists = word.incorrect_lists.map(
              (id) => new ObjectId(id)
            );
          }
        }
        // If there are changes, update the word in the database
        if (Object.keys(updatedWord).length > 0) {
          const updateResult = await cachedDb
            .collection("words")
            .updateOne({ _id: wordId }, { $set: updatedWord });

          if (updateResult.modifiedCount === 0) {
            console.log(`No update needed for word with _id: ${word._id}`);
          } else {
            console.log(`Word with _id: ${word._id} updated successfully`);
          }
        }
      } else {
        console.log(`Word with _id: ${word._id} not found in voca_words`);
      }
    }

    return respond(authResult.code, {
      authResponse: authResult.authResponse,
      answer: "Words updated successfully!",
    });
  } catch (error) {
    // Error handler
    console.error("Error on editWord:", error);
    return respond(500, {
      message: error.message || "Failed on editWord",
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
    case "getWords":
      return handleGetWords(event, authResult, email);
    case "editWords":
      return handleEditWords(event, authResult, email);
    default:
      console.log("Invalid request type on lists get lambda:", requestType);
      return respond(400, { message: "Invalid request from lists get lambda" });
  }
};
