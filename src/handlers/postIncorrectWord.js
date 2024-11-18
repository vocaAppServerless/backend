exports.handler = async (event) => {
  console.log("Adding a single incorrect word...");
  const body = JSON.parse(event.body || "{}");
  // Example response
  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Incorrect word added successfully",
      data: body,
    }),
  };
};
