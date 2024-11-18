exports.handler = async (event) => {
  console.log("Adding a single word...");
  const body = JSON.parse(event.body || "{}");
  // Example response
  return {
    statusCode: 201,
    body: JSON.stringify({ message: "Word added successfully", data: body }),
  };
};
