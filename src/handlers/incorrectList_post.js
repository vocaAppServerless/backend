exports.handler = async (event) => {
  console.log("Creating an incorrect list...");
  const body = JSON.parse(event.body || "{}");
  // Example response
  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Incorrect list created successfully",
      data: body,
    }),
  };
};
