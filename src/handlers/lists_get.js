exports.handler = async (event) => {
  console.log("Fetching lists...");
  // Example response
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Lists fetched successfully" }),
  };
};
