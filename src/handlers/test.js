const { checkCachedSecrets, getDb } = require("@nurdworker/rbm-helper");

let cachedSecrets = {};
let cachedDb = null;

console.log("하잉");

exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (requestType === "connectDb") {
    try {
      cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
      cachedDb = (await getDb(cachedDb, cachedSecrets)).db;
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map((col) => col.name);

      return {
        statusCode: 200,
        body: JSON.stringify({ collections: collectionNames }),
        headers,
      };
    } catch (error) {
      console.error("Error retrieving collections:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to fetch collections" }),
        headers,
        env: process.env.ENV,
      };
    }
  } else if (requestType === "connectLambda") {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "This is the connectLambda response!" }),
      headers,
    };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request",
      }),
      headers,
    };
  }
};
