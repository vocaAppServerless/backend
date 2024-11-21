// handler.js
const { getSecretAndDbUri, getMongoClient } = require("./dbHelper");

exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;

  if (requestType === "connectDb") {
    try {
      const client = await getMongoClient();

      const { dbName } = await getSecretAndDbUri();
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map((col) => col.name);

      return {
        statusCode: 200,
        body: JSON.stringify({ collections: collectionNames }),
      };
    } catch (error) {
      console.error("Error retrieving collections:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to fetch collections" }),
        env: process.env.ENV,
      };
    }
  } else if (requestType === "connectLambda") {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "This is the connectLambda response!" }),
    };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request",
      }),
    };
  }
};
