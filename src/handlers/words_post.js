exports.handler = async (event) => {
  console.log("Adding words...");
  const body = JSON.parse(event.body || "{}");
  // Example response
  return {
    statusCode: 201,
    body: JSON.stringify({ message: "Words added successfully", data: body }),
  };
};
