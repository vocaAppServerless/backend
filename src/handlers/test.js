const {
  getSecrets,
  checkCachedSecrets,
  getDb,
  auth: {
    getGoogleTokensByOauthCode,
    getGoogleUserInfoByAccessToken,
    getSignData,
  },
  apiResource: { respond },
} = require("@nurdworker/rbm-helper");
// const {
//   checkCachedSecrets,
//   getDb,
//   auth: {
//     getGoogleTokensByOauthCode,
//     getGoogleUserInfoByAccessToken,
//     getSignData,
//   },
//   apiResource: { respond },
// } = require("./rbm-helper");

// cached data


let cachedSecrets = {};
let cachedDb = null;

// handler funcs

const handleConnectLambda = () => {
  return respond(200, { message: "This is the connectLambda response!" });
};

const handleReadServerEnv = async () => {
  try {
    cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
    if (cachedSecrets.dbSecrets && cachedSecrets.oauthSecrets) {
      return respond(200, { message: "we can read server env!" });
    } else {
      return respond(500, {
        message: "Failed to read server env / empty db or oauth secret",
      });
    }
  } catch (error) {
    console.error("Error reading server env:", error);
    return respond(500, { message: "Failed to read server env" });
  }
};

const handleConnectDb = async () => {
  try {
    cachedSecrets = (await checkCachedSecrets(cachedSecrets)).secrets;
    cachedDb = (await getDb(cachedDb, cachedSecrets)).db;
    const collections = await cachedDb.listCollections().toArray();
    const collectionNames = collections.map((col) => col.name);

    return respond(200, { collections: collectionNames });
  } catch (error) {
    console.error("Error retrieving collections:", error);
    return respond(500, { message: "Failed to fetch collections" });
  }
};

exports.handler = async (event) => {
  const requestType = event.queryStringParameters?.request;

  switch (requestType) {
    case "connectLambda":
      return handleConnectLambda();
    case "readServerEnv":
      return handleReadServerEnv();
    case "connectDb":
      return handleConnectDb();

    default:
      return respond(400, { message: "Invalid request" });
  }
};
