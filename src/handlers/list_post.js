exports.handler = async (event) => {
  console.log("Creating a new list...");
  const body = JSON.parse(event.body || "{}");
  // Example response
  return {
    statusCode: 201,
    body: JSON.stringify({ message: "List created successfully", data: body }),
  };
};
