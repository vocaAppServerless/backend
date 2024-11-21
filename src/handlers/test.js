// handler.js

require("dotenv").config();
let getSecretAndDbUri, getMongoClient;

if (process.env.ENV) {
  // 로컬 환경일 경우 dbHelper.js 직접 가져오기
  ({ getSecretAndDbUri, getMongoClient } = require("./dbHelper.js"));
} else {
  // 다른 환경일 경우 muzzi-helper의 dbHelper 모듈 가져오기
  ({ getSecretAndDbUri, getMongoClient } = require("muzzi-helper/dbHelper"));
}

exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;

  const headers = {
    "Access-Control-Allow-Origin": "*", // 모든 출처 허용
    "Access-Control-Allow-Methods": "OPTIONS, GET", // 허용된 HTTP 메소드
    "Access-Control-Allow-Headers": "Content-Type", // 허용된 헤더
  };

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
        headers, // CORS 헤더 추가
      };
    } catch (error) {
      console.error("Error retrieving collections:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to fetch collections" }),
        headers, // CORS 헤더 추가
        env: process.env.ENV,
      };
    }
  } else if (requestType === "connectLambda") {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "This is the connectLambda response!" }),
      headers, // CORS 헤더 추가
    };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request",
      }),
      headers, // CORS 헤더 추가
    };
  }
};
