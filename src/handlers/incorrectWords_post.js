exports.handler = async (event) => {
  console.log("Adding incorrect words...");
  const body = JSON.parse(event.body || "{}");
  // Example response
  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Incorrect words added successfully",
      data: body,
    }),
  };
};
