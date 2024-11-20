const { MongoClient } = require("mongodb");
require("dotenv").config();
const user = process.env.MONGODB_USER;
const password = process.env.MONGODB_PASSWORD;
const host = process.env.MONGODB_HOST;
const port = process.env.MONGODB_PORT;
const dbName = process.env.MONGODB_DB;

exports.handler = async (event) => {
  console.log("invoke!!여기야1");
  const requestType = event.queryStringParameters?.request;
  const encodedPassword = encodeURIComponent(password);
  const uri = `mongodb://${user}:${encodedPassword}@${host}:${port}/${dbName}`;
  console.log(uri);
  let client;

  if (requestType === "connectDb") {
    try {
      client = new MongoClient(uri);
      await client.connect();
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
        body: JSON.stringify({
          message: "Failed to fetch collections",
          error: error.message,
        }),
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  } else if (requestType === "connectLambda") {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "This is the connectLambda response!" }),
    };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid request type" }),
    };
  }
};
