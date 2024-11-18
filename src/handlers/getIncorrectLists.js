exports.handler = async (event) => {
  console.log("Fetching incorrect lists...");
  // Example response
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Incorrect lists fetched successfully" }),
  };
};
