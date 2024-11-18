exports.handler = async (event) => {
  const queryParams = event.queryStringParameters;

  // 예를 들어, "name" 파라미터를 가져오려면
  const name = queryParams ? queryParams.name : null;

  console.log("여기야!", name);

  console.log("Fetching user...");

  // Example response
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*", // 모든 출처 허용
      "Access-Control-Allow-Methods": "GET,OPTIONS", // 허용하는 메서드
      "Access-Control-Allow-Headers": "Content-Type", // 허용하는 헤더
    },
    body: JSON.stringify({ message: "User details fetched successfully" }),
  };

  return response;
};
